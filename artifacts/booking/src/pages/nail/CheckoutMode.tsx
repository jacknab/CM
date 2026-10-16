/**
 * The POS tab in CHECKOUT mode — the Nail POS's own screen (ticket panel · keypad · payment panel, in the wrapper
 * design), not the calendar's sheet. A ticket from In Service (or PAY NOW) is loaded here and paid with:
 *   keypad (cents) · Quick Ticket / Group Pay / Retail / Gift Card and Tip Adjust / Discount / No Sale / Reprint rows
 *   (Discount and Gift Card swap their options into the payment panel) · Cash / Card tenders (split payments, change due)
 *   · the customer-facing /frontdesk screen.
 * The maths lives in shared/nailCheckout.ts (unit-tested); this file is screen state + wiring.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNailText } from "./i18n";
import { useCardProvider } from "@/hooks/use-card-provider";
import { localHub, relayCheckoutEvent } from "@/lib/local-hub";
import { syncEngine } from "@/lib/sync-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, Banknote, BadgePercent, Calculator, Check, CreditCard, DoorOpen, Gift, Hand, HandCoins, Loader2, MessageSquare, Percent, Printer, Settings, ShoppingBag, Users, X, Zap } from "lucide-react";
import {
  centsToDollars, computeCheckout, paymentMethodSummary, pushKeypadDigits, QUICK_TICKET_STEPS, r2, splitGroup,
  type DiscountInput, type Extra, type ExtraKind, type SalesTaxSettings, type Tender,
} from "@shared/nailCheckout";
import { buildCheckoutReceipt } from "@/lib/thermalPrinter";
import type { ReceiptLine } from "@/lib/receiptSections";
import { buildNativeReceiptPayload } from "@/lib/receiptPayload";
import { openCashDrawerHardware, recordNoSale } from "@/lib/cashDrawer";
import { checkoutRequestKey, lookupGiftCard, queueReceiptText, type BoardTicket, type FinalizeData, type GiftCardInfo } from "./nailApi";
import { bridgeState, isNativeApp, useCardPayments } from "./useCardPayments";
import { frontdeskReaderMethod, readNailCardMethod, type NailCardMethod } from "./cardMethod";
import { verifyCardCharge } from "../frontdesk/verifyCardCharge";
import { calcTipAmount } from "../frontdesk/tipOptions";
import { useTipPresets } from "@/hooks/use-tip-presets";
import { CatalogPanel, type CatalogGroup, type CatalogService } from "./CatalogPanel";

interface Props {
  ticket: BoardTicket;
  storeId: number;
  storeName: string;
  storeAddress?: string;
  storeCityStateZip?: string;
  storePhone?: string;
  timezone: string;
  registerId: number;
  /** A customer-facing /frontdesk tablet is paired. */
  dualScreen: boolean;
  /** The store's sales-tax settings (Settings → Checkout & Tax). */
  salesTax: SalesTaxSettings;
  /** Cash price: percent off a ticket paid entirely in cash (catalog prices are card prices). 0 = off. */
  cashDiscountPct?: number;
  /** Other open tickets (for Group Pay). */
  otherTickets: BoardTicket[];
  /** Connected Bluetooth receipt printer, if any. */
  thermalPrint?: (bytes: Uint8Array) => Promise<void>;
  finalizing: boolean;
  /** The ticket has been completed server-side — the payment buttons are replaced by Print/Text/No Receipt. */
  paid: boolean;
  /** The latest customer-screen event (tip picked / card result) — a new object each time one arrives. */
  socketEvent: { type: string; [k: string]: unknown } | null;
  onFinalize: (data: FinalizeData) => void;
  /** The receipt has been handled (printed / texted / declined) — leave this ticket's checkout screen. */
  onReceiptDone: () => void;
  onClose: () => void;
  /** The catalog, so the service on this ticket can be changed without leaving the payment screen. */
  groups: CatalogGroup[];
  /** The key grid the manager arranged (null = automatic). */
  layout?: import("@shared/posGrid").PosGridConfig | null;
  /** Put this service on the ticket in place of the one it has. Resolves true when the ticket was changed. */
  onChangeService: (svc: CatalogService) => Promise<boolean>;
  /** Staff are looking at this checkout right now (the POS tab is open and the screen isn't locked). When they
   *  aren't, the customer's screen goes back to its welcome page; it shows the order again when they return. */
  active?: boolean;
  /** Opened from a function key on the ticket builder: start on that function. */
  initialAction?: "group" | "tip" | "discount" | null;
}

type Tone = "info" | "success" | "error";
type Popup = null | "tip" | "group" | "settings" | "gift";
/** The Nail POS's own reader choice, separate from the calendar's preference. */
const CARD_METHOD_KEY = "certxa.nail.cardMethod";
const tenderLabel = (t: Tender) => (t.method === "gift" ? `GIFT CARD${t.code ? ` ·${t.code.slice(-4)}` : ""}` : t.method === "tap" ? "TAP TO PAY" : t.method === "cash" ? "CASH" : "CARD");
type Reward = { id: number; name: string; pointsCost: number; dollarValue: number; isActive?: boolean };

const money = (n: number) => `$${n.toFixed(2)}`;
const KEYS = ["7", "8", "9", "⌫", "4", "5", "6", "CLEAR", "1", "2", "3", "ERC", "00", "0", "ENTER"];

// ── The last receipt printed from this device, for Reprint ────────────────────
type LastReceipt = { receipt: any | null; paymentIntentId: string | null; thermal: any | null };
const LAST_RECEIPT_KEY = "certxa.nail.lastReceipt";
function rememberReceipt(r: LastReceipt) { try { localStorage.setItem(LAST_RECEIPT_KEY, JSON.stringify(r)); } catch { /* storage unavailable */ } }
function recallReceipt(): LastReceipt | null {
  try { const raw = localStorage.getItem(LAST_RECEIPT_KEY); return raw ? (JSON.parse(raw) as LastReceipt) : null; } catch { return null; }
}

export function CheckoutMode(p: Props) {
  const { t: tx } = useNailText();
  const { ticket } = p;
  const [cents, setCents] = useState("");
  const [extras, setExtras] = useState<Extra[]>([]);
  const nextId = useRef(1);
  const [discount, setDiscount] = useState<DiscountInput>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [tip, setTip] = useState(0);
  const [tenders, setTenders] = useState<Tender[]>([]);
  // PAY / CHECKOUT moves the POS from building the bill to taking payment. From then on an amount typed on
  // the keypad and entered is a payment of the selected type, not another line on the bill.
  const [paying, setPaying] = useState(false);
  const [payType, setPayType] = useState<"cash" | "card">("cash");
  // The client has submitted their tip choice (an amount or none) for this ticket. It stands for the rest of
  // the checkout, whatever is paid in cash, by gift card or by card: they are not shown the tip screen again.
  const [tipSubmitted, setTipSubmitted] = useState(false);
  // Settings → Checkout → CARD button. "own": the salon's own terminal takes the card; this POS only records it.
  const queryClient = useQueryClient();
  const cardProvider = useCardProvider();
  const cardRecoveryKey = `certxa.nail.captured.${p.storeId}.${ticket.id}`;
  const checkoutKey = `certxa.nail.checkout.${p.storeId}.${ticket.id}`;
  const requestKey = checkoutRequestKey(p.storeId, ticket.id);
  const idempotencyKey = useRef<string>("");
  if (!idempotencyKey.current) {
    try {
      idempotencyKey.current = localStorage.getItem(checkoutKey) || crypto.randomUUID();
      localStorage.setItem(checkoutKey, idempotencyKey.current);
    } catch { idempotencyKey.current = crypto.randomUUID(); }
  }
  useEffect(() => {
    let alive = true;
    const recover = (card: Tender) => {
      if (!card.paymentIntentId || !["m2", "tap"].includes(card.method)) return;
      void verifyCardCharge(card.paymentIntentId, ticket.id, card.amount).then((amount) => {
        if (!alive) return;
        setTenders((cur) => cur.some((t) => t.paymentIntentId === card.paymentIntentId) ? cur :
          [...cur, { ...card, id: nextId.current++, amount }]);
      }).catch(() => say("Saved card charge needs review. Check Stripe before charging again.", "error"));
    };
    const savedHere = new Set<string>();
    try {
      const stored = JSON.parse(localStorage.getItem(cardRecoveryKey) || "[]") as Tender[];
      if (Array.isArray(stored)) for (const card of stored) { if (card.paymentIntentId) savedHere.add(card.paymentIntentId); recover(card); }
    } catch { /* unreadable recovery data must not be treated as money */ }
    // Server ledger also covers a payment captured just before the app died,
    // when the native callback never reached localStorage. The ledger doesn't say which reader
    // took it, so a charge this device didn't save is labelled with the reader CARD uses here.
    let readerHere: "m2" | "tap" = "m2";
    try { readerHere = readNailCardMethod(localStorage.getItem(CARD_METHOD_KEY)) === "frontdesk" ? frontdeskReaderMethod() : "m2"; } catch { /* private mode */ }
    void fetch(`/api/nail/captured-card-payments/${ticket.id}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then((rows: { paymentIntentId: string; amountCents: number }[]) => {
        if (alive && Array.isArray(rows)) for (const row of rows) {
          if (savedHere.has(row.paymentIntentId)) continue;
          recover({ id: 0, method: readerHere, amount: row.amountCents / 100, paymentIntentId: row.paymentIntentId });
        }
      }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardRecoveryKey]);
  // Tickets saved together as one visit are paid together unless staff unlinks them.
  const [linkedIds, setLinkedIds] = useState<number[]>(() =>
    p.ticket.groupId != null ? p.otherTickets.filter((t) => t.groupId === p.ticket.groupId).map((t) => t.id) : []);
  // The right panel shows Payment; Discount and Gift Card swap in their option screen, and Back returns to Payment.
  const [rightTab, setRightTab] = useState<"functions" | "payment" | "services">("payment");
  const [menu, setMenu] = useState<"gift" | "discount">("discount");
  const [popup, setPopup] = useState<Popup>(null);
  const [guided, setGuided] = useState<number | null>(null);
  // Which reader the CARD button uses — chosen with the gear, remembered on this device.
  const [cardMethod, setCardMethod] = useState<NailCardMethod>(() => {
    try { return readNailCardMethod(localStorage.getItem(CARD_METHOD_KEY)); } catch { return "m2"; }
  });
  const [gift, setGift] = useState<{ code: string; card: GiftCardInfo | null; error: string; busy: boolean; mode: "pay" | "balance" }>({ code: "", card: null, error: "", busy: false, mode: "pay" });
  const native = isNativeApp();
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = (text: string, tone: Tone = "info") => {
    setStatus({ text, tone });
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 4500);
  };
  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current); }, []);

  const amount = centsToDollars(cents);
  // Right after a visit is saved the board may not have its other tickets yet: link them when they arrive, once.
  const groupSeeded = useRef(false);
  useEffect(() => {
    if (groupSeeded.current || p.ticket.groupId == null) return;
    const ids = p.otherTickets.filter((t) => t.groupId === p.ticket.groupId).map((t) => t.id);
    if (ids.length === 0) return;
    groupSeeded.current = true;
    setLinkedIds((cur) => Array.from(new Set([...cur, ...ids])));
  }, [p.otherTickets, p.ticket.groupId]);
  // Once the sale is saved the paid tickets leave the board, but the checkout stays open for the receipt: keep the
  // last copy of each ticket paid together, or the screen falls back to this ticket alone (a "change due" of the
  // others' price, and a cart on the customer's screen without them). Before then a ticket that leaves the board
  // (paid or cancelled at another station) leaves this sale too.
  const lastLinked = useRef(new Map<number, BoardTicket>());
  const linked = useMemo(() => {
    const now = p.otherTickets.filter((t) => linkedIds.includes(t.id));
    if (!(p.paid || p.finalizing)) { lastLinked.current = new Map(now.map((t) => [t.id, t])); return now; }
    return linkedIds.map((id) => now.find((t) => t.id === id) ?? lastLinked.current.get(id)).filter((t): t is BoardTicket => !!t);
  }, [p.otherTickets, linkedIds, p.paid, p.finalizing]);
  // A Retail-marked custom line built into the ticket itself (see CatalogPanel's Keypad) is still
  // part of ticket.total, but must be pulled out of service revenue for commission purposes.
  const ticketRetailTotal = useMemo(() => ticket.customLines.filter((l) => l.isRetail).reduce((s, l) => s + l.price, 0), [ticket.customLines]);
  const linkedRetailTotal = useMemo(() => r2(linked.reduce((s, t) => s + t.customLines.filter((l) => l.isRetail).reduce((n, l) => n + l.price, 0), 0)), [linked]);
  // Cash price: on while the ticket is being paid in cash only — no card, gift card or reader payment on it
  // and CARD not chosen. Any other payment puts the whole ticket back on the card price.
  const cashPriceOn = (p.cashDiscountPct ?? 0) > 0 && payType === "cash" && tenders.every((t) => t.method === "cash");
  const totals = useMemo(() => computeCheckout({
    ticketTotal: ticket.total, ticketRetailTotal, extras, linkedSubtotal: linked.reduce((s, t) => s + t.total, 0), linkedRetailTotal,
    discount, rewardDollar: reward?.dollarValue ?? 0, tip, tenders, salesTax: p.salesTax, cashDiscountPct: cashPriceOn ? p.cashDiscountPct : 0,
  }), [ticket.total, ticketRetailTotal, extras, linked, linkedRetailTotal, discount, reward, tip, tenders, p.salesTax, cashPriceOn, p.cashDiscountPct]);
  // The other price, for staff to quote: the card price while cash is selected, and the other way round.
  const otherPrice = useMemo(() => (p.cashDiscountPct ?? 0) > 0 ? computeCheckout({
    ticketTotal: ticket.total, ticketRetailTotal, extras, linkedSubtotal: linked.reduce((s, t) => s + t.total, 0), linkedRetailTotal,
    discount, rewardDollar: reward?.dollarValue ?? 0, tip, tenders: [], salesTax: p.salesTax, cashDiscountPct: cashPriceOn ? 0 : p.cashDiscountPct,
  }).total : null, [ticket.total, ticketRetailTotal, extras, linked, linkedRetailTotal, discount, reward, tip, p.salesTax, cashPriceOn, p.cashDiscountPct]);
  // The ticket is kept live from the board; if another station changes it mid-checkout, say so
  // rather than let the total move without anyone noticing.
  const seenTotal = useRef(ticket.total);
  const ownChange = useRef(false);
  useEffect(() => {
    if (seenTotal.current === ticket.total) return;
    seenTotal.current = ticket.total;
    // A change made right here (the service was swapped on this screen) announces itself.
    if (ownChange.current) { ownChange.current = false; return; }
    if (!p.paid) say(`TICKET CHANGED ON ANOTHER STATION · NEW TICKET TOTAL ${money(ticket.total)}`, "info");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.total]);

  // Opened from Group Pay / Tip Adjust / Discount on the ticket builder: carry straight on to that function.
  useEffect(() => {
    if (p.initialAction === "tip") setPopup("tip");
    else if (p.initialAction === "discount") { setMenu("discount"); setRightTab("functions"); }
    else if (p.initialAction === "group") { if (p.otherTickets.length === 0) say("NO OTHER ACTIVE TICKETS", "error"); else setPopup("group"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── customer-facing screen ────────────────────────────────────────────────
  // False while this checkout is out of sight (another tab, or the screen locked): nothing is mirrored then.
  const shownToCustomer = useRef(true);
  const send = (type: string, payload: Record<string, unknown> = {}) => {
    if (!p.dualScreen) return;
    void relayCheckoutEvent({ type, registerId: p.registerId, ...payload });
  };
  useEffect(() => {
    if (!p.dualScreen) return;
    send("kiosk_checkout_start", { total: totals.total, appointmentId: ticket.id });
    return () => send("kiosk_checkout_cancel");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.dualScreen, ticket.id]);
  // Mirror the cart to the customer's screen whenever it changes.
  // The customer screen shows the client's points in the cart header — but only when the salon has the points system switched on.
  const { data: loyaltyCfg } = useQuery<{ enabled: boolean; pointsPerDollar?: number }>({ queryKey: ["/api/loyalty/config"], staleTime: 60_000 });
  const tipPresets = useTipPresets();
  const showPoints = loyaltyCfg?.enabled === true && !!ticket.client.id;
  const cartKey = JSON.stringify([ticket.id, ticket.service.id, ticket.total, extras.map((e) => [e.label, e.price]), linked.map((t) => t.id), discount, reward?.id, tip, showPoints ? ticket.client.loyaltyPoints : null, tenders.map((t) => [t.method, t.amount])]);
  // The lines of the sale — shown on the customer's screen and on a texted receipt.
  const cartItems = () => [
    { label: ticket.service.name, price: ticket.service.price },
    ...ticket.addons.map((a) => ({ label: `+ ${a.name}`, price: a.price })),
    ...(ticket.nail?.lines ?? []).map((l) => ({ label: l.label, price: l.price })),
    ...ticket.customLines.map((l) => ({ label: l.label, price: l.price })),
    ...extras.map((e) => ({ label: e.label, price: e.price })),
    ...linked.map((t) => ({ label: `${t.client.name} — ${t.service.name}`, price: t.total })),
  ];
  // Group Pay: what each ticket of the sale takes — its share of the tip (as entered per technician, otherwise by
  // service time), discount and payment. The sale is saved with these, and the receipt shows each ticket's tip.
  const groupShares = (methods: string) => {
    const ownBase = ticket.total + extras.reduce((s, e) => s + e.price, 0);
    return splitGroup(
      [{ appointmentId: ticket.id, base: ownBase, duration: ticket.duration, serviceRevenue: totals.serviceRevenue, productRevenue: totals.productRevenue },
        // A linked ticket's own customLines can carry a Retail-marked line too (rung up on that
        // ticket before it was ever pulled into this group) — split its base the same way,
        // instead of always crediting the whole thing to service revenue.
        ...linked.map((t) => {
          const retail = r2(t.customLines.filter((l) => l.isRetail).reduce((s, l) => s + l.price, 0));
          return { appointmentId: t.id, base: t.total, duration: t.duration, serviceRevenue: r2(t.total - retail), productRevenue: retail };
        })],
      // The tip is shared by service time (no per-technician split is entered).
      { tip: totals.tip, discount: totals.discount, totalPaid: totals.totalPaid }, methods);
  };
  // The lines of the printed / saved / texted receipt. A Group Pay sale lists every ticket's own lines under its
  // technician's name (lib/receiptSections.ts); a one-ticket sale is the same as the cart.
  const receiptItems = (): ReceiptLine[] => {
    if (linked.length === 0) return cartItems();
    const lines = (t: BoardTicket): ReceiptLine[] => [
      { label: t.service.name, price: t.service.price },
      ...t.addons.map((a) => ({ label: a.name, price: a.price })),
      ...(t.nail?.lines ?? []).map((l) => ({ label: l.label, price: l.price })),
      ...t.customLines.map((l) => ({ label: l.label, price: l.price, ...(l.isRetail ? { kind: "product" as const } : {}) })),
    ];
    const heading = (t: BoardTicket) => (t.staff?.name ?? "No technician").toUpperCase();
    // Each ticket's own share of the tip, as a line of its section (the whole tip stays in the totals).
    const tips = new Map(groupShares(paymentMethodSummary(tenders)).map((s) => [s.appointmentId, s.tip]));
    const tipLine = (t: BoardTicket): ReceiptLine[] => {
      const tip = tips.get(t.id) ?? 0;
      return tip > 0 ? [{ label: "Tip", price: tip, kind: "tip" }] : [];
    };
    return [
      ...[...lines(ticket), ...extras.map((e) => ({ label: e.label, price: e.price, ...(e.kind === "retail" ? { kind: "product" as const } : {}) })), ...tipLine(ticket)]
        .map((l) => ({ ...l, section: heading(ticket) })),
      ...linked.flatMap((t) => [...lines(t), ...tipLine(t)].map((l) => ({ ...l, section: heading(t) }))),
    ];
  };
  // The client's number on file. The customer's screen is only told THAT there is one (and its last 4) so it can skip asking — never the number itself.
  const phoneOnFile = (ticket.client.phone ?? "").replace(/\D/g, "").slice(-10);
  const mirrorCart = () => {
    if (!p.dualScreen || !shownToCustomer.current) return;
    const items = cartItems();
    send("kiosk_checkout_cart", { items, subtotal: totals.subtotal, discount: totals.discount, tip: totals.tip, tax: totals.tax, total: totals.total, isWalkIn: false, customerName: ticket.client.name, ticketNumber: ticket.ticketNumber ?? ticket.id, staffName: ticket.staff?.name, loyaltyPoints: showPoints ? ticket.client.loyaltyPoints : undefined, pointsPerDollar: showPoints ? loyaltyCfg?.pointsPerDollar : undefined, appointmentId: ticket.id, paid: Math.min(totals.tendered, totals.total), balanceDue: totals.balanceDue, payments: tenders.map((t) => ({ label: tenderLabel(t), amount: t.amount })), hasPhone: phoneOnFile.length === 10, phoneLast4: phoneOnFile.length === 10 ? phoneOnFile.slice(-4) : undefined });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(mirrorCart, [cartKey, p.dualScreen]);

  // What the customer's screen needs to know about a payment of `paid`: what is still owed after it, and what the sale has taken in all.
  const settlementAfter = (paid: number) => {
    const remaining = Math.max(0, r2(totals.balanceDue - paid));
    return { remaining, paidTotal: r2(totals.total - remaining) };
  };

  // ── real card charging (local M2 or paired front-desk M2) ─────────────────
  // The PaymentIntent ID from the most recent successful card tender — threaded through to
  // nativePrintReceipt() below so the native app can look up card details for the receipt
  // (it keys that lookup by paymentIntentId; previously this was always sent as null).
  const lastCardPaymentIntentId = useRef<string | null>(null);
  // Full card details (brand, entry method, approval code) from the most recent card tender — so
  // the auto-saved receipt snapshot below can show the same "purchase details" the native app's
  // own printed receipt does, from any device, not just the one that took the payment.
  const lastCardDetails = useRef<unknown>(null);
  // A card is being taken on this device's reader while the customer's screen shows the card animation.
  const chargingHere = useRef(false);
  const cards = useCardPayments({
    ticketId: ticket.id, clientName: ticket.client.name, dualScreen: p.dualScreen, send,
    context: () => ({ tipCents: Math.round(totals.tip * 100), discountCents: Math.round(totals.discount * 100), priorTenderedCents: Math.round(totals.tendered * 100) }),
    onPaid: (kind, paid, last4, paymentIntentId, cardDetails) => {
      if (!paymentIntentId) { say("Card charge could not be identified. Check Stripe before taking another payment.", "error"); return; }
      try {
        const saved = JSON.parse(localStorage.getItem(cardRecoveryKey) || "[]") as Tender[];
        if (!saved.some((t) => t.paymentIntentId === paymentIntentId)) localStorage.setItem(cardRecoveryKey,
          JSON.stringify([...saved, { id: 0, method: kind, amount: paid, paymentIntentId }]));
      } catch { say("Cannot save this card charge for recovery. Check Stripe before leaving checkout.", "error"); }
      setTenders((cur) => cur.some((t) => t.paymentIntentId === paymentIntentId)
        ? cur : [...cur, { id: nextId.current++, method: kind, amount: paid, paymentIntentId }]);
      setCents("");
      if (paymentIntentId) lastCardPaymentIntentId.current = paymentIntentId;
      if (cardDetails) lastCardDetails.current = cardDetails;
      say(`CARD APPROVED · ${money(paid)}${last4 ? ` · ····${last4}` : ""}`, "success");
      chargingHere.current = false;
      setPayType("cash");
    },
    onFailed: (message) => {
      say(message.toUpperCase(), "error");
      // This device's reader did not take the card: the customer's screen leaves the card animation for the order.
      if (chargingHere.current) { chargingHere.current = false; send("kiosk_checkout_start", { total: totals.total, appointmentId: ticket.id }); mirrorCart(); }
    },
    knownIntents: () => tenders.map((t) => t.paymentIntentId).filter((id): id is string => !!id),
    // A front-desk charge found on the server when its tip message never arrived: the charge is
    // the pre-tip amount plus the customer's tip, so the tip is whatever it came to above that.
    onRemoteTip: (amt) => setTip(amt),
    settlementAfter,
    say,
  });

  // The customer's screen said something: a tip, or the result of a card they tapped.
  useEffect(() => {
    const m = p.socketEvent;
    if (!m) return;
    // The customer's screen reconnected and is asking whether this checkout is still open: answer with the cart.
    if (m.type === "kiosk_checkout_sync_request") {
      mirrorCart();
      // Still waiting on the customer: their screen lost the tip request when it dropped, so send it again.
      if ((awaitingTip || cards.awaitingFrontdesk) && lastTipRequest.current) send("kiosk_checkout_tip_request", lastTipRequest.current);
      return;
    }
    // The customer tapped "Yes, Redeem!" on a reward their screen offered: apply it to this ticket.
    // The server re-checks the balance when the sale closes.
    if (m.type === "kiosk_checkout_redeem_reward") {
      if (m.appointmentId != null && Number(m.appointmentId) !== ticket.id) return;
      const rewardId = Number(m.rewardId), pointsCost = Number(m.pointsCost), dollarValue = Number(m.dollarValue);
      if (!Number.isSafeInteger(rewardId) || rewardId <= 0 || !(dollarValue > 0)) return;
      if (!ticket.client.id) { say("ADD A CLIENT TO THE TICKET BEFORE REDEEMING A REWARD", "error"); return; }
      if (ticket.client.loyaltyPoints < pointsCost) { say("NOT ENOUGH POINTS FOR THAT REWARD", "error"); return; }
      setReward({ id: rewardId, name: String(m.name || "Reward"), pointsCost, dollarValue });
      say(`REWARD REDEEMED · ${money(dollarValue)} OFF`, "success");
      return;
    }
    if (m.type === "kiosk_checkout_tip_selected") {
      // A late message from another ticket's tip screen must not put its tip on this one.
      if (m.appointmentId != null && Number(m.appointmentId) !== ticket.id) return;
      const amt = Math.max(0, Number(m.tipAmount) || 0);
      setTip(amt);
      // `confirmed`: the customer pressed Continue / Skip (a pick alone only previews the tip here).
      if (m.confirmed === true || !awaitingTip) say(amt > 0 ? `TIP RECEIVED · ${money(amt)}` : "NO TIP SELECTED BY CLIENT", amt > 0 ? "success" : "info");
      // The client has finished with the tip screen. Payment is taken by staff: nothing starts by itself.
      if (m.confirmed === true) setTipSubmitted(true);
      if (m.confirmed === true && awaitingTip) setAwaitingTip(null);
    } else if (m.type === "kiosk_checkout_receipt_choice") {
      // The customer picked a receipt on their screen. Text goes out right away (it's a link to the saved
      // receipt). "Print" prints the customer copy on THIS station's receipt printer (the Android app's IP/USB
      // printer, or a Bluetooth one connected here), and "No receipt" ends the sale — both only once the sale
      // is actually saved, so a card that settles a moment before the server confirms isn't cut short.
      // "printed" = the customer's screen already printed their copy on its own printer: nothing left to print here.
      const choice = m.choice === "none" || m.choice === "printed" ? "none" : "print";
      if (m.choice === "text") void textReceipt(m);
      else if (p.paid) { if (choice === "none") p.onReceiptDone(); else void handlePrintReceipt(); }
      else pendingReceiptChoice.current = choice;
    } else cards.onSocket(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.socketEvent]);

  // A receipt choice that arrived before the sale was saved — carried out as soon as it is (see above).
  const pendingReceiptChoice = useRef<null | "print" | "none">(null);
  useEffect(() => {
    if (!p.paid || !pendingReceiptChoice.current) return;
    const choice = pendingReceiptChoice.current;
    pendingReceiptChoice.current = null;
    if (choice === "none") p.onReceiptDone(); else void handlePrintReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.paid]);

  // The customer chose "Text Receipt" on their screen: text it to the number they typed, or — when the screen didn't need to ask — the one on the ticket.
  const textReceipt = async (m: any) => {
    if (m.choice !== "text") return;
    const reply = (ok: boolean) => send("kiosk_checkout_receipt_result", { choice: "text", ok });
    const digits = String(m.phone ?? "").replace(/\D/g, "").slice(-10) || phoneOnFile;
    if (digits.length !== 10) { say("NO PHONE NUMBER FOR THIS CLIENT — RECEIPT NOT TEXTED", "error"); return reply(false); }
    say("TEXTING RECEIPT…", "info");
    const snapshot = {
      items: receiptItems(), dateIso: new Date().toISOString(), clientName: ticket.client.name,
      subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, tip: totals.tip, total: totals.total,
      tenders: tenders.map((t) => ({ method: tenderLabel(t), amount: t.amount })),
    };
    try {
      const r = await fetch("/api/pos/receipt-link", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: ticket.id, phone: digits, snapshot }),
      });
      if (!r.ok) throw new Error(String(r.status));
      say("RECEIPT TEXTED", "success");
      reply(true);
      p.onReceiptDone();
    } catch (err) {
      // No connection: the text waits on the tablet and goes out when the connection is back.
      if (err instanceof TypeError && await queueReceiptText(p.storeId, ticket.id, digits, snapshot).then(() => true, () => false)) {
        say("RECEIPT WILL BE TEXTED WHEN THE TABLET IS BACK ONLINE", "info");
        reply(true);
        p.onReceiptDone();
        return;
      }
      say("COULD NOT TEXT RECEIPT", "error");
      reply(false);
    }
  };

  // ── lines ─────────────────────────────────────────────────────────────────
  const addExtra = (label: string, price: number, kind: ExtraKind) => setExtras((cur) => [...cur, { id: nextId.current++, label, price, kind }]);
  const needAmount = () => { say("MUST ENTER AMOUNT FIRST", "error"); };

  const pressKey = (k: string) => {
    if (k === "⌫") { setCents((c) => c.slice(0, -1)); return; }
    if (k === "CLEAR") { setCents(""); return; }
    if (k === "ERC") {
      if (guided !== null) { setGuided(null); setCents(""); say("QUICK TICKET EXITED"); return; }
      setExtras((cur) => { if (!cur.length) { say("NOTHING TO UNDO"); return cur; } say(`UNDID · ${cur[cur.length - 1].label.toUpperCase()}`); return cur.slice(0, -1); });
      return;
    }
    if (k === "ENTER") {
      if (guided !== null) {
        const step = QUICK_TICKET_STEPS[guided];
        if (amount > 0) addExtra(step.label, amount, "guided");
        setCents("");
        if (guided + 1 >= QUICK_TICKET_STEPS.length) { setGuided(null); say("QUICK TICKET DONE — REVIEW & CHARGE", "success"); } else setGuided(guided + 1);
        return;
      }
      // CARD is selected: ENTER is what starts the card — for the typed amount, or with nothing typed, for what is still due.
      if (paying && payType === "card") { chargeCard(); return; }
      if (amount <= 0) { say("ENTER AN AMOUNT FIRST", "error"); return; }
      if (paying) { addCash(amount); return; }
      addExtra("+Extra", amount, "custom"); setCents(""); say(`EXTRA ADDED · ${money(amount)}`, "success");
      return;
    }
    setCents((c) => pushKeypadDigits(c, k));
  };

  // ── functions ─────────────────────────────────────────────────────────────
  const openDrawer = () => { void openCashDrawerHardware({ onThermalPrint: p.thermalPrint }); };
  // A preset % replaces the discount; Custom takes the dollar amount typed on the keypad. There is no Comp (100% off)
  // here. Once a discount is applied the grid goes back to the main menu.
  const backToPayment = () => setRightTab("payment");
  const discountPreset = (percent: number) => { setDiscount({ type: "percent", value: percent }); backToPayment(); say(`${percent}% DISCOUNT APPLIED`, "success"); };
  const discountCustom = () => {
    if (amount <= 0) return needAmount(); // nothing applied yet: stay here so the amount can be typed and Custom tapped again
    setDiscount({ type: "dollar", value: amount }); setCents(""); backToPayment();
    say(`${money(amount)} DISCOUNT APPLIED`, "success");
  };
  const applyTip = (dollars: number) => { setTip(dollars); setPopup(null); say(dollars > 0 ? `TIP SET · ${money(dollars)}` : "TIP CLEARED", "success"); };
  const preTip = r2(Math.max(0, totals.subtotal - totals.discount) + totals.tax);
  // What tip percentages are worked out on: the services, before any discount and before tax — a discount
  // is the salon's cost, not a reason for a smaller tip, and nobody tips on tax or on retail products.
  const serviceBase = r2(totals.subtotal - totals.productRevenue - linkedRetailTotal);
  const tipBase = serviceBase > 0 ? serviceBase : totals.subtotal;

  const runFn = (id: string) => {
    switch (id) {
      case "retail": if (amount <= 0) return needAmount(); addExtra("Retail Item", amount, "retail"); setCents(""); say(`RETAIL ADDED · ${money(amount)}`, "success"); return;
      case "gift": setMenu("gift"); setRightTab("functions"); return;
      case "quick": if (guided !== null) { setGuided(null); setCents(""); say("QUICK TICKET CANCELLED"); } else { setCents(""); setGuided(0); } return;
      case "group": if (p.otherTickets.length === 0) return say("NO OTHER ACTIVE TICKETS", "error"); setPopup("group"); return;
    }
  };
  // Until PAY / CHECKOUT is pressed the checkout works like the ticket screen: the right panel is the key grid
  // and a service picked there is added to the bill as another line (ERC takes the last one off). The lines
  // are part of the sale when it is closed.
  const addServiceLine = (svc: CatalogService) => {
    if (p.paid || p.finalizing) return;
    const price = Number(svc.price) || 0;
    addExtra(svc.name, price, "custom");
    say(`${svc.name.toUpperCase()} ADDED · ${money(price)}`, "success");
  };
  const comingSoon = (label: string) => say(`${label.toUpperCase()} — COMING SOON`);

  const tipButton = () => {
    if (amount > 0) { applyTip(amount); setCents(""); return; }
    setPopup("tip");
  };
  // The last tip request sent to the customer's screen, kept so it can be sent again if that screen
  // reconnects while this POS is still waiting on it.
  const lastTipRequest = useRef<Record<string, unknown> | null>(null);
  const requestTipScreen = () => {
    const payload = { total: preTip, tipBase, cardMethod: cardMethod === "frontdesk" ? frontdeskReaderMethod() : cardMethod, appointmentId: ticket.id };
    lastTipRequest.current = payload;
    send("kiosk_checkout_tip_request", payload);
  };
  const sendTipScreen = () => { setPopup(null); requestTipScreen(); say("TIP SCREEN SENT TO CLIENT", "info"); };

  // CARD on this device's reader, with a customer screen paired: the customer is asked for a tip first, and
  // the reader starts when they press Continue or Skip. `base` is what the card owes before that tip.
  const [awaitingTip, setAwaitingTip] = useState<{ base: number } | null>(null);
  const [chargeAfterTip, setChargeAfterTip] = useState<number | null>(null);
  useEffect(() => {
    if (chargeAfterTip == null) return;
    const amount = chargeAfterTip;
    setChargeAfterTip(null);
    // Runs after the tip is on the ticket, so the charge is recorded with it.
    if (amount > 0) { chargingHere.current = true; cards.m2(amount); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeAfterTip]);
  const stopWaitingForTip = (chargeNow: boolean) => {
    const waiting = awaitingTip;
    if (!waiting) return;
    setAwaitingTip(null);
    send("kiosk_checkout_tip_cancel", { appointmentId: ticket.id });
    if (chargeNow) setChargeAfterTip(Math.min(r2(waiting.base + tip), rest()));
  };

  // ── tenders ───────────────────────────────────────────────────────────────
  const rest = () => totals.balanceDue;
  /** What a tender takes: the keypad amount (a part-payment) or, with nothing typed, the whole balance. */
  const wanted = () => (amount > 0 ? amount : rest());
  // Guards against a double-tap / touch-bounce registering the same cash amount twice — CASH has
  // no busy state the way CARD does (disabled={cardBusy}), and addCash runs synchronously with
  // nothing to naturally prevent two rapid taps from each reading the same `wanted()` value.
  const cashLock = useRef(false);
  const addCash = (value: number) => {
    if (cashLock.current) return;
    if (value <= 0) return say("ENTER AN AMOUNT FIRST", "error");
    if (rest() <= 0) return say("NOTHING DUE", "error");
    cashLock.current = true;
    setTimeout(() => { cashLock.current = false; }, 600);
    openDrawer(); // cash may be over-tendered — change comes back
    setTenders((cur) => [...cur, { id: nextId.current++, method: "cash", amount: value }]);
    setCents("");
    send("kiosk_checkout_payment_result", { success: true, total: value, appointmentId: ticket.id, ...settlementAfter(value) });
  };

  // The customer's tip screen, then the front desk's M2 reader (the customer's Skip / Continue starts it).
  const sendToFrontdesk = (value: number) => {
    if (!p.dualScreen) return say("PAIR A FRONT DESK SCREEN BEFORE USING ITS M2 READER", "error");
    // The customer's tip selection changes the amount due. The frontdesk uses this
    // snapshot (not a later cart broadcast) to compute the charge exactly once.
    const payload = {
      total: preTip, tipBase, cardMethod: frontdeskReaderMethod(), paymentOnConfirm: true, appointmentId: ticket.id,
      // The client's tip is already on the ticket: the front desk goes straight to the reader.
      tipAlreadyChosen: tipSubmitted, tipAmount: tip,
      // The front desk's M2 charge must be tagged as a nail checkout, like this device's own M2 charges:
      // the server then records the card but leaves completing the ticket to this checkout (with tip,
      // discount, gift card and group shares), instead of closing it at capture with the card total alone.
      nailCheckout: true,
      amountDueBeforeTip: Math.max(0, r2(value - tip)),
      remainingAfterPayment: Math.max(0, r2(rest() - value)),
      discountCents: Math.round(totals.discount * 100),
      priorTenderedCents: Math.round(totals.tendered * 100),
    };
    lastTipRequest.current = payload;
    cards.frontdesk(payload);
  };
  // CARD charges through the M2 on either this device or the paired front-desk device.
  // Entering the payment stage: the client's tip screen goes up at once (when there is a customer screen and no
  // tip yet) and the POS waits for their choice. Nothing is charged here.
  const beginPaying = () => {
    if (paying) return;
    setPaying(true);
    setPayType("cash");
    setRightTab("payment");
    if (p.dualScreen && tip <= 0 && !tipSubmitted && rest() > 0) {
      setAwaitingTip({ base: 0 });
      requestTipScreen();
      say("WAITING FOR CLIENT TO SELECT TIP", "info");
    }
  };
  // EXIT: back from the payment step to the ticket as it was before PAY / CHECKOUT.
  const exitPaying = () => {
    if (tenders.length > 0 || cardBusy) return;
    setPaying(false);
    setPayType("cash");
    setCents("");
    setRightTab("payment");
  };
  // CASH is the payment type, not a payment: the amount comes from the keypad.
  const chooseCash = () => { beginPaying(); setPayType("cash"); };
  // The salon's own terminal approved the card: record a card payment of the typed amount, or of what is still due.
  const recordOwnCard = () => {
    if (cashLock.current) return;
    const value = Math.min(wanted(), rest());
    if (value <= 0) return say(rest() <= 0 ? "NOTHING DUE" : "ENTER AN AMOUNT FIRST", "error");
    cashLock.current = true;
    setTimeout(() => { cashLock.current = false; }, 600);
    setTenders((cur) => [...cur, { id: nextId.current++, method: "card", amount: value }]);
    setCents("");
    setPayType("cash");
    send("kiosk_checkout_payment_result", { success: true, total: value, appointmentId: ticket.id, ...settlementAfter(value) });
  };
  // CARD is the payment type, like CASH: tapping it charges nothing. (With the salon's own provider the panel
  // becomes "Card Payment Approved".)
  const takeCard = () => {
    if (!paying) return beginPaying();
    setPayType("card");
    if (cardProvider !== "own") say("TYPE THE CARD AMOUNT AND PRESS ENTER", "info");
  };
  // ENTER with CARD selected: the reader starts for the typed amount, or for the balance when nothing is typed.
  // The customer's screen shows the card animation while this device's reader waits.
  const chargeCard = () => {
    if (cardProvider === "own") return recordOwnCard();
    if (cardBusy) return;
    const value = Math.min(wanted(), rest());
    if (value <= 0) return say("NOTHING DUE", "error");
    setCents("");
    if (cardMethod === "frontdesk") return sendToFrontdesk(value);
    chargingHere.current = true;
    cards.m2(value);
  };
  const m2Busy = ["loading", "discovering", "connecting", "collecting", "processing"].includes(cards.status);
  const cardBusy = m2Busy || cards.nativeBusy !== null || cards.awaitingFrontdesk || awaitingTip !== null;
  // PAY / CHECKOUT: the customer's tip screen, whose Skip / Continue then starts the front desk M2 reader.
  // Once the balance is settled it closes the sale, as before.
  const payCheckout = () => {
    if (totals.settled) return finish();
    if (!paying) return beginPaying();
    say(payType === "card" && cardProvider === "own" ? "TAP CARD PAYMENT APPROVED ONCE YOUR TERMINAL APPROVES IT" : payType === "card" ? "TYPE THE CARD AMOUNT AND PRESS ENTER" : "TYPE THE CASH AMOUNT AND PRESS ENTER, OR TAP CARD", "info");
  };
  // The customer's screen follows what staff are looking at. Leaving the POS tab, or the screen locking, sends it
  // back to its welcome page; coming back shows the order again. A card being taken keeps it where it is.
  const shown = p.active !== false || cardBusy;
  useEffect(() => {
    if (shownToCustomer.current === shown) return;
    shownToCustomer.current = shown;
    if (shown) { send("kiosk_checkout_start", { total: totals.total, appointmentId: ticket.id }); mirrorCart(); }
    else send("kiosk_checkout_cancel");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  // The POS tab being closed or reloaded never runs the clean-up above: tell the customer's screen on the way out.
  useEffect(() => {
    if (!p.dualScreen) return;
    const bye = () => {
      try { navigator.sendBeacon("/api/kiosk/checkout-event", new Blob([JSON.stringify({ type: "kiosk_checkout_cancel", registerId: p.registerId })], { type: "application/json" })); } catch { /* best effort */ }
      // With no internet the beacon goes nowhere; the salon hub still reaches the customer screen.
      if (syncEngine.isOffline()) { try { void localHub.send({ type: "kiosk_checkout_cancel", registerId: p.registerId }); } catch { /* best effort */ } }
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [p.dualScreen, p.registerId]);
  const cardLabel = awaitingTip ? "WAITING FOR TIP…" : cards.awaitingFrontdesk ? "WAITING FOR FRONT DESK…"
    : cards.status === "loading" ? "LOADING…" : cards.status === "discovering" ? "SCANNING…" : cards.status === "connecting" ? "CONNECTING…"
    : cards.status === "collecting" ? "WAITING FOR CARD…" : cards.status === "processing" ? "PROCESSING…" : cards.nativeBusy ? "CHARGING…" : "CARD";

  // Settings → CARD button. Stripe's reader or the salon's own terminal is one setting for the whole salon;
  // which Stripe reader this device uses is kept on the device.
  const saveCardProvider = async (provider: "stripe" | "own") => {
    if (provider === cardProvider) return true;
    queryClient.setQueryData(["/api/card-provider"], { provider });
    try {
      const res = await fetch("/api/card-provider", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
      if (!res.ok) throw new Error("not saved");
      return true;
    } catch {
      void queryClient.invalidateQueries({ queryKey: ["/api/card-provider"] });
      say("COULD NOT SAVE THE CARD SETTING — CHECK THE CONNECTION", "error");
      return false;
    }
  };
  const chooseOwnProvider = async () => {
    setPopup(null);
    setPayType("cash");
    if (await saveCardProvider("own")) say("CARD WILL RECORD PAYMENTS TAKEN ON YOUR OWN TERMINAL", "success");
  };
  const chooseCardMethod = (m: NailCardMethod) => {
    void saveCardProvider("stripe");
    setPayType("cash");
    setCardMethod(m);
    try { localStorage.setItem(CARD_METHOD_KEY, m); } catch { /* private mode: it just won't be remembered */ }
    setPopup(null);
    say(m === "m2" ? "CARD WILL USE THE M2 READER ON THIS POS DEVICE" : "CARD WILL USE THE FRONT DESK M2 READER", "success");
  };
  const canNativePrint = native && !!(window as any).CERTXA_PRINT_BRIDGE;

  // ── gift cards ────────────────────────────────────────────────────────────
  const openGift = (mode: "pay" | "balance") => {
    if (mode === "pay" && rest() <= 0) return say("NOTHING DUE", "error");
    setGift({ code: "", card: null, error: "", busy: false, mode });
    setPopup("gift");
  };
  const findGift = async () => {
    if (!gift.code.trim() || gift.busy) return;
    setGift((g) => ({ ...g, busy: true, error: "", card: null }));
    try { const card = await lookupGiftCard(gift.code); setGift((g) => ({ ...g, busy: false, card })); }
    catch (err: any) { setGift((g) => ({ ...g, busy: false, error: err?.message || "Could not check the gift card" })); }
  };
  // A card already used on this ticket has less to give — the server charges it only when the sale closes.
  const giftLeft = gift.card ? r2(gift.card.balance - tenders.filter((t) => t.method === "gift" && t.code === gift.card!.code).reduce((s, t) => s + t.amount, 0)) : 0;
  const giftUse = Math.max(0, Math.min(wanted(), rest(), giftLeft));
  const applyGift = () => {
    if (!gift.card || giftUse <= 0) return;
    setTenders((cur) => [...cur, { id: nextId.current++, method: "gift", amount: giftUse, code: gift.card!.code }]);
    setCents(""); setPopup(null);
    say(`GIFT CARD · ${money(giftUse)} APPLIED · ${money(r2(giftLeft - giftUse))} LEFT ON CARD`, "success");
    send("kiosk_checkout_payment_result", { success: true, total: giftUse, appointmentId: ticket.id, ...settlementAfter(giftUse) });
  };

  // ── finish ────────────────────────────────────────────────────────────────
  const finish = () => {
    if (!totals.settled || p.finalizing) return;
    // Change is only ever handed back in cash — a gift card can't give any, so it would just lose the customer's money.
    // Only a problem when the GIFT CARD itself is what overpaid: a completely normal cash overpayment
    // (e.g. gift $20 toward a $50 ticket, customer hands over $40 cash expecting $10 back) must not
    // trip this — the cash tendered already covers the change, regardless of a gift card being used too.
    const cashTendered = tenders.filter((t) => t.method === "cash").reduce((s, t) => s + t.amount, 0);
    if (totals.changeDue > cashTendered && tenders.some((t) => t.method === "gift")) return say("GIFT CARD PAYMENT IS MORE THAN THE TOTAL — REMOVE OR REDUCE IT", "error");
    const methods = paymentMethodSummary(tenders);
    const giftByCard = new Map<string, number>();
    for (const t of tenders) if (t.method === "gift" && t.code) giftByCard.set(t.code, r2((giftByCard.get(t.code) ?? 0) + t.amount));
    const groupTickets: FinalizeData["groupTickets"] = linked.length > 0 ? groupShares(methods) : undefined;
    // Don't close the customer's screen here: every tender already told it the sale is paid, and it now
    // offers the customer Print / Text / No Receipt. Sending kiosk_checkout_cancel at this point reset it
    // to its welcome screen before they could choose. The screen is closed when this checkout closes.
    // No receipt is printed/sent here any more — once this succeeds the payment buttons are replaced by
    // Print / Text / No Receipt (see the receipt panel below), so the choice is always explicit.
    const next: FinalizeData = {
      idempotencyKey: idempotencyKey.current, tenders, extras: extras.map((e) => ({ label: e.label, price: e.price })),
      paymentMethod: methods, tip: totals.tip, discount: totals.discount, tax: totals.tax, totalPaid: totals.totalPaid,
      serviceRevenue: totals.serviceRevenue, productRevenue: totals.productRevenue, groupTickets,
      redemption: reward && ticket.client.id ? { rewardId: reward.id, customerId: ticket.client.id } : undefined,
      giftCards: giftByCard.size ? [...giftByCard].map(([code, amount]) => ({ code, amount })) : undefined,
    };
    // If the response was lost after the server committed, the exact same
    // request must be retried under the same key, not rebuilt from changed UI.
    try {
      // (A request the server actually refused is cleared by the caller, so the next attempt is rebuilt.)
      const pending = localStorage.getItem(requestKey);
      if (pending) { p.onFinalize(JSON.parse(pending) as FinalizeData); return; }
      localStorage.setItem(requestKey, JSON.stringify(next));
    } catch { /* server idempotency still protects this tab */ }
    p.onFinalize(next);
  };

  // The balance settling (a card/cash/gift tender covering the total) used to just re-enable the
  // PAY/CHECKOUT button — the cashier had to tap it a second time before the receipt panel showed
  // up, which looked like the app hadn't registered the payment. Auto-advance on the transition to
  // settled instead. Guarded to fire once per real payment (tenders.length > 0, not a $0 ticket
  // simply mounting already-"settled"), and not while a finalize is already in flight or done.
  const wasSettled = useRef(totals.settled);
  useEffect(() => {
    if (totals.settled && !wasSettled.current && tenders.length > 0 && !p.paid && !p.finalizing) finish();
    wasSettled.current = totals.settled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.settled]);

  // ── receipt (shown once paid, in place of the payment buttons) ─────────────
  const [receiptBusy, setReceiptBusy] = useState<null | "print" | "text">(null);
  const printAfterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (printAfterTimer.current) clearTimeout(printAfterTimer.current); }, []);

  // Print on the USB/Bluetooth thermal printer through the native Android app when it's running there (announced by
  // CERTXA_PRINT_BRIDGE — the app supports both connection types); otherwise fall back to a Bluetooth printer paired
  // directly with this browser tab (see More → Printer). Resolves true only once the receipt actually printed.
  // `copy` picks which physical copy: 'salon' (signature copy, auto-printed right after a card
  // charge settles), 'customer' (the Print Receipt button once the salon copy already went out
  // for a card sale), or 'both' (cash — no signature needed, nothing held back).
  const nativePrintReceipt = (copy: 'salon' | 'customer' | 'both', reprint?: LastReceipt): Promise<boolean> => new Promise((resolve) => {
    const requestId = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let finished = false;
    const finishWait = (ok: boolean, error?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("certxa_native_print_result", onResult);
      if (!ok) console.warn("[receipt print] failed:", error || "The printer did not respond.");
      resolve(ok);
    };
    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.requestId === requestId) finishWait(!!d.ok, d.error || undefined);
    };
    const timer = setTimeout(() => finishWait(false, "The printer did not respond. Check that it is on and connected."), 45_000);
    window.addEventListener("certxa_native_print_result", onResult);
    const receipt = reprint?.receipt ?? buildNativeReceiptPayload({
        storeName: p.storeName,
        storeAddress: p.storeAddress,
        storeCityStateZip: p.storeCityStateZip,
        storePhone: p.storePhone,
        // A ticket made offline has no number from the server yet; its place in this tablet's own list is printed instead.
        ticketNumber: ticket.ticketNumber ?? Math.abs(ticket.id),
        dateIso: new Date().toISOString(),
        clientName: ticket.client.name,
        staffName: ticket.staff?.name,
        items: receiptItems(),
        subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, tip: totals.tip, grandTotal: totals.total,
        tenders: tenders.map((t) => ({ method: t.method, amount: t.amount })),
        changeDue: totals.changeDue,
      });
    const paymentIntentId = reprint ? reprint.paymentIntentId : lastCardPaymentIntentId.current;
    // Kept on this device so Reprint can print the same receipt again later.
    if (!reprint) rememberReceipt({ receipt, paymentIntentId, thermal: null });
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "PRINT_RECEIPT", requestId, copy, paymentIntentId, receipt }));
  });
  const printReceiptNow = async (copy: 'salon' | 'customer' | 'both'): Promise<boolean> => {
    if (canNativePrint) return nativePrintReceipt(copy);
    if (p.thermalPrint) {
      try {
        const now = new Date();
        const thermal = {
          storeName: p.storeName, clientName: ticket.client.name, tenders, grandTotal: totals.total, changeDue: totals.changeDue,
          transactionId: `A-${ticket.id}`,
          dateStr: now.toLocaleDateString("en-US", { timeZone: p.timezone }), timeStr: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: p.timezone }),
        };
        await p.thermalPrint(buildCheckoutReceipt(thermal));
        rememberReceipt({ receipt: null, paymentIntentId: null, thermal });
        return true;
      } catch (err: any) {
        console.warn("[receipt print] failed:", err?.message || "The printer did not respond.");
        return false;
      }
    }
    console.warn("[receipt print] no receipt printer connected");
    return false;
  };
  // Reprint: the last receipt printed from this device, again — the customer's copy.
  const reprintLast = async () => {
    if (receiptBusy) return;
    const last = recallReceipt();
    if (!last) return say("NO RECEIPT HAS BEEN PRINTED ON THIS DEVICE YET", "error");
    setReceiptBusy("print");
    say("REPRINTING THE LAST RECEIPT…", "info");
    let ok = false;
    try {
      if (last.receipt && canNativePrint) ok = await nativePrintReceipt("customer", last);
      else if (last.thermal && p.thermalPrint) { await p.thermalPrint(buildCheckoutReceipt(last.thermal)); ok = true; }
    } catch (err: any) {
      console.warn("[receipt reprint] failed:", err?.message);
    }
    setReceiptBusy(null);
    say(ok ? "RECEIPT REPRINTED" : "RECEIPT DID NOT PRINT — CHECK THE PRINTER AND TRY AGAIN", ok ? "success" : "error");
  };

  const handlePrintReceipt = async () => {
    if (receiptBusy) return;
    setReceiptBusy("print");
    say("PRINTING RECEIPT…", "info");
    // A card sale already auto-printed the salon (signature) copy the moment it settled — this
    // button only owes the customer their own copy. Cash never auto-prints, so it still owes both.
    const copy = lastCardPaymentIntentId.current ? "customer" : "both";
    const ok = await printReceiptNow(copy);
    setReceiptBusy(null);
    if (!ok) return say("RECEIPT DID NOT PRINT — CHECK THE PRINTER AND TRY AGAIN", "error");
    say("RECEIPT PRINTED", "success");
    printAfterTimer.current = setTimeout(() => p.onReceiptDone(), 5000);
  };
  // A card charge needs the customer's signature on the salon copy, so it can't wait for a staff
  // tap the way the rest of receipt printing does — print it the moment the sale settles. Fires
  // once per ticket; cash never auto-prints (no signature needed), and the customer's own copy
  // still waits for the Print Receipt button, which saves the second sheet of paper whenever
  // nobody asks for it.
  const salonCopyAutoPrinted = useRef(false);
  useEffect(() => {
    if (p.paid && lastCardPaymentIntentId.current && !salonCopyAutoPrinted.current && canNativePrint) {
      salonCopyAutoPrinted.current = true;
      say("PRINTING SALON COPY FOR SIGNATURE…", "info");
      void nativePrintReceipt("salon");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.paid]);

  // Silently save a digital receipt snapshot the moment the ticket is paid — not gated behind
  // "Text Receipt" (which staff might never tap) — so re-scanning or "# Enter ID"-ing this ticket
  // later always has a receipt to show, not just tickets someone happened to text. Fire-and-forget:
  // never surfaces an error to staff, since this is invisible plumbing, not a checkout step.
  const receiptSnapshotSaved = useRef(false);
  useEffect(() => {
    if (!p.paid || receiptSnapshotSaved.current) return;
    try { localStorage.removeItem(cardRecoveryKey); localStorage.removeItem(checkoutKey); localStorage.removeItem(requestKey); } catch { /* private storage */ }
    receiptSnapshotSaved.current = true;
    fetch("/api/pos/receipt-snapshot", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId: ticket.id,
        snapshot: {
          clientName: ticket.client.name, staffName: ticket.staff?.name, items: receiptItems(), dateIso: new Date().toISOString(),
          subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, tip: totals.tip, total: totals.total,
          tenders: tenders.map((t) => ({ method: tenderLabel(t), amount: t.amount })),
          cardDetails: lastCardDetails.current ?? undefined,
        },
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.paid]);
  // Texts a LINK to a public web receipt (not the plain summary) — /api/pos/receipt-link stores exactly what's on
  // screen right now under this ticket's existing "manage my booking" token, so the link keeps showing these same
  // numbers, then sends it through the salon's Twilio number.
  const handleTextReceipt = async () => {
    if (receiptBusy) return;
    if (phoneOnFile.length !== 10) { say("NO PHONE NUMBER ON FILE FOR THIS CLIENT", "error"); return; }
    setReceiptBusy("text");
    say("TEXTING RECEIPT…", "info");
    const snapshot = {
      clientName: ticket.client.name, items: receiptItems(), dateIso: new Date().toISOString(),
      subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, tip: totals.tip, total: totals.total,
      tenders: tenders.map((t) => ({ method: tenderLabel(t), amount: t.amount })),
    };
    try {
      const r = await fetch("/api/pos/receipt-link", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: ticket.id, phone: phoneOnFile, snapshot }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setReceiptBusy(null);
      say("RECEIPT TEXTED", "success");
      p.onReceiptDone();
    } catch (err) {
      setReceiptBusy(null);
      // No connection: the text waits on the tablet and goes out when the connection is back.
      if (err instanceof TypeError && await queueReceiptText(p.storeId, ticket.id, phoneOnFile, snapshot).then(() => true, () => false)) {
        say("RECEIPT WILL BE TEXTED WHEN THE TABLET IS BACK ONLINE", "info");
        p.onReceiptDone();
        return;
      }
      say("COULD NOT TEXT RECEIPT", "error");
    }
  };
  const handleNoReceipt = () => { if (!receiptBusy) p.onReceiptDone(); };

  // ── rewards ───────────────────────────────────────────────────────────────
  const points = ticket.client.loyaltyPoints;

  // ── grid contents ─────────────────────────────────────────────────────────
  type Cell = { id: string; label: string; icon: typeof Gift; run: () => void; more?: boolean } | null;
  const giftCells: Cell[] = [
    { id: "Sell Gift Card", label: "Sell Gift Card", icon: Gift, run: () => comingSoon("Sell Gift Card") },
    { id: "Redeem", label: "Redeem", icon: Gift, run: () => openGift("pay") },
    { id: "Check Balance", label: "Check Balance", icon: Gift, run: () => openGift("balance") },
  ];
  const discountCells: Cell[] = [
    { id: "disc-10", label: "10% Off", icon: Percent, run: () => discountPreset(10) },
    { id: "disc-15", label: "15% Off", icon: Percent, run: () => discountPreset(15) },
    { id: "disc-20", label: "20% Off", icon: Percent, run: () => discountPreset(20) },
    { id: "disc-employee", label: "Employee", icon: BadgePercent, run: () => discountPreset(25) },
    { id: "disc-custom", label: "Custom", icon: Calculator, run: discountCustom },
  ];
  const cells = menu === "discount" ? discountCells : giftCells;
  const gridCells: Cell[] = Array.from({ length: 23 }, (_, i) => cells[i] ?? null);

  const guidedPrompt = guided !== null ? `${QUICK_TICKET_STEPS[guided].prompt.toUpperCase()} · STEP ${guided + 1}/${QUICK_TICKET_STEPS.length} — ENTER TO ADD / SKIP` : null;

  return (
    <>
      {/* ── ticket panel ─────────────────────────────────────────────────── */}
      <section className="ticket-panel" data-testid="nail-pay-ticket">
        <div className="ticket-client-header">
          <div className="ticket-client-main">
            <div className="ticket-client-name" data-testid="nail-pay-client">{ticket.client.name}</div>
            <div className="ticket-client-points">{points} pts</div>
          </div>
          <div className="ticket-client-side">
            <div className="ticket-client-num">#{ticket.ticketNumber ?? ticket.id}</div>
            <button type="button" className="pos-gear" onClick={() => setPopup("settings")} aria-label="POS settings" title="POS settings" data-testid="nail-pay-settings"><Settings size={18} /></button>
          </div>
        </div>
        <div className="ticket-items">
          {linked.length === 0 ? (
            <>
            <div className="ticket-item"><div className="item-copy"><strong>{ticket.service.name}</strong><span>{ticket.staff?.name ?? "Service"}</span></div><div className="item-price"><strong>{money(ticket.service.price)}</strong></div><span /></div>
            {ticket.addons.map((a) => <div className="ticket-item" key={`a${a.id}`}><div className="item-copy"><strong>+ {a.name}</strong><span>Add-on</span></div><div className="item-price"><strong>{money(a.price)}</strong></div><span /></div>)}
            {(ticket.nail?.lines ?? []).map((l) => <div className="ticket-item" key={l.label}><div className="item-copy"><strong>{l.label}</strong><span>Nail option</span></div><div className="item-price"><strong>{money(l.price)}</strong></div><span /></div>)}
            {ticket.customLines.map((l, i) => <div className="ticket-item" key={`c${i}`}><div className="item-copy"><strong>{l.label}</strong><span>Custom charge</span></div><div className="item-price"><strong>{money(l.price)}</strong></div><span /></div>)}
            {extras.map((e) => (
              <div className="ticket-item" key={e.id} data-testid={`nail-pay-extra-${e.kind}`}>
                <div className="item-copy"><strong>{e.label}</strong><span>{e.kind === "retail" ? "Retail" : "Added at checkout"}</span></div>
                <div className="item-price"><strong>{money(e.price)}</strong></div>
                <button type="button" className="remove-item" onClick={() => setExtras((cur) => cur.filter((x) => x.id !== e.id))} aria-label={`Remove ${e.label}`}><X size={16} /></button>
              </div>
            ))}
            </>
          ) : (
            // Group Pay: one cart per ticket — its client, technician and number, then its own lines (as on the
            // calendar's checkout). Extras added here belong to this ticket's cart.
            (() => {
              // Each ticket's share of the tip, worked out the way the sale is saved (by service time).
              const tipOf = new Map(groupShares(paymentMethodSummary(tenders)).map((sh) => [sh.appointmentId, sh.tip]));
              return [ticket, ...linked].map((t) => {
              const own = t.id === ticket.id;
              const cartTotal = own ? t.total + extras.reduce((sum, e) => sum + e.price, 0) : t.total;
              const cartTip = tipOf.get(t.id) ?? 0;
              return (
                <div className="group-cart-wrap" key={`g${t.id}`}>
                <div className="group-cart-tech">{t.staff?.name ?? "No technician"} · #{t.ticketNumber ?? t.id}</div>
                <div className="group-cart" data-testid={own ? "nail-pay-cart-own" : "nail-pay-linked"}>
                  <div className="group-cart-head">
                    <div className="group-cart-who">
                      <strong>{t.client.name}</strong>
                    </div>
                    <strong className="group-cart-total">{money(cartTotal)}</strong>
                    {own ? <span /> : (
                      <button type="button" className="remove-item" onClick={() => setLinkedIds((cur) => cur.filter((x) => x !== t.id))} aria-label={`Remove ${t.client.name}`}><X size={16} /></button>
                    )}
                  </div>
                  <div className="group-cart-line"><span>{t.service.name}</span><strong>{money(t.service.price)}</strong><span /></div>
                  {t.addons.map((a) => <div className="group-cart-line" key={`a${a.id}`}><span>+ {a.name}</span><strong>{money(a.price)}</strong><span /></div>)}
                  {(t.nail?.lines ?? []).map((l) => <div className="group-cart-line" key={`n${l.label}`}><span>{l.label}</span><strong>{money(l.price)}</strong><span /></div>)}
                  {t.customLines.map((l, i) => <div className="group-cart-line" key={`c${i}`}><span>{l.label}</span><strong>{money(l.price)}</strong><span /></div>)}
                  {own && extras.map((e) => (
                    <div className="group-cart-line" key={e.id} data-testid={`nail-pay-extra-${e.kind}`}>
                      <span>{e.label}</span><strong>{money(e.price)}</strong>
                      <button type="button" className="remove-item" onClick={() => setExtras((cur) => cur.filter((x) => x.id !== e.id))} aria-label={`Remove ${e.label}`}><X size={14} /></button>
                    </div>
                  ))}
                  {cartTip > 0 && <div className="group-cart-line group-cart-tip" data-testid={`nail-pay-cart-tip-${t.id}`}><span>Tip</span><strong>{money(cartTip)}</strong><span /></div>}
                </div>
                </div>
              );
            });
            })()
          )}
        </div>

        <div className="ticket-total">
          <div><span>{tx("subtotal")}</span><strong data-testid="nail-pay-subtotal">{money(totals.subtotal)}</strong></div>
          {totals.discount > 0 && (
            <div data-testid="nail-pay-discount-row">
              <span>{reward && !discount ? `REWARD · ${reward.name.toUpperCase()}` : `${tx("discount")}${discount?.type === "percent" ? ` (${discount.value}%)` : ""}`}</span>
              <strong>
                −{money(totals.discount)}{" "}
                <button type="button" className="row-x" aria-label="Remove discount" onClick={() => { setDiscount(null); setReward(null); }}>×</button>
              </strong>
            </div>
          )}
          {otherPrice != null && (
            <div data-testid="nail-pay-cash-price"><span>{cashPriceOn ? `CASH PRICE (−${p.cashDiscountPct}%)` : "CARD PRICE"}</span><strong>{cashPriceOn ? `card ${money(otherPrice)}` : `cash ${money(otherPrice)}`}</strong></div>
          )}
          {totals.tax > 0 && (
            <div data-testid="nail-pay-tax-row"><span>{tx("tax")} ({r2(p.salesTax.rate * 100)}%)</span><strong data-testid="nail-pay-tax">{money(totals.tax)}</strong></div>
          )}
          {totals.tip > 0 && (
            <div><span>{tx("tip")}</span><strong data-testid="nail-pay-tip">{money(totals.tip)} <button type="button" className="row-x" aria-label="Remove tip" onClick={() => setTip(0)}>×</button></strong></div>
          )}
          <div className="grand-total"><span>{tx("total")}</span><strong data-testid="nail-pay-total">{money(totals.total)}</strong></div>
          {tenders.map((t) => (
            <div key={t.id} data-testid={`nail-pay-tender-${t.method}`}><span>{tenderLabel(t)}</span><strong>−{money(t.amount)} {t.method !== "m2" && t.method !== "tap" && <button type="button" className="row-x" aria-label="Remove payment" onClick={() => setTenders((cur) => cur.filter((x) => x.id !== t.id))}>×</button>}</strong></div>
          ))}
          {tenders.length > 0 && (
            <div className="balance-row" data-testid="nail-pay-balance">
              <span>{totals.changeDue > 0 ? tx("changeDue") : totals.balanceDue > 0 ? tx("balanceDue") : tx("paidInFull")}</span>
              <strong>{totals.changeDue > 0 ? money(totals.changeDue) : money(totals.balanceDue)}</strong>
            </div>
          )}
          {/* Once PAY / CHECKOUT has been pressed these two go away: the payment types take over, and the sale closes itself when it is paid. */}
          {(!paying || totals.settled || p.paid || p.finalizing) && (
          <div className="checkout-row">
            <button type="button" className="checkout-clr" onClick={p.onClose} data-testid="nail-pay-back">{tx("back")}</button>
            <button type="button" className={`checkout ${p.finalizing || p.paid || (!totals.settled && cardBusy) ? "disabled" : ""}`} disabled={p.finalizing || p.paid || (!totals.settled && cardBusy)} onClick={payCheckout} data-testid="nail-pay-finish">
              {p.paid ? tx("paid") : p.finalizing ? tx("saving") : tx("payCheckout")}
            </button>
          </div>
          )}
        </div>
      </section>

      {/* ── keypad + function row ────────────────────────────────────────── */}
      <section className="work-area">
        <div className="sale-area">
          <div className="keypad pay-keypad" data-testid="nail-pay-keypad">
            <div className={`pos-status ${status ? `pos-status-${status.tone}` : ""} ${guidedPrompt ? "pos-status-guided" : ""}`} data-testid="nail-pay-status"><span>{guidedPrompt ?? status?.text ?? " "}</span></div>
            <div className="calculator-display" data-testid="nail-pay-display">{cents ? money(amount) : ""}</div>
            <div className="key-grid">
              {KEYS.map((k) => (
                <button key={k} type="button" data-testid={`nail-pay-key-${k}`} onClick={() => pressKey(k)}
                  className={k === "ENTER" ? "enter-key" : k === "ERC" ? "undo-key" : ""}>
                  {k === "ERC" && guided !== null ? "EXIT" : k}
                </button>
              ))}
            </div>
            <div className="money-grid pay-fn-row" data-testid="nail-pay-fn-row-top">
              <button type="button" onClick={() => runFn("quick")} data-testid="nail-pay-fn-quick"><Zap size={20} /><span>{guided !== null ? "Exit Quick Ticket" : "Quick Ticket"}</span></button>
              <button type="button" onClick={() => runFn("group")} data-testid="nail-pay-fn-group"><Users size={20} /><span>Group Pay</span></button>
              <button type="button" onClick={() => runFn("retail")} data-testid="nail-pay-fn-retail"><ShoppingBag size={20} /><span>Retail</span></button>
              <button type="button" onClick={() => runFn("gift")} data-testid="nail-pay-fn-gift"><Gift size={20} /><span>Gift Card</span></button>
            </div>
            <div className="money-grid pay-fn-row pay-fn-row-stacked">
              <button type="button" onClick={tipButton} data-testid="nail-pay-fn-tip"><HandCoins size={20} /><span>Tip Adjust</span></button>
              <button type="button" onClick={() => { setMenu("discount"); setRightTab("functions"); }} data-testid="nail-pay-fn-discount"><Percent size={20} /><span>Discount</span></button>
              <button type="button" onClick={() => { openDrawer(); recordNoSale({ performedBy: ticket.staff?.name }); say("CASH DRAWER OPENED"); }} data-testid="nail-pay-fn-nosale"><DoorOpen size={20} /><span>No Sale</span></button>
              <button type="button" onClick={() => void reprintLast()} data-testid="nail-pay-fn-reprint"><Printer size={20} /><span>Reprint</span></button>
            </div>
          </div>

          {/* ── functions / payment ──────────────────────────────────────── */}
          {!p.paid && (rightTab === "services" || (rightTab === "payment" && !paying)) ? (
            // The payment buttons appear only once PAY / CHECKOUT has been pressed; before that this is the key grid.
            <CatalogPanel layout={p.layout} locked={p.finalizing} groups={p.groups} activeGroup="" onGroup={() => {}} serviceId={null} onService={addServiceLine}
              addons={[]} moreAddons={false} onToggleMore={() => {}} hasMoreAddons={false} addonIds={[]} onToggleAddon={() => {}}
              exit={paying ? { label: "Payment", onClick: backToPayment } : undefined} />
          ) : (
          <div className="catalog-panel" data-testid="nail-pay-right">

            {rightTab !== "functions" ? (
              p.paid ? (
                <div className="pay-panel" data-testid="nail-receipt-options">
                  <div className="receipt-methods">
                    <button type="button" className="receipt-print" disabled={receiptBusy !== null} onClick={handlePrintReceipt} data-testid="nail-receipt-print">
                      {receiptBusy === "print" ? <Loader2 size={22} className="spin" /> : <Printer size={22} />}<span>PRINT RECEIPT</span>
                    </button>
                    <button type="button" className="receipt-text" disabled={receiptBusy !== null} onClick={handleTextReceipt} data-testid="nail-receipt-text">
                      {receiptBusy === "text" ? <Loader2 size={22} className="spin" /> : <MessageSquare size={22} />}<span>TEXT RECEIPT</span>
                    </button>
                    <button type="button" className="receipt-none" disabled={receiptBusy !== null} onClick={handleNoReceipt} data-testid="nail-receipt-none">
                      <Ban size={22} /><span>NO RECEIPT</span>
                    </button>
                  </div>
                  <p className="pay-hint">The sale is complete. Choose how {ticket.client.name.trim().split(/\s+/)[0] || "the client"} would like their receipt.</p>
                </div>
              ) : (
              <div className="pay-panel" data-testid="nail-pay-payment">
                {paying && payType === "card" && cardProvider === "own" ? (
                  // The salon's own terminal takes the card. Nothing is sent to the customer screen; staff confirm here.
                  <div className="pay-methods">
                    <button type="button" className="pay-card pay-approved" onClick={recordOwnCard} data-testid="nail-pay-card-approved">
                      <CreditCard size={26} /><span>CARD PAYMENT APPROVED</span>
                    </button>
                    <button type="button" className="pay-gift" onClick={() => setPayType("cash")} data-testid="nail-pay-card-back"><Banknote size={26} /><span>{tx("back")}</span></button>
                  </div>
                ) : (
                <div className="pay-methods">
                  <button type="button" className={`pay-cash ${paying && payType === "cash" ? "pay-type-on" : ""}`} aria-pressed={paying && payType === "cash"} onClick={chooseCash} data-testid="nail-pay-cash"><Banknote size={26} /><span>{tx("cash")}</span></button>
                  <button type="button" className={`pay-card ${paying && payType === "card" ? "pay-type-on" : ""}`} aria-pressed={paying && payType === "card"} disabled={cardBusy && cardProvider !== "own"} onClick={takeCard} data-testid="nail-pay-card">
                    {cardBusy && cardProvider !== "own" ? <Loader2 size={26} className="spin" /> : <CreditCard size={26} />}<span>{cardProvider === "own" || cardLabel === "CARD" ? tx("card") : cardLabel}</span>
                  </button>
                  <button type="button" className="pay-gift" onClick={() => openGift("pay")} data-testid="nail-pay-gift"><Gift size={26} /><span>{tx("giftCard")}</span></button>
                  {/* EXIT leaves the payment step (not the POS): the service keys come back on the right and CLR /
                      PAY / CHECKOUT under the cart. Only before any payment is recorded — BACK would drop it. */}
                  <button type="button" className="pay-gift" disabled={cardBusy || p.finalizing || tenders.length > 0} onClick={exitPaying} data-testid="nail-pay-exit"><Hand size={26} /><span>{tx("exit")}</span></button>
                </div>
                )}
                {(awaitingTip || cards.awaitingFrontdesk) && (
                  <div className="pay-waiting" data-testid="nail-pay-waiting">
                    <span>{awaitingTip ? "Waiting for client to select tip." : "Waiting for the customer at the front desk."}</span>
                    <button type="button" onClick={() => { if (awaitingTip) stopWaitingForTip(false); else { cards.cancelFrontdesk(); say("STOPPED WAITING FOR THE FRONT DESK", "info"); } }} data-testid="nail-pay-stop-waiting">Cancel</button>
                  </div>
                )}
                <p className="pay-hint">{!paying ? "Tap PAY / CHECKOUT to take payment."
                  : cardProvider === "own" && payType === "card" ? "Take the card on your own terminal, then tap CARD PAYMENT APPROVED. Type an amount first to record part of the bill."
                  : cardProvider === "own" ? "Cash: type the amount and press ENTER. CARD records a payment taken on your own terminal."
                  : payType === "card" ? `Card: type the amount and press ENTER to start ${cardMethod === "m2" ? "the M2 reader connected to this POS device" : "the front desk M2 reader"}. ENTER with no amount charges what is still due.`
                  : "Cash: type the amount and press ENTER. For a card, tap CARD, type the amount and press ENTER."}</p>
              </div>
              )
            ) : (
              <div className="fn-wrap" data-testid="nail-pay-functions">
                <div className="fn-grid">
                  <button type="button" className="fn-cell fn-back" onClick={backToPayment} data-testid="nail-pay-fn-back"><ArrowLeft size={22} /><span>Back</span></button>
                  {gridCells.map((c, i) => c ? (
                    <button key={c.id} type="button" className="fn-cell" onClick={c.run} data-testid={`nail-pay-fn-${c.id.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                      <c.icon size={22} />
                      <span style={{ whiteSpace: "pre-line" }}>{c.label}</span>
                      {c.more && <em>›</em>}
                    </button>
                  ) : <div key={`e${i}`} className="fn-cell fn-empty" />)}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </section>

      {/* ── pickers ──────────────────────────────────────────────────────── */}
      {popup && (
        <>
          <div className="assign-create-overlay" onClick={() => setPopup(null)} />
          <div className="assign-create-modal" data-testid={`nail-pay-popup-${popup}`}>
            <div className="assign-create-header">
              <div>
                <h2>{popup === "tip" ? "Tip" : popup === "settings" ? "POS settings" : popup === "gift" ? (gift.mode === "balance" ? "Gift card balance" : "Pay with gift card") : "Group pay"}</h2>
                <p>{popup === "group" ? "Pay these tickets together" : popup === "settings" ? "Saved to this device" : popup === "gift" ? "Type or scan the card code" : ticket.client.name}</p>
              </div>
              <button type="button" className="assign-create-close" onClick={() => setPopup(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="assign-create-list">
              {popup === "tip" && (
                <>
                  {p.dualScreen && <button type="button" className="assign-create-item" onClick={sendTipScreen} data-testid="nail-pay-tip-screen"><span className="assign-create-name">Send tip screen to the customer</span></button>}
                  {tipPresets.map((pct) => (
                    <button key={pct} type="button" className="assign-create-item" onClick={() => applyTip(calcTipAmount(tipBase, pct))} data-testid={`nail-pay-tip-${pct}`}>
                      <span className="assign-create-name">{pct}%</span><span className="assign-create-status">{money(calcTipAmount(tipBase, pct))}</span>
                    </button>
                  ))}
                  <button type="button" className="assign-create-item" onClick={() => applyTip(0)} data-testid="nail-pay-tip-none"><span className="assign-create-name">No tip</span></button>
                  <div className="assign-create-hint">Or type a dollar amount on the keypad and tap Tip Adjust.</div>
                </>
              )}
              {popup === "settings" && (
                <>
                  {(() => {
                    const b = bridgeState();
                    return (
                      <div className="assign-create-hint" data-testid="nail-pay-bridge" data-bridge={b}>
                        {b === "app" ? "Certxa Android app connected — the M2 reader runs through the app."
                          : b === "broken" ? "Certxa app detected, but its connection isn't ready. Close and reopen the app."
                          : "Web browser — the M2 reader only works in the Certxa Android app."}
                      </div>
                    );
                  })()}
                  <div className="assign-create-hint">Card payment method — what the CARD button uses. Also used when the customer confirms the tip on their screen.</div>
                  {([
                    { key: "m2" as const, label: "M2 Reader — POS Device", icon: CreditCard, hint: "Charge with the M2 reader paired to this POS device" },
                    { key: "frontdesk" as const, label: "Front Desk M2 Reader", icon: CreditCard, hint: "Charge with the M2 reader paired to the front desk device" },
                  ]).map((o) => {
                    const on = cardProvider !== "own" && cardMethod === o.key;
                    return (
                    <button key={o.key} type="button" className={`assign-create-item ${on ? "assign-create-item-sel" : ""}`} onClick={() => chooseCardMethod(o.key)} data-testid={`nail-pay-method-${o.key}`}>
                      <o.icon size={18} /><span className="assign-create-name">{o.label}</span><span className="assign-create-status">{o.hint}</span>{on && <Check size={18} />}
                    </button>
                    );
                  })}
                  <button type="button" className={`assign-create-item ${cardProvider === "own" ? "assign-create-item-sel" : ""}`} onClick={() => void chooseOwnProvider()} data-testid="nail-pay-method-own">
                    <CreditCard size={18} /><span className="assign-create-name">Own Provider</span><span className="assign-create-status">Your own card terminal. No M2, no Tap to Pay, no card payment on the customer screen. CARD records the payment. Applies to every POS station.</span>{cardProvider === "own" && <Check size={18} />}
                  </button>
                  {canNativePrint && (
                    <button type="button" className="assign-create-item" data-testid="nail-pay-setup-printer"
                      onClick={() => { (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "SETUP_PRINTER", storeName: p.storeName || "Receipt" })); setPopup(null); }}>
                      <Printer size={18} /><span className="assign-create-name">Receipt printer</span><span className="assign-create-status">USB printers are found automatically. Choose or test one here.</span>
                    </button>
                  )}
                </>
              )}
              {popup === "gift" && (
                <div className="gift-entry">
                  <input className="gift-input" value={gift.code} autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="GC-XXXXXXXX" data-testid="nail-pay-gift-code"
                    onChange={(e) => setGift((g) => ({ ...g, code: e.target.value.toUpperCase(), card: null, error: "" }))}
                    onKeyDown={(e) => { if (e.key === "Enter") void findGift(); }} />
                  <button type="button" className="assign-create-btn assign-create-btn-ready" disabled={!gift.code.trim() || gift.busy} onClick={() => void findGift()} data-testid="nail-pay-gift-check">{gift.busy ? "CHECKING…" : "CHECK CARD"}</button>
                  {gift.error && <div className="gift-error" data-testid="nail-pay-gift-error">{gift.error}</div>}
                  {gift.card && (
                    <div className="gift-result" data-testid="nail-pay-gift-result">
                      <span>{gift.card.code}{gift.card.issuedTo ? ` · ${gift.card.issuedTo}` : ""}</span>
                      <strong>{money(giftLeft)} available</strong>
                    </div>
                  )}
                  {gift.card && gift.mode === "pay" && (
                    <button type="button" className="assign-create-btn assign-create-btn-ready" disabled={giftUse <= 0} onClick={applyGift} data-testid="nail-pay-gift-apply">
                      {giftUse > 0 ? `APPLY ${money(giftUse)}` : "NOTHING TO APPLY"}
                    </button>
                  )}
                </div>
              )}
              {popup === "group" && p.otherTickets.map((t) => {
                const on = linkedIds.includes(t.id);
                return (
                  <button key={t.id} type="button" className={`assign-create-item ${on ? "assign-create-item-sel" : ""}`} data-testid={`nail-pay-group-${t.id}`}
                    onClick={() => setLinkedIds((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}>
                    <span className="assign-create-dot" style={{ background: t.staff?.color || "#454c56" }} />
                    <span className="assign-create-name">{t.client.name}</span><span className="assign-create-status">{t.service.name} · {money(t.total)}</span>
                  </button>
                );
              })}
            </div>
            <div className="assign-create-footer">
              <button type="button" className="assign-create-btn assign-create-btn-ready" onClick={() => setPopup(null)}>DONE</button>
            </div>
          </div>
        </>
      )}
      {/* The client is choosing their tip. The POS waits for them: nothing on it can be used until they
          finish, apart from Cancel for a client who has walked away or won't choose. */}
      {awaitingTip && (
        <div className="fixed inset-0 z-[280] flex items-center justify-center px-6" style={{ background: "rgba(10,12,16,.82)" }} role="alertdialog" aria-modal="true" aria-live="polite" data-testid="nail-pay-tip-lock">
          <div className="rounded-2xl px-10 py-9 text-center" style={{ background: "#232830", border: "1px solid #3b424c", boxShadow: "0 30px 70px rgba(0,0,0,.5)", maxWidth: 560 }}>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.3, color: "#fff" }}>Waiting for client to select tip</p>
            <button type="button" onClick={() => stopWaitingForTip(false)} data-testid="nail-pay-tip-lock-cancel"
              style={{ marginTop: 28, fontSize: 18, fontWeight: 700, padding: "14px 36px", borderRadius: 12, border: "1px solid #4b5563", background: "#353a43", color: "#fff" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

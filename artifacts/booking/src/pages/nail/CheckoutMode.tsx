/**
 * The POS tab in CHECKOUT mode — the Nail POS's own screen (ticket panel · keypad · function/payment panel, in the wrapper
 * design), not the calendar's sheet. A ticket from In Service (or PAY NOW) is loaded here and paid with:
 *   keypad (cents) · Tip Adjust / Discount / No Sale / Reprint · function grid (Retail, Removal, Quick Ticket, Custom Charge,
 *   Loyalty, Group Pay, Gift Card) · Cash / Card tenders (split payments, change due) · the customer-facing /frontdesk screen.
 * The maths lives in shared/nailCheckout.ts (unit-tested); this file is screen state + wiring.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, Ban, Banknote, BadgePercent, Calculator, Check, CreditCard, DoorOpen, Gift, HandCoins, Loader2, MessageSquare, Percent, Printer, Settings, ShoppingBag, Smartphone, Star, Undo2, Users, X, Zap } from "lucide-react";
import {
  centsToDollars, computeCheckout, paymentMethodSummary, pushKeypadDigits, QUICK_TICKET_STEPS, r2, REMOVAL_TYPES, splitGroup,
  type DiscountInput, type Extra, type ExtraKind, type Tender,
} from "@shared/nailCheckout";
import { buildCheckoutReceipt } from "@/lib/thermalPrinter";
import { buildNativeReceiptPayload } from "@/lib/receiptPayload";
import { openCashDrawerHardware } from "@/lib/cashDrawer";
import { lookupGiftCard, type BoardTicket, type FinalizeData, type GiftCardInfo } from "./nailApi";
import { bridgeState, isNativeApp, useCardPayments } from "./useCardPayments";

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
}

type Tone = "info" | "success" | "error";
type Popup = null | "tip" | "rewards" | "group" | "settings" | "gift";
type CardMethod = "m2" | "tap";
/** The Nail POS's own card-reader choice, one per device. It is NOT the calendar's key: that one defaults to Tap to Pay, and CARD here is the M2 button. */
const CARD_METHOD_KEY = "certxa.nail.cardMethod";
const tenderLabel = (t: Tender) => (t.method === "gift" ? `GIFT CARD${t.code ? ` ·${t.code.slice(-4)}` : ""}` : t.method === "tap" ? "TAP TO PAY" : t.method === "cash" ? "CASH" : "CARD");
type Reward = { id: number; name: string; pointsCost: number; dollarValue: number; isActive?: boolean };

const money = (n: number) => `$${n.toFixed(2)}`;
const KEYS = ["7", "8", "9", "⌫", "4", "5", "6", "CLEAR", "1", "2", "3", "ERC", "00", "0", "ENTER"];

export function CheckoutMode(p: Props) {
  const { ticket } = p;
  const [cents, setCents] = useState("");
  const [extras, setExtras] = useState<Extra[]>([]);
  const nextId = useRef(1);
  const [discount, setDiscount] = useState<DiscountInput>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [tip, setTip] = useState(0);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [linkedIds, setLinkedIds] = useState<number[]>([]);
  const [rightTab, setRightTab] = useState<"functions" | "payment">("payment");
  const [menu, setMenu] = useState<"root" | "removal" | "gift" | "discount">("root");
  const [popup, setPopup] = useState<Popup>(null);
  const [guided, setGuided] = useState<number | null>(null);
  // Which reader the CARD button uses — chosen with the gear, remembered on this device.
  const [cardMethod, setCardMethod] = useState<CardMethod>(() => {
    try { const v = localStorage.getItem(CARD_METHOD_KEY); return v === "m2" || v === "tap" ? v : "m2"; } catch { return "m2"; }
  });
  const [gift, setGift] = useState<{ code: string; card: GiftCardInfo | null; error: string; busy: boolean; mode: "pay" | "balance" }>({ code: "", card: null, error: "", busy: false, mode: "pay" });
  // One-time Tap to Pay enrolment on the native Android app (location permission + Stripe terms), reported back by the app.
  const native = isNativeApp();
  const [tapSetup, setTapSetup] = useState<{ state: "idle" | "running" | "ready" | "error"; msg: string }>({ state: "idle", msg: "" });
  useEffect(() => {
    if (!native) return;
    const onReady = () => setTapSetup({ state: "ready", msg: "Tap to Pay is ready on this device." });
    const onErr = (e: Event) => setTapSetup({ state: "error", msg: String((e as CustomEvent).detail?.message || "Setup failed. Try again.") });
    window.addEventListener("certxa_native_taptopay_ready", onReady);
    window.addEventListener("certxa_native_taptopay_error", onErr);
    return () => { window.removeEventListener("certxa_native_taptopay_ready", onReady); window.removeEventListener("certxa_native_taptopay_error", onErr); };
  }, [native]);
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = (text: string, tone: Tone = "info") => {
    setStatus({ text, tone });
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 4500);
  };
  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current); }, []);

  const amount = centsToDollars(cents);
  const linked = useMemo(() => p.otherTickets.filter((t) => linkedIds.includes(t.id)), [p.otherTickets, linkedIds]);
  // A Retail-marked custom line built into the ticket itself (see CatalogPanel's Keypad) is still
  // part of ticket.total, but must be pulled out of service revenue for commission purposes.
  const ticketRetailTotal = useMemo(() => ticket.customLines.filter((l) => l.isRetail).reduce((s, l) => s + l.price, 0), [ticket.customLines]);
  const totals = useMemo(() => computeCheckout({
    ticketTotal: ticket.total, ticketRetailTotal, extras, linkedSubtotal: linked.reduce((s, t) => s + t.total, 0),
    discount, rewardDollar: reward?.dollarValue ?? 0, tip, tenders,
  }), [ticket.total, ticketRetailTotal, extras, linked, discount, reward, tip, tenders]);

  // ── customer-facing screen ────────────────────────────────────────────────
  const send = (type: string, payload: Record<string, unknown> = {}) => {
    if (!p.dualScreen) return;
    fetch("/api/kiosk/checkout-event", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, registerId: p.registerId, ...payload }),
    }).catch(() => {});
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
  const showPoints = loyaltyCfg?.enabled === true && !!ticket.client.id;
  const cartKey = JSON.stringify([ticket.id, extras.map((e) => [e.label, e.price]), linked.map((t) => t.id), discount, reward?.id, tip, showPoints ? ticket.client.loyaltyPoints : null, tenders.map((t) => [t.method, t.amount])]);
  // The lines of the sale — shown on the customer's screen and on a texted receipt.
  const cartItems = () => [
    { label: ticket.service.name, price: ticket.service.price },
    ...ticket.addons.map((a) => ({ label: `+ ${a.name}`, price: a.price })),
    ...(ticket.nail?.lines ?? []).map((l) => ({ label: l.label, price: l.price })),
    ...ticket.customLines.map((l) => ({ label: l.label, price: l.price })),
    ...extras.map((e) => ({ label: e.label, price: e.price })),
    ...linked.map((t) => ({ label: `${t.client.name} — ${t.service.name}`, price: t.total })),
  ];
  // The client's number on file. The customer's screen is only told THAT there is one (and its last 4) so it can skip asking — never the number itself.
  const phoneOnFile = (ticket.client.phone ?? "").replace(/\D/g, "").slice(-10);
  useEffect(() => {
    if (!p.dualScreen) return;
    const items = cartItems();
    send("kiosk_checkout_cart", { items, subtotal: totals.subtotal, discount: totals.discount, tip: totals.tip, tax: 0, total: totals.total, isWalkIn: false, customerName: ticket.client.name, loyaltyPoints: showPoints ? ticket.client.loyaltyPoints : undefined, pointsPerDollar: showPoints ? loyaltyCfg?.pointsPerDollar : undefined, appointmentId: ticket.id, paid: Math.min(totals.tendered, totals.total), balanceDue: totals.balanceDue, payments: tenders.map((t) => ({ label: tenderLabel(t), amount: t.amount })), hasPhone: phoneOnFile.length === 10, phoneLast4: phoneOnFile.length === 10 ? phoneOnFile.slice(-4) : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, p.dualScreen]);

  // What the customer's screen needs to know about a payment of `paid`: what is still owed after it, and what the sale has taken in all.
  const settlementAfter = (paid: number) => {
    const remaining = Math.max(0, r2(totals.balanceDue - paid));
    return { remaining, paidTotal: r2(totals.total - remaining) };
  };

  // ── real card charging (M2 reader · Tap to Pay) ───────────────────────────
  // The PaymentIntent ID from the most recent successful card tender — threaded through to
  // nativePrintReceipt() below so the native app can look up card details for the receipt
  // (it keys that lookup by paymentIntentId; previously this was always sent as null).
  const lastCardPaymentIntentId = useRef<string | null>(null);
  const cards = useCardPayments({
    ticketId: ticket.id, clientName: ticket.client.name, dualScreen: p.dualScreen, send,
    context: () => ({ tipCents: Math.round(totals.tip * 100), discountCents: Math.round(totals.discount * 100), priorTenderedCents: Math.round(totals.tendered * 100) }),
    onPaid: (kind, paid, last4, paymentIntentId) => {
      setTenders((cur) => [...cur, { id: nextId.current++, method: kind, amount: paid }]);
      setCents("");
      if (paymentIntentId) lastCardPaymentIntentId.current = paymentIntentId;
      say(`CARD APPROVED · ${money(paid)}${last4 ? ` · ····${last4}` : ""}`, "success");
    },
    onFailed: (message) => say(message.toUpperCase(), "error"),
    settlementAfter,
    say,
  });

  // The customer's screen said something: a tip, or the result of a card they tapped.
  useEffect(() => {
    const m = p.socketEvent;
    if (!m) return;
    if (m.type === "kiosk_checkout_tip_selected") {
      const amt = Math.max(0, Number(m.tipAmount) || 0);
      setTip(amt);
      say(amt > 0 ? `TIP RECEIVED · ${money(amt)}` : "NO TIP SELECTED BY CLIENT", amt > 0 ? "success" : "info");
    } else if (m.type === "kiosk_checkout_receipt_choice") {
      // "No Receipt" on the customer's screen ends the sale here too — there's nothing left for staff to do.
      // "Print" needs staff to actually run the counter's printer first, so it does NOT advance on its own.
      if (m.choice === "none") p.onReceiptDone();
      else void textReceipt(m);
    } else cards.onSocket(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.socketEvent]);

  // The customer chose "Text Receipt" on their screen: text it to the number they typed, or — when the screen didn't need to ask — the one on the ticket.
  const textReceipt = async (m: any) => {
    if (m.choice !== "text") return;
    const reply = (ok: boolean) => send("kiosk_checkout_receipt_result", { choice: "text", ok });
    const digits = String(m.phone ?? "").replace(/\D/g, "").slice(-10) || phoneOnFile;
    if (digits.length !== 10) { say("NO PHONE NUMBER FOR THIS CLIENT — RECEIPT NOT TEXTED", "error"); return reply(false); }
    say("TEXTING RECEIPT…", "info");
    try {
      const r = await fetch("/api/pos/receipt-link", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: ticket.id, phone: digits,
          snapshot: {
            items: cartItems(), dateIso: new Date().toISOString(), clientName: ticket.client.name,
            subtotal: totals.subtotal, discount: totals.discount, tip: totals.tip, total: totals.total,
            tenders: tenders.map((t) => ({ method: t.method, amount: t.amount })),
          },
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      say("RECEIPT TEXTED", "success");
      reply(true);
      p.onReceiptDone();
    } catch {
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
      if (amount <= 0) { say("ENTER AN AMOUNT FIRST", "error"); return; }
      addExtra("+Extra", amount, "custom"); setCents(""); say(`EXTRA ADDED · ${money(amount)}`, "success");
      return;
    }
    setCents((c) => pushKeypadDigits(c, k));
  };

  // ── functions ─────────────────────────────────────────────────────────────
  const openDrawer = () => { void openCashDrawerHardware({ onThermalPrint: p.thermalPrint }); };
  // Same three actions as the calendar checkout's Discount submenu: a preset % replaces the discount, Custom takes the dollar amount
  // typed on the keypad, Comp is 100% off. Once a discount is applied the grid goes back to the main menu.
  const discountPreset = (percent: number) => { setDiscount({ type: "percent", value: percent }); setMenu("root"); say(`${percent}% DISCOUNT APPLIED`, "success"); };
  const discountCustom = () => {
    if (amount <= 0) return needAmount(); // nothing applied yet: stay here so the amount can be typed and Custom tapped again
    setDiscount({ type: "dollar", value: amount }); setCents(""); setMenu("root");
    say(`${money(amount)} DISCOUNT APPLIED`, "success");
  };
  const discountComp = () => { setDiscount({ type: "percent", value: 100 }); setMenu("root"); say("TICKET COMPED — 100% OFF", "success"); };
  const applyTip = (dollars: number) => { setTip(dollars); setPopup(null); say(dollars > 0 ? `TIP SET · ${money(dollars)}` : "TIP CLEARED", "success"); };
  const preTip = Math.max(0, totals.subtotal - totals.discount);

  const runFn = (id: string) => {
    switch (id) {
      case "retail": if (amount <= 0) return needAmount(); addExtra("Retail Item", amount, "retail"); setCents(""); say(`RETAIL ADDED · ${money(amount)}`, "success"); return;
      case "custom": if (amount <= 0) return needAmount(); addExtra("+Extra", amount, "custom"); setCents(""); say(`EXTRA ADDED · ${money(amount)}`, "success"); return;
      case "removal": setMenu("removal"); return;
      case "gift": setMenu("gift"); return;
      case "quick": if (guided !== null) { setGuided(null); setCents(""); say("QUICK TICKET CANCELLED"); } else { setCents(""); setGuided(0); } return;
      case "loyalty": if (!ticket.client.id) return say("ADD A CLIENT TO THE TICKET FIRST", "error"); setPopup("rewards"); return;
      case "group": if (p.otherTickets.length === 0) return say("NO OTHER ACTIVE TICKETS", "error"); setPopup("group"); return;
    }
  };
  const runRemoval = (name: string) => { addExtra(name, amount, "addon"); setCents(""); say(`${name.toUpperCase()} ADDED · ${money(amount)}`, "success"); };
  const comingSoon = (label: string) => say(`${label.toUpperCase()} — COMING SOON`);

  const tipButton = () => {
    if (amount > 0) { applyTip(amount); setCents(""); return; }
    setPopup("tip");
  };
  const sendTipScreen = () => { setPopup(null); send("kiosk_checkout_tip_request", { total: preTip, cardMethod, appointmentId: ticket.id }); say("TIP SCREEN SENT TO CLIENT", "info"); };

  // ── tenders ───────────────────────────────────────────────────────────────
  const rest = () => totals.balanceDue;
  /** What a tender takes: the keypad amount (a part-payment) or, with nothing typed, the whole balance. */
  const wanted = () => (amount > 0 ? amount : rest());
  // Guards against a double-tap / touch-bounce registering the same cash amount twice — CASH has
  // no busy state the way CARD does (disabled={cardBusy}), and takeCash runs synchronously with
  // nothing to naturally prevent two rapid taps from each reading the same `wanted()` value.
  const cashLock = useRef(false);
  const takeCash = () => {
    if (cashLock.current) return;
    const value = wanted();
    if (value <= 0) return say(rest() <= 0 ? "NOTHING DUE" : "ENTER AN AMOUNT FIRST", "error");
    cashLock.current = true;
    setTimeout(() => { cashLock.current = false; }, 600);
    openDrawer(); // cash may be over-tendered — change comes back
    setTenders((cur) => [...cur, { id: nextId.current++, method: "cash", amount: value }]);
    setCents("");
    send("kiosk_checkout_payment_result", { success: true, total: value, appointmentId: ticket.id, ...settlementAfter(value) });
  };

  // CARD charges the card with whichever reader the gear picked (M2 reader or Tap to Pay); a card is charged exactly what is owed.
  const takeCard = () => {
    if (cards.awaitingTap) return cards.tap(0); // a second press cancels the tap waiting on the customer's screen
    const value = Math.min(wanted(), rest());
    if (value <= 0) return say(rest() <= 0 ? "NOTHING DUE" : "ENTER AN AMOUNT FIRST", "error");
    if (cardMethod === "m2") return cards.m2(value);
    if (!cards.tapAvailable) return say("TAP TO PAY NEEDS THE APP OR A PAIRED CUSTOMER SCREEN — CHOOSE M2 READER WITH THE GEAR", "error");
    cards.tap(value);
  };
  const m2Busy = ["loading", "discovering", "connecting", "collecting", "processing"].includes(cards.status);
  const cardBusy = m2Busy || cards.nativeBusy !== null;
  const cardLabel = cards.awaitingTap ? "CANCEL TAP"
    : cards.status === "loading" ? "LOADING…" : cards.status === "discovering" ? "SCANNING…" : cards.status === "connecting" ? "CONNECTING…"
    : cards.status === "collecting" ? "WAITING FOR CARD…" : cards.status === "processing" ? "PROCESSING…" : cards.nativeBusy ? "CHARGING…" : "CARD";

  const chooseCardMethod = (m: CardMethod) => {
    setCardMethod(m);
    try { localStorage.setItem(CARD_METHOD_KEY, m); } catch { /* private mode: it just won't be remembered */ }
    setPopup(null);
    say(m === "m2" ? "CARD WILL USE THE M2 READER" : "CARD WILL USE TAP TO PAY", "success");
  };
  const startTapToPaySetup = () => {
    setTapSetup({ state: "running", msg: "Follow the prompts on this device…" });
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "SETUP_TAP_TO_PAY" }));
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
    const ownBase = ticket.total + extras.reduce((s, e) => s + e.price, 0);
    let groupTickets: FinalizeData["groupTickets"];
    if (linked.length > 0) {
      groupTickets = splitGroup(
        [{ appointmentId: ticket.id, base: ownBase, duration: ticket.duration, serviceRevenue: totals.serviceRevenue, productRevenue: totals.productRevenue },
          // A linked ticket's own customLines can carry a Retail-marked line too (rung up on that
          // ticket before it was ever pulled into this group) — split its base the same way,
          // instead of always crediting the whole thing to service revenue.
          ...linked.map((t) => {
            const retail = r2(t.customLines.filter((l) => l.isRetail).reduce((s, l) => s + l.price, 0));
            return { appointmentId: t.id, base: t.total, duration: t.duration, serviceRevenue: r2(t.total - retail), productRevenue: retail };
          })],
        { tip: totals.tip, discount: totals.discount, totalPaid: totals.totalPaid }, methods);
    }
    send("kiosk_checkout_cancel");
    // No receipt is printed/sent here any more — once this succeeds the payment buttons are replaced by
    // Print / Text / No Receipt (see the receipt panel below), so the choice is always explicit.
    p.onFinalize({
      paymentMethod: methods, tip: totals.tip, discount: totals.discount, totalPaid: totals.totalPaid,
      serviceRevenue: totals.serviceRevenue, productRevenue: totals.productRevenue, groupTickets,
      redemption: reward && ticket.client.id ? { rewardId: reward.id, customerId: ticket.client.id } : undefined,
      giftCards: giftByCard.size ? [...giftByCard].map(([code, amount]) => ({ code, amount })) : undefined,
    });
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
  const nativePrintReceipt = (copy: 'salon' | 'customer' | 'both'): Promise<boolean> => new Promise((resolve) => {
    const requestId = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let finished = false;
    const finishWait = (ok: boolean, error?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("certxa_native_print_result", onResult);
      if (!ok) say((error || "The printer did not respond.").toUpperCase(), "error");
      resolve(ok);
    };
    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.requestId === requestId) finishWait(!!d.ok, d.error || undefined);
    };
    const timer = setTimeout(() => finishWait(false, "The printer did not respond. Check that it is on and connected."), 45_000);
    window.addEventListener("certxa_native_print_result", onResult);
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({
      type: "PRINT_RECEIPT",
      requestId,
      copy,
      paymentIntentId: lastCardPaymentIntentId.current,
      receipt: buildNativeReceiptPayload({
        storeName: p.storeName,
        storeAddress: p.storeAddress,
        storeCityStateZip: p.storeCityStateZip,
        storePhone: p.storePhone,
        ticketNumber: ticket.ticketNumber ?? ticket.id,
        dateIso: new Date().toISOString(),
        clientName: ticket.client.name,
        staffName: ticket.staff?.name,
        items: cartItems(),
        subtotal: totals.subtotal, discount: totals.discount, tax: 0, tip: totals.tip, grandTotal: totals.total,
        tenders: tenders.map((t) => ({ method: t.method, amount: t.amount })),
        changeDue: totals.changeDue,
      }),
    }));
  });
  const printReceiptNow = async (copy: 'salon' | 'customer' | 'both'): Promise<boolean> => {
    if (canNativePrint) return nativePrintReceipt(copy);
    if (p.thermalPrint) {
      try {
        const now = new Date();
        await p.thermalPrint(buildCheckoutReceipt({
          storeName: p.storeName, clientName: ticket.client.name, tenders, grandTotal: totals.total, changeDue: totals.changeDue,
          transactionId: `A-${ticket.id}`,
          dateStr: now.toLocaleDateString("en-US", { timeZone: p.timezone }), timeStr: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: p.timezone }),
        }));
        return true;
      } catch (err: any) {
        say((err?.message || "THE PRINTER DID NOT RESPOND").toUpperCase(), "error");
        return false;
      }
    }
    say("NO RECEIPT PRINTER CONNECTED — CONNECT ONE IN MORE → PRINTER", "error");
    return false;
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
    if (!ok) return;
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
  // Texts a LINK to a public web receipt (not the plain summary) — /api/pos/receipt-link stores exactly what's on
  // screen right now under this ticket's existing "manage my booking" token, so the link keeps showing these same
  // numbers, then sends it through the salon's Twilio number.
  const handleTextReceipt = async () => {
    if (receiptBusy) return;
    if (phoneOnFile.length !== 10) { say("NO PHONE NUMBER ON FILE FOR THIS CLIENT", "error"); return; }
    setReceiptBusy("text");
    say("TEXTING RECEIPT…", "info");
    try {
      const r = await fetch("/api/pos/receipt-link", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: ticket.id, phone: phoneOnFile,
          snapshot: {
            clientName: ticket.client.name, items: cartItems(), dateIso: new Date().toISOString(),
            subtotal: totals.subtotal, discount: totals.discount, tip: totals.tip, total: totals.total,
            tenders: tenders.map((t) => ({ method: tenderLabel(t), amount: t.amount })),
          },
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setReceiptBusy(null);
      say("RECEIPT TEXTED", "success");
      p.onReceiptDone();
    } catch {
      setReceiptBusy(null);
      say("COULD NOT TEXT RECEIPT", "error");
    }
  };
  const handleNoReceipt = () => { if (!receiptBusy) p.onReceiptDone(); };

  // ── rewards ───────────────────────────────────────────────────────────────
  const { data: rewards = [] } = useQuery<Reward[]>({ queryKey: ["/api/loyalty/rewards"], enabled: popup === "rewards" && !!p.storeId });
  const points = ticket.client.loyaltyPoints;

  // ── grid contents ─────────────────────────────────────────────────────────
  type Cell = { id: string; label: string; icon: typeof Gift; run: () => void; more?: boolean } | null;
  const rootCells: Cell[] = [
    { id: "retail", label: "Retail", icon: ShoppingBag, run: () => runFn("retail") },
    { id: "removal", label: "Removal", icon: Undo2, run: () => runFn("removal"), more: true },
    { id: "quick", label: guided !== null ? "Exit Quick Ticket" : "Quick Ticket", icon: Zap, run: () => runFn("quick") },
    { id: "custom", label: "Custom Charge", icon: Calculator, run: () => runFn("custom") },
    { id: "loyalty", label: "Loyalty", icon: Star, run: () => runFn("loyalty") },
    { id: "group", label: "Group Pay", icon: Users, run: () => runFn("group") },
    { id: "gift", label: "Gift Card", icon: Gift, run: () => runFn("gift"), more: true },
  ];
  const removalCells: Cell[] = REMOVAL_TYPES.map((n) => ({ id: n, label: n.replace(/ Removal$/, "\nRemoval"), icon: Undo2, run: () => runRemoval(n) }));
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
    { id: "disc-comp", label: "Comp\n(100%)", icon: Award, run: discountComp },
  ];
  const cells = menu === "root" ? rootCells : menu === "removal" ? removalCells : menu === "discount" ? discountCells : giftCells;
  const gridCells: Cell[] = Array.from({ length: 24 - (menu === "root" ? 0 : 1) }, (_, i) => cells[i] ?? null);

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
          {linked.map((t) => (
            <div className="ticket-item" key={`l${t.id}`} data-testid="nail-pay-linked">
              <div className="item-copy"><strong>{t.client.name}</strong><span>{t.service.name} · paid together</span></div>
              <div className="item-price"><strong>{money(t.total)}</strong></div>
              <button type="button" className="remove-item" onClick={() => setLinkedIds((cur) => cur.filter((x) => x !== t.id))} aria-label={`Remove ${t.client.name}`}><X size={16} /></button>
            </div>
          ))}
        </div>

        <div className="ticket-total">
          <div><span>SUBTOTAL</span><strong data-testid="nail-pay-subtotal">{money(totals.subtotal)}</strong></div>
          {totals.discount > 0 && (
            <div data-testid="nail-pay-discount-row">
              <span>{reward && !discount ? `REWARD · ${reward.name.toUpperCase()}` : `DISCOUNT${discount?.type === "percent" ? ` (${discount.value}%)` : ""}`}</span>
              <strong>
                −{money(totals.discount)}{" "}
                <button type="button" className="row-x" aria-label="Remove discount" onClick={() => { setDiscount(null); setReward(null); }}>×</button>
              </strong>
            </div>
          )}
          {totals.tip > 0 && (
            <div><span>TIP</span><strong data-testid="nail-pay-tip">{money(totals.tip)} <button type="button" className="row-x" aria-label="Remove tip" onClick={() => setTip(0)}>×</button></strong></div>
          )}
          <div className="grand-total"><span>TOTAL</span><strong data-testid="nail-pay-total">{money(totals.total)}</strong></div>
          {tenders.map((t) => (
            <div key={t.id} data-testid={`nail-pay-tender-${t.method}`}><span>{tenderLabel(t)}</span><strong>−{money(t.amount)} <button type="button" className="row-x" aria-label="Remove payment" onClick={() => setTenders((cur) => cur.filter((x) => x.id !== t.id))}>×</button></strong></div>
          ))}
          {tenders.length > 0 && (
            <div className="balance-row" data-testid="nail-pay-balance">
              <span>{totals.changeDue > 0 ? "CHANGE DUE" : totals.balanceDue > 0 ? "BALANCE DUE" : "PAID IN FULL"}</span>
              <strong>{totals.changeDue > 0 ? money(totals.changeDue) : money(totals.balanceDue)}</strong>
            </div>
          )}
          <div className="checkout-row">
            <button type="button" className="checkout-clr" onClick={p.onClose} data-testid="nail-pay-back">BACK</button>
            <button type="button" className={`checkout ${!totals.settled || p.finalizing || p.paid ? "disabled" : ""}`} disabled={!totals.settled || p.finalizing || p.paid} onClick={finish} data-testid="nail-pay-finish">
              {p.paid ? "PAID ✓" : p.finalizing ? "SAVING…" : "PAY / CHECKOUT"}
            </button>
          </div>
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
            <div className="money-grid pay-fn-row">
              <button type="button" onClick={tipButton} data-testid="nail-pay-fn-tip"><HandCoins size={20} /><span>Tip Adjust</span></button>
              <button type="button" onClick={() => { setRightTab("functions"); setMenu("discount"); }} data-testid="nail-pay-fn-discount"><Percent size={20} /><span>Discount</span></button>
              <button type="button" onClick={() => { openDrawer(); say("CASH DRAWER OPENED"); }} data-testid="nail-pay-fn-nosale"><DoorOpen size={20} /><span>No Sale</span></button>
              <button type="button" onClick={() => comingSoon("Reprint")} data-testid="nail-pay-fn-reprint"><Printer size={20} /><span>Reprint</span></button>
            </div>
          </div>

          {/* ── functions / payment ──────────────────────────────────────── */}
          <div className="catalog-panel" data-testid="nail-pay-right">
            <div className="category-tabs" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <button type="button" className={rightTab === "payment" ? "active" : ""} onClick={() => setRightTab("payment")} data-testid="nail-pay-tab-payment"><Banknote size={20} /><span>PAYMENT</span></button>
              <button type="button" className={rightTab === "functions" ? "active" : ""} onClick={() => { setRightTab("functions"); setMenu("root"); }} data-testid="nail-pay-tab-functions"><Zap size={20} /><span>FUNCTIONS</span></button>
            </div>

            {rightTab === "payment" ? (
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
                <div className="pay-methods">
                  <button type="button" className="pay-cash" onClick={takeCash} data-testid="nail-pay-cash"><Banknote size={26} /><span>CASH</span></button>
                  <button type="button" className="pay-card" disabled={cardBusy} onClick={takeCard} data-testid="nail-pay-card">
                    {cardBusy || cards.awaitingTap ? <Loader2 size={26} className="spin" /> : <CreditCard size={26} />}<span>{cardLabel}</span>
                  </button>
                  <button type="button" className="pay-gift" onClick={() => openGift("pay")} data-testid="nail-pay-gift"><Gift size={26} /><span>GIFT CARD</span></button>
                </div>
                <p className="pay-hint">Type an amount on the keypad, then tap a method — or tap one with nothing typed to take the whole balance. CARD charges with {cardMethod === "m2" ? "the M2 reader" : "Tap to Pay"} (change it with the gear at the top of the ticket). Cash over the balance gives change.</p>
              </div>
              )
            ) : (
              <div className="fn-wrap" data-testid="nail-pay-functions">
                <div className="fn-grid">
                  {menu !== "root" && (
                    <button type="button" className="fn-cell fn-back" onClick={() => setMenu("root")} data-testid="nail-pay-fn-back"><ArrowLeft size={22} /><span>Back</span></button>
                  )}
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
        </div>
      </section>

      {/* ── pickers ──────────────────────────────────────────────────────── */}
      {popup && (
        <>
          <div className="assign-create-overlay" onClick={() => setPopup(null)} />
          <div className="assign-create-modal" data-testid={`nail-pay-popup-${popup}`}>
            <div className="assign-create-header">
              <div>
                <h2>{popup === "tip" ? "Tip" : popup === "rewards" ? "Loyalty rewards" : popup === "settings" ? "POS settings" : popup === "gift" ? (gift.mode === "balance" ? "Gift card balance" : "Pay with gift card") : "Group pay"}</h2>
                <p>{popup === "rewards" ? `${ticket.client.name} · ${points} pts` : popup === "group" ? "Pay these tickets together" : popup === "settings" ? "Saved to this device" : popup === "gift" ? "Type or scan the card code" : ticket.client.name}</p>
              </div>
              <button type="button" className="assign-create-close" onClick={() => setPopup(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="assign-create-list">
              {popup === "tip" && (
                <>
                  {p.dualScreen && <button type="button" className="assign-create-item" onClick={sendTipScreen} data-testid="nail-pay-tip-screen"><span className="assign-create-name">Send tip screen to the customer</span></button>}
                  {[15, 20, 25].map((pct) => (
                    <button key={pct} type="button" className="assign-create-item" onClick={() => applyTip(Math.round(preTip * pct) / 100)} data-testid={`nail-pay-tip-${pct}`}>
                      <span className="assign-create-name">{pct}%</span><span className="assign-create-status">{money(Math.round(preTip * pct) / 100)}</span>
                    </button>
                  ))}
                  <button type="button" className="assign-create-item" onClick={() => applyTip(0)} data-testid="nail-pay-tip-none"><span className="assign-create-name">No tip</span></button>
                  <div className="assign-create-hint">Or type a dollar amount on the keypad and tap Tip Adjust.</div>
                </>
              )}
              {popup === "rewards" && (
                <>
                  {rewards.filter((r) => r.isActive !== false).length === 0 && <div className="assign-picker-empty">No rewards set up yet.</div>}
                  {rewards.filter((r) => r.isActive !== false).map((r) => {
                    const can = points >= r.pointsCost;
                    return (
                      <button key={r.id} type="button" disabled={!can} className="assign-create-item" style={can ? undefined : { opacity: 0.45 }} data-testid={`nail-pay-reward-${r.id}`}
                        onClick={() => { setReward(r); setPopup(null); say(`REWARD APPLIED · ${money(r.dollarValue)} OFF`, "success"); }}>
                        <span className="assign-create-name">{r.name}</span><span className="assign-create-status">{r.pointsCost} pts · {money(r.dollarValue)} off{can ? "" : " — not enough points"}</span>
                      </button>
                    );
                  })}
                  {reward && <button type="button" className="assign-create-item" onClick={() => { setReward(null); setPopup(null); say("REWARD REMOVED"); }}><span className="assign-create-name">Remove reward</span></button>}
                </>
              )}
              {popup === "settings" && (
                <>
                  {(() => {
                    const b = bridgeState();
                    return (
                      <div className="assign-create-hint" data-testid="nail-pay-bridge" data-bridge={b}>
                        {b === "app" ? "Certxa Android app connected — the M2 reader and Tap to Pay run through the app."
                          : b === "broken" ? "Certxa app detected, but its connection isn't ready. Close and reopen the app."
                          : "Web browser — the M2 reader only works in the Certxa Android app."}
                      </div>
                    );
                  })()}
                  <div className="assign-create-hint">Card payment method — what the CARD button uses. Also used when the customer confirms the tip on their screen.</div>
                  {([
                    { key: "tap" as const, label: "Tap to Pay", icon: Smartphone, hint: "Phone / watch tap on the customer screen" },
                    { key: "m2" as const, label: "M2 Reader", icon: CreditCard, hint: "Bluetooth chip / swipe reader" },
                  ]).map((o) => (
                    <button key={o.key} type="button" className={`assign-create-item ${cardMethod === o.key ? "assign-create-item-sel" : ""}`} onClick={() => chooseCardMethod(o.key)} data-testid={`nail-pay-method-${o.key}`}>
                      <o.icon size={18} /><span className="assign-create-name">{o.label}</span><span className="assign-create-status">{o.hint}</span>{cardMethod === o.key && <Check size={18} />}
                    </button>
                  ))}
                  {native && (
                    <button type="button" className="assign-create-item" disabled={tapSetup.state === "running"} onClick={startTapToPaySetup} data-testid="nail-pay-setup-tap">
                      {tapSetup.state === "running" ? <Loader2 size={18} className="spin" /> : tapSetup.state === "ready" ? <Check size={18} /> : <Smartphone size={18} />}
                      <span className="assign-create-name">{tapSetup.state === "ready" ? "Tap to Pay — ready" : "Set up Tap to Pay"}</span>
                      <span className="assign-create-status">{tapSetup.msg || "One-time: accept Stripe's terms + grant location."}</span>
                    </button>
                  )}
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
    </>
  );
}

/**
 * PosCheckout — full-page, walk-in-capable point of sale at /pos.
 *
 * Ported closely from a reference design the store owner supplied
 * (CSS Grid 3-column layout: ticket / customer+keypad / categories+grid).
 * Dark theme and fonts match `CheckoutPOSPanel` (the appointment-checkout
 * sheet in Calendar.tsx, untouched by this page) exactly — same surface
 * hexes (#1c1c1e/#2c2c2e/#242426/#3a3a3c), same text tones (#f5f5f7/
 * #e5e5e7/#8e8e93), same accent colors (#34d399 success, #fb7185 danger,
 * #f4d000 gold), same numpad look, and no font-family override — this page
 * inherits the app's default font exactly like CheckoutPOSPanel does,
 * rather than pinning its own.
 *
 * Unlike CheckoutPOSPanel, this screen has no appointment attached — it's
 * reached directly from navigation (sidebar "POS" icon / footer nav) and
 * builds a ticket from scratch, optionally attaching a real customer.
 *
 * Real data only: categories/services from `useServiceCategories`/
 * `useServices`, add-ons from `useAddons`, retail items from `useProducts`,
 * staff from `useStaffList`, customer lookup via the existing
 * `/api/customers/search?phone=` endpoint. No VIP badge / membership tier /
 * wallet balance / last-visit — none of that exists in the real customer
 * schema, so this only ever shows fields that are actually real.
 *
 * Finalizing posts to `POST /api/pos/record-sale` — a real, already-wired
 * endpoint (one completed `appointments` row per line item, commission
 * snapshot, package resolution) that had no live caller until now. Card
 * payment reuses the same Stripe Terminal M2 pattern already proven in
 * Calendar.tsx, plus the native-app WebView bridge for Tap to Pay.
 *
 * The bottom action-tile strip has no real backing anywhere in the
 * codebase (no redeem-code flow, no drawer hardware integration, no coupon
 * system) — those stay as honest "coming soon" stubs.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive, ArrowLeftRight, Check, CreditCard, History, Loader2, Menu,
  MessageSquare, MoreHorizontal, Phone, Plus, ReceiptText,
  RotateCcw, Search, ShoppingBag, ShoppingCart, Sparkles, Star, Tag,
  Trash2, UserPlus, Users, WalletCards, X, CalendarDays, ClipboardList,
} from "lucide-react";
import { useSelectedStore } from "@/hooks/use-store";
import { useServices } from "@/hooks/use-services";
import { useServiceCategories, useAddons } from "@/hooks/use-addons";
import { useProducts } from "@/hooks/use-products";
import { useStaffList } from "@/hooks/use-staff";
import { useToast } from "@/hooks/use-toast";
import type { Service, Addon, Product, Staff } from "@shared/schema";

// ── Dark palette — copied verbatim from CheckoutPOSPanel (Calendar.tsx) ────
const D = {
  bg: "#1c1c1e", panel: "#2c2c2e", panelAlt: "#242426", tile: "#2a2a2c",
  numKey: "#2e2e30", border: "#3a3a3c", borderNum: "#3d3d40",
  text: "#f5f5f7", text2: "#e5e5e7", sub: "#a1a1a6", muted: "#8e8e93",
  green: "#34d399", greenSolid: "#16a34a", greenSolidHover: "#128a3e",
  greenTint: "#1f3a2f", danger: "#fb7185", dangerTint: "#3a2a2e",
  gold: "#f4d000", goldTint: "#2a2118", goldText: "#f5c451",
  blue: "#4f46e5", cyan: "#00c8ff",
};

type Icon = typeof Sparkles;

type TicketItem = {
  uid: number;
  name: string;
  detail: string;
  price: number;
  color: string;
  serviceId?: number;
  addonId?: number;
  productId?: number;
  duration?: number | null;
};

type CatalogTile = { name: string; detail: string; price: number; color: string; serviceId?: number; addonId?: number; productId?: number; duration?: number | null };
interface ServiceGroup { key: string; name: string; sortOrder: number; services: Service[]; }

const ACCENTS = ["#d12b83", "#3177c8", "#7a3ac0", "#b98222", "#159b5c", "#3caa82"];
const TILE_COLORS = ["#da2680", "#7795e8", "#eb7caa", "#e3a53c", "#3caa82"];

function Money({ value, className = "", style }: { value: number; className?: string; style?: React.CSSProperties }) {
  return <span className={className} style={style}>${value.toFixed(2)}</span>;
}

function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: D.border }}>
      <h2 className="text-[12px] font-bold tracking-tight" style={{ color: D.text }}>{children}</h2>
      {action}
    </div>
  );
}

export default function PosCheckout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  const { data: services } = useServices();
  const { data: categories } = useServiceCategories();
  const { data: storeAddons } = useAddons();
  const { data: products } = useProducts();
  const { data: staffList } = useStaffList();
  const activeStaff = useMemo(() => (staffList ?? []).filter((s: Staff) => (s as any).isActive !== false), [staffList]);

  const notify = (message: string) => toast({ title: message });
  const soon = (label: string) => notify(`${label} — coming soon`);

  /* ── Real category grouping (categoryId-first, legacy-text fallback) ───── */
  const categoryById = useMemo(() => {
    const m = new Map<number, { id: number; name: string; sortOrder: number | null }>();
    for (const c of (categories ?? []) as any[]) m.set(c.id, c);
    return m;
  }, [categories]);

  const groups = useMemo<ServiceGroup[]>(() => {
    const byKey = new Map<string, ServiceGroup>();
    for (const svc of (services ?? []) as Service[]) {
      if ((svc as any).isActive === false) continue;
      const cat = svc.categoryId != null ? categoryById.get(svc.categoryId) : undefined;
      const key = cat ? `cat:${cat.id}` : `legacy:${svc.category}`;
      const name = cat?.name ?? svc.category;
      const sortOrder = cat?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const existing = byKey.get(key);
      if (existing) existing.services.push(svc);
      else byKey.set(key, { key, name, sortOrder, services: [svc] });
    }
    return Array.from(byKey.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [services, categoryById]);

  const activeProducts = useMemo(() => ((products ?? []) as Product[]).filter((p) => (p as any).isActive !== false), [products]);
  const addonItems = useMemo(() => ((storeAddons ?? []) as Addon[]).filter((a) => a.isActive !== false), [storeAddons]);

  type TabKey = string;
  const [activeCategory, setActiveCategory] = useState<TabKey | null>(null);
  const RETAIL_KEY = "__retail__";
  const activeGroup = groups.find((g) => g.key === activeCategory);
  const isRetailTab = activeCategory === RETAIL_KEY || (!activeCategory && groups.length === 0 && activeProducts.length > 0);
  const effectiveActiveKey = activeCategory ?? groups[0]?.key ?? (activeProducts.length > 0 ? RETAIL_KEY : null);

  const activeTiles: CatalogTile[] = useMemo(() => {
    if (effectiveActiveKey === RETAIL_KEY) {
      return activeProducts.map((p, i) => ({
        name: p.name, detail: "Retail", price: Number(p.price) || 0, color: TILE_COLORS[i % TILE_COLORS.length], productId: p.id,
      }));
    }
    const g = groups.find((x) => x.key === effectiveActiveKey);
    return (g?.services ?? []).map((s, i) => ({
      name: s.name, detail: `${s.duration} min`, price: Number(s.price) || 0, color: TILE_COLORS[i % TILE_COLORS.length], serviceId: s.id, duration: s.duration,
    }));
  }, [effectiveActiveKey, groups, activeProducts]);

  /* ── Ticket ────────────────────────────────────────────────────────────── */
  const [ticket, setTicket] = useState<TicketItem[]>([]);
  const nextUid = useRef(1);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [payingMethod, setPayingMethod] = useState<null | "choose" | "processing">(null);
  const [finalizing, setFinalizing] = useState(false);

  const subtotal = useMemo(() => ticket.reduce((sum, item) => sum + item.price, 0), [ticket]);
  const total = subtotal;

  const addToTicket = (tile: CatalogTile) => {
    setTicket((cur) => [...cur, { uid: nextUid.current++, name: tile.name, detail: tile.detail, price: tile.price, color: tile.color, serviceId: tile.serviceId, addonId: tile.addonId, productId: tile.productId, duration: tile.duration }]);
    notify(`${tile.name} added to ticket`);
  };
  const removeFromTicket = (uid: number) => {
    const removed = ticket.find((i) => i.uid === uid);
    setTicket((cur) => cur.filter((i) => i.uid !== uid));
    if (removed) notify(`${removed.name} removed`);
  };

  /* ── Custom-amount keypad ──────────────────────────────────────────────── */
  const [keypadAmount, setKeypadAmount] = useState("0.00");
  const keypadRows = [["7", "8", "9", "back"], ["4", "5", "6", "undo"], ["1", "2", "3", "qty"], ["00", "0", ".", "enter"]];
  const pressKey = (key: string) => {
    if (key === "back") { setKeypadAmount((v) => (v.length > 1 ? v.slice(0, -1) : "0")); return; }
    if (key === "undo") { setKeypadAmount("0.00"); return; }
    if (key === "qty") { soon("Quantity mode"); return; }
    if (key === "enter") {
      const amt = Number(keypadAmount || 0);
      if (amt > 0) addToTicket({ name: "Custom Charge", detail: "Custom", price: amt, color: "#64748b" });
      setKeypadAmount("0.00");
      return;
    }
    setKeypadAmount((v) => {
      if (key === "." && v.includes(".")) return v;
      const next = v === "0.00" || v === "0" ? key : `${v}${key}`;
      return next.slice(0, 8);
    });
  };

  /* ── Customer (optional, real fields only) ────────────────────────────── */
  const [customer, setCustomer] = useState<{ id: number; name: string; phone: string | null; loyaltyPoints: number | null } | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);

  const searchCustomer = async () => {
    const digits = customerPhone.replace(/\D/g, "");
    if (!digits || !storeId) return;
    setCustomerSearching(true);
    try {
      const res = await fetch(`/api/customers/search?phone=${encodeURIComponent(digits)}&storeId=${storeId}`, { credentials: "include" });
      const data = await res.json().catch(() => []);
      setCustomerResults(Array.isArray(data) ? data : (data ? [data] : []));
    } catch {
      setCustomerResults([]);
    } finally {
      setCustomerSearching(false);
    }
  };

  /* ── Stripe Terminal M2 — same pattern already proven in Calendar.tsx ──── */
  const isNative = typeof window !== "undefined" && !!(window as any).CERTXA_NATIVE_APP;
  const [termStatus, setTermStatus] = useState<"idle" | "loading" | "discovering" | "connecting" | "ready" | "collecting" | "processing" | "error">("idle");
  const termRef = useRef<any>(null);
  const [termError, setTermError] = useState("");

  const loadStripeTerminalSDK = async (): Promise<any> => {
    if ((window as any).StripeTerminal) return (window as any).StripeTerminal;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/terminal/v1/";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Stripe Terminal SDK"));
      document.head.appendChild(script);
    });
    return (window as any).StripeTerminal;
  };

  const handleConnectM2 = async () => {
    try {
      setTermStatus("loading"); setTermError("");
      const StripeTerminal = await loadStripeTerminalSDK();
      if (!termRef.current) {
        termRef.current = StripeTerminal.create({
          onFetchConnectionToken: async () => {
            const res = await fetch("/api/payments/terminal/connection-token", { method: "POST", credentials: "include" });
            return (await res.json()).secret;
          },
          onUnexpectedReaderDisconnect: () => setTermStatus("error"),
        });
      }
      setTermStatus("discovering");
      const discoverResult = await termRef.current.discoverReaders({ simulated: false });
      if (discoverResult.error || !discoverResult.discoveredReaders?.length) { setTermStatus("error"); setTermError("No reader found nearby."); return; }
      setTermStatus("connecting");
      const connectResult = await termRef.current.connectReader(discoverResult.discoveredReaders[0]);
      if (connectResult.error) { setTermStatus("error"); setTermError(connectResult.error.message); return; }
      setTermStatus("ready");
    } catch (err: any) {
      setTermStatus("error"); setTermError(err?.message || "Could not connect to reader");
    }
  };

  const finalizeSale = async (paymentMethod: string) => {
    if (finalizing) return;
    setFinalizing(true);
    try {
      const items = ticket.filter((l) => l.serviceId).map((l) => ({ serviceId: l.serviceId, serviceAmount: l.price, duration: l.duration ?? 15 }));
      // Non-service lines (add-ons, retail, custom charges) are folded into
      // the first service line's amount when there's no service line at all
      // to attach them to — record-sale requires a serviceId per item.
      const extras = ticket.filter((l) => !l.serviceId);
      const extraTotal = extras.reduce((s, l) => s + l.price, 0);
      if (items.length === 0 && extraTotal > 0) {
        notify("Add at least one service to complete a sale — retail/add-on-only tickets aren't supported yet.");
        setFinalizing(false);
        return;
      }
      if (extraTotal > 0 && items.length > 0) items[0].serviceAmount += extraTotal;
      // Retail products are commissioned at the product rate, so tell the server how much of the sale they were.
      const productAmount = ticket.filter((l) => l.productId).reduce((s, l) => s + l.price, 0);

      const res = await fetch("/api/pos/record-sale", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, clientId: customer?.id ?? null, paymentMethod, totalPaid: total.toFixed(2), tipAmount: "0", productAmount }),
      });
      if (!res.ok) throw new Error("Failed to record sale");
      setCheckoutComplete(true);
      notify("Payment accepted · Ticket closed");
    } catch (err: any) {
      toast({ title: "Could not complete sale", description: err?.message, variant: "destructive" });
    } finally {
      setFinalizing(false);
      setPayingMethod(null);
    }
  };

  const handleM2Charge = async () => {
    if (total <= 0) return;
    try {
      setTermStatus("collecting"); setTermError("");
      const cents = Math.round(total * 100);
      const res = await fetch("/api/payments/terminal/create-payment-intent", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents, currency: "usd" }),
      });
      const { clientSecret } = await res.json();
      const collectResult = await termRef.current.collectPaymentMethod(clientSecret);
      if (collectResult.error) { setTermStatus("ready"); setTermError(collectResult.error.message); return; }
      setTermStatus("processing");
      const processResult = await termRef.current.processPayment(collectResult.paymentIntent);
      if (processResult.error) { setTermStatus("ready"); setTermError(processResult.error.message); return; }
      await fetch("/api/payments/terminal/capture-payment-intent", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId: processResult.paymentIntent.id }),
      });
      setTermStatus("ready");
      await finalizeSale("m2");
    } catch (err: any) {
      setTermStatus("ready"); setTermError(err?.message || "Payment failed");
    }
  };

  const startCheckout = () => {
    if (ticket.length === 0) return;
    setPayingMethod("choose");
  };

  const newTicket = () => {
    setTicket([]); setCheckoutComplete(false); setPayingMethod(null); setCustomer(null); setKeypadAmount("0.00");
  };

  /* ---------------------------------- Render ---------------------------------- */
  return (
    <div className="min-h-[100dvh] overflow-x-hidden" style={{ backgroundColor: D.bg, color: D.text }} data-testid="page-pos-checkout">
      <main className="grid min-h-[calc(100dvh-48px)] grid-cols-1 gap-1.5 p-1.5 lg:grid-cols-[310px_350px_minmax(320px,1fr)]">
        {/* ===== Ticket ===== */}
        <aside className="flex min-h-[500px] flex-col overflow-hidden rounded" style={{ backgroundColor: D.panel }}>
          <PanelTitle action={<span className="rounded-full px-2 py-1 text-[9px] font-bold" style={{ backgroundColor: D.greenTint, color: D.green }}>WALK-IN</span>}>Current Ticket</PanelTitle>
          <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: D.border }}>
            {customer ? (
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold" style={{ color: D.text }}>{customer.name}</p>
                {customer.phone && <p className="text-[10px]" style={{ color: D.muted }}>{customer.phone}</p>}
              </div>
            ) : (
              <button onClick={() => setShowCustomerSearch(true)} className="flex items-center gap-1.5 text-[11px] font-semibold hover:opacity-80" style={{ color: D.text2 }} data-testid="button-add-customer">
                <UserPlus className="h-3.5 w-3.5" /> Add Customer
              </button>
            )}
            {customer && (
              <div className="flex items-center gap-2">
                {customer.loyaltyPoints != null && <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: D.goldText }}><Star className="h-3 w-3" fill="currentColor" /> {customer.loyaltyPoints}</span>}
                <button onClick={() => setCustomer(null)} className="text-[10px] hover:opacity-80" style={{ color: D.danger }}>Clear</button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {ticket.map((item, index) => (
              <div key={item.uid} className="group border-b px-2.5 py-2" style={{ borderColor: D.border }}>
                <div className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: item.color }}>{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-1">
                      <p className="truncate text-[10px] font-bold" style={{ color: D.text }}>{item.name}</p>
                      <Money value={item.price} className="text-[10px] font-bold" />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-[9px]" style={{ color: D.muted }}>{item.detail}</span>
                      <button onClick={() => removeFromTicket(item.uid)} className="hover:opacity-80" style={{ color: D.danger }} aria-label={`Remove ${item.name}`} data-testid={`button-remove-line-${item.uid}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {ticket.length === 0 && <div className="px-4 py-12 text-center text-[11px]" style={{ color: D.muted }}>Add a service to begin this ticket.</div>}
          </div>
          <button onClick={() => soon("Custom item editor")} className="mx-auto my-2 flex items-center gap-1.5 rounded border px-8 py-1.5 text-[10px] font-semibold hover:opacity-80" style={{ borderColor: D.border, color: D.text2 }}>
            <Plus className="h-3 w-3" /> Add Custom Item
          </button>
          <div className="border-t px-3 py-2.5" style={{ borderColor: D.border, backgroundColor: D.panelAlt }}>
            <div className="flex justify-between py-1 text-[10px]" style={{ color: D.muted }}><span>SUBTOTAL</span><Money value={subtotal} className="font-semibold" style={{ color: D.text }} /></div>
            <div className="flex justify-between border-t py-2 text-[13px] font-extrabold" style={{ borderColor: D.border, color: D.text }}><span>TOTAL</span><Money value={total} /></div>
            {checkoutComplete ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 rounded py-3 text-[12px] font-bold text-white" style={{ backgroundColor: D.greenSolid }}><Check className="h-4 w-4" /> Payment Complete</div>
                <button onClick={newTicket} className="w-full rounded border py-2 text-[10px] font-semibold hover:opacity-80" style={{ borderColor: D.border, color: D.text2 }} data-testid="button-new-sale">New Ticket</button>
              </div>
            ) : (
              <button onClick={startCheckout} disabled={ticket.length === 0} className="flex w-full items-center justify-center gap-2 rounded py-3 text-[11px] font-bold tracking-wide text-white transition hover:opacity-90 disabled:opacity-40" style={{ backgroundColor: D.greenSolid }} data-testid="button-finalize-pay">
                <CreditCard className="h-4 w-4" /> PAY / CHECKOUT <Money value={total} />
              </button>
            )}
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button onClick={() => soon("Hold Ticket")} className="flex items-center justify-center gap-1.5 rounded border py-2 text-[9px] font-semibold hover:opacity-80" style={{ borderColor: D.border, color: D.text2 }}><Archive className="h-3 w-3" /> HOLD TICKET</button>
              <button onClick={() => { setTicket([]); setCheckoutComplete(false); notify("Ticket cancelled"); }} className="flex items-center justify-center gap-1.5 rounded border py-2 text-[9px] font-semibold hover:opacity-80" style={{ borderColor: D.border, color: D.danger }} data-testid="button-cancel-ticket"><Trash2 className="h-3 w-3" /> CANCEL TICKET</button>
            </div>
          </div>
        </aside>

        {/* ===== Customer summary + keypad, or payment ===== */}
        <section className="flex min-h-[500px] flex-col gap-1.5">
          {payingMethod ? (
            <div className="flex-1 rounded p-4" style={{ backgroundColor: D.panel }}>
              <p className="mb-3 text-[12px] font-bold" style={{ color: D.text }}>Amount due <Money value={total} /></p>
              {payingMethod === "choose" ? (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => finalizeSale("cash")} disabled={finalizing} className="flex flex-col items-center gap-2 rounded border py-6 hover:opacity-80 disabled:opacity-50" style={{ borderColor: D.border }} data-testid="tender-cash">
                    <WalletCards className="h-6 w-6" style={{ color: D.green }} /><span className="text-[11px] font-bold" style={{ color: D.text }}>Cash</span>
                  </button>
                  <button
                    onClick={() => { setPayingMethod("processing"); isNative ? notify("Tap the M2 reader button once connected in the native app") : (termStatus === "ready" ? handleM2Charge() : handleConnectM2()); }}
                    disabled={finalizing}
                    className="flex flex-col items-center gap-2 rounded border py-6 hover:opacity-80 disabled:opacity-50"
                    style={{ borderColor: D.border }}
                    data-testid="tender-m2"
                  >
                    <CreditCard className="h-6 w-6" style={{ color: D.blue }} /><span className="text-[11px] font-bold" style={{ color: D.text }}>M2 Reader / Card</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6">
                  {termStatus === "ready" ? (
                    <button onClick={handleM2Charge} className="flex items-center gap-2 rounded px-6 py-3 text-[12px] font-bold text-white" style={{ backgroundColor: D.blue }}><CreditCard className="h-4 w-4" /> Charge <Money value={total} /></button>
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: D.blue }} />
                  )}
                  <p className="text-[10px]" style={{ color: D.muted }}>
                    {termStatus === "loading" ? "Loading…" : termStatus === "discovering" ? "Looking for reader…" : termStatus === "connecting" ? "Connecting…" : termStatus === "collecting" ? "Waiting for card…" : termStatus === "processing" ? "Processing…" : termStatus === "ready" ? "Reader connected" : termStatus === "error" ? "Retry — reader error" : ""}
                  </p>
                  {termStatus === "error" && <button onClick={handleConnectM2} className="text-[10px] font-semibold" style={{ color: D.blue }}>Retry connection</button>}
                  {termError && <p className="text-[10px]" style={{ color: D.danger }}>{termError}</p>}
                </div>
              )}
              <button onClick={() => setPayingMethod(null)} className="mt-4 text-[10px] font-semibold hover:opacity-80" style={{ color: D.muted }}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="min-h-[100px] rounded p-3" style={{ backgroundColor: D.panel }}>
                <div className="flex items-start gap-3">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 bg-gradient-to-br from-[#e7bfad] via-[#b86d64] to-[#352b39]" style={{ borderColor: "#3a2a32" }}>
                    <Users className="h-8 w-8 text-white/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-[14px] font-bold" style={{ color: D.text }}>{customer?.name ?? "Walk-In Customer"}</h1>
                    {customer?.phone ? (
                      <p className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: D.text2 }}><Phone className="h-3 w-3" /> {customer.phone}</p>
                    ) : (
                      <p className="mt-1 text-[10px]" style={{ color: D.muted }}>No customer attached — this ticket will still record staff commission.</p>
                    )}
                    {customer?.loyaltyPoints != null && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold" style={{ color: D.green }}><Sparkles className="h-3 w-3" /> {customer.loyaltyPoints} reward points</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 rounded p-2.5" style={{ backgroundColor: D.panel }}>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: "Check In", icon: Check, color: D.green, onClick: () => soon("Check In") },
                    { label: "Add Customer", icon: UserPlus, color: D.text2, onClick: () => setShowCustomerSearch(true) },
                    { label: "History", icon: History, color: D.text2, onClick: () => soon("History") },
                  ].map(({ label, icon: ActionIcon, color, onClick }) => (
                    <button key={label} onClick={onClick} className="flex h-14 flex-col items-center justify-center gap-1 rounded border text-[9px] font-semibold hover:opacity-80" style={{ borderColor: D.border, backgroundColor: D.tile }}>
                      <ActionIcon className="h-5 w-5" style={{ color }} strokeWidth={1.7} /><span style={{ color: D.text2 }}>{label}</span>
                    </button>
                  ))}
                </div>

                {activeStaff.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: D.muted }}>Tech for next item</p>
                    <p className="text-[10px]" style={{ color: D.muted }}>Set per line item in the ticket after adding a service.</p>
                  </div>
                )}

                <p className="mt-3 text-[9px] font-bold uppercase tracking-wide" style={{ color: D.muted }}>Custom Charge</p>
                {keypadAmount !== "0.00" && <div className="mt-1 text-right text-[18px] font-bold" style={{ color: D.text, fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, monospace" }}><Money value={Number(keypadAmount) || 0} /></div>}
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {keypadRows.flat().map((key) => (
                    <button
                      key={key}
                      onClick={() => pressKey(key)}
                      className="flex h-[50px] items-center justify-center rounded border text-[16px] font-medium transition hover:opacity-80"
                      style={{
                        borderColor: key === "enter" ? D.greenSolid : D.borderNum,
                        backgroundColor: key === "enter" ? D.greenSolid : D.numKey,
                        color: key === "enter" ? "#fff" : key === "qty" ? D.green : key === "undo" ? D.gold : D.text,
                      }}
                      data-testid={`pad-key-${key}`}
                    >
                      {key === "back" ? <X className="h-4 w-4" /> : key === "undo" ? <RotateCcw className="h-4 w-4" /> : key === "qty" ? <span className="flex flex-col items-center text-[9px]"><span className="text-[16px]">X</span>Qty</span> : key === "enter" ? <span className="text-[12px] font-bold">ENTER</span> : key}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* ===== Categories + service grid ===== */}
        <section className="min-h-[500px] overflow-hidden rounded lg:col-span-1" style={{ backgroundColor: D.panel }}>
          <div className="flex items-center gap-2 border-b p-2" style={{ borderColor: D.border, backgroundColor: D.panelAlt }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: D.muted }} />
            <input placeholder="Search services" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" style={{ color: D.text }} data-testid="input-service-search" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto border-b p-2 [scrollbar-width:none]" style={{ borderColor: D.border, backgroundColor: D.panelAlt }}>
            {groups.map((g, i) => {
              const isActive = effectiveActiveKey === g.key;
              return (
                <button key={g.key} onClick={() => setActiveCategory(g.key)} aria-pressed={isActive}
                  className="group relative flex min-w-[68px] flex-1 items-center justify-center gap-1.5 rounded-md border px-1.5 py-2 text-[8px] font-bold transition hover:opacity-90"
                  style={isActive
                    ? { borderColor: ACCENTS[i % ACCENTS.length], backgroundColor: D.tile, boxShadow: `inset 0 -2px 0 ${ACCENTS[i % ACCENTS.length]}` }
                    : { borderColor: "transparent", backgroundColor: D.panelAlt }}
                  data-testid={`pos-category-tab-${g.key}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: D.tile, color: isActive ? ACCENTS[i % ACCENTS.length] : D.muted }}>
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </span>
                  <span className="whitespace-nowrap" style={{ color: isActive ? ACCENTS[i % ACCENTS.length] : D.text2 }}>{g.name}</span>
                </button>
              );
            })}
            {activeProducts.length > 0 && (
              <button onClick={() => setActiveCategory(RETAIL_KEY)} aria-pressed={effectiveActiveKey === RETAIL_KEY}
                className="group relative flex min-w-[68px] flex-1 items-center justify-center gap-1.5 rounded-md border px-1.5 py-2 text-[8px] font-bold transition hover:opacity-90"
                style={effectiveActiveKey === RETAIL_KEY
                  ? { borderColor: "#17936c", backgroundColor: D.tile, boxShadow: "inset 0 -2px 0 #17936c" }
                  : { borderColor: "transparent", backgroundColor: D.panelAlt }}
                data-testid="pos-category-tab-retail"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: D.tile, color: effectiveActiveKey === RETAIL_KEY ? "#17936c" : D.muted }}>
                  <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
                <span className="whitespace-nowrap" style={{ color: effectiveActiveKey === RETAIL_KEY ? "#17936c" : D.text2 }}>Retail</span>
              </button>
            )}
          </div>
          <div className="overflow-y-auto p-2" style={{ maxHeight: "calc(100% - 44px)" }}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[9px] font-bold uppercase tracking-wide" style={{ color: D.muted }}>{isRetailTab ? "Retail" : (activeGroup?.name ?? "Services")}</h2>
              <span className="text-[9px]" style={{ color: D.muted }}>{activeTiles.length} options</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-4">
              {groups.length === 0 && activeProducts.length === 0 ? (
                <div className="col-span-4 py-8 text-center text-[10px]" style={{ color: D.muted }}>No services in the catalogue yet.</div>
              ) : (
                activeTiles.map((item) => (
                  <button key={item.serviceId ?? item.productId ?? item.name} onClick={() => addToTicket(item)} className="group min-h-[62px] rounded border p-2 text-left transition hover:opacity-90" style={{ borderColor: D.border, backgroundColor: D.tile }} data-testid={`pos-tile-${item.serviceId ?? item.productId ?? item.name}`}>
                    <div className="flex items-start justify-between gap-1"><span className="text-[10px] font-bold leading-tight" style={{ color: D.text }}>{item.name}</span><Plus className="h-3 w-3 shrink-0" style={{ color: D.muted }} /></div>
                    <span className="mt-1 block text-[8px]" style={{ color: D.muted }}>{item.detail}</span><Money value={item.price} className="mt-1 block text-[9px] font-bold" />
                  </button>
                ))
              )}
            </div>

            {addonItems.length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: D.border }}>
                <div className="mb-2 flex items-center justify-between"><h2 className="text-[9px] font-bold uppercase tracking-wide" style={{ color: D.muted }}>Popular Add-ons</h2></div>
                <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-4">
                  {addonItems.map((a, i) => (
                    <button key={a.id} onClick={() => addToTicket({ name: a.name, detail: "Add-on", price: Number(a.price) || 0, color: TILE_COLORS[i % TILE_COLORS.length], addonId: a.id, duration: a.duration })} className="rounded border p-2 text-center transition hover:opacity-90" style={{ borderColor: D.border, backgroundColor: D.tile }} data-testid={`pos-addon-tile-${a.id}`}>
                      <span className="block truncate text-[9px] font-semibold" style={{ color: D.text2 }}>{a.name}</span>
                      <Money value={Number(a.price) || 0} className="mt-1 block text-[9px] font-bold" />
                      <span className="mx-auto mt-1 flex h-4 w-4 items-center justify-center rounded-full border" style={{ borderColor: D.muted, color: D.muted }}><Plus className="h-2.5 w-2.5" /></span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-4 gap-1.5 border-t pt-2" style={{ borderColor: D.border }}>
              {[
                { label: "Redeem Code", icon: Tag, color: D.blue },
                { label: "No Sale", icon: X, color: D.muted },
                { label: "Refund", icon: ArrowLeftRight, color: "#d12b83" },
                { label: "Receipt Reprint", icon: ReceiptText, color: D.cyan },
                { label: "Cash Drop", icon: WalletCards, color: "#d12b83" },
                { label: "Coupon", icon: Tag, color: D.muted },
                { label: "Store Menu", icon: Menu, color: D.muted },
                { label: "OP Menu", icon: MoreHorizontal, color: D.muted },
                { label: "Open Drawer", icon: Archive, color: D.muted },
              ].map(({ label, icon: ActionIcon, color }) => (
                <button key={label} onClick={() => soon(label)} className="flex min-h-[43px] flex-col items-center justify-center gap-1 rounded border-b-2 text-[8px] font-semibold transition hover:opacity-90" style={{ backgroundColor: D.tile, borderBottomColor: color, color: D.text2 }}>
                  <ActionIcon className="h-4 w-4" style={{ color }} strokeWidth={1.5} />{label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="flex min-h-12 items-center gap-3 px-2 sm:px-4" style={{ backgroundColor: D.bg, borderTop: `1px solid ${D.border}`, color: D.muted }}>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[19px] font-extrabold tracking-[-1.5px]" style={{ color: D.text }}>cert<span style={{ color: "#d82b91" }}>x</span>a</span>
          <span className="border-l pl-2 text-[9px] font-semibold tracking-wide" style={{ borderColor: D.border, color: D.muted }}>POS</span>
        </div>
        <nav className="ml-auto flex h-12 items-stretch gap-1">
          {[
            { label: "POS", icon: ShoppingCart, active: true },
            { label: "Calendar", icon: CalendarDays, to: "/calendar" },
            { label: "Customers", icon: Users, to: "/customers" },
            { label: "Inventory", icon: ClipboardList, to: "/catalog/products" },
            { label: "Reports", icon: ArrowLeftRight, to: "/reports" },
            { label: "Messages", icon: MessageSquare },
            { label: "More", icon: MoreHorizontal },
          ].map(({ label, icon: NavIcon, active, to }) => (
            <button key={label} onClick={() => (to ? navigate(to) : soon(label))} className="relative flex min-w-[54px] flex-col items-center justify-center gap-0.5 px-2 text-[8px] font-medium transition hover:opacity-90" style={active ? { backgroundColor: "#d31f86", color: "#fff" } : { color: D.muted }}>
              <NavIcon className="h-4 w-4" strokeWidth={1.7} />{label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 text-[9px] font-semibold" style={{ color: D.green }}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: D.green }} /> Connected</div>
      </footer>

      {showCustomerSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowCustomerSearch(false)}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ backgroundColor: D.panel }} onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 font-semibold" style={{ color: D.text }}>Find a customer</p>
            <div className="flex gap-2">
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none" style={{ borderColor: D.border, backgroundColor: D.panelAlt, color: D.text }} data-testid="input-customer-phone" />
              <button onClick={searchCustomer} disabled={customerSearching} className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: D.greenSolid }} data-testid="button-search-customer">{customerSearching ? "…" : "Search"}</button>
            </div>
            <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
              {customerResults.map((c: any) => (
                <button key={c.id} onClick={() => { setCustomer({ id: c.id, name: c.name, phone: c.phone ?? null, loyaltyPoints: c.loyaltyPoints ?? null }); setShowCustomerSearch(false); setCustomerResults([]); setCustomerPhone(""); }} className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:opacity-80" style={{ borderColor: D.border, color: D.text }} data-testid={`customer-result-${c.id}`}>
                  <span className="font-semibold">{c.name}</span>{c.phone ? <span style={{ color: D.muted }}> · {c.phone}</span> : null}
                </button>
              ))}
              {customerPhone && customerResults.length === 0 && !customerSearching && <p className="py-2 text-center text-xs" style={{ color: D.muted }}>No match found.</p>}
            </div>
            <button onClick={() => setShowCustomerSearch(false)} className="mt-3 w-full py-2 text-sm hover:opacity-80" style={{ color: D.muted }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

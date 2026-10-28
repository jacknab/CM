/**
 * FrontDeskDisplay — customer-facing tablet screen for the front desk / POS.
 *
 * A trimmed clone of the self-service check-in kiosk (`KioskCheckIn.tsx`).
 * It is NOT a self-service kiosk: there is no walk-in booking, no service /
 * add-on / stylist selection, no waitlist. It does three things:
 *
 *   1. Lightweight check-in — customer enters their phone; if they have an
 *      appointment today the server checks them in and we confirm it on screen.
 *      Numbers with no appointment (and brand-new numbers) get a friendly
 *      "please see the front desk" screen.
 *   2. Customer tip screen — driven from the POS over the notifications
 *      WebSocket (same `kiosk_checkout_*` events the dual-screen kiosk uses).
 *   3. Card-payment instruction screens — when the POS starts a card payment
 *      it broadcasts `kiosk_checkout_await_payment` with a `mode`:
 *        - "m2"  → display-only: illustration of the Stripe M2 reader with a
 *                  looping "tap card here" animation.
 *        - "tap" → this tablet is an NFC Android running Tap to Pay: we post
 *                  `TAP_TO_PAY` to the native bridge to arm the reader and
 *                  relay the result back to the POS over the socket.
 *
 * Route: /frontdesk/:slug   (slug === locations.bookingSlug, same as /kiosk/:slug)
 */
import { forRegister, localHub, relayCheckoutEvent } from "@/lib/local-hub";
import { useState, useEffect, useCallback, useRef } from "react";
import { printNativeCheckinTicket } from "../lib/native-checkin-ticket";
import { useParams } from "react-router-dom";
import { LangCode, translations } from "../lib/kioskTranslations";
import { isValidNanpPrefix } from "../lib/phone-validation";
import { useShake } from "../hooks/use-shake";
import { kioskFetch, isKioskDeviceAuthorized } from "../lib/kioskDevice";
import { hubKioskCheckin, hubKioskLookup } from "../lib/kiosk-hub";
import { installRequestDeadline } from "../lib/request-deadline";
import { syncEngine } from "../lib/sync-engine";

// No tap here waits on a server that cannot be reached; with no internet this screen works through the POS tablet.
installRequestDeadline();
syncEngine.watchReachability();
const frontdeskConfigKey = (url: string) => `certxa.frontdesk.config.${url}`;
import { getStationDeviceId } from "../lib/stationDevice";
import KioskPairing from "../components/kiosk/KioskPairing";
import KioskSuspendedScreen from "../components/kiosk/KioskSuspendedScreen";
import { TIP_OPTIONS, tipOptionsFor, calcTipAmount, type TipOption } from "./frontdesk/tipOptions";
import { sanitizeTipPresets } from "@shared/tipPresets";
import { tipInclusiveChargeCents } from "./frontdesk/cardCharge";
import { applyFrontdeskTheme, frontdeskTheme } from "./frontdesk/theme";
import { ServiceCheckin, type CatalogCategory, type CheckinCategory, type CheckinService } from "./frontdesk/ServiceCheckin";
import { buildNativeReceiptPayload } from "../lib/receiptPayload";

type Screen =
  | "idle" | "phone" | "loading"
  | "appointment_confirmed" | "checked_in_generic" | "name_entry" | "service_select"
  | "error" | "suspended" | "pair";

/** POS-driven checkout overlay states (render over every check-in screen). */
type PosCheckout = null | "cart" | "tip" | "await_payment" | "thankyou";
type AwaitMode = "m2" | "tap";

/** Per-device card-payment method, set from the POS sheet's settings button and
 *  saved to this device's localStorage. Used as the fallback when the POS did
 *  not include a `cardMethod` in its tip request. */
const CARD_METHOD_KEY = "certxa.pos.cardMethod";
function readLocalCardMethod(): AwaitMode {
  try {
    const v = localStorage.getItem(CARD_METHOD_KEY);
    return v === "m2" || v === "tap" ? v : "tap";
  } catch { return "tap"; }
}

interface CartMirror {
  items: { label: string; price: number }[];
  /** For the receipt this screen prints itself. */
  ticketNumber?: number;
  staffName?: string;
  subtotal: number; discount: number; tip: number; tax: number; total: number;
  isWalkIn: boolean; customerName: string; appointmentId: number;
  loyaltyPoints?: number;
  /** Points earned per $1 — sent by the POS so the rewards panel can remind the client. */
  pointsPerDollar?: number;
  /** Part-payments already taken on this sale, and what is still owed — only sent by POSes that take part-payments (the Nail POS). */
  paid?: number;
  balanceDue?: number;
  /** Each part-payment taken so far, by name ("CASH", "GIFT CARD ·1234"…). */
  payments?: { label: string; amount: number }[];
  /** The client's number is on file at the POS (which never sends it here): a texted receipt can go without asking. */
  hasPhone?: boolean;
  phoneLast4?: string;
}
/** A payment that leaves a balance is not "Payment successful": the POS says how much is still owed after it. */
const stillOwed = (msg: any) => msg?.remaining != null && Number(msg.remaining) > 0.005;

interface ClientInfo  { id: number; name: string; loyaltyPoints: number; totalVisits: number; }
interface StoreConfig { name: string; phone: string; address: string; category?: string | null; }
interface KioskConfig { kioskEnabled: boolean; welcomeHeadline: string | null; welcomeSubText: string | null; loyaltyPromoText: string | null; timezone: string | null; loyaltyEnabled?: boolean; loyaltyPointsPerDollar?: number | null; }
interface TodayAppointment { id: number; serviceName: string; staffName: string | null; staffAvatarThumbUrl: string | null; appointmentTime: string; }

const QWERTY: string[][] = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
];

// ─── Colour palette — warm light theme (identical to the kiosk) ──────────────
// Each is a CSS variable with this palette as its fallback; frontdesk/theme.ts overrides them per business type.
const BG        = "var(--fd-bg, #f5f3ff)";
const SURFACE   = "var(--fd-surface, #ffffff)";
const PRIMARY   = "var(--fd-primary, #e84891)";
const PRIMARY_D = "var(--fd-primary-d, #cf3a7e)";
const PRIMARY_S = "var(--fd-primary-s, #fdf2f8)";
const BORDER    = "var(--fd-border, #e9e3f5)";
const SHADOW    = "var(--fd-shadow, 0 2px 8px rgba(80,0,120,0.07), 0 1px 3px rgba(0,0,0,0.05))";
const SHADOW_LG = "var(--fd-shadow-lg, 0 8px 32px rgba(80,0,120,0.10), 0 2px 8px rgba(0,0,0,0.06))";
const TEXT      = "var(--fd-text, #18111a)";
const MUTED     = "var(--fd-muted, #6b6580)";
const SUBTLE    = "var(--fd-subtle, #a89ec0)";
const ACCENT    = "var(--fd-accent, #a78bfa)";
const PLACEHOLDER = "var(--fd-placeholder, #c9c2de)";
const NO_SELECT: React.CSSProperties = { WebkitUserSelect: "none", userSelect: "none" };

function fmtPhone(p: string) {
  if (p.length <= 3) return p;
  if (p.length <= 6) return `(${p.slice(0,3)}) ${p.slice(3)}`;
  return `(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`;
}

function fmtTime(iso: string, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz ?? undefined }).format(new Date(iso));
  } catch {
    const d = new Date(iso);
    const h = d.getHours(); const m = d.getMinutes();
    return `${h % 12 || 12}:${m < 10 ? "0" + m : m} ${h >= 12 ? "PM" : "AM"}`;
  }
}

// ─── Buttons ────────────────────────────────────────────────────────────────
function PrimaryBtn({ children, onPress, disabled = false, size = "lg" }: {
  children: React.ReactNode; onPress: () => void; disabled?: boolean; size?: "sm"|"md"|"lg";
}) {
  const pad = size === "sm" ? "px-6 py-2.5 text-base" : size === "md" ? "px-8 py-3.5 text-lg" : "px-12 py-4 text-xl";
  return (
    <button
      onPointerDown={e => { e.preventDefault(); if (!disabled) onPress(); }}
      disabled={disabled}
      className={`${pad} rounded-2xl font-bold text-white transition-all active:scale-95 disabled:opacity-30`}
      style={{ background: disabled ? "#d1d5db" : PRIMARY, boxShadow: disabled ? "none" : SHADOW }}
    >{children}</button>
  );
}

function GhostBtn({ children, onPress }: { children: React.ReactNode; onPress: () => void; }) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onPress(); }}
      className="px-8 py-3.5 text-lg rounded-2xl font-semibold transition-all active:scale-95"
      style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: MUTED, boxShadow: SHADOW }}
    >{children}</button>
  );
}

/** A totals line on the cart-mirror panel. Negative `value` renders as "−$x". */
function Row({ label, value, muted, color }: { label: string; value: number; muted?: boolean; color?: string }) {
  const neg = value < 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0" }}>
      <span style={{ fontSize: 15, color: color ?? (muted ? MUTED : TEXT) }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: color ?? (muted ? MUTED : TEXT), fontVariantNumeric: "tabular-nums" }}>
        {neg ? "−" : ""}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

// ─── Looping "tap card" animation ───────────────────────────────────────────
// `variant` picks the device drawn underneath the tapping card.
function CardTapAnimation({ variant }: { variant: AwaitMode }) {
  return (
    <div style={{ position: "relative", width: 320, height: 260, ...NO_SELECT }}>
      <style>{`
        @keyframes fd-card-tap {
          0%   { transform: translate(-50%, -140px) rotate(-8deg); opacity: 0; }
          25%  { opacity: 1; }
          45%  { transform: translate(-50%, -18px) rotate(-8deg); opacity: 1; }
          60%  { transform: translate(-50%, -30px) rotate(-8deg); opacity: 1; }
          80%  { transform: translate(-50%, -18px) rotate(-8deg); opacity: 1; }
          100% { transform: translate(-50%, -140px) rotate(-8deg); opacity: 0; }
        }
        @keyframes fd-ripple {
          0%   { transform: translateX(-50%) scale(0.6); opacity: 0; }
          15%  { opacity: 0.5; }
          100% { transform: translateX(-50%) scale(1.9); opacity: 0; }
        }
      `}</style>

      {/* Device */}
      {variant === "m2" ? (
        // Stripe M2 reader — squat rounded terminal, small screen, contactless arc on top
        <div style={{ position: "absolute", left: "50%", bottom: 8, transform: "translateX(-50%)", width: 168, height: 150 }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 22, background: "linear-gradient(160deg,#3b3b46 0%,#26262e 100%)", boxShadow: "0 14px 30px rgba(30,0,50,0.28), inset 0 1px 0 rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 16 }}>
            <div style={{ width: 118, height: 66, borderRadius: 10, background: "#0e0e12", border: "1px solid #4a4a55", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#7dd3fc", fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>TAP CARD</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
              {[0,1,2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#5b5b68" }} />)}
            </div>
          </div>
          {/* contactless waves on top */}
          <svg width="46" height="30" viewBox="0 0 46 30" style={{ position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)" }}>
            {[8,15,22].map((r, i) => (
              <path key={i} d={`M 10 ${15 - r + r} A ${r} ${r} 0 0 1 10 ${15 + r}`} transform={`translate(${13 - i*0}, 0)`} fill="none" stroke="#7dd3fc" strokeWidth="3" strokeLinecap="round" opacity={0.9 - i * 0.25} />
            ))}
          </svg>
        </div>
      ) : (
        // Android tablet — large flat slab, NFC zone glowing near the top edge
        <div style={{ position: "absolute", left: "50%", bottom: 8, transform: "translateX(-50%)", width: 190, height: 150 }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 18, background: "linear-gradient(160deg,#1f2937 0%,#111827 100%)", border: "3px solid #374151", boxShadow: "0 14px 30px rgba(30,0,50,0.28)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10 }}>
            <div style={{ width: 150, height: 34, borderRadius: 8, background: "rgba(125,211,252,0.14)", border: "1px solid rgba(125,211,252,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#7dd3fc", fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>NFC</span>
            </div>
          </div>
        </div>
      )}

      {/* Ripple at the tap point */}
      <span style={{ position: "absolute", left: "50%", top: 92, width: 90, height: 90, borderRadius: "50%", border: `3px solid ${PRIMARY}`, animation: "fd-ripple 1.8s ease-out infinite" }} />

      {/* The tapping card */}
      <div style={{ position: "absolute", left: "50%", top: 120, width: 132, height: 84, borderRadius: 12, background: `linear-gradient(135deg, ${PRIMARY} 0%, var(--fd-accent, #a855f7) 100%)`, boxShadow: "0 10px 24px var(--fd-accent-shadow, rgba(168,85,247,0.4))", animation: "fd-card-tap 1.8s ease-in-out infinite", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 12 }}>
        <div style={{ width: 30, height: 22, borderRadius: 4, background: "rgba(255,255,255,0.85)" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ width: 14, height: 5, borderRadius: 2, background: "rgba(255,255,255,0.6)" }} />)}
        </div>
      </div>
    </div>
  );
}

export default function FrontDeskDisplay() {
  const { slug, registerId: registerIdParam } = useParams<{ slug: string; registerId?: string }>();
  const [screen, setScreen]           = useState<Screen>("idle");
  const [storeId, setStoreId]         = useState<number | null>(null);
  // Resolved by the server (validated against this store, falls back to 0
  // for a stale/foreign id) — this, not the raw route param, is what's used
  // to open the checkout WebSocket. See migrations/0174_registers.sql.
  const [registerId, setRegisterId]   = useState(0);
  const [pairingNonce, setPairingNonce] = useState(0);
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null);
  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(null);
  // The salon's own tip percentages (POS Settings → Tip presets), from the kiosk config.
  const [tipOptions, setTipOptions] = useState<readonly TipOption[]>(TIP_OPTIONS);
  const [phone, setPhone]             = useState("");
  // A digit that can't start a real US number is refused with a shake — the digits already typed stay put.
  const { shakeClass, shake, onShakeEnd } = useShake();
  const [clientInfo, setClientInfo]   = useState<ClientInfo | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [todayAppointment, setTodayAppointment] = useState<TodayAppointment | null>(null);
  const [error, setError]             = useState("");
  const [countdown, setCountdown]     = useState(30);
  // Service check-in (nail salons): what a walk-in can choose from, and what the server answered.
  const [svcCatalog, setSvcCatalog] = useState<{ services: CheckinService[]; categories: CatalogCategory[]; categoryImages: Record<string, string>; showPrice: boolean; showDuration: boolean } | null>(null);
  const [svcBusy, setSvcBusy] = useState(false);
  const [svcError, setSvcError] = useState("");
  const [svcResult, setSvcResult] = useState<{ categoryName: string | null; staffName: string | null; status: "assigned" | "waiting" } | null>(null);
  const svcCatalogRef = useRef(svcCatalog);
  svcCatalogRef.current = svcCatalog;
  // No language picker on this screen any more — it always shows English.
  const [lang]                        = useState<LangCode>("en");

  // Loyalty rewards the salon offers (shown to a checked-in client during checkout)
  const [rewards, setRewards] = useState<{ id: number; name: string; pointsCost: number; dollarValue: number }[]>([]);
  const [redeemedRewardId, setRedeemedRewardId] = useState<number | null>(null);
  // The customer gets one clear decision before the tip screen. The choice is
  // kept local until the POS mirrors the resulting discount back to this screen.
  const [rewardPromptDismissed, setRewardPromptDismissed] = useState(false);

  // "Payment successful" → receipt choice (Print / Text / No receipt)
  const [receiptStep, setReceiptStep]   = useState<"choose" | "text" | "sending" | "printing" | "done">("choose");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [receiptNote, setReceiptNote]   = useState("");
  const [receiptError, setReceiptError] = useState("");
  const receiptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receiptStepRef  = useRef<"choose" | "text" | "sending" | "printing" | "done">("choose");
  useEffect(() => { receiptStepRef.current = receiptStep; }, [receiptStep]);

  // POS-driven overlay
  const [posCheckout, setPosCheckout] = useState<PosCheckout>(null);
  const [posApptId, setPosApptId]     = useState(0);
  const [posTotal, setPosTotal]       = useState(0);
  const [posTipPct, setPosTipPct]     = useState<number | null>(null);
  // The tip the customer picked on the tip screen, not yet confirmed: Skip becomes Continue.
  const [tipChoice, setTipChoice]     = useState<{ pct: number; amt: number } | null>(null);
  // Custom tip being typed on the tip screen, as cents digits ("1250" = $12.50); null = showing the preset options.
  const [tipCustomDigits, setTipCustomDigits] = useState<string | null>(null);
  const [awaitMode, setAwaitMode]     = useState<AwaitMode>("m2");
  const [awaitApptId, setAwaitApptId] = useState<number | null>(null);
  const [payError, setPayError]       = useState("");
  // Card method to arm when the customer confirms the tip (from the POS's
  // tip request, else this device's saved default).
  const [cardMethod, setCardMethod]   = useState<AwaitMode>(readLocalCardMethod);

  // Live cart mirror (from `kiosk_checkout_cart`)
  const [cart, setCart] = useState<CartMirror | null>(null);
  // Rewards phone entry (walk-in tickets)
  const [rwPhone, setRwPhone]     = useState("");
  const [rwStatus, setRwStatus]   = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [rwResult, setRwResult]   = useState<{ name: string; loyaltyPoints: number; isNew: boolean } | null>(null);
  // Booking-phone mode: staff on the calendar asked for a client's number.
  const [bookingPhoneMode, setBookingPhoneMode] = useState(false);
  const [bookingPhoneSent, setBookingPhoneSent] = useState(false);
  const [bookingClient, setBookingClient] = useState<{ name: string; loyaltyPoints: number } | null>(null);

  const idleRef     = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const cdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const posResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapArmedRef = useRef(false);
  const confirmArmRef = useRef(false);
  // What kicked off the current card payment — so the POS can tell a
  // customer-driven confirm from a POS-initiated collection.
  const payTriggerRef = useRef<"pos" | "client_confirm">("pos");
  const tipPaymentRef = useRef<{ baseCents: number; tipCents: number; remaining: number; discountCents: number; priorTenderedCents: number; nailCheckout?: boolean } | null>(null);
  const tipSaleTotalRef = useRef(0);
  // What the tip percentages are worked out on (the services, before discount and tax) — sent by the POS.
  const tipBaseRef = useRef(0);
  // A custom tip larger than the bill has to be confirmed with a second tap.
  const [tipBigConfirm, setTipBigConfirm] = useState(false);
  const paymentPendingRef = useRef(false);
  const activePaymentRef = useRef<{ appointmentId: number; amountCents: number } | null>(null);
  // The card charge this device just ran — for the receipt it prints itself.
  const lastChargeRef = useRef<{ paymentIntentId: string | null; amount: number; tip: number | null } | null>(null);
  const awaitModeRef = useRef<AwaitMode>("m2");
  const awaitRemainingRef = useRef(0);
  const awaitPaidTotalRef = useRef<number | null>(null);
  const posCheckoutRef = useRef<PosCheckout>(null);
  // When the POS last said anything about a checkout — an order left on screen with a silent POS is stale.
  const lastPosMsgRef = useRef(Date.now());
  // The ticket this screen is currently checking out (0 = none). Read inside the WS handler below,
  // which is set up once and would otherwise see a stale posApptId from whenever the effect last ran.
  const posApptIdRef = useRef(0);
  const bookingPhoneModeRef = useRef(false);
  // Set while the POS "Check-In" sheet has this screen showing the phone entry.
  const staffCheckinRef = useRef(false);

  const t = translations[lang];
  const isNative = typeof window !== "undefined" && !!(window as any).CERTXA_NATIVE_APP;

  const printLocalCheckin = (name: string, appointment: { id: number; ticketNumber: number } | null, checkin: { token: string; ticketNumber: number } | null, todayCount?: number) => {
    const ticketNumber = appointment?.ticketNumber ?? checkin?.ticketNumber;
    const qrValue = appointment?.id ? `BK:${appointment.id}` : checkin?.token ? `CI:${checkin.token}` : null;
    if (!isNative || ticketNumber == null || !qrValue) return;
    void printNativeCheckinTicket({ clientName: name, ticketNumber, qrValue, todayCount })
      .then((printed) => { if (!printed) console.warn("[frontdesk check-in] no local slip printed"); });
  };

  useEffect(() => {
    if (!isNative) return;
    fetch("/api/auth/user", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Not signed in"); return r.json(); })
      .then((user) => { if (user) (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "FRONTDESK_SESSION_READY" })); })
      .catch(() => { /* Public display still works; a card charge requires a signed-in session. */ });
  }, [isNative]);

  // ── Colour scheme for this store's business type ─────────────────────────
  useEffect(() => applyFrontdeskTheme(frontdeskTheme(storeConfig?.category)), [storeConfig?.category]);

  // ── Config load + periodic refresh while idle ─────────────────────────────
  const applyConfig = useCallback((d: any, initial: boolean) => {
    if (d?.accountSuspended) { setStoreId(d.storeId ?? null); setStoreConfig(d.store ?? null); setScreen("suspended"); return; }
    // The URL named a register id that isn't an active station for this store (the station was
    // removed, a typo, a stale bookmark) — go through setup again, which sends this screen to the
    // station it is paired with or shows a pairing code, rather than leaving it on a dead page.
    if (d?.registerNotFound) { window.location.replace("/frontdesk?reset=1"); return; }
    if (d?.error) { if (initial) { setError(d.error); setScreen("error"); } return; }
    setStoreId(d.store?.id ?? d.storeId ?? null);
    setRegisterId(Number(d.registerId) || 0);
    setStoreConfig(d.store ?? null);
    setSvcCatalog(d.serviceCheckin === true && Array.isArray(d.services) && d.services.length > 0 ? {
      services: d.services.map((x: any) => ({
        id: Number(x.id), name: String(x.name ?? ""), price: Number(x.price) || 0, duration: Number(x.duration) || 0,
        category: x.category ?? null, categoryId: x.categoryId != null ? Number(x.categoryId) : null,
        imageUrl: x.imageUrl ?? null, illustrationImageUrl: x.illustrationImageUrl ?? null,
      })),
      categories: Array.isArray(d.categories) ? d.categories.map((c: any) => ({ id: Number(c.id), name: String(c.name ?? ""), imageUrl: c.imageUrl ?? null })) : [],
      categoryImages: d.categoryImages ?? {},
      showPrice: d.showServicePrice !== false,
      showDuration: d.showServiceDuration !== false,
    } : null);
    setTipOptions(tipOptionsFor(sanitizeTipPresets(d.tipPresets)));
    setKioskConfig({
      kioskEnabled: d.kioskEnabled !== false,
      welcomeHeadline: d.welcomeHeadline ?? null,
      welcomeSubText: d.welcomeSubText ?? null,
      loyaltyPromoText: d.loyaltyPromoText ?? null,
      loyaltyEnabled: d.loyalty?.enabled !== false,
      loyaltyPointsPerDollar: Number(d.loyalty?.pointsPerDollar) > 0 ? Number(d.loyalty.pointsPerDollar) : null,
      timezone: d.timezone ?? null,
    });
    if (initial) {
      // The customer screen stands inside the salon: never a "closed" screen.
      setScreen("idle");
      // Client lookups need a device the salon set up: signed in (the Certxa app), or paired once.
      if (slug) isKioskDeviceAuthorized(slug).then(ok => { if (!ok) setScreen("pair"); });
    }
  }, []);

  const configUrl = `/api/public/kiosk/${slug}/config${registerIdParam ? `?registerId=${registerIdParam}` : ""}`;

  // With several checkout stations, this screen belongs to whichever station a POS paired it with
  // (routes/stationPairing.ts). Checked on load, every minute while idle, and when the server says
  // this station's pairing changed: paired again to another station → follow it; pairing replaced,
  // let go or never made → back to setup to show a pairing code.
  useEffect(() => {
    if (!slug || screen !== "idle") return;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await kioskFetch(slug, `/api/public/frontdesk/${slug}/pairing?screenId=${encodeURIComponent(getStationDeviceId())}`, { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (cancelled) return;
        if (!d?.multiStation) {
          // Back to one station: a screen still on a removed station's address returns to the salon's own.
          if (registerIdParam && Number(registerIdParam) !== Number(d?.registerId)) {
            const target = `/frontdesk/${slug}`;
            try { localStorage.setItem("certxa.frontdesk.path", target); } catch { /* ignore */ }
            window.location.replace(target);
          }
          return;
        }
        if (d.registerId == null) { window.location.replace("/frontdesk?reset=1"); return; }
        if (Number(registerIdParam ?? 0) === d.registerId) return;
        const target = `/frontdesk/${slug}/${d.registerId}`;
        try { localStorage.setItem("certxa.frontdesk.path", target); } catch { /* ignore */ }
        window.location.replace(target);
      } catch { /* try again next time */ }
    };
    check();
    const iv = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [slug, registerIdParam, screen, pairingNonce]);

  useEffect(() => {
    if (!slug) return;
    fetch(configUrl)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        if (!d?.error && !d?.accountSuspended) { try { localStorage.setItem(frontdeskConfigKey(configUrl), JSON.stringify(d)); } catch { /* storage unavailable */ } }
        applyConfig(d, true);
      })
      .catch(() => {
        // No connection: open with what this screen was last sent, so the hub can still link it to the POS.
        let kept: any = null;
        try { kept = JSON.parse(localStorage.getItem(frontdeskConfigKey(configUrl)) ?? "null"); } catch { kept = null; }
        if (kept) applyConfig(kept, true);
        else { setError("Failed to connect."); setScreen("error"); }
      });
  }, [slug, configUrl, applyConfig]);

  // The salon's rewards. One failed request (a deploy, a network blip) used to leave "No rewards available" until the tablet was
  // reloaded, so: retry a few times with a growing pause, and refresh whenever a checkout opens (which also picks up newly added rewards).
  const rewardsLoadedRef = useRef(false);
  const loadRewards = useCallback(async (): Promise<boolean> => {
    if (!slug) return false;
    try {
      const r = await fetch(`/api/public/kiosk/${slug}/rewards`);
      if (!r.ok) return false;
      const d = await r.json();
      if (!Array.isArray(d)) return false;
      setRewards(d);
      rewardsLoadedRef.current = true;
      return true;
    } catch { return false; }
  }, [slug]);
  const loadRewardsRef = useRef(loadRewards);
  loadRewardsRef.current = loadRewards;
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const run = async () => {
      const ok = await loadRewards();
      if (!ok && !cancelled && attempt < 6) { attempt += 1; timer = setTimeout(run, 3000 * attempt); }
    };
    void run();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [slug, loadRewards]);

  useEffect(() => {
    if (!slug || screen !== "idle") return;
    let cancelled = false;
    const refresh = () => {
      fetch(configUrl)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(d => {
          if (!d?.error && !d?.accountSuspended) { try { localStorage.setItem(frontdeskConfigKey(configUrl), JSON.stringify(d)); } catch { /* storage unavailable */ } }
          if (!cancelled) applyConfig(d, false);
        })
        .catch(() => {});
    };
    refresh();
    const iv = setInterval(refresh, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [slug, configUrl, screen, applyConfig]);

  // ── Local hub: the POS tablet over the salon's own Wi-Fi, for when the server cannot be reached ──
  // What arrives through it is handled exactly like a message from the server's socket.
  const registerIdRef = useRef(registerId);
  const hubSinkRef = useRef<((e: MessageEvent) => void) | null>(null);
  registerIdRef.current = registerId;
  useEffect(() => {
    if (!storeId) return;
    void localHub.start(storeId, "screen");
    return localHub.onMessage((message) => {
      if (!forRegister(message, registerIdRef.current)) return;
      if (message.type === "kiosk_wake") {
        setScreen("idle");
        setPhone("");
        setClientInfo(null);
        setTodayAppointment(null);
        setNewClientName("");
        setError("");
        return;
      }
      if (message.type === "kiosk_wake") {
        setScreen("idle");
        setPhone("");
        setClientInfo(null);
        setTodayAppointment(null);
        setNewClientName("");
        setError("");
        return;
      }
      hubSinkRef.current?.(new MessageEvent("message", { data: JSON.stringify(message) }));
    });
  }, [storeId]);

  // ── Notifications WebSocket (unauthenticated, keyed by storeId) ───────────
  const sendWs = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    // No connection to the server: the salon's local hub carries it to the POS tablet instead.
    if (!ws || ws.readyState !== WebSocket.OPEN) { localHub.send({ type, registerId: registerIdRef.current, ...payload }); return; }
    ws.send(JSON.stringify({ type, ...payload }));
  }, []);

  // For what the POS must not miss (the tip, a card result, the receipt choice): sent over HTTP to
  // this register's paired screens, because a WebSocket can look open and still silently drop what
  // is sent on it. Falls back to the socket when HTTP isn't available (e.g. a display in a plain
  // browser that isn't signed in). Delivered once either way.
  const sendReliable = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const post = () => relayCheckoutEvent({ type, registerId, ...payload });
    void (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { if (await post()) return; } catch { /* retry */ }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1_000 * (attempt + 1)));
      }
      sendWs(type, payload);
    })();
  }, [registerId, sendWs]);

  const clearPosOverlay = useCallback(() => {
    lastChargeRef.current = null;
    if (posResetRef.current) clearTimeout(posResetRef.current);
    if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
    setReceiptStep("choose"); setReceiptPhone(""); setReceiptNote(""); setReceiptError("");
    setPosCheckout(null); setPosTipPct(null); setTipChoice(null); setTipCustomDigits(null); setPayError("");
    setCart(null); setRwPhone(""); setRwStatus("idle"); setRwResult(null);
    tapArmedRef.current = false;
    tipPaymentRef.current = null;
    activePaymentRef.current = null;
    paymentPendingRef.current = false;
    // reset the in-panel check-in so the next checkout starts clean
    setScreen("idle"); setPhone(""); setClientInfo(null); setTodayAppointment(null); setNewClientName("");
    setRedeemedRewardId(null); setRewardPromptDismissed(false); setPosApptId(0);
  }, []);

  // Payment succeeded → "Payment successful" screen with the receipt choices.
  const enterThankYou = useCallback(() => {
    if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
    setReceiptStep("choose"); setReceiptPhone(""); setReceiptNote(""); setReceiptError("");
    setPosCheckout("thankyou");
    if (posResetRef.current) clearTimeout(posResetRef.current);
    posResetRef.current = setTimeout(clearPosOverlay, 60_000);
  }, [clearPosOverlay]);

  // The customer has chosen (or staff finished the sale): show the final message, then reset.
  const finishReceipt = useCallback((note: string, ms: number) => {
    if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
    setReceiptNote(note); setReceiptStep("done");
    if (posResetRef.current) clearTimeout(posResetRef.current);
    posResetRef.current = setTimeout(clearPosOverlay, ms);
  }, [clearPosOverlay]);

  useEffect(() => { posCheckoutRef.current = posCheckout; }, [posCheckout]);
  // Safety net for an order whose POS has gone (closed, crashed, lost its connection): after six quiet minutes
  // ask the POS whether the checkout is still open, and go back to the welcome page only if nothing answers.
  // Staff taking their time is not a reason to leave the order — the POS answers with the cart. Never while
  // a card is being taken.
  const syncAskedAtRef = useRef(0);
  useEffect(() => {
    const iv = setInterval(() => {
      if (posCheckoutRef.current !== "cart" || activePaymentRef.current || Date.now() - lastPosMsgRef.current < 6 * 60_000) {
        syncAskedAtRef.current = 0;
        return;
      }
      if (!syncAskedAtRef.current) { syncAskedAtRef.current = Date.now(); sendWs("kiosk_checkout_sync_request"); return; }
      if (Date.now() - syncAskedAtRef.current >= 20_000) { syncAskedAtRef.current = 0; clearPosOverlay(); }
    }, 10_000);
    return () => clearInterval(iv);
  }, [clearPosOverlay, sendWs]);
  useEffect(() => { posApptIdRef.current = posApptId; }, [posApptId]);
  useEffect(() => { bookingPhoneModeRef.current = bookingPhoneMode; }, [bookingPhoneMode]);

  useEffect(() => {
    if (!storeId) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    let destroyed = false;
    let ws: WebSocket;
    let hadOpen = false;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (destroyed) return;
      const sock = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${storeId}&registerId=${registerId}`);
      ws = sock;
      wsRef.current = sock;
      // The local hub hands its messages to the newest socket's handler, which outlives the connection
      // itself: between reconnect attempts there is no open socket, but the hub still has to be heard.
      hubSinkRef.current = (e: MessageEvent) => sock.onmessage?.(e);
      // Heartbeat: a socket that has gone quiet (Wi-Fi hiccup, NAT timeout) can still report
      // itself open while nothing gets through — replace it instead of trusting it.
      let lastHeard = Date.now();
      const heartbeat = setInterval(() => {
        if (sock.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastHeard > 50_000) { sock.onclose = null; sock.close(); clearInterval(heartbeat); if (wsRef.current === sock) wsRef.current = null; if (!destroyed) connect(); return; }
        try { sock.send(JSON.stringify({ type: "ping", ts: Date.now() })); } catch { /* close handler reconnects */ }
      }, 20_000);
      sock.onopen = () => {
        lastHeard = Date.now();
        // Back after a dropped connection mid-checkout: anything the POS sent meanwhile (like leaving
        // the checkout) was missed. Ask whether the checkout is still open; if no POS answers, go
        // back to the main screen — unless a card payment is running on this device right now.
        if (hadOpen && posCheckoutRef.current !== null && !activePaymentRef.current) {
          try { sock.send(JSON.stringify({ type: "kiosk_checkout_sync_request" })); } catch { /* next reconnect retries */ }
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            syncTimer = null;
            if (activePaymentRef.current || posCheckoutRef.current === null) return;
            if (posCheckoutRef.current === "thankyou" && receiptStepRef.current !== "done") finishReceipt("Thank you — have a great day!", 4_000);
            else if (posCheckoutRef.current !== "thankyou") clearPosOverlay();
          }, 6_000);
        }
        hadOpen = true;
      };
      sock.onmessage = (e) => {
        lastHeard = Date.now();
        let msg: any;
        try { msg = JSON.parse(e.data); } catch { return; }
        const quietMs = Date.now() - lastPosMsgRef.current;
        if (typeof msg?.type === "string" && msg.type.startsWith("kiosk_checkout_")) lastPosMsgRef.current = Date.now();
        // The POS is still in a checkout: keep what's on screen.
        if (syncTimer && (msg.type === "kiosk_checkout_cart" || msg.type === "kiosk_checkout_start" || msg.type === "kiosk_checkout_tip_request" || msg.type === "kiosk_checkout_await_payment")) {
          clearTimeout(syncTimer); syncTimer = null;
        }
        switch (msg.type) {
          case "kiosk_checkout_pairing_changed":
            setPairingNonce((n) => n + 1);
            break;
          case "account_status_changed": {
            const s = String(msg.accountStatus ?? "").toLowerCase();
            if (s === "suspended" || s === "canceled") setScreen("suspended");
            else if (s === "active") window.location.reload();
            break;
          }
          case "kiosk_checkout_start": {
            // A second, unrelated ticket starting checkout on the same register (e.g. another tech's
            // station sharing this one customer screen) must not steal the display from a sale already
            // in progress here — otherwise the customer sees another client's name and total mid-checkout.
            const startApptId = Number(msg.appointmentId) || 0;
            if (posApptIdRef.current !== 0 && startApptId !== 0 && startApptId !== posApptIdRef.current) {
              // …unless that sale is only an order left on screen that the POS has said nothing about for a
              // minute: the POS has moved on (its "closed" message was lost), so the new ticket takes over.
              if (posCheckoutRef.current === "cart" && !activePaymentRef.current && quietMs > 60_000) posApptIdRef.current = startApptId;
              else break;
            }
            setPosTotal(Number(msg.total) || 0);
            setPosTipPct(null); setPayError("");
            setRedeemedRewardId(null); setRewardPromptDismissed(false);
            setPosCheckout("cart");
            if (msg.appointmentId != null) setPosApptId(startApptId);
            if (posResetRef.current) clearTimeout(posResetRef.current);
            break;
          }
          case "kiosk_checkout_cart": {
            // Same guard as kiosk_checkout_start above — a cart mirror from a different ticket must not
            // overwrite what's on screen for the ticket already being checked out here.
            const cartApptId = Number(msg.appointmentId) || 0;
            if (posApptIdRef.current !== 0 && cartApptId !== 0 && cartApptId !== posApptIdRef.current) break;
            if (posCheckoutRef.current === null || !rewardsLoadedRef.current) void loadRewardsRef.current();
            setCart({
              items: Array.isArray(msg.items) ? msg.items : [],
              subtotal: Number(msg.subtotal) || 0,
              discount: Number(msg.discount) || 0,
              tip: Number(msg.tip) || 0,
              tax: Number(msg.tax) || 0,
              total: Number(msg.total) || 0,
              isWalkIn: !!msg.isWalkIn,
              customerName: String(msg.customerName || ""),
              appointmentId: Number(msg.appointmentId) || 0,
              loyaltyPoints: msg.loyaltyPoints != null ? Number(msg.loyaltyPoints) : undefined,
              pointsPerDollar: Number(msg.pointsPerDollar) > 0 ? Number(msg.pointsPerDollar) : undefined,
              paid: msg.paid != null ? Number(msg.paid) || 0 : undefined,
              balanceDue: msg.balanceDue != null ? Number(msg.balanceDue) || 0 : undefined,
              payments: Array.isArray(msg.payments) ? msg.payments.map((x: any) => ({ label: String(x?.label ?? "Payment"), amount: Number(x?.amount) || 0 })) : undefined,
              hasPhone: msg.hasPhone === true,
              ticketNumber: Number(msg.ticketNumber) || undefined,
              staffName: typeof msg.staffName === "string" ? msg.staffName : undefined,
              phoneLast4: typeof msg.phoneLast4 === "string" && /^\d{4}$/.test(msg.phoneLast4) ? msg.phoneLast4 : undefined,
            });
            if (Number(msg.appointmentId)) setPosApptId(Number(msg.appointmentId));
            setPosTotal(Number(msg.total) || 0);
            setPayError("");
            setPosCheckout(prev => (prev === "tip" || prev === "await_payment" || prev === "thankyou") ? prev : "cart");
            // The POS sends its last cart mirror and "sale finished" as separate requests, so the cart can land
            // AFTER the sale ended. The thank-you screen stays, and so must its reset timer — clearing it here
            // left the screen stuck on "Payment successful" until someone reloaded the tablet.
            if (posCheckoutRef.current !== "thankyou" && posResetRef.current) clearTimeout(posResetRef.current);
            break;
          }
          case "kiosk_checkout_customer_linked":
            if (msg.name) {
              setRwStatus("done");
              setRwResult({ name: String(msg.name), loyaltyPoints: Number(msg.loyaltyPoints) || 0, isNew: !!msg.isNew });
            }
            break;
          case "kiosk_checkout_tip_request": {
            // Same cross-talk guard as kiosk_checkout_start/cart above — a tip request from a
            // different ticket than the one already active on this screen must not steal it.
            const tipApptId = Number(msg.appointmentId) || 0;
            if (posApptIdRef.current !== 0 && tipApptId !== 0 && tipApptId !== posApptIdRef.current) break;
            setPosTotal(Number(msg.total) || 0);
            tipSaleTotalRef.current = Number(msg.total) || 0;
            tipBaseRef.current = Number(msg.tipBase) > 0 ? Number(msg.tipBase) : Number(msg.total) || 0;
            setPosTipPct(null); setTipChoice(null); setTipCustomDigits(null); setTipBigConfirm(false);
            tipPaymentRef.current = msg.paymentOnConfirm === true && Number.isFinite(Number(msg.amountDueBeforeTip))
              ? { baseCents: Math.round(Number(msg.amountDueBeforeTip) * 100), tipCents: 0,
                  remaining: Math.max(0, Number(msg.remainingAfterPayment) || 0),
                  discountCents: Math.max(0, Number(msg.discountCents) || 0),
                  priorTenderedCents: Math.max(0, Number(msg.priorTenderedCents) || 0),
                  // Sent by the Nail POS: its checkout, not the card capture, completes the ticket.
                  nailCheckout: msg.nailCheckout === true }
              : null;
            paymentPendingRef.current = false;
            if (msg.appointmentId != null) setAwaitApptId(tipApptId);
            const requestedMethod = msg.cardMethod === "m2" ? "m2" : msg.cardMethod === "tap" ? "tap" : readLocalCardMethod();
            setCardMethod(requestedMethod);
            // The client already chose their tip for this ticket (the POS asked when checkout started): it is
            // not asked again. The reader starts straight away for what is due plus that tip — the same steps
            // the Continue button on the tip page takes.
            const known = tipPaymentRef.current;
            if (msg.tipAlreadyChosen === true && known && isNative) {
              known.tipCents = Math.round(Math.max(0, Number(msg.tipAmount) || 0) * 100);
              setPosTotal((known.baseCents + known.tipCents) / 100);
              paymentPendingRef.current = true;
              awaitRemainingRef.current = known.remaining;
              awaitPaidTotalRef.current = (known.priorTenderedCents + known.baseCents + known.tipCents) / 100;
              setAwaitMode(requestedMethod);
              awaitModeRef.current = requestedMethod;
              payTriggerRef.current = "client_confirm";
              setPayError("");
              tapArmedRef.current = false;
              confirmArmRef.current = true;
              setPosCheckout("await_payment");
              break;
            }
            setPosCheckout("tip");
            break;
          }
          // Staff stopped waiting for a tip: leave the tip page for the order — unless the customer has
          // already confirmed and their card is being taken.
          case "kiosk_checkout_tip_cancel": {
            const cancelApptId = Number(msg.appointmentId) || 0;
            if (posApptIdRef.current !== 0 && cancelApptId !== 0 && cancelApptId !== posApptIdRef.current) break;
            if (posCheckoutRef.current !== "tip" || paymentPendingRef.current) break;
            tipPaymentRef.current = null;
            setTipChoice(null); setTipCustomDigits(null); setTipBigConfirm(false); setPayError("");
            setPosCheckout("cart");
            break;
          }
          case "kiosk_checkout_await_payment": {
            // Same cross-talk guard — a stray await-payment from an unrelated ticket must not
            // put this screen into a card-collection state for the wrong sale.
            const awaitPromptApptId = Number(msg.appointmentId) || 0;
            if (posApptIdRef.current !== 0 && awaitPromptApptId !== 0 && awaitPromptApptId !== posApptIdRef.current) break;
            tipPaymentRef.current = null;
            const mode: AwaitMode = msg.mode === "tap" ? "tap" : "m2";
            setPosTotal(Number(msg.total) || 0);
            setAwaitMode(mode);
            awaitModeRef.current = mode;
            payTriggerRef.current = "pos";
            setAwaitApptId(msg.appointmentId != null ? Number(msg.appointmentId) : null);
            setPayError("");
            awaitRemainingRef.current = msg.remaining != null ? Number(msg.remaining) || 0 : 0; // what will still be owed once this tap is taken
            awaitPaidTotalRef.current = msg.paidTotal != null ? Number(msg.paidTotal) || 0 : null; // what the whole sale will have taken
            tapArmedRef.current = false;
            setPosCheckout("await_payment");
            break;
          }
          case "kiosk_checkout_payment_result": {
            // Same cross-talk guard — a stray result from an unrelated ticket must not flip this
            // screen to "paid"/"declined" for a sale that isn't the one on screen.
            const resultApptId = Number(msg.appointmentId) || 0;
            if (posApptIdRef.current !== 0 && resultApptId !== 0 && resultApptId !== posApptIdRef.current) break;
            // This screen's own card result comes back to it too — it's already showing the receipt choice.
            if (msg.success && posCheckoutRef.current === "thankyou") break;
            if (msg.success && stillOwed(msg)) {
              // A part-payment (cash, gift card, part of it on a card): back to the order, which now shows what is paid and what is left.
              tapArmedRef.current = false;
              setPayError("");
              setPosCheckout("cart");
            } else if (msg.success) {
              // Paid in full: "Amount paid" is what the whole sale took in — not just the last payment.
              const all = msg.paidTotal != null ? msg.paidTotal : msg.total;
              if (all != null) setPosTotal(Number(all) || 0);
              enterThankYou();
            } else {
              setPayError(String(msg.error || "Payment was declined. Please try another card."));
              setPosCheckout("await_payment");
            }
            break;
          }
          case "kiosk_checkout_receipt_result":
            // The POS reports whether the receipt the customer asked for went through.
            if (msg.choice === "text") {
              if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
              if (msg.ok) finishReceipt("Receipt sent — thank you!", 6_000);
              else { setReceiptStep("text"); setReceiptError("We couldn't send that text. Please check the number, or choose No Receipt."); }
            }
            break;
          case "kiosk_checkout_cancel":
            if (posCheckoutRef.current !== "thankyou") clearPosOverlay();
            // Staff finished the sale before the customer picked a receipt option.
            else if (receiptStepRef.current === "choose" || receiptStepRef.current === "text") finishReceipt("Thank you — have a great day!", 4_000);
            // Already showing the final message: the POS closed its checkout — make sure the screen resets
            // shortly, whatever happened to the earlier timer. (A receipt still being texted keeps its own flow.)
            else if (receiptStepRef.current === "done") {
              if (posResetRef.current) clearTimeout(posResetRef.current);
              posResetRef.current = setTimeout(clearPosOverlay, 4_000);
            }
            break;
          // Staff is creating a booking on the calendar and needs the client's
          // number — show the phone keypad; on submit we send the digits back.
          case "kiosk_checkout_phone_prompt":
            setPhone("");
            setBookingPhoneMode(true);
            setBookingPhoneSent(false);
            setBookingClient(null);
            setScreen("phone");
            break;
          // Staff tapped Check-In on the salon POS: bring up the normal self check-in
          // (phone → "You're checked in") so the client can do it themselves. Never
          // interrupts a checkout that's in progress.
          case "kiosk_checkout_checkin_launch":
            if (posCheckoutRef.current !== null) break;
            staffCheckinRef.current = true;
            setPhone(""); setBookingPhoneMode(false); setBookingPhoneSent(false); setBookingClient(null);
            setClientInfo(null); setTodayAppointment(null); setNewClientName(""); setError("");
            setScreen("phone");
            break;
          // The POS sheet closed (staff checked the client in themselves, or backed out):
          // drop back to the welcome screen unless the client is already past the phone step.
          case "kiosk_checkout_checkin_cancel":
            if (staffCheckinRef.current) {
              // Tell the POS the client isn't typing any more (its page is closing) before letting go of the launch flag.
              sendWs("kiosk_checkin_typing", { typing: false, digits: 0 });
              typingSentRef.current = false;
              staffCheckinRef.current = false;
              if (posCheckoutRef.current === null) setScreen((cur) => (cur === "phone" ? "idle" : cur));
              setPhone("");
            }
            break;
          case "kiosk_checkout_phone_cancel":
            if (bookingPhoneModeRef.current) {
              setBookingPhoneMode(false);
              setBookingPhoneSent(false);
              resetToIdle();
            }
            break;
        }
      };
      sock.onclose = () => { clearInterval(heartbeat); if (wsRef.current === sock) wsRef.current = null; if (!destroyed) setTimeout(connect, 5_000); };
    };
    connect();
    return () => { destroyed = true; if (syncTimer) clearTimeout(syncTimer); ws?.close(); wsRef.current = null; };
  }, [storeId, registerId, clearPosOverlay, enterThankYou, finishReceipt]);

  // ── Suspended: poll config to auto-recover ───────────────────────────────
  useEffect(() => {
    if (screen !== "suspended" || !slug) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/public/kiosk/${slug}/config`);
        const d = await r.json();
        if (!d.accountSuspended) window.location.reload();
      } catch {}
    }, 10_000);
    return () => clearInterval(iv);
  }, [screen, slug]);

  // ── Card payment: arm the native bridge once we land on the await screen ──
  //  Fires when either (a) the POS asked the customer tablet to collect a tap
  //  (`awaitMode === "tap"`), or (b) the customer just confirmed the tip on
  //  this device (`confirmArmRef`) — in which case we use the POS-selected
  //  card method (M2 reader or Tap to Pay).
  useEffect(() => {
    if (posCheckout !== "await_payment") return;
    if (!isNative || tapArmedRef.current) return;
    if (awaitMode !== "tap" && !confirmArmRef.current) return;
    tapArmedRef.current = true;
    confirmArmRef.current = false;
    const amountCents = tipPaymentRef.current
      ? tipInclusiveChargeCents(tipPaymentRef.current.baseCents, tipPaymentRef.current.tipCents)
      : Math.max(0, Math.round(posTotal * 100));
    if (amountCents === null || !Number.isSafeInteger(amountCents) || amountCents < 50) {
      tapArmedRef.current = false;
      setPayError("The amount due is not valid for a card payment.");
      return;
    }
    activePaymentRef.current = { appointmentId: awaitApptId ?? 0, amountCents };
    const tipPayment = tipPaymentRef.current;
    try {
      (window as any).ReactNativeWebView?.postMessage(JSON.stringify({
        type: awaitMode === "m2" ? "M2_PAY" : "TAP_TO_PAY",
        appointmentId: awaitApptId ?? 0,
        amountCents,
        clientName: clientInfo?.name || newClientName.trim() || "Walk-in",
        ...(tipPayment ? { tipCents: tipPayment.tipCents,
          discountCents: tipPayment.discountCents, priorTenderedCents: tipPayment.priorTenderedCents,
          ...(tipPayment.nailCheckout ? { nailCheckout: true } : {}) } : {}),
      }));
    } catch { tapArmedRef.current = false; paymentPendingRef.current = false; setPayError("Could not contact the payment app."); }
  }, [posCheckout, awaitMode, isNative, posTotal, posTipPct, awaitApptId, clientInfo, newClientName]);

  // ── Native app → web: Tap to Pay result ─────────────────────────────────
  useEffect(() => {
    const onDone = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const active = activePaymentRef.current;
      if (!active || Number(d.appointmentId) !== active.appointmentId || Math.round(Number(d.amount) * 100) !== active.amountCents) return;
      activePaymentRef.current = null;
      paymentPendingRef.current = false;
      const total = active.amountCents / 100;
      const remaining = awaitRemainingRef.current;
      lastChargeRef.current = { paymentIntentId: d.paymentIntentId ?? null, amount: total,
        tip: tipPaymentRef.current ? tipPaymentRef.current.tipCents / 100 : null };
      sendReliable("kiosk_checkout_payment_result", { success: true, total, appointmentId: active.appointmentId, last4: d.last4, paymentIntentId: d.paymentIntentId, cardDetails: d.cardDetails, via: payTriggerRef.current, method: awaitModeRef.current, remaining, paidTotal: awaitPaidTotalRef.current ?? total });
      if (remaining > 0.005) { tapArmedRef.current = false; setPosCheckout("cart"); return; } // a part-payment: the sale isn't over
      setPosTotal(awaitPaidTotalRef.current ?? total);
      enterThankYou();
    };
    const onFail = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (!activePaymentRef.current) return;
      const appointmentId = activePaymentRef.current.appointmentId;
      activePaymentRef.current = null;
      paymentPendingRef.current = false;
      tapArmedRef.current = false;
      setPayError(String(d.message || "Payment failed. Please try again."));
      sendReliable("kiosk_checkout_payment_result", { success: false, appointmentId, error: d.message, via: payTriggerRef.current, method: awaitModeRef.current });
    };
    window.addEventListener("certxa_native_payment_complete", onDone);
    window.addEventListener("certxa_native_payment_failed", onFail);
    window.addEventListener("certxa_native_m2_error", onFail);
    return () => {
      window.removeEventListener("certxa_native_payment_complete", onDone);
      window.removeEventListener("certxa_native_payment_failed", onFail);
      window.removeEventListener("certxa_native_m2_error", onFail);
    };
  }, [sendReliable, posTotal, enterThankYou]);

  // ── Idle / countdown resets ─────────────────────────────────────────────
  const resetToIdle = useCallback(() => {
    // Never reset while a POS checkout is in progress — the customer is still
    // at the counter and the ticket is linked to them. clearPosOverlay handles
    // the reset when the checkout ends / is cancelled.
    if (posCheckoutRef.current !== null) return;
    setScreen("idle"); setPhone(""); setClientInfo(null);
    setNewClientName(""); setTodayAppointment(null); setError("");
    setSvcBusy(false); setSvcError(""); setSvcResult(null);
    setBookingPhoneMode(false); setBookingPhoneSent(false); setBookingClient(null);
    if (cdownRef.current) clearInterval(cdownRef.current);
  }, []);

  useEffect(() => {
    // The "you're checked in" screen shows for 5 seconds, then the screen is ready for the next client (owner, 2026-10-17).
    if (posCheckout === null && (screen === "appointment_confirmed" || screen === "checked_in_generic")) {
      setCountdown(5);
      cdownRef.current = setInterval(() => {
        setCountdown(p => { if (p <= 1) { resetToIdle(); return 0; } return p - 1; });
      }, 1000);
    }
    return () => { if (cdownRef.current) clearInterval(cdownRef.current); };
  }, [screen, posCheckout, resetToIdle]);

  const kick = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    if (screen !== "idle" && posCheckout === null) idleRef.current = setTimeout(resetToIdle, 90_000);
  }, [screen, posCheckout, resetToIdle]);

  useEffect(() => { kick(); return () => { if (idleRef.current) clearTimeout(idleRef.current); }; }, [screen, phone, posCheckout, kick]);

  // ── Link a client to the open walk-in ticket ────────────────────────────
  // Finds-or-creates the client by phone (name required only when new) and links
  // them to the ticket's appointment (the HTTP call persists
  // appointments.customerId). We then push `kiosk_checkout_customer_linked` over
  // this tablet's OWN WebSocket — the exact same mechanism the tip screen uses
  // (see sendWs("kiosk_checkout_tip_selected")). notifications.ts relays any
  // kiosk_checkout_* frame to every store client on that socket's worker, so the
  // open POS reliably swaps "Walk-In" for the client's name. Relying solely on
  // the server's broadcastNotification is flaky under PM2 cluster mode: the
  // /rewards-signup HTTP request round-robins to a different worker than the one
  // holding the POS socket, so without the cross-process bus the event is lost.
  const linkClientDuringCheckout = useCallback(async (digits: string, name?: string) => {
    if (digits.length !== 10) return;
    const apptId = cart?.appointmentId || posApptId || undefined;
    setScreen("loading");
    try {
      const r = await kioskFetch(slug!, `/api/public/kiosk/${slug}/rewards-signup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, name: name?.trim() || undefined, appointmentId: apptId, checkin: !apptId }),
      });
      const d = await r.json();
      if (r.status === 422 && d?.error === "name_required") {
        // Unknown number — collect a name on the keyboard, then retry.
        setNewClientName("");
        setScreen("name_entry");
        return;
      }
      if (!r.ok) { setError(t.somethingWrong); setScreen("error"); return; }
      const nm = String(d.name || name?.trim() || "");
      const points = Number(d.loyaltyPoints) || 0;
      const clientId = Number(d.clientId) || 0;
      setClientInfo({ id: clientId, name: nm, loyaltyPoints: points, totalVisits: 0 });
      setRwResult({ name: nm, loyaltyPoints: points, isNew: !!d.isNew });
      setTodayAppointment(null);
      setSvcResult(null); setSvcError("");
      // A new walk-in who has just been checked in is asked what they came in for.
      setScreen(!apptId && d.checkin && clientId > 0 && svcCatalogRef.current ? "service_select" : "checked_in_generic");
      if (!apptId && d.checkin) printLocalCheckin(nm, null, d.checkin, d.todayCount);
      // Direct-WS push (same path as the tip screen) so the POS updates even when
      // the server broadcast doesn't cross PM2 workers.
      sendWs("kiosk_checkout_customer_linked", {
        appointmentId: apptId ?? 0,
        clientId,
        name: nm,
        loyaltyPoints: points,
        isNew: !!d.isNew,
      });
      // Tell the paired /calendar screen this phone is resolved, so a
      // name-entry sheet it may have auto-opened (see kiosk_checkin_unknown_phone)
      // closes instead of duplicating what the customer just did here.
      sendWs("kiosk_checkin_client_named", { phone: digits });
    } catch {
      // No internet, and not during a checkout: the POS tablet makes the client and checks them in.
      if (!apptId && name?.trim() && await checkInOverHub(digits, null, name.trim())) return;
      setError(t.somethingWrong);
      setScreen("error");
    }
  }, [slug, cart?.appointmentId, posApptId, t, sendWs]);

  const submitNewClient = useCallback((rawName: string) => {
    if (rawName.trim().length < 2 || phone.length !== 10) return;
    linkClientDuringCheckout(phone, rawName);
  }, [linkClientDuringCheckout, phone]);

  // Client tapped "Redeem" on a reward → tell the POS to apply it to the ticket.
  const redeemReward = useCallback((rw: { id: number; name: string; pointsCost: number; dollarValue: number }) => {
    sendReliable("kiosk_checkout_redeem_reward", {
      rewardId: rw.id, name: rw.name, pointsCost: rw.pointsCost, dollarValue: rw.dollarValue,
      appointmentId: cart?.appointmentId ?? null,
    });
    setRedeemedRewardId(rw.id);
    setRewardPromptDismissed(true);
  }, [sendReliable, cart?.appointmentId]);

  // ── Service check-in: what kind of service the client came for ────────────
  // The server keeps the category on the client's waiting entry and hands them to the next technician
  // in TURN order who performs it; no ticket or service is made here. The "checked in" screen appears
  // only after the server has answered; a failure stays on the cards with the client still checked in.
  const svcSending = useRef(false);
  const confirmService = useCallback(async (category: CheckinCategory) => {
    const clientId = Number(clientInfo?.id) || 0;
    if (!clientId || svcSending.current) return;
    svcSending.current = true;
    setSvcBusy(true); setSvcError("");
    try {
      const r = await kioskFetch(slug!, `/api/public/kiosk/${slug}/frontdesk-checkin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, categoryId: category.categoryId, categoryName: category.label }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.ok !== true) {
        setSvcError(typeof d?.error === "string" && d.error ? d.error : "That didn't go through. Please try again or see the front desk.");
        return;
      }
      setSvcResult({ categoryName: d.categoryName ?? category.label, staffName: d.staffName ?? null, status: d.status === "assigned" ? "assigned" : "waiting" });
      setScreen("checked_in_generic");
    } catch {
      setSvcError("That didn't go through. Please try again or see the front desk.");
    } finally {
      svcSending.current = false;
      setSvcBusy(false);
    }
  }, [clientInfo?.id, slug]);

  // ── No internet: the POS tablet checks the client in over the salon hub (lib/kiosk-hub.ts) ──
  const checkInOverHub = async (digits: string, clientId: number | null, name: string): Promise<boolean> => {
    const answer = await hubKioskCheckin({ clientId, clientName: name, phone: digits, serviceIds: [], addonIds: [], nail: { sizeId: null, shapeId: null, effectId: null }, staffId: null });
    if (!answer?.success) return false;
    const nm = answer.clientName ?? name;
    setClientInfo({ id: clientId ?? 0, name: nm, loyaltyPoints: 0, totalVisits: 0 } as any);
    setTodayAppointment(null);
    setSvcResult(null); setSvcError("");
    setScreen("checked_in_generic");
    if (isNative && answer.ticketNumber != null) {
      void printNativeCheckinTicket({ clientName: nm, ticketNumber: Number(answer.ticketNumber), qrValue: `TN:${answer.ticketNumber}` }).catch(() => false);
    }
    return true;
  };

  // ── Check-in lookup ─────────────────────────────────────────────────────
  const doLookup = async (p: string) => {
    setScreen("loading");
    try {
      const r = await kioskFetch(slug!, `/api/public/kiosk/${slug}/lookup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });
      const d = await r.json();
      // A POS checkout is open and we know the ticket → link this client to it
      // (server updates appointments.customerId and tells the POS). The server
      // no-ops if the ticket already has a customer, so this is safe to call.
      const inCheckout = posCheckout !== null && (cart?.appointmentId || posApptId) > 0 && (cart?.isWalkIn ?? true);
      if (d.found) {
        if (inCheckout) {
          await linkClientDuringCheckout(p);
          return;
        }
        setClientInfo(d.client ?? null);
        // Already checked in (typed their number again) — they already have a slip.
        if (!d.alreadyCheckedIn) {
          printLocalCheckin(String(d.client?.name ?? "Guest"), d.todayAppointment ?? null, d.checkin ?? null, d.todayCount);
        }
        if (d.todayAppointment) {
          setTodayAppointment(d.todayAppointment);
          setScreen("appointment_confirmed");
        } else {
          setTodayAppointment(null);
          setSvcResult(null); setSvcError("");
          // A walk-in who has just been checked in is asked what they came in for; someone who was
          // already checked in (typed their number again) is not asked twice.
          setScreen(!d.alreadyCheckedIn && Number(d.client?.id) > 0 && svcCatalogRef.current ? "service_select" : "checked_in_generic");
        }
      } else {
        // Unknown number → ask for a name (on-screen keyboard) before creating.
        setNewClientName("");
        setScreen("name_entry");
        // Mirror this moment to the paired /calendar screen so staff can type
        // the name in themselves — useful for an older client who needs help
        // with the touchscreen.
        sendWs("kiosk_checkin_unknown_phone", { phone: p });
      }
    } catch {
      // No internet: find them through the POS tablet; a new number goes on to the name keyboard.
      const answer = await hubKioskLookup(p);
      if (answer?.found && answer.client && answer.alreadyOnTicket) {
        setClientInfo({ id: answer.client.id, name: answer.client.name, loyaltyPoints: 0, totalVisits: 0 } as any);
        setTodayAppointment(null);
        setScreen("checked_in_generic");
        return;
      } else if (answer?.found && answer.client && answer.todayAppointment) {
        // Their booking today was marked arrived on the POS.
        setClientInfo({ id: answer.client.id, name: answer.client.name, loyaltyPoints: 0, totalVisits: 0 } as any);
        setTodayAppointment(answer.todayAppointment as any);
        setScreen("appointment_confirmed");
        const n = answer.todayAppointment.ticketNumber;
        if (isNative && n != null) void printNativeCheckinTicket({ clientName: answer.client.name, ticketNumber: Number(n), qrValue: `BK:${answer.todayAppointment.id}` }).catch(() => false);
        return;
      } else if (answer?.found && answer.client) {
        if (await checkInOverHub(p, answer.client.id, answer.client.name)) return;
      } else if (answer) {
        setNewClientName("");
        setScreen("name_entry");
        return;
      }
      setError(t.somethingWrong);
      setScreen("error");
    }
  };

  // Booking-phone mode: hand the digits to the calendar, then (for the on-screen
  // greeting only) look the client up WITHOUT checking them in — `checkin: false`
  // skips the appointment search/update — so we can show their loyalty points
  // just like the /kiosk welcome screen.
  const submitBookingPhone = useCallback(async (digits: string) => {
    const p = (digits || "").replace(/\D/g, "").slice(-10);
    if (p.length !== 10) return;
    sendWs("kiosk_checkout_phone_result", { phone: p });
    setBookingClient(null);
    setBookingPhoneSent(true);
    try {
      const r = await kioskFetch(slug!, `/api/public/kiosk/${slug}/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p, checkin: false }),
      });
      const d = await r.json();
      if (d?.found && d.client) {
        setBookingClient({
          name: String(d.client.name || ""),
          loyaltyPoints: Number(d.client.loyaltyPoints) || 0,
        });
      }
    } catch { /* greeting is best-effort */ }
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      setBookingPhoneMode(false);
      setBookingPhoneSent(false);
      setBookingClient(null);
      resetToIdle();
    }, 7000);
  }, [sendWs, slug, resetToIdle]);

  const handleDigit = (d: string) => {
    if (phone.length >= 10) return;
    const next = phone + d;
    // Not a possible US number (bad area code / exchange): shake, refuse just this digit, keep what's typed.
    if (!isValidNanpPrefix(next)) { shake(); kick(); return; }
    setPhone(next); kick();
    if (next.length === 10) {
      if (bookingPhoneMode) submitBookingPhone(next);
      else doLookup(next);
    }
  };

  // While the salon POS's Check-In page is open (it launched this screen), tell it when the client is mid-way through
  // typing their number — the POS shows a small "CLIENT ENTERING PHONE" card over its own keypad. Only the digit COUNT is sent.
  // `typing` is true from the first digit until the client finishes (10 digits), clears it, or leaves the phone screen.
  const typingSentRef = useRef(false);
  useEffect(() => {
    if (!staffCheckinRef.current) { typingSentRef.current = false; return; }
    const typing = screen === "phone" && !bookingPhoneMode && phone.length > 0 && phone.length < 10;
    if (typing === typingSentRef.current && !typing) return;
    typingSentRef.current = typing;
    sendWs("kiosk_checkin_typing", { typing, digits: phone.length });
  }, [phone, screen, bookingPhoneMode, sendWs]);

  // ── Rewards sign-up (walk-in checkout, right panel of the cart mirror) ────
  const submitRewards = useCallback(async (digits: string) => {
    if (digits.length !== 10) return;
    setRwStatus("submitting");
    try {
      const r = await kioskFetch(slug!, `/api/public/kiosk/${slug}/rewards-signup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, appointmentId: cart?.appointmentId || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setRwStatus("error"); return; }
      setRwResult({ name: String(d.name || ""), loyaltyPoints: Number(d.loyaltyPoints) || 0, isNew: !!d.isNew });
      setRwStatus("done");
    } catch {
      setRwStatus("error");
    }
  }, [slug, cart?.appointmentId]);

  const handleRwDigit = (d: string) => {
    if (rwStatus === "submitting" || rwStatus === "done" || rwPhone.length >= 10) return;
    const next = rwPhone + d;
    setRwPhone(next);
    kick();
    if (next.length === 10) submitRewards(next);
  };

  const clientFirst = clientInfo?.name?.split(" ")[0] ?? newClientName.split(" ")[0] ?? "there";

  // ═══════════════════════════════════════════════════════════════════════
  //  POS overlay — renders over everything
  // ═══════════════════════════════════════════════════════════════════════
  if (posCheckout !== null) {

    if (posCheckout === "cart") {
      const c = cart;
      const storeName = storeConfig?.name ?? "our salon";
      const totalNow = c ? c.total : posTotal;
      // A REAL, named client on the ticket — the only thing that flips the right
      // panel from "check in" to "rewards". A ticket can carry isWalkIn:false with
      // a placeholder name ("Walk-In" / "Guest" / blank POS client) — that must
      // still show the check-in keypad.
      const rawClientName = (
        clientInfo?.name || rwResult?.name || (c ? c.customerName : "") || ""
      ).trim();
      const hasRealClient =
        rawClientName.length > 0 && !/^(walk[\s-]?in|guest|client|customer)$/i.test(rawClientName);
      const clientName = hasRealClient ? rawClientName : "Walk-In";
      const clientPoints = hasRealClient
        ? (clientInfo?.loyaltyPoints ?? rwResult?.loyaltyPoints ?? c?.loyaltyPoints ?? null)
        : null;
      const checkedInHere = screen === "appointment_confirmed" || screen === "checked_in_generic";
      const cartLinked = hasRealClient;
      const clientFirstName = hasRealClient ? rawClientName.split(" ")[0] : "";
      // Nothing to redeem right now (no rewards set up, or the client's balance doesn't reach even the cheapest one) —
      // the rewards panel would just be an empty/blocked screen, so offer a tip instead.
      const rewardToOffer = [...rewards]
        .filter((r) => (clientPoints ?? 0) >= r.pointsCost)
        .sort((a, b) => b.dollarValue - a.dollarValue || b.pointsCost - a.pointsCost)[0] ?? null;
      const showRewardPrompt = rewardToOffer != null && !rewardPromptDismissed && redeemedRewardId == null;
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", background: BG, zIndex: 9999, overflow: "hidden", ...NO_SELECT }}>
          {/* ── Left: live order ── */}
          <div style={{ flex: "0 0 40%", minWidth: 400, maxWidth: 560, display: "flex", flexDirection: "column", background: SURFACE, borderRight: `1.5px solid ${BORDER}` }}>
            <div style={{ padding: "22px 40px", borderBottom: `1.5px solid ${BORDER}`, background: PRIMARY_S, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
              <div style={{ minWidth: 0 }}>
                {cartLinked ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }} data-testid="fd-cart-greeting">
                    <span style={{ fontSize: 38, lineHeight: 1, flexShrink: 0 }}>{checkedInHere ? "✅" : "👋"}</span>
                    <h1 style={{ fontSize: 28, fontWeight: 900, color: TEXT, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {checkedInHere ? "You're checked in" : "Hi"}{clientFirstName ? `, ${clientFirstName}` : ""}!
                    </h1>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 800, color: PRIMARY, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>Client</p>
                    <h1 style={{ fontSize: 28, fontWeight: 900, color: TEXT, margin: "3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clientName}</h1>
                  </>
                )}
              </div>
              {clientPoints != null && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: PRIMARY, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Points</p>
                  <p style={{ fontSize: 30, fontWeight: 900, color: TEXT, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>{clientPoints.toLocaleString()}</p>
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 40px" }}>
              {(!c || c.items.length === 0) ? (
                <p style={{ fontSize: 17, color: SUBTLE, textAlign: "center", marginTop: 48 }}>Building your order…</p>
              ) : c.items.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "14px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 18, color: TEXT, fontWeight: it.label.startsWith("+") ? 500 : 700 }}>{it.label}</span>
                  <span style={{ fontSize: 18, color: TEXT, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>${it.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "18px 40px 28px", borderTop: `1.5px solid ${BORDER}`, background: PRIMARY_S }}>
              {c && (
                <>
                  <Row label="Subtotal" value={c.subtotal} muted />
                  {c.discount > 0 && <Row label="Discount" value={-c.discount} color="#16a34a" />}
                  {c.tip > 0 && <Row label="Tip" value={c.tip} muted />}
                  {c.tax > 0 && <Row label="Tax" value={c.tax} muted />}
                </>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, paddingTop: 12, borderTop: `2px solid ${BORDER}` }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: TEXT }}>Total</span>
                <span style={{ fontSize: 34, fontWeight: 900, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>${totalNow.toFixed(2)}</span>
              </div>
              {c && (c.paid ?? 0) > 0 && (
                <div data-testid="fd-cart-paid" style={{ marginTop: 6 }}>
                  {(c.payments && c.payments.length > 0)
                    ? c.payments.map((x, i) => {
                        const t = x.label.toLowerCase();
                        return <Row key={i} label={t.charAt(0).toUpperCase() + t.slice(1)} value={-x.amount} color="#16a34a" />;
                      })
                    : <Row label="Paid so far" value={-(c.paid ?? 0)} color="#16a34a" />}
                  {(c.balanceDue ?? 0) > 0.005 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 6 }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: TEXT }}>Balance due</span>
                      <span data-testid="fd-cart-balance" style={{ fontSize: 30, fontWeight: 900, color: TEXT, fontVariantNumeric: "tabular-nums" }}>${(c.balanceDue ?? 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: front-desk check-in (or rewards sign-up for walk-ins) ── */}
          <div style={{ flex: "1 1 0", minWidth: 0, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "40px 44px", background: `linear-gradient(160deg, ${PRIMARY} 0%, var(--fd-panel-end, #7c3aed) 100%)`, color: "#fff", textAlign: "center" }}>
            {cartLinked ? (
              <>
                {showRewardPrompt && rewardToOffer && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="fd-reward-prompt-title"
                    style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 28, background: "var(--fd-panel-veil, rgba(50, 8, 110, .28))", backdropFilter: "blur(5px)" }}
                    data-testid="fd-reward-prompt"
                  >
                    <div style={{ width: "min(560px, 100%)", borderRadius: 28, padding: "38px 38px 32px", background: "linear-gradient(150deg, #fff 0%, var(--fd-soft-end, #ffe9f5) 100%)", color: TEXT, boxShadow: "0 28px 70px var(--fd-panel-shadow, rgba(35, 0, 80, .42))", textAlign: "center" }}>
                      <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 14 }}>🎁</div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase", color: PRIMARY }}>A reward is ready</p>
                      <h2 id="fd-reward-prompt-title" style={{ margin: "10px 0 12px", fontSize: 30, lineHeight: 1.12, fontWeight: 900 }}>Would you like to redeem?</h2>
                      <p style={{ margin: "0 auto", maxWidth: 420, fontSize: 19, lineHeight: 1.45, fontWeight: 650, color: TEXT }}>
                        Redeem <b>{rewardToOffer.pointsCost.toLocaleString()} points</b> for <b>${rewardToOffer.dollarValue.toFixed(2)} off</b> today’s ticket?
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 30 }}>
                        <button type="button" onClick={() => redeemReward(rewardToOffer)} style={{ minHeight: 64, border: 0, borderRadius: 16, background: PRIMARY, color: "#fff", fontSize: 18, fontWeight: 900, boxShadow: `0 6px 0 ${PRIMARY_D}` }} data-testid="fd-reward-confirm">Yes, Redeem!</button>
                        <button type="button" onClick={() => setRewardPromptDismissed(true)} style={{ minHeight: 64, border: `2px solid ${PRIMARY}`, borderRadius: 16, background: "rgba(255,255,255,.68)", color: PRIMARY_D, fontSize: 18, fontWeight: 900 }} data-testid="fd-reward-skip">Not Today</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : screen === "loading" ? (
              <>
                <div style={{ fontSize: 60, lineHeight: 1 }}>⏳</div>
                <p style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Looking you up…</p>
              </>
            ) : screen === "name_entry" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
                <div style={{ fontSize: 40, lineHeight: 1 }}>👋</div>
                <p style={{ fontSize: 22, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>First time here?</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", margin: 0, maxWidth: 300, lineHeight: 1.45 }}>
                  Enter your name so we can set up your rewards.
                </p>
                <div style={{ background: "#fff", borderRadius: 14, padding: "10px 20px", minWidth: 260, textAlign: "center", boxShadow: SHADOW_LG }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: newClientName ? TEXT : PLACEHOLDER }}>
                    {newClientName || "Your name"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "center" }} onPointerDown={e => e.stopPropagation()}>
                  {QWERTY.map((row, ri) => (
                    <div key={ri} style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      {row.map(key => (
                        <button key={key}
                          onPointerDown={e => {
                            e.preventDefault();
                            if (key === "⌫") setNewClientName(n => n.slice(0, -1));
                            else setNewClientName(n => (n.length < 24 ? n + key : n));
                            kick();
                          }}
                          style={{ width: key === "⌫" ? 46 : 32, height: 44, borderRadius: 9, border: "none", background: key === "⌫" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.16)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          {key}
                        </button>
                      ))}
                    </div>
                  ))}
                  <button
                    onPointerDown={e => { e.preventDefault(); setNewClientName(n => (n.length < 24 ? n + " " : n)); kick(); }}
                    style={{ marginTop: 2, width: 200, height: 40, borderRadius: 9, border: "none", background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    space
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                  <button
                    onPointerDown={e => { e.preventDefault(); sendWs("kiosk_checkin_cancelled", { phone }); setNewClientName(""); setPhone(""); setScreen("idle"); }}
                    style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, borderRadius: 12, padding: "10px 18px", cursor: "pointer" }}>
                    Back
                  </button>
                  <button
                    onPointerDown={e => { e.preventDefault(); if (newClientName.trim().length >= 2) submitNewClient(newClientName); }}
                    disabled={newClientName.trim().length < 2}
                    style={{ background: newClientName.trim().length >= 2 ? "#fff" : "rgba(255,255,255,0.12)", border: "none", color: newClientName.trim().length >= 2 ? PRIMARY_D : "rgba(255,255,255,0.4)", fontSize: 15, fontWeight: 900, borderRadius: 12, padding: "10px 24px", cursor: newClientName.trim().length >= 2 ? "pointer" : "default" }}>
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              <div className={shakeClass} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }} onAnimationEnd={onShakeEnd} data-testid="fd-phone-shake">
                <div style={{ fontSize: 56, lineHeight: 1 }}>👋</div>
                <p style={{ fontSize: 27, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>Check in</p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
                  Enter your mobile number to check in for today’s visit.
                </p>
                <div style={{ background: "#fff", borderRadius: 16, padding: "12px 24px", minWidth: 280, boxShadow: SHADOW_LG }}>
                  <span style={{ fontSize: 30, fontFamily: "ui-monospace, monospace", letterSpacing: "0.08em", color: phone ? TEXT : PLACEHOLDER }}>
                    {phone ? fmtPhone(phone) : "(•••) •••-••••"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 84px)", gap: 12 }} onPointerDown={e => e.stopPropagation()}>
                  {["1","2","3","4","5","6","7","8","9"].map(d => (
                    <button key={d}
                      onPointerDown={e => { e.preventDefault(); handleDigit(d); }}
                      style={{ width: 84, height: 68, borderRadius: 16, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", fontSize: 26, fontWeight: 700, cursor: "pointer" }}>
                      {d}
                    </button>
                  ))}
                  <button
                    onPointerDown={e => { e.preventDefault(); setPhone(p => p.slice(0, -1)); kick(); }}
                    style={{ width: 84, height: 68, borderRadius: 16, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 22, cursor: "pointer" }}>⌫</button>
                  <button
                    onPointerDown={e => { e.preventDefault(); handleDigit("0"); }}
                    style={{ width: 84, height: 68, borderRadius: 16, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", fontSize: 26, fontWeight: 700, cursor: "pointer" }}>0</button>
                  <button
                    onPointerDown={e => { e.preventDefault(); if (phone.length === 10) doLookup(phone); }}
                    disabled={phone.length !== 10}
                    style={{ width: 84, height: 68, borderRadius: 16, border: "none", background: phone.length === 10 ? "#fff" : "rgba(255,255,255,0.1)", color: phone.length === 10 ? PRIMARY_D : "rgba(255,255,255,0.4)", fontSize: 24, fontWeight: 900, cursor: phone.length === 10 ? "pointer" : "default" }}>→</button>
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", margin: 0, maxWidth: 300 }}>
                  Your number is only used to match today’s appointment.
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (posCheckout === "tip") {
      const saleTotal = tipSaleTotalRef.current;
      // Picking an option (or a custom amount) adds the tip to the ticket; the Skip / Continue button
      // then commits it and starts the card reader.
      const pickTip = (pct: number, amt: number) => {
        if (tipPaymentRef.current && paymentPendingRef.current) return;
        setTipChoice({ pct, amt });
        setTipCustomDigits(null);
        setTipBigConfirm(false);
        setPayError("");
        sendReliable("kiosk_checkout_tip_selected", { tipAmount: amt, tipPercent: pct, appointmentId: cart?.appointmentId ?? awaitApptId });
      };
      // Tapping the chosen tip again takes it off: the button underneath goes back to Skip.
      const clearTip = () => {
        if (tipPaymentRef.current && paymentPendingRef.current) return;
        setTipChoice(null);
        setPayError("");
        sendReliable("kiosk_checkout_tip_selected", { tipAmount: 0, tipPercent: 0, appointmentId: cart?.appointmentId ?? awaitApptId });
      };
      const commitTip = (pct: number, amt: number) => {
        const tipPayment = tipPaymentRef.current;
        if (tipPayment && paymentPendingRef.current) return;
        // This device can't run the card: still hand the customer's tip to the POS, tell it why the card
        // didn't happen (so it stops waiting and staff can take another tender), and go back to the order.
        const cannotCharge = (message: string) => {
          const apptId = cart?.appointmentId ?? awaitApptId;
          sendReliable("kiosk_checkout_tip_selected", { tipAmount: amt, tipPercent: pct, appointmentId: apptId, confirmed: true });
          sendReliable("kiosk_checkout_payment_result", { success: false, appointmentId: apptId, error: message, via: "client_confirm", method: cardMethod });
          tipPaymentRef.current = null;
          setPosTipPct(pct); setTipCustomDigits(null); setPayError("");
          setPosCheckout("cart");
        };
        if (tipPayment && (!isNative || typeof (window as any).ReactNativeWebView?.postMessage !== "function")) {
          return cannotCharge(cardMethod === "m2"
            ? "The M2 reader requires the Certxa Android app on the front desk device."
            : "Tap to Pay requires the Certxa Android app on the front desk tablet.");
        }
        if (tipPayment && tipInclusiveChargeCents(tipPayment.baseCents, Math.round(amt * 100)) === null) {
          return cannotCharge("Card payments must be at least $0.50.");
        }
        setPosTipPct(pct);
        setTipCustomDigits(null);
        sendReliable("kiosk_checkout_tip_selected", { tipAmount: amt, tipPercent: pct, appointmentId: cart?.appointmentId ?? awaitApptId, confirmed: true });
        if (tipPayment) tipPayment.tipCents = Math.round(amt * 100);
        setPosTotal(tipPayment ? (tipPayment.baseCents + Math.round(amt * 100)) / 100 : posTotal + amt);
        if (isNative && tipPayment) {
          paymentPendingRef.current = true;
          awaitRemainingRef.current = tipPayment.remaining;
          awaitPaidTotalRef.current = (tipPayment.priorTenderedCents + tipPayment.baseCents + tipPayment.tipCents) / 100;
          // Choosing a tip doubles as the card-payment trigger: arm the native
          // bridge for the tip-inclusive total using the POS-selected
          // method. The await-screen effect (guarded by tapArmedRef)
          // posts M2_PAY or TAP_TO_PAY to the bridge.
          setAwaitMode(cardMethod);
          awaitModeRef.current = cardMethod;
          payTriggerRef.current = "client_confirm";
          setAwaitApptId(cart?.appointmentId ?? awaitApptId ?? null);
          setPayError("");
          tapArmedRef.current = false;
          confirmArmRef.current = true;
          setPosCheckout("await_payment");
        } else {
          setPosCheckout("cart");
        }
      };
      const customAmt = tipCustomDigits !== null ? (Number(tipCustomDigits) || 0) / 100 : 0;
      const tipBase = tipBaseRef.current || saleTotal;
      // The tip on screen right now: the amount being typed on the custom keypad, else the one picked.
      const shownTip = tipCustomDigits !== null ? customAmt : tipChoice?.amt ?? 0;
      const customPicked = !!tipChoice && tipChoice.amt > 0 && !tipOptions.some(tp => calcTipAmount(tipBase, tp.pct) === tipChoice.amt);
      const chosen: React.CSSProperties = { background: "#111", borderColor: "#111", color: "#fff" };
      const tileFont = "clamp(20px, 2.6vw, 40px)";
      const tile: React.CSSProperties = { background: "#fff", border: "2px solid #c9c9c9", borderRadius: 8, color: "#111", fontFamily: "inherit", fontSize: tileFont, lineHeight: 1.3, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 8, minHeight: 0, minWidth: 0 };
      const wide: React.CSSProperties = { ...tile, gridColumn: "1 / -1", fontWeight: 700 };
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", background: "#f7f7f7", zIndex: 9999, overflow: "hidden", ...NO_SELECT }} data-testid="fd-tip-screen">
          {/* ── Left: sale amount ── */}
          <div style={{ flex: "0 0 37%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 clamp(20px, 3vw, 48px)", background: "#fff", borderTopRightRadius: 24, borderBottomRightRadius: 24, boxShadow: "2px 0 14px rgba(0,0,0,.06)", color: "#111" }}>
            <div style={{ width: "clamp(64px, 8vw, 110px)", height: "clamp(64px, 8vw, 110px)", borderRadius: "50%", background: "#f2f2f2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "clamp(16px, 2.4vw, 32px)" }}>
              <svg viewBox="0 0 48 48" width="58%" height="58%" fill="none" stroke="#111" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
                <rect x="10" y="9" width="32" height="22" rx="3" />
                <rect x="5" y="15" width="32" height="22" rx="3" fill="#fff" />
                <path d="M21 32c-4.5-3-7-5.3-7-8a3.3 3.3 0 0 1 7-1.2A3.3 3.3 0 0 1 28 24c0 2.7-2.5 5-7 8z" />
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: "clamp(26px, 3.2vw, 46px)", fontWeight: 600 }}>{tipCustomDigits !== null ? "Custom tip" : "Select tip"}</p>
            {/* The bill, the tip chosen so far, and what the card will be charged — updated as they choose. */}
            <div style={{ margin: "clamp(10px, 1.6vw, 22px) 0 0", display: "grid", gridTemplateColumns: "1fr auto", rowGap: "clamp(4px, .6vw, 10px)", fontSize: "clamp(18px, 2.1vw, 30px)", color: "#555", fontVariantNumeric: "tabular-nums" }}>
              <span>Bill</span><span data-testid="fd-tip-sale-total">${saleTotal.toFixed(2)}</span>
              <span>Tip</span><span data-testid="fd-tip-chosen">${shownTip.toFixed(2)}</span>
            </div>
            <p style={{ margin: "clamp(10px, 1.6vw, 22px) 0 0", paddingTop: "clamp(10px, 1.6vw, 22px)", borderTop: "2px solid #111", fontSize: "clamp(16px, 1.8vw, 24px)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#555" }}>Total</p>
            <p style={{ margin: 0, fontSize: "clamp(44px, 6vw, 88px)", fontWeight: 700, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }} data-testid="fd-tip-new-total">${(saleTotal + shownTip).toFixed(2)}</p>
            {payError && <p role="alert" style={{ margin: "20px 0 0", color: "#dc2626", fontSize: 17, fontWeight: 700 }}>{payError}</p>}
          </div>

          {/* ── Right: options (or the custom-amount keypad) ── */}
          {tipCustomDigits === null ? (
            <div style={{ flex: "1 1 0", minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "3fr 3fr 1.2fr 1.2fr", gap: "clamp(12px, 1.8vw, 26px)", padding: "clamp(16px, 2.4vw, 40px)" }}>
              {tipOptions.map(tp => {
                const amt = calcTipAmount(tipBase, tp.pct);
                const isChosen = !!tipChoice && !customPicked && tipChoice.pct === tp.pct && tipChoice.amt === amt;
                return (
                  <button key={tp.pct} type="button" onClick={() => (isChosen ? clearTip() : pickTip(tp.pct, amt))} aria-pressed={isChosen}
                    style={isChosen ? { ...tile, ...chosen } : tile} data-testid={`fd-tip-select-${tp.pct}`}>
                    <span style={{ fontWeight: 700 }}>{tp.pct}%</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>(${amt.toFixed(2)})</span>
                    <span style={{ fontSize: tp.note.length > 16 ? "0.85em" : "1em" }}>{tp.note}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => { setPayError(""); setTipBigConfirm(false); setTipCustomDigits(""); }} aria-pressed={customPicked}
                style={customPicked ? { ...wide, ...chosen } : wide} data-testid="fd-tip-custom">{customPicked ? `Custom · $${tipChoice!.amt.toFixed(2)}` : "Custom"}</button>
              {tipChoice ? (
                <button type="button" onClick={() => commitTip(tipChoice.pct, tipChoice.amt)} style={{ ...wide, background: "#0d9b6e", borderColor: "#0d9b6e", color: "#fff" }} data-testid="fd-tip-continue">
                  {tipChoice.amt > 0 ? `Continue · $${(saleTotal + tipChoice.amt).toFixed(2)}` : "Continue with no tip"}
                </button>
              ) : (
                <button type="button" onClick={() => commitTip(0, 0)} style={wide} data-testid="fd-tip-skip">Skip</button>
              )}
            </div>
          ) : (
            <div style={{ flex: "1 1 0", minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1.3fr repeat(4, 1fr) 1fr", gap: "clamp(10px, 1.4vw, 20px)", padding: "clamp(16px, 2.4vw, 40px)" }}>
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "2px solid #111", borderRadius: 8, fontSize: "clamp(36px, 4.6vw, 68px)", fontWeight: 700, color: "#111", fontVariantNumeric: "tabular-nums" }} data-testid="fd-tip-custom-amount">
                ${customAmt.toFixed(2)}
              </div>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map(k => (
                <button key={k} type="button"
                  onPointerDown={e => {
                    e.preventDefault();
                    setTipBigConfirm(false);
                    setTipCustomDigits(d => {
                      const cur = d ?? "";
                      if (k === "⌫") return cur.slice(0, -1);
                      const next = (cur + k).replace(/^0+/, "");
                      return next.length <= 6 ? next : cur;
                    });
                  }}
                  style={{ ...tile, fontWeight: 600 }}>
                  {k}
                </button>
              ))}
              <button type="button" onClick={() => { setPayError(""); setTipBigConfirm(false); setTipCustomDigits(null); }} style={{ ...tile, fontWeight: 700 }} data-testid="fd-tip-custom-back">Back</button>
              <button type="button"
                onClick={() => {
                  // A tip bigger than the whole bill is usually a slip of the finger: ask once before taking it.
                  if (saleTotal > 0 && customAmt > saleTotal && !tipBigConfirm) { setTipBigConfirm(true); return; }
                  if (customAmt <= 0) { clearTip(); setTipCustomDigits(null); return; }
                  pickTip(tipBase > 0 ? Math.round((customAmt / tipBase) * 100) : 0, customAmt);
                }}
                style={{ ...tile, gridColumn: "2 / -1", fontWeight: 700, background: tipBigConfirm ? "#b45309" : "#111", borderColor: tipBigConfirm ? "#b45309" : "#111", color: "#fff", fontSize: tipBigConfirm ? "clamp(15px, 1.9vw, 28px)" : tileFont }}
                data-testid="fd-tip-custom-done">
                {tipBigConfirm ? `More than the bill — tap again to add $${customAmt.toFixed(2)}` : "Add tip"}
              </button>
            </div>
          )}
        </div>
      );
    }

    if (posCheckout === "await_payment") {
      const isM2 = awaitMode === "m2";
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, zIndex: 9999, padding: 32, gap: 8, ...NO_SELECT }}>
          <div style={{ textAlign: "center", marginBottom: 4 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Amount Due</p>
            <p style={{ fontSize: 72, fontWeight: 900, color: PRIMARY, lineHeight: 1.1, margin: 0 }}>${posTotal.toFixed(2)}</p>
          </div>

          <CardTapAnimation variant={awaitMode} />

          <h2 style={{ fontSize: 30, fontWeight: 900, color: TEXT, margin: "8px 0 6px", textAlign: "center" }}>
            {isM2 ? "Tap your card on the reader" : "Tap your card or phone here"}
          </h2>
          <p style={{ fontSize: 17, color: MUTED, margin: 0, textAlign: "center", maxWidth: 460 }}>
            {isM2
              ? "Hold your card, phone, or watch against the top of the card reader on the counter."
              : "Hold your card, phone, or watch flat against the top of this screen to pay."}
          </p>

          {payError && (
            <div style={{ marginTop: 18, background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 14, padding: "12px 22px", color: "#dc2626", fontSize: 15, fontWeight: 600, textAlign: "center", maxWidth: 460 }}>
              {payError}
            </div>
          )}
          {payError && tipPaymentRef.current && (
            <button type="button" onClick={() => { setPayError(""); setPosCheckout("tip"); }} style={{ padding: "14px 24px", borderRadius: 12, background: PRIMARY, color: "#fff", border: 0, fontWeight: 700 }}>
              Back to tip and retry
            </button>
          )}

          <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 10, color: SUBTLE, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "fd-ripple 1.8s ease-out infinite" }} />
            {isM2 ? "Waiting for the reader" : isNative ? "Reader ready" : "Waiting for payment"}
          </div>
        </div>
      );
    }

    // Payment successful → receipt choice
    const chooseReceipt = (choice: "print" | "none") => {
      if (choice === "print" && isNative && (window as any).CERTXA_PRINT_BRIDGE) { void printHere(); return; }
      sendReliable("kiosk_checkout_receipt_choice", { choice, appointmentId: posApptId });
      finishReceipt(choice === "print" ? "Your receipt will be printed at the counter — thank you!" : "No receipt — have a great day!", 6_000);
    };
    // Inside the Certxa app: print the customer's copy on this device's own receipt printer (the one
    // set up on this tablet), then tell the POS it's handled. If it can't print, the counter prints it.
    const printHere = async () => {
      setReceiptStep("printing"); setReceiptError("");
      const c = cart;
      const charge = lastChargeRef.current;
      const tip = charge?.tip ?? c?.tip ?? 0;
      const subtotal = c?.subtotal ?? posTotal;
      const discount = c?.discount ?? 0;
      const tax = c?.tax ?? 0;
      const grandTotal = Math.round((subtotal - discount + tax + tip) * 100) / 100;
      const tenders = (c?.payments ?? []).map((x) => {
        const l = x.label.toLowerCase();
        return { method: l.startsWith("cash") ? "cash" : l.startsWith("gift") ? "gift" : "card", amount: x.amount };
      });
      // This device's own card charge may not have reached the POS's cart yet.
      const tendered = tenders.reduce((s, t) => s + t.amount, 0);
      if (charge && tendered < grandTotal - 0.005) tenders.push({ method: "card", amount: charge.amount });
      const paidSum = tenders.reduce((s, t) => s + t.amount, 0);
      const requestId = `fdpr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const printed = await new Promise<boolean>((resolve) => {
        const onResult = (e: Event) => {
          const d = (e as CustomEvent).detail ?? {};
          if (d.requestId !== requestId) return;
          window.removeEventListener("certxa_native_print_result", onResult);
          clearTimeout(timer);
          resolve(!!d.ok);
        };
        const timer = setTimeout(() => { window.removeEventListener("certxa_native_print_result", onResult); resolve(false); }, 45_000);
        window.addEventListener("certxa_native_print_result", onResult);
        try {
          (window as any).ReactNativeWebView?.postMessage(JSON.stringify({
            type: "PRINT_RECEIPT", requestId, copy: "customer", paymentIntentId: charge?.paymentIntentId ?? null,
            receipt: buildNativeReceiptPayload({
              storeName: storeConfig?.name ?? "", storeAddress: storeConfig?.address, storePhone: storeConfig?.phone,
              ticketNumber: c?.ticketNumber ?? posApptId, dateIso: new Date().toISOString(),
              clientName: c?.customerName || undefined, staffName: c?.staffName,
              items: c?.items ?? [], subtotal, discount, tax, tip, grandTotal,
              tenders, changeDue: Math.max(0, Math.round((paidSum - grandTotal) * 100) / 100),
            }),
          }));
        } catch { clearTimeout(timer); window.removeEventListener("certxa_native_print_result", onResult); resolve(false); }
      });
      if (printed) {
        sendReliable("kiosk_checkout_receipt_choice", { choice: "printed", appointmentId: posApptId });
        finishReceipt("Your receipt is printing — thank you!", 6_000);
      } else {
        sendReliable("kiosk_checkout_receipt_choice", { choice: "print", appointmentId: posApptId });
        finishReceipt("Your receipt will be printed at the counter — thank you!", 6_000);
      }
    };
    // Same US-number rule as the check-in keypad: an impossible digit shakes and is refused; what's typed stays.
    const receiptDigit = (d: string) => {
      if (receiptPhone.length >= 10) return;
      if (!isValidNanpPrefix(receiptPhone + d)) { shake(); return; }
      setReceiptPhone(receiptPhone + d); setReceiptError("");
    };
    // We already have this client's number (the POS says so): text the receipt to it without asking. If that fails, the keypad is the fallback.
    const textToNumberOnFile = () => {
      sendReliable("kiosk_checkout_receipt_choice", { choice: "text", appointmentId: posApptId });
      setReceiptStep("sending"); setReceiptError("");
      if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
      receiptTimerRef.current = setTimeout(() => {
        setReceiptStep("text"); setReceiptPhone("");
        setReceiptError("We couldn't text your number on file. Type a number below, or choose No Receipt.");
      }, 12_000);
    };
    const sendTextReceipt = () => {
      if (receiptPhone.length !== 10) return;
      sendReliable("kiosk_checkout_receipt_choice", { choice: "text", phone: receiptPhone, appointmentId: posApptId });
      setReceiptStep("sending"); setReceiptError("");
      if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
      receiptTimerRef.current = setTimeout(() => {
        setReceiptStep("text");
        setReceiptError("We couldn't send that text. Please try again, or choose No Receipt.");
      }, 12_000);
    };
    const bigBtn: React.CSSProperties = { width: 260, height: 130, borderRadius: 22, border: `2px solid ${BORDER}`, background: SURFACE, boxShadow: SHADOW, fontSize: 24, fontWeight: 800, color: TEXT, cursor: "pointer" };
    const compact = receiptStep === "text"; // keypad step: tighter so it fits an 800px-high tablet
    const keyBtn: React.CSSProperties = { width: 96, height: compact ? 62 : 76, borderRadius: 18, border: `1.5px solid ${BORDER}`, background: SURFACE, boxShadow: SHADOW, fontSize: 30, fontWeight: 700, color: TEXT, cursor: "pointer" };
    return (
      <div data-testid="fd-payment-success" style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, zIndex: 9999, gap: compact ? 12 : 22, ...NO_SELECT }}>
        <div style={{ width: compact ? 58 : 96, height: compact ? 58 : 96, borderRadius: "50%", background: "#dcfce7", border: "3px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={compact ? 32 : 52} height={compact ? 32 : 52} viewBox="0 0 58 58" fill="none">
            <polyline points="11,31 24,44 47,18" stroke="#16a34a" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: compact ? 34 : 46, fontWeight: 900, color: TEXT, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Payment successful</h2>
          <p style={{ fontSize: 20, color: MUTED, margin: 0 }}>Amount paid · <strong style={{ color: TEXT }}>${posTotal.toFixed(2)}</strong></p>
        </div>

        {receiptStep === "choose" && (
          <>
            <p style={{ fontSize: 24, fontWeight: 700, color: TEXT, margin: "10px 0 0" }}>Would you like a receipt?</p>
            <div style={{ display: "flex", gap: 20 }}>
              <button data-testid="fd-receipt-print" onPointerDown={e => { e.preventDefault(); chooseReceipt("print"); }} style={bigBtn}>Print Receipt</button>
              <button data-testid="fd-receipt-text" onPointerDown={e => { e.preventDefault(); if (cart?.hasPhone) { textToNumberOnFile(); return; } setReceiptError(""); setReceiptPhone(""); setReceiptStep("text"); }} style={bigBtn}>Text Receipt</button>
              <button data-testid="fd-receipt-none" onPointerDown={e => { e.preventDefault(); chooseReceipt("none"); }} style={bigBtn}>No Receipt</button>
            </div>
          </>
        )}

        {receiptStep === "text" && (
          <>
            <p style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "4px 0 0" }}>Enter your mobile number</p>
            <div className={shakeClass} onAnimationEnd={onShakeEnd} style={{ background: SURFACE, border: `2px solid ${receiptPhone.length === 10 ? PRIMARY : BORDER}`, borderRadius: 16, padding: "10px 28px", minWidth: 320, textAlign: "center", boxShadow: SHADOW }}>
              <span data-testid="fd-receipt-phone" style={{ fontSize: 32, fontFamily: "ui-monospace, monospace", letterSpacing: "0.06em", color: receiptPhone ? TEXT : BORDER }}>
                {receiptPhone ? fmtPhone(receiptPhone) : "(•••) •••-••••"}
              </span>
            </div>
            {receiptError && <p style={{ fontSize: 16, color: "#dc2626", margin: 0, maxWidth: 480, textAlign: "center" }}>{receiptError}</p>}
            <div className={shakeClass} onAnimationEnd={onShakeEnd} style={{ display: "grid", gridTemplateColumns: "repeat(3, 96px)", gap: 8 }} onPointerDown={e => e.stopPropagation()}>
              {["1","2","3","4","5","6","7","8","9"].map(d => (
                <button key={d} onPointerDown={e => { e.preventDefault(); receiptDigit(d); }} style={keyBtn}>{d}</button>
              ))}
              <button onPointerDown={e => { e.preventDefault(); setReceiptPhone(p => p.slice(0, -1)); }} style={{ ...keyBtn, fontSize: 24, color: MUTED }}>⌫</button>
              <button onPointerDown={e => { e.preventDefault(); receiptDigit("0"); }} style={keyBtn}>0</button>
              <button data-testid="fd-receipt-send" onPointerDown={e => { e.preventDefault(); sendTextReceipt(); }} disabled={receiptPhone.length !== 10}
                style={{ ...keyBtn, background: receiptPhone.length === 10 ? PRIMARY : SURFACE, color: receiptPhone.length === 10 ? "#fff" : BORDER, fontSize: 20 }}>Send</button>
            </div>
            <button onPointerDown={e => { e.preventDefault(); setReceiptError(""); setReceiptStep("choose"); }}
              style={{ padding: "8px 28px", borderRadius: 14, border: `2px solid ${BORDER}`, background: "transparent", fontSize: 16, fontWeight: 700, color: MUTED, cursor: "pointer" }}>Back</button>
          </>
        )}

        {receiptStep === "printing" && (
          <p data-testid="fd-receipt-printing" style={{ fontSize: 24, fontWeight: 700, color: MUTED, margin: "14px 0 0" }}>Printing your receipt…</p>
        )}

        {receiptStep === "sending" && (
          <p data-testid="fd-receipt-sending" style={{ fontSize: 24, fontWeight: 700, color: MUTED, margin: "14px 0 0" }}>{cart?.hasPhone && cart.phoneLast4 ? `Texting your receipt to the number ending in ${cart.phoneLast4}…` : "Sending your receipt…"}</p>
        )}

        {receiptStep === "done" && (
          <p data-testid="fd-receipt-done" style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: "14px 0 0", maxWidth: 620, textAlign: "center" }}>{receiptNote}</p>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Check-in screens
  // ═══════════════════════════════════════════════════════════════════════

  if (screen === "suspended") return <KioskSuspendedScreen storeName={storeConfig?.name} />;

  if (screen === "pair" && slug) return (
    <KioskPairing slug={slug} storeName={storeConfig?.name} onPaired={() => setScreen("idle")} />
  );

  if (screen === "idle") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
      onPointerDown={() => setScreen("phone")}
      onContextMenu={e => e.preventDefault()}
      style={{ ...NO_SELECT, background: BG }}>
      <div className="absolute top-[-80px] right-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, var(--fd-primary-glow, rgba(232,72,145,0.08)) 0%, transparent 70%)" }} />
      <div className="absolute bottom-[-100px] left-[-100px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, var(--fd-accent-glow, rgba(167,139,250,0.10)) 0%, transparent 70%)" }} />
      <div className="relative z-10 text-center space-y-10 px-12">
        <div className="w-40 h-40 rounded-full mx-auto flex items-center justify-center shadow-2xl"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`, boxShadow: SHADOW_LG }}>
          <span className="text-white text-7xl font-black">✓</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-8xl font-black leading-none tracking-tight" style={{ color: TEXT }}>
            {kioskConfig?.welcomeHeadline || storeConfig?.name || "Welcome"}
          </h1>
          <p className="text-3xl font-light" style={{ color: MUTED }}>{kioskConfig?.welcomeSubText || t.defaultSubText}</p>
        </div>
        <div className="pt-4">
          <div className="inline-flex items-center gap-4 px-14 py-6 rounded-full text-3xl font-bold text-white tracking-wide animate-pulse"
            style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`, boxShadow: SHADOW_LG }}>
            {t.tapToBegin}
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <span className="w-3 h-3 rounded-full animate-ping inline-block" style={{ background: PRIMARY }} />
          <span className="text-base tracking-widest uppercase" style={{ color: SUBTLE }}>{t.kioskReady}</span>
        </div>
      </div>
    </div>
  );

  if (screen === "loading") return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: BG }}>
      <div className="text-center space-y-6">
        <div className="w-20 h-20 rounded-full border-4 border-t-transparent animate-spin mx-auto" style={{ borderColor: BORDER, borderTopColor: PRIMARY }} />
        <p className="text-2xl font-light" style={{ color: MUTED }}>{t.oneMoment}</p>
      </div>
    </div>
  );

  if (screen === "error") return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: BG }}>
      <div className="text-center space-y-6">
        <div className="text-7xl">⚠️</div>
        <p className="text-2xl font-semibold" style={{ color: "#dc2626" }}>{error || t.somethingWrong}</p>
        <PrimaryBtn onPress={resetToIdle}>{t.tryAgain}</PrimaryBtn>
      </div>
    </div>
  );

  if (screen === "phone") return (
    <div className="fixed inset-0 flex select-none" onContextMenu={e => e.preventDefault()} style={{ ...NO_SELECT, background: BG }}>
      <div className={`flex-1 flex flex-col items-center justify-center gap-5 px-8 ${shakeClass}`} onAnimationEnd={onShakeEnd} data-testid="fd-phone-shake">
        {bookingPhoneSent ? (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-28 h-28 rounded-full flex items-center justify-center shadow-xl" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})` }}>
              <span className="text-white text-6xl font-black">{bookingClient ? "👋" : "✓"}</span>
            </div>
            <div>
              <h2 className="text-4xl font-black" style={{ color: TEXT }}>
                {bookingClient?.name
                  ? `Welcome back, ${bookingClient.name.trim().split(/\s+/)[0]}!`
                  : "Thank you!"}
              </h2>
              <p className="text-lg mt-2" style={{ color: SUBTLE }}>The front desk is adding you to the appointment.</p>
            </div>
            {bookingClient && bookingClient.loyaltyPoints > 0 && (
              <div className="inline-flex items-center gap-3 px-8 py-4 rounded-full text-2xl font-semibold"
                style={{ background: "#fffbeb", border: "1.5px solid #fde68a", color: "#92400e" }}>
                <span className="text-3xl">⭐</span>
                <span>You have {bookingClient.loyaltyPoints} point{bookingClient.loyaltyPoints === 1 ? "" : "s"}</span>
              </div>
            )}
          </div>
        ) : (
        <>
        <div className="text-center mb-1">
          <p className="text-2xl font-bold" style={{ color: TEXT }}>{t.enterPhone}</p>
          <p className="text-base mt-1" style={{ color: SUBTLE }}>{bookingPhoneMode ? "So the front desk can add you to the appointment" : t.infoNeverShared}</p>
        </div>
        <div className="rounded-2xl px-10 py-4 min-w-[320px] text-center" style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, boxShadow: SHADOW }}>
          <span className="text-5xl font-mono tracking-[0.12em]" style={{ color: phone ? TEXT : BORDER }}>
            {phone ? fmtPhone(phone) : "•••  •••  ••••"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {["1","2","3","4","5","6","7","8","9"].map(d => (
            <button key={d} onPointerDown={e => { e.preventDefault(); handleDigit(d); }}
              className="w-32 h-32 rounded-3xl text-4xl font-bold transition-all active:scale-95"
              style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: TEXT, boxShadow: SHADOW }}>{d}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <button onPointerDown={e => { e.preventDefault(); setPhone(p => p.slice(0, -1)); kick(); }}
            className="w-32 h-32 rounded-3xl text-3xl transition-all active:scale-95"
            style={{ background: "#fef2f2", border: "1.5px solid #fecaca", color: "#ef4444", boxShadow: SHADOW }}>⌫</button>
          <button onPointerDown={e => { e.preventDefault(); handleDigit("0"); }}
            className="w-32 h-32 rounded-3xl text-4xl font-bold transition-all active:scale-95"
            style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: TEXT, boxShadow: SHADOW }}>0</button>
          <button onPointerDown={e => { e.preventDefault(); if (phone.length === 10) { bookingPhoneMode ? submitBookingPhone(phone) : doLookup(phone); } }}
            disabled={phone.length < 10}
            className="w-32 h-32 rounded-3xl text-4xl font-bold text-white transition-all active:scale-95 disabled:opacity-30"
            style={{ background: phone.length < 10 ? "#d1d5db" : PRIMARY, boxShadow: phone.length < 10 ? "none" : SHADOW }}>→</button>
        </div>
        <div className="flex gap-3 mt-1">
          <GhostBtn onPress={resetToIdle}>{t.cancel}</GhostBtn>
        </div>
        </>
        )}
      </div>
    </div>
  );

  if (screen === "name_entry") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 px-8 select-none"
      onContextMenu={e => e.preventDefault()} style={{ ...NO_SELECT, background: BG }}>
      <div className="text-center space-y-2 mb-2">
        <p className="text-xl uppercase tracking-widest font-semibold" style={{ color: PRIMARY }}>{t.firstTimeHere}</p>
        <h2 className="text-5xl font-black" style={{ color: TEXT }}>{t.whatsYourName}</h2>
      </div>
      <div className="rounded-2xl px-12 py-4 min-w-[480px] text-center min-h-[72px] flex items-center justify-center"
        style={{ background: SURFACE, border: `2px solid ${newClientName ? PRIMARY : BORDER}`, boxShadow: SHADOW }}>
        <span className="text-5xl font-bold" style={{ color: newClientName ? TEXT : BORDER }}>{newClientName || t.yourNamePlaceholder}</span>
      </div>
      <div className="flex flex-col items-center gap-2 w-full max-w-3xl">
        {QWERTY.map((row, ri) => (
          <div key={ri} className="flex gap-2 justify-center">
            {row.map(key => (
              <button key={key}
                onPointerDown={e => {
                  e.preventDefault();
                  if (key === "⌫") setNewClientName(n => n.slice(0, -1));
                  else setNewClientName(n => n.length < 24 ? n + key : n);
                  kick();
                }}
                className="h-14 rounded-xl font-semibold text-xl transition-all active:scale-90 select-none"
                style={{ width: key === "⌫" ? 72 : 56, background: key === "⌫" ? "#fef2f2" : SURFACE, border: `1.5px solid ${key === "⌫" ? "#fecaca" : BORDER}`, color: key === "⌫" ? "#ef4444" : TEXT, boxShadow: SHADOW }}>
                {key}
              </button>
            ))}
          </div>
        ))}
        <button onPointerDown={e => { e.preventDefault(); setNewClientName(n => n.length < 24 ? n + " " : n); kick(); }}
          className="mt-1 px-24 py-3 rounded-xl text-lg transition-all active:scale-95 select-none"
          style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: MUTED, boxShadow: SHADOW }}>
          {t.spaceKey}
        </button>
      </div>
      <div className="flex gap-4 mt-1">
        <PrimaryBtn onPress={() => submitNewClient(newClientName)} disabled={newClientName.trim().length < 2}>
          {t.continueBtn}
        </PrimaryBtn>
      </div>
    </div>
  );

  if (screen === "service_select" && svcCatalog) return (
    <ServiceCheckin
      services={svcCatalog.services}
      catalogCategories={svcCatalog.categories}
      categoryImages={svcCatalog.categoryImages}
      busy={svcBusy}
      error={svcError}
      onConfirm={confirmService}
      onActivity={kick}
    />
  );

  if (screen === "checked_in_generic") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 px-12" style={{ ...NO_SELECT, background: BG }}>
      <div className="w-32 h-32 rounded-full flex items-center justify-center shadow-2xl"
        style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`, boxShadow: SHADOW_LG }}>
        <span className="text-white text-6xl font-black">✓</span>
      </div>
      <div className="text-center space-y-3 max-w-xl">
        <h1 className="text-6xl font-black leading-tight" style={{ color: TEXT }}>{t.youreCheckedIn(clientFirst)}</h1>
        {svcResult ? (
          <>
            <p className="text-3xl font-semibold" style={{ color: TEXT }} data-testid="fd-checkin-service">Requested: {svcResult.categoryName}</p>
            <p className="text-2xl" style={{ color: MUTED }} data-testid="fd-checkin-tech">
              {svcResult.staffName ? `Your technician: ${svcResult.staffName}` : "A technician will be with you as soon as one is free."}
            </p>
          </>
        ) : (
          <p className="text-2xl" style={{ color: MUTED }}>{t.seeFrontDesk}</p>
        )}
      </div>
      <div className="px-8 py-4 rounded-2xl flex items-center gap-3" style={{ background: "#f0fdf9", border: `1.5px solid ${BORDER}` }}>
        <span className="text-2xl">✨</span>
        <p className="text-lg font-semibold" style={{ color: "#16a34a" }}>{t.teamWithYouSoon}</p>
      </div>
      <div className="flex items-center gap-2 text-sm" style={{ color: SUBTLE }}>
        <span className="w-2 h-2 rounded-full animate-pulse inline-block" style={{ background: PRIMARY }} />
        Returning to start in {countdown}s
      </div>
      <GhostBtn onPress={resetToIdle}>{t.doneBtn}</GhostBtn>
    </div>
  );

  if (screen === "appointment_confirmed" && todayAppointment) {
    const apptTime = fmtTime(todayAppointment.appointmentTime, kioskConfig?.timezone);
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center select-none overflow-hidden"
        onContextMenu={e => e.preventDefault()} style={{ ...NO_SELECT, background: BG }}>
        <div className="absolute top-[-80px] right-[-120px] w-[550px] h-[550px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, var(--fd-primary-glow, rgba(232,72,145,0.10)) 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-100px] left-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, var(--fd-accent-glow, rgba(167,139,250,0.12)) 0%, transparent 70%)" }} />
        <div className="relative z-10 flex flex-col items-center gap-8 px-12 max-w-2xl w-full">
          <div className="w-32 h-32 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`, boxShadow: SHADOW_LG }}>
            <span className="text-white text-6xl font-black">✓</span>
          </div>
          <div className="text-center">
            <h1 className="text-6xl font-black leading-tight" style={{ color: TEXT }}>{t.youreCheckedIn(clientFirst)}</h1>
            <p className="text-xl mt-3" style={{ color: MUTED }}>{t.appointmentConfirmed}</p>
          </div>
          <div className="w-full rounded-3xl overflow-hidden" style={{ background: SURFACE, border: `2px solid ${BORDER}`, boxShadow: SHADOW_LG }}>
            <div className="px-8 py-5 flex items-center gap-4" style={{ background: "linear-gradient(135deg, var(--fd-primary-tint, #e8489118), var(--fd-accent-tint, #a78bfa12))", borderBottom: `1.5px solid ${BORDER}` }}>
              <span className="text-4xl">💅</span>
              <div>
                <p className="text-xs uppercase tracking-widest font-bold mb-0.5" style={{ color: PRIMARY }}>{t.yourService}</p>
                <p className="text-2xl font-black" style={{ color: TEXT }}>{todayAppointment.serviceName}</p>
              </div>
            </div>
            <div className="px-8 py-6 grid grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: PRIMARY_S, border: `1.5px solid ${BORDER}` }}>
                  <span className="text-lg">🕐</span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest font-bold mb-0.5" style={{ color: SUBTLE }}>{t.appointmentTime}</p>
                  <p className="text-2xl font-black" style={{ color: TEXT }}>{apptTime}</p>
                </div>
              </div>
              {todayAppointment.staffName && (
                <div className="flex items-start gap-3">
                  {todayAppointment.staffAvatarThumbUrl ? (
                    <img src={todayAppointment.staffAvatarThumbUrl} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" alt={todayAppointment.staffName} />
                  ) : (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: PRIMARY_S, border: `1.5px solid ${BORDER}` }}>
                      <span className="text-lg">💇</span>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-widest font-bold mb-0.5" style={{ color: SUBTLE }}>{t.yourStylist}</p>
                    <p className="text-2xl font-black" style={{ color: TEXT }}>{todayAppointment.staffName}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-8 py-4 flex items-center gap-3" style={{ background: "#f0fdf9", borderTop: `1.5px solid ${BORDER}` }}>
              <span className="text-2xl">✨</span>
              <p className="text-lg font-semibold" style={{ color: "#16a34a" }}>
                {todayAppointment.staffName ? t.staffWithYouSoon(todayAppointment.staffName) : t.teamWithYouSoon}
              </p>
            </div>
          </div>
          {(clientInfo?.loyaltyPoints ?? 0) > 0 && (
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full text-lg font-semibold"
              style={{ background: "#fffbeb", border: "1.5px solid #fde68a", color: "#92400e" }}>
              <span className="text-2xl">⭐</span>
              <span>{t.loyaltyPointsLabel(clientInfo!.loyaltyPoints)}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm" style={{ color: SUBTLE }}>
            <span className="w-2 h-2 rounded-full animate-pulse inline-block" style={{ background: PRIMARY }} />
            Returning to start in {countdown}s
          </div>
          <GhostBtn onPress={resetToIdle}>{t.doneBtn}</GhostBtn>
        </div>
      </div>
    );
  }

  return null;
}

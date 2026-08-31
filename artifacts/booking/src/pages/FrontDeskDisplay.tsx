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
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { KIOSK_LANGS, LangCode, translations } from "../lib/kioskTranslations";

type Screen =
  | "idle" | "phone" | "loading"
  | "appointment_confirmed" | "checked_in_generic" | "name_entry"
  | "error" | "closed" | "suspended";

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
  subtotal: number; discount: number; tip: number; tax: number; total: number;
  isWalkIn: boolean; customerName: string; appointmentId: number;
  loyaltyPoints?: number;
}

interface ClientInfo  { id: number; name: string; loyaltyPoints: number; totalVisits: number; }
interface StoreConfig { name: string; phone: string; address: string; }
interface KioskConfig { kioskEnabled: boolean; welcomeHeadline: string | null; welcomeSubText: string | null; loyaltyPromoText: string | null; timezone: string | null; }
interface TodayAppointment { id: number; serviceName: string; staffName: string | null; staffAvatarThumbUrl: string | null; appointmentTime: string; }

const QWERTY: string[][] = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
];

// ─── Colour palette — warm light theme (identical to the kiosk) ──────────────
const BG        = "#f5f3ff";
const SURFACE   = "#ffffff";
const PRIMARY   = "#e84891";
const PRIMARY_D = "#cf3a7e";
const PRIMARY_S = "#fdf2f8";
const BORDER    = "#e9e3f5";
const SHADOW    = "0 2px 8px rgba(80,0,120,0.07), 0 1px 3px rgba(0,0,0,0.05)";
const SHADOW_LG = "0 8px 32px rgba(80,0,120,0.10), 0 2px 8px rgba(0,0,0,0.06)";
const TEXT      = "#18111a";
const MUTED     = "#6b6580";
const SUBTLE    = "#a89ec0";
const NO_SELECT: React.CSSProperties = { WebkitUserSelect: "none", userSelect: "none" };

const POS_TIPS = [
  { label: "No Tip", pct: 0 },
  { label: "15%", pct: 15 },
  { label: "18%", pct: 18 },
  { label: "20%", pct: 20 },
  { label: "25%", pct: 25 },
];

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
      <div style={{ position: "absolute", left: "50%", top: 120, width: 132, height: 84, borderRadius: 12, background: `linear-gradient(135deg, ${PRIMARY} 0%, #a855f7 100%)`, boxShadow: "0 10px 24px rgba(168,85,247,0.4)", animation: "fd-card-tap 1.8s ease-in-out infinite", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 12 }}>
        <div style={{ width: 30, height: 22, borderRadius: 4, background: "rgba(255,255,255,0.85)" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ width: 14, height: 5, borderRadius: 2, background: "rgba(255,255,255,0.6)" }} />)}
        </div>
      </div>
    </div>
  );
}

export default function FrontDeskDisplay() {
  const { slug } = useParams<{ slug: string }>();
  const [screen, setScreen]           = useState<Screen>("idle");
  const [storeId, setStoreId]         = useState<number | null>(null);
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null);
  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(null);
  const [phone, setPhone]             = useState("");
  const [clientInfo, setClientInfo]   = useState<ClientInfo | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [todayAppointment, setTodayAppointment] = useState<TodayAppointment | null>(null);
  const [error, setError]             = useState("");
  const [countdown, setCountdown]     = useState(30);
  const [lang, setLang]               = useState<LangCode>("en");

  // Loyalty rewards the salon offers (shown to a checked-in client during checkout)
  const [rewards, setRewards] = useState<{ id: number; name: string; pointsCost: number; dollarValue: number }[]>([]);
  const [redeemedRewardId, setRedeemedRewardId] = useState<number | null>(null);

  // POS-driven overlay
  const [posCheckout, setPosCheckout] = useState<PosCheckout>(null);
  const [posApptId, setPosApptId]     = useState(0);
  const [posTotal, setPosTotal]       = useState(0);
  const [posTipPct, setPosTipPct]     = useState<number | null>(null);
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

  const idleRef     = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const cdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const posResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapArmedRef = useRef(false);
  const confirmArmRef = useRef(false);
  // What kicked off the current card payment — so the POS can tell a
  // customer-driven confirm from a POS-initiated collection.
  const payTriggerRef = useRef<"pos" | "client_confirm">("pos");
  const awaitModeRef = useRef<AwaitMode>("m2");
  const posCheckoutRef = useRef<PosCheckout>(null);

  const t = translations[lang];
  const isNative = typeof window !== "undefined" && !!(window as any).CERTXA_NATIVE_APP;

  // ── Config load + periodic refresh while idle ─────────────────────────────
  const applyConfig = useCallback((d: any, initial: boolean) => {
    if (d?.accountSuspended) { setStoreId(d.storeId ?? null); setScreen("suspended"); return; }
    if (d?.error) { if (initial) { setError(d.error); setScreen("error"); } return; }
    setStoreId(d.store?.id ?? d.storeId ?? null);
    setStoreConfig(d.store ?? null);
    setKioskConfig({
      kioskEnabled: d.kioskEnabled !== false,
      welcomeHeadline: d.welcomeHeadline ?? null,
      welcomeSubText: d.welcomeSubText ?? null,
      loyaltyPromoText: d.loyaltyPromoText ?? null,
      timezone: d.timezone ?? null,
    });
    if (initial) setScreen(d.kioskEnabled === false ? "closed" : "idle");
  }, []);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/kiosk/${slug}/config`)
      .then(r => r.json())
      .then(d => applyConfig(d, true))
      .catch(() => { setError("Failed to connect."); setScreen("error"); });
  }, [slug, applyConfig]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/kiosk/${slug}/rewards`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRewards(d); })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!slug || screen !== "idle") return;
    let cancelled = false;
    const refresh = () => {
      fetch(`/api/public/kiosk/${slug}/config`)
        .then(r => r.json())
        .then(d => { if (!cancelled) applyConfig(d, false); })
        .catch(() => {});
    };
    refresh();
    const iv = setInterval(refresh, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [slug, screen, applyConfig]);

  // ── Notifications WebSocket (unauthenticated, keyed by storeId) ───────────
  const sendWs = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, ...payload }));
  }, []);

  const clearPosOverlay = useCallback(() => {
    if (posResetRef.current) clearTimeout(posResetRef.current);
    setPosCheckout(null); setPosTipPct(null); setPayError("");
    setCart(null); setRwPhone(""); setRwStatus("idle"); setRwResult(null);
    tapArmedRef.current = false;
    // reset the in-panel check-in so the next checkout starts clean
    setScreen("idle"); setPhone(""); setClientInfo(null); setTodayAppointment(null); setNewClientName("");
    setRedeemedRewardId(null); setPosApptId(0);
  }, []);

  useEffect(() => { posCheckoutRef.current = posCheckout; }, [posCheckout]);

  useEffect(() => {
    if (!storeId) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    let destroyed = false;
    let ws: WebSocket;
    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${storeId}`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        let msg: any;
        try { msg = JSON.parse(e.data); } catch { return; }
        switch (msg.type) {
          case "account_status_changed": {
            const s = String(msg.accountStatus ?? "").toLowerCase();
            if (s === "suspended" || s === "canceled") setScreen("suspended");
            else if (s === "active") window.location.reload();
            break;
          }
          case "kiosk_checkout_start":
            setPosTotal(Number(msg.total) || 0);
            setPosTipPct(null); setPayError("");
            setPosCheckout("cart");
            if (msg.appointmentId != null) setPosApptId(Number(msg.appointmentId) || 0);
            if (posResetRef.current) clearTimeout(posResetRef.current);
            break;
          case "kiosk_checkout_cart":
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
            });
            if (Number(msg.appointmentId)) setPosApptId(Number(msg.appointmentId));
            setPosTotal(Number(msg.total) || 0);
            setPayError("");
            setPosCheckout(prev => (prev === "tip" || prev === "await_payment" || prev === "thankyou") ? prev : "cart");
            if (posResetRef.current) clearTimeout(posResetRef.current);
            break;
          case "kiosk_checkout_customer_linked":
            if (msg.name) {
              setRwStatus("done");
              setRwResult({ name: String(msg.name), loyaltyPoints: Number(msg.loyaltyPoints) || 0, isNew: !!msg.isNew });
            }
            break;
          case "kiosk_checkout_tip_request":
            setPosTotal(Number(msg.total) || 0);
            setPosTipPct(null);
            setCardMethod(msg.cardMethod === "m2" ? "m2" : msg.cardMethod === "tap" ? "tap" : readLocalCardMethod());
            setPosCheckout("tip");
            break;
          case "kiosk_checkout_await_payment": {
            const mode: AwaitMode = msg.mode === "tap" ? "tap" : "m2";
            setPosTotal(Number(msg.total) || 0);
            setAwaitMode(mode);
            awaitModeRef.current = mode;
            payTriggerRef.current = "pos";
            setAwaitApptId(msg.appointmentId != null ? Number(msg.appointmentId) : null);
            setPayError("");
            tapArmedRef.current = false;
            setPosCheckout("await_payment");
            break;
          }
          case "kiosk_checkout_payment_result":
            if (msg.success) {
              if (msg.total != null) setPosTotal(Number(msg.total) || 0);
              setPosCheckout("thankyou");
              if (posResetRef.current) clearTimeout(posResetRef.current);
              posResetRef.current = setTimeout(clearPosOverlay, 15_000);
            } else {
              setPayError(String(msg.error || "Payment was declined. Please try another card."));
              setPosCheckout("await_payment");
            }
            break;
          case "kiosk_checkout_cancel":
            // Don't cut the "Thank you!" screen short — it clears itself on a timer.
            if (posCheckoutRef.current !== "thankyou") clearPosOverlay();
            break;
        }
      };
      ws.onclose = () => { wsRef.current = null; if (!destroyed) setTimeout(connect, 5_000); };
    };
    connect();
    return () => { destroyed = true; ws?.close(); wsRef.current = null; };
  }, [storeId, clearPosOverlay]);

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
    const amountCents = Math.max(0, Math.round(posTotal * 100));
    try {
      (window as any).ReactNativeWebView?.postMessage(JSON.stringify({
        type: awaitMode === "m2" ? "M2_PAY" : "TAP_TO_PAY",
        appointmentId: awaitApptId ?? 0,
        amountCents,
        clientName: clientInfo?.name || newClientName.trim() || "Walk-in",
      }));
    } catch {}
  }, [posCheckout, awaitMode, isNative, posTotal, awaitApptId, clientInfo, newClientName]);

  // ── Native app → web: Tap to Pay result ─────────────────────────────────
  useEffect(() => {
    const onDone = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const total = d.amount != null ? Number(d.amount) : posTotal;
      sendWs("kiosk_checkout_payment_result", { success: true, total, last4: d.last4, via: payTriggerRef.current, method: awaitModeRef.current });
      setPosTotal(total);
      setPosCheckout("thankyou");
      if (posResetRef.current) clearTimeout(posResetRef.current);
      posResetRef.current = setTimeout(clearPosOverlay, 15_000);
    };
    const onFail = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      tapArmedRef.current = false;
      setPayError(String(d.message || "Payment failed. Please try again."));
      sendWs("kiosk_checkout_payment_result", { success: false, error: d.message, via: payTriggerRef.current, method: awaitModeRef.current });
    };
    window.addEventListener("certxa_native_payment_complete", onDone);
    window.addEventListener("certxa_native_payment_failed", onFail);
    return () => {
      window.removeEventListener("certxa_native_payment_complete", onDone);
      window.removeEventListener("certxa_native_payment_failed", onFail);
    };
  }, [sendWs, posTotal, clearPosOverlay]);

  // ── Idle / countdown resets ─────────────────────────────────────────────
  const resetToIdle = useCallback(() => {
    // Never reset while a POS checkout is in progress — the customer is still
    // at the counter and the ticket is linked to them. clearPosOverlay handles
    // the reset when the checkout ends / is cancelled.
    if (posCheckoutRef.current !== null) return;
    setScreen("idle"); setPhone(""); setClientInfo(null);
    setNewClientName(""); setTodayAppointment(null); setError("");
    if (cdownRef.current) clearInterval(cdownRef.current);
  }, []);

  useEffect(() => {
    if (posCheckout === null && (screen === "appointment_confirmed" || screen === "checked_in_generic")) {
      setCountdown(30);
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
      const r = await fetch(`/api/public/kiosk/${slug}/rewards-signup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, name: name?.trim() || undefined, appointmentId: apptId }),
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
      setScreen("checked_in_generic");
      // Direct-WS push (same path as the tip screen) so the POS updates even when
      // the server broadcast doesn't cross PM2 workers.
      sendWs("kiosk_checkout_customer_linked", {
        appointmentId: apptId ?? 0,
        clientId,
        name: nm,
        loyaltyPoints: points,
        isNew: !!d.isNew,
      });
    } catch {
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
    sendWs("kiosk_checkout_redeem_reward", {
      rewardId: rw.id, name: rw.name, pointsCost: rw.pointsCost, dollarValue: rw.dollarValue,
      appointmentId: cart?.appointmentId ?? null,
    });
    setRedeemedRewardId(rw.id);
  }, [sendWs, cart?.appointmentId]);

  // ── Check-in lookup ─────────────────────────────────────────────────────
  const doLookup = async (p: string) => {
    setScreen("loading");
    try {
      const r = await fetch(`/api/public/kiosk/${slug}/lookup`, {
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
        if (d.todayAppointment) {
          setTodayAppointment(d.todayAppointment);
          setScreen("appointment_confirmed");
        } else {
          setTodayAppointment(null);
          setScreen("checked_in_generic");
        }
      } else {
        // Unknown number → ask for a name (on-screen keyboard) before creating.
        setNewClientName("");
        setScreen("name_entry");
      }
    } catch {
      setError(t.somethingWrong);
      setScreen("error");
    }
  };

  const handleDigit = (d: string) => {
    if (phone.length >= 10) return;
    const next = phone + d;
    setPhone(next); kick();
    if (next.length === 10) doLookup(next);
  };

  // ── Rewards sign-up (walk-in checkout, right panel of the cart mirror) ────
  const submitRewards = useCallback(async (digits: string) => {
    if (digits.length !== 10) return;
    setRwStatus("submitting");
    try {
      const r = await fetch(`/api/public/kiosk/${slug}/rewards-signup`, {
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
    const calcTip = (pct: number) => Math.round(posTotal * pct) / 100;
    const tipAmt = posTipPct !== null ? calcTip(posTipPct) : 0;
    const grandWithTip = posTotal + tipAmt;

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
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", background: BG, zIndex: 9999, overflow: "hidden", ...NO_SELECT }}>
          {/* ── Left: live order ── */}
          <div style={{ flex: "1 1 56%", display: "flex", flexDirection: "column", background: SURFACE, borderRight: `1.5px solid ${BORDER}` }}>
            <div style={{ padding: "22px 40px", borderBottom: `1.5px solid ${BORDER}`, background: PRIMARY_S, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: PRIMARY, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>Client</p>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: TEXT, margin: "3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clientName}</h1>
              </div>
              {clientPoints != null && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: PRIMARY, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Points</p>
                  <p style={{ fontSize: 30, fontWeight: 900, color: TEXT, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>{clientPoints}</p>
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
            </div>
          </div>

          {/* ── Right: front-desk check-in (or rewards sign-up for walk-ins) ── */}
          <div style={{ flex: "1 1 44%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "40px 44px", background: `linear-gradient(160deg, ${PRIMARY} 0%, #7c3aed 100%)`, color: "#fff", textAlign: "center" }}>
            {cartLinked ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 14, width: "100%", maxWidth: 400 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 44, lineHeight: 1 }}>{checkedInHere ? "✅" : "👋"}</div>
                  <p style={{ fontSize: 22, fontWeight: 900, margin: "6px 0 0" }}>
                    {checkedInHere ? "You're checked in" : "Hi"}{clientFirstName ? `, ${clientFirstName}` : ""}!
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 2px" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.85)" }}>Your rewards</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{(clientPoints ?? 0).toLocaleString()} pts</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "50vh", overflowY: "auto" }}>
                  {rewards.length === 0 ? (
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", textAlign: "center", margin: "12px 0" }}>
                      No rewards available right now.
                    </p>
                  ) : rewards.map(rw => {
                    const bal = clientPoints ?? 0;
                    const isThis = redeemedRewardId === rw.id;
                    const canRedeem = bal >= rw.pointsCost && redeemedRewardId == null;
                    return (
                      <div key={rw.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.14)", borderRadius: 14, padding: "12px 14px" }}>
                        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rw.name}</p>
                          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" }}>
                            {rw.pointsCost.toLocaleString()} pts · ${rw.dollarValue.toFixed(2)} off
                          </p>
                        </div>
                        <button
                          onPointerDown={e => { e.preventDefault(); if (canRedeem) redeemReward(rw); }}
                          disabled={!canRedeem}
                          style={{
                            flexShrink: 0, border: "none", borderRadius: 11, padding: "9px 16px", fontSize: 13, fontWeight: 900,
                            cursor: canRedeem ? "pointer" : "default",
                            background: isThis ? "rgba(255,255,255,0.25)" : canRedeem ? "#fff" : "rgba(255,255,255,0.12)",
                            color: isThis ? "#fff" : canRedeem ? PRIMARY_D : "rgba(255,255,255,0.4)",
                          }}>
                          {isThis ? "Redeemed ✓" : "Redeem"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
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
                  <span style={{ fontSize: 22, fontWeight: 700, color: newClientName ? TEXT : "#c9c2de" }}>
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
                    onPointerDown={e => { e.preventDefault(); setNewClientName(""); setPhone(""); setScreen("idle"); }}
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
              <>
                <div style={{ fontSize: 56, lineHeight: 1 }}>👋</div>
                <p style={{ fontSize: 27, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>Check in</p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
                  Enter your mobile number to check in for today’s visit.
                </p>
                <div style={{ background: "#fff", borderRadius: 16, padding: "12px 24px", minWidth: 280, boxShadow: SHADOW_LG }}>
                  <span style={{ fontSize: 30, fontFamily: "ui-monospace, monospace", letterSpacing: "0.08em", color: phone ? TEXT : "#c9c2de" }}>
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
              </>
            )}
          </div>
        </div>
      );
    }

    if (posCheckout === "tip") {
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, zIndex: 9999, padding: 32, ...NO_SELECT }}>
          <div style={{ background: SURFACE, borderRadius: 28, border: `1.5px solid ${BORDER}`, boxShadow: SHADOW_LG, padding: "44px 52px", width: "100%", maxWidth: 560, textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 18, lineHeight: 1 }}>💝</div>
            <h2 style={{ fontSize: 34, fontWeight: 900, color: TEXT, margin: "0 0 10px" }}>Add a Tip?</h2>
            <p style={{ fontSize: 17, color: MUTED, margin: "0 0 36px" }}>
              Sale total: <strong style={{ color: TEXT }}>${posTotal.toFixed(2)}</strong>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
              {POS_TIPS.map(tp => {
                const amt = calcTip(tp.pct);
                const active = posTipPct === tp.pct;
                return (
                  <button key={tp.pct}
                    onPointerDown={e => { e.preventDefault(); setPosTipPct(tp.pct); }}
                    style={{ padding: "16px 6px", borderRadius: 16, border: `2.5px solid ${active ? PRIMARY : BORDER}`, background: active ? PRIMARY_S : SURFACE, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "all 0.12s", boxShadow: active ? `0 0 0 3px ${PRIMARY}30` : "none" }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 800, color: active ? PRIMARY_D : TEXT }}>{tp.label}</span>
                    {tp.pct > 0 && <span style={{ fontSize: 13, color: active ? PRIMARY : MUTED }}>${amt.toFixed(2)}</span>}
                  </button>
                );
              })}
            </div>
            {posTipPct !== null && (
              <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 14, padding: "14px 24px", marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, color: "#166534", fontWeight: 600 }}>Total with tip</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: "#16a34a" }}>${grandWithTip.toFixed(2)}</span>
              </div>
            )}
            <button
              onPointerDown={e => {
                e.preventDefault();
                if (posTipPct === null) return;
                sendWs("kiosk_checkout_tip_selected", { tipAmount: tipAmt, tipPercent: posTipPct });
                setPosTotal(grandWithTip);
                if (isNative) {
                  // Confirm doubles as the card-payment trigger: arm the native
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
              }}
              disabled={posTipPct === null}
              style={{ width: "100%", padding: "20px", borderRadius: 18, border: "none", background: posTipPct !== null ? PRIMARY : "#e2e8f0", color: posTipPct !== null ? "#fff" : "#94a3b8", fontSize: 20, fontWeight: 800, cursor: posTipPct !== null ? "pointer" : "not-allowed", transition: "all 0.15s" }}
            >
              {posTipPct === null
                ? "Select a tip option above"
                : isNative
                  ? `Confirm & Pay  ·  $${grandWithTip.toFixed(2)}`
                  : `Confirm  ·  $${grandWithTip.toFixed(2)}`}
            </button>
          </div>
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

          <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 10, color: SUBTLE, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "fd-ripple 1.8s ease-out infinite" }} />
            {isM2 ? "Waiting for the reader" : isNative ? "Reader ready" : "Waiting for payment"}
          </div>
        </div>
      );
    }

    // thankyou
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, zIndex: 9999, gap: 32, ...NO_SELECT }}>
        <div style={{ width: 110, height: 110, borderRadius: "50%", background: "#dcfce7", border: "3px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="58" height="58" viewBox="0 0 58 58" fill="none">
            <polyline points="11,31 24,44 47,18" stroke="#16a34a" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 48, fontWeight: 900, color: TEXT, margin: "0 0 10px", letterSpacing: "-0.02em" }}>Thank you!</h2>
          <p style={{ fontSize: 20, color: MUTED, margin: 0 }}>Payment complete · <strong style={{ color: TEXT }}>${posTotal.toFixed(2)}</strong></p>
        </div>
        <button
          onPointerDown={e => { e.preventDefault(); clearPosOverlay(); }}
          style={{ padding: "16px 34px", borderRadius: 16, border: `2px solid ${BORDER}`, background: SURFACE, boxShadow: SHADOW, fontSize: 16, fontWeight: 700, color: MUTED, cursor: "pointer" }}
        >
          Done
        </button>
        <p style={{ fontSize: 14, color: SUBTLE }}>This screen will reset automatically</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Check-in screens
  // ═══════════════════════════════════════════════════════════════════════

  if (screen === "suspended") {
    return <div className="fixed inset-0" style={{ ...NO_SELECT, background: "radial-gradient(ellipse at center, #1c1c1c 0%, #0a0a0a 100%)", cursor: "none" }} />;
  }

  if (screen === "closed") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8" style={{ ...NO_SELECT, background: BG }}>
      <div className="w-32 h-32 rounded-full flex items-center justify-center text-6xl shadow-lg" style={{ background: SURFACE, border: `2px solid ${BORDER}` }}>🔒</div>
      <div className="text-center space-y-3">
        <h1 className="text-6xl font-black" style={{ color: TEXT }}>{storeConfig?.name ?? "Check-in"}</h1>
        <p className="text-2xl" style={{ color: MUTED }}>{t.weClosed}</p>
        <p className="text-lg" style={{ color: SUBTLE }}>{t.seeFrontDesk}</p>
      </div>
    </div>
  );

  if (screen === "idle") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
      onPointerDown={() => setScreen("phone")}
      onContextMenu={e => e.preventDefault()}
      style={{ ...NO_SELECT, background: BG }}>
      <div className="absolute top-[-80px] right-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, rgba(232,72,145,0.08) 0%, transparent 70%)" }} />
      <div className="absolute bottom-[-100px] left-[-100px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, rgba(167,139,250,0.10) 0%, transparent 70%)" }} />
      <div className="relative z-10 text-center space-y-10 px-12">
        <div className="w-40 h-40 rounded-full mx-auto flex items-center justify-center shadow-2xl"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, #a78bfa)`, boxShadow: SHADOW_LG }}>
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
            style={{ background: `linear-gradient(135deg, ${PRIMARY}, #a78bfa)`, boxShadow: SHADOW_LG }}>
            {t.tapToBegin}
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <span className="w-3 h-3 rounded-full animate-ping inline-block" style={{ background: PRIMARY }} />
          <span className="text-base tracking-widest uppercase" style={{ color: SUBTLE }}>{t.kioskReady}</span>
        </div>
      </div>
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-3 flex-wrap px-8 z-20"
        onPointerDown={e => e.stopPropagation()}>
        {KIOSK_LANGS.map(({ code, label }) => (
          <button key={code}
            onPointerDown={e => { e.stopPropagation(); setLang(code); }}
            className="px-5 py-2.5 rounded-full text-base font-semibold transition-all duration-150 active:scale-95"
            style={{ background: lang === code ? PRIMARY : SURFACE, color: lang === code ? "#fff" : MUTED, border: `1.5px solid ${lang === code ? PRIMARY : BORDER}`, boxShadow: SHADOW, cursor: "pointer" }}>
            {label}
          </button>
        ))}
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
      <div className="w-[36%] flex flex-col items-center justify-center px-10 gap-8" style={{ background: PRIMARY_S, borderRight: `1.5px solid ${BORDER}` }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-xl" style={{ background: `linear-gradient(135deg, ${PRIMARY}, #a78bfa)` }}>
          <span className="text-white text-4xl font-black">✓</span>
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-black leading-tight" style={{ color: TEXT }}>{storeConfig?.name ?? "Check In"}</h1>
          <p className="text-sm mt-2 uppercase tracking-widest font-semibold" style={{ color: SUBTLE }}>Front Desk Check-In</p>
        </div>
        {kioskConfig?.loyaltyPromoText && (
          <div className="w-full max-w-[280px] rounded-2xl p-5 space-y-2" style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, boxShadow: SHADOW }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>{t.loyaltyRewards}</p>
            <p className="text-base leading-relaxed" style={{ color: MUTED }}>{kioskConfig.loyaltyPromoText}</p>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8">
        <div className="text-center mb-1">
          <p className="text-2xl font-bold" style={{ color: TEXT }}>{t.enterPhone}</p>
          <p className="text-base mt-1" style={{ color: SUBTLE }}>{t.infoNeverShared}</p>
        </div>
        <div className="rounded-2xl px-10 py-4 min-w-[320px] text-center" style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, boxShadow: SHADOW }}>
          <span className="text-5xl font-mono tracking-[0.12em]" style={{ color: phone ? TEXT : BORDER }}>
            {phone ? fmtPhone(phone) : "•••  •••  ••••"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["1","2","3","4","5","6","7","8","9"].map(d => (
            <button key={d} onPointerDown={e => { e.preventDefault(); handleDigit(d); }}
              className="w-24 h-24 rounded-2xl text-3xl font-bold transition-all active:scale-90"
              style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: TEXT, boxShadow: SHADOW }}>{d}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <button onPointerDown={e => { e.preventDefault(); setPhone(p => p.slice(0, -1)); kick(); }}
            className="w-24 h-24 rounded-2xl text-2xl transition-all active:scale-90"
            style={{ background: "#fef2f2", border: "1.5px solid #fecaca", color: "#ef4444", boxShadow: SHADOW }}>⌫</button>
          <button onPointerDown={e => { e.preventDefault(); handleDigit("0"); }}
            className="w-24 h-24 rounded-2xl text-3xl font-bold transition-all active:scale-90"
            style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: TEXT, boxShadow: SHADOW }}>0</button>
          <button onPointerDown={e => { e.preventDefault(); if (phone.length === 10) doLookup(phone); }}
            disabled={phone.length < 10}
            className="w-24 h-24 rounded-2xl text-3xl font-bold text-white transition-all active:scale-90 disabled:opacity-30"
            style={{ background: phone.length < 10 ? "#d1d5db" : PRIMARY, boxShadow: phone.length < 10 ? "none" : SHADOW }}>→</button>
        </div>
        <div className="flex gap-3 mt-1">
          <GhostBtn onPress={resetToIdle}>{t.cancel}</GhostBtn>
        </div>
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
        <PrimaryBtn onPress={() => newClientName.trim() && setScreen("checked_in_generic")} disabled={!newClientName.trim()}>
          {t.continueBtn}
        </PrimaryBtn>
      </div>
    </div>
  );

  if (screen === "checked_in_generic") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 px-12" style={{ ...NO_SELECT, background: BG }}>
      <div className="w-32 h-32 rounded-full flex items-center justify-center shadow-2xl"
        style={{ background: `linear-gradient(135deg, ${PRIMARY}, #a78bfa)`, boxShadow: SHADOW_LG }}>
        <span className="text-white text-6xl font-black">✓</span>
      </div>
      <div className="text-center space-y-3 max-w-xl">
        <h1 className="text-6xl font-black leading-tight" style={{ color: TEXT }}>{t.youreCheckedIn(clientFirst)}</h1>
        <p className="text-2xl" style={{ color: MUTED }}>{t.seeFrontDesk}</p>
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
          style={{ background: "radial-gradient(circle at center, rgba(232,72,145,0.10) 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-100px] left-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(167,139,250,0.12) 0%, transparent 70%)" }} />
        <div className="relative z-10 flex flex-col items-center gap-8 px-12 max-w-2xl w-full">
          <div className="w-32 h-32 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${PRIMARY}, #a78bfa)`, boxShadow: SHADOW_LG }}>
            <span className="text-white text-6xl font-black">✓</span>
          </div>
          <div className="text-center">
            <h1 className="text-6xl font-black leading-tight" style={{ color: TEXT }}>{t.youreCheckedIn(clientFirst)}</h1>
            <p className="text-xl mt-3" style={{ color: MUTED }}>{t.appointmentConfirmed}</p>
          </div>
          <div className="w-full rounded-3xl overflow-hidden" style={{ background: SURFACE, border: `2px solid ${BORDER}`, boxShadow: SHADOW_LG }}>
            <div className="px-8 py-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${PRIMARY}18, #a78bfa12)`, borderBottom: `1.5px solid ${BORDER}` }}>
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

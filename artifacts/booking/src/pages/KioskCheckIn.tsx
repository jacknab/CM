import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { printNativeCheckinTicket, slipServiceNames } from "../lib/native-checkin-ticket";
import { useParams } from "react-router-dom";
import { NailChoiceStep } from "./kiosk/NailChoiceStep";
import { QRCodeCanvas } from "qrcode.react";
import { KIOSK_LANGS, LangCode, translations } from "../lib/kioskTranslations";
import { isValidNanpPrefix } from "../lib/phone-validation";
import { useShake } from "../hooks/use-shake";
import { kioskFetch, isKioskDeviceAuthorized } from "../lib/kioskDevice";
import KioskPairing from "../components/kiosk/KioskPairing";
import KioskSuspendedScreen from "../components/kiosk/KioskSuspendedScreen";

type Screen =
  | "idle" | "phone" | "loading" | "welcome"
  | "name_entry" | "service_type" | "services" | "service_options"
  | "nail_size" | "nail_shape" | "nail_effects"
  | "addons" | "stylist" | "review" | "ticket"
  | "appointment_confirmed" | "error" | "closed" | "wait_confirm" | "fully_booked"
  | "waitlist_added" | "no_thanks" | "suspended" | "pair";

interface NailOption {
  nailVocabId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  swatchHex: string | null;
  priceAdjustment: number;
  durationAdjustment: number;
  isDefault: boolean;
}
interface NailConfig {
  enabled: boolean;
  lengthRequired?: boolean;
  shapeRequired?: boolean;
  artRequired?: boolean;
  sizes: NailOption[];
  shapes: NailOption[];
  effects: NailOption[];
  /** Kiosk artwork uploaded in the admin Illustration library: slug → picture (shared/kioskArt.ts). */
  art?: Record<string, string>;
}

interface ServiceOptionItem  { id: number; name: string; description?: string | null; durationMinutes: number; price: number; isDefault: boolean; displayOrder: number; imageUrl?: string | null; }
interface ServiceItem        { id: number; optionId?: number; name: string; description?: string | null; duration: number; longevity?: string | null; price: number; category: string; imageUrl?: string | null; optionCount?: number; }
interface AddonItem          { id: number; name: string; description?: string | null; price: number; duration: number; imageUrl?: string | null; serviceIds: number[]; }
interface StaffItem          { id: number; name: string; role: string | null; color: string | null; avatarThumbUrl: string | null; }
interface ClientInfo         { id: number; name: string; loyaltyPoints: number; totalVisits: number; }
/** Smart Check-In — what this client's history suggests for today (server: lib/smartCheckin.ts). */
interface SmartInfo {
  lastVisit: { serviceName: string; daysAgo: number } | null;
  recommendation: { kind: "refill" | "choice" | "again" | "usual"; serviceIds: number[]; basedOn: { serviceName: string; daysAgo: number } } | null;
  addonIds: number[];
}
interface StoreConfig        { name: string; phone: string; address: string; }
interface KioskConfig        { kioskEnabled: boolean; welcomeHeadline: string | null; welcomeSubText: string | null; loyaltyPromoText: string | null; categoryImages: Record<string, string> | null; timezone: string | null; showServicePrice: boolean; showServiceDuration: boolean; dualScreenMode: boolean; }
interface TicketData         { token: string; clientName: string; appointmentId: number | null; ticketNumber?: number | null; services: ServiceItem[]; addons?: AddonItem[]; staffName: string | null; }
interface TodayAppointment   { id: number; serviceName: string; staffName: string | null; staffAvatarThumbUrl: string | null; appointmentTime: string; }

const QWERTY: string[][] = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
];

// ─── Colour palette ───────────────────────────────────────────────────────────
// These are read every time a screen is drawn, so the whole kiosk changes colour when a palette is
// applied (applyKioskPalette, below). Default: the original lavender / rose-pink kiosk.
let BG        = "#f5f3ff";                // lavender-white main bg
let SURFACE   = "#ffffff";                // card surface
let PRIMARY   = "#e84891";               // rose-pink CTA
let PRIMARY_D = "#cf3a7e";               // darker pink (pressed)
let PRIMARY_S = "#fdf2f8";               // very-light pink tint
let BORDER    = "#e9e3f5";               // soft border
let SHADOW    = "0 2px 8px rgba(80,0,120,0.07), 0 1px 3px rgba(0,0,0,0.05)";
let SHADOW_LG = "0 8px 32px rgba(80,0,120,0.10), 0 2px 8px rgba(0,0,0,0.06)";
let TEXT      = "#18111a";               // near-black
let MUTED     = "#6b6580";               // mid-grey-purple
let SUBTLE    = "#a89ec0";               // light purple-grey
let GOLD      = "#f59e0b";               // amber star
let ACCENT    = "#a78bfa";               // second colour of the accent gradients
let TINT      = "#f0eeff";               // empty picture areas
let PANEL_END = "#7c3aed";               // far end of the full-height promo panel
let PILL_BG = "#fffbeb", PILL_BORDER = "#fde68a", PILL_TEXT = "#92400e";   // loyalty-points pills
let OK_BG = "#f0fdf4", OK_BORDER = "#86efac", OK_SOLID = "#22c55e", OK_TEXT = "#16a34a", OK_SOFT = "#f0fdf9"; // confirmations
/** True while the nail-salon look is on: serif headings, line icons instead of emoji, the blush palette. */
let NAIL_LOOK = false;

/**
 * The nail-salon kiosk look, taken from the salon's reference artwork: warm cream and blush surfaces,
 * deep-brown serif headings, soft-brown text, thin tan borders and copper accents.
 */
const NAIL_PALETTE = {
  BG: "#f7ede6", SURFACE: "#fffaf6", PRIMARY: "#b9785c", PRIMARY_D: "#9c6148", PRIMARY_S: "#f8e4dc",
  BORDER: "#e2c9ba",
  SHADOW: "0 2px 8px rgba(96,56,36,0.08), 0 1px 3px rgba(60,36,24,0.05)",
  SHADOW_LG: "0 10px 34px rgba(96,56,36,0.13), 0 2px 8px rgba(60,36,24,0.06)",
  TEXT: "#3b2a26", MUTED: "#6f5a52", SUBTLE: "#a8928a", GOLD: "#c0915e",
  ACCENT: "#d9a48c", TINT: "#f6e6dd", PANEL_END: "#8a5a45",
  PILL_BG: "#f8e4dc", PILL_BORDER: "#e2c9ba", PILL_TEXT: "#7a4d3a",
  OK_BG: "#f3ece2", OK_BORDER: "#cbb79d", OK_SOLID: "#8c7a5b", OK_TEXT: "#6d5d43", OK_SOFT: "#f6efe7",
};

/** Switch the kiosk to the nail-salon look (or back). The caller re-renders afterwards. */
function applyKioskPalette(nail: boolean): void {
  if (nail === NAIL_LOOK) return;
  NAIL_LOOK = nail;
  const p = nail ? NAIL_PALETTE : {
    BG: "#f5f3ff", SURFACE: "#ffffff", PRIMARY: "#e84891", PRIMARY_D: "#cf3a7e", PRIMARY_S: "#fdf2f8", BORDER: "#e9e3f5",
    SHADOW: "0 2px 8px rgba(80,0,120,0.07), 0 1px 3px rgba(0,0,0,0.05)", SHADOW_LG: "0 8px 32px rgba(80,0,120,0.10), 0 2px 8px rgba(0,0,0,0.06)",
    TEXT: "#18111a", MUTED: "#6b6580", SUBTLE: "#a89ec0", GOLD: "#f59e0b", ACCENT: "#a78bfa", TINT: "#f0eeff", PANEL_END: "#7c3aed",
    PILL_BG: "#fffbeb", PILL_BORDER: "#fde68a", PILL_TEXT: "#92400e",
    OK_BG: "#f0fdf4", OK_BORDER: "#86efac", OK_SOLID: "#22c55e", OK_TEXT: "#16a34a", OK_SOFT: "#f0fdf9",
  };
  BG = p.BG; SURFACE = p.SURFACE; PRIMARY = p.PRIMARY; PRIMARY_D = p.PRIMARY_D; PRIMARY_S = p.PRIMARY_S; BORDER = p.BORDER;
  SHADOW = p.SHADOW; SHADOW_LG = p.SHADOW_LG; TEXT = p.TEXT; MUTED = p.MUTED; SUBTLE = p.SUBTLE; GOLD = p.GOLD;
  ACCENT = p.ACCENT; TINT = p.TINT; PANEL_END = p.PANEL_END;
  PILL_BG = p.PILL_BG; PILL_BORDER = p.PILL_BORDER; PILL_TEXT = p.PILL_TEXT;
  OK_BG = p.OK_BG; OK_BORDER = p.OK_BORDER; OK_SOLID = p.OK_SOLID; OK_TEXT = p.OK_TEXT; OK_SOFT = p.OK_SOFT;
}

/**
 * A pictogram. The default kiosk uses emoji. The nail-salon look uses none at all (its reference artwork is
 * type and illustration only): it leaves an invisible marker, and index.css hides whatever badge or disc
 * existed only to hold the pictogram.
 */
function G(emoji: string): React.ReactNode {
  return NAIL_LOOK ? <i className="kx-g" aria-hidden /> : emoji;
}

/** Remembered per kiosk address, so a nail salon's kiosk opens in its own look instead of flashing the default. */
const nailLookKey = () => `certxa.kiosk.nailLook.${typeof window !== "undefined" ? window.location.pathname : ""}`;
const NO_SELECT: React.CSSProperties = { WebkitUserSelect: "none", userSelect: "none" };

// ─── Category colours (lighter versions for light theme) ─────────────────────
const CAT: Record<string, { from: string; to: string; emoji: string; soft: string }> = {
  hair:      { from: "#f472b6", to: "#f43f5e", emoji: "✂️",  soft: "#fdf2f8" },
  color:     { from: "#a78bfa", to: "#818cf8", emoji: "🎨",  soft: "#f5f3ff" },
  colour:    { from: "#a78bfa", to: "#818cf8", emoji: "🎨",  soft: "#f5f3ff" },
  nails:     { from: "#34d399", to: "#2dd4bf", emoji: "💅",  soft: "#f0fdf9" },
  nail:      { from: "#34d399", to: "#2dd4bf", emoji: "💅",  soft: "#f0fdf9" },
  skin:      { from: "#fb923c", to: "#fbbf24", emoji: "✨",  soft: "#fff7ed" },
  facial:    { from: "#f472b6", to: "#fb923c", emoji: "🌸",  soft: "#fdf2f8" },
  face:      { from: "#f472b6", to: "#fb923c", emoji: "🌸",  soft: "#fdf2f8" },
  waxing:    { from: "#60a5fa", to: "#818cf8", emoji: "💫",  soft: "#eff6ff" },
  wax:       { from: "#60a5fa", to: "#818cf8", emoji: "💫",  soft: "#eff6ff" },
  barbering: { from: "#94a3b8", to: "#64748b", emoji: "💈",  soft: "#f8fafc" },
  barber:    { from: "#94a3b8", to: "#64748b", emoji: "💈",  soft: "#f8fafc" },
  massage:   { from: "#2dd4bf", to: "#38bdf8", emoji: "🌊",  soft: "#f0fdfa" },
  lash:      { from: "#e879f9", to: "#f472b6", emoji: "👁️", soft: "#fdf4ff" },
  brow:      { from: "#fbbf24", to: "#f97316", emoji: "🎯",  soft: "#fffbeb" },
  makeup:    { from: "#e879f9", to: "#c026d3", emoji: "💄",  soft: "#fdf4ff" },
  threading: { from: "#fb923c", to: "#f97316", emoji: "🧵",  soft: "#fff7ed" },
};

function getCat(cat: string) {
  const key = (cat ?? "").toLowerCase().split(/[\s,_\/]/)[0];
  // The nail-salon look keeps every category in its own blush and copper, not the rainbow below.
  if (NAIL_LOOK) return { from: ACCENT, to: PRIMARY, emoji: "", soft: TINT };
  return CAT[key] ?? { from: "#e84891", to: "#f472b6", emoji: "⭐", soft: "#fdf2f8" };
}

function fmtPhone(p: string) {
  if (p.length <= 3) return p;
  if (p.length <= 6) return `(${p.slice(0,3)}) ${p.slice(3)}`;
  return `(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`;
}

/**
 * Normalize a person's name for display: "JANE" → "Jane", "MARY-JANE O'BRIEN" →
 * "Mary-Jane O'Brien". Clients are often stored/entered in all-caps, which looks
 * like shouting on the kiosk greeting.
 */
function fmtName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\p{L}][\p{L}\p{M}'’]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

// ─── Pill button variants ─────────────────────────────────────────────────────
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

function GhostBtn({ children, onPress, size = "md" }: {
  children: React.ReactNode; onPress: () => void; size?: "sm"|"md"|"lg";
}) {
  const pad = size === "sm" ? "px-5 py-2.5 text-sm" : "px-8 py-3.5 text-lg";
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onPress(); }}
      className={`${pad} rounded-2xl font-semibold transition-all active:scale-95`}
      style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: MUTED, boxShadow: SHADOW }}
    >{children}</button>
  );
}

// ── Animated countdown ring with poking finger ────────────────────────────────
function CountdownWidget({ seconds }: { seconds: number }) {
  const total = 30;
  const r     = 52;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * Math.max(0, seconds / total);

  return (
    <>
      <style>{`
        @keyframes ck-poke {
          0%   { transform: translateX(-50%) translateY(0); }
          35%  { transform: translateX(-50%) translateY(26px); }
          65%  { transform: translateX(-50%) translateY(26px); }
          100% { transform: translateX(-50%) translateY(0); }
        }
        @keyframes ck-hand-fade {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        .ck-hand-ptr {
          animation:
            ck-poke      1.9s ease-in-out 3,
            ck-hand-fade 1.1s ease-in    5.7s forwards;
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* Ring + finger wrapper */}
        <div style={{ position: "relative", width: 124, height: 124 }}>
          {/* Pointing hand */}
          <div
            className="ck-hand-ptr"
            style={{
              position: "absolute",
              top: -48,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 38,
              lineHeight: 1,
              zIndex: 10,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {G("👆")}
          </div>

          {/* SVG ring — rotated so arc starts at 12 o'clock */}
          <svg width="124" height="124" style={{ display: "block", transform: "rotate(-90deg)" }}>
            {/* Track */}
            <circle cx="62" cy="62" r={r} fill="none" stroke="#e9e3f5" strokeWidth="10" />
            {/* Progress arc */}
            <circle
              cx="62" cy="62" r={r}
              fill="none"
              stroke={PRIMARY}
              strokeWidth="10"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.95s linear" }}
            />
          </svg>

          {/* Number in the centre */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 38, fontWeight: 900, color: TEXT, lineHeight: 1 }}>{seconds}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: "0.06em", marginTop: 3 }}>
              SEC
            </span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: SUBTLE, margin: 0 }}>Returning to home…</p>
      </div>
    </>
  );
}

const CARDS_PER_PAGE = 8; // 4 × 2 — guaranteed to fit on screen without scroll

// ─── Idle reset ──────────────────────────────────────────────────────────────
const IDLE_MS = 2 * 60_000;
/** The nail length / shape / design steps. */
const NAIL_IDLE_MS = 8 * 60_000;
const STILL_THERE_SECONDS = 20;

/** Seconds left on the "still there?" sheet (null = not showing). Kept outside the kiosk component because
 *  every kiosk screen is its own full-page return; the sheet is drawn once, over whichever is up. */
const stillThere = {
  left: null as number | null,
  strings: translations.en as (typeof translations)[LangCode],
  subs: new Set<() => void>(),
  set(n: number | null) { if (n === this.left) return; this.left = n; this.subs.forEach((f) => f()); },
};

function StillThereSheet() {
  const left = useSyncExternalStore((f) => { stillThere.subs.add(f); return () => { stillThere.subs.delete(f); }; }, () => stillThere.left);
  if (left == null) return null;
  const t = stillThere.strings;
  // A touch anywhere answers it: the kiosk's own touch listener clears the sheet, and this layer keeps
  // that touch from also pressing whatever is underneath.
  return (
    <div className="kx-sheet-fade fixed inset-0 flex items-end" style={{ zIndex: 1000, background: "rgba(30,20,18,.32)" }} data-testid="kiosk-still-there">
      <div className="kx-sheet-rise w-full flex items-center justify-between gap-6 flex-wrap"
        style={{ background: SURFACE, borderTop: `1px solid ${BORDER}`, borderRadius: "26px 26px 0 0", boxShadow: "0 -14px 40px rgba(30,20,18,.2)", padding: "28px clamp(24px, 5vw, 72px) 32px" }}>
        <div>
          <h3 className="font-bold" style={{ fontSize: "clamp(26px, 3.2vw, 40px)", color: TEXT, lineHeight: 1.15 }}>{t.stillThere}</h3>
          <p style={{ marginTop: 6, fontSize: "clamp(16px, 1.8vw, 22px)", color: MUTED }}>{t.stillThereSub.replace("{n}", String(left))}</p>
        </div>
        <div className="flex items-center gap-5">
          <span className="font-bold tabular-nums" style={{ fontSize: "clamp(34px, 4vw, 52px)", color: PRIMARY, minWidth: "1.6em", textAlign: "center" }} data-testid="kiosk-still-there-count">{left}</span>
          <button type="button" className="rounded-full font-bold text-white" style={{ background: PRIMARY, padding: "18px 40px", fontSize: "clamp(18px, 2vw, 24px)", boxShadow: SHADOW }}>{t.stillHere}</button>
        </div>
      </div>
    </div>
  );
}

export default function KioskCheckIn() {
  return <><KioskCheckInScreens /><StillThereSheet /></>;
}

function KioskCheckInScreens() {
  const { slug } = useParams<{ slug: string }>();
  const [screen, setScreen]               = useState<Screen>("idle");
  const [storeId, setStoreId]             = useState<number | null>(null);
  const [storeConfig, setStoreConfig]     = useState<StoreConfig | null>(null);
  const [kioskConfig, setKioskConfig]     = useState<KioskConfig | null>(null);
  // The look (palette, serif headings) is module state read on every draw; this re-draws when it changes.
  const [lookTick, setLookTick] = useState(() => {
    try { if (localStorage.getItem(nailLookKey()) === "1") applyKioskPalette(true); } catch { /* private mode */ }
    return 0;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("kx-nail", NAIL_LOOK);
    return () => { document.documentElement.classList.remove("kx-nail"); };
  }, [lookTick]);
  const [allServices, setAllServices]     = useState<ServiceItem[]>([]);
  const [allStaff, setAllStaff]           = useState<StaffItem[]>([]);
  const [phone, setPhone]                 = useState("");
  const { shakeClass, shake, onShakeEnd } = useShake();
  const [clientInfo, setClientInfo]       = useState<ClientInfo | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [selectedServices, setSel]        = useState<ServiceItem[]>([]);
  const [selectedStaff, setSelStaff]      = useState<StaffItem | null | "none">("none");
  const [ticket, setTicket]               = useState<TicketData | null>(null);
  const [error, setError]                 = useState("");
  const [countdown, setCountdown]         = useState(30);
  const [svcPage, setSvcPage]             = useState(0);
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState<string | null>(null);
  const [filteredServices, setFilteredServices] = useState<ServiceItem[] | null>(null);
  const [todayAppointment, setTodayAppointment] = useState<TodayAppointment | null>(null);
  const [waitInfo, setWaitInfo]               = useState<{ estimatedMinutes: number } | null>(null);
  const [allAddons, setAllAddons]             = useState<AddonItem[]>([]);
  // Smart Check-In: the suggestion for this client, and what was actually put in front of them this
  // check-in (reported with the ticket, so suggestions can be measured against paid tickets).
  const [smart, setSmart] = useState<SmartInfo | null>(null);
  const offeredRef = useRef<{ serviceIds: number[]; addonId: number | null }>({ serviceIds: [], addonId: null });
  // A suggested service chosen while everyone is busy: carried through the "would you like to wait?" screen.
  const waitingServiceRef = useRef<ServiceItem | null>(null);
  const [selectedAddons, setSelectedAddons]   = useState<AddonItem[]>([]);
  const [availableAddons, setAvailableAddons] = useState<AddonItem[]>([]);
  const [busyStaffIds, setBusyStaffIds]       = useState<number[]>([]);
  const [staffServiceIds, setStaffServiceIds] = useState<Record<number, number[]>>({});
  const [lang, setLang]                       = useState<LangCode>("en");
  const [serviceOptionsMap, setServiceOptionsMap] = useState<Record<number, ServiceOptionItem[]>>({});
  const [parentServiceForOptions, setParentServiceForOptions] = useState<ServiceItem | null>(null);
  const [selectedOption, setSelectedOption]   = useState<ServiceOptionItem | null>(null);
  // Nail configuration (length / shape / effect) for fake-nail services
  const [nailCfg, setNailCfg]     = useState<NailConfig | null>(null);
  const [nailSize, setNailSize]   = useState<NailOption | null>(null);
  const [nailShape, setNailShape] = useState<NailOption | null>(null);
  const [nailEffect, setNailEffect] = useState<NailOption | null>(null); // null = "plain / no design"

  // ── Dual Screen POS checkout overlay state ────────────────────────────────
  const [posCheckout, setPosCheckout] = useState<null | "cart" | "tip" | "thankyou">(null);
  const [posTotal, setPosTotal]       = useState(0);
  const [posTipPct, setPosTipPct]     = useState<number | null>(null);
  const [posTipAmt, setPosTipAmt]     = useState(0);

  const idleRef     = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const warnRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set when typing a phone number put the client on staff's Arrived list; cleared once they check in.
  const markerTokenRef = useRef<string | null>(null);
  const cdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const kioskWsRef  = useRef<WebSocket | null>(null);
  const posResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A kiosk tablet is meant to stay powered on and mounted for days at a
  // time without ever being restarted, so a one-time fetch here means any
  // service/price/staff/settings change the owner makes never reaches the
  // kiosk until someone manually reloads it. `applyConfig` re-runs the same
  // parse on a timer (see effect below) to keep the catalog data live.
  const applyConfig = useCallback((d: any, isInitialLoad: boolean) => {
    if (d.accountSuspended) {
      setStoreId(d.storeId ?? null);
      setStoreConfig(d.store ?? null);
      setScreen("suspended");
      return;
    }
    if (d.error) {
      if (isInitialLoad) { setError(d.error); setScreen("error"); }
      return;
    }
    // The account is not permitted to use the kiosk (a platform-admin setting, checked on every
    // refresh so switching it off closes a kiosk that is already running).
    if (d.kioskPermitted === false) {
      setStoreId(d.store?.id ?? d.storeId ?? null);
      setStoreConfig(d.store);
      setScreen("closed");
      return;
    }
    setStoreId(d.store?.id ?? d.storeId ?? null);
    setStoreConfig(d.store);
    setAllServices(d.services || []);
    setAllStaff(d.staff || []);
    setAllAddons(d.addons || []);
    setBusyStaffIds(d.busyStaffIds || []);
    setStaffServiceIds(d.staffServiceIds || {});
    setKioskConfig({ kioskEnabled: d.kioskEnabled !== false, welcomeHeadline: d.welcomeHeadline ?? null, welcomeSubText: d.welcomeSubText ?? null, loyaltyPromoText: d.loyaltyPromoText ?? null, categoryImages: d.categoryImages ?? null, timezone: d.timezone ?? null, showServicePrice: d.showServicePrice !== false, showServiceDuration: d.showServiceDuration !== false, dualScreenMode: d.dualScreenMode === true });
    setServiceOptionsMap(d.serviceOptionsMap ?? {});
    // Nail salons get the nail-salon look. Remembered for this kiosk address so the next start opens in it.
    const nailLook = d.serviceCheckin === true;
    try { localStorage.setItem(nailLookKey(), nailLook ? "1" : "0"); } catch { /* private mode */ }
    if (nailLook !== NAIL_LOOK) { applyKioskPalette(nailLook); setLookTick((n) => n + 1); }
    if (isInitialLoad) {
      if (d.kioskEnabled === false) setScreen("closed");
      else {
        setScreen("idle");
        // Check-in calls need a device the salon set up: signed in (the Certxa app), or paired once.
        if (slug) isKioskDeviceAuthorized(slug).then(ok => { if (!ok) setScreen("pair"); });
      }
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/kiosk/${slug}/config`)
      .then(r => r.json())
      .then(d => applyConfig(d, true))
      .catch(() => { setError("Failed to connect."); setScreen("error"); });
  }, [slug, applyConfig]);

  // Periodic background refresh of the catalog (services/staff/addons/pricing/
  // kiosk settings) — only while idle, so an in-progress customer check-in is
  // never disturbed. Also re-syncs immediately every time the kiosk returns to
  // idle, so changes made mid-day show up for the very next customer instead
  // of waiting up to a full interval.
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

  // ── WebSocket: account_status_changed + dual-screen POS checkout events ──
  useEffect(() => {
    if (!storeId) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    let ws: WebSocket;
    let destroyed = false;
    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${storeId}`);
      kioskWsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "account_status_changed") {
            const status = String(msg.accountStatus ?? "").toLowerCase();
            if (status === "suspended" || status === "canceled") {
              setScreen("suspended");
            } else if (status === "active") {
              window.location.reload();
            }
          }
          // ── Dual-screen POS checkout (cart / tip / thank-you) — RETIRED ──────
          // The customer-facing checkout + tip flow now lives on the dedicated
          // front-desk display (`/frontdesk/:slug`, FrontDeskDisplay.tsx). This
          // kiosk no longer reacts to `kiosk_checkout_*` events; the overlay
          // renderer below is likewise disabled. Kept commented for reference /
          // easy rollback.
          //
          // if (msg.type === "kiosk_checkout_start") {
          //   setPosTotal(Number(msg.total) || 0);
          //   setPosTipPct(null);
          //   setPosTipAmt(0);
          //   setPosCheckout("cart");
          //   if (posResetRef.current) clearTimeout(posResetRef.current);
          // }
          // if (msg.type === "kiosk_checkout_tip_request") {
          //   setPosTotal(Number(msg.total) || 0);
          //   setPosTipPct(null);
          //   setPosTipAmt(0);
          //   setPosCheckout("tip");
          // }
          // if (msg.type === "kiosk_checkout_payment_result") {
          //   if (msg.success) {
          //     if (msg.total != null) setPosTotal(Number(msg.total) || 0);
          //     setPosCheckout("thankyou");
          //     if (posResetRef.current) clearTimeout(posResetRef.current);
          //     posResetRef.current = setTimeout(() => {
          //       setPosCheckout(null);
          //       setPosTipPct(null);
          //       setPosTipAmt(0);
          //     }, 15_000);
          //   } else {
          //     setPosCheckout("cart");
          //   }
          // }
          // if (msg.type === "kiosk_checkout_cancel") {
          //   if (posResetRef.current) clearTimeout(posResetRef.current);
          //   setPosCheckout(null);
          //   setPosTipPct(null);
          //   setPosTipAmt(0);
          // }
        } catch {}
      };
      ws.onclose = () => { kioskWsRef.current = null; if (!destroyed) setTimeout(connect, 5_000); };
    };
    connect();
    return () => { destroyed = true; ws?.close(); kioskWsRef.current = null; };
  }, [storeId]);

  const sendKioskEvent = (type: string, payload: Record<string, unknown> = {}) => {
    const ws = kioskWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, ...payload }));
  };

  // ── Polling fallback: re-check config every 10 s when suspended ──
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

  // A returning client's number put them on staff's Arrived list (the lookup). If they leave
  // before checking in, by "No thanks" or by the screen timing out, take them back off it.
  const cancelPendingMarker = useCallback(() => {
    const tok = markerTokenRef.current;
    markerTokenRef.current = null;
    if (tok && slug) kioskFetch(slug, `/api/public/kiosk/${slug}/checkin/${tok}/cancel`, { method: "POST" }).catch(() => {});
  }, [slug]);

  const resetToIdle = useCallback(() => {
    cancelPendingMarker();
    setScreen("idle"); setPhone(""); setClientInfo(null);
    setNewClientName(""); setSel([]); setSelStaff("none");
    setTicket(null); setError("");
    setSvcPage(0);
    setSelectedCategoryGroup(null); setFilteredServices(null);
    setTodayAppointment(null); setWaitInfo(null);
    setSelectedAddons([]); setAvailableAddons([]);
    setParentServiceForOptions(null); setSelectedOption(null);
    setNailCfg(null); setNailSize(null); setNailShape(null); setNailEffect(null);
    setSmart(null); offeredRef.current = { serviceIds: [], addonId: null }; waitingServiceRef.current = null;
    if (cdownRef.current) clearInterval(cdownRef.current);
  }, [cancelPendingMarker]);

  useEffect(() => {
    if (screen === "ticket" || screen === "appointment_confirmed" || screen === "no_thanks" || screen === "waitlist_added") {
      setCountdown(30);
      cdownRef.current = setInterval(() => {
        setCountdown(p => { if (p <= 1) { resetToIdle(); return 0; } return p - 1; });
      }, 1000);
    }
    return () => { if (cdownRef.current) clearInterval(cdownRef.current); };
  }, [screen, resetToIdle]);

  // The server refused because of how this kiosk is set up, not because of the customer.
  const handleGateRefusal = (status: number, d: any): boolean => {
    if (d?.accountSuspended) { setScreen("suspended"); return true; }
    if (status === 401 && d?.code === "device_not_paired") { setScreen("pair"); return true; }
    if (d?.kioskClosed) { setScreen("closed"); return true; }
    return false;
  };

  // Check real-time availability and route accordingly
  const checkAvailabilityAndRoute = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/kiosk/${slug}/availability`);
      const d = await r.json();
      if (d.hasAvailableStaff || d.error) {
        setScreen("service_type");
      } else {
        const mins: number = d.estimatedWaitMinutes ?? 30;
        setWaitInfo({ estimatedMinutes: mins });
        // >60 min wait → fully booked screen with no-show waitlist offer
        setScreen(mins > 60 ? "fully_booked" : "wait_confirm");
      }
    } catch {
      setScreen("service_type"); // fail open — don't block check-in on a network error
    }
  }, [slug]);

  // Join no-show waitlist when fully booked
  const doJoinWaitlist = useCallback(async () => {
    setScreen("loading");
    try {
      const r = await kioskFetch(slug!, `/api/public/kiosk/${slug}/noshow-waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: clientInfo?.name ?? (newClientName.trim() || "Walk-in Guest"),
          clientId: clientInfo?.id ?? null,
        }),
      });
      const d = await r.json();
      if (handleGateRefusal(r.status, d)) return;
      if (d.success) {
        setScreen("waitlist_added");
      } else {
        setError(d.error || "Failed to join waitlist");
        setScreen("error");
      }
    } catch {
      setError("Connection error. Please try again.");
      setScreen("error");
    }
  }, [slug, phone, clientInfo, newClientName]);

  // Idle reset. After a stretch with no touch the "still there?" sheet counts down, and only then does the
  // kiosk start over. The nail length / shape / design steps get much longer: clients study those.
  const kick = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    if (warnRef.current) clearInterval(warnRef.current);
    stillThere.set(null);
    if (screen === "idle" || screen === "ticket") return;
    const nailStep = screen === "nail_size" || screen === "nail_shape" || screen === "nail_effects";
    idleRef.current = setTimeout(() => {
      let left = STILL_THERE_SECONDS;
      stillThere.set(left);
      warnRef.current = setInterval(() => {
        left -= 1;
        if (left > 0) return stillThere.set(left);
        if (warnRef.current) clearInterval(warnRef.current);
        stillThere.set(null);
        resetToIdle();
      }, 1000);
    }, nailStep ? NAIL_IDLE_MS : IDLE_MS);
  }, [screen, resetToIdle]);

  useEffect(() => {
    kick();
    return () => { if (idleRef.current) clearTimeout(idleRef.current); if (warnRef.current) clearInterval(warnRef.current); stillThere.set(null); };
  }, [screen, phone, kick]);

  // Any touch anywhere counts as activity (and answers the "still there?" sheet).
  const kickRef = useRef(kick);
  kickRef.current = kick;
  useEffect(() => {
    const onTouch = () => kickRef.current();
    document.addEventListener("pointerdown", onTouch, true);
    document.addEventListener("keydown", onTouch, true);
    return () => { document.removeEventListener("pointerdown", onTouch, true); document.removeEventListener("keydown", onTouch, true); };
  }, []);

  const handleDigit = (d: string) => {
    if (phone.length >= 10) return;
    const next = phone + d;
    // Not a possible US number (bad area code / exchange): shake, refuse just this digit, keep what's typed.
    if (!isValidNanpPrefix(next)) { shake(); kick(); return; }
    setPhone(next); kick();
    if (next.length === 10) doLookup(next);
  };

  // Print the check-in slip (number bar + "BK:{appointmentId}" QR). Native kiosk prints on its own
  // locally configured printer. Browser kiosks (or a failed native print) keep the existing POS relay.
  const printCheckinSlip = async (slip: {
    clientName: string;
    staffName?: string;
    services: unknown[];
    appointmentId: number | null | undefined;
    ticketNumber: number | null | undefined;
    todayCount?: number;
  }) => {
    let printedLocally = false;
    if (slip.ticketNumber != null && slip.appointmentId != null) {
      printedLocally = await printNativeCheckinTicket({
        clientName: slip.clientName || "Guest",
        ticketNumber: Number(slip.ticketNumber),
        qrValue: `BK:${slip.appointmentId}`,
        todayCount: slip.todayCount,
        services: slipServiceNames(slip.services),
      });
    }
    if (!printedLocally) {
      const now = new Date();
      const storeTz = kioskConfig?.timezone || undefined;
      const tzOpts = storeTz ? { timeZone: storeTz } : {};
      const timeStr = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, ...tzOpts }).format(now);
      const dateStr = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...tzOpts }).format(now);
      sendKioskEvent("kiosk_print_job", {
        jobType: "checkin_ticket",
        storeName: storeConfig?.name ?? "",
        clientName: slip.clientName,
        staffName: slip.staffName,
        services: slip.services,
        appointmentId: slip.appointmentId,
        ticketNumber: slip.ticketNumber,
        bookingCode: `BK:${slip.appointmentId}`,
        todayCount: slip.todayCount,
        timeStr,
        dateStr,
      });
    }
  };

  const doLookup = async (p: string) => {
    setScreen("loading");
    try {
      const r = await kioskFetch(slug!, `/api/public/kiosk/${slug}/lookup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });
      const d = await r.json();
      if (handleGateRefusal(r.status, d)) return;
      markerTokenRef.current = d.checkin?.token ?? null;
      if (d.found) {
        setClientInfo(d.client);
        if (d.alreadyOnTicket) {
          // Already checked in for a booking, or already with a technician: nothing more to do here.
          setError(t.alreadyCheckedIn);
          setScreen("error");
        } else if (d.todayAppointment) {
          setTodayAppointment(d.todayAppointment);
          setScreen("appointment_confirmed");
          // A booked client is checked in right here by the lookup (no service/stylist steps
          // follow), so this is where their slip prints.
          void printCheckinSlip({
            clientName: d.client?.name ?? "",
            staffName: d.todayAppointment.staffName ?? undefined,
            services: d.todayAppointment.serviceName ? [{ name: d.todayAppointment.serviceName }] : [],
            appointmentId: d.todayAppointment.id,
            ticketNumber: d.todayAppointment.ticketNumber,
            todayCount: d.todayCount,
          });
        } else {
          setTodayAppointment(null);
          // A suggestion to make (and its services are on this kiosk's menu): the welcome screen waits for
          // the client's answer. Otherwise it greets them and moves on by itself, as before.
          const info: SmartInfo | null = d.smart ?? null;
          const suggested = (info?.recommendation?.serviceIds ?? []).filter((id) => allServices.some((sv) => sv.id === id));
          setSmart(info);
          offeredRef.current = { serviceIds: suggested, addonId: null };
          setScreen("welcome");
          if (!suggested.length) setTimeout(() => { checkAvailabilityAndRoute(); }, 1200);
        }
      } else {
        setScreen("name_entry");
      }
    } catch { setError("Connection error. Please try again."); setScreen("error"); }
  };

  const goToStylist = () => {
    // If the selected service has addons, go to the addon step first
    const selSvc = selectedServices[0];
    if (selSvc) {
      const addonsForService = allAddons.filter(
        a => a.serviceIds.length === 0 || a.serviceIds.includes(selSvc.id)
      );
      // An add-on this client has had before goes first and is marked — never pre-selected.
      const hadBefore = (smart?.addonIds ?? []).find((id) => addonsForService.some((a) => a.id === id)) ?? null;
      offeredRef.current = { ...offeredRef.current, addonId: hadBefore };
      setAvailableAddons(hadBefore == null ? addonsForService : [...addonsForService].sort((a, b) => Number(b.id === hadBefore) - Number(a.id === hadBefore)));
      if (addonsForService.length > 0) {
        setScreen("addons");
        return;
      }
    }
    // No addons — go straight to stylist, or to the summary
    if (allStaff.length > 0) setScreen("stylist");
    else setScreen("review");
  };

  // Smart Check-In: the client took the suggested service (or one of the two offered).
  const chooseSuggested = async (svc: ServiceItem) => {
    kick();
    setSel([svc]);
    if ((svc.optionCount ?? (serviceOptionsMap[svc.id]?.length ?? 0)) > 0) {
      setParentServiceForOptions(svc); setSelectedOption(null); setScreen("service_options");
      return;
    }
    setScreen("loading");
    try {
      const d = await (await fetch(`/api/public/kiosk/${slug}/availability`)).json();
      if (!d.hasAvailableStaff && !d.error) {
        const mins: number = d.estimatedWaitMinutes ?? 30;
        setWaitInfo({ estimatedMinutes: mins });
        waitingServiceRef.current = svc;
        setScreen(mins > 60 ? "fully_booked" : "wait_confirm");
        return;
      }
    } catch { /* fail open, as the normal route does */ }
    afterServiceChosen(svc);
  };

  // Called once a service is confirmed. Fake-nail services detour through
  // length → shape → effect before add-ons; everything else goes straight on.
  const afterServiceChosen = async (chosen?: ServiceItem) => {
    const selSvc = chosen ?? selectedServices[0];
    setNailCfg(null); setNailSize(null); setNailShape(null); setNailEffect(null);
    if (selSvc) {
      setScreen("loading");
      try {
        const r = await fetch(`/api/public/kiosk/${slug}/nail-config/${selSvc.id}`);
        const cfg: NailConfig = await r.json();
        if (cfg?.enabled && (cfg.sizes?.length || cfg.shapes?.length || cfg.effects?.length)) {
          setNailCfg(cfg);
          setScreen(cfg.sizes?.length ? "nail_size" : cfg.shapes?.length ? "nail_shape" : "nail_effects");
          kick();
          return;
        }
      } catch { /* fail open — skip the nail steps on any network/parse error */ }
    }
    goToStylist();
  };

  // Advance through the nail steps, skipping any dimension with no options.
  const nailStepNext = (from: "size" | "shape") => {
    kick();
    if (from === "size") {
      if (nailCfg?.shapes?.length)  return setScreen("nail_shape");
      if (nailCfg?.effects?.length) return setScreen("nail_effects");
      return goToStylist();
    }
    // from === "shape"
    if (nailCfg?.effects?.length) return setScreen("nail_effects");
    return goToStylist();
  };

  const doCheckIn = async () => {
    setScreen("loading");
    const staffIdToSend = selectedStaff && selectedStaff !== "none" ? (selectedStaff as StaffItem).id : null;
    try {
      const r = await kioskFetch(slug!, `/api/public/kiosk/${slug}/checkin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId:   clientInfo?.id ?? null,
          clientName: clientInfo?.name ?? (newClientName.trim() || "Walk-in Guest"),
          phone, services: selectedServices, addons: selectedAddons, staffId: staffIdToSend,
          // What was suggested this check-in and whether it ended up on the ticket.
          offers: [
            ...offeredRef.current.serviceIds.map((id) => ({ kind: "service", itemId: id, accepted: selectedServices[0]?.id === id })),
            ...(offeredRef.current.addonId != null ? [{ kind: "addon", itemId: offeredRef.current.addonId, accepted: selectedAddons.some((a) => a.id === offeredRef.current.addonId) }] : []),
          ],
          nailSizeId:      nailSize?.nailVocabId  ?? null,
          nailShapeId:     nailShape?.nailVocabId ?? null,
          nailArtEffectId: nailEffect?.nailVocabId ?? null,
        }),
      });
      const d = await r.json();
      if (handleGateRefusal(r.status, d)) return;
      if (d.success) {
        markerTokenRef.current = null; // the Arrived-list entry is now this ticket
        setTicket(d);
        setScreen("ticket");
        await printCheckinSlip({
          clientName: d.clientName ?? "",
          staffName: d.staffName ?? undefined,
          // The add-ons print under the services, marked "+", like the rest of the POS shows them.
          services: [...(d.services ?? []), ...(Array.isArray(d.addons) ? d.addons : []).map((a: any) => ({ name: `+ ${a?.name ?? ""}` }))],
          appointmentId: d.appointmentId,
          ticketNumber: d.ticketNumber,
          todayCount: d.todayCount,
        });
      }
      else if (r.status === 409 && d.appointmentId) { markerTokenRef.current = null; setError(t.alreadyCheckedIn); setScreen("error"); }
      else            { setError(d.error || "Check-in failed"); setScreen("error"); }
    } catch { setError("Connection error. Please try again."); setScreen("error"); }
  };

  const toggleSvc = (s: ServiceItem) => {
    // Single-select: tapping the same service deselects it; tapping a new one replaces the previous
    setSel(p => p.find(x => x.id === s.id) ? [] : [s]);
    setSelectedAddons([]); // reset addons when service changes
    kick();
  };

  const clientFirst = fmtName(clientInfo?.name?.split(" ")[0] ?? newClientName.split(" ")[0]) || "there";
  const ticketUrl   = ticket ? `${window.location.origin}/kiosk/${slug}/ticket/${ticket.token}` : "";
  const selTotal    = selectedServices.reduce((s, x) => s + x.price, 0);
  const selDur      = selectedServices.reduce((s, x) => s + x.duration, 0);
  const showPrice   = kioskConfig?.showServicePrice !== false;
  const showDuration = kioskConfig?.showServiceDuration !== false;
  const t = translations[lang];
  stillThere.strings = t;

  // ── SUSPENDED ───────────────────────────────────────────────────────────────
  // ── Dual Screen POS checkout overlay (cart / tip / thank-you) — RETIRED ──
  // Moved to the dedicated front-desk display (FrontDeskDisplay.tsx,
  // /frontdesk/:slug). The `kiosk_checkout_*` WS handlers above are commented
  // out, so `posCheckout` can never leave `null` and this overlay never renders.
  // The renderer is kept intact (unreachable) for reference / easy rollback.
  if (posCheckout !== null) {
    const POS_TIPS = [
      { label: "No Tip", pct: 0 },
      { label: "15%", pct: 15 },
      { label: "18%", pct: 18 },
      { label: "20%", pct: 20 },
      { label: "25%", pct: 25 },
    ];
    const calcTip = (pct: number) => Math.round(posTotal * pct) / 100;
    const tipAmt  = posTipPct !== null ? calcTip(posTipPct) : 0;
    const grandWithTip = posTotal + tipAmt;

    if (posCheckout === "cart") {
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", background: BG, zIndex: 9999, overflow: "hidden", ...NO_SELECT }}>
          {/* Left: amount */}
          <div style={{ flex: "1 1 58%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32, padding: "56px 48px" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Your Total</p>
              <p style={{ fontSize: 96, fontWeight: 900, color: PRIMARY, lineHeight: 1, letterSpacing: "-0.03em", margin: 0 }}>
                ${posTotal.toFixed(2)}
              </p>
            </div>
            <div style={{ background: SURFACE, borderRadius: 18, border: `1.5px solid ${BORDER}`, padding: "22px 36px", boxShadow: SHADOW, textAlign: "center", maxWidth: 340 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: OK_SOLID, boxShadow: "0 0 0 3px #bbf7d0" }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0 }}>Ready for payment</p>
              </div>
              <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Please wait while your payment is being prepared</p>
            </div>
          </div>
          {/* Right: promo panel */}
          <div style={{ flex: "1 1 42%", background: `linear-gradient(145deg, ${PRIMARY} 0%, ${PANEL_END} 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "48px 40px" }}>
            <div style={{ fontSize: 72, lineHeight: 1 }}>{G("💎")}</div>
            <p style={{ fontSize: 32, fontWeight: 900, color: "#fff", textAlign: "center", margin: 0, lineHeight: 1.2 }}>
              {storeConfig?.name ?? "Thank you for visiting!"}
            </p>
            {storeConfig?.name && (
              <p style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", textAlign: "center", margin: 0 }}>
                Thank you for visiting!
              </p>
            )}
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", textAlign: "center", maxWidth: 260, margin: 0, lineHeight: 1.6 }}>
              We appreciate your business and look forward to seeing you again.
            </p>
          </div>
        </div>
      );
    }

    if (posCheckout === "tip") {
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, zIndex: 9999, padding: 32, ...NO_SELECT }}>
          <div style={{ background: SURFACE, borderRadius: 28, border: `1.5px solid ${BORDER}`, boxShadow: SHADOW_LG, padding: "44px 52px", width: "100%", maxWidth: 560, textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 18, lineHeight: 1 }}>{G("💝")}</div>
            <h2 style={{ fontSize: 34, fontWeight: 900, color: TEXT, margin: "0 0 10px" }}>Add a Tip?</h2>
            <p style={{ fontSize: 17, color: MUTED, margin: "0 0 36px" }}>
              Sale total: <strong style={{ color: TEXT }}>${posTotal.toFixed(2)}</strong>
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
              {POS_TIPS.map(t => {
                const amt = calcTip(t.pct);
                const active = posTipPct === t.pct;
                return (
                  <button
                    key={t.pct}
                    onPointerDown={e => { e.preventDefault(); setPosTipPct(t.pct); setPosTipAmt(amt); }}
                    style={{
                      padding: "16px 6px",
                      borderRadius: 16,
                      border: `2.5px solid ${active ? PRIMARY : BORDER}`,
                      background: active ? PRIMARY_S : SURFACE,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 5,
                      transition: "all 0.12s",
                      boxShadow: active ? `0 0 0 3px ${PRIMARY}30` : "none",
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 800, color: active ? PRIMARY_D : TEXT }}>{t.label}</span>
                    {t.pct > 0 && <span style={{ fontSize: 13, color: active ? PRIMARY : MUTED }}>${amt.toFixed(2)}</span>}
                  </button>
                );
              })}
            </div>

            {posTipPct !== null && (
              <div style={{ background: OK_BG, border: `1.5px solid ${OK_BORDER}`, borderRadius: 14, padding: "14px 24px", marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, color: "#166534", fontWeight: 600 }}>Total with tip</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: OK_TEXT }}>${grandWithTip.toFixed(2)}</span>
              </div>
            )}

            <button
              onPointerDown={e => {
                e.preventDefault();
                if (posTipPct === null) return;
                sendKioskEvent("kiosk_checkout_tip_selected", { tipAmount: tipAmt, tipPercent: posTipPct });
                // posTotal was the pre-tip amount shown on this tip-selection
                // screen (used to compute the tip presets). Once the customer
                // confirms a tip, the "Ready for payment" screen that follows
                // must show the grand total including that tip — otherwise it
                // silently reverts to the pre-tip amount even though the
                // staff's ticket (and the actual charge) already includes it.
                setPosTotal(grandWithTip);
                setPosCheckout("cart");
              }}
              disabled={posTipPct === null}
              style={{
                width: "100%",
                padding: "20px",
                borderRadius: 18,
                border: "none",
                background: posTipPct !== null ? PRIMARY : "#e2e8f0",
                color: posTipPct !== null ? "#fff" : "#94a3b8",
                fontSize: 20,
                fontWeight: 800,
                cursor: posTipPct !== null ? "pointer" : "not-allowed",
                transition: "all 0.15s",
                letterSpacing: "-0.01em",
              }}
            >
              {posTipPct === null ? "Select a tip option above" : `Confirm  ·  $${grandWithTip.toFixed(2)}`}
            </button>
          </div>
        </div>
      );
    }

    if (posCheckout === "thankyou") {
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, zIndex: 9999, gap: 32, ...NO_SELECT }}>
          <div style={{ width: 110, height: 110, borderRadius: "50%", background: "#dcfce7", border: `3px solid ${OK_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="58" height="58" viewBox="0 0 58 58" fill="none">
              <polyline points="11,31 24,44 47,18" stroke={OK_TEXT} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: 48, fontWeight: 900, color: TEXT, margin: "0 0 10px", letterSpacing: "-0.02em" }}>Thank you!</h2>
            <p style={{ fontSize: 20, color: MUTED, margin: 0 }}>Payment complete · <strong style={{ color: TEXT }}>${posTotal.toFixed(2)}</strong></p>
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            <button
              onPointerDown={e => {
                e.preventDefault();
                if (posResetRef.current) clearTimeout(posResetRef.current);
                window.print();
                setPosCheckout(null);
              }}
              style={{ padding: "18px 36px", borderRadius: 16, border: `2px solid ${BORDER}`, background: SURFACE, boxShadow: SHADOW, fontSize: 17, fontWeight: 700, color: TEXT, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
            >
              {G("🖨️")}{" "}Print Receipt
            </button>
            <button
              onPointerDown={e => {
                e.preventDefault();
                if (posResetRef.current) clearTimeout(posResetRef.current);
                setPosCheckout(null);
              }}
              style={{ padding: "18px 36px", borderRadius: 16, border: `2px solid ${BORDER}`, background: SURFACE, boxShadow: SHADOW, fontSize: 17, fontWeight: 700, color: MUTED, cursor: "pointer" }}
            >
              No Receipt
            </button>
          </div>
          <p style={{ fontSize: 14, color: SUBTLE }}>This screen will reset automatically in 15 seconds</p>
        </div>
      );
    }

    return null;
  }

  if (screen === "suspended") return <KioskSuspendedScreen storeName={storeConfig?.name} />;

  if (screen === "pair" && slug) return (
    <KioskPairing slug={slug} storeName={storeConfig?.name} onPaired={() => setScreen("idle")} />
  );

  // ── CLOSED ──────────────────────────────────────────────────────────────────
  if (screen === "closed") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8"
      style={{ ...NO_SELECT, background: BG }}>
      <div className="w-32 h-32 rounded-full flex items-center justify-center text-6xl shadow-lg"
        style={{ background: SURFACE, border: `2px solid ${BORDER}` }}>{G("🔒")}</div>
      <div className="text-center space-y-3">
        <h1 className="text-6xl font-black" style={{ color: TEXT }}>{storeConfig?.name ?? "Check-in"}</h1>
        <p className="text-2xl" style={{ color: MUTED }}>{t.weClosed}</p>
        <p className="text-lg" style={{ color: SUBTLE }}>{t.seeFrontDesk}</p>
      </div>
    </div>
  );

  // ── IDLE ────────────────────────────────────────────────────────────────────
  if (screen === "idle") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
      onPointerDown={() => setScreen("phone")}
      onContextMenu={e => e.preventDefault()}
      style={{ ...NO_SELECT, background: BG }}>

      {/* Decorative blobs */}
      <div className="absolute top-[-80px] right-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, rgba(232,72,145,0.08) 0%, transparent 70%)" }} />
      <div className="absolute bottom-[-100px] left-[-100px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, rgba(167,139,250,0.10) 0%, transparent 70%)" }} />

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
        {kioskConfig?.loyaltyPromoText && (
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full text-xl font-semibold"
            style={{ background: PILL_BG, border: `1.5px solid ${PILL_BORDER}`, color: PILL_TEXT }}>
            <span>{G("⭐")}</span><span>{kioskConfig.loyaltyPromoText}</span>
          </div>
        )}
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

      {/* ── Language selector pills ── */}
      <div
        className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-3 flex-wrap px-8 z-20"
        onPointerDown={e => e.stopPropagation()}>
        {KIOSK_LANGS.map(({ code, label }) => (
          <button
            key={code}
            onPointerDown={e => { e.stopPropagation(); setLang(code); }}
            className="px-5 py-2.5 rounded-full text-base font-semibold transition-all duration-150 active:scale-95"
            style={{
              background: lang === code ? PRIMARY : SURFACE,
              color: lang === code ? "#fff" : MUTED,
              border: `1.5px solid ${lang === code ? PRIMARY : BORDER}`,
              boxShadow: SHADOW,
              cursor: "pointer",
            }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  // ── LOADING ─────────────────────────────────────────────────────────────────
  if (screen === "loading") return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: BG }}>
      <div className="text-center space-y-6">
        <div className="w-20 h-20 rounded-full border-4 border-t-transparent animate-spin mx-auto"
          style={{ borderColor: `${BORDER}`, borderTopColor: PRIMARY }} />
        <p className="text-2xl font-light" style={{ color: MUTED }}>{t.oneMoment}</p>
      </div>
    </div>
  );

  // ── WELCOME ─────────────────────────────────────────────────────────────────
  // Smart Check-In: the welcome screen with a suggestion on it. Same greeting; the suggested service is the
  // obvious first choice, and "Other services" is always right beside it.
  const suggestedServices = screen === "welcome"
    ? offeredRef.current.serviceIds.map((id) => allServices.find((sv) => sv.id === id)).filter((sv): sv is ServiceItem => !!sv)
    : [];
  if (screen === "welcome" && smart?.recommendation && suggestedServices.length > 0) {
    const rec = smart.recommendation;
    const first = suggestedServices[0];
    const question = rec.kind === "choice" && suggestedServices.length > 1 ? t.recChoice : rec.kind === "usual" ? t.recUsual(first.name) : t.recAsk(first.name);
    const money = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`;
    const panel = NAIL_LOOK ? "" : "rounded-3xl";
    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()} style={{ ...NO_SELECT, background: BG }} data-testid="kiosk-smart-welcome">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-8 text-center" style={{ gap: "clamp(14px, 2.6vh, 28px)" }}>
          <h2 className="font-black" style={{ color: TEXT, fontSize: "clamp(40px, 6vw, 72px)", lineHeight: 1.08 }}>
            Welcome back, {clientFirst}!
          </h2>
          {(clientInfo?.loyaltyPoints ?? 0) > 0 && (
            <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full text-xl font-semibold"
              style={{ background: PILL_BG, border: `1.5px solid ${PILL_BORDER}`, color: PILL_TEXT }}>
              <span>{t.loyaltyPoints(clientInfo!.loyaltyPoints)}</span>
            </div>
          )}
          <div>
            <p style={{ color: MUTED, fontSize: "clamp(18px, 2.2vw, 26px)" }}>{t.lastVisitLine(rec.basedOn.daysAgo, rec.basedOn.serviceName)}</p>
            <p className="font-bold" style={{ color: TEXT, fontSize: "clamp(22px, 2.8vw, 34px)", marginTop: 6 }}>{question}</p>
          </div>
          <div className="w-full flex items-stretch justify-center" style={{ gap: "clamp(10px, 1.4vw, 18px)", maxWidth: 980 }}>
            {suggestedServices.map((sv, i) => (
              <button key={sv.id} type="button" data-testid={`kiosk-smart-suggest-${sv.id}`}
                onPointerDown={e => { e.preventDefault(); chooseSuggested(sv); }}
                className={`${panel} flex-1 text-left transition-transform duration-150 active:scale-[0.98]`}
                style={{ maxWidth: 520, padding: "clamp(16px, 2.4vh, 26px) clamp(18px, 2.2vw, 30px)", background: i === 0 ? PRIMARY_S : SURFACE,
                  border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? PRIMARY : BORDER}`, boxShadow: NAIL_LOOK ? "none" : SHADOW_LG }}>
                {i === 0 && <p className="font-bold uppercase" style={{ color: PRIMARY, fontSize: 13, letterSpacing: ".2em" }}>{t.suggestedForYou}</p>}
                <h3 className="font-black" style={{ color: TEXT, fontSize: "clamp(24px, 3vw, 38px)", lineHeight: 1.15, marginTop: i === 0 ? 4 : 0 }}>{sv.name}</h3>
                {(showPrice || showDuration) && (
                  <p className="font-semibold" style={{ color: MUTED, fontSize: "clamp(16px, 1.8vw, 22px)", marginTop: 6 }}>
                    {showPrice && money(sv.price)}{showPrice && showDuration && " · "}{showDuration && `${sv.duration} min`}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: SURFACE, borderTop: `2px solid ${BORDER}` }}>
          <GhostBtn onPress={resetToIdle} size="sm">{t.startOver}</GhostBtn>
          <GhostBtn onPress={() => { kick(); setScreen("loading"); checkAvailabilityAndRoute(); }}>{t.otherServices}</GhostBtn>
        </div>
      </div>
    );
  }

  if (screen === "welcome") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8" style={{ background: BG }}>
      <div className="text-center space-y-6">
        <div className="text-9xl animate-bounce">{G("👋")}</div>
        <h2 className="text-7xl font-black" style={{ color: TEXT }}>
          Welcome back,<br />{clientFirst}!
        </h2>
        {(clientInfo?.loyaltyPoints ?? 0) > 0 && (
          <div className="inline-flex items-center gap-3 px-8 py-4 rounded-full text-2xl font-semibold"
            style={{ background: PILL_BG, border: `1.5px solid ${PILL_BORDER}`, color: PILL_TEXT }}>
            <span className="text-3xl">{G("⭐")}</span>
            <span>{t.loyaltyPoints(clientInfo!.loyaltyPoints)}</span>
          </div>
        )}
        {(clientInfo?.totalVisits ?? 0) > 0 && (
          <p className="text-xl" style={{ color: MUTED }}>{t.visitReturn((clientInfo!.totalVisits ?? 0) + 1)}</p>
        )}
        <p className="text-lg animate-pulse" style={{ color: SUBTLE }}>{t.loadingOptions}</p>
      </div>
    </div>
  );

  // ── ERROR ───────────────────────────────────────────────────────────────────
  if (screen === "error") return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: BG }}>
      <div className="text-center space-y-6">
        <div className="text-7xl">⚠️</div>
        <p className="text-2xl font-semibold" style={{ color: "#dc2626" }}>{error || t.somethingWrong}</p>
        <PrimaryBtn onPress={resetToIdle}>{t.tryAgain}</PrimaryBtn>
      </div>
    </div>
  );

  // ── PHONE ───────────────────────────────────────────────────────────────────
  if (screen === "phone") return (
    <div className="fixed inset-0 flex select-none" onContextMenu={e => e.preventDefault()}
      style={{ ...NO_SELECT, background: BG }}>

      {/* Left panel */}
      <div className="w-[36%] flex flex-col items-center justify-center px-10 gap-8"
        style={{ background: PRIMARY_S, borderRight: `1.5px solid ${BORDER}` }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-xl"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})` }}>
          <span className="text-white text-4xl font-black">✓</span>
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-black leading-tight" style={{ color: TEXT }}>{storeConfig?.name ?? "Check In"}</h1>
          <p className="text-sm mt-2 uppercase tracking-widest font-semibold" style={{ color: SUBTLE }}>{t.selfCheckInKiosk}</p>
        </div>
        <div className="w-full max-w-[280px] rounded-2xl p-5 space-y-2"
          style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, boxShadow: SHADOW }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>{t.loyaltyRewards}</p>
          <p className="text-base leading-relaxed" style={{ color: MUTED }}>
            {kioskConfig?.loyaltyPromoText || "Earn points with every visit and redeem them for amazing services!"}
          </p>
        </div>
      </div>

      {/* Right panel — numpad */}
      <div className={`flex-1 flex flex-col items-center justify-center gap-5 px-8 ${shakeClass}`} onAnimationEnd={onShakeEnd}>
        <div className="text-center mb-1">
          <p className="text-2xl font-bold" style={{ color: TEXT }}>{t.enterPhone}</p>
          <p className="text-base mt-1" style={{ color: SUBTLE }}>{t.infoNeverShared}</p>
          <p className="text-xs mt-3 leading-snug max-w-sm mx-auto" style={{ color: SUBTLE }}>{t.smsConsent(storeConfig?.name ?? "")}</p>
        </div>

        {/* Display */}
        <div className="rounded-2xl px-10 py-4 min-w-[320px] text-center"
          style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, boxShadow: SHADOW }}>
          <span className="text-5xl font-mono tracking-[0.12em]" style={{ color: phone ? TEXT : BORDER }}>
            {phone ? fmtPhone(phone) : "•••  •••  ••••"}
          </span>
        </div>

        {/* Numpad grid */}
        <div className="grid grid-cols-3 gap-3">
          {["1","2","3","4","5","6","7","8","9"].map(d => (
            <button key={d}
              onPointerDown={e => { e.preventDefault(); handleDigit(d); }}
              className="w-24 h-24 rounded-2xl text-3xl font-bold transition-all active:scale-90"
              style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: TEXT, boxShadow: SHADOW }}>
              {d}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <button onPointerDown={e => { e.preventDefault(); setPhone(p => p.slice(0, -1)); kick(); }}
            className="w-24 h-24 rounded-2xl text-2xl transition-all active:scale-90"
            style={{ background: "#fef2f2", border: "1.5px solid #fecaca", color: "#ef4444", boxShadow: SHADOW }}>⌫</button>
          <button onPointerDown={e => { e.preventDefault(); handleDigit("0"); }}
            className="w-24 h-24 rounded-2xl text-3xl font-bold transition-all active:scale-90"
            style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: TEXT, boxShadow: SHADOW }}>0</button>
          <button
            onPointerDown={e => { e.preventDefault(); if (phone.length === 10) doLookup(phone); }}
            disabled={phone.length < 10}
            className="w-24 h-24 rounded-2xl text-3xl font-bold text-white transition-all active:scale-90 disabled:opacity-30"
            style={{ background: phone.length < 10 ? "#d1d5db" : PRIMARY, boxShadow: phone.length < 10 ? "none" : SHADOW }}>
            →
          </button>
        </div>

        <div className="flex gap-3 mt-1">
          <GhostBtn onPress={resetToIdle}>{t.cancel}</GhostBtn>
        </div>
      </div>
    </div>
  );

  // ── NAME ENTRY ──────────────────────────────────────────────────────────────
  if (screen === "name_entry") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 px-8 select-none"
      onContextMenu={e => e.preventDefault()} style={{ ...NO_SELECT, background: BG }}>
      <div className="text-center space-y-2 mb-2">
        <p className="text-xl uppercase tracking-widest font-semibold" style={{ color: PRIMARY }}>{t.firstTimeHere}</p>
        <h2 className="text-5xl font-black" style={{ color: TEXT }}>{t.whatsYourName}</h2>
      </div>
      <div className="rounded-2xl px-12 py-4 min-w-[480px] text-center min-h-[72px] flex items-center justify-center"
        style={{ background: SURFACE, border: `2px solid ${newClientName ? PRIMARY : BORDER}`, boxShadow: SHADOW }}>
        <span className="text-5xl font-bold" style={{ color: newClientName ? TEXT : BORDER }}>
          {newClientName || t.yourNamePlaceholder}
        </span>
      </div>

      {/* Keyboard */}
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
                style={{
                  width: key === "⌫" ? 72 : 56,
                  background: key === "⌫" ? "#fef2f2" : SURFACE,
                  border: `1.5px solid ${key === "⌫" ? "#fecaca" : BORDER}`,
                  color: key === "⌫" ? "#ef4444" : TEXT,
                  boxShadow: SHADOW,
                }}>
                {key}
              </button>
            ))}
          </div>
        ))}
        <button
          onPointerDown={e => { e.preventDefault(); setNewClientName(n => n.length < 24 ? n + " " : n); kick(); }}
          className="mt-1 px-24 py-3 rounded-xl text-lg transition-all active:scale-95 select-none"
          style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: MUTED, boxShadow: SHADOW }}>
          {t.spaceKey}
        </button>
      </div>

      <div className="flex gap-4 mt-1">
        <PrimaryBtn onPress={() => newClientName.trim() && checkAvailabilityAndRoute()} disabled={!newClientName.trim()}>
          {t.continueBtn}
        </PrimaryBtn>
      </div>
    </div>
  );

  // ── WAIT CONFIRM ────────────────────────────────────────────────────────────
  // ── FULLY BOOKED — wait >1 hr, offer no-show waitlist ──────────────────────
  if (screen === "fully_booked") {
    const clientFirst2 = fmtName(clientInfo?.name?.split(" ")[0] ?? newClientName.split(" ")[0]) || "there";
    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>

        <div className="absolute top-[-60px] right-[-80px] w-[480px] h-[480px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(245,158,11,0.09) 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(167,139,250,0.10) 0%, transparent 70%)" }} />

        {/* Header */}
        <div className="px-8 pt-8 pb-6 shrink-0 relative z-10"
          style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <p className="text-sm font-semibold uppercase tracking-widest mb-1" style={{ color: PRIMARY }}>
            {storeConfig?.name}
          </p>
          <h2 className="text-4xl font-black leading-tight" style={{ color: TEXT }}>
            {t.fullyBookedNow}
          </h2>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center justify-center gap-6 flex-1 relative z-10 px-8">
          {/* Calendar icon */}
          <div className="w-28 h-28 rounded-full flex items-center justify-center shadow-xl"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f97316)" }}>
            <span className="text-6xl">{G("📅")}</span>
          </div>

          <div className="text-center space-y-3 max-w-xl">
            <p className="text-3xl font-bold" style={{ color: TEXT }}>
              {t.fullyBookedBody(clientFirst2)}
            </p>
            <p className="text-xl" style={{ color: MUTED }}>
              {t.fullyBookedSub}
            </p>
            <p className="text-xl font-semibold" style={{ color: TEXT }}>
              {t.textIfSpot}
            </p>
          </div>

          {/* YES / NO cards */}
          <div className="w-full max-w-3xl mt-2">
            <div className="grid grid-cols-2 gap-6">
              {/* YES — join waitlist */}
              <button
                onPointerDown={e => { e.preventDefault(); kick(); doJoinWaitlist(); }}
                className="rounded-3xl flex flex-col items-center justify-center gap-4 py-10 transition-all active:scale-95"
                style={{ background: OK_BG, border: `2.5px solid ${OK_BORDER}`, boxShadow: SHADOW_LG }}>
                <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-md"
                  style={{ background: OK_SOLID }}>
                  <span className="text-4xl">{G("📱")}</span>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-black" style={{ color: "#15803d" }}>{t.yesTextMe}</p>
                  <p className="text-lg mt-1" style={{ color: "#4ade80" }}>{t.joinWaitlist}</p>
                </div>
              </button>

              {/* NO — decline */}
              <button
                onPointerDown={e => {
                  e.preventDefault(); kick();
                  if (phone) {
                    kioskFetch(slug!, `/api/public/kiosk/${slug}/missed-you-sms`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ phone }),
                    }).catch(() => {});
                  }
                  cancelPendingMarker();
                  setScreen("no_thanks");
                }}
                className="rounded-3xl flex flex-col items-center justify-center gap-4 py-10 transition-all active:scale-95"
                style={{ background: "#fef2f2", border: "2.5px solid #fca5a5", boxShadow: SHADOW_LG }}>
                <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-md"
                  style={{ background: "#ef4444" }}>
                  <span className="text-white text-4xl font-black">✕</span>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-black" style={{ color: "#b91c1c" }}>{t.noThanks}</p>
                  <p className="text-lg mt-1" style={{ color: "#f87171" }}>{t.maybeAnotherTime}</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-8 py-5 relative z-10"
          style={{ borderTop: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <GhostBtn onPress={resetToIdle}>{t.startOver}</GhostBtn>
        </div>
      </div>
    );
  }

  if (screen === "wait_confirm") {
    const mins = waitInfo?.estimatedMinutes ?? 30;
    const waitLabel = mins < 60
      ? `~${mins} min`
      : `~${Math.round(mins / 10) * 10} min`;

    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>

        {/* Decorative blobs */}
        <div className="absolute top-[-60px] right-[-80px] w-[480px] h-[480px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(232,72,145,0.08) 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(167,139,250,0.10) 0%, transparent 70%)" }} />

        {/* Header */}
        <div className="px-8 pt-8 pb-6 shrink-0 relative z-10"
          style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <p className="text-sm font-semibold uppercase tracking-widest mb-1" style={{ color: PRIMARY }}>
            {storeConfig?.name}
          </p>
          <h2 className="text-4xl font-black leading-tight" style={{ color: TEXT }}>
            {t.teamWithOthers}
          </h2>
        </div>

        {/* Wait time pill */}
        <div className="flex flex-col items-center justify-center gap-6 flex-1 relative z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="text-center space-y-2">
              <p className="text-2xl font-semibold" style={{ color: MUTED }}>{t.estimatedWait}</p>
              <p className="text-7xl font-black tracking-tight" style={{ color: TEXT }}>{waitLabel}</p>
              <p className="text-xl" style={{ color: SUBTLE }}>
                {waitInfo?.estimatedMinutes === 0 ? t.youreNext : t.beRightWithYou}
              </p>
            </div>
          </div>

          {/* YES / NO cards */}
          <div className="w-full max-w-3xl px-8 mt-4">
            <p className="text-center text-2xl font-bold mb-6" style={{ color: TEXT }}>
              {t.wouldYouLikeToWait}
            </p>
            <div className="grid grid-cols-2 gap-6">
              {/* YES */}
              <button
                onPointerDown={e => {
                  e.preventDefault(); kick();
                  const waitingFor = waitingServiceRef.current;
                  waitingServiceRef.current = null;
                  if (waitingFor) afterServiceChosen(waitingFor); else setScreen("service_type");
                }}
                className="rounded-3xl flex flex-col items-center justify-center gap-4 py-10 transition-all active:scale-95"
                style={{
                  background: OK_BG,
                  border: `2.5px solid ${OK_BORDER}`,
                  boxShadow: SHADOW_LG,
                }}>
                <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-md"
                  style={{ background: OK_SOLID }}>
                  <span className="text-white text-4xl font-black">✓</span>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-black" style={{ color: "#15803d" }}>{t.yesIllWait}</p>
                  <p className="text-lg mt-1" style={{ color: "#4ade80" }}>{t.continueCheckin}</p>
                </div>
              </button>

              {/* NO */}
              <button
                onPointerDown={e => {
                  e.preventDefault(); kick();
                  // Fire SMS in background — don't await, don't block UI
                  if (phone) {
                    kioskFetch(slug!, `/api/public/kiosk/${slug}/missed-you-sms`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ phone }),
                    }).catch(() => {/* silently ignore */});
                  }
                  cancelPendingMarker();
                  setScreen("no_thanks");
                }}
                className="rounded-3xl flex flex-col items-center justify-center gap-4 py-10 transition-all active:scale-95"
                style={{
                  background: "#fef2f2",
                  border: "2.5px solid #fca5a5",
                  boxShadow: SHADOW_LG,
                }}>
                <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-md"
                  style={{ background: "#ef4444" }}>
                  <span className="text-white text-4xl font-black">✕</span>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-black" style={{ color: "#b91c1c" }}>{t.noThanks}</p>
                  <p className="text-lg mt-1" style={{ color: "#f87171" }}>{t.maybeAnotherTime}</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-8 py-5 relative z-10"
          style={{ borderTop: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <GhostBtn onPress={resetToIdle}>{t.startOver}</GhostBtn>
        </div>
      </div>
    );
  }

  // ── NO THANKS ────────────────────────────────────────────────────────────────
  if (screen === "no_thanks") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 select-none"
        onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>

        <div className="absolute top-[-80px] right-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(232,72,145,0.07) 0%, transparent 70%)" }} />

        <div className="relative z-10 flex flex-col items-center gap-8 text-center px-12">
          <div className="w-36 h-36 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`, boxShadow: SHADOW_LG }}>
            <span className="text-7xl">{G("👋")}</span>
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-black leading-tight" style={{ color: TEXT }}>
              {t.thanksForStoppingBy(clientFirst)}
            </h1>
            <p className="text-2xl font-light" style={{ color: MUTED }}>
              {t.hopeToSeeYouSoon}
            </p>

            {/* SMS confirmation banner */}
            {phone && (
              <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl text-left"
                style={{ background: OK_BG, border: `1.5px solid ${OK_BORDER}` }}>
                <span className="text-3xl flex-shrink-0">{G("📱")}</span>
                <div>
                  <p className="font-bold text-lg leading-tight" style={{ color: "#15803d" }}>
                    {t.weSentYouText}
                  </p>
                  <p className="text-base" style={{ color: OK_TEXT }}>
                    {t.checkMessages}
                  </p>
                </div>
              </div>
            )}
          </div>
          <CountdownWidget seconds={countdown} />
        </div>
      </div>
    );
  }

  // ── WAITLIST ADDED ───────────────────────────────────────────────────────────
  if (screen === "waitlist_added") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 select-none"
        onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>

        <div className="absolute top-[-80px] right-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(34,197,94,0.08) 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(167,139,250,0.10) 0%, transparent 70%)" }} />

        <div className="relative z-10 flex flex-col items-center gap-8 text-center px-12 max-w-2xl w-full">
          {/* Big checkmark */}
          <div className="w-36 h-36 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${OK_SOLID}, ${OK_TEXT})`, boxShadow: SHADOW_LG }}>
            <span className="text-7xl">✓</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-6xl font-black leading-tight" style={{ color: TEXT }}>
              {t.youreOnTheList}
            </h1>
            <p className="text-2xl font-light" style={{ color: MUTED }}>
              {t.wellTextYouSoon}
            </p>
          </div>

          {/* How it works card */}
          <div className="w-full rounded-3xl overflow-hidden"
            style={{ background: SURFACE, border: `2px solid ${OK_BORDER}`, boxShadow: SHADOW_LG }}>
            <div className="px-8 py-5" style={{ background: OK_BG, borderBottom: `1.5px solid ${OK_BORDER}` }}>
              <p className="text-base font-bold uppercase tracking-widest" style={{ color: "#15803d" }}>
                {t.howItWorks}
              </p>
            </div>
            <div className="px-8 py-6 space-y-5">
              {[
                { icon: "📱", title: t.waitlistStep1Title, body: t.waitlistStep1Body },
                { icon: "⏱️", title: t.waitlistStep2Title, body: t.waitlistStep2Body },
                { icon: "✂️", title: t.waitlistStep3Title, body: t.waitlistStep3Body },
              ].map(({ icon, title, body }) => (
                <div key={title} className="flex items-start gap-4">
                  <span className="text-3xl flex-shrink-0">{G(icon)}</span>
                  <div className="text-left">
                    <p className="text-lg font-bold" style={{ color: TEXT }}>{title}</p>
                    <p className="text-base" style={{ color: MUTED }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <CountdownWidget seconds={countdown} />
          <GhostBtn onPress={resetToIdle}>{t.newCheckin}</GhostBtn>
        </div>
      </div>
    );
  }

  // ── SERVICE TYPE PICKER ─────────────────────────────────────────────────────
  if (screen === "service_type") {
    // One card per real service category in the store's catalogue (in the
    // order categories first appear in the service list). Each card filters the
    // service list to that category.
    const catSlug = (c: string) => (c ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const catOrder: string[] = [];
    const byCat = new Map<string, ServiceItem[]>();
    for (const s of allServices) {
      const raw = (s.category ?? "").trim();
      const key = raw || t.otherServices;
      if (!byCat.has(key)) { byCat.set(key, []); catOrder.push(key); }
      byCat.get(key)!.push(s);
    }

    let groups = catOrder.map(cat => {
      const svcs = byCat.get(cat)!;
      const { emoji } = getCat(cat);
      return {
        key: catSlug(cat) || "all",
        label: cat,
        // Preview the first few service names as bullets — same slot the fixed
        // groups used for their descriptions.
        bullets: svcs.slice(0, 3).map(s => s.name)
          .concat(svcs.length > 3 ? [t.andMore(svcs.length - 3)] : []),
        fallbackEmoji: emoji,
        svcs,
      };
    });

    // Fallback: no categories at all — a single "All services" card.
    if (groups.length === 0 && allServices.length > 0) {
      groups = [{
        key: "all",
        label: t.allServices,
        bullets: allServices.slice(0, 3).map(s => s.name),
        fallbackEmoji: "✨",
        svcs: allServices,
      }];
    }

    const catImgs = kioskConfig?.categoryImages ?? {};
    // Grid density: keep 3-up for a handful of categories, tighten to fit more.
    const gridCols = groups.length <= 3 ? "grid-cols-3" : groups.length === 4 ? "grid-cols-2" : "grid-cols-3";
    const cardImgHeight = groups.length <= 3 ? 220 : groups.length <= 6 ? 160 : 128;

    const handleContinue = () => {
      if (!selectedCategoryGroup) return;
      const chosen = groups.find(g => g.key === selectedCategoryGroup);
      setFilteredServices(chosen?.svcs.length ? chosen.svcs : null);
      setSvcPage(0);
      setScreen("services");
    };

    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>

        {/* ── Header ── */}
        <div className="px-8 pt-6 pb-5 shrink-0"
          style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <p className="text-sm font-semibold uppercase tracking-widest mb-1" style={{ color: PRIMARY }}>
            Check-in — {storeConfig?.name}
          </p>
          <h2 className="text-4xl font-black leading-tight" style={{ color: TEXT }}>
            {t.whatBringsYouIn(clientFirst)}
          </h2>
        </div>

        {/* ── Cards ── */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className={`grid ${gridCols} gap-6 w-full max-w-5xl mx-auto`}>
            {groups.map(group => {
              const isSel = selectedCategoryGroup === group.key;
              // The image the owner set on the catalog category (Catalog →
              // Categories) — resolved server-side into categoryImages, keyed by
              // category name, falling back to the legacy slug key.
              const imgUrl = catImgs[group.label] ?? catImgs[group.key];

              return (
                <button
                  key={group.key}
                  onPointerDown={e => { e.preventDefault(); setSelectedCategoryGroup(isSel ? null : group.key); kick(); }}
                  className="rounded-3xl text-left flex flex-col overflow-hidden transition-all duration-150 active:scale-[0.97] relative"
                  style={{
                    background: SURFACE,
                    border: `2.5px solid ${isSel ? PRIMARY : BORDER}`,
                    boxShadow: isSel ? `0 0 0 4px ${PRIMARY}25, ${SHADOW_LG}` : SHADOW_LG,
                  }}>

                  {/* Selection checkmark */}
                  {isSel && (
                    <div className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center z-10 shadow-md"
                      style={{ background: PRIMARY }}>
                      <span className="text-white font-black" style={{ fontSize: 16 }}>✓</span>
                    </div>
                  )}

                  {/* Image area — fixed height so it never stretches in fullscreen */}
                  <div className="w-full flex-shrink-0" style={{ height: cardImgHeight }}>
                    <div className="w-full h-full overflow-hidden">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={group.label}
                          className="w-full h-full object-cover object-top"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                            (e.currentTarget.parentElement as HTMLElement).innerHTML =
                              `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${isSel ? `${PRIMARY}12` : TINT}"><span style="font-size:80px;line-height:1;user-select:none">${G(group.fallbackEmoji)}</span></div>`;
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"
                          style={{ background: isSel ? `${PRIMARY}12` : TINT }}>
                          <span className="select-none" style={{ fontSize: 80 }}>{G(group.fallbackEmoji)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Text area */}
                  <div className="px-5 pt-4 pb-5 shrink-0"
                    style={{ borderTop: `1.5px solid ${isSel ? PRIMARY + "40" : BORDER}` }}>
                    <p className="text-xl font-black mb-3 leading-tight" style={{ color: TEXT }}>
                      {group.label}
                    </p>
                    <ul className="space-y-1.5">
                      {group.bullets.map((b, i) => (
                        <li key={i} className="flex items-center gap-2.5 text-base" style={{ color: MUTED }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: isSel ? PRIMARY : SUBTLE }} />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-8 py-5 flex items-center justify-between"
          style={{ borderTop: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <GhostBtn onPress={() => {
            if (clientInfo) {
              // Existing client: return to welcome then re-check availability so the
              // welcome screen doesn't dead-end (original setTimeout has already fired).
              setScreen("welcome");
              setTimeout(() => checkAvailabilityAndRoute(), 100);
            } else {
              setScreen("name_entry");
            }
          }}>{t.backBtn}</GhostBtn>
          <PrimaryBtn onPress={handleContinue} disabled={!selectedCategoryGroup} size="md">
            {t.continueBtn}
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  const fmtPrice = (p: number) => `$${p % 1 === 0 ? p : p.toFixed(2)}`;

  // ── SERVICES ────────────────────────────────────────────────────────────────
  if (screen === "services") {
    const displayServices = filteredServices ?? allServices;
    const visibleSvcs  = displayServices.slice(svcPage * CARDS_PER_PAGE, (svcPage + 1) * CARDS_PER_PAGE);
    const totalPages   = Math.ceil(displayServices.length / CARDS_PER_PAGE);
    const hasMorePages = svcPage < totalPages - 1;
    const hasPrevPages = svcPage > 0;
    const mostPopularId = visibleSvcs.length > 0
      ? [...visibleSvcs].sort((a, b) => b.price - a.price)[0].id
      : null;

    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>

        {/* ── Header ── */}
        <div className="px-8 pt-3 pb-2 shrink-0"
          style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: PRIMARY }}>
                Check-in — {storeConfig?.name}
              </p>
              <h2 className="text-2xl font-black leading-tight" style={{ color: TEXT }}>
                {t.whatBringsYouIn(clientFirst)}
                <span className="text-sm font-normal ml-3" style={{ color: MUTED }}>{t.tapToSelect}</span>
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {(clientInfo?.loyaltyPoints ?? 0) > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
                  style={{ background: PILL_BG, border: `1.5px solid ${PILL_BORDER}`, color: PILL_TEXT }}>
                  {G("⭐")}{" "}{clientInfo!.loyaltyPoints} pts
                </div>
              )}
              {totalPages > 1 && (
                <div className="px-3 py-1 rounded-full text-sm font-semibold"
                  style={{ background: PRIMARY_S, border: `1.5px solid ${BORDER}`, color: PRIMARY }}>
                  {t.pageOf(svcPage + 1, totalPages)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Service grid (no overflow — exactly CARDS_PER_PAGE slots) ── */}
        <div className="flex-1 px-8 pt-5 pb-2" style={{ overflow: "hidden" }}>
          {displayServices.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-2xl" style={{ color: SUBTLE }}>{t.noServices}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4 h-full content-start">
              {visibleSvcs.map(svc => {
                const isSel = selectedServices.some(s => s.id === svc.id);
                const { from, soft, emoji } = getCat(svc.category);
                const isPopular = svc.id === mostPopularId;
                const optCount = svc.optionCount ?? (serviceOptionsMap[svc.id]?.length ?? 0);
                const hasOptions = optCount > 0;
                return (
                  <button key={svc.id}
                    onPointerDown={e => {
                      e.preventDefault();
                      if (hasOptions) {
                        // Auto-navigate to the sub-options screen
                        setParentServiceForOptions(svc);
                        setSelectedOption(null);
                        setScreen("service_options");
                        kick();
                      } else {
                        toggleSvc(svc);
                      }
                    }}
                    className="rounded-2xl text-left transition-all duration-150 active:scale-[0.97] overflow-hidden flex flex-col"
                    style={{
                      background: SURFACE,
                      border: `2.5px solid ${isSel ? PRIMARY : BORDER}`,
                      boxShadow: isSel ? `0 0 0 4px ${PRIMARY}22, ${SHADOW_LG}` : SHADOW,
                    }}>

                    {/* ── Image / illustration area ── */}
                    <div className="relative w-full overflow-hidden flex-shrink-0" style={{ height: 148 }}>
                      {(() => {
                        // Priority: custom illustration override → real service photo → auto-matched category illustration → emoji fallback
                        const displayUrl = (svc as any).customIllustrationUrl
                          || svc.imageUrl
                          || (svc as any).illustrationImageUrl;
                        return displayUrl ? (
                          <img
                            src={displayUrl}
                            alt={svc.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                              (e.currentTarget.parentElement as HTMLElement).innerHTML =
                                `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${soft}"><span style="font-size:68px;line-height:1;user-select:none">${emoji}</span></div>`;
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"
                            style={{ background: isSel ? `linear-gradient(135deg, ${from}22, ${from}10)` : soft }}>
                            <span className="text-[68px] leading-none select-none">{emoji}</span>
                          </div>
                        );
                      })()}

                      {/* Most popular badge */}
                      {isPopular && (
                        <div className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white"
                          style={{ background: "linear-gradient(90deg, #f59e0b, #f97316)", borderRadius: "0 6px 0 0" }}>
                          ★ Most popular
                        </div>
                      )}

                      {/* Options badge (top-right) — replaces checkmark for multi-option services */}
                      {hasOptions && !isSel && (
                        <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-xs font-bold shadow-md flex items-center gap-1"
                          style={{ background: PRIMARY, color: "#fff" }}>
                          {optCount} option{optCount !== 1 ? "s" : ""} ›
                        </div>
                      )}

                      {/* Selected checkmark */}
                      {isSel && (
                        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                          style={{ background: PRIMARY }}>
                          <span className="text-white text-xs font-black">✓</span>
                        </div>
                      )}
                    </div>

                    {/* ── Card body ── */}
                    <div className="px-4 pt-3 pb-4 flex flex-col flex-1">
                      <p className="text-base font-bold leading-snug mb-1" style={{ color: TEXT }}>
                        {svc.name}
                      </p>
                      {svc.description && (
                        <p className="text-xs leading-snug mb-2 line-clamp-2" style={{ color: MUTED }}>
                          {svc.description}
                        </p>
                      )}
                      {/* ── Price + duration row ── */}
                      {(showPrice || showDuration) && (
                        <div className="flex items-center justify-between mt-auto pt-2"
                          style={{ borderTop: `1px solid ${BORDER}` }}>
                          {showPrice ? (
                            <span className="text-xl font-black" style={{ color: isSel ? PRIMARY : TEXT }}>
                              {hasOptions ? "from " : ""}{fmtPrice(svc.price)}
                            </span>
                          ) : <span />}
                          {showDuration && !hasOptions && (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                              style={{ background: "#f1f0f6", color: MUTED }}>
                              {svc.duration}m
                            </span>
                          )}
                          {hasOptions && (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1"
                              style={{ background: PRIMARY_S, color: PRIMARY, border: `1px solid ${PRIMARY}40` }}>
                              Tap to see options
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── See More / Prev buttons (above footer) ── */}
        {(hasMorePages || hasPrevPages) && (
          <div className="px-8 py-3 flex items-center justify-center gap-4 shrink-0">
            {hasPrevPages && (
              <button
                onPointerDown={e => { e.preventDefault(); setSvcPage(p => p - 1); kick(); }}
                className="px-6 py-2.5 rounded-xl text-base font-semibold transition-all active:scale-95"
                style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: MUTED, boxShadow: SHADOW }}>
                {t.previousBtn}
              </button>
            )}
            {hasMorePages && (
              <button
                onPointerDown={e => { e.preventDefault(); setSvcPage(p => p + 1); kick(); }}
                className="px-8 py-2.5 rounded-xl text-base font-bold transition-all active:scale-95 flex items-center gap-2"
                style={{ background: PRIMARY_S, border: `1.5px solid ${PRIMARY}`, color: PRIMARY, boxShadow: SHADOW }}>
                {t.seeMore}
              </button>
            )}
          </div>
        )}

        {/* ── Sticky mini-cart footer ── */}
        <div className="shrink-0 px-6 py-4 flex items-center gap-4"
          style={{ background: SURFACE, borderTop: `2px solid ${BORDER}`, boxShadow: "0 -4px 20px rgba(80,0,120,0.06)" }}>

          {/* Back */}
          <GhostBtn onPress={() => setScreen("service_type")} size="sm">{t.backBtn}</GhostBtn>

          {/* Selected chips */}
          <div className="flex-1 flex items-center gap-2 overflow-hidden">
            {selectedServices.length === 0 ? (
              <p className="text-base" style={{ color: SUBTLE }}>{t.noServiceSelected}</p>
            ) : (
              <>
                {selectedServices.slice(0, 3).map(s => {
                  const { from } = getCat(s.category);
                  return (
                    <button key={s.id}
                      onPointerDown={e => { e.preventDefault(); toggleSvc(s); kick(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-95 flex-shrink-0"
                      style={{ background: soft(from), border: `1.5px solid ${from}`, color: from }}>
                      <span>{s.name}</span>
                      <span className="text-xs opacity-70">✕</span>
                    </button>
                  );
                })}
                {selectedServices.length > 3 && (
                  <span className="text-sm font-semibold flex-shrink-0" style={{ color: MUTED }}>
                    +{selectedServices.length - 3} more
                  </span>
                )}
              </>
            )}
          </div>

          {/* Total + Continue */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {selectedServices.length > 0 && (showPrice || showDuration) && (
              <div className="text-right">
                {showPrice && (
                  <p className="text-2xl font-black" style={{ color: TEXT }}>
                    ${selTotal % 1 === 0 ? selTotal : selTotal.toFixed(2)}
                  </p>
                )}
                {showDuration && (
                  <p className="text-xs" style={{ color: SUBTLE }}>{selDur} min</p>
                )}
              </div>
            )}
            <PrimaryBtn
              onPress={() => selectedServices.length > 0 && afterServiceChosen()}
              disabled={selectedServices.length === 0}
              size="md">
              {t.continueBtn}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    );
  }

  // ── SERVICE OPTIONS (sub-screen for a multi-option service) ─────────────────
  if (screen === "service_options" && parentServiceForOptions) {
    const options = serviceOptionsMap[parentServiceForOptions.id] ?? [];
    const { from, soft, emoji } = getCat(parentServiceForOptions.category);

    // When user confirms an option, synthesise a ServiceItem from it and proceed
    const confirmOption = () => {
      if (!selectedOption) return;
      const syntheticSvc: ServiceItem = {
        id: parentServiceForOptions.id,
        optionId: selectedOption.id, // so the server prices it from the option, not the browser
        name: `${parentServiceForOptions.name} — ${selectedOption.name}`,
        description: selectedOption.description ?? parentServiceForOptions.description,
        duration: selectedOption.durationMinutes,
        price: selectedOption.price,
        category: parentServiceForOptions.category,
        imageUrl: parentServiceForOptions.imageUrl,
        optionCount: 0,
      };
      setSel([syntheticSvc]);
      setSelectedAddons([]);
      afterServiceChosen();
    };

    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>

        {/* ── Header ── */}
        <div className="px-8 pt-6 pb-4 shrink-0"
          style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest mb-1" style={{ color: PRIMARY }}>
                Check-in — {storeConfig?.name}
              </p>
              <h2 className="text-3xl font-black leading-tight" style={{ color: TEXT }}>
                {parentServiceForOptions.name}
              </h2>
              <p className="text-base mt-1" style={{ color: MUTED }}>Choose your option below</p>
            </div>
            {(clientInfo?.loyaltyPoints ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
                style={{ background: PILL_BG, border: `1.5px solid ${PILL_BORDER}`, color: PILL_TEXT }}>
                {G("⭐")}{" "}{clientInfo!.loyaltyPoints} pts
              </div>
            )}
          </div>
        </div>

        {/* ── Options grid ── */}
        <div className="flex-1 px-8 pt-5 pb-2" style={{ overflow: "hidden" }}>
          <div className={`grid gap-5 h-full content-start ${options.length <= 2 ? "grid-cols-2" : options.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
            {options.map(opt => {
              const isSel = selectedOption?.id === opt.id;
              return (
                <button key={opt.id}
                  onPointerDown={e => { e.preventDefault(); setSelectedOption(opt); kick(); }}
                  className="rounded-2xl text-left transition-all duration-150 active:scale-[0.97] overflow-hidden flex flex-col"
                  style={{
                    background: isSel ? `${from}10` : SURFACE,
                    border: `2.5px solid ${isSel ? PRIMARY : BORDER}`,
                    boxShadow: isSel ? `0 0 0 4px ${PRIMARY}22, ${SHADOW_LG}` : SHADOW,
                  }}>

                  {/* Illustration / emoji area */}
                  <div className="relative w-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ height: 160, background: isSel ? `linear-gradient(135deg, ${from}22, ${from}10)` : soft }}>
                    {(opt.imageUrl || parentServiceForOptions.imageUrl) ? (
                      <img src={opt.imageUrl ?? parentServiceForOptions.imageUrl!} alt={opt.name}
                        className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="select-none" style={{ fontSize: 72, lineHeight: 1 }}>{emoji}</span>
                    )}

                    {/* Default / recommended badge */}
                    {opt.isDefault && (
                      <div className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white"
                        style={{ background: "linear-gradient(90deg, #f59e0b, #f97316)", borderRadius: "0 6px 0 0" }}>
                        ★ Recommended
                      </div>
                    )}

                    {/* Selected checkmark */}
                    {isSel && (
                      <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                        style={{ background: PRIMARY }}>
                        <span className="text-white text-xs font-black">✓</span>
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="px-4 pt-3 pb-4 flex flex-col flex-1">
                    <p className="text-base font-bold leading-snug mb-1" style={{ color: TEXT }}>
                      {opt.name}
                    </p>
                    {opt.description && (
                      <p className="text-xs leading-snug mb-2 line-clamp-3" style={{ color: MUTED }}>
                        {opt.description}
                      </p>
                    )}
                    {(showPrice || showDuration) && (
                      <div className="flex items-center justify-between mt-auto pt-2"
                        style={{ borderTop: `1px solid ${BORDER}` }}>
                        {showPrice ? (
                          <span className="text-xl font-black" style={{ color: isSel ? PRIMARY : TEXT }}>
                            {fmtPrice(opt.price)}
                          </span>
                        ) : <span />}
                        {showDuration && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                            style={{ background: "#f1f0f6", color: MUTED }}>
                            {opt.durationMinutes}m
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-6 py-4 flex items-center gap-4"
          style={{ background: SURFACE, borderTop: `2px solid ${BORDER}`, boxShadow: "0 -4px 20px rgba(80,0,120,0.06)" }}>
          <GhostBtn onPress={() => setScreen("services")} size="sm">{t.backBtn}</GhostBtn>
          <div className="flex-1 flex items-center gap-2 overflow-hidden">
            {selectedOption ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold flex-shrink-0"
                style={{ background: soft, border: `1.5px solid ${from}`, color: from }}>
                {parentServiceForOptions.name} — {selectedOption.name}
              </span>
            ) : (
              <p className="text-base" style={{ color: SUBTLE }}>Tap an option to select it</p>
            )}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {selectedOption && (showPrice || showDuration) && (
              <div className="text-right">
                {showPrice && (
                  <p className="text-2xl font-black" style={{ color: TEXT }}>
                    {fmtPrice(selectedOption.price)}
                  </p>
                )}
                {showDuration && (
                  <p className="text-xs" style={{ color: SUBTLE }}>{selectedOption.durationMinutes} min</p>
                )}
              </div>
            )}
            <PrimaryBtn onPress={confirmOption} disabled={!selectedOption} size="md">
              {t.continueBtn}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    );
  }

  // ── NAIL CONFIG: length / shape / effect pickers ───────────────────────────
  const renderNailPicker = (opts: {
    kind: "length" | "shape" | "design";
    title: string;
    options: NailOption[];
    selectedId: number | null | undefined;
    onPick: (o: NailOption | null) => void;
    onBack: () => void;
    plainOption?: boolean; // effects step: prepend a "no design" card
    /** Nail-salon look only: offer the "help me choose" guide on this step (see NailChoiceStep). */
    guide?: boolean;
  }) => {
    // Nail salons: the reference-artwork layout (two cards a row, serif names, picture or placeholder).
    if (NAIL_LOOK) {
      return (
        <NailChoiceStep kind={opts.kind} title={opts.title} serviceName={selectedServices[0]?.name} options={opts.options}
          selectedId={opts.selectedId} plainLabel={opts.plainOption ? "Plain, no design" : undefined}
          onPick={opts.onPick} onBack={opts.onBack} backLabel={t.backBtn} fmtPrice={fmtPrice}
          onActivity={kick} art={nailCfg?.art}
          guide={opts.guide && nailCfg?.sizes?.length && nailCfg?.shapes?.length ? {
            shapes: nailCfg.shapes, lengths: nailCfg.sizes,
            // Answers both steps: carry on from the shape step.
            onPickBoth: (sh, ln) => { setNailShape(sh as NailOption); setNailSize(ln as NailOption); nailStepNext("shape"); },
          } : undefined}
          look={{ bg: BG, surface: SURFACE, primary: PRIMARY, primarySoft: PRIMARY_S, border: BORDER, text: TEXT, muted: MUTED, subtle: SUBTLE, tint: TINT, shadow: SHADOW, shadowLg: SHADOW_LG }} />
      );
    }
    const cards: (NailOption | null)[] = opts.plainOption ? [null, ...opts.options] : opts.options;
    const priceLabel = (adj: number) =>
      adj > 0 ? `+${fmtPrice(adj)}` : adj < 0 ? `−${fmtPrice(Math.abs(adj))}` : "";
    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>
        <div className="px-8 pt-6 pb-5 shrink-0" style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <p className="text-sm font-semibold uppercase tracking-widest mb-1" style={{ color: PRIMARY }}>
            {selectedServices[0]?.name}
          </p>
          <h2 className="text-4xl font-black leading-tight" style={{ color: TEXT }}>{opts.title}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-4 gap-5 content-start max-w-6xl mx-auto">
            {cards.map((o, i) => {
              const isSel = o == null ? opts.selectedId === null : opts.selectedId === o.nailVocabId;
              return (
                <button key={o?.nailVocabId ?? `plain-${i}`}
                  onPointerDown={e => { e.preventDefault(); opts.onPick(o); }}
                  className="rounded-2xl text-left flex flex-col overflow-hidden transition-all duration-150 active:scale-[0.97] relative"
                  style={{
                    background: SURFACE,
                    border: `2.5px solid ${isSel ? PRIMARY : BORDER}`,
                    boxShadow: isSel ? `0 0 0 4px ${PRIMARY}22, ${SHADOW_LG}` : SHADOW,
                  }}>
                  <div className="w-full flex-shrink-0" style={{ height: 150 }}>
                    {o?.imageUrl ? (
                      <img src={o.imageUrl} alt={o.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: o?.swatchHex || (isSel ? `${PRIMARY}12` : TINT) }}>
                        <span className="select-none" style={{ fontSize: 56 }}>{o == null ? "🚫" : "💅"}</span>
                      </div>
                    )}
                  </div>
                  <div className="px-4 pt-3 pb-4 shrink-0" style={{ borderTop: `1.5px solid ${isSel ? PRIMARY + "40" : BORDER}` }}>
                    <p className="text-lg font-black leading-tight" style={{ color: TEXT }}>
                      {o == null ? "Plain — no design" : o.name}
                    </p>
                    {o?.description && (
                      <p className="text-sm mt-1 leading-snug" style={{ color: MUTED }}>{o.description}</p>
                    )}
                    {o && priceLabel(o.priceAdjustment) && (
                      <p className="text-base font-bold mt-1.5" style={{ color: PRIMARY }}>{priceLabel(o.priceAdjustment)}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 px-8 py-5 flex items-center justify-between"
          style={{ borderTop: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <GhostBtn onPress={opts.onBack}>{t.backBtn}</GhostBtn>
        </div>
      </div>
    );
  };

  if (screen === "nail_size") return renderNailPicker({
    kind: "length",
    title: "Choose your nail length",
    options: nailCfg?.sizes ?? [],
    selectedId: nailSize?.nailVocabId,
    onPick: (o) => { setNailSize(o); nailStepNext("size"); },
    guide: true,
    onBack: () => setScreen("services"),
  });

  if (screen === "nail_shape") return renderNailPicker({
    kind: "shape",
    title: "Choose your nail shape",
    options: nailCfg?.shapes ?? [],
    selectedId: nailShape?.nailVocabId,
    onPick: (o) => { setNailShape(o); nailStepNext("shape"); },
    guide: true,
    onBack: () => setScreen(nailCfg?.sizes?.length ? "nail_size" : "services"),
  });

  if (screen === "nail_effects") return renderNailPicker({
    kind: "design",
    title: "Choose your nail design",
    options: nailCfg?.effects ?? [],
    selectedId: nailEffect ? nailEffect.nailVocabId : null,
    // Only offer "no design" when the service's config doesn't require an art pick.
    plainOption: !nailCfg?.artRequired,
    onPick: (o) => { setNailEffect(o); kick(); goToStylist(); },
    onBack: () => setScreen(nailCfg?.shapes?.length ? "nail_shape" : nailCfg?.sizes?.length ? "nail_size" : "services"),
  });

  // ── SUMMARY — what the ticket will say, before it is made ───────────────────
  if (screen === "review") {
    const svc = selectedServices[0];
    const nailLines = [nailSize, nailShape, nailEffect].filter((o): o is NailOption => !!o);
    const lines: { label: string; price: number }[] = [
      ...(svc ? [{ label: svc.name, price: svc.price }] : []),
      ...nailLines.map((o) => ({ label: o.name, price: o.priceAdjustment })),
      ...selectedAddons.map((a) => ({ label: a.name, price: a.price })),
    ];
    const total = lines.reduce((sum, l) => sum + l.price, 0);
    const tech = selectedStaff && selectedStaff !== "none" ? (selectedStaff as StaffItem).name : t.nextAvailable;
    const back = () => { kick(); setScreen(allStaff.length > 0 ? "stylist" : availableAddons.length > 0 ? "addons" : "services"); };
    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()} style={{ ...NO_SELECT, background: BG }} data-testid="kiosk-review">
        <div className="px-8 py-6 text-center shrink-0" style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <h2 className="text-5xl font-black" style={{ color: TEXT }}>{t.reviewTitle}</h2>
          <p className="text-xl mt-2" style={{ color: MUTED }}>{t.reviewSub}</p>
        </div>
        <div className="flex-1 min-h-0 px-8 py-6" style={{ overflowY: "auto" }}>
          <div className={`max-w-2xl mx-auto ${NAIL_LOOK ? "" : "rounded-3xl"}`} style={{ background: SURFACE, border: `1px solid ${NAIL_LOOK ? PRIMARY : BORDER}`, boxShadow: NAIL_LOOK ? "none" : SHADOW, padding: "clamp(18px, 3vh, 30px) clamp(20px, 3vw, 36px)" }}>
            {lines.map((l, i) => (
              <div key={i} className="flex items-baseline justify-between gap-6" style={{ padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span className={i === 0 ? "font-black" : "font-semibold"} style={{ color: TEXT, fontSize: i === 0 ? 26 : 20 }}>{i === 0 ? l.label : `+ ${l.label}`}</span>
                {showPrice && (i === 0 || l.price !== 0) && <span className="font-bold tabular-nums" style={{ color: TEXT, fontSize: i === 0 ? 24 : 20 }}>{i === 0 ? fmtPrice(l.price) : `${l.price < 0 ? "−" : "+"}${fmtPrice(Math.abs(l.price))}`}</span>}
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-6" style={{ padding: "10px 0", borderBottom: showPrice ? `1px solid ${BORDER}` : "none" }}>
              <span className="font-semibold" style={{ color: MUTED, fontSize: 18 }}>{t.yourStylist}</span>
              <span className="font-bold" style={{ color: TEXT, fontSize: 20 }}>{tech}</span>
            </div>
            {showPrice && (
              <div className="flex items-baseline justify-between gap-6" style={{ paddingTop: 16 }}>
                <span className="font-bold uppercase" style={{ color: PRIMARY, fontSize: 15, letterSpacing: ".18em" }}>{t.estimatedTotal}</span>
                <span className="font-black tabular-nums" style={{ color: TEXT, fontSize: 36 }} data-testid="kiosk-review-total">{fmtPrice(total)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: SURFACE, borderTop: `2px solid ${BORDER}` }}>
          <GhostBtn onPress={back}>{t.backBtn}</GhostBtn>
          <PrimaryBtn onPress={doCheckIn} size="md">{t.checkInBtn}</PrimaryBtn>
        </div>
      </div>
    );
  }

  // ── STYLIST PICKER ──────────────────────────────────────────────────────────
  if (screen === "stylist") return (
    <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()}
      style={{ ...NO_SELECT, background: BG }}>

      <div className="px-8 py-6 text-center shrink-0"
        style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
        <p className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: PRIMARY }}>{t.optional}</p>
        <h2 className="text-5xl font-black" style={{ color: TEXT }}>{t.whoWouldYouLike}</h2>
        <p className="text-xl mt-2" style={{ color: MUTED }}>{t.pickStylist}</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-10" style={{ overflow: "hidden" }}>
        <div className={`grid gap-5 w-full max-w-5xl ${Math.min(allStaff.length + 1, 4) <= 2 ? "grid-cols-2" : Math.min(allStaff.length + 1, 4) === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
          {/* No preference */}
          {(() => {
            const isSelNone = selectedStaff === "none";
            return (
              <button onPointerDown={e => { e.preventDefault(); setSelStaff("none"); kick(); }}
                className="rounded-3xl text-center p-6 flex flex-col items-center gap-4 transition-all active:scale-95"
                style={{
                  background: isSelNone ? PRIMARY_S : SURFACE,
                  border: `2px solid ${isSelNone ? PRIMARY : BORDER}`,
                  boxShadow: isSelNone ? `0 0 0 3px ${PRIMARY}22, ${SHADOW}` : SHADOW,
                }}>
                <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl"
                  style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})` }}>{G("🎲")}</div>
                <div>
                  <p className="text-xl font-black" style={{ color: TEXT }}>{t.nextAvailable}</p>
                  <p className="text-sm mt-1" style={{ color: MUTED }}>{t.autoAssign}</p>
                </div>
                {isSelNone && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ background: PRIMARY }}>{t.selectedCheck}</span>
                )}
              </button>
            );
          })()}

          {allStaff.filter(sf => {
            // Only show staff who can do the selected service (or have no restriction)
            const selSvc = selectedServices[0];
            if (selSvc) {
              const svcIds = staffServiceIds[sf.id];
              if (svcIds && svcIds.length > 0 && !svcIds.includes(selSvc.id)) return false;
            }
            // Exclude staff who are currently busy with another client
            if (busyStaffIds.includes(sf.id)) return false;
            return true;
          }).map(sf => {
            const isSel = selectedStaff && selectedStaff !== "none" && (selectedStaff as StaffItem).id === sf.id;
            const color = sf.color ?? PRIMARY;
            return (
              <button key={sf.id}
                onPointerDown={e => { e.preventDefault(); setSelStaff(sf); kick(); }}
                className="rounded-3xl text-center p-6 flex flex-col items-center gap-4 transition-all active:scale-95"
                style={{
                  background: isSel ? `${color}12` : SURFACE,
                  border: `2px solid ${isSel ? color : BORDER}`,
                  boxShadow: isSel ? `0 0 0 3px ${color}22, ${SHADOW}` : SHADOW,
                }}>
                <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-4xl font-black text-white flex-shrink-0"
                  style={{ background: color }}>
                  {sf.avatarThumbUrl
                    ? <img src={sf.avatarThumbUrl} className="w-full h-full object-cover" />
                    : sf.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xl font-black" style={{ color: TEXT }}>{sf.name}</p>
                  {sf.role && <p className="text-sm mt-0.5 capitalize" style={{ color: MUTED }}>{sf.role}</p>}
                </div>
                {isSel && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ background: color }}>{t.selectedCheck}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-8 py-5 flex items-center justify-between shrink-0"
        style={{ borderTop: `1.5px solid ${BORDER}`, background: SURFACE }}>
        <GhostBtn onPress={() => availableAddons.length > 0 ? setScreen("addons") : setScreen("services")}>{t.backBtn}</GhostBtn>
        <PrimaryBtn onPress={() => { if (!selectedStaff) setSelStaff("none"); kick(); setScreen("review"); }} size="md">
          {selectedStaff ? t.continueBtn : t.skipBtn}
        </PrimaryBtn>
      </div>
    </div>
  );

  // ── ADDONS PICKER ────────────────────────────────────────────────────────────
  if (screen === "addons") {
    const selSvc = selectedServices[0];
    const toggleAddon = (a: AddonItem) => {
      setSelectedAddons(p => p.find(x => x.id === a.id) ? p.filter(x => x.id !== a.id) : [...p, a]);
      kick();
    };
    const proceedFromAddons = () => {
      if (allStaff.length > 0) setScreen("stylist");
      else setScreen("review");
    };
    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>
        <div className="px-8 py-6 shrink-0"
          style={{ borderBottom: `1.5px solid ${BORDER}`, background: SURFACE }}>
          <p className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: PRIMARY }}>{t.optional}</p>
          <h2 className="text-4xl font-black" style={{ color: TEXT }}>
            {t.wouldYouLikeToAdd}
          </h2>
          {selSvc && (
            <p className="text-lg mt-1" style={{ color: MUTED }}>
              {t.addonsAvailableWith(selSvc.name)}
            </p>
          )}
        </div>

        <div className="flex-1 px-8 pt-6 pb-4" style={{ overflowY: "auto" }}>
          <div className="grid grid-cols-3 gap-5 max-w-5xl mx-auto">
            {availableAddons.map(addon => {
              const isSel = selectedAddons.some(x => x.id === addon.id);
              return (
                <button key={addon.id}
                  onPointerDown={e => { e.preventDefault(); toggleAddon(addon); }}
                  className="rounded-2xl text-left transition-all duration-150 active:scale-[0.97] overflow-hidden flex flex-col"
                  style={{
                    background: SURFACE,
                    border: `2.5px solid ${isSel ? PRIMARY : BORDER}`,
                    boxShadow: isSel ? `0 0 0 4px ${PRIMARY}22, ${SHADOW_LG}` : SHADOW,
                  }}>
                  {addon.imageUrl ? (
                    <div className="w-full flex-shrink-0" style={{ height: 120 }}>
                      <img src={addon.imageUrl} alt={addon.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full flex-shrink-0 flex items-center justify-center"
                      style={{ height: 100, background: selSvc ? getCat(selSvc.category).soft : PRIMARY_S }}>
                      <span className="text-5xl">{G(selSvc ? getCat(selSvc.category).emoji : "✨")}</span>
                    </div>
                  )}
                  <div className="px-4 py-3 flex flex-col flex-1">
                    {addon.id === offeredRef.current.addonId && (
                      <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: PRIMARY }} data-testid="kiosk-addon-had-before">{t.hadBefore}</p>
                    )}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-base font-bold leading-snug" style={{ color: TEXT }}>{addon.name}</p>
                      {isSel && (
                        <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: PRIMARY }}>
                          <span className="text-white text-xs font-black">✓</span>
                        </span>
                      )}
                    </div>
                    {addon.description && (
                      <p className="text-xs leading-snug mb-2 line-clamp-2" style={{ color: MUTED }}>
                        {addon.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-2"
                      style={{ borderTop: `1px solid ${BORDER}` }}>
                      {showPrice && (
                        <span className="text-lg font-black" style={{ color: isSel ? PRIMARY : TEXT }}>
                          +{fmtPrice(addon.price)}
                        </span>
                      )}
                      {showDuration && (
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg"
                          style={{ background: "#f1f0f6", color: MUTED }}>
                          +{addon.duration}m
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 px-6 py-4 flex items-center justify-between"
          style={{ background: SURFACE, borderTop: `2px solid ${BORDER}` }}>
          <GhostBtn onPress={() => setScreen("services")} size="sm">{t.backBtn}</GhostBtn>
          <div className="flex items-center gap-4">
            {selectedAddons.length > 0 && (
              <div className="text-right">
                {showPrice && (
                  <p className="text-xl font-black" style={{ color: TEXT }}>
                    +{fmtPrice(selectedAddons.reduce((sum, a) => sum + a.price, 0))}
                  </p>
                )}
                <p className="text-xs" style={{ color: SUBTLE }}>
                  {t.addonsSelected(selectedAddons.length)}
                </p>
              </div>
            )}
            <PrimaryBtn onPress={proceedFromAddons} size="md">
              {selectedAddons.length > 0 ? t.continueBtn : t.skipBtn}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    );
  }

  // ── TICKET / SUCCESS ─────────────────────────────────────────────────────────
  if (screen === "ticket" && ticket) return (
    <div className="fixed inset-0 flex select-none" onContextMenu={e => e.preventDefault()}
      style={{ ...NO_SELECT, background: BG }}>
      <div className="w-[55%] flex flex-col items-center justify-center px-12 gap-5"
        style={{ borderRight: `1.5px solid ${BORDER}` }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-2xl"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`, boxShadow: SHADOW_LG }}>✓</div>
        <div className="text-center">
          <h2 className="text-5xl font-black" style={{ color: TEXT }}>{t.allCheckedIn}</h2>
          <p className="text-xl mt-2" style={{ color: MUTED }}>{t.showQr}</p>
        </div>

        <div className="w-full max-w-md rounded-2xl overflow-hidden"
          style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, boxShadow: SHADOW_LG }}>
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p className="text-xs uppercase tracking-widest mb-1 font-semibold" style={{ color: SUBTLE }}>{t.clientLabel}</p>
            <p className="text-2xl font-bold" style={{ color: TEXT }}>{ticket.clientName}</p>
            {ticket.staffName && (
              <p className="text-sm mt-1 font-semibold" style={{ color: PRIMARY }}>
                {t.withStaff(
                  ticket.staffName
                    .trim()
                    .split(/\s+/)[0]
                    .replace(/\b(Member|VIP|Gold|Silver|Platinum|Diamond|Premium|Elite)\b/i, "")
                    .trim()
                )}
              </p>
            )}
          </div>
          {ticket.services.length > 0 && (
            <div className="px-6 py-4">
              <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: SUBTLE }}>{t.servicesLabel}</p>
              <div className="space-y-2">
                {ticket.services.map((s, i) => {
                  const { from, emoji } = getCat(s.category);
                  return (
                    <div key={i} className="flex items-center justify-between py-2"
                      style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <div className="flex items-center gap-3">
                        {emoji && <span className="text-xl">{emoji}</span>}
                        <div>
                          <p className="font-semibold text-base" style={{ color: TEXT }}>{s.name}</p>
                          {showDuration && <p className="text-sm" style={{ color: SUBTLE }}>{s.duration} min</p>}
                        </div>
                      </div>
                      {showPrice && (
                        <span className="font-bold text-base" style={{ color: from }}>
                          ${(s.price ?? 0) % 1 === 0 ? s.price : (s.price ?? 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {(ticket.addons ?? []).map((a, i) => {
                  const { from, emoji } = getCat(ticket.services[0]?.category ?? "");
                  return (
                    <div key={`addon-${i}`} className="flex items-center justify-between py-2"
                      style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <div className="flex items-center gap-3">
                        {emoji && <span className="text-xl">{emoji}</span>}
                        <div>
                          <p className="font-semibold text-base" style={{ color: TEXT }}>+ {a.name}</p>
                          {showDuration && <p className="text-sm" style={{ color: SUBTLE }}>{a.duration} min</p>}
                        </div>
                      </div>
                      {showPrice && (
                        <span className="font-bold text-base" style={{ color: from }}>
                          +${(a.price ?? 0) % 1 === 0 ? a.price : (a.price ?? 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {(showPrice || showDuration) && (
                <div className="flex justify-between items-center pt-3 mt-1"
                  style={{ borderTop: `1px solid ${BORDER}` }}>
                  {showDuration ? (
                    <span className="text-sm" style={{ color: SUBTLE }}>
                      {t.minEst(
                        ticket.services.reduce((s, x) => s + (x.duration ?? 0), 0) +
                        (ticket.addons ?? []).reduce((s, a) => s + (a.duration ?? 0), 0)
                      )}
                    </span>
                  ) : <span />}
                  {showPrice && (
                    <span className="font-black text-2xl" style={{ color: TEXT }}>
                      ${(
                        ticket.services.reduce((s, x) => s + (x.price ?? 0), 0) +
                        (ticket.addons ?? []).reduce((s, a) => s + (a.price ?? 0), 0)
                      ).toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {ticket.appointmentId && (
            <div className="px-6 py-3 flex justify-between items-center"
              style={{ background: PRIMARY_S, borderTop: `1.5px solid ${BORDER}` }}>
              <span className="text-sm uppercase tracking-widest font-semibold" style={{ color: SUBTLE }}>{t.bookingHash}</span>
              <span className="font-mono font-bold text-xl" style={{ color: PRIMARY }}>{String(ticket.ticketNumber ?? ticket.appointmentId).padStart(3, "0")}</span>
            </div>
          )}
        </div>

        <CountdownWidget seconds={countdown} />
        <GhostBtn onPress={resetToIdle}>{t.newCheckin}</GhostBtn>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <p className="text-sm uppercase tracking-widest font-semibold" style={{ color: SUBTLE }}>{t.staffScanQr}</p>
        <div className="p-5 rounded-3xl shadow-2xl" style={{ background: "#fff" }}>
          <QRCodeCanvas value={ticketUrl} size={280} level="M" includeMargin={false} />
        </div>
        <p className="text-xs font-mono" style={{ color: SUBTLE }}>
          {ticket.ticketNumber != null ? String(ticket.ticketNumber).padStart(3, "0") : (ticket.appointmentId ?? ticket.token.substring(0, 10))}
        </p>
      </div>
    </div>
  );

  // ── APPOINTMENT CONFIRMED ────────────────────────────────────────────────────
  if (screen === "appointment_confirmed" && todayAppointment) {
    const apptTime = fmtTime(todayAppointment.appointmentTime, kioskConfig?.timezone);
    const { emoji } = getCat("nails"); // fallback; ideally derived from service category
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center select-none overflow-hidden"
        onContextMenu={e => e.preventDefault()}
        style={{ ...NO_SELECT, background: BG }}>

        {/* Decorative blobs */}
        <div className="absolute top-[-80px] right-[-120px] w-[550px] h-[550px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(232,72,145,0.10) 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-100px] left-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(167,139,250,0.12) 0%, transparent 70%)" }} />

        <div className="relative z-10 flex flex-col items-center gap-8 px-12 max-w-2xl w-full">
          {/* Big checkmark */}
          <div className="w-32 h-32 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`, boxShadow: SHADOW_LG }}>
            <span className="text-white text-6xl font-black">✓</span>
          </div>

          {/* Greeting */}
          <div className="text-center">
            <h1 className="text-6xl font-black leading-tight" style={{ color: TEXT }}>
              {t.youreCheckedIn(clientFirst)}
            </h1>
            <p className="text-xl mt-3" style={{ color: MUTED }}>
              {t.appointmentConfirmed}
            </p>
          </div>

          {/* Appointment details card */}
          <div className="w-full rounded-3xl overflow-hidden"
            style={{ background: SURFACE, border: `2px solid ${BORDER}`, boxShadow: SHADOW_LG }}>

            {/* Pink header strip */}
            <div className="px-8 py-5 flex items-center gap-4"
              style={{ background: `linear-gradient(135deg, ${PRIMARY}18, ${ACCENT}12)`, borderBottom: `1.5px solid ${BORDER}` }}>
              {emoji && <span className="text-4xl">{emoji}</span>}
              <div>
                <p className="text-xs uppercase tracking-widest font-bold mb-0.5" style={{ color: PRIMARY }}>{t.yourService}</p>
                <p className="text-2xl font-black" style={{ color: TEXT }}>{todayAppointment.serviceName}</p>
              </div>
            </div>

            <div className="px-8 py-6 grid grid-cols-2 gap-4">
              {/* Time */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: PRIMARY_S, border: `1.5px solid ${BORDER}` }}>
                  <span className="text-lg">{G("🕐")}</span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest font-bold mb-0.5" style={{ color: SUBTLE }}>{t.appointmentTime}</p>
                  <p className="text-2xl font-black" style={{ color: TEXT }}>{apptTime}</p>
                </div>
              </div>

              {/* Staff */}
              {todayAppointment.staffName && (
                <div className="flex items-start gap-3">
                  {todayAppointment.staffAvatarThumbUrl ? (
                    <img
                      src={todayAppointment.staffAvatarThumbUrl}
                      className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                      alt={todayAppointment.staffName}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: PRIMARY_S, border: `1.5px solid ${BORDER}` }}>
                      <span className="text-lg">{G("💇")}</span>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-widest font-bold mb-0.5" style={{ color: SUBTLE }}>{t.yourStylist}</p>
                    <p className="text-2xl font-black" style={{ color: TEXT }}>{todayAppointment.staffName}</p>
                  </div>
                </div>
              )}
            </div>

            {/* "Will be with you shortly" footer */}
            <div className="px-8 py-4 flex items-center gap-3"
              style={{ background: OK_SOFT, borderTop: `1.5px solid ${BORDER}` }}>
              <span className="text-2xl">{G("✨")}</span>
              <p className="text-lg font-semibold" style={{ color: OK_TEXT }}>
                {todayAppointment.staffName
                  ? t.staffWithYouSoon(todayAppointment.staffName)
                  : t.teamWithYouSoon}
              </p>
            </div>
          </div>

          {/* Loyalty points */}
          {(clientInfo?.loyaltyPoints ?? 0) > 0 && (
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full text-lg font-semibold"
              style={{ background: PILL_BG, border: `1.5px solid ${PILL_BORDER}`, color: PILL_TEXT }}>
              <span className="text-2xl">{G("⭐")}</span>
              <span>{t.loyaltyPointsLabel(clientInfo!.loyaltyPoints)}</span>
            </div>
          )}

          {/* Auto-reset */}
          <CountdownWidget seconds={countdown} />
          <GhostBtn onPress={resetToIdle}>{t.doneBtn}</GhostBtn>
        </div>
      </div>
    );
  }

  return null;
}

function fmtTime(iso: string, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz ?? undefined,
    }).format(new Date(iso));
  } catch {
    // Fallback if tz string is invalid
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m < 10 ? "0" + m : m} ${ampm}`;
  }
}

// Helper: make a colour slightly transparent for chip backgrounds
function soft(hex: string) {
  return hex + "18";
}

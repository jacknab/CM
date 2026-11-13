import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { startDeviceHealth } from "@/lib/deviceHealth";
import { setPrintSettings } from "@/lib/printSettings";
import { setSalonTimeZone } from "@/lib/salonClock";
import { printNativeCheckinTicket, slipServiceNames } from "../lib/native-checkin-ticket";
import { useParams } from "react-router-dom";
import { NailChoiceStep } from "./kiosk/NailChoiceStep";
import { KioskMenuScreen } from "../components/kiosk/KioskMenuScreen";
import { KioskPictureScreen } from "../components/kiosk/KioskPictureScreen";
import { QRCodeCanvas } from "qrcode.react";
import { KIOSK_LANGS, LangCode, translations, type KioskStrings } from "../lib/kioskTranslations";
import {
  kioskFlow, nextKioskStep, normalizeKioskLayout, previousKioskStep, sameGroup, type KioskMenu, type KioskNext,
  type KioskLayout, type KioskLook, type KioskStepId, type KioskThemeColors,
} from "@shared/kiosk/layout";
import { isBusinessTypeKey } from "@shared/kiosk/businessTypes";
import { fillKioskText, resolveKioskText, type KioskText } from "@shared/kiosk/text";
import { isValidNanpPrefix } from "../lib/phone-validation";
import { useShake } from "../hooks/use-shake";
import { kioskFetch, isKioskDeviceAuthorized } from "../lib/kioskDevice";
import { localHub } from "../lib/local-hub";
import { hubKioskCheckin, hubKioskLookup, hubKioskWait } from "../lib/kiosk-hub";
import { installRequestDeadline } from "../lib/request-deadline";
import { syncEngine } from "../lib/sync-engine";

// No tap here waits on a server that cannot be reached; with no internet the kiosk works through the POS tablet.
installRequestDeadline();
syncEngine.watchReachability();
const kioskConfigKey = (slug: string) => `certxa.kiosk.config.${slug}`;
const kioskNailCfgKey = (slug: string, serviceId: number) => `certxa.kiosk.nailcfg.${slug}.${serviceId}`;
const keepJson = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };
const keptJson = (key: string): any => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
import KioskPairing from "../components/kiosk/KioskPairing";
// Bundled with the app (not public/), like the front desk banner.
import kioskWelcomeBanner from "@/assets/kiosk-welcome-banner.jpg";
import KioskSuspendedScreen from "../components/kiosk/KioskSuspendedScreen";

import { keepSocketAlive } from "@/lib/ws-keepalive";
type Screen =
  | "idle" | "phone" | "loading" | "welcome"
  | "name_entry" | "service_type" | "services" | "service_options" | "menu"
  | "nail_size" | "nail_shape" | "nail_effects"
  | "addons" | "stylist" | "review" | "ticket"
  | "appointment_confirmed" | "error" | "wait_confirm" | "fully_booked"
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

interface AddonItem          { id: number; name: string; description?: string | null; price: number; duration: number; imageUrl?: string | null; serviceIds: number[];
  /** A Kiosk Extra (Kiosk Builder): only on the business's own screens, never in the add-ons step; pick-one within its group. */
  kioskExtra?: boolean; kioskExtraGroup?: string | null; }
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
interface TicketData         { token: string; clientName: string; appointmentId: number | null; ticketNumber?: number | null; services: ServiceItem[]; addons?: AddonItem[]; staffName: string | null;
  /** Checked in through the POS tablet over the salon hub with no internet: no server ticket (and no QR) yet. */
  offline?: boolean; }
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

/** The theme drawn now (look + the business's colours), so applying the same one again does nothing. */
let THEME_KEY = JSON.stringify(["classic", {}]);

/** `hex` moved `amount` (0–1) of the way to white or black: pressed buttons and soft tints of an owner's colour. */
function mixHex(hex: string, toward: "#ffffff" | "#000000", amount: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
  const ch = (v: number, shift: number) => (v >> shift) & 255;
  const m = (shift: number) => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * amount);
  return `#${((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1)}`;
}

/**
 * Switch the kiosk to a look from its layout (Kiosk Builder): "boutique" is the nail-salon look, "classic" the
 * default; then the business's own colours on top. True when anything changed (the caller re-renders).
 */
function applyKioskTheme(theme: { look: KioskLook; colors: KioskThemeColors }): boolean {
  const key = JSON.stringify([theme.look, theme.colors]);
  if (key === THEME_KEY) return false;
  THEME_KEY = key;
  const nail = theme.look === "boutique";
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
  const c = theme.colors;
  if (c.primary) { PRIMARY = c.primary; PRIMARY_D = mixHex(c.primary, "#000000", 0.12); PRIMARY_S = mixHex(c.primary, "#ffffff", 0.92); }
  if (c.background) BG = c.background;
  if (c.surface) SURFACE = c.surface;
  if (c.text) TEXT = c.text;
  return true;
}

/**
 * A pictogram. The default kiosk uses emoji. The nail-salon look uses none at all (its reference artwork is
 * type and illustration only): it leaves an invisible marker, and index.css hides whatever badge or disc
 * existed only to hold the pictogram.
 */
function G(emoji: string): React.ReactNode {
  return NAIL_LOOK ? <i className="kx-g" aria-hidden /> : emoji;
}

/** Remembered per kiosk address, so a kiosk opens in its own look instead of flashing the default. */
const kioskPathKey = (name: string) => `certxa.kiosk.${name}.${typeof window !== "undefined" ? window.location.pathname : ""}`;
/** The look last drawn here; before the Kiosk Builder only "nail look on" was kept (nailLook = "1"). */
function rememberedTheme(): { look: KioskLook; colors: KioskThemeColors } | null {
  try {
    const kept = JSON.parse(localStorage.getItem(kioskPathKey("theme")) ?? "null");
    if (kept && typeof kept === "object") return normalizeKioskLayout({ theme: kept }, "other").theme;
    if (localStorage.getItem(kioskPathKey("nailLook")) === "1") return { look: "boutique", colors: {} };
  } catch { /* private mode */ }
  return null;
}

/** The kiosk's built-in words in `lang`, with the business's own words (layout.text) in their place. */
function kioskStrings(lang: LangCode, text: Record<string, KioskText>): KioskStrings {
  const base = translations[lang];
  const out: Record<string, unknown> = { ...base };
  for (const [key, val] of Object.entries(text)) {
    if (!(key in base)) continue;
    // English stands in for a language the business didn't write.
    const v = (val[lang] ?? "").trim() || (val.en ?? "").trim();
    if (!v) continue;
    out[key] = typeof (base as any)[key] === "function" ? (name: string) => fillKioskText(v, { name }) : v;
  }
  return out as unknown as KioskStrings;
}

/** Before the first config arrives (and for a config kept from before the Kiosk Builder): today's kiosk. */
const STARTING_LAYOUT: KioskLayout = normalizeKioskLayout(null, "other");

/**
 * The Kiosk Builder's live preview (/kiosk/:slug?preview=draft, in the builder's frame): the draft layout, for a
 * signed-in login of the salon. Nothing real happens in it — no client lookup, no check-in, no slip, no device
 * report — and the builder can refresh it or send it to a screen (postMessage, same origin only).
 */
const PREVIEW_PARAM = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("preview") ?? "" : "";
/** The builder's preview: the draft, or one of the business's kiosk configurations (preview=config-<id>). */
const PREVIEW = PREVIEW_PARAM === "draft" || /^config-\d+$/.test(PREVIEW_PARAM);
/**
 * The builder's screen editor (?preview=draft&edit=1): a click on something marked data-kx-edit tells the builder
 * what to change instead of doing anything; parts that can be changed are outlined; the kiosk never resets by itself.
 */
const PREVIEW_EDIT = PREVIEW && new URLSearchParams(window.location.search).get("edit") === "1";
const configPath = (slug: string) => `/api/public/kiosk/${slug}/config${PREVIEW ? `?preview=${encodeURIComponent(PREVIEW_PARAM)}` : ""}`;
export type KioskPreviewTarget = "welcome" | "phone" | "category" | "services" | "addons" | "provider" | "review" | "ticket" | "screen";
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
function CountdownWidget({ seconds, total = 30 }: { seconds: number; total?: number }) {
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
    const kept = PREVIEW ? null : rememberedTheme();
    if (kept) applyKioskTheme(kept);
    return 0;
  });
  // The business's kiosk layout (Kiosk Builder): steps, look, limits, words. layoutRef for callbacks.
  const [layout, setLayout] = useState<KioskLayout>(STARTING_LAYOUT);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // The business's own screens (layout.menuMode "screens"): the screens opened so far (back closes the last one)
  // and the page shown on the top one.
  const [menuStack, setMenuStack] = useState<string[]>([]);
  const [menuPage, setMenuPage] = useState(0);
  // Picture screens: a short message over the picture ("Please choose a service first"), gone after a few seconds.
  const [pictureNote, setPictureNote] = useState<string | null>(null);
  const pictureNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPictureNote = (text: string) => {
    setPictureNote(text);
    if (pictureNoteTimer.current) clearTimeout(pictureNoteTimer.current);
    pictureNoteTimer.current = setTimeout(() => setPictureNote(null), 3500);
  };
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
  // Shown in place of the chips when a third service (or one that makes the visit too long) is tapped.
  const [svcLimitNote, setSvcLimitNote] = useState(false);
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
    setStoreId(d.store?.id ?? d.storeId ?? null);
    setStoreConfig(d.store);
    setAllServices(d.services || []);
    setAllStaff(d.staff || []);
    setAllAddons(d.addons || []);
    setBusyStaffIds(d.busyStaffIds || []);
    setStaffServiceIds(d.staffServiceIds || {});
    setKioskConfig({ kioskEnabled: d.kioskEnabled !== false, welcomeHeadline: d.welcomeHeadline ?? null, welcomeSubText: d.welcomeSubText ?? null, loyaltyPromoText: d.loyaltyPromoText ?? null, categoryImages: d.categoryImages ?? null, timezone: d.timezone ?? null, showServicePrice: d.showServicePrice !== false, showServiceDuration: d.showServiceDuration !== false, dualScreenMode: d.dualScreenMode === true });
    setSalonTimeZone(d.timezone);
    // Whether a check-in slip prints (front desk setup → Printing).
    if (d.checkinSlip === "auto" || d.checkinSlip === "none") setPrintSettings({ checkinSlip: d.checkinSlip });
    setServiceOptionsMap(d.serviceOptionsMap ?? {});
    // The kiosk layout. A config kept from before the Kiosk Builder has none: nail salons had the nail look.
    const next = d.layout
      ? normalizeKioskLayout(d.layout, isBusinessTypeKey(d.businessType) ? d.businessType : "other")
      : normalizeKioskLayout({ theme: { look: d.serviceCheckin === true ? "boutique" : "classic" } }, "other");
    setLayout(next);
    setLang((l) => (next.welcome.languages.includes(l) ? l : "en"));
    // Remembered for this kiosk address so the next start opens in it.
    if (!PREVIEW) try { localStorage.setItem(kioskPathKey("theme"), JSON.stringify(next.theme)); } catch { /* private mode */ }
    if (applyKioskTheme(next.theme)) setLookTick((n) => n + 1);
    if (isInitialLoad) {
      // The kiosk stands inside the salon: never a "closed" screen.
      setScreen("idle");
      // The builder's preview: the design is in, so the builder may send it to a screen now.
      if (PREVIEW) setTimeout(() => window.parent?.postMessage({ type: "kiosk-preview-ready" }, window.location.origin), 0);
      // Check-in calls need a device the salon set up: signed in (the Certxa app), or paired once.
      if (slug && !PREVIEW) isKioskDeviceAuthorized(slug).then(ok => { if (!ok) setScreen("pair"); });
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    fetch(configPath(slug))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (!PREVIEW) keepJson(kioskConfigKey(slug), d); applyConfig(d, true); })
      .catch(() => {
        // No connection: open with the last menu and settings this kiosk was sent.
        const kept = keptJson(kioskConfigKey(slug));
        if (kept) applyConfig(kept, true);
        else { setError("Failed to connect."); setScreen("error"); }
      });
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
      fetch(configPath(slug))
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(d => { if (!PREVIEW) keepJson(kioskConfigKey(slug), d); if (!cancelled) applyConfig(d, false); })
        .catch(() => {});
    };
    refresh();
    const iv = setInterval(refresh, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [slug, screen, applyConfig]);

  // The salon hub: with no internet, lookups and check-ins go to the POS tablet over the salon's Wi-Fi.
  useEffect(() => { if (storeId && !PREVIEW) void localHub.start(storeId, "screen"); }, [storeId]);
  // The kiosk's offline-mode health, reported every 2 minutes (lib/deviceHealth.ts; support's Devices tab).
  useEffect(() => (storeId && !PREVIEW ? startDeviceHealth({ role: "kiosk", storeId, slug: slug ?? null, usesOfflineQueue: false }) : undefined), [storeId, slug]);

  // ── WebSocket: account_status_changed + dual-screen POS checkout events ──
  useEffect(() => {
    if (!storeId || PREVIEW) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    let ws: WebSocket;
    let destroyed = false;
    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${storeId}`);
      keepSocketAlive(ws);
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
    // No connection to the server: the salon hub takes it to the POS tablet (a check-in slip still prints there).
    if (!ws || ws.readyState !== WebSocket.OPEN || syncEngine.isOffline()) { localHub.send({ type, ...payload }); return; }
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
    setNewClientName(""); setSel([]); setSelStaff("none"); setSvcLimitNote(false);
    setTicket(null); setError("");
    setSvcPage(0);
    setSelectedCategoryGroup(null); setFilteredServices(null);
    setTodayAppointment(null); setWaitInfo(null);
    setSelectedAddons([]); setAvailableAddons([]);
    setParentServiceForOptions(null); setSelectedOption(null);
    setNailCfg(null); setNailSize(null); setNailShape(null); setNailEffect(null);
    setSmart(null); offeredRef.current = { serviceIds: [], addonId: null }; waitingServiceRef.current = null;
    setMenuStack([]); setMenuPage(0);
    if (cdownRef.current) clearInterval(cdownRef.current);
  }, [cancelPendingMarker]);

  useEffect(() => {
    if ((screen === "ticket" || screen === "appointment_confirmed" || screen === "no_thanks" || screen === "waitlist_added") && !PREVIEW_EDIT) {
      setCountdown(layoutRef.current.timing.ticketResetSeconds);
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
    return false;
  };

  // Check real-time availability and route accordingly
  // `then`: where to go when someone is free — the category cards, or (a category picked on the welcome screen)
  // that category's services.
  // The category cards, unless the layout switched them off (then every service on one list).
  const firstStepScreen = (then: "service_type" | "services"): Screen => {
    const l = layoutRef.current;
    // The business's own screens take the place of the category cards and the service list.
    if (l.menuMode === "screens" && l.startMenuId) { setMenuStack([l.startMenuId]); setMenuPage(0); return "menu"; }
    return then === "service_type" && !kioskFlow(l).includes("category") ? "services" : then;
  };

  const checkAvailabilityAndRoute = useCallback(async (then: "service_type" | "services" = "service_type") => {
    if (PREVIEW) { setScreen(firstStepScreen(then)); return; }
    try {
      const r = await fetch(`/api/public/kiosk/${slug}/availability`);
      const d = await r.json();
      if (d.hasAvailableStaff || d.error) {
        setScreen(firstStepScreen(then));
      } else {
        const mins: number = d.estimatedWaitMinutes ?? 30;
        setWaitInfo({ estimatedMinutes: mins });
        // >60 min wait → fully booked screen with no-show waitlist offer
        setScreen(mins > 60 ? "fully_booked" : "wait_confirm");
      }
    } catch {
      // No internet: the POS tablet works out the wait from its own board. No answer: fail open, as before.
      const d = await hubKioskWait();
      if (!d || d.hasAvailableStaff) { setScreen(firstStepScreen(then)); return; }
      const mins = d.estimatedWaitMinutes ?? 30;
      setWaitInfo({ estimatedMinutes: mins });
      setScreen(mins > 60 ? "fully_booked" : "wait_confirm");
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
      // No internet: the text could never be sent, so say so instead of a connection error.
      setError("We can't add you to the text list right now. Please check in to wait, or ask the front desk.");
      setScreen("error");
    }
  }, [slug, phone, clientInfo, newClientName]);

  // Idle reset. After a stretch with no touch the "still there?" sheet counts down, and only then does the
  // kiosk start over. The nail length / shape / design steps get much longer: clients study those.
  const kick = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    if (warnRef.current) clearInterval(warnRef.current);
    stillThere.set(null);
    if (screen === "idle" || screen === "ticket" || PREVIEW_EDIT) return;
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
    if (slip.ticketNumber != null) {
      printedLocally = await printNativeCheckinTicket({
        clientName: slip.clientName || "Guest",
        ticketNumber: Number(slip.ticketNumber),
        // A check-in made through the POS with no internet has no booking yet: its code is the ticket number.
        qrValue: slip.appointmentId != null ? `BK:${slip.appointmentId}` : `TN:${slip.ticketNumber}`,
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
        bookingCode: slip.appointmentId != null ? `BK:${slip.appointmentId}` : `TN:${slip.ticketNumber}`,
        todayCount: slip.todayCount,
        timeStr,
        dateStr,
      });
    }
  };

  const doLookup = async (p: string) => {
    // Preview: every number is a new client (no real client is looked up or marked arrived).
    if (PREVIEW) { setScreen("name_entry"); return; }
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
    } catch {
      // No internet: ask the POS tablet over the salon hub.
      const answer = await hubKioskLookup(p);
      if (!answer) { setError("Connection error. Please try again."); setScreen("error"); return; }
      markerTokenRef.current = null;
      setSmart(null);
      offeredRef.current = { serviceIds: [], addonId: null };
      if (answer.found && answer.client) {
        setClientInfo(answer.client as any);
        if (answer.alreadyOnTicket) {
          setError(t.alreadyCheckedIn);
          setScreen("error");
        } else if (answer.todayAppointment) {
          // Their booking today is marked arrived on the POS: same screen and slip as online.
          const appt = answer.todayAppointment;
          setTodayAppointment(appt);
          setScreen("appointment_confirmed");
          void printCheckinSlip({
            clientName: answer.client.name, staffName: appt.staffName ?? undefined,
            services: appt.serviceName ? [{ name: appt.serviceName }] : [], appointmentId: appt.id, ticketNumber: appt.ticketNumber,
          });
        } else {
          setTodayAppointment(null);
          setScreen("welcome");
          setTimeout(() => { checkAvailabilityAndRoute(); }, 1200);
        }
      } else {
        setScreen("name_entry");
      }
    }
  };

  // ── Flow (Kiosk Builder) ──────────────────────────────────────────────────────
  // After the services come the layout's own steps, in its order: questions (a nail service's length, shape
  // and design), add-ons, and who does it. A step with nothing to show for this client is passed over.
  const nailCfgRef = useRef<NailConfig | null>(null);
  const addonsFor = (svc: ServiceItem | undefined) =>
    svc ? allAddons.filter((a) => !a.kioskExtra && (a.serviceIds.length === 0 || a.serviceIds.includes(svc.id))) : [];
  /**
   * An add-on or Kiosk Extra tapped on one of the business's own screens: added to the chosen service, or taken off
   * if it was on. A Kiosk Extra in a group (say "Nail shape") replaces the one already chosen from that group.
   */
  const chooseAddonOnScreen = (addonId: number, note: (text: string) => void) => {
    const first = selectedServices[0];
    if (!first) return note(t.chooseServiceFirst);
    const addon = allAddons.find((x) => x.id === addonId);
    if (!addon) return;
    if (addon.serviceIds.length && !addon.serviceIds.includes(first.id)) return note(t.addonNotForService);
    setSelectedAddons((cur) => {
      if (cur.some((x) => x.id === addon.id)) return cur.filter((x) => x.id !== addon.id);
      const group = addon.kioskExtra ? (addon.kioskExtraGroup ?? "").trim().toLowerCase() : "";
      const kept = group ? cur.filter((x) => !(x.kioskExtra && (x.kioskExtraGroup ?? "").trim().toLowerCase() === group)) : cur;
      return [...kept, addon];
    });
  };
  /**
   * Continue from one of the business's own screens: a service must be chosen, and every "must choose one" Kiosk
   * Extras group this screen shows (layout.requiredGroups) needs its pick. Otherwise the screen says what's missing.
   */
  /** The services and add-ons a screen offers (its buttons and tap spots). */
  const screenItems = (m: KioskMenu) => ({
    services: new Set([...m.tiles.flatMap((x) => (x?.kind === "service" && x.serviceId != null ? [x.serviceId] : [])),
      ...m.spots.flatMap((sp) => (sp.action.kind === "service" ? [sp.action.serviceId] : []))]),
    addons: new Set([...m.tiles.flatMap((x) => (x?.kind === "addon" && x.addonId != null ? [x.addonId] : [])),
      ...m.spots.flatMap((sp) => (sp.action.kind === "addon" ? [sp.action.addonId] : []))]),
  });
  const continueFromScreen = (screenMenu: KioskMenu, note: (text: string) => void, dest: "next" | "staff" | "review" = "next") => {
    kick();
    // "They must choose before moving on" (the screen's own setting).
    if (screenMenu.mustChoose) {
      const items = screenItems(screenMenu);
      if (!selectedServices.some((x) => items.services.has(x.id)) && !selectedAddons.some((x) => items.addons.has(x.id))) return note(t.chooseOneHere);
    }
    if (!selectedServices.length) return note(t.chooseServiceFirst);
    const shownIds = [
      ...screenMenu.spots.flatMap((sp) => (sp.action.kind === "addon" ? [sp.action.addonId] : [])),
      ...screenMenu.tiles.flatMap((tl) => (tl?.kind === "addon" && tl.addonId != null ? [tl.addonId] : [])),
    ];
    for (const group of layout.requiredGroups) {
      const shown = shownIds.some((id) => { const a = allAddons.find((x) => x.id === id); return !!a?.kioskExtra && sameGroup(a.kioskExtraGroup, group); });
      if (shown && !selectedAddons.some((a) => a.kioskExtra && sameGroup(a.kioskExtraGroup, group))) return note(t.chooseFromGroup(group));
    }
    // Go to Staff / Finish (owner, 2026-11-13): straight there, past the steps in between.
    if (dest === "staff" && allStaff.length > 0) return setScreen("stylist");
    if (dest === "staff" || dest === "review") return setScreen("review");
    void afterServiceChosen();
  };
  /**
   * A button or tap spot's "then" (KioskNext), run once its choice is on screen: a render later, so the next step
   * sees the service or add-on just chosen. Dropped if the choice didn't happen (a limit, or it was a second tap).
   */
  const [pendingNext, setPendingNext] = useState<null | { next: KioskNext; fromMenuId: string; serviceId?: number; addonId?: number }>(null);
  useEffect(() => {
    if (!pendingNext) return;
    const p = pendingNext;
    setPendingNext(null);
    if (p.serviceId != null && !selectedServices.some((x) => x.id === p.serviceId)) return;
    if (p.addonId != null && !selectedAddons.some((x) => x.id === p.addonId)) return;
    if (p.next.kind === "menu") {
      const to = p.next.menuId;
      if (layout.menus.some((m) => m.id === to)) { setMenuStack((st) => [...st, to]); setMenuPage(0); }
      return;
    }
    const from = layout.menus.find((m) => m.id === p.fromMenuId);
    if (from) continueFromScreen(from, (text) => showPictureNote(text), p.next.kind === "continue" ? "next" : p.next.kind);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNext, selectedServices, selectedAddons]);
  const nailCfgHasOptions = (cfg: NailConfig | null) =>
    !!cfg?.enabled && !!(cfg.sizes?.length || cfg.shapes?.length || cfg.effects?.length);
  const stepApplies = (id: KioskStepId, svc: ServiceItem | undefined, cfg: NailConfig | null): boolean => {
    if (id === "questions") return nailCfgHasOptions(cfg);
    if (id === "addons") return addonsFor(svc).length > 0;
    if (id === "provider") return allStaff.length > 0;
    if (id === "category") return layout.menuMode !== "screens";
    return true;
  };

  /** Shows a step. `backwards`: arriving from the step after it (questions open on their last screen). */
  const enterStep = (id: KioskStepId | "review" | null, svc: ServiceItem | undefined, cfg: NailConfig | null, backwards = false) => {
    if (id === "questions" && cfg) {
      kick();
      if (backwards) return setScreen(cfg.effects?.length ? "nail_effects" : cfg.shapes?.length ? "nail_shape" : "nail_size");
      return setScreen(cfg.sizes?.length ? "nail_size" : cfg.shapes?.length ? "nail_shape" : "nail_effects");
    }
    if (id === "addons") {
      const list = addonsFor(svc);
      // An add-on this client has had before goes first and is marked — never pre-selected.
      const hadBefore = (smart?.addonIds ?? []).find((aid) => list.some((a) => a.id === aid)) ?? null;
      if (!backwards) offeredRef.current = { ...offeredRef.current, addonId: hadBefore };
      setAvailableAddons(hadBefore == null ? list : [...list].sort((a, b) => Number(b.id === hadBefore) - Number(a.id === hadBefore)));
      return setScreen("addons");
    }
    if (id === "provider") return setScreen("stylist");
    if (id === "review") return setScreen("review");
    if (id === "category") return setScreen("service_type");
    if (id === "services") return setScreen(layout.menuMode === "screens" && menuStack.length ? "menu" : layout.menuMode === "screens" ? firstStepScreen("services") : "services");
    backToStart();
  };

  /** On to the step after `from`. */
  const advance = (from: KioskStepId, svc: ServiceItem | undefined = selectedServices[0], cfg: NailConfig | null = nailCfgRef.current) => {
    kick();
    enterStep(nextKioskStep(kioskFlow(layout), from, (id) => stepApplies(id, svc, cfg)), svc, cfg);
  };

  /** Back to the step before `from`. */
  const goBack = (from: KioskStepId | "review") => {
    kick();
    const svc = selectedServices[0], cfg = nailCfgRef.current;
    enterStep(previousKioskStep(kioskFlow(layout), from, (id) => stepApplies(id, svc, cfg)), svc, cfg, true);
  };

  /** Before the first step: a returning client's welcome (which checks the wait again), a new client's name. */
  const backToStart = () => {
    if (clientInfo) {
      // Return to welcome then re-check availability so the welcome screen doesn't dead-end.
      setScreen("welcome");
      setTimeout(() => checkAvailabilityAndRoute(), 100);
    } else {
      setScreen("name_entry");
    }
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

  // Called once a service is confirmed. With the questions step on, a service that has questions (a fake-nail
  // service's length → shape → design) asks them; then the layout's next steps.
  const afterServiceChosen = async (chosen?: ServiceItem) => {
    const selSvc = chosen ?? selectedServices[0];
    setNailCfg(null); setNailSize(null); setNailShape(null); setNailEffect(null);
    nailCfgRef.current = null;
    let cfg: NailConfig | null = null;
    if (selSvc && kioskFlow(layout).includes("questions")) {
      setScreen("loading");
      try {
        try {
          const r = await fetch(`/api/public/kiosk/${slug}/nail-config/${selSvc.id}`);
          cfg = await r.json();
          if (r.ok) keepJson(kioskNailCfgKey(slug!, selSvc.id), cfg);
        } catch (err) {
          // No connection: the options this kiosk was last sent for this service.
          const kept = keptJson(kioskNailCfgKey(slug!, selSvc.id));
          if (!kept) throw err;
          cfg = kept;
        }
      } catch { cfg = null; /* fail open — skip the questions on any network/parse error */ }
      if (nailCfgHasOptions(cfg)) { setNailCfg(cfg); nailCfgRef.current = cfg; }
      else cfg = null;
    }
    advance("services", selSvc, cfg);
  };

  // Through the nail questions, skipping any with no options; after the last, the layout's next step.
  const nailStepNext = (from: "size" | "shape") => {
    kick();
    if (from === "size") {
      if (nailCfg?.shapes?.length)  return setScreen("nail_shape");
      if (nailCfg?.effects?.length) return setScreen("nail_effects");
      return advance("questions");
    }
    // from === "shape"
    if (nailCfg?.effects?.length) return setScreen("nail_effects");
    return advance("questions");
  };

  const doCheckIn = async () => {
    if (PREVIEW) { showPreviewTicket(); return; }
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
    } catch {
      // No internet: the POS tablet checks the client in over the salon hub and gives the ticket number.
      const clientName = clientInfo?.name ?? (newClientName.trim() || "Walk-in Guest");
      const answer = await hubKioskCheckin({
        clientId: clientInfo?.id ?? null, clientName, phone,
        serviceIds: selectedServices.map((s) => s.id), addonIds: selectedAddons.map((a) => a.id),
        nail: { sizeId: nailSize?.nailVocabId ?? null, shapeId: nailShape?.nailVocabId ?? null, effectId: nailEffect?.nailVocabId ?? null },
        staffId: staffIdToSend,
      });
      if (!answer?.success) { setError(answer?.error || "Connection error. Please try again."); setScreen("error"); return; }
      markerTokenRef.current = null;
      setTicket({ token: "", clientName: answer.clientName ?? clientName, appointmentId: null, ticketNumber: answer.ticketNumber ?? null,
        services: selectedServices, addons: selectedAddons, staffName: answer.staffName ?? null, offline: true });
      setScreen("ticket");
      await printCheckinSlip({
        clientName: answer.clientName ?? clientName, staffName: answer.staffName ?? undefined,
        services: [...selectedServices.map((s) => ({ name: s.name })), ...selectedAddons.map((a) => ({ name: `+ ${a.name}` }))],
        appointmentId: null, ticketNumber: answer.ticketNumber ?? null,
      });
    }
  };

  // ── Builder preview ──────────────────────────────────────────────────────────
  // A made-up ticket for what the client picked (no check-in is made).
  const showPreviewTicket = (svcs: ServiceItem[] = selectedServices, addons: AddonItem[] = selectedAddons) => {
    setTicket({
      token: "", clientName: clientInfo?.name ?? (newClientName.trim() || "Alex"), appointmentId: null, ticketNumber: 12,
      services: svcs, addons, staffName: selectedStaff && selectedStaff !== "none" ? (selectedStaff as StaffItem).name : null,
    });
    setScreen("ticket");
  };
  // The builder's "show this screen" buttons: sets up a sample client and service where the screen needs one.
  const previewGoto = (target: KioskPreviewTarget, menuId?: string) => {
    const sample = allServices.find((sv) => addonsFor(sv).length > 0) ?? allServices[0];
    const withSample = () => { if (!clientInfo && !newClientName) setNewClientName("Alex"); if (sample && !selectedServices.length) setSel([sample]); };
    switch (target) {
      case "welcome": return resetToIdle();
      case "phone": return setScreen("phone");
      case "category": if (!newClientName) setNewClientName("Alex"); setFilteredServices(null); return setScreen(firstStepScreen("service_type"));
      case "services": if (!newClientName) setNewClientName("Alex"); setFilteredServices(null); setSvcPage(0); return setScreen(layout.menuMode === "screens" ? firstStepScreen("services") : "services");
      case "addons": withSample(); return enterStep("addons", selectedServices[0] ?? sample, null);
      case "provider": withSample(); return setScreen("stylist");
      case "review": withSample(); return setScreen("review");
      case "screen": {
        // One of the business's own screens (Kiosk Builder › Screens › Live preview).
        if (!menuId || !layout.menus.some((m) => m.id === menuId)) return;
        if (!newClientName) setNewClientName("Alex");
        setMenuStack([menuId]); setMenuPage(0);
        return setScreen("menu");
      }
      case "ticket": return showPreviewTicket(selectedServices.length ? selectedServices : sample ? [sample] : [], selectedAddons);
    }
  };
  // Screen editor: clicks pick what to change (they don't tap through the kiosk); the builder can mark the picked part.
  useEffect(() => {
    if (!PREVIEW_EDIT) return;
    const style = document.createElement("style");
    style.textContent = `[data-kx-edit]{cursor:pointer;outline:2px dashed transparent;outline-offset:6px;border-radius:6px;transition:outline-color .15s}
[data-kx-edit]:hover{outline-color:rgba(37,99,235,.7)}
[data-kx-edit][data-kx-selected]{outline:3px solid #2563eb}
body *{cursor:default}`;
    document.head.appendChild(style);
    const pick = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-kx-edit]") as HTMLElement | null;
      e.preventDefault(); e.stopPropagation();
      if (e.type !== "pointerdown") return;
      document.querySelectorAll("[data-kx-selected]").forEach((x) => x.removeAttribute("data-kx-selected"));
      if (el) el.setAttribute("data-kx-selected", "");
      window.parent?.postMessage({ type: "kiosk-preview-edit", target: el?.getAttribute("data-kx-edit") ?? null }, window.location.origin);
    };
    for (const type of ["pointerdown", "pointerup", "click", "mousedown", "touchstart"]) document.addEventListener(type, pick, true);
    return () => { style.remove(); for (const type of ["pointerdown", "pointerup", "click", "mousedown", "touchstart"]) document.removeEventListener(type, pick, true); };
  }, []);
  const previewGotoRef = useRef(previewGoto);
  previewGotoRef.current = previewGoto;
  const reloadConfigRef = useRef<() => void>(() => {});
  reloadConfigRef.current = () => {
    if (!slug) return;
    fetch(configPath(slug)).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) applyConfig(d, false); }).catch(() => {});
  };
  useEffect(() => {
    if (!PREVIEW) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "kiosk-preview-refresh") reloadConfigRef.current();
      if (e.data.type === "kiosk-preview-goto") previewGotoRef.current(e.data.target, typeof e.data.menuId === "string" ? e.data.menuId : undefined);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The layout's limits: how many services one visit may have, and how long a visit of more than one may be (by
  // default two, two and a half hours; the server holds the same limits). Tapping a chosen service takes it off.
  // With all chosen, tapping another swaps the last one. Add-ons and nail choices belong to the first service,
  // so they start again only when that one changes.
  const toggleSvc = (s: ServiceItem) => {
    const current = selectedServices;
    const { maxServices, maxVisitMinutes } = layout.services;
    let next: ServiceItem[];
    if (current.find(x => x.id === s.id)) next = current.filter(x => x.id !== s.id);
    else if (current.length === 0 || maxServices === 1) next = [s];
    else {
      const keep = current.length < maxServices ? current : current.slice(0, -1);
      if (keep.reduce((sum, x) => sum + x.duration, 0) + s.duration > maxVisitMinutes) { setSvcLimitNote(true); kick(); return; }
      next = [...keep, s];
    }
    setSvcLimitNote(false);
    setSel(next);
    if (next[0]?.id !== current[0]?.id) setSelectedAddons([]);
    kick();
  };

  const clientFirst = fmtName(clientInfo?.name?.split(" ")[0] ?? newClientName.split(" ")[0]) || "there";
  const ticketUrl   = ticket ? `${window.location.origin}/kiosk/${slug}/ticket/${ticket.token}` : "";
  const selTotal    = selectedServices.reduce((s, x) => s + x.price, 0);
  const selDur      = selectedServices.reduce((s, x) => s + x.duration, 0);
  const showPrice   = kioskConfig?.showServicePrice !== false;
  const showDuration = kioskConfig?.showServiceDuration !== false;
  const t = kioskStrings(lang, layout.text);
  /** A kiosk-builder sentence (shared/kiosk/text.ts): the business's words, else English. */
  const tx = (key: string) => resolveKioskText(key, lang, [layout.text]);
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

  // Advanced Features › Check-In Kiosk off (owner, 2026-11-12): no check-in form, just a friendly pointer to the front
  // desk (never a "closed" screen). Comes back to the welcome screen by itself when the switch is turned on again.
  if (!PREVIEW && kioskConfig && !kioskConfig.kioskEnabled && !["suspended", "pair", "loading", "error"].includes(screen)) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-10 select-none" style={{ ...NO_SELECT, background: BG }} data-testid="kiosk-front-desk">
      {storeConfig?.name && <p style={{ fontSize: 26, fontWeight: 600, color: "#6b7280", margin: "0 0 18px" }}>{storeConfig.name}</p>}
      <p style={{ fontSize: "clamp(38px, 6vw, 64px)", fontWeight: 800, color: PRIMARY, margin: 0, lineHeight: 1.15 }}>{tx("frontDeskTitle")}</p>
      <p style={{ fontSize: 24, color: "#4b5563", margin: "22px 0 0" }}>{tx("frontDeskSub")}</p>
    </div>
  );

  // ── IDLE ────────────────────────────────────────────────────────────────────
  // Welcome screen (owner, 2026-10-31): the WELCOME / Please Check-In Here picture fills the whole screen, with the
  // language choice over its bottom edge (the only place clients pick a language). Tapping anywhere except a
  // language button starts the check-in.
  // The layout's language buttons, in its order (one language: no buttons).
  const welcomeLangs = layout.welcome.languages
    .map((code) => KIOSK_LANGS.find((l) => l.code === code))
    .filter((l): l is (typeof KIOSK_LANGS)[number] => !!l);
  if (screen === "idle") return (
    <div className="fixed inset-0 cursor-pointer select-none overflow-hidden" data-testid="checkin-idle"
      onPointerDown={() => setScreen("phone")} onContextMenu={e => e.preventDefault()}
      style={{ ...NO_SELECT, background: BG }}>
      {/* The picture always fills the whole screen (owner, 2026-11-01: even if a little is cut off). It is a 9:16
          version of the owner's 2:3 artwork, its purple background extended top and bottom, so on a standing 9:16
          kiosk it fits exactly and nothing is cut; other screen shapes lose a little at the edges. */}
      <img src={layout.welcome.imageUrl ?? kioskWelcomeBanner} alt="Welcome. Please check in here" draggable={false} data-testid="kiosk-welcome-image" data-kx-edit="welcome-picture"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
      <div className="absolute left-0 right-0 flex items-center justify-center gap-3 flex-wrap px-8" data-kx-edit="languages"
        style={{ bottom: "clamp(18px, 3vh, 30px)" }} onPointerDown={e => e.stopPropagation()}>
        {welcomeLangs.length > 1 && welcomeLangs.map(({ code, label }) => (
          <button
            key={code}
            onPointerDown={e => { e.stopPropagation(); setLang(code); }}
            className="px-5 py-2.5 rounded-full text-base font-semibold transition-all duration-150 active:scale-95"
            // Light purple to match the welcome picture (owner, 2026-10-31); the chosen language a deeper purple.
            // With the business's own picture: its own colours instead.
            style={layout.welcome.imageUrl ? {
              background: lang === code ? PRIMARY : SURFACE,
              color: lang === code ? "#fff" : TEXT,
              border: `1.5px solid ${lang === code ? PRIMARY : BORDER}`,
              boxShadow: SHADOW,
              cursor: "pointer",
            } : {
              background: lang === code ? "#7c3aed" : "#ede4ff",
              color: lang === code ? "#fff" : "#5b21b6",
              border: `1.5px solid ${lang === code ? "#7c3aed" : "#d6c4ff"}`,
              boxShadow: "0 2px 8px rgba(91, 33, 182, .18)",
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

  // One card per real service category (in the order categories first appear in the service list); each one
  // filters the service list to that category. Used by the category screen and the Smart Check-In welcome.
  const categoryGroups = () => {
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

    return groups;
  };

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
    const cardShadow = NAIL_LOOK ? "none" : SHADOW_LG;
    const catImgs = kioskConfig?.categoryImages ?? {};
    const days = rec.basedOn.daysAgo;
    // The suggested service's picture: its own, else its category's.
    const pictureOf = (sv: ServiceItem) => sv.imageUrl || catImgs[sv.category] || null;
    const heroImage = pictureOf(first);
    // The other categories as a 2 × 2 grid under the suggestion; more than four → three and "More services".
    const groups = categoryGroups();
    const gridGroups = groups.length > 4 ? groups.slice(0, 3) : groups;
    const openCategory = (svcs: ServiceItem[]) => {
      kick();
      setFilteredServices(svcs.length ? svcs : null);
      setSvcPage(0);
      setScreen("loading");
      void checkAvailabilityAndRoute("services");
    };
    const allServicesNow = () => { kick(); setScreen("loading"); void checkAvailabilityAndRoute(); };
    const small = { fontSize: "clamp(12px, 1.4vw, 15px)", letterSpacing: ".18em" } as const;
    return (
      <div className="fixed inset-0 flex flex-col select-none" onContextMenu={e => e.preventDefault()} style={{ ...NO_SELECT, background: BG }} data-testid="kiosk-smart-welcome">
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: "clamp(20px, 3.4vh, 44px) clamp(20px, 5vw, 64px)" }}>
          <div className="mx-auto w-full flex flex-col" style={{ maxWidth: 1100, gap: "clamp(14px, 2.4vh, 30px)" }}>
            {/* Greeting */}
            <div>
              {storeConfig?.name && <p className="font-semibold uppercase" style={{ ...small, color: PRIMARY }}>{storeConfig.name}</p>}
              <h2 className="font-black" style={{ color: TEXT, fontSize: "clamp(40px, 6.4vw, 78px)", lineHeight: 1.06, marginTop: 6 }}>
                {t.welcomeBack(clientFirst)}
              </h2>
              <p style={{ color: MUTED, fontSize: "clamp(17px, 2.1vw, 24px)", marginTop: 8 }}>{t.welcomeBackSub}</p>
              {(clientInfo?.loyaltyPoints ?? 0) > 0 && (
                <div className="inline-flex items-center gap-3 px-5 py-2 mt-3 text-lg font-semibold"
                  style={{ background: PILL_BG, border: `1.5px solid ${PILL_BORDER}`, color: PILL_TEXT, borderRadius: NAIL_LOOK ? 0 : 999 }}>
                  <span>{t.loyaltyPoints(clientInfo!.loyaltyPoints)}</span>
                </div>
              )}
            </div>

            {/* Last visit | our suggestion — with the suggested service's picture fading in on the right */}
            <div className={`${panel} relative overflow-hidden`} style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: cardShadow }} data-testid="kiosk-smart-panel">
              {heroImage && (
                <img src={heroImage} alt="" aria-hidden className="absolute inset-y-0 right-0 h-full object-cover"
                  style={{ width: "34%", WebkitMaskImage: "linear-gradient(to right, transparent, #000 45%)", maskImage: "linear-gradient(to right, transparent, #000 45%)" }} />
              )}
              <div className="relative flex items-stretch" style={{ padding: "clamp(18px, 2.6vh, 32px) clamp(18px, 2.6vw, 34px)", paddingRight: heroImage ? "30%" : undefined }}>
                <div className="flex flex-col justify-center" style={{ minWidth: "28%" }}>
                  <p className="font-semibold uppercase" style={{ ...small, color: MUTED }}>{t.yourLastVisit}</p>
                  <p className="font-black" style={{ color: TEXT, fontSize: "clamp(26px, 3.4vw, 40px)", lineHeight: 1.15, marginTop: 4 }}>{t.daysAgoShort(days)}</p>
                  <p style={{ color: MUTED, fontSize: "clamp(16px, 1.9vw, 22px)", marginTop: 2 }}>{rec.basedOn.serviceName}</p>
                </div>
                <div style={{ width: 1, background: BORDER, margin: "0 clamp(16px, 2.4vw, 32px)" }} />
                <div className="flex flex-col justify-center min-w-0">
                  <p className="font-bold uppercase" style={{ ...small, color: PRIMARY }}>{t.ourSuggestion}</p>
                  <p className="font-bold" style={{ color: TEXT, fontSize: "clamp(20px, 2.7vw, 32px)", lineHeight: 1.25, marginTop: 6 }}>{question}</p>
                </div>
              </div>
            </div>

            <h3 className="font-black text-center" style={{ color: TEXT, fontSize: "clamp(24px, 3.2vw, 38px)", marginTop: "clamp(4px, 1vh, 12px)" }}>{t.whatToday}</h3>

            {/* The suggestion: one large card each */}
            {suggestedServices.map((sv) => {
              const img = pictureOf(sv);
              return (
                <button key={sv.id} type="button" data-testid={`kiosk-smart-suggest-${sv.id}`}
                  onPointerDown={e => { e.preventDefault(); chooseSuggested(sv); }}
                  className={`${panel} w-full flex items-stretch overflow-hidden text-left transition-transform duration-150 active:scale-[0.99]`}
                  style={{ background: PRIMARY_S, border: `2px solid ${PRIMARY}`, boxShadow: cardShadow, minHeight: "clamp(150px, 20vh, 260px)" }}>
                  {img && <img src={img} alt="" className="object-cover shrink-0" style={{ width: "42%" }} />}
                  <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: "clamp(16px, 2.4vh, 30px) clamp(16px, 2vw, 28px)", gap: "clamp(6px, 1vh, 12px)" }}>
                    <span className="font-black" style={{ color: TEXT, fontSize: "clamp(28px, 4vw, 48px)", lineHeight: 1.1 }}>{sv.name}</span>
                    <span className="font-semibold" style={{ color: PRIMARY, fontSize: "clamp(18px, 2.2vw, 26px)" }}>{t.recommendedForYou}</span>
                    {(showPrice || showDuration) && (
                      <span className="font-semibold" style={{ color: MUTED, fontSize: "clamp(15px, 1.8vw, 20px)" }}>
                        {showPrice && money(sv.price)}{showPrice && showDuration && " · "}{showDuration && `${sv.duration} min`}
                      </span>
                    )}
                    <span className="font-semibold" style={{ color: PRIMARY, background: SURFACE, border: `1px solid ${PRIMARY}55`, borderRadius: NAIL_LOOK ? 0 : 999,
                      padding: "6px 16px", fontSize: "clamp(14px, 1.6vw, 18px)" }}>{t.lastVisitPill(days)}</span>
                  </div>
                </button>
              );
            })}

            {/* Everything else: the categories, two by two */}
            <div className="grid grid-cols-2" style={{ gap: "clamp(10px, 1.6vw, 20px)" }} data-testid="kiosk-smart-categories">
              {gridGroups.map((g) => {
                const img = catImgs[g.label] ?? catImgs[g.key];
                return (
                  <button key={g.key} type="button" data-testid={`kiosk-smart-category-${g.key}`}
                    onPointerDown={e => { e.preventDefault(); openCategory(g.svcs); }}
                    className={`${panel} flex flex-col overflow-hidden text-center transition-transform duration-150 active:scale-[0.98]`}
                    style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: cardShadow }}>
                    {img && <img src={img} alt="" className="w-full object-cover" style={{ height: "clamp(110px, 13vh, 190px)" }} />}
                    <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: "clamp(14px, 2vh, 24px) 14px", gap: 6 }}>
                      <span className="font-black" style={{ color: TEXT, fontSize: "clamp(20px, 2.6vw, 30px)", lineHeight: 1.15 }}>{g.label}</span>
                      <span style={{ color: MUTED, fontSize: "clamp(14px, 1.6vw, 18px)" }}>{g.svcs.slice(0, 2).map((x) => x.name).join(" · ")}</span>
                    </div>
                  </button>
                );
              })}
              {groups.length > 4 && (
                <button type="button" data-testid="kiosk-smart-more" onPointerDown={e => { e.preventDefault(); allServicesNow(); }}
                  className={`${panel} flex items-center justify-center text-center transition-transform duration-150 active:scale-[0.98]`}
                  style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: cardShadow, minHeight: "clamp(110px, 13vh, 190px)" }}>
                  <span className="font-black" style={{ color: TEXT, fontSize: "clamp(20px, 2.6vw, 30px)" }}>{t.moreServices}</span>
                </button>
              )}
            </div>

            <button type="button" onPointerDown={e => { e.preventDefault(); allServicesNow(); }} data-testid="kiosk-smart-all"
              className="mx-auto font-semibold" style={{ color: MUTED, fontSize: "clamp(15px, 1.8vw, 20px)", padding: "8px 16px" }}>
              {t.notSureAllServices}
            </button>
          </div>
        </div>
        <div className="shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: SURFACE, borderTop: `2px solid ${BORDER}` }}>
          <GhostBtn onPress={resetToIdle} size="sm">{t.startOver}</GhostBtn>
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

      {/* Right panel — numpad (left panel hidden for kiosk phone screen) */}
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

        {/* Numpad grid — larger buttons */}
        <div className="grid grid-cols-3 gap-4">
          {["1","2","3","4","5","6","7","8","9"].map(d => (
            <button key={d}
              onPointerDown={e => { e.preventDefault(); handleDigit(d); }}
              className="w-32 h-32 rounded-3xl text-4xl font-bold transition-all active:scale-95"
              style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: TEXT, boxShadow: SHADOW }}>
              {d}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <button onPointerDown={e => { e.preventDefault(); setPhone(p => p.slice(0, -1)); kick(); }}
            className="w-32 h-32 rounded-3xl text-3xl transition-all active:scale-95"
            style={{ background: "#fef2f2", border: `1.5px solid #fecaca`, color: "#ef4444", boxShadow: SHADOW }}>⌫</button>
          <button onPointerDown={e => { e.preventDefault(); handleDigit("0"); }}
            className="w-32 h-32 rounded-3xl text-4xl font-bold transition-all active:scale-95"
            style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, color: TEXT, boxShadow: SHADOW }}>0</button>
          <button
            onPointerDown={e => { e.preventDefault(); if (phone.length === 10) doLookup(phone); }}
            disabled={phone.length < 10}
            className="w-32 h-32 rounded-3xl text-4xl font-bold text-white transition-all active:scale-95 disabled:opacity-30"
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
                  if (waitingFor) afterServiceChosen(waitingFor); else setScreen(firstStepScreen("service_type"));
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
          <CountdownWidget seconds={countdown} total={layout.timing.ticketResetSeconds} />
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

          <CountdownWidget seconds={countdown} total={layout.timing.ticketResetSeconds} />
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
    let groups = categoryGroups();

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
          <h2 className="text-4xl font-black leading-tight" style={{ color: TEXT }} data-kx-edit="text:whatBringsYouIn">
            {t.whatBringsYouIn(clientFirst)}
          </h2>
        </div>

        {/* ── Cards ── */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className={`grid ${gridCols} gap-6 w-full max-w-5xl mx-auto`} data-kx-edit="category-cards">
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
                              `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${isSel ? `${PRIMARY}12` : TINT}"><span style="font-size:80px;line-height:1;user-select:none">${NAIL_LOOK ? "" : group.fallbackEmoji}</span></div>`;
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
          <GhostBtn onPress={backToStart}>{t.backBtn}</GhostBtn>
          <PrimaryBtn onPress={handleContinue} disabled={!selectedCategoryGroup} size="md">
            {t.continueBtn}
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  const fmtPrice = (p: number) => `$${p % 1 === 0 ? p : p.toFixed(2)}`;

  // ── THE BUSINESS'S OWN SCREENS (Kiosk Builder) ───────────────────────────────
  if (screen === "menu") {
    const menusById = new Map(layout.menus.map((m) => [m.id, m]));
    const current = menusById.get(menuStack[menuStack.length - 1] ?? "") ?? (layout.startMenuId ? menusById.get(layout.startMenuId) : undefined);
    if (current) {
      const svcById = new Map(allServices.map((sv) => [sv.id, sv]));
      const own = current.title[lang]?.trim() || current.title.en?.trim();
      const tapTile = (tile: { kind: string; serviceId?: number; addonId?: number; menuId?: string; next?: KioskNext }) => {
        kick();
        // A "then" goes ahead once the choice is made (not when this tap takes it back off).
        if (tile.next && tile.kind === "service" && tile.serviceId != null && !selectedServices.some((x) => x.id === tile.serviceId)) {
          setPendingNext({ next: tile.next, fromMenuId: current.id, serviceId: tile.serviceId });
        }
        if (tile.next && tile.kind === "addon" && tile.addonId != null && !selectedAddons.some((x) => x.id === tile.addonId)) {
          setPendingNext({ next: tile.next, fromMenuId: current.id, addonId: tile.addonId });
        }
        // "Clients can choose: One" (the screen's setting): a new pick takes the place of the one before from this screen.
        const items = current.choose === "one" ? screenItems(current) : null;
        if (tile.kind === "addon" && tile.addonId != null) {
          if (items && !selectedAddons.some((x) => x.id === tile.addonId) && selectedServices.length) {
            setSelectedAddons((cur) => cur.filter((x) => !items.addons.has(x.id)));
          }
          return chooseAddonOnScreen(tile.addonId, showPictureNote);
        }
        if (tile.kind === "menu" && tile.menuId && menusById.has(tile.menuId)) { setMenuStack((st) => [...st, tile.menuId!]); setMenuPage(0); return; }
        const svc = tile.serviceId != null ? svcById.get(tile.serviceId) : undefined;
        if (!svc) return;
        if ((svc.optionCount ?? (serviceOptionsMap[svc.id]?.length ?? 0)) > 0) {
          setParentServiceForOptions(svc); setSelectedOption(null); setScreen("service_options"); return;
        }
        if (items && !selectedServices.some((x) => x.id === svc.id)) {
          const kept = selectedServices.filter((x) => !items.services.has(x.id));
          const next = [...kept, svc].slice(-Math.max(1, layout.services.maxServices));
          if (next[0]?.id !== selectedServices[0]?.id) setSelectedAddons([]);
          setSvcLimitNote(false);
          return setSel(next);
        }
        toggleSvc(svc);
      };
      const back = () => {
        kick();
        if (menuStack.length > 1) { setMenuStack((st) => st.slice(0, -1)); setMenuPage(0); return; }
        goBack("services");
      };
      // What was chosen on these screens (services, then extras and add-ons), and its total.
      const chosenSummary = [...selectedServices.map((sv) => sv.name), ...selectedAddons.map((ad) => `+ ${ad.name}`)].join("  ·  ");
      const screenTotal = selTotal + selectedAddons.reduce((sum, ad) => sum + (Number(ad.price) || 0), 0);
      const limitText = layout.services.maxServices === 2 && layout.services.maxVisitMinutes === 150 ? t.twoServicesMax
        : t.servicesMax(layout.services.maxServices, String(Math.round(layout.services.maxVisitMinutes / 6) / 10));

      // The business's own picture of the whole screen, with tap spots on it.
      if (current.kind === "picture") {
        const tapSpot = (spot: (typeof current.spots)[number]) => {
          kick();
          const a = spot.action;
          if (a.kind === "service" || a.kind === "menu" || a.kind === "addon") {
            return tapTile(a.kind === "service" ? { kind: "service", serviceId: a.serviceId, next: spot.next }
              : a.kind === "addon" ? { kind: "addon", addonId: a.addonId, next: spot.next } : { kind: "menu", menuId: a.menuId });
          }
          if (a.fn === "continue") return continueFromScreen(current, showPictureNote);
          if (a.fn === "staff") return continueFromScreen(current, showPictureNote, "staff");
          if (a.fn === "review") return continueFromScreen(current, showPictureNote, "review");
          if (a.fn === "back") return back();
          if (a.fn === "startOver") return resetToIdle();
        };
        const chosen = current.spots.filter((sp) =>
          (sp.action.kind === "service" && selectedServices.some((sv) => sv.id === (sp.action as { serviceId: number }).serviceId))
          || (sp.action.kind === "addon" && selectedAddons.some((ad) => ad.id === (sp.action as { addonId: number }).addonId))).map((sp) => sp.id);
        return (
          <div className="fixed inset-0 select-none" onContextMenu={e => e.preventDefault()} style={NO_SELECT} data-testid="kiosk-menu-screen">
            <KioskPictureScreen menu={current} mode="kiosk" colors={{ primary: PRIMARY, bg: BG, surface: SURFACE, text: TEXT, muted: MUTED, border: BORDER }} selectedSpotIds={chosen}
              footer={{
                backLabel: t.backBtn, continueLabel: t.continueBtn, continueDisabled: selectedServices.length === 0,
                summary: chosenSummary || t.noServiceSelected,
                total: showPrice && selectedServices.length ? fmtPrice(screenTotal) : null,
                onBack: back, onContinue: () => continueFromScreen(current, showPictureNote),
              }}
              onSpot={tapSpot} note={pictureNote ?? (svcLimitNote ? limitText : null)}
              spotLabel={(sp) => sp.action.kind === "service" ? svcById.get(sp.action.serviceId)?.name ?? "" : sp.action.kind === "addon" ? allAddons.find((x) => x.id === (sp.action as { addonId: number }).addonId)?.name ?? "" : ""} />
          </div>
        );
      }
      return (
        <div className="fixed inset-0 select-none" onContextMenu={e => e.preventDefault()} style={NO_SELECT} data-testid="kiosk-menu-screen">
          <KioskMenuScreen
            menu={current} page={menuPage} onPage={(pg) => { kick(); setMenuPage(pg); }}
            services={svcById as any} menus={menusById} addons={new Map(allAddons.map((a) => [a.id, a]))}
            selectedAddonIds={selectedAddons.map((a) => a.id)} note={pictureNote}
            heading={own ? fillKioskText(own, { name: clientFirst }) : t.whatBringsYouIn(clientFirst)}
            eyebrow={storeConfig?.name ? `Check-in — ${storeConfig.name}` : undefined}
            colors={{ primary: PRIMARY, bg: BG, surface: SURFACE, text: TEXT, muted: MUTED, border: BORDER, tint: TINT }}
            serif={NAIL_LOOK} showPrice={showPrice} showDuration={showDuration}
            selectedServiceIds={selectedServices.map((sv) => sv.id)}
            mode="kiosk" onTile={tapTile}
            footer={
              <div className="shrink-0 px-6 py-4 flex items-center gap-4"
                style={{ background: SURFACE, borderTop: `2px solid ${BORDER}` }}>
                <GhostBtn onPress={back} size="sm">{t.backBtn}</GhostBtn>
                <div className="flex-1 min-w-0 truncate text-base" style={{ color: SUBTLE }}>
                  {svcLimitNote
                    ? limitText
                    : chosenSummary || t.noServiceSelected}
                </div>
                {selectedServices.length > 0 && showPrice && (
                  <p className="text-2xl font-black shrink-0" style={{ color: TEXT }}>{fmtPrice(screenTotal)}</p>
                )}
                <PrimaryBtn onPress={() => continueFromScreen(current, showPictureNote)} disabled={selectedServices.length === 0} size="md">
                  {t.continueBtn}
                </PrimaryBtn>
              </div>
            }
          />
        </div>
      );
    }
  }

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
            <div className="grid grid-cols-4 gap-4 h-full content-start" data-kx-edit="service-cards">
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
          <GhostBtn onPress={() => goBack("services")} size="sm">{t.backBtn}</GhostBtn>

          {/* Selected chips */}
          <div className="flex-1 flex items-center gap-2 overflow-hidden">
            {svcLimitNote ? (
              <p className="text-base" style={{ color: SUBTLE }} data-testid="kiosk-two-services-note">
                {layout.services.maxServices === 2 && layout.services.maxVisitMinutes === 150
                  ? t.twoServicesMax
                  : t.servicesMax(layout.services.maxServices, String(Math.round(layout.services.maxVisitMinutes / 6) / 10))}
              </p>
            ) : selectedServices.length === 0 ? (
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
          <GhostBtn onPress={() => setScreen(layout.menuMode === "screens" && menuStack.length ? "menu" : "services")} size="sm">{t.backBtn}</GhostBtn>
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
          selectedId={opts.selectedId} plainLabel={opts.plainOption ? tx("questionPlain") : undefined}
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
                      {o == null ? tx("questionPlain") : o.name}
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
    title: tx("questionLength"),
    options: nailCfg?.sizes ?? [],
    selectedId: nailSize?.nailVocabId,
    onPick: (o) => { setNailSize(o); nailStepNext("size"); },
    guide: true,
    onBack: () => goBack("questions"),
  });

  if (screen === "nail_shape") return renderNailPicker({
    kind: "shape",
    title: tx("questionShape"),
    options: nailCfg?.shapes ?? [],
    selectedId: nailShape?.nailVocabId,
    onPick: (o) => { setNailShape(o); nailStepNext("shape"); },
    guide: true,
    onBack: () => (nailCfg?.sizes?.length ? setScreen("nail_size") : goBack("questions")),
  });

  if (screen === "nail_effects") return renderNailPicker({
    kind: "design",
    title: tx("questionDesign"),
    options: nailCfg?.effects ?? [],
    selectedId: nailEffect ? nailEffect.nailVocabId : null,
    // Only offer "no design" when the service's config doesn't require an art pick.
    plainOption: !nailCfg?.artRequired,
    onPick: (o) => { setNailEffect(o); advance("questions"); },
    onBack: () => (nailCfg?.shapes?.length ? setScreen("nail_shape") : nailCfg?.sizes?.length ? setScreen("nail_size") : goBack("questions")),
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
    const back = () => goBack("review");
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
              <span className="font-semibold" style={{ color: MUTED, fontSize: 18 }} data-kx-edit="text:yourStylist">{t.yourStylist}</span>
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
        <h2 className="text-5xl font-black" style={{ color: TEXT }} data-kx-edit="text:whoWouldYouLike">{t.whoWouldYouLike}</h2>
        <p className="text-xl mt-2" style={{ color: MUTED }} data-kx-edit="text:pickStylist">{t.pickStylist}</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-10" style={{ overflow: "hidden" }}>
        <div className={`grid gap-5 w-full max-w-5xl ${Math.min(allStaff.length + 1, 4) <= 2 ? "grid-cols-2" : Math.min(allStaff.length + 1, 4) === 3 ? "grid-cols-3" : "grid-cols-4"}`} data-kx-edit="staff-cards">
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
        <GhostBtn onPress={() => goBack("provider")}>{t.backBtn}</GhostBtn>
        <PrimaryBtn onPress={() => { if (!selectedStaff) setSelStaff("none"); advance("provider"); }} size="md">
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
    const proceedFromAddons = () => advance("addons");
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
          <div className="grid grid-cols-3 gap-5 max-w-5xl mx-auto" data-kx-edit="addon-cards">
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
          <GhostBtn onPress={() => goBack("addons")} size="sm">{t.backBtn}</GhostBtn>
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
          <p className="text-xl mt-2" style={{ color: MUTED }} data-kx-edit="text:showQr">{t.showQr}</p>
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

        <div data-kx-edit="ticket-timer"><CountdownWidget seconds={countdown} total={layout.timing.ticketResetSeconds} /></div>
        <GhostBtn onPress={resetToIdle}>{t.newCheckin}</GhostBtn>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <p className="text-sm uppercase tracking-widest font-semibold" style={{ color: SUBTLE }}>{t.staffScanQr}</p>
        {ticket.offline ? (
          <p className="font-mono font-black" style={{ color: TEXT, fontSize: 120, lineHeight: 1 }}>
            {ticket.ticketNumber != null ? String(ticket.ticketNumber).padStart(3, "0") : "—"}
          </p>
        ) : (
          <>
            <div className="p-5 rounded-3xl shadow-2xl" style={{ background: "#fff" }}>
              <QRCodeCanvas value={ticketUrl} size={280} level="M" includeMargin={false} />
            </div>
            <p className="text-xs font-mono" style={{ color: SUBTLE }}>
              {ticket.ticketNumber != null ? String(ticket.ticketNumber).padStart(3, "0") : (ticket.appointmentId ?? ticket.token.substring(0, 10))}
            </p>
          </>
        )}
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
          <CountdownWidget seconds={countdown} total={layout.timing.ticketResetSeconds} />
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

/**
 * The kiosk layout: everything a business can shape about its check-in kiosk (plans/kiosk-builder.md).
 *
 * Stored per store in kiosk_layouts (a draft and numbered published versions) and sent to the kiosk inside
 * /api/public/kiosk/:slug/config. A store with no saved layout gets its business type's preset.
 *
 * normalizeKioskLayout() never fails: whatever is stored (an older schema, a hand edit, a bad value) comes
 * back complete and within bounds, so a kiosk can always draw it. validateKioskLayout() is the strict check
 * the builder's save runs, so an owner hears about a mistake instead of having it quietly repaired.
 */

import { isBusinessTypeKey, type BusinessTypeKey } from "./businessTypes";
import { KIOSK_LANG_CODES, kioskTextKey, type KioskLang, type KioskText } from "./text";

export const KIOSK_LAYOUT_SCHEMA_VERSION = 1;

/**
 * The steps between "who are you" and the review. The start (welcome, phone, name for a new client) and
 * the end (review, ticket) are fixed.
 * - category: the category cards. Off: every service on one list.
 * - services: the service list (and a service's own options). Always on.
 * - questions: the service's questions (today: a nail service's length, shape and design).
 * - addons: add-ons for the chosen service.
 * - provider: choose who does the service.
 */
export type KioskStepId = "category" | "services" | "questions" | "addons" | "provider";
export const KIOSK_STEP_IDS: KioskStepId[] = ["category", "services", "questions", "addons", "provider"];

export interface KioskStep { id: KioskStepId; enabled: boolean }

/** classic: the lavender and rose kiosk. boutique: the cream, blush and copper kiosk with serif headings. */
export type KioskLook = "classic" | "boutique";

export interface KioskThemeColors {
  /** Buttons, selected cards, accents. */
  primary?: string;
  /** Behind everything. */
  background?: string;
  /** Cards and bars. */
  surface?: string;
  /** Headings and body text. */
  text?: string;
}

// ── Screens (the owner's own menu screens, like a POS grid) ───────────────────

/**
 * One button on a screen: a service the client can pick, or a link that opens another screen (a folder).
 * `label` and `imageUrl` override the service's own name and picture.
 */
export interface KioskTile {
  id: string;
  kind: "service" | "menu";
  serviceId?: number;
  menuId?: string;
  label?: string;
  imageUrl?: string | null;
}

/**
 * A screen of buttons. "grid": `cols` × `rows` slots per page, filling the screen between its heading and its
 * footer (never scrolling). "single": one big button in the middle of each page. `tiles[i]` is slot i, counted
 * across pages (page = floor(i / slotsPerPage)); null is an empty slot.
 */
export interface KioskMenu {
  id: string;
  /** For the builder's list. */
  name: string;
  /** The heading on the screen; empty: the kiosk's own greeting. */
  title: KioskText;
  style: "grid" | "single";
  cols: number;
  rows: number;
  tiles: Array<KioskTile | null>;
}

export const KIOSK_MENU_LIMITS = { menus: 40, pages: 10, cols: { min: 1, max: 4 }, rows: { min: 1, max: 6 }, label: 40, name: 40 } as const;

/** Slots on one page of a screen. */
export const menuSlotsPerPage = (m: Pick<KioskMenu, "style" | "cols" | "rows">) => (m.style === "single" ? 1 : m.cols * m.rows);
/** Pages a screen has (at least one). */
export const menuPageCount = (m: KioskMenu) => {
  const per = menuSlotsPerPage(m);
  let last = -1;
  m.tiles.forEach((t, i) => { if (t) last = i; });
  return Math.max(1, Math.ceil((last + 1) / per));
};

export interface KioskLayout {
  schemaVersion: number;
  /** The preset this layout started from. */
  preset: BusinessTypeKey;
  theme: { look: KioskLook; colors: KioskThemeColors };
  welcome: {
    /** The full-screen welcome picture. null: Certxa's own. */
    imageUrl: string | null;
    /** The language buttons on the welcome screen, in order. English is always there. */
    languages: KioskLang[];
  };
  steps: KioskStep[];
  services: {
    /** Services one client may check in for. */
    maxServices: number;
    /** With more than one service: the longest visit, in minutes. */
    maxVisitMinutes: number;
    showPrice: boolean;
    showDuration: boolean;
  };
  /** Suggest a returning client's usual or due service (lib/smartCheckin.ts). */
  smartCheckin: boolean;
  timing: {
    /** The ticket and "you're checked in" screens go back to the start after this. */
    ticketResetSeconds: number;
  };
  /** The business's own words, by text key (shared/kiosk/text.ts). */
  text: Record<string, KioskText>;
  /**
   * "catalog": the category cards and service list built from the catalog (the categories and services steps).
   * "screens": the business's own screens instead, starting at `startMenuId`.
   */
  menuMode: "catalog" | "screens";
  startMenuId: string | null;
  menus: KioskMenu[];
}

export const KIOSK_LIMITS = {
  maxServices: { min: 1, max: 3 },
  maxVisitMinutes: { min: 30, max: 480 },
  ticketResetSeconds: { min: 10, max: 120 },
} as const;

export const KIOSK_DEFAULTS: Omit<KioskLayout, "preset"> = {
  schemaVersion: KIOSK_LAYOUT_SCHEMA_VERSION,
  theme: { look: "classic", colors: {} },
  welcome: { imageUrl: null, languages: [...KIOSK_LANG_CODES] },
  steps: KIOSK_STEP_IDS.map((id) => ({ id, enabled: true })),
  services: { maxServices: 2, maxVisitMinutes: 150, showPrice: true, showDuration: true },
  smartCheckin: true,
  timing: { ticketResetSeconds: 30 },
  text: {},
  menuMode: "catalog",
  startMenuId: null,
  menus: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const clampInt = (v: unknown, lim: { min: number; max: number }, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(lim.max, Math.max(lim.min, n)) : dflt;
};
const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
const isLang = (v: unknown): v is KioskLang => KIOSK_LANG_CODES.includes(v as KioskLang);
/** An uploaded picture: our own https address or a site path. Nothing else is drawn on a kiosk. */
export const isKioskImageUrl = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 1000 && (/^https:\/\/[^\s"'<>]+$/i.test(v) || /^\/[^\s"'<>]*$/.test(v));

/**
 * Steps in a working order: category (if there) first, then services, then the rest in the order given.
 * Unknown and repeated steps are dropped, missing ones added (switched off, except services).
 */
export function normalizeSteps(raw: unknown): KioskStep[] {
  const seen = new Set<KioskStepId>();
  const given: KioskStep[] = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    if (!isObj(s) || !KIOSK_STEP_IDS.includes(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    given.push({ id: s.id, enabled: s.id === "services" ? true : bool(s.enabled, true) });
  }
  if (!given.length) return KIOSK_DEFAULTS.steps.map((s) => ({ ...s }));
  for (const id of KIOSK_STEP_IDS) if (!seen.has(id)) given.push({ id, enabled: id === "services" });
  const category = given.find((s) => s.id === "category")!;
  const services = given.find((s) => s.id === "services")!;
  return [category, services, ...given.filter((s) => s.id !== "category" && s.id !== "services")];
}

function normalizeText(raw: unknown): Record<string, KioskText> {
  const out: Record<string, KioskText> = {};
  if (!isObj(raw)) return out;
  for (const [key, val] of Object.entries(raw)) {
    const def = kioskTextKey(key);
    if (!def || !isObj(val)) continue;
    const t: KioskText = {};
    for (const lang of KIOSK_LANG_CODES) {
      const s = typeof val[lang] === "string" ? val[lang].replace(/\s+/g, " ").trim().slice(0, def.max) : "";
      if (s) t[lang] = s;
    }
    if (Object.keys(t).length) out[key] = t;
  }
  return out;
}

const MENU_ID = /^[A-Za-z0-9_-]{1,40}$/;
const cleanLabel = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function normalizeTile(raw: unknown, menuIds: Set<string>): KioskTile | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !MENU_ID.test(raw.id)) return null;
  const tile: KioskTile = { id: raw.id, kind: raw.kind === "menu" ? "menu" : "service" };
  if (tile.kind === "service") {
    const sid = Number(raw.serviceId);
    if (!Number.isInteger(sid) || sid <= 0) return null;
    tile.serviceId = sid;
  } else {
    if (typeof raw.menuId !== "string" || !menuIds.has(raw.menuId)) return null;
    tile.menuId = raw.menuId;
  }
  const label = cleanLabel(raw.label, KIOSK_MENU_LIMITS.label);
  if (label) tile.label = label;
  if (isKioskImageUrl(raw.imageUrl)) tile.imageUrl = raw.imageUrl;
  return tile;
}

/** The business's screens: unknown links and broken buttons dropped, sizes clamped, at most 10 pages each. */
export function normalizeMenus(raw: unknown): KioskMenu[] {
  const list = (Array.isArray(raw) ? raw : []).filter((m) => isObj(m) && typeof m.id === "string" && MENU_ID.test(m.id));
  const seen = new Set<string>();
  const unique = list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).slice(0, KIOSK_MENU_LIMITS.menus);
  const ids = new Set(unique.map((m) => m.id as string));
  const tileIds = new Set<string>();
  return unique.map((m) => {
    const style: KioskMenu["style"] = m.style === "single" ? "single" : "grid";
    const cols = style === "single" ? 1 : clampInt(m.cols, KIOSK_MENU_LIMITS.cols, 3);
    const rows = style === "single" ? 1 : clampInt(m.rows, KIOSK_MENU_LIMITS.rows, 3);
    const per = style === "single" ? 1 : cols * rows;
    const tiles = (Array.isArray(m.tiles) ? m.tiles : []).slice(0, per * KIOSK_MENU_LIMITS.pages).map((t: unknown) => {
      const tile = normalizeTile(t, ids);
      // A screen never links to itself, and a button id is used once.
      if (!tile || (tile.kind === "menu" && tile.menuId === m.id) || tileIds.has(tile.id)) return null;
      tileIds.add(tile.id);
      return tile;
    });
    while (tiles.length && tiles[tiles.length - 1] == null) tiles.pop();
    const title: KioskText = {};
    if (isObj(m.title)) for (const lang of KIOSK_LANG_CODES) { const v = cleanLabel(m.title[lang], 60); if (v) title[lang] = v; }
    return { id: m.id, name: cleanLabel(m.name, KIOSK_MENU_LIMITS.name) || "Screen", title, style, cols, rows, tiles };
  });
}

/** Any stored value → a complete layout. `fallbackPreset` is used when the value names none. */
export function normalizeKioskLayout(raw: unknown, fallbackPreset: BusinessTypeKey): KioskLayout {
  const r = isObj(raw) ? raw : {};
  const d = KIOSK_DEFAULTS;
  const colorsIn = isObj(r.theme?.colors) ? r.theme.colors : {};
  const colors: KioskThemeColors = {};
  for (const k of ["primary", "background", "surface", "text"] as const) {
    if (typeof colorsIn[k] === "string" && HEX.test(colorsIn[k])) colors[k] = colorsIn[k].toLowerCase();
  }
  const langs: KioskLang[] = Array.isArray(r.welcome?.languages)
    ? [...new Set<KioskLang>(r.welcome.languages.filter(isLang))]
    : [...d.welcome.languages];
  if (!langs.includes("en")) langs.unshift("en");
  return {
    schemaVersion: KIOSK_LAYOUT_SCHEMA_VERSION,
    preset: isBusinessTypeKey(r.preset) ? r.preset : fallbackPreset,
    theme: { look: r.theme?.look === "boutique" ? "boutique" : "classic", colors },
    welcome: { imageUrl: isKioskImageUrl(r.welcome?.imageUrl) ? r.welcome.imageUrl : null, languages: langs },
    steps: normalizeSteps(r.steps),
    services: {
      maxServices: clampInt(r.services?.maxServices, KIOSK_LIMITS.maxServices, d.services.maxServices),
      maxVisitMinutes: clampInt(r.services?.maxVisitMinutes, KIOSK_LIMITS.maxVisitMinutes, d.services.maxVisitMinutes),
      showPrice: bool(r.services?.showPrice, d.services.showPrice),
      showDuration: bool(r.services?.showDuration, d.services.showDuration),
    },
    smartCheckin: bool(r.smartCheckin, d.smartCheckin),
    timing: { ticketResetSeconds: clampInt(r.timing?.ticketResetSeconds, KIOSK_LIMITS.ticketResetSeconds, d.timing.ticketResetSeconds) },
    text: normalizeText(r.text),
    ...(() => {
      const menus = normalizeMenus(r.menus);
      const start = typeof r.startMenuId === "string" && menus.some((m) => m.id === r.startMenuId) ? r.startMenuId : null;
      // Own screens only with a start screen to open on.
      return { menuMode: r.menuMode === "screens" && start ? "screens" as const : "catalog" as const, startMenuId: start, menus };
    })(),
  };
}

/** What the builder may not save. Empty: fine. */
export function validateKioskLayout(raw: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(raw)) return ["The layout is missing."];
  const colors = isObj(raw.theme?.colors) ? raw.theme.colors : {};
  for (const [k, v] of Object.entries(colors)) {
    if (!["primary", "background", "surface", "text"].includes(k)) errors.push(`Unknown colour "${k}".`);
    else if (v != null && v !== "" && !(typeof v === "string" && HEX.test(v))) errors.push(`The ${k} colour must look like #a1b2c3.`);
  }
  if (raw.theme?.look != null && raw.theme.look !== "classic" && raw.theme.look !== "boutique") errors.push("Unknown look.");
  if (raw.welcome?.imageUrl != null && raw.welcome.imageUrl !== "" && !isKioskImageUrl(raw.welcome.imageUrl)) {
    errors.push("The welcome picture must be an uploaded picture.");
  }
  for (const [key, lim] of Object.entries(KIOSK_LIMITS) as Array<[string, { min: number; max: number }]>) {
    const v = key === "ticketResetSeconds" ? raw.timing?.[key] : raw.services?.[key];
    if (v == null) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < lim.min || n > lim.max) errors.push(`${key} must be a whole number from ${lim.min} to ${lim.max}.`);
  }
  if (Array.isArray(raw.steps) && raw.steps.some((s: any) => s?.id === "services" && s.enabled === false)) {
    errors.push("The services step can't be switched off.");
  }
  if (raw.menus != null) {
    if (!Array.isArray(raw.menus)) errors.push("The screens are missing.");
    else {
      if (raw.menus.length > KIOSK_MENU_LIMITS.menus) errors.push(`At most ${KIOSK_MENU_LIMITS.menus} screens.`);
      const ids = new Set(raw.menus.map((m: any) => m?.id));
      for (const m of raw.menus) {
        if (!isObj(m) || typeof m.id !== "string" || !MENU_ID.test(m.id)) { errors.push("A screen has no id."); continue; }
        if (m.style === "grid") {
          for (const k of ["cols", "rows"] as const) {
            const n = Number(m[k]), lim = KIOSK_MENU_LIMITS[k];
            if (!Number.isInteger(n) || n < lim.min || n > lim.max) errors.push(`"${m.name}": ${k === "cols" ? "columns" : "rows"} must be ${lim.min} to ${lim.max}.`);
          }
        }
        const per = m.style === "single" ? 1 : Number(m.cols) * Number(m.rows);
        if (Array.isArray(m.tiles) && per > 0 && m.tiles.length > per * KIOSK_MENU_LIMITS.pages) errors.push(`"${m.name}" has more than ${KIOSK_MENU_LIMITS.pages} pages.`);
        for (const t of Array.isArray(m.tiles) ? m.tiles : []) {
          if (t?.kind === "menu" && !ids.has(t.menuId)) errors.push(`"${m.name}" has a button to a screen that doesn't exist.`);
          if (typeof t?.label === "string" && t.label.trim().length > KIOSK_MENU_LIMITS.label) errors.push(`"${m.name}": a button name is too long.`);
        }
      }
      if (raw.menuMode === "screens" && !ids.has(raw.startMenuId)) errors.push("Choose the screen clients start on.");
    }
  }
  if (isObj(raw.text)) {
    for (const [key, val] of Object.entries(raw.text)) {
      const def = kioskTextKey(key);
      if (!def) { errors.push(`Unknown text "${key}".`); continue; }
      if (!isObj(val)) continue;
      for (const [lang, s] of Object.entries(val)) {
        if (!isLang(lang)) errors.push(`Unknown language "${lang}" in "${def.label}".`);
        else if (typeof s === "string" && s.trim().length > def.max) errors.push(`"${def.label}" is too long (${def.max} characters at most).`);
      }
    }
  }
  return errors;
}

// ── Flow ─────────────────────────────────────────────────────────────────────

/** The steps the kiosk walks through, in order. */
export function kioskFlow(layout: Pick<KioskLayout, "steps">): KioskStepId[] {
  return layout.steps.filter((s) => s.enabled).map((s) => s.id);
}

/**
 * The next step after `from` (null: the start, before the first step) that applies to this client right now;
 * "review" when none is left. `applies` says whether a step has anything to show (no add-ons for this
 * service → skip add-ons).
 */
export function nextKioskStep(
  flow: KioskStepId[],
  from: KioskStepId | null,
  applies: (id: KioskStepId) => boolean,
): KioskStepId | "review" {
  const start = from == null ? 0 : flow.indexOf(from) + 1;
  for (let i = start; i < flow.length; i++) if (applies(flow[i])) return flow[i];
  return "review";
}

/** The step before `from` ("review" counts as after the last step) that applies; null: back to the start. */
export function previousKioskStep(
  flow: KioskStepId[],
  from: KioskStepId | "review",
  applies: (id: KioskStepId) => boolean,
): KioskStepId | null {
  const end = from === "review" ? flow.length : flow.indexOf(from);
  for (let i = end - 1; i >= 0; i--) if (applies(flow[i])) return flow[i];
  return null;
}

/**
 * The Online Check-In Line for barbershops and haircut studios (plans/online-checkin-line.md, owner 2026-11-03): its
 * settings and its wait estimate. Pure — no database — so every screen (the client's phone, the lobby screen, /barber)
 * shows the same numbers and the rules can be tested.
 *
 * The estimate plays the line forward: each working barber is free once their current client's cut is done (the
 * shop's usual cut length, less the time already in the chair, never less than LAST_MINUTES); each client in line, in
 * order, goes to the barber they asked for, or else to whoever is free first.
 */

export interface LineSettings {
  /** The shop takes check-ins from phones. */
  enabled: boolean;
  /** Phone check-ins stop this many minutes before closing. */
  closesBeforeMin: number;
  /** No more phone check-ins once this many people are waiting. */
  maxLine: number;
  /** "Head over now" is texted when the wait reaches this. */
  leadMin: number;
  /** A client not here at their turn keeps their place this long. */
  lateHoldMin: number;
  /** After the hold: moved to the back of the line once (true), or taken off the line (false). */
  lateMoveBack: boolean;
  /** Clients may ask for a barber (each barber shows their own wait). */
  barberChoice: boolean;
  /** The cut length used until the shop has its own (the median of real cuts takes over after MIN_SAMPLES). */
  avgMinutes: number;
  /** Phone check-in paused from the front desk: why, and until when (null: until switched back on). */
  paused: { reason: string; until: string | null } | null;
}

export const LINE_DEFAULTS: LineSettings = {
  enabled: true, closesBeforeMin: 15, maxLine: 30, leadMin: 15, lateHoldMin: 10, lateMoveBack: true,
  barberChoice: false, avgMinutes: 20, paused: null,
};

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** The shop's settings (store_settings.preferences.onlineLine). Older shops kept two of them under queue*. */
export function lineSettings(prefs: Record<string, any> | null | undefined): LineSettings {
  const p = prefs?.onlineLine ?? {};
  const pausedUntil = typeof p.paused?.until === "string" ? p.paused.until : null;
  const paused = p.paused && (!pausedUntil || Date.parse(pausedUntil) > Date.now())
    ? { reason: String(p.paused.reason ?? "").slice(0, 120), until: pausedUntil } : null;
  return {
    enabled: p.enabled ?? (prefs?.queueEnabled !== false),
    closesBeforeMin: int(p.closesBeforeMin, 0, 240, LINE_DEFAULTS.closesBeforeMin),
    maxLine: int(p.maxLine ?? prefs?.queueMaxSize, 1, 200, LINE_DEFAULTS.maxLine),
    leadMin: int(p.leadMin, 5, 120, LINE_DEFAULTS.leadMin),
    lateHoldMin: int(p.lateHoldMin, 0, 60, LINE_DEFAULTS.lateHoldMin),
    lateMoveBack: p.lateMoveBack !== false,
    barberChoice: p.barberChoice === true,
    avgMinutes: int(p.avgMinutes ?? prefs?.queueAvgServiceTime, 5, 180, LINE_DEFAULTS.avgMinutes),
    paused,
  };
}

/** Only these businesses have the line (owner, 2026-11-03): nail salons keep their own kiosk flow. */
export const offersOnlineLine = (category: string | null | undefined) => /barber|hair/i.test(category ?? "");

/** A cut is never shown as ending in under this many minutes: one running long is nearly done, not done. */
export const LAST_MINUTES = 3;
/** Real cuts needed before the shop's own median replaces the setting. */
export const MIN_SAMPLES = 5;

export interface LineBarber {
  id: number;
  name: string;
  /** In the chair since (ms); null = free now. */
  busySince: number | null;
}
export interface LineClient {
  key: string;
  /** The barber asked for (only when the shop allows choosing and that barber is working); null = any. */
  preferredStaffId: number | null;
}
export interface LineEstimate {
  /** Minutes until each client in line is likely to be in a chair. */
  perClient: Map<string, number>;
  /** Someone joining now: their wait with any barber, and with each barber. */
  next: { any: number; byBarber: Map<number, number> };
}

/** Null when nobody is working: there is no wait to tell anyone. */
export function estimateLine(input: { now: number; avgMin: number; barbers: LineBarber[]; line: LineClient[] }): LineEstimate | null {
  const { now, avgMin, barbers, line } = input;
  if (barbers.length === 0) return null;
  const free = new Map<number, number>();
  for (const b of barbers) {
    const left = b.busySince == null ? 0 : Math.max(LAST_MINUTES, avgMin - (now - b.busySince) / 60_000);
    free.set(b.id, left);
  }
  const perClient = new Map<string, number>();
  const soonest = () => [...free.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]!;
  for (const c of line) {
    const id = c.preferredStaffId != null && free.has(c.preferredStaffId) ? c.preferredStaffId : soonest()[0];
    const start = free.get(id)!;
    perClient.set(c.key, Math.round(start));
    free.set(id, start + avgMin);
  }
  return {
    perClient,
    next: { any: Math.round(soonest()[1]), byBarber: new Map([...free].map(([id, m]) => [id, Math.round(m)])) },
  };
}

/** What the client reads: "No wait", "Under 5 min", "15–20 min", "About 1 hr 10 min". */
export function waitText(min: number | null): string {
  if (min == null) return "Not taking walk-ins right now";
  if (min <= 1) return "No wait";
  if (min < 5) return "Under 5 min";
  if (min < 60) { const lo = Math.floor(min / 5) * 5; return `${lo}–${lo + 5} min`; }
  const r = Math.round(min / 10) * 10;
  return `About ${Math.floor(r / 60)} hr${r % 60 ? ` ${r % 60} min` : ""}`;
}

/** The middle value of real cut lengths (minutes), or null when there are too few. */
export function medianMinutes(samples: number[]): number | null {
  const s = samples.filter((m) => Number.isFinite(m) && m >= 3 && m <= 180).sort((a, b) => a - b);
  if (s.length < MIN_SAMPLES) return null;
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2);
}

/** "Ana R." — the name shown to other people (lobby screen, the client's own page shows only theirs). */
export function publicName(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Guest";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : parts[0]!;
}

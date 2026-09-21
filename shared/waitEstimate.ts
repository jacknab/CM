/**
 * Expected wait for a client who checks in RIGHT NOW — the "Avg Wait" tile on the Techs page.
 *
 * Pure and tiny on purpose: it works from data every POS screen already has (who is clocked in, who is with a client and
 * for how long, who is waiting), so it costs the server NOTHING. It is re-evaluated when that data changes (a check-in,
 * a start, a checkout, a clock-in, a break … all pushed over the websocket) — never on a schedule — and the screen only
 * re-runs it locally (a few array passes) to let the minutes tick down. No polling, no per-salon background job.
 *
 * Order of thinking, cheapest question first:
 *   1. How many techs are in?              none → no estimate
 *   2. How many are free right now?        (in, not on break, not with a client)
 *   3. How many clients are waiting?       fewer waiting than techs free → nobody waits → 0
 *   4. Otherwise line them up: each waiting client (first come, first served) goes to the tech who frees up first — or to
 *      the tech they were ticketed with — and the answer is when the next tech is free after all of them.
 */

export interface WaitTech {
  id: number;
  clockedIn: boolean;
  /** On break — in, but not taking clients. */
  paused?: boolean;
  /** With a client right now. */
  busy?: boolean;
  /** Minutes until they finish the client they're with (only meaningful when busy). Unknown → estimated. */
  remainingMin?: number | null;
}

export interface WaitingClient {
  /** How long their service will take, if known (a ticket); markers without a ticket use the default. */
  durationMin?: number | null;
  /** The tech they're ticketed with, if any — they wait for THAT tech. */
  staffId?: number | null;
}

export type WaitReason = "no_staff" | "all_on_break";

export interface WaitEstimate {
  /** Whole minutes, or null when there is nothing sensible to say. */
  minutes: number | null;
  reason?: WaitReason;
  staffIn: number;
  free: number;
  waiting: number;
}

/** Assumed service length when nothing better is known. */
export const DEFAULT_SERVICE_MIN = 45;
/** A service that has run over its planned time is assumed to finish this soon. */
const OVERRUN_FINISH_MIN = 5;

export function estimateWait(args: { techs: WaitTech[]; waiting: WaitingClient[]; defaultServiceMin?: number }): WaitEstimate {
  const def = args.defaultServiceMin && args.defaultServiceMin > 0 ? args.defaultServiceMin : DEFAULT_SERVICE_MIN;
  const staffIn = args.techs.filter((t) => t.clockedIn).length;
  // 1. staff
  if (staffIn === 0) return { minutes: null, reason: "no_staff", staffIn: 0, free: 0, waiting: args.waiting.length };
  const working = args.techs.filter((t) => t.clockedIn && !t.paused);
  if (working.length === 0) return { minutes: null, reason: "all_on_break", staffIn, free: 0, waiting: args.waiting.length };

  // 2. free right now
  const free = working.filter((t) => !t.busy).length;
  const waiting = args.waiting.length;
  // 3. more free techs than people waiting → the next client walks straight in
  if (waiting < free || (waiting === 0 && free > 0)) return { minutes: 0, staffIn, free, waiting };

  // 4. line the waiting clients up
  const freeAt = new Map<number, number>();
  for (const t of working) {
    if (!t.busy) { freeAt.set(t.id, 0); continue; }
    const rem = t.remainingMin == null ? def : t.remainingMin;
    freeAt.set(t.id, rem > 0 ? rem : OVERRUN_FINISH_MIN);
  }
  const earliest = () => {
    let best: number | null = null;
    for (const [id, at] of freeAt) if (best === null || at < (freeAt.get(best) as number)) best = id;
    return best as number;
  };
  for (const c of args.waiting) {
    const dur = c.durationMin && c.durationMin > 0 ? c.durationMin : def;
    // Ticketed with a specific tech who is in and working → queue behind them; otherwise whoever frees up first.
    const id = c.staffId != null && freeAt.has(c.staffId) ? c.staffId : earliest();
    freeAt.set(id, (freeAt.get(id) as number) + dur);
  }
  const next = Math.min(...freeAt.values());
  return { minutes: Math.max(0, Math.ceil(next)), staffIn, free, waiting };
}

/** "0 min", "12 min", "1 hr 5 min" — or "—" when there's no estimate. */
export function formatWait(e: WaitEstimate): string {
  if (e.minutes == null) return "—";
  if (e.minutes < 60) return `${e.minutes} min`;
  const h = Math.floor(e.minutes / 60), m = e.minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

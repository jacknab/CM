/**
 * The turn line while the server cannot be reached.
 *
 * Online, the server works the line out (artifacts/api-server: getTurnEligibility). Offline, the device
 * has the last line the server sent — and everything that has happened on THIS device since: technicians
 * clocked in and out, clients handed to technicians, services started, tickets paid or cancelled. This
 * file brings that last line up to date with those events, under the same rules the server uses
 * (shared/turnRules.ts — the same code, not a copy), so that offline:
 *
 *   • a client only goes to a technician who is clocked in, not on a break, not already with a client,
 *     and who performs the service;
 *   • a technician who takes a client leaves the line and comes back when the ticket is paid — at the
 *     back, with the turns the ticket earned (or held at the front after a Counted Turns short turn);
 *   • the next client goes to whoever is now due, not to whoever was first when the connection dropped.
 *
 * It is one device's view. Two tablets offline at the same time do not see each other's work; each
 * ticket is sent with the technician it was really given to and the server settles the line once they
 * are back. Pure function: no storage, no clock of its own — so it can be tested exactly.
 */
import type { LocalRecord } from "./engine";
import { TURN_UNIT, lineMessage, normalizeTurnRules, rankTurnLine, turnUnits, type TurnRules } from "@shared/turnRules";

/** A technician as the server's last line described them. */
export interface BaseLineTech {
  id: number; name: string; color?: string | null; avatarUrl?: string | null;
  clockedIn?: boolean; paused?: boolean; supportsService?: boolean;
  turnPosition?: number; turnCount?: number; turnUnits?: number; turnScore?: number;
  exclusionReasons?: string[]; shortTurnProtected?: boolean;
  upcomingAppointment?: unknown;
  [key: string]: unknown;
}

export interface BaseLine {
  technicians: BaseLineTech[];
  turnRules?: Partial<TurnRules> | null;
  settings?: Record<string, unknown> | null;
  /** When the current turn period began (ISO). Fixed order measures "when they last took a turn" from it. */
  turnPeriodStart?: string | null;
}

/** Something done on this device after the server sent its last line. */
export type LineEvent =
  | { kind: "clock_in"; at: number; staffId: number }
  | { kind: "clock_out"; at: number; staffId: number }
  /** A client was given to this technician. */
  | { kind: "assigned"; at: number; staffId: number }
  /** Their ticket was paid. `serviceAmount` is what earns turns: the services, not tip, retail or tax. */
  | { kind: "paid"; at: number; staffId: number; serviceAmount: number }
  /** Their ticket was cancelled or given to someone else: they are free again and keep their place. */
  | { kind: "released"; at: number; staffId: number };

export interface OfflineLineInput {
  base: BaseLine;
  serviceId: number | null;
  /** Which services each technician performs. Null when the device does not know (then the server's last word stands). */
  skills: ReadonlyMap<number, ReadonlySet<number>> | null;
  /** Tickets that are open right now, as this device knows them: the server's last board plus what was done here. */
  openTickets: ReadonlyArray<{ staffId: number | null; status: string }>;
  events: ReadonlyArray<LineEvent>;
}

export interface OfflineLineTech extends BaseLineTech {
  eligible: boolean;
  clockedIn: boolean;
  clockedOut: boolean;
  paused: boolean;
  supportsService: boolean;
  exclusionReasons: string[];
  turnPosition: number;
  turnCount: number;
  turnUnits: number;
  turnScore: number;
  currentStatus: "available" | "busy" | "on_break";
  inService: boolean;
  availabilityState: "available" | "busy" | "break" | "off";
  lineMessage: string;
  shortTurnProtected: boolean;
}

export interface OfflineLine {
  technicians: OfflineLineTech[];
  eligibleTechnicians: OfflineLineTech[];
  turnRules: TurnRules;
  settings: Record<string, unknown>;
  /** Marks a line worked out on the device. */
  source: "offline";
}

const OUT_OF_LINE = 900;

export function computeOfflineLine(input: OfflineLineInput): OfflineLine {
  const { base, serviceId, skills, openTickets } = input;
  const settings = (base.settings ?? {}) as Record<string, unknown>;
  // The rules as the server last sent them; a line from before the server sent rules falls back to the settings.
  const rules = normalizeTurnRules({
    turnMode: base.turnRules?.mode ?? settings.turnMode,
    turnValueThreshold: base.turnRules?.dollarsPerTurn ?? settings.turnValueThreshold,
    partialTurnValue: base.turnRules?.partialTurnValue ?? settings.partialTurnValue,
    turnBrackets: base.turnRules?.brackets ?? settings.turnBrackets,
    turnBoundary: base.turnRules?.boundary ?? settings.turnBoundary,
    turnAmountBasis: base.turnRules?.amountBasis ?? settings.turnAmountBasis,
    turnTieBreak: base.turnRules?.tieBreak ?? settings.turnTieBreak,
    turnSkipLosesTurn: base.turnRules?.skipLosesTurn ?? settings.turnSkipLosesTurn,
    turnResetPeriod: base.turnRules?.resetPeriod ?? settings.turnResetPeriod,
    turnLateJoin: base.turnRules?.lateJoin ?? settings.turnLateJoin,
    turnRefundPolicy: base.turnRules?.refundPolicy ?? settings.turnRefundPolicy,
    turnCategoryRotation: base.turnRules?.categoryRotation ?? settings.turnCategoryRotation,
  });
  const fixedOrder = rules.mode === "round_robin";
  const periodStart = base.turnPeriodStart ? Date.parse(base.turnPeriodStart) : NaN;

  // ── Where the server left things ──
  const clockedIn = new Map<number, boolean>();
  const score = new Map<number, number>();
  const shown = new Map<number, number>();
  for (const t of base.technicians) {
    clockedIn.set(t.id, t.clockedIn !== false);
    const units = Number.isFinite(Number(t.turnUnits)) ? Number(t.turnUnits) : Math.round((Number(t.turnCount) || 0) * TURN_UNIT);
    shown.set(t.id, units);
    score.set(t.id, Number.isFinite(Number(t.turnScore)) ? Number(t.turnScore) : units);
  }
  // The standing order: everyone the server had in the line, first to last. Technicians it had taken out
  // of the line (with a client) are not in it.
  let line = base.technicians
    .filter((t) => t.clockedIn !== false && (t.turnPosition ?? OUT_OF_LINE) < OUT_OF_LINE)
    .sort((a, b) => (a.turnPosition ?? 0) - (b.turnPosition ?? 0) || a.id - b.id)
    .map((t) => t.id);
  // Clock-in order, for salons that settle ties by it: the server's order is the nearest thing the device has.
  const clockInOrder = new Map<number, number>(
    [...base.technicians].sort((a, b) => (a.turnPosition ?? OUT_OF_LINE) - (b.turnPosition ?? OUT_OF_LINE) || a.id - b.id).map((t, i) => [t.id, i]),
  );
  let pinned = base.technicians.filter((t) => t.shortTurnProtected === true && line.includes(t.id)).map((t) => t.id);
  const known = new Set(base.technicians.map((t) => t.id));

  // ── What has happened on this device since, in the order it happened ──
  const events = [...input.events].filter((e) => known.has(e.staffId)).sort((a, b) => a.at - b.at);
  for (const e of events) {
    const id = e.staffId;
    if (e.kind === "clock_in") {
      clockedIn.set(id, true);
      if (!line.includes(id)) {
        // A technician who joins part-way through: at zero, or level with the lowest in the line where the salon says so.
        if (rules.lateJoin === "level" && line.length > 0) {
          const lowest = Math.min(...line.map((x) => score.get(x) ?? 0));
          score.set(id, fixedOrder ? Math.max(score.get(id) ?? 0, Number.isFinite(periodStart) ? e.at - periodStart + 1 : lowest + 1) : Math.max(score.get(id) ?? 0, lowest));
        }
        line.push(id);
        clockInOrder.set(id, clockInOrder.size);
      }
    } else if (e.kind === "clock_out") {
      clockedIn.set(id, false);
      line = line.filter((x) => x !== id);
      pinned = pinned.filter((x) => x !== id);
    } else if (e.kind === "assigned") {
      // Taken from the line until the ticket is closed. In fixed order this is the moment the turn is used.
      line = line.filter((x) => x !== id);
      pinned = pinned.filter((x) => x !== id);
      if (fixedOrder) {
        const highest = Math.max(0, ...score.values());
        score.set(id, Number.isFinite(periodStart) ? Math.max(highest + 1, e.at - periodStart + 1) : highest + 1);
        shown.set(id, (shown.get(id) ?? 0) + TURN_UNIT);
      }
    } else if (e.kind === "paid") {
      const earned = fixedOrder ? 0 : turnUnits(rules, e.serviceAmount);
      if (earned > 0) {
        score.set(id, (score.get(id) ?? 0) + earned);
        shown.set(id, (shown.get(id) ?? 0) + earned);
      }
      const rest = line.filter((x) => x !== id);
      if (e.serviceAmount <= 0) {
        // Nothing was collected: no turn, no penalty — back to the front.
        line = [id, ...rest];
      } else if (rules.mode === "classic" && earned < TURN_UNIT) {
        // Counted Turns short turn: nothing earned, and held at the front.
        line = [id, ...rest];
        pinned = [...pinned.filter((x) => x !== id), id];
      } else {
        line = [...rest, id];
        pinned = pinned.filter((x) => x !== id);
      }
    } else if (e.kind === "released") {
      if (!line.includes(id)) line = [id, ...line];
    }
  }

  // ── Who is with a client right now ──
  const inService = new Set<number>();
  const holding = new Set<number>();
  for (const t of openTickets) {
    if (t.staffId == null) continue;
    if (t.status === "started") inService.add(t.staffId);
    else holding.add(t.staffId);
  }
  // Clocked in, free, and not in the line (the server had taken them out for a client this device no
  // longer shows as open): they are back, at the end.
  for (const t of base.technicians) {
    if (clockedIn.get(t.id) && !line.includes(t.id) && !inService.has(t.id) && !holding.has(t.id)) line.push(t.id);
  }
  line = line.filter((id) => clockedIn.get(id));

  const ranked = rankTurnLine({ line, scores: score, pinnedFront: pinned.filter((id) => line.includes(id)), tieBreak: rules.tieBreak, clockInOrder });
  const position = new Map(ranked.map((id, i) => [id, i]));

  const technicians: OfflineLineTech[] = base.technicians.map((t) => {
    const isIn = clockedIn.get(t.id) === true;
    const paused = t.paused === true;
    const busy = inService.has(t.id) || holding.has(t.id);
    const supports = !serviceId ? true : skills ? skills.get(t.id)?.has(serviceId) === true : t.supportsService !== false;
    // The appointment window is the server's last word: the device has no better clock on the technician's bookings.
    const appointmentSoon = (t.exclusionReasons ?? []).includes("appointment_within_exclusion_window");
    const reasons = [
      !isIn ? "not_clocked_in" : null,
      paused ? "paused" : null,
      busy ? "currently_busy" : null,
      appointmentSoon ? "appointment_within_exclusion_window" : null,
      !supports ? "service_not_supported" : null,
    ].filter((r): r is string => !!r);
    const currentStatus: OfflineLineTech["currentStatus"] = paused ? "on_break" : busy ? "busy" : "available";
    const units = shown.get(t.id) ?? 0;
    return {
      ...t,
      clockedIn: isIn, clockedOut: !isIn, paused, supportsService: supports,
      eligible: reasons.length === 0, exclusionReasons: reasons,
      turnPosition: position.has(t.id) ? position.get(t.id)! : 999,
      turnCount: units / TURN_UNIT, turnUnits: units, turnScore: score.get(t.id) ?? 0,
      currentStatus, inService: inService.has(t.id),
      availabilityState: (!isIn ? "off" : paused ? "break" : busy ? "busy" : "available") as OfflineLineTech["availabilityState"],
      shortTurnProtected: pinned.includes(t.id),
      lineMessage: "",
    };
  }).sort((a, b) => a.turnPosition - b.turnPosition || a.id - b.id);

  let eligibleAhead = 0;
  for (const tech of technicians) {
    tech.lineMessage = lineMessage({ eligible: tech.eligible, reasons: tech.exclusionReasons, clockedIn: tech.clockedIn }, eligibleAhead);
    if (tech.eligible) eligibleAhead += 1;
  }
  return { technicians, eligibleTechnicians: technicians.filter((t) => t.eligible), turnRules: rules, settings, source: "offline" };
}

/**
 * One technician for a whole visit: the first in line for the first service who can also take every
 * other service of it. Null when nobody can — then each service goes to whoever is next for it.
 */
export function commonOfflineTech(lines: ReadonlyArray<OfflineLine>): OfflineLineTech | null {
  if (lines.length === 0) return null;
  const others = lines.slice(1).map((l) => new Set(l.eligibleTechnicians.map((t) => t.id)));
  return lines[0].eligibleTechnicians.find((t) => others.every((ids) => ids.has(t.id))) ?? null;
}

/**
 * What this device did after the server sent its last line (`since`, ms), as line events: clients handed
 * to technicians, tickets paid, cancelled or moved, technicians clocked in and out.
 *   • `staffOnBoard`: ticket id → the technician the server's last board showed it with.
 *   • `punches`: clock-ins and clock-outs made here that the server has not had yet.
 * Anything older than the line is left out — the server had already counted it.
 */
export function eventsFromDevice(input: {
  records: ReadonlyArray<LocalRecord>;
  since: number;
  staffOnBoard: ReadonlyMap<number, number | null>;
  punches: ReadonlyArray<{ action: string; staffId: number; at: number }>;
}): LineEvent[] {
  const { records, since, staffOnBoard, punches } = input;
  const after = (iso?: string | null) => { const at = iso ? Date.parse(iso) : NaN; return Number.isFinite(at) && (!Number.isFinite(since) || at > since) ? at : null; };
  // What earns turns is the service amount the checkout recorded; a sale saved without it falls back to the ticket's price.
  const serviceAmount = (paid: { request: Record<string, unknown>; totalPaid: number; tip: number }, ticketTotal: number) => {
    const recorded = Number(paid.request?.serviceRevenue);
    if (paid.request?.serviceRevenue != null && Number.isFinite(recorded)) return Math.max(0, recorded);
    return Math.max(0, Number.isFinite(ticketTotal) ? ticketTotal : paid.totalPaid - paid.tip);
  };
  const events: LineEvent[] = [];
  for (const r of records) {
    if (r.kind === "ticket") {
      const made = after(r.createdAt);
      if (r.staff && made != null) events.push({ kind: "assigned", at: made, staffId: r.staff.id });
      const paidAt = r.paid ? after(r.paid.at) : null;
      if (r.staff && r.paid && paidAt != null) events.push({ kind: "paid", at: paidAt, staffId: r.staff.id, serviceAmount: serviceAmount(r.paid, r.total) });
    } else if (r.kind === "patch") {
      const changed = after(r.createdAt);
      const before = r.seen?.staffId ?? staffOnBoard.get(r.ticketId) ?? null;
      const holder = r.staff?.id ?? before;
      if (changed != null && r.staff && r.staff.id !== before) {
        events.push({ kind: "assigned", at: changed, staffId: r.staff.id });
        if (before != null) events.push({ kind: "released", at: changed, staffId: before });
      }
      if (changed != null && r.status === "cancelled" && holder != null) events.push({ kind: "released", at: changed + 1, staffId: holder });
      const paidAt = r.paid ? after(r.paid.at) : null;
      if (r.paid && paidAt != null && holder != null) events.push({ kind: "paid", at: paidAt, staffId: holder, serviceAmount: serviceAmount(r.paid, NaN) });
    }
  }
  for (const p of punches) {
    if (Number.isFinite(p.staffId)) events.push({ kind: p.action === "clock_in" ? "clock_in" : "clock_out", at: p.at, staffId: p.staffId });
  }
  return events;
}

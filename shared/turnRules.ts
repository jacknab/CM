/**
 * Turn rules — how much "turn" a finished ticket is worth, who is due next, and how to say why.
 *
 * One engine, one set of rules, chosen by the salon (Settings → Turn System). Every method answers the
 * same question the same way: each technician in the line has a SCORE for the current turn period, and
 * the technician with the lowest score who can take the client is next. The methods differ only in what
 * the score is:
 *
 *   • "round_robin"  — Fixed order. The score is when the technician last took a turn: whoever took one
 *                      longest ago is next. Ticket price never matters.
 *   • "client_count" — Equal client count. Every finished, paid walk-in ticket is one client.
 *   • "classic"      — Counted Turns. A ticket at or over the threshold is one turn; a smaller one is a
 *                      "short turn" that earns nothing and returns the technician to the front.
 *   • "dollar"       — Dollar-Based Turns. Under dollars-per-turn is a partial turn (½), from there up
 *                      one turn per full multiple ($30 a turn: $20 → ½, $45 → 1, $65 → 2).
 *   • "brackets"     — Dollar brackets. The salon lists amounts and what each earns
 *                      (under $30 → ½, from $30 → 1, from $60 → 2).
 *   • "proportional" — Proportional. Every dollar earns its share of a turn ($30 a turn: $45 → 1.5).
 *
 * Who CAN take the client (clocked in, not busy, not on break, performs the service) is never a method of
 * its own: it is applied on top of whichever method the salon runs.
 *
 * Turns are whole numbers of TURN UNITS (a thousandth of a turn), and money is whole cents, so no total
 * is ever a rounded fraction: ½ + ½ is exactly 1.
 *
 * Pure functions only — no database, no browser — so the server, the tablets (offline) and the tests all
 * run exactly the same rules.
 */

/** One turn, in turn units. */
export const TURN_UNIT = 1000;

export type TurnMode = "classic" | "dollar" | "round_robin" | "client_count" | "brackets" | "proportional";

/** Why a technician could not take a client. The names are the ones the eligibility check already uses. */
export type SkipReason = "not_clocked_in" | "paused" | "currently_busy" | "appointment_within_exclusion_window" | "service_not_supported";

/** From this service amount (in cents) a ticket earns this many turn units. */
export interface TurnBracket { fromCents: number; units: number }

export interface TurnRules {
  mode: TurnMode;
  /** Dollars of service that make one turn (the threshold in classic mode). */
  dollarsPerTurn: number;
  /** What a ticket under dollarsPerTurn earns in dollar mode. */
  partialTurnValue: number;
  /** Dollar brackets, lowest first. There is always one starting at $0, so every amount has an answer. */
  brackets?: TurnBracket[];
  /** A ticket of exactly a bracket's amount: "at_or_over" puts it in that bracket, "over" in the one below. */
  boundary?: "at_or_over" | "over";
  /** Which amount earns turns: the services as priced, or the services less the ticket's discount. */
  amountBasis?: "service" | "service_after_discount";
  /** Technicians level on score: whoever has waited longest, or always in the order they clocked in. */
  tieBreak?: "longest_waiting" | "clock_in_order";
  /** Fixed order only: being passed over for one of these reasons uses up the technician's turn. */
  skipLosesTurn?: SkipReason[];
  /** When the scores start again. */
  resetPeriod?: "business_day" | "day_close" | "continuous";
  /** A technician who joins part-way through: starts at zero, or level with the lowest in the line. */
  lateJoin?: "zero" | "level";
  /** A refunded ticket: the turns it earned stay, or are taken back. */
  refundPolicy?: "keep" | "remove";
  /** Keep a separate rotation for each service category. */
  categoryRotation?: boolean;
}

export const TURN_MODES: readonly TurnMode[] = ["round_robin", "client_count", "classic", "dollar", "brackets", "proportional"];

export const TURN_PRESETS: Record<TurnMode, { label: string; description: string }> = {
  round_robin: {
    label: "Fixed order",
    description: "Technicians take walk-ins one after another, in order. The price of the ticket never matters.",
  },
  client_count: {
    label: "Equal clients",
    description: "Every finished ticket counts as one client. The technician with the fewest clients is next.",
  },
  classic: {
    label: "Counted Turns",
    description: "Each ticket over the threshold is one turn. A smaller ticket keeps the technician at the front.",
  },
  dollar: {
    label: "Dollar-Based Turns",
    description: "Turns are earned by the service amount. The technician with the lowest total is next.",
  },
  brackets: {
    label: "Dollar brackets",
    description: "You set the amounts and what each one earns. The technician with the lowest total is next.",
  },
  proportional: {
    label: "Proportional to price",
    description: "Every dollar earns its share of a turn. The technician with the lowest total is next.",
  },
};

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  not_clocked_in: "not clocked in",
  paused: "on break",
  currently_busy: "with a client",
  appointment_within_exclusion_window: "has an appointment coming up",
  service_not_supported: "doesn't perform this service",
};

/** The brackets a salon starts from when it first picks dollar brackets: under $30 → ½, $30 → 1, $60 → 2. */
export const DEFAULT_BRACKETS: TurnBracket[] = [
  { fromCents: 0, units: 500 },
  { fromCents: 3000, units: 1000 },
  { fromCents: 6000, units: 2000 },
];

const SKIP_REASONS: readonly SkipReason[] = ["paused", "currently_busy", "appointment_within_exclusion_window", "service_not_supported"];

function normalizeBrackets(raw: unknown): TurnBracket[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map((b: any) => ({ fromCents: Math.round(Number(b?.fromCents)), units: Math.round(Number(b?.units)) }))
    .filter((b) => Number.isFinite(b.fromCents) && b.fromCents >= 0 && b.fromCents <= 100_000_00 && Number.isFinite(b.units) && b.units >= 0 && b.units <= 100 * TURN_UNIT)
    .sort((a, b) => a.fromCents - b.fromCents);
  // one bracket per amount (the last one given wins), and never more than a salon could read
  const byAmount = new Map<number, TurnBracket>();
  for (const b of list) byAmount.set(b.fromCents, b);
  const clean = [...byAmount.values()].slice(0, 12);
  if (clean.length === 0) return DEFAULT_BRACKETS.map((b) => ({ ...b }));
  // every amount needs an answer: below the first bracket a ticket earns nothing
  if (clean[0].fromCents !== 0) clean.unshift({ fromCents: 0, units: 0 });
  return clean;
}

/** The salon's saved turn settings as rules. Anything missing or unreadable falls back to how Certxa behaved before it existed. */
export function normalizeTurnRules(settings: Record<string, unknown> | null | undefined): TurnRules {
  const s = settings ?? {};
  const dollars = Number(s.turnValueThreshold);
  const partial = Number(s.partialTurnValue);
  const mode = (TURN_MODES as readonly unknown[]).includes(s.turnMode) ? (s.turnMode as TurnMode) : "classic";
  return {
    mode,
    dollarsPerTurn: Number.isFinite(dollars) && dollars > 0 ? dollars : 30,
    partialTurnValue: Number.isFinite(partial) && partial >= 0 && partial <= 1 ? partial : 0.5,
    brackets: normalizeBrackets(s.turnBrackets),
    boundary: s.turnBoundary === "over" ? "over" : "at_or_over",
    amountBasis: s.turnAmountBasis === "service_after_discount" ? "service_after_discount" : "service",
    tieBreak: s.turnTieBreak === "clock_in_order" ? "clock_in_order" : "longest_waiting",
    skipLosesTurn: (Array.isArray(s.turnSkipLosesTurn) ? s.turnSkipLosesTurn : []).filter((r): r is SkipReason => SKIP_REASONS.includes(r as SkipReason)),
    resetPeriod: s.turnResetPeriod === "day_close" || s.turnResetPeriod === "continuous" ? s.turnResetPeriod : "business_day",
    lateJoin: s.turnLateJoin === "level" ? "level" : "zero",
    refundPolicy: s.turnRefundPolicy === "remove" ? "remove" : "keep",
    categoryRotation: s.turnCategoryRotation === true,
  };
}

/** The same rules as the plain settings fields they are saved under. */
export function turnRulesToSettings(rules: TurnRules): Record<string, unknown> {
  const r = normalizeTurnRules({
    turnMode: rules.mode, turnValueThreshold: rules.dollarsPerTurn, partialTurnValue: rules.partialTurnValue,
    turnBrackets: rules.brackets, turnBoundary: rules.boundary, turnAmountBasis: rules.amountBasis, turnTieBreak: rules.tieBreak,
    turnSkipLosesTurn: rules.skipLosesTurn, turnResetPeriod: rules.resetPeriod, turnLateJoin: rules.lateJoin,
    turnRefundPolicy: rules.refundPolicy, turnCategoryRotation: rules.categoryRotation,
  });
  return {
    turnMode: r.mode, turnValueThreshold: r.dollarsPerTurn, partialTurnValue: r.partialTurnValue,
    turnBrackets: r.brackets, turnBoundary: r.boundary, turnAmountBasis: r.amountBasis, turnTieBreak: r.tieBreak,
    turnSkipLosesTurn: r.skipLosesTurn, turnResetPeriod: r.resetPeriod, turnLateJoin: r.lateJoin,
    turnRefundPolicy: r.refundPolicy, turnCategoryRotation: r.categoryRotation,
  };
}

/** Does the score come from the price of the ticket? (The others count turns taken or clients served.) */
export function isDollarMode(mode: TurnMode): boolean {
  return mode === "classic" || mode === "dollar" || mode === "brackets" || mode === "proportional";
}

const cents = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };

/**
 * The amount of a finished ticket that earns turns, in dollars: the services, less tip, retail and tax.
 * Never below zero. With `basis` "service_after_discount" the ticket's discount comes off too — the part
 * of it that falls on the services when the ticket also sold retail.
 */
export function turnAmount(
  ticket: { serviceRevenue?: unknown; totalPaid?: unknown; tipAmount?: unknown; productRevenue?: unknown; discountAmount?: unknown },
  basis: TurnRules["amountBasis"] = "service",
): number {
  // The checkout freezes the service / product split on the ticket; older tickets only have the total.
  const hasSplit = ticket.serviceRevenue != null && Number.isFinite(Number(ticket.serviceRevenue));
  const service = hasSplit ? Math.max(0, cents(ticket.serviceRevenue)) : Math.max(0, cents(ticket.totalPaid) - cents(ticket.tipAmount) - cents(ticket.productRevenue));
  if (basis !== "service_after_discount" || !hasSplit) return service / 100;
  const discount = Math.max(0, cents(ticket.discountAmount));
  if (discount <= 0 || service <= 0) return service / 100;
  const product = Math.max(0, cents(ticket.productRevenue));
  const onServices = Math.round((discount * service) / (service + product));
  return Math.max(0, service - onServices) / 100;
}

/** Turn units one finished ticket of this service amount is worth. An unpaid ticket is worth nothing. */
export function turnUnits(rules: TurnRules, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  // whole cents, so $29.999… and $30.00 can't land on different sides through float noise
  const amountCents = Math.round(amount * 100);
  if (amountCents <= 0) return 0;
  const perTurn = Math.max(1, Math.round(rules.dollarsPerTurn * 100));
  switch (rules.mode) {
    case "round_robin":
    case "client_count":
      return TURN_UNIT;
    case "dollar":
      return amountCents < perTurn ? Math.round(rules.partialTurnValue * TURN_UNIT) : Math.floor(amountCents / perTurn) * TURN_UNIT;
    case "proportional":
      return Math.round((amountCents * TURN_UNIT) / perTurn);
    case "brackets": {
      const brackets = rules.brackets?.length ? rules.brackets : DEFAULT_BRACKETS;
      const over = rules.boundary === "over";
      let units = 0;
      for (const b of brackets) {
        // the $0 bracket always covers the smallest tickets, whichever way the boundary falls
        if (b.fromCents === 0 || (over ? amountCents > b.fromCents : amountCents >= b.fromCents)) units = b.units;
      }
      return units;
    }
    default:
      return amountCents >= perTurn ? TURN_UNIT : 0;
  }
}

/** Turns one finished ticket of this service amount is worth (turnUnits, as a number of turns). */
export function turnValue(rules: TurnRules, amount: number): number {
  return turnUnits(rules, amount) / TURN_UNIT;
}

/** Turn units written the way staff say them: "½", "1", "1½", "2.17". */
export function formatTurns(units: number): string {
  const sign = units < 0 ? "−" : "";
  const u = Math.abs(Math.round(units));
  const whole = Math.floor(u / TURN_UNIT);
  const rest = u % TURN_UNIT;
  if (rest === 0) return `${sign}${whole}`;
  if (rest === 500) return `${sign}${whole === 0 ? "" : whole}½`;
  return `${sign}${(u / TURN_UNIT).toFixed(2).replace(/0$/, "")}`;
}

/**
 * The line: lowest score first. Technicians level on score keep the order they are already in (`line`
 * is the standing first-come order — whoever has waited longest is earlier), so nothing but the score
 * ever moves a technician past another. Classic mode's short-turn technicians are held at the very
 * front, in the order they earned it.
 */
export function orderTurnLine(line: readonly number[], totals: ReadonlyMap<number, number>, pinnedFront: readonly number[] = []): number[] {
  const pinRank = new Map(pinnedFront.map((id, i) => [id, i]));
  return line
    .map((id, index) => ({ id, index }))
    .sort((a, b) => {
      const pa = pinRank.get(a.id), pb = pinRank.get(b.id);
      if (pa != null || pb != null) {
        if (pa != null && pb != null) return pa - pb;
        return pa != null ? -1 : 1;
      }
      return (totals.get(a.id) ?? 0) - (totals.get(b.id) ?? 0) || a.index - b.index;
    })
    .map((x) => x.id);
}

/**
 * The line under the salon's tie-break. "longest_waiting" is orderTurnLine as it stands. "clock_in_order"
 * settles every tie by who clocked in first, whatever has happened since — the fixed order a salon means
 * by "we always go Amy, Lisa, Maria".
 */
export function rankTurnLine(opts: {
  line: readonly number[];
  scores: ReadonlyMap<number, number>;
  pinnedFront?: readonly number[];
  tieBreak?: TurnRules["tieBreak"];
  /** staff id → position by clock-in time (0 = first in). */
  clockInOrder?: ReadonlyMap<number, number>;
}): number[] {
  const { line, scores, pinnedFront = [], tieBreak = "longest_waiting", clockInOrder } = opts;
  if (tieBreak !== "clock_in_order" || !clockInOrder) return orderTurnLine(line, scores, pinnedFront);
  const byClockIn = line
    .map((id, index) => ({ id, index }))
    .sort((a, b) => (clockInOrder.get(a.id) ?? 1e9) - (clockInOrder.get(b.id) ?? 1e9) || a.index - b.index)
    .map((x) => x.id);
  return orderTurnLine(byClockIn, scores, pinnedFront);
}

/** One technician as the rotation saw them when a client was assigned. */
export interface ConsideredTechnician {
  id: number;
  name: string;
  /** Place in the line, 0 = first. */
  position: number;
  eligible: boolean;
  reasons: string[];
  /** Their score in turn units (dollar and client methods); not meaningful for fixed order. */
  units?: number;
}

/**
 * Why this technician got the client, in words a technician can read at the desk. `considered` is the
 * line in order; everyone ahead of the chosen technician was passed over and is named with the reason.
 */
export function explainAssignment(opts: {
  rules: TurnRules;
  chosenId: number;
  considered: readonly ConsideredTechnician[];
  /** Chosen by a person rather than by the line. */
  manual?: boolean;
  /** The client asked for this technician. */
  requested?: boolean;
  category?: string | null;
  overrideReason?: string | null;
}): string {
  const { rules, chosenId, considered, manual, requested, category, overrideReason } = opts;
  const chosen = considered.find((t) => t.id === chosenId);
  const name = chosen?.name ?? "The technician";
  const first = considered[0];
  const scope = category ? ` for ${category}` : "";
  if (requested) return `${name} was asked for by the client, so the line was not used. Nobody lost their place.`;
  if (manual) {
    const due = first && first.id !== chosenId ? ` ${first.name} was next in line${scope}.` : "";
    return `${name} was chosen by staff${overrideReason ? ` (${overrideReason})` : ""}.${due}`;
  }
  const passed = considered.filter((t) => chosen && t.position < chosen.position && !t.eligible);
  const passedText = passed.length
    ? ` Passed over: ${passed.map((t) => `${t.name} (${t.reasons.map((r) => SKIP_REASON_LABEL[r as SkipReason] ?? r).join(", ") || "not available"})`).join("; ")}.`
    : "";
  let why: string;
  if (rules.mode === "round_robin") {
    why = passed.length ? `${name} was the next technician in order${scope} who could take the client.` : `${name} was next in order${scope}.`;
  } else {
    const level = considered.filter((t) => t.eligible && t.id !== chosenId && chosen && (t.units ?? 0) === (chosen.units ?? 0));
    const what = rules.mode === "client_count" ? "clients" : "turns";
    const total = chosen?.units != null ? ` (${formatTurns(chosen.units)} ${what})` : "";
    why = `${name} had the fewest ${what}${scope}${total}${passed.length ? " of the technicians who could take the client" : ""}.`;
    if (level.length) {
      why += ` Level with ${level.map((t) => t.name).join(" and ")}; ${name} ${rules.tieBreak === "clock_in_order" ? "clocked in first" : "had waited longest"}.`;
    }
  }
  return why + passedText;
}

/**
 * What a technician sees about their own place: "You're next", "2 ahead of you", or why they are being
 * passed over. `aheadEligible` counts only technicians ahead who can actually take a client now.
 */
export function lineMessage(tech: { eligible: boolean; reasons: readonly string[]; clockedIn: boolean }, aheadEligible: number): string {
  if (!tech.clockedIn) return "Not in the line — clock in to join.";
  if (!tech.eligible) {
    const reason = tech.reasons.map((r) => SKIP_REASON_LABEL[r as SkipReason] ?? r)[0] ?? "not available";
    return `Passed over for now — ${reason}. Your place is kept.`;
  }
  if (aheadEligible <= 0) return "You're next.";
  return `${aheadEligible} ${aheadEligible === 1 ? "technician" : "technicians"} ahead of you.`;
}

/** One line describing what a ticket earned, for the technician and for the history. */
export function describeCredit(rules: TurnRules, amount: number, units: number): string {
  const dollars = `$${amount.toFixed(2)}`;
  if (rules.mode === "round_robin") return "Turn taken. You go to the back of the order.";
  if (rules.mode === "client_count") return units > 0 ? "1 client counted." : "No client counted — nothing was paid.";
  if (units <= 0) {
    return rules.mode === "classic" && amount > 0
      ? `Service ${dollars}: a short turn. No turn counted, and you stay at the front.`
      : `Service ${dollars}: no turn counted.`;
  }
  return `Service ${dollars}: ${formatTurns(units)} ${units === TURN_UNIT ? "turn" : "turns"} earned.`;
}

/**
 * Turn rules — how much "turn" a finished ticket is worth, and who is due next.
 *
 * A salon picks one of the pre-configured turn systems (Settings → Turn System):
 *
 *   • "dollar"  — Dollar-Based Turns. Each ticket earns turns by its service amount: under the
 *                 salon's dollars-per-turn it is a partial turn (½ by default), from there up it is
 *                 one turn per full multiple ($30 a turn: $20 → ½, $45 → 1, $65 → 2). The technician
 *                 with the lowest total today is due next; a technician never gets the next client
 *                 just because they finished first.
 *   • "classic" — Counted Turns (how Certxa worked before presets). A ticket at or over the threshold
 *                 is one turn; a smaller one is a "short turn" that earns nothing and returns the
 *                 technician to the front of the line.
 *
 * The amount is always the SERVICE amount: tips, retail products and sales tax never earn a turn.
 * Pure functions only — no database — so the rules can be tested exactly as a salon would describe them.
 */

export type TurnMode = "dollar" | "classic";

export interface TurnRules {
  mode: TurnMode;
  /** Dollars of service that make one turn (the threshold in classic mode). */
  dollarsPerTurn: number;
  /** What a ticket under dollarsPerTurn earns in dollar mode. */
  partialTurnValue: number;
}

export const TURN_PRESETS: Record<TurnMode, { label: string; description: string }> = {
  dollar: {
    label: "Dollar-Based Turns",
    description: "Turns are earned by the service amount. The technician with the lowest total today is next.",
  },
  classic: {
    label: "Counted Turns",
    description: "Each ticket over the threshold is one turn. A smaller ticket keeps the technician at the front.",
  },
};

export function normalizeTurnRules(settings: { turnMode?: unknown; turnValueThreshold?: unknown; partialTurnValue?: unknown } | null | undefined): TurnRules {
  const dollars = Number(settings?.turnValueThreshold);
  const partial = Number(settings?.partialTurnValue);
  return {
    mode: settings?.turnMode === "dollar" ? "dollar" : "classic",
    dollarsPerTurn: Number.isFinite(dollars) && dollars > 0 ? dollars : 30,
    partialTurnValue: Number.isFinite(partial) && partial >= 0 && partial <= 1 ? partial : 0.5,
  };
}

/** The service amount of a finished ticket: what it earned, less tip, retail and tax. Never below zero. */
export function turnAmount(ticket: { serviceRevenue?: unknown; totalPaid?: unknown; tipAmount?: unknown; productRevenue?: unknown }): number {
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  // The checkout freezes the service / product split on the ticket; older tickets only have the total.
  if (ticket.serviceRevenue != null && Number.isFinite(Number(ticket.serviceRevenue))) return Math.max(0, num(ticket.serviceRevenue));
  return Math.max(0, num(ticket.totalPaid) - num(ticket.tipAmount) - num(ticket.productRevenue));
}

/** Turns one finished ticket of this service amount is worth. An unpaid ticket is worth nothing. */
export function turnValue(rules: TurnRules, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  // whole cents, so $29.999… and $30.00 can't land on different sides through float noise
  const cents = Math.round(amount * 100);
  const perTurn = Math.round(rules.dollarsPerTurn * 100);
  if (rules.mode === "dollar") return cents < perTurn ? rules.partialTurnValue : Math.floor(cents / perTurn);
  return cents >= perTurn ? 1 : 0;
}

/**
 * The line: lowest turn total first. Technicians level on turns keep the order they are already in
 * (`line` is the standing first-come order — whoever has waited longest is earlier), so nothing but
 * earned turns ever moves a technician past another. Classic mode's short-turn technicians are held
 * at the very front, in the order they earned it.
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

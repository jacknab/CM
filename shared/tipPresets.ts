/**
 * The tip percentages a salon offers at checkout — on the customer's tip screen, the /nail and /barber tip
 * popup, and the calendar checkout. Each salon sets its own (POS Settings → Tip presets); these are the
 * defaults until it does.
 */
export const DEFAULT_TIP_PRESETS: readonly number[] = [15, 18, 20, 25];
export const MAX_TIP_PRESETS = 4;

/** Whole percentages from 1 to 100, no repeats, lowest first, at most four. Anything unusable → the defaults. */
export function sanitizeTipPresets(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TIP_PRESETS];
  const clean = [...new Set(raw.map((v) => Math.round(Number(v))).filter((n) => Number.isFinite(n) && n >= 1 && n <= 100))]
    .sort((a, b) => a - b)
    .slice(0, MAX_TIP_PRESETS);
  return clean.length ? clean : [...DEFAULT_TIP_PRESETS];
}

/**
 * The preset tip choices on the /frontdesk full-screen tip page (shown while collecting a card payment). "No tip" is
 * the page's separate Skip button, and any other amount goes through its Custom keypad.
 */
export interface TipOption { pct: number; note: string }

const NOTES = ["OK service.", "Good service.", "Great service.", "Outstanding service!"];

/** The tiles for a salon's own percentages (shared/tipPresets.ts). The notes run up to "Outstanding" at the top one. */
export function tipOptionsFor(pcts: readonly number[]): TipOption[] {
  return pcts.map((pct, i) => ({ pct, note: NOTES[NOTES.length - pcts.length + i] ?? "" }));
}

/** The defaults, for a salon that has not set its own. */
export const TIP_OPTIONS: readonly TipOption[] = tipOptionsFor([15, 18, 20, 25]);

/** Whole cents, rounded — `total` is the sale total the tip is calculated on. */
export const calcTipAmount = (total: number, pct: number): number => Math.round(total * pct) / 100;

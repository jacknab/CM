/**
 * Techs tab layout: ONE column, three cards visible at a time (a fourth+ scrolls into view).
 * Each card is drawn as a wide row at BASE_H tall and scaled so exactly three fit the height;
 * its width stretches to fill the panel.
 */
export const BASE_H = 150;
export const GAP = 12;
export const VISIBLE_CARDS = 3;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.8;

export interface TechRows {
  /** Scale applied to a card drawn at BASE_H tall. */
  scale: number;
  /** Design width (pre-scale) so that the scaled card spans the full panel width. */
  designW: number;
}

export function computeTechRows(width: number, height: number): TechRows {
  if (width <= 0 || height <= 0) return { scale: 1, designW: 600 };
  const cellH = (height - GAP * (VISIBLE_CARDS - 1)) / VISIBLE_CARDS;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cellH / BASE_H));
  return { scale, designW: width / scale };
}

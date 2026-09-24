/**
 * Techs tab layout — EVERYTHING is on screen at once, nothing scrolls (staff can't scroll this page).
 *
 * The unit is a column of up to three cards, top to bottom in turn order:
 *   1–3 techs  → one column (cards stretch to fill it)
 *   4–6 techs  → two columns, 7–9 → three, 10–12 → four; each column filled before the next.
 *   More than 12 → whatever grid gives the biggest cards.
 * Every card is drawn at one design size and scaled to fit its cell; its width follows the cell, so a wide single column just
 * gets a wider card. Two designs: the roomy one (CARD_W × CARD_H) while it can be drawn at a readable size, and — once a
 * crowded screen would shrink it below MIN_READABLE_SCALE — a compact one (COMPACT_W × COMPACT_H, styled by `.tt-compact`)
 * whose text is drawn at about real size, so 12 techs are still easy to read.
 */
export const GAP = 14;
export const CARDS_PER_COLUMN = 3;
export const CARD_W = 620;
export const CARD_H = 240;
export const COMPACT_W = 250;
export const COMPACT_H = 132;
const MAX_SCALE = 1.5;
/** Below this the roomy card's text is too small to read at a glance. */
export const MIN_READABLE_SCALE = 0.75;
/** Floor for `layoutFor`'s scale — without it, a transiently tiny (but positive) container size
 *  during a swipe-page transition, or GAP*(cols-1) exceeding the container width, can produce a
 *  negative scale (inverted/invisible cards for a frame). Deliberately below MIN_READABLE_SCALE:
 *  this is a safety floor, not a "still readable" guarantee. */
const MIN_SCALE = 0.05;

export interface TechLayout {
  cols: number;
  rows: number;
  scale: number;
  /** Card size before scaling. */
  cardW: number;
  cardH: number;
  /** The compact card design (dense screens). */
  compact: boolean;
}

interface Design { w: number; h: number; compact: boolean; lean?: boolean }
const ROOMY: Design = { w: CARD_W, h: CARD_H, compact: false };
const COMPACT: Design = { w: COMPACT_W, h: COMPACT_H, compact: true };
// The Clocked In page's lean card (name + timer, nothing under it or beside it) is shorter, so it gets its own design sizes.
const ROOMY_LEAN: Design = { w: 490, h: 184, compact: false, lean: true };
const COMPACT_LEAN: Design = { w: 250, h: 96, compact: true, lean: true };

function layoutFor(cols: number, rows: number, width: number, height: number, d: Design): TechLayout {
  const cellW = (width - GAP * (cols - 1)) / cols;
  const cellH = (height - GAP * (rows - 1)) / rows;
  const uncapped = Math.min(cellW / d.w, cellH / d.h);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, uncapped));
  return {
    cols, rows, scale, compact: d.compact,
    cardW: cellW / scale,
    // Height-limited → exactly the design height; width-limited → use the spare height (up to 1.25×); capped → don't stretch.
    cardH: uncapped > MAX_SCALE ? d.h : Math.min(Math.max(d.h, cellH / scale), d.h * 1.25),
  };
}

/**
 * The best grid for this many cards in one design. Up to 12 techs use the standard columns of three; the compact and lean designs (and
 * anything over 12) may pick another grid when that draws clearly bigger cards (e.g. 3 columns × 4 rows on a narrow tablet).
 */
function bestFor(count: number, width: number, height: number, d: Design): TechLayout {
  const cols = Math.max(1, Math.ceil(count / CARDS_PER_COLUMN));
  const rows = Math.max(1, Math.min(count, CARDS_PER_COLUMN));
  let best = layoutFor(cols, rows, width, height, d);
  if (count <= 4 * CARDS_PER_COLUMN && !d.compact && !d.lean) return best;
  const margin = count <= 4 * CARDS_PER_COLUMN ? 1.05 : 1 + 1e-6;
  for (let c = 2; c <= count; c++) {
    const cand = layoutFor(c, Math.ceil(count / c), width, height, d);
    if (cand.scale > best.scale * margin) best = cand;
  }
  return best;
}

export function computeTechLayout(count: number, width: number, height: number, lean = false): TechLayout {
  // `count` isn't realistically NaN from any real caller (it's always techs.length), but Math.ceil/
  // Math.max propagate NaN with no defensive fallback otherwise — matching the width/height guard below.
  if (!Number.isFinite(count) || count < 0) count = 0;
  const cols = Math.max(1, Math.ceil(count / CARDS_PER_COLUMN));
  const rows = Math.max(1, Math.min(count, CARDS_PER_COLUMN));
  if (width <= 0 || height <= 0) return { cols, rows, scale: 1, cardW: CARD_W, cardH: CARD_H, compact: false };
  const roomy = bestFor(count, width, height, lean ? ROOMY_LEAN : ROOMY);
  if (roomy.scale >= MIN_READABLE_SCALE) return roomy;
  return bestFor(count, width, height, lean ? COMPACT_LEAN : COMPACT);
}

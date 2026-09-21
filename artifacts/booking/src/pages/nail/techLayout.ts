/**
 * Techs tab layout — EVERYTHING is on screen at once, nothing scrolls (staff can't scroll this page).
 *
 * The unit is a column of up to three cards, top to bottom in turn order:
 *   1–3 techs  → one column (cards grow to fill it, capped so a lone tech isn't silly-big)
 *   4–6 techs  → two columns, 7–9 → three, 10–12 → four; each column filled before the next.
 *   More than 12 → whatever grid gives the biggest cards.
 * Cards are drawn at a design size and scaled to fit their cell. Wide cells use a "row" card
 * (tech on the left, details on the right); narrow cells use a "stack" card (tech on top).
 */
export type CardMode = "row" | "stack";

export const GAP = 12;
export const CARDS_PER_COLUMN = 3;
const MAX_SCALE = 1.7;
const DESIGN: Record<CardMode, { w: number; h: number }> = {
  row: { w: 560, h: 150 },
  stack: { w: 300, h: 200 },
};

export interface TechLayout {
  cols: number;
  rows: number;
  mode: CardMode;
  scale: number;
  /** Card size before scaling. */
  cardW: number;
  cardH: number;
}

function layoutFor(count: number, cols: number, rows: number, width: number, height: number): TechLayout {
  const cellW = (width - GAP * (cols - 1)) / cols;
  const cellH = (height - GAP * (rows - 1)) / rows;
  const fit = (mode: CardMode) => Math.min(cellW / DESIGN[mode].w, cellH / DESIGN[mode].h);
  // A single wide column always gets the wide "row" card; narrower cells take whichever design scales larger.
  const mode: CardMode = cols === 1 || fit("row") >= fit("stack") ? "row" : "stack";
  const uncapped = fit(mode);
  const scale = Math.min(MAX_SCALE, uncapped);
  const d = DESIGN[mode];
  return {
    cols, rows, mode, scale,
    cardW: cellW / scale,
    // Height-limited → the design height exactly; width-limited → use the spare height; capped → don't stretch.
    cardH: uncapped > MAX_SCALE ? d.h : Math.min(Math.max(d.h, cellH / scale), d.h * 1.5),
  };
}

export function computeTechLayout(count: number, width: number, height: number): TechLayout {
  const cols = Math.max(1, Math.ceil(count / CARDS_PER_COLUMN));
  const rows = Math.max(1, Math.min(count, CARDS_PER_COLUMN));
  if (width <= 0 || height <= 0) return { cols, rows, mode: "row", scale: 1, cardW: DESIGN.row.w, cardH: DESIGN.row.h };
  // Up to 12 techs: columns of three. A bigger team is rare — then use whatever grid makes the cards largest.
  if (count <= 4 * CARDS_PER_COLUMN) return layoutFor(count, cols, rows, width, height);
  let best = layoutFor(count, cols, rows, width, height);
  for (let c = 2; c <= count; c++) {
    const cand = layoutFor(count, c, Math.ceil(count / c), width, height);
    if (cand.scale > best.scale + 1e-6) best = cand;
  }
  return best;
}

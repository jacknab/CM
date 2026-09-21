/**
 * Fits N tech cards on the Techs tab without scrolling: few techs → big cards,
 * many techs → smaller ones. Cards are designed at BASE_W × BASE_H and scaled.
 */
export const BASE_W = 300;
export const BASE_H = 200;
export const GAP = 12;
/** Bigger than this looks silly; smaller than this stops being readable (the tab scrolls instead). */
export const MAX_SCALE = 1.7;
export const MIN_SCALE = 0.62;

export interface TechGrid {
  cols: number;
  rows: number;
  scale: number;
}

export function computeTechGrid(count: number, width: number, height: number): TechGrid {
  if (count <= 0 || width <= 0 || height <= 0) return { cols: 1, rows: 1, scale: 1 };
  let best: TechGrid = { cols: 1, rows: count, scale: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = (width - GAP * (cols - 1)) / cols;
    const cellH = (height - GAP * (rows - 1)) / rows;
    const scale = Math.min(cellW / BASE_W, cellH / BASE_H);
    // Prefer the biggest cards; on a tie prefer fewer empty slots in the last row.
    if (scale > best.scale + 1e-6 || (Math.abs(scale - best.scale) < 1e-6 && cols * rows < best.cols * best.rows)) {
      best = { cols, rows, scale };
    }
  }
  return { ...best, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, best.scale)) };
}

/**
 * The Queue / Techs card grid is designed for a 10" tablet: 4 × 4 cards of 320 × 145 px with 14 px gaps. On a bigger
 * screen (owner, 2026-10-29: "same 16 cards, bigger") the grid grows by one factor so it fills the space it has —
 * cards, text and icons alike — instead of leaving empty space beside and below it. Never smaller than the design.
 *
 * Use as a ref on the grid: `ref={gridZoomRef}`. It sets --q-zoom on the grid (nail.css uses it).
 */
const DESIGN_W = 4 * 320 + 3 * 14;
const DESIGN_H = 4 * 145 + 3 * 14;

/** The height the layout gives the grid: the first container taller than the grid (sized by the screen, not by the
 *  cards), less its padding and whatever else is stacked in it (a tab bar, page dots…). */
function availableHeight(el: HTMLElement): { height: number; frame: HTMLElement | null } {
  let path: HTMLElement = el;
  for (let a = el.parentElement; a && a !== document.body; path = a, a = a.parentElement) {
    if (a.clientHeight <= path.offsetHeight + 1) continue;
    const cs = getComputedStyle(a);
    let height = a.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const gap = parseFloat(cs.rowGap) || 0;
    let others = 0;
    for (const child of Array.from(a.children) as HTMLElement[]) {
      if (child === path || getComputedStyle(child).position === "absolute" || getComputedStyle(child).display === "none") continue;
      const m = getComputedStyle(child);
      height -= child.offsetHeight + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
      others++;
    }
    height -= gap * others;
    // The chain between the frame and the grid may itself be content-sized; its padding is part of the grid's room.
    return { height, frame: a };
  }
  return { height: el.clientHeight, frame: null };
}

export function gridZoomRef(el: HTMLElement | null): (() => void) | void {
  if (!el || typeof ResizeObserver === "undefined") return;
  let frame: HTMLElement | null = null;
  const observer = new ResizeObserver(() => apply());
  const apply = () => {
    const room = availableHeight(el);
    if (room.frame && room.frame !== frame) { frame = room.frame; observer.observe(frame); }
    // 16 px spare so a row never spills past the bottom (rounding, borders, a scroll bar).
    const zoom = Math.max(1, Math.min(el.clientWidth / DESIGN_W, (room.height - 16) / DESIGN_H));
    const next = zoom.toFixed(3);
    if (el.style.getPropertyValue("--q-zoom") !== next) el.style.setProperty("--q-zoom", next);
  };
  observer.observe(el);
  apply();
  return () => observer.disconnect();
}

/**
 * The on-screen keyboard's look on the light /nail full-page screens (client name at check-in, cancelling a serviced
 * ticket). /nail is used on touch screens only — no keyboard or mouse — so typing happens on these keys.
 * Touch targets scale with the screen height so nothing is cut off on a 10" tablet.
 */
export const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];
// Light keys on the light sheet (the same look as the Queue tab, 2026-10-29) — /nail itself runs in dark mode.
export const LIGHT = "bg-[#ffffff] border-[#d5deea] text-[#0f1f3d] shadow-[0_1px_2px_rgba(15,31,61,0.06)] active:bg-[#eef3f9]";
export const KB_KEY = `flex-1 min-w-0 h-[clamp(52px,10.5vh,88px)] rounded-lg border ${LIGHT} text-[clamp(20px,3.6vh,32px)] font-medium`;
export const KB_WIDE = "flex-[1.5] min-w-0 h-[clamp(52px,10.5vh,88px)] rounded-lg border text-[clamp(20px,3.6vh,32px)] font-medium flex items-center justify-center";
/** The light full-page background (the Queue tab's). */
export const LIGHT_PAGE_BG = "linear-gradient(180deg, #f7fafd 0%, #eef3f9 100%)";

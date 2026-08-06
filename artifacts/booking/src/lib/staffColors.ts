/**
 * Staff calendar color palette.
 * Rules: no black, no red family, no grey.
 * 20 clearly distinct hues spread across the wheel.
 */
export const STAFF_COLORS = [
  // Blues
  "#1e3a8a", // Deep Navy
  "#3b82f6", // Bright Blue
  "#0ea5e9", // Sky Blue
  "#06b6d4", // Cyan

  // Greens
  "#0f766e", // Dark Teal
  "#10b981", // Mint
  "#16a34a", // Forest Green
  "#84cc16", // Lime

  // Warm tones
  "#ca8a04", // Golden Yellow
  "#f97316", // Orange
  "#b45309", // Warm Brown / Amber

  // Pinks / Magentas
  "#db2777", // Deep Pink
  "#ec4899", // Hot Pink
  "#f472b6", // Light Pink

  // Purples
  "#d946ef", // Fuchsia / Magenta
  "#a855f7", // Purple
  "#7c3aed", // Violet
  "#4f46e5", // Indigo

  // Extra distinct
  "#0369a1", // Steel Blue
  "#15803d", // Deep Green
] as const;

export type StaffColor = typeof STAFF_COLORS[number];

/**
 * Assigns a deterministic color from STAFF_COLORS to each staff member.
 * Returns a Map<id, color> so callers can look up a color by staff ID.
 */
export function assignStaffColors(staffList: { id: number }[]): Map<number, string> {
  const map = new Map<number, string>();
  staffList.forEach((member, index) => {
    map.set(member.id, STAFF_COLORS[index % STAFF_COLORS.length]);
  });
  return map;
}

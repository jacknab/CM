/**
 * Staff calendar color palette.
 */
export const STAFF_COLORS = [
  "#FEE0F3",
  "#FEDBD5",
  "#E1FEFF",
  "#FFC7C6",
  "#FFF0E1",
  "#FFF6BA",
  "#FFD7B3",
  "#F4E9FF",
  "#E9FFF3",
  "#EEFADB",
  "#E6F4FF",
  "#FF9D93",
  "#CBEFE0",
  "#A6DBC7",
  "#FFC6BF",
  "#FADAD4",
  "#DCEBF2",
  "#FFE9E9",
  "#C1DCD9",
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

/**
 * Picks readable foreground colors for text/borders rendered on top of a given
 * background color — the STAFF_COLORS palette is all light pastels, so plain
 * white text (fine for the old dark palette) becomes unreadable.
 */
export function getContrastColors(hexBg: string): {
  isLight: boolean;
  text: string;
  textMuted: string;
  ring: string;
  avatarFallbackBg: string;
} {
  const c = hexBg.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = luminance > 0.6;

  return isLight
    ? {
        isLight,
        text: "#1f2937",           // slate-800
        textMuted: "rgba(31,41,55,0.7)",
        ring: "rgba(31,41,55,0.25)",
        avatarFallbackBg: "rgba(31,41,55,0.12)",
      }
    : {
        isLight,
        text: "#ffffff",
        textMuted: "rgba(255,255,255,0.8)",
        ring: "rgba(255,255,255,0.5)",
        avatarFallbackBg: "rgba(255,255,255,0.2)",
      };
}

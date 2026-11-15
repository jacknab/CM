/**
 * Kiosk themes (owner, 2026-11-15): ready-made kiosk configurations a business picks when it makes a new one
 * (Kiosk Builder › New kiosk configuration › Themes). A theme is a builder plus changes to Certxa's starting design
 * for the business; everything stays editable afterwards like any configuration.
 */
import type { KioskLayout } from "./layout";

export interface KioskTheme {
  key: string;
  name: string;
  about: string;
  builder: "easy" | "picture";
  apply: (base: KioskLayout) => KioskLayout;
}

export const KIOSK_THEMES: KioskTheme[] = [
  {
    key: "order-board",
    name: "Order Board",
    about: "One screen to choose everything: category tiles down the left, the category's services as big photo cards with price and time, Search Services at the top, and the client's choices with the total and Continue along the bottom.",
    builder: "easy",
    apply: (l) => ({
      ...l,
      builder: "easy",
      menuMode: "catalog",
      servicesView: "board",
      // Deep navy text and tiles, a pink accent, a gold edge on the open category (owner's picture, 2026-11-15).
      theme: { look: "classic", colors: { primary: "#d6338a", background: "#f7f7fb", surface: "#ffffff", text: "#141a33", selected: "#ffc93c" } },
    }),
  },
];

export const kioskTheme = (key: unknown): KioskTheme | null => KIOSK_THEMES.find((t) => t.key === key) ?? null;

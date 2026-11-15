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
    about: "One screen to choose everything: category buttons at the top, that category's services below, and the client's order on the right with the total and Continue. Bright and quick, like an ordering kiosk.",
    builder: "easy",
    apply: (l) => ({
      ...l,
      builder: "easy",
      menuMode: "catalog",
      servicesView: "board",
      theme: { look: "classic", colors: { primary: "#e85d2f", background: "#ffffff", surface: "#f6f3ef", text: "#1d1b1a", selected: "#ffc93c" } },
    }),
  },
];

export const kioskTheme = (key: unknown): KioskTheme | null => KIOSK_THEMES.find((t) => t.key === key) ?? null;

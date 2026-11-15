/**
 * Loads the Google Fonts a kiosk text box uses (shared/kiosk/layout.ts KIOSK_TEXT_FONTS), once per page: regular,
 * bold and italic. A kiosk with no connection shows the fallback family.
 */
import { KIOSK_TEXT_FONTS, type KioskTextFont } from "@shared/kiosk/layout";

const loaded = new Set<string>();

export function loadKioskFonts(keys: Iterable<KioskTextFont | string>): void {
  if (typeof document === "undefined") return;
  const want = [...new Set(keys)].map((k) => KIOSK_TEXT_FONTS.find((f) => f.key === k)).filter((f): f is typeof KIOSK_TEXT_FONTS[number] => !!f && !loaded.has(f.key));
  if (!want.length) return;
  for (const f of want) loaded.add(f.key);
  const families = want.map((f) => `family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:ital,wght@0,400;0,700;1,400`).join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

export const kioskFontCss = (key: string) => KIOSK_TEXT_FONTS.find((f) => f.key === key)?.css ?? "'DM Sans', sans-serif";

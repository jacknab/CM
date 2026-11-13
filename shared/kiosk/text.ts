/**
 * The kiosk words a business can change (plans/kiosk-builder.md).
 *
 * Each key names one sentence on the kiosk. Most are also built-in kiosk strings (booking/src/lib/
 * kioskTranslations.ts), which already exist in every kiosk language; the rest are kiosk-builder sentences
 * that had no translation before (their English is here). What the business writes wins; a language it
 * didn't write falls back to its English, then to the built-in text for that language.
 */

export const KIOSK_LANG_CODES = ["en", "es", "vi", "zh", "ko"] as const;
export type KioskLang = (typeof KIOSK_LANG_CODES)[number];

/** Text for one key: English and any translations. */
export type KioskText = Partial<Record<KioskLang, string>>;

export interface KioskTextKey {
  key: string;
  /** Where it shows, for the builder. */
  label: string;
  /** "{name}" stands for the client's first name. */
  placeholders?: string[];
  /** English, for keys that are not built-in kiosk strings. */
  english?: string;
  /** Longest text the screen has room for. */
  max: number;
}

export const KIOSK_TEXT_KEYS: KioskTextKey[] = [
  { key: "whatBringsYouIn", label: "Category screen, heading", placeholders: ["{name}"], max: 60 },
  { key: "whoWouldYouLike", label: "Staff screen, heading", max: 50 },
  { key: "pickStylist", label: "Staff screen, under the heading", max: 90 },
  { key: "nextAvailable", label: "Staff screen, the \"anyone\" card", max: 24 },
  { key: "autoAssign", label: "Staff screen, under the \"anyone\" card", max: 30 },
  { key: "yourStylist", label: "Review and ticket, the staff label", max: 24 },
  { key: "showQr", label: "Ticket screen, under the heading", max: 90 },
  { key: "questionLength", label: "Service question: length, heading", english: "Choose your nail length", max: 50 },
  { key: "questionShape", label: "Service question: shape, heading", english: "Choose your nail shape", max: 50 },
  { key: "questionDesign", label: "Service question: design, heading", english: "Choose your nail design", max: 50 },
  { key: "questionPlain", label: "Service question: design, the \"none\" card", english: "Plain, no design", max: 30 },
  { key: "frontDeskTitle", label: "Kiosk switched off, heading", english: "Please check in at the front desk", max: 60 },
  { key: "frontDeskSub", label: "Kiosk switched off, under the heading", english: "We'll be right with you.", max: 60 },
];

const KEYS = new Map(KIOSK_TEXT_KEYS.map((k) => [k.key, k]));

export function kioskTextKey(key: string): KioskTextKey | undefined {
  return KEYS.get(key);
}

/**
 * The words for `key` in `lang`: the business's own (that language, else its English), then the preset's
 * (same order), then `builtIn` (the kiosk's translated string), then the key's English.
 */
export function resolveKioskText(
  key: string,
  lang: KioskLang,
  layers: Array<Record<string, KioskText> | undefined>,
  builtIn?: string,
): string {
  for (const layer of layers) {
    const t = layer?.[key];
    if (!t) continue;
    const v = (t[lang] ?? "").trim() || (t.en ?? "").trim();
    // English stands in for a language that wasn't written. Presets write every language they change.
    if (v) return v;
  }
  return builtIn ?? KEYS.get(key)?.english ?? "";
}

/** Fills "{name}". */
export function fillKioskText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

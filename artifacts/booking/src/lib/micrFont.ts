/**
 * micrFont.ts — MICR E-13B font shared constants and line encoder
 *
 * This module is intentionally FREE of @react-pdf/renderer imports so it can
 * be used by both browser components (CheckLayoutEditor, PrintChecks) and the
 * PDF renderer (CheckDocumentPDF) without bundling the heavy PDF library into
 * the main chunk.
 *
 * Font: MICR E13B (Advantage Laser Products, Inc)
 * File: artifacts/booking/public/fonts/micr-e13b.ttf
 */

// ─── Font identity ─────────────────────────────────────────────────────────────
/** Registered font-family name — used in both CSS @font-face and Font.register() */
export const MICR_FONT_FAMILY = "MICR E-13B";

/**
 * Absolute URL (browser) or path (server) to the OTF font file.
 * Override with VITE_MICR_FONT_URL to point at a CDN or alternate path.
 */
export function getMicrFontUrl(): string {
  // Optional env-var override (set in .env.local on VPS)
  const envUrl = import.meta.env.VITE_MICR_FONT_URL as string | undefined;
  if (envUrl) return envUrl;
  // Default: served from the public folder of this Vite app
  if (typeof window !== "undefined") {
    return `${window.location.origin}/fonts/micr-e13b.ttf`;
  }
  return "/fonts/micr-e13b.ttf";
}

/**
 * CSS font-family value when the MICR font is unavailable in the browser.
 * Courier New is a visually acceptable placeholder — it is NEVER used in PDFs.
 */
export const MICR_FALLBACK_CSS = "'Courier New', Courier, monospace";

// ─── E-13B character constants (Unicode 1.1, block U+2440–U+244F) ─────────────
/**
 * The 14 MICR E-13B characters.  All are in the "Optical Character Recognition"
 * Unicode block.  GnuMICR maps these code points to the correct E-13B glyphs.
 */
export const MICR_CHAR = {
  /** ⑆ U+2446 — Transit / Routing-number delimiter (surrounds the ABA routing number) */
  TRANSIT: "\u2446",
  /** ⑇ U+2447 — Amount symbol (follows the on-us / account field) */
  AMOUNT:  "\u2447",
  /** ⑈ U+2448 — On-us symbol (account number delimiter) */
  ONUS:    "\u2448",
  /** ⑉ U+2449 — Dash (used inside account numbers that contain a hyphen) */
  DASH:    "\u2449",
} as const;

// ─── MICR line encoder ─────────────────────────────────────────────────────────

/** Normalised MICR fields, each guaranteed to contain only digits. */
export interface MicrFields {
  routing:  string;   // exactly 9 digits
  account:  string;   // 10 digits (padded / truncated)
  checkNum: string;   // 4 digits (left-padded)
}

/** Strip non-digits and pad/truncate each field to its standard width. */
export function normalizeMicrFields(
  routing: string,
  account: string,
  checkNum: string,
): MicrFields {
  return {
    routing:  routing.replace(/\D/g,  "").padEnd(9,  "0").slice(0, 9),
    account:  account.replace(/\D/g,  "").padEnd(10, "0").slice(0, 10),
    checkNum: checkNum.replace(/\D/g, "").padStart(4, "0").slice(-4),
  };
}

/**
 * Build the complete MICR line string using E-13B symbols.
 *
 * Standard US personal / payroll check layout (ANSI X9.27 / ABA):
 *
 *   ⑆ routing ⑆  ⑆ account ⑆⑇  checkNum ⑆
 *
 * The returned string MUST be rendered with the MICR E-13B font.
 * Using Courier New with this string produces a visually similar but
 * bank-scanner-incompatible result.
 */
export function buildMicrLine(
  routing: string,
  account: string,
  checkNum: string,
): string {
  const { r, a, c } = (() => {
    const f = normalizeMicrFields(routing, account, checkNum);
    return { r: f.routing, a: f.account, c: f.checkNum };
  })();
  const T = MICR_CHAR.TRANSIT;
  const A = MICR_CHAR.AMOUNT;
  return `${T}${r}${T}  ${T}${a}${T}${A}  ${c}${T}`;
}

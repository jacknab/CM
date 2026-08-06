/**
 * micrFontPdf.ts — @react-pdf/renderer MICR font registration
 *
 * Import this module (or call registerMicrFont()) before rendering any PDF
 * document that includes a MICR line.  It is intentionally separate from
 * micrFont.ts so the @react-pdf/renderer bundle is only pulled in by the
 * PDF code path, not by the browser editor components.
 *
 * Font: GnuMICR (Steve Sandeen, GPL-2.0-or-later)
 * Install: bash scripts/setup-micr-font.sh
 * Docs:    artifacts/booking/MICR_FONT.md
 */
import { Font } from "@react-pdf/renderer";
import { MICR_FONT_FAMILY, getMicrFontUrl } from "./micrFont";

// ─── State ────────────────────────────────────────────────────────────────────
let _registered = false;
let _registrationError: string | null = null;

// ─── Registration ─────────────────────────────────────────────────────────────
/**
 * Register the MICR E-13B font with @react-pdf/renderer.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * The font file is fetched from getMicrFontUrl() at PDF-generation time.
 * If the file is missing, the PDF library will throw a clear error during
 * rendering — it will NEVER silently substitute Courier or any other font.
 *
 * @throws nothing synchronously; fetch errors surface during PDF render
 */
export function registerMicrFont(): void {
  if (_registered) return;
  try {
    const src = getMicrFontUrl();
    Font.register({
      family: MICR_FONT_FAMILY,
      src,
    });
    _registered = true;
    if (typeof console !== "undefined") {
      console.info(`[micrFontPdf] Registered "${MICR_FONT_FAMILY}" ← ${src}`);
    }
  } catch (err) {
    _registrationError = String(err);
    console.error("[micrFontPdf] Font.register failed:", err);
  }
}

/** Returns true after a successful Font.register() call. */
export function isMicrFontRegistered(): boolean {
  return _registered;
}

/** Returns the synchronous registration error, if any (font-fetch errors are async). */
export function getMicrRegistrationError(): string | null {
  return _registrationError;
}

// Auto-register when this module is imported (side-effect).
// CheckDocumentPDF.tsx imports this module, which triggers registration
// before the first PDF render.
registerMicrFont();

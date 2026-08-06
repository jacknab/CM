/**
 * useMicrFont — React hook for loading the MICR E-13B font in browser components.
 *
 * Injects an @font-face rule and checks availability with the FontFace API.
 * If the font file is not installed (404), falls back to Courier New and sets
 * isFallback=true so the UI can display a "preview-only" warning.
 *
 * Usage:
 *   const micr = useMicrFont();
 *   // micr.fontFamily  — CSS font-family string (MICR font or Courier fallback)
 *   // micr.isLoaded    — true when the real E-13B font is available
 *   // micr.isFallback  — true when Courier New is being used
 *   // micr.isChecking  — true while the check is still running
 */
import { useState, useEffect } from "react";
import { MICR_FONT_FAMILY, MICR_FALLBACK_CSS, getMicrFontUrl } from "@/lib/micrFont";

const STYLE_ID = "certxa-micr-font-face";

/** Inject the @font-face rule once into <head>. */
function injectFontFace(url: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // font-display:block tells the browser to render invisible text while loading,
  // then swap to the real font — this avoids a FOUT (flash of unstyled text).
  style.textContent = `
    @font-face {
      font-family: '${MICR_FONT_FAMILY}';
      src: url('${url}') format('truetype');
      font-weight: normal;
      font-style:  normal;
      font-display: block;
    }
    /* Hide the MICR font warning badge when printing */
    @media print { .certxa-micr-warn { display: none !important; } }
  `;
  document.head.appendChild(style);
}

export interface MicrFontState {
  /** CSS font-family to pass to the MICR line element. */
  fontFamily: string;
  /** True when the MICR E-13B font loaded successfully. */
  isLoaded: boolean;
  /** True when Courier New is the active fallback. */
  isFallback: boolean;
  /** True while the FontFace load promise is still pending. */
  isChecking: boolean;
}

export function useMicrFont(): MicrFontState {
  const [state, setState] = useState<MicrFontState>({
    fontFamily: MICR_FALLBACK_CSS,
    isLoaded:   false,
    isFallback: true,
    isChecking: true,
  });

  useEffect(() => {
    let cancelled = false;
    const url = getMicrFontUrl();

    async function load() {
      injectFontFace(url);
      try {
        // FontFace constructor rejects if the file returns 4xx/5xx or is not a valid font.
        const ff = new FontFace(MICR_FONT_FAMILY, `url('${url}') format('truetype')`);
        await ff.load();
        // Add to the document's FontFaceSet so CSS can use it immediately.
        document.fonts.add(ff);
        if (!cancelled) {
          setState({
            fontFamily: `'${MICR_FONT_FAMILY}', ${MICR_FALLBACK_CSS}`,
            isLoaded:   true,
            isFallback: false,
            isChecking: false,
          });
        }
      } catch {
        // Font not installed — stay on Courier New, show warning.
        if (!cancelled) {
          setState({
            fontFamily: MICR_FALLBACK_CSS,
            isLoaded:   false,
            isFallback: true,
            isChecking: false,
          });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}

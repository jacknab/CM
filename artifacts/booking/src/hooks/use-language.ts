import { useEffect, useState } from "react";
import { useCalendarSettings } from "./use-calendar-settings";

/** On the /nail screens the tablet's own choice (MORE → Language, kept by pages/nail/i18n.ts) wins over the salon's
 *  language, so shared sheets that carry their own Vietnamese / Spanish (the Turn popup, its sheets…) follow it too
 *  (owner, 2026-10-24). Everywhere else: the salon's language. */
const NAIL_LANG_KEY = "certxa.nail.lang";
function nailTabletLanguage(): string | null {
  if (typeof window === "undefined" || !/^\/nail(\/|$)/.test(window.location.pathname)) return null;
  try { const v = localStorage.getItem(NAIL_LANG_KEY); return v === "en" || v === "vi" || v === "es" || v === "fr" ? v : null; } catch { return null; }
}

export function useLanguage() {
  const { data: calSettings } = useCalendarSettings();
  // Re-render when the tablet's /nail language is switched.
  const [nailLang, setNailLang] = useState<string | null>(() => nailTabletLanguage());
  useEffect(() => {
    const onChange = () => setNailLang(nailTabletLanguage());
    window.addEventListener("certxa-nail-lang", onChange);
    return () => window.removeEventListener("certxa-nail-lang", onChange);
  }, []);
  // Default to "en" if no calendar settings data exists
  const language = (nailLang ?? (calSettings as any)?.language ?? "en").toLowerCase();
  const isVi = language === "vi";
  const isEs = language === "es";
  const isFr = language === "fr";

  function pick<T>(map: { en: T; vi: T; es: T; fr: T }): T {
    // Safely pick the language, falling back to "en" if the key doesn't exist
    const langMap: Record<string, T> = { en: map.en, vi: map.vi, es: map.es, fr: map.fr };
    return langMap[language] ?? map.en;
  }

  return { language, isVi, isEs, isFr, pick };
}

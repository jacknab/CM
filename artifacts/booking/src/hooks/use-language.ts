import { useCalendarSettings } from "./use-calendar-settings";

export function useLanguage() {
  const { data: calSettings } = useCalendarSettings();
  // Default to "en" if no calendar settings data exists
  const language = ((calSettings as any)?.language ?? "en").toLowerCase();
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

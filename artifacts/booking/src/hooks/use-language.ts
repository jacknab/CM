import { useCalendarSettings } from "./use-calendar-settings";

export function useLanguage() {
  const { data: calSettings } = useCalendarSettings();
  const language = (calSettings as any)?.language ?? "en";
  const isVi = language === "vi";
  const isEs = language === "es";
  const isFr = language === "fr";

  function pick<T>(map: { en: T; vi: T; es: T; fr: T }): T {
    return (map[language as keyof typeof map] ?? map.en);
  }

  return { language, isVi, isEs, isFr, pick };
}

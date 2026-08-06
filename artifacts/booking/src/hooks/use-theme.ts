import { useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "theme-preference";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === "dark" || stored === "light") {
      setThemeState(stored);
    } else {
      // Default to light — write it so subsequent loads are instant
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      setThemeState("light");
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [theme, mounted]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, mounted };
}

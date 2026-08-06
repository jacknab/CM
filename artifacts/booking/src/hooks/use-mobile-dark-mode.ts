import { useEffect } from "react";

const MOBILE_BREAKPOINT = 768; // px — matches Tailwind's `md:`

function applyMobileDark() {
  if (window.innerWidth < MOBILE_BREAKPOINT) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

/**
 * Forces the app into dark mode whenever the viewport is mobile-width.
 * No toggle, no user preference — always dark on phones.
 */
export function useMobileDarkMode() {
  useEffect(() => {
    // Apply immediately on mount
    applyMobileDark();

    // Re-evaluate on resize (e.g. rotate, or DevTools resize)
    window.addEventListener("resize", applyMobileDark, { passive: true });
    return () => window.removeEventListener("resize", applyMobileDark);
  }, []);
}

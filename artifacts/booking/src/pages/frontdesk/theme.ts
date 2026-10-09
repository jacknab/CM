/**
 * Colour scheme of the customer-facing /frontdesk screen.
 *
 * Every colour on that screen is a CSS variable whose fallback is the default (salon) palette, so a
 * store with no theme renders exactly as before. A themed store sets the variables on <html>.
 */
const BARBER_THEME: Record<string, string> = {
  "--fd-bg": "#e9edf2",
  "--fd-surface": "#ffffff",
  "--fd-primary": "#1d3557",
  "--fd-primary-d": "#14263f",
  "--fd-primary-s": "#e4eaf1",
  "--fd-primary-tint": "rgba(29,53,87,0.09)",
  "--fd-border": "#cfd7e1",
  "--fd-shadow": "0 2px 8px rgba(15,30,55,0.09), 0 1px 3px rgba(0,0,0,0.06)",
  "--fd-shadow-lg": "0 8px 32px rgba(15,30,55,0.14), 0 2px 8px rgba(0,0,0,0.07)",
  "--fd-text": "#0d1520",
  "--fd-muted": "#4f5b6b",
  "--fd-subtle": "#8591a1",
  "--fd-placeholder": "#b4bdc9",
  // second colour of the accent gradients (icon discs, the tap-card illustration)
  "--fd-accent": "#4d6b8f",
  "--fd-accent-tint": "rgba(77,107,143,0.07)",
  "--fd-accent-glow": "rgba(77,107,143,0.12)",
  "--fd-primary-glow": "rgba(29,53,87,0.09)",
  "--fd-accent-shadow": "rgba(13,21,32,0.45)",
  // the full-height checkout panel and what sits on it
  "--fd-panel-end": "#0a1322",
  "--fd-panel-veil": "rgba(4,9,18,0.5)",
  "--fd-panel-shadow": "rgba(0,0,0,0.5)",
  "--fd-soft-end": "#e4eaf1",
  "--fd-orb-a": "#5f7ea6",
  "--fd-orb-b": "#2d4a73",
  "--fd-orb-c": "#8aa0bd",
  "--fd-card-text": "#f3f6fa",
  "--fd-card-text-shadow": "0 1px 2px rgba(0,0,0,0.45)",
  "--fd-card-depth": "rgba(0,0,0,0.30)",
  "--fd-card-drop": "rgba(0,0,0,0.38)",
  "--fd-badge-end": "#d5dde8",
  "--fd-badge-edge": "rgba(10,19,34,0.55)",
  "--fd-bar-track": "rgba(0,0,0,0.38)",
  "--fd-btn-on-text": "#0d1520",
  "--fd-btn-off-text": "rgba(243,246,250,0.55)",
  "--fd-btn-done-bg": "rgba(255,255,255,0.16)",
};

/** The theme for a store's business type — null means the default palette. */
export function frontdeskTheme(category?: string | null): Record<string, string> | null {
  return /barber/i.test(category ?? "") ? BARBER_THEME : null;
}

/** Apply a theme to the page; returns the undo. */
export function applyFrontdeskTheme(theme: Record<string, string> | null): () => void {
  if (!theme) return () => {};
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme)) root.style.setProperty(name, value);
  return () => { for (const name of Object.keys(theme)) root.style.removeProperty(name); };
}

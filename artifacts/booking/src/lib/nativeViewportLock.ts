/**
 * Inside the Certxa Android app (window.CERTXA_NATIVE_APP, set by the WebView bridge) the page
 * must never zoom or drift: no pinch zoom, no double-tap zoom, no sideways panning.
 *
 * Tablets render the desktop layout at a fixed 1280 CSS px width, so the viewport scale is
 * pinned to screenWidth/1280 (max 1) — the page fits the screen exactly and cannot be dragged.
 */
const TABLET_LAYOUT_WIDTH = 1280;
const TABLET_MIN_SCREEN_WIDTH = 768;

/** The viewport meta content for a given screen width (CSS px). Pure — unit-testable. */
export function nativeViewportContent(screenWidth: number): string {
  if (screenWidth >= TABLET_MIN_SCREEN_WIDTH) {
    const s = Math.min(1, screenWidth / TABLET_LAYOUT_WIDTH);
    const scale = (Math.round(s * 10000) / 10000).toString();
    return `width=${TABLET_LAYOUT_WIDTH}, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}, user-scalable=no`;
  }
  return "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no";
}

export function installNativeViewportLock(): void {
  if (typeof window === "undefined" || !(window as any).CERTXA_NATIVE_APP) return;
  document.documentElement.classList.add("native-app");

  const apply = () => {
    let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", nativeViewportContent(window.screen?.width || window.innerWidth));
  };
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);

  // Belt and braces: block pinch gestures (two fingers). Single taps are never touched, so
  // rapid keypad taps still all register.
  const block = (e: Event) => e.preventDefault();
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, block, { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
}

/**
 * A tab (or kiosk / POS tablet) that stayed open across a deploy still runs the old build, and its
 * lazy-loaded pages point at hashed /assets files that a later deploy may have removed. Opening one
 * then fails with "Failed to fetch dynamically imported module". The fix is simply the new build:
 * reload once and the fresh index.html (never cached — see public/sw.js) brings the right files.
 *
 * Guarded so a real outage can't cause a reload loop: at most one automatic reload per minute, and
 * never while offline (reloading wouldn't help — the offline page would take over).
 */
const KEY = "certxa_stale_build_reload_at";
const MIN_GAP_MS = 60_000;

export function isStaleChunkError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
}

/** Reload to pick up the current build. Returns false (and does nothing) when it just did, or when offline. */
export function reloadForNewBuild(): boolean {
  if (typeof window === "undefined" || navigator.onLine === false) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < MIN_GAP_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // no session storage → can't guard against a loop, so don't auto-reload
  }
  reloading = true;
  window.location.reload();
  return true;
}

let reloading = false;
/** True once a reload onto the new build has started. While Vite's preload error is cancelled for that reload, the
 *  lazy page resolves to nothing and React throws "reading 'default'" — that is the reload, not a bug to show or log. */
export function isReloadingForNewBuild(): boolean {
  return reloading;
}

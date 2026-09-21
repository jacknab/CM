/**
 * The in-app equivalent of Ctrl + Shift + R. A web page can't press keys for the browser, so this does
 * what the shortcut does: throw away the service worker and every cached copy of the app, then load
 * the page fresh from the server (the changing `_hr` value makes the browser skip its HTTP cache too).
 * Nothing the user saved on this device (station pairing, drawer, login) is touched.
 */
export async function hardRefresh(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* no service worker support */ }
  try {
    const keys = (await window.caches?.keys?.()) ?? [];
    await Promise.all(keys.map((k) => window.caches.delete(k)));
  } catch { /* no Cache Storage */ }
  const url = new URL(window.location.href);
  url.searchParams.set("_hr", String(Date.now()));
  window.location.replace(url.toString());
}

/** Drop the `_hr` marker from the address bar once the fresh page has loaded. */
export function cleanHardRefreshParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_hr")) return;
    url.searchParams.delete("_hr");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch { /* cosmetic only */ }
}

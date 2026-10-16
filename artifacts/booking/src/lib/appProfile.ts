/**
 * Which Certxa app this page is running in (shared/appProfiles.ts), or none for the full Certxa web app.
 *
 * The Android shell sets window.__CERTXA_APP_PROFILE__ before the page loads. `?app=<id>` on any address
 * does the same (for testing in a browser), and `?app=none` turns it off. The answer is kept on the
 * device, so it survives the app moving between pages and a restart with no network.
 */
import { APP_PAGE_FOR, getAppProfile, type AppProfile } from "@shared/appProfiles";

const KEY = "certxa.appProfile";

function detect(): string | null {
  if (typeof window === "undefined") return null;
  const fromShell = (window as any).__CERTXA_APP_PROFILE__ as string | undefined;
  const fromUrl = new URLSearchParams(window.location.search).get("app");
  try {
    if (fromUrl === "none") { localStorage.removeItem(KEY); return null; }
    const id = fromShell || fromUrl;
    if (id && getAppProfile(id)) { localStorage.setItem(KEY, id); return id; }
    return localStorage.getItem(KEY);
  } catch {
    return fromShell || fromUrl || null;
  }
}

let cached: AppProfile | null | undefined;

/** The app this page runs in, or null for the full Certxa web app. */
export function currentAppProfile(): AppProfile | null {
  if (cached === undefined) cached = getAppProfile(detect());
  return cached;
}

/**
 * Where a staff screen's link to a full-platform page should go: the app's own version inside an app
 * (Settings → /app/settings), the page itself otherwise.
 */
export function appPage(path: string): string {
  return currentAppProfile() ? APP_PAGE_FOR[path] ?? path : path;
}

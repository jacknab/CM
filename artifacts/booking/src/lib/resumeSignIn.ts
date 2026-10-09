/**
 * Recovering from a lost sign-in.
 *
 * Any request the app makes that comes back 401 is reported here (`reportUnauthorized`). On a signed-in
 * page (`SignedOutRecovery` in App.tsx listens) that means this device is no longer signed in to the
 * salon's account, so `resumeOrSignIn` asks the server to sign it back in as a remembered device
 * (POST /api/auth/resume, see api-server auth.ts) and reloads; if the server can't, it goes to the
 * sign-in page and comes back to `returnTo` afterwards.
 *
 * Guards: one attempt a minute at most, so a page that keeps getting 401s after signing back in ends at
 * the sign-in page instead of reloading for ever; and when the server says the device IS signed in
 * (`resumed: false` — the 401 was about something else, such as a page this login may not use), nothing
 * happens at all.
 */
const LAST_TRY_KEY = "certxa.resumeSignIn.at";
export const UNAUTHORIZED_EVENT = "certxa:unauthorized";
let running = false;
let signedInAnyway = 0;

/** Called by the request helpers for every 401. Logins and the support / admin consoles look after themselves. */
export function reportUnauthorized(url: string): void {
  if (typeof window === "undefined") return;
  let path = url;
  try { path = new URL(url, window.location.origin).pathname; } catch { /* keep as given */ }
  if (!path.startsWith("/api/") || /^\/api\/(auth|support|isteam|isadmin|admin|staff-auth|public)\//.test(path)) return;
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { path } }));
}

export async function resumeOrSignIn(returnTo: string): Promise<void> {
  if (running || Date.now() - signedInAnyway < 60_000) return;
  running = true;
  const signInUrl = `/auth?redirect=${encodeURIComponent(returnTo)}`;
  let triedRecently = false;
  try { triedRecently = Date.now() - Number(sessionStorage.getItem(LAST_TRY_KEY) || 0) < 60_000; } catch { /* private mode */ }
  try {
    const res = await fetch("/api/auth/resume", { method: "POST", credentials: "include" });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      // Already signed in: the 401 was not about a lost sign-in. Leave the page alone.
      if (body?.resumed === false) { signedInAnyway = Date.now(); running = false; return; }
      // Signed back in. Reload once; if that was already done a moment ago and requests still fail, sign in by hand.
      if (triedRecently) { window.location.assign(signInUrl); return; }
      try { sessionStorage.setItem(LAST_TRY_KEY, String(Date.now())); } catch { /* private mode */ }
      window.location.reload();
      return;
    }
    if (res.status !== 401) { running = false; return; } // server trouble, not a lost sign-in: don't bounce the page
  } catch {
    running = false; // offline or server unreachable: the offline banner covers it
    return;
  }
  window.location.assign(signInUrl);
}

/**
 * Reads the certxa.sid session cookie out of the WebView's cookie jar
 * so the app's own fetch() calls to your backend can authenticate as
 * the same logged-in session — no separate mobile login needed.
 *
 * Confirmed from your codebase: the backend routes live on the SAME
 * domain as the site itself (certxa.com/api/...), so there's no
 * cross-domain cookie concern here — CookieManager.get() just reads
 * back what the WebView already has for this origin.
 *
 * Requires:
 *   - `@react-native-cookies/cookies` installed (see package.json)
 *   - The WebView rendering certxa.com/auth has `sharedCookiesEnabled`
 *     set (see App.tsx) so cookies set during login are visible to the
 *     native CookieManager, not just inside the WebView's own jar.
 */
import CookieManager from '@react-native-cookies/cookies';

const SITE_ORIGIN = 'https://certxa.com';
const SESSION_COOKIE_NAME = 'certxa.sid';

export async function getSessionCookieHeader(): Promise<string> {
  const cookies = await CookieManager.get(SITE_ORIGIN);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];

  if (!sessionCookie) {
    throw new Error(
      'No certxa.sid cookie found — the user needs to be logged in via the WebView before this can work'
    );
  }

  // CookieManager gives us the cookie's value already decoded; rebuild
  // the raw "name=value" pair fetch() needs in a Cookie header.
  return `${SESSION_COOKIE_NAME}=${sessionCookie.value}`;
}

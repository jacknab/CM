/**
 * Stripe Terminal requires a "connection token" minted by YOUR backend
 * (never generate this in the app — it must call Stripe's
 * POST /v1/terminal/connection_tokens with your SECRET key server-side).
 *
 * This hits the real, already-existing route confirmed from your
 * codebase: POST /api/payments/terminal/connection-token in
 * routes/stripeConnect.ts, which calls createTerminalConnectionToken().
 *
 * Auth: the app forwards the same certxa.sid session cookie the WebView
 * is already using (see sessionCookie.ts) — the backend resolves which
 * connected account that session owns and scopes the token to it. The
 * app never tells the backend which account it wants.
 */
import { getSessionCookieHeader } from './sessionCookie';
import { BACKEND_BASE_URL } from './backendConfig';

export async function fetchConnectionToken(): Promise<string> {
  const cookieHeader = await getSessionCookieHeader();

  const response = await fetch(`${BACKEND_BASE_URL}/terminal/connection-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch connection token: ${response.status}`);
  }

  const { secret } = await response.json();
  return secret;
}

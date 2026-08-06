/**
 * Tracks the Stripe Terminal Location ID for the currently-active
 * client, set via the SET_ACCOUNT message from the web page.
 *
 * We do NOT track a connected-account ID client-side anymore. The
 * backend resolves that entirely from the session cookie (see
 * backend/src/middleware/auth.js) — the app never gets to claim which
 * account it's charging, which closes off a whole class of "client
 * lies about its account" bugs/attacks.
 *
 * A plain module-level variable is enough here since there's only ever
 * one active WebView/session in this app.
 */
let currentLocationId: string | null = null;

export function setCurrentLocationId(locationId: string) {
  currentLocationId = locationId;
}

export function getCurrentLocationId(): string | null {
  return currentLocationId;
}

/**
 * JWT session storage for the certxa-solo app (see solo-mobile.ts / soloAuth.ts
 * on the API). Replaces certxa-owner's WebView-cookie session-ready gate
 * (lib/terminalBridge.ts) with an equivalent gate keyed on "do we have a
 * stored token", so StripeTerminalProvider's tokenProvider (in _layout.tsx)
 * never fires before the user is logged in.
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'certxa_solo_token';

let _token: string | null = null;
let _ready = false;
const _waiters: Array<() => void> = [];
const _subscribers: Array<() => void> = [];
const _sessionSubscribers = new Set<(ready: boolean) => void>();

function publishSessionState(): void {
  _sessionSubscribers.forEach((fn) => fn(_ready));
}

function markReady(): void {
  if (_ready) return;
  _ready = true;
  _waiters.splice(0).forEach((fn) => fn());
  _subscribers.forEach((fn) => fn());
  publishSessionState();
}

/** Synchronous accessor for the in-memory token — used by every API call. */
export function getToken(): string | null {
  return _token;
}

export function isSessionReady(): boolean {
  return _ready;
}

/** Resolves once a token is available (already stored, or set via setToken). */
export function waitForSessionReady(): Promise<void> {
  if (_ready) return Promise.resolve();
  return new Promise<void>((resolve) => {
    _waiters.push(resolve);
  });
}

/** Fires once, the first time a session becomes ready. */
export function subscribeToSessionReady(cb: () => void): () => void {
  if (_ready) {
    setTimeout(cb, 0);
    return () => {};
  }
  _subscribers.push(cb);
  return () => {
    const idx = _subscribers.indexOf(cb);
    if (idx !== -1) _subscribers.splice(idx, 1);
  };
}

/** Fires whenever authentication changes, including logout and expired tokens. */
export function subscribeToSession(cb: (ready: boolean) => void): () => void {
  _sessionSubscribers.add(cb);
  return () => _sessionSubscribers.delete(cb);
}

/** Called once at app start to restore a previous login from SecureStore. */
export async function bootstrapSession(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  if (stored) {
    _token = stored;
    markReady();
    return true;
  }
  return false;
}

/** Called after a successful POST /api/solo/login. */
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  _token = token;
  markReady();
}

/** Called on logout, or automatically on a 401 from the API. */
export async function clearToken(): Promise<void> {
  _token = null;
  _ready = false;
  publishSessionState();
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

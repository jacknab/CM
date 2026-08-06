/**
 * terminalBridge.ts
 *
 * Module-level singletons that connect:
 *   1. StripeTerminalProvider (in _layout.tsx) — needs a tokenProvider function
 *   2. Portal screen (index.tsx) — has the authenticated WebView
 *
 * The portal screen registers `apiCaller.call` once its WebView is ready.
 * StripeTerminalProvider's tokenProvider calls apiCaller.call, which proxies
 * the authenticated fetch through the WebView session cookie.
 *
 * Session-ready gate:
 *   index.tsx calls notifySessionReady() once it detects the user has
 *   navigated past the login page.  The tokenProvider in _layout.tsx awaits
 *   this signal before attempting the connection-token fetch, so it never
 *   sees a "No store found" / 401 error from an unauthenticated session,
 *   which would permanently fail the one-shot SDK initialization.
 */

type ApiCallerFn = (endpoint: string, method: string, body?: any) => Promise<any>;

/** Set by index.tsx once the WebView is mounted and the bridge JS is injected. */
export const apiCaller: { call: ApiCallerFn } = {
  call: async () => {
    throw new Error('Terminal bridge not ready — WebView not yet mounted');
  },
};

// ── Session-ready gate ─────────────────────────────────────────────────────────

let _sessionReady = false;
const _sessionWaiters:    Array<() => void> = [];
const _sessionSubscribers: Array<() => void> = [];

/** Returns true if the WebView session is authenticated. */
export function isSessionReady(): boolean {
  return _sessionReady;
}

/**
 * Called by index.tsx when the WebView navigates to an authenticated page.
 * Resolves all pending waitForSessionReady() Promises and fires subscribers.
 */
export function notifySessionReady(): void {
  if (_sessionReady) return;
  _sessionReady = true;
  console.log(
    '[terminalBridge] Session ready — notifying',
    _sessionWaiters.length, 'waiters,',
    _sessionSubscribers.length, 'subscribers',
  );
  // Resolve one-shot waiters (tokenProvider await)
  _sessionWaiters.splice(0).forEach(fn => fn());
  // Notify persistent subscribers (_layout.tsx reinit check)
  _sessionSubscribers.forEach(fn => fn());
}

/**
 * Returns a Promise that resolves when the session is authenticated.
 * If the session is already ready, resolves immediately.
 */
export function waitForSessionReady(): Promise<void> {
  if (_sessionReady) return Promise.resolve();
  return new Promise<void>(resolve => {
    _sessionWaiters.push(resolve);
  });
}

/**
 * Subscribe to session-ready events.  The callback fires once when the session
 * becomes ready.  Returns an unsubscribe function.
 * Used by _layout.tsx to trigger a safety re-initialization check.
 */
export function subscribeToSessionReady(cb: () => void): () => void {
  if (_sessionReady) {
    // Already ready — fire immediately (async so caller can finish setup first)
    setTimeout(cb, 0);
    return () => {};
  }
  _sessionSubscribers.push(cb);
  return () => {
    const idx = _sessionSubscribers.indexOf(cb);
    if (idx !== -1) _sessionSubscribers.splice(idx, 1);
  };
}

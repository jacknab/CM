/**
 * Short-lived bearer tokens issued to the native Certxa Terminal app.
 *
 * Flow:
 *  1. User logs in via WebView (session cookie set by Express).
 *  2. Injected JS calls POST /api/auth/mobile-token (with session cookie → server reads session).
 *  3. Server creates a token here, returns it.
 *  4. Native app stores token in SecureStore, sends as Authorization: Bearer <token>.
 *  5. resolveSessionStoreId() checks this token before falling back to session cookie.
 *
 * Tokens live in memory only — they expire after 24 h and are wiped on server restart.
 * (This is intentional: the terminal app re-auths via WebView if the server restarts.)
 */

import crypto from "crypto";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface MobileTokenData {
  userId: string;   // user UUID or "staff:<id>"
  storeId: number;
  createdAt: number;
}

const store = new Map<string, MobileTokenData>();

// Clean up expired tokens once per hour so the Map never grows unboundedly.
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of store.entries()) {
    if (now - data.createdAt > TOKEN_TTL_MS) store.delete(token);
  }
}, 60 * 60 * 1000).unref();

export function createMobileToken(userId: string, storeId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  store.set(token, { userId, storeId, createdAt: Date.now() });
  return token;
}

export function validateMobileToken(
  token: string
): { userId: string; storeId: number } | null {
  const data = store.get(token);
  if (!data) return null;
  if (Date.now() - data.createdAt > TOKEN_TTL_MS) {
    store.delete(token);
    return null;
  }
  return { userId: data.userId, storeId: data.storeId };
}

export function revokeMobileToken(token: string): void {
  store.delete(token);
}

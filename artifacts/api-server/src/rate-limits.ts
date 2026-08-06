/**
 * Centralised in-memory rate-limit state for Google Business Profile OAuth endpoints.
 *
 * Exporting the maps + helpers here lets any route file share the same
 * counters and lets the admin API inspect / reset them without duplicating logic.
 */

// ─── Google Business Connect (/api/google-business/connect + /auth-url) ──────
export const OAUTH_WINDOW_MS    = 15 * 60 * 1000; // 15 minutes
export const OAUTH_MAX_ATTEMPTS = 5;
export const oauthConnectAttempts = new Map<number, { count: number; windowStart: number }>();

export function checkOAuthRateLimit(userId: number): { allowed: boolean; retryAfterSecs: number } {
  const now   = Date.now();
  const entry = oauthConnectAttempts.get(userId);
  if (!entry || now - entry.windowStart > OAUTH_WINDOW_MS) {
    oauthConnectAttempts.set(userId, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSecs: 0 };
  }
  if (entry.count >= OAUTH_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSecs: Math.ceil((OAUTH_WINDOW_MS - (now - entry.windowStart)) / 1000) };
  }
  entry.count++;
  return { allowed: true, retryAfterSecs: 0 };
}

// ─── Google Business Sync Reviews (/api/google-business/sync-reviews) ────────
export const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
export const syncCooldowns = new Map<number, number>();

// ─── Admin helpers ────────────────────────────────────────────────────────────

export type RateLimitCategory = "oauth_connect" | "sync_reviews";

export interface RateLimitEntry {
  key: string;
  count: number | null;
  windowStartMs: number | null;
  lastActivityMs: number | null;
  expiresInSecs: number;
  blocked: boolean;
}

export interface RateLimitSnapshot {
  category: RateLimitCategory;
  label: string;
  windowMs: number;
  maxAttempts: number | null;
  entries: RateLimitEntry[];
}

function secsLeft(windowMs: number, windowStart: number): number {
  return Math.max(0, Math.ceil((windowMs - (Date.now() - windowStart)) / 1000));
}

export function getRateLimitSnapshot(): RateLimitSnapshot[] {
  const now = Date.now();

  const connectEntries: RateLimitEntry[] = [];
  for (const [userId, e] of oauthConnectAttempts) {
    const active = now - e.windowStart < OAUTH_WINDOW_MS;
    if (!active) continue;
    connectEntries.push({
      key: String(userId),
      count: e.count,
      windowStartMs: e.windowStart,
      lastActivityMs: null,
      expiresInSecs: secsLeft(OAUTH_WINDOW_MS, e.windowStart),
      blocked: e.count >= OAUTH_MAX_ATTEMPTS,
    });
  }

  const syncEntries: RateLimitEntry[] = [];
  for (const [storeId, lastMs] of syncCooldowns) {
    const active = now - lastMs < SYNC_COOLDOWN_MS;
    if (!active) continue;
    syncEntries.push({
      key: String(storeId),
      count: null,
      windowStartMs: null,
      lastActivityMs: lastMs,
      expiresInSecs: secsLeft(SYNC_COOLDOWN_MS, lastMs),
      blocked: true,
    });
  }

  return [
    { category: "oauth_connect", label: "Business Profile Connect (per user)", windowMs: OAUTH_WINDOW_MS,   maxAttempts: OAUTH_MAX_ATTEMPTS, entries: connectEntries },
    { category: "sync_reviews",  label: "Reviews Sync (per store)",            windowMs: SYNC_COOLDOWN_MS,  maxAttempts: null,               entries: syncEntries },
  ];
}

export function clearRateLimitEntry(category: RateLimitCategory, key: string): boolean {
  switch (category) {
    case "oauth_connect":
      return oauthConnectAttempts.delete(Number(key));
    case "sync_reviews":
      return syncCooldowns.delete(Number(key));
    default:
      return false;
  }
}

export function clearAllRateLimits(category?: RateLimitCategory): void {
  if (!category || category === "oauth_connect") oauthConnectAttempts.clear();
  if (!category || category === "sync_reviews")  syncCooldowns.clear();
}

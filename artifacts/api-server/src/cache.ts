/**
 * server/cache.ts — In-process TTL cache for Certxa SalonOS
 *
 * Provides a lightweight, Redis-compatible interface backed by a Map.
 * When the app scales to multiple processes, swap the internals for
 * ioredis by replacing get/set/del with Redis calls — the public API
 * stays identical.
 *
 * TTL Strategy:
 *   store:dashboard:*     60 s  — real-time feel; invalidated on writes
 *   store:settings:*     300 s  — rarely changes; invalidated on save
 *   billing:profile:*    120 s  — invalidated on webhook events
 *   billing:seats:*       60 s  — invalidated on seat updates
 *   subscription:*       120 s  — invalidated on Stripe webhooks
 *   feature-flags:*      600 s  — app-restart safe
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ── Core store ─────────────────────────────────────────────────────────────
const store = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 2_000;

function evictExpired() {
  const now = Date.now();
  for (const [k, v] of Array.from(store)) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

// Periodically remove expired entries so the Map doesn't grow indefinitely.
setInterval(evictExpired, 60_000).unref();

// ── Primitives ─────────────────────────────────────────────────────────────

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  // Simple LRU-style eviction: if at capacity, drop oldest 10 %
  if (store.size >= MAX_ENTRIES) {
    const toDelete = Math.ceil(MAX_ENTRIES * 0.1);
    let deleted = 0;
    for (const k of Array.from(store.keys())) {
      store.delete(k);
      if (++deleted >= toDelete) break;
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key: string): void {
  store.delete(key);
}

export function cacheDelPattern(prefix: string): void {
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/** Invalidate everything scoped to a single store. */
export function invalidateStore(storeId: number): void {
  cacheDelPattern(`store:${storeId}:`);
}

/** Invalidate all billing data for a salon. */
export function invalidateBilling(salonId: number): void {
  cacheDelPattern(`billing:${salonId}:`);
}

// ── TTL constants (ms) ─────────────────────────────────────────────────────
export const TTL = {
  DASHBOARD:       60_000,
  SETTINGS:       300_000,
  BILLING_PROFILE: 120_000,
  BILLING_SEATS:    60_000,
  SUBSCRIPTION:    120_000,
  FEATURE_FLAGS:   600_000,
} as const;

// ── Typed namespace helpers ────────────────────────────────────────────────

export const cache = {
  /** Wrap an async loader with cache-aside logic. */
  async wrap<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = cacheGet<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    if (value != null) cacheSet(key, value, ttlMs);
    return value;
  },

  // ── Store namespace ──────────────────────────────────────────────────────
  store: {
    dashboardKey: (storeId: number) => `store:${storeId}:dashboard`,
    settingsKey:  (storeId: number) => `store:${storeId}:settings`,
    hoursKey:     (storeId: number) => `store:${storeId}:hours`,

    getDashboard: <T>(storeId: number) =>
      cacheGet<T>(`store:${storeId}:dashboard`),
    setDashboard: <T>(storeId: number, data: T) =>
      cacheSet(`store:${storeId}:dashboard`, data, TTL.DASHBOARD),

    getSettings: <T>(storeId: number) =>
      cacheGet<T>(`store:${storeId}:settings`),
    setSettings: <T>(storeId: number, data: T) =>
      cacheSet(`store:${storeId}:settings`, data, TTL.SETTINGS),

    invalidate: (storeId: number) => invalidateStore(storeId),
  },

  // ── Billing namespace ────────────────────────────────────────────────────
  billing: {
    profileKey:      (salonId: number) => `billing:${salonId}:profile`,
    seatsKey:        (salonId: number) => `billing:${salonId}:seats`,
    subscriptionKey: (salonId: number) => `billing:${salonId}:subscription`,

    getProfile: <T>(salonId: number) =>
      cacheGet<T>(`billing:${salonId}:profile`),
    setProfile: <T>(salonId: number, data: T) =>
      cacheSet(`billing:${salonId}:profile`, data, TTL.BILLING_PROFILE),

    getSeats: <T>(salonId: number) =>
      cacheGet<T>(`billing:${salonId}:seats`),
    setSeats: <T>(salonId: number, data: T) =>
      cacheSet(`billing:${salonId}:seats`, data, TTL.BILLING_SEATS),

    getSubscription: <T>(salonId: number) =>
      cacheGet<T>(`billing:${salonId}:subscription`),
    setSubscription: <T>(salonId: number, data: T) =>
      cacheSet(`billing:${salonId}:subscription`, data, TTL.SUBSCRIPTION),

    invalidate: (salonId: number) => invalidateBilling(salonId),
  },

  // ── Diagnostics ──────────────────────────────────────────────────────────
  stats: () => ({
    size: store.size,
    maxSize: MAX_ENTRIES,
  }),
};

export default cache;

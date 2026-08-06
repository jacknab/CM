/**
 * Availability cache helpers — Redis-backed, gracefully falls back to null
 * (triggering a live DB computation) when Redis is unavailable.
 *
 * Key format: availability:{storeId}:{date}:{serviceId}:{staffId|any}
 * TTL: 2 hours (7200 seconds)
 *
 * Hit/miss/set counters are stored in Redis under:
 *   cache_stat:hits   — cumulative hit count
 *   cache_stat:misses — cumulative miss count
 *   cache_stat:sets   — cumulative set count
 */

import { getRedisClient } from "./redis";
import { AVAILABILITY_QUEUE_NAME } from "./availabilityQueue";
import { getBullMqConnectionOptions } from "./redis";

export type CachedSlot = { time: string; staffId: number; staffName: string };

const CACHE_TTL_SECONDS = 7200;
const STAT_KEY_HITS   = "cache_stat:hits";
const STAT_KEY_MISSES = "cache_stat:misses";
const STAT_KEY_SETS   = "cache_stat:sets";

function makeKey(storeId: number, date: string, serviceId: number, staffId?: number): string {
  return `availability:${storeId}:${date}:${serviceId}:${staffId ?? "any"}`;
}

export async function getAvailabilityCache(
  storeId: number,
  date: string,
  serviceId: number,
  staffId?: number,
): Promise<CachedSlot[] | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const raw = await redis.get(makeKey(storeId, date, serviceId, staffId));
    if (!raw) {
      void redis.incr(STAT_KEY_MISSES).catch(() => {});
      return null;
    }
    void redis.incr(STAT_KEY_HITS).catch(() => {});
    const parsed = JSON.parse(raw) as { slots: CachedSlot[]; updatedAt: number };
    return parsed.slots ?? null;
  } catch {
    return null;
  }
}

export async function setAvailabilityCache(
  storeId: number,
  date: string,
  serviceId: number,
  staffId: number | undefined,
  slots: CachedSlot[],
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.set(
      makeKey(storeId, date, serviceId, staffId),
      JSON.stringify({ slots, updatedAt: Date.now() }),
      "EX",
      CACHE_TTL_SECONDS,
    );
    void redis.incr(STAT_KEY_SETS).catch(() => {});
  } catch {
    // Non-critical — fall through
  }
}

/**
 * Delete all cached availability keys for a given store + date combination.
 * Returns the number of keys deleted.
 */
export async function invalidateAvailabilityForDate(
  storeId: number,
  date: string,
): Promise<number> {
  const redis = getRedisClient();
  if (!redis) return 0;

  const pattern = `availability:${storeId}:${date}:*`;
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, found] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== "0");

    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * Delete all cached availability keys for a store (any date).
 * Used when staff schedules or services change.
 */
export async function invalidateAvailabilityForStore(storeId: number): Promise<number> {
  const redis = getRedisClient();
  if (!redis) return 0;

  const pattern = `availability:${storeId}:*`;
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, found] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== "0");

    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return keys.length;
  } catch {
    return 0;
  }
}

// ── Per-store key breakdown ───────────────────────────────────────────────────

export interface StoreKeySummary {
  storeId: number;
  keyCount: number;
  /** Unique dates that currently have cached entries */
  dates: string[];
}

async function getStoreKeySummaries(redis: ReturnType<typeof getRedisClient>): Promise<StoreKeySummary[]> {
  if (!redis) return [];
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, found] = await redis.scan(cursor, "MATCH", "availability:*", "COUNT", 200);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== "0");

    const byStore = new Map<number, Set<string>>();
    for (const key of keys) {
      // key = availability:{storeId}:{date}:{serviceId}:{staffId}
      const parts = key.split(":");
      if (parts.length < 3) continue;
      const storeId = parseInt(parts[1], 10);
      const date = parts[2];
      if (isNaN(storeId)) continue;
      if (!byStore.has(storeId)) byStore.set(storeId, new Set());
      byStore.get(storeId)!.add(date);
    }

    return Array.from(byStore.entries())
      .map(([storeId, dateSet]) => ({
        storeId,
        keyCount: keys.filter((k) => k.startsWith(`availability:${storeId}:`)).length,
        dates: Array.from(dateSet).sort(),
      }))
      .sort((a, b) => a.storeId - b.storeId);
  } catch {
    return [];
  }
}

// ── BullMQ queue stats ────────────────────────────────────────────────────────

async function getQueueCounts(redis: ReturnType<typeof getRedisClient>): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
} | null> {
  if (!redis) return null;
  try {
    const { Queue } = await import("bullmq");
    const connection = getBullMqConnectionOptions();
    if (!connection) return null;
    const q = new Queue<unknown, unknown, string>(AVAILABILITY_QUEUE_NAME, { connection });
    const counts = await q.getJobCounts("waiting", "active", "completed", "failed");
    await q.close();
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Public stats API ──────────────────────────────────────────────────────────

export interface AvailabilityCacheStats {
  redisConnected: boolean;
  /** Used memory as reported by Redis INFO memory (human-readable) */
  redisMemoryUsed: string | null;
  /** Total availability:* keys currently in Redis */
  totalKeys: number;
  /** Cumulative hits since Redis started / last FLUSHDB */
  hits: number;
  /** Cumulative misses */
  misses: number;
  /** Cumulative sets */
  sets: number;
  /** Hit-rate percentage (0–100), null if no queries recorded */
  hitRatePct: number | null;
  /** Per-store breakdown */
  stores: StoreKeySummary[];
  /** BullMQ queue job counts */
  queue: { waiting: number; active: number; completed: number; failed: number } | null;
}

export async function getAvailabilityCacheStats(): Promise<AvailabilityCacheStats> {
  const redis = getRedisClient();

  if (!redis) {
    return {
      redisConnected: false,
      redisMemoryUsed: null,
      totalKeys: 0,
      hits: 0,
      misses: 0,
      sets: 0,
      hitRatePct: null,
      stores: [],
      queue: null,
    };
  }

  try {
    const [hitsRaw, missesRaw, setsRaw, memInfo, storeSummaries, queueCounts] = await Promise.all([
      redis.get(STAT_KEY_HITS),
      redis.get(STAT_KEY_MISSES),
      redis.get(STAT_KEY_SETS),
      redis.info("memory"),
      getStoreKeySummaries(redis),
      getQueueCounts(redis),
    ]);

    const hits   = parseInt(hitsRaw   ?? "0", 10) || 0;
    const misses = parseInt(missesRaw ?? "0", 10) || 0;
    const sets   = parseInt(setsRaw   ?? "0", 10) || 0;
    const total  = hits + misses;
    const hitRatePct = total > 0 ? Math.round((hits / total) * 10000) / 100 : null;

    // Parse "used_memory_human:1.23M" from INFO memory output
    const memMatch = memInfo.match(/used_memory_human:(\S+)/);
    const redisMemoryUsed = memMatch ? memMatch[1] : null;

    const totalKeys = storeSummaries.reduce((sum, s) => sum + s.keyCount, 0);

    return {
      redisConnected: true,
      redisMemoryUsed,
      totalKeys,
      hits,
      misses,
      sets,
      hitRatePct,
      stores: storeSummaries,
      queue: queueCounts,
    };
  } catch {
    return {
      redisConnected: false,
      redisMemoryUsed: null,
      totalKeys: 0,
      hits: 0,
      misses: 0,
      sets: 0,
      hitRatePct: null,
      stores: [],
      queue: null,
    };
  }
}

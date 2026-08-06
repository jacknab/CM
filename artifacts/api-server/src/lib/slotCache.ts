/**
 * Precomputed slot cache — Redis-backed, service-agnostic.
 *
 * Key format : store:{storeId}:slots:{YYYY-MM-DD}
 * Value      : JSON-encoded DaySlotCache
 * TTL        : 25 hours (slots are rebuilt on every booking/schedule change)
 *
 * Each PrecomputedSlot answers "which staff member is free to START a service
 * at this UTC timestamp?".  Duration/service filtering is done in-memory at
 * read time so the cache stays service-agnostic and can be shared across all
 * concurrent AI calls regardless of which service is requested.
 */

import { getRedisClient } from "./redis";

export interface PrecomputedSlot {
  /** ISO UTC timestamp of the slot start */
  time: string;
  staffId: number;
  staffName: string;
  /**
   * ISO UTC of the NEXT appointment for this staff member on this day that
   * starts AFTER this slot.  Used at read-time to enforce duration: the
   * chosen service must fit within [slotStart, nextBookingUtc).
   * Null means the staff member is free until business close.
   */
  nextBookingUtc: string | null;
}

export interface DaySlotCache {
  /** ISO UTC of business close time for this date */
  businessCloseUtc: string;
  /** All free staff × time combinations for the day (service-agnostic) */
  slots: PrecomputedSlot[];
  /** Unix ms when this snapshot was written */
  builtAt: number;
}

const SLOT_CACHE_TTL_SECONDS = 25 * 3600;

function slotKey(storeId: number, date: string): string {
  return `store:${storeId}:slots:${date}`;
}

export async function getSlotCache(storeId: number, date: string): Promise<DaySlotCache | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(slotKey(storeId, date));
    if (!raw) return null;
    return JSON.parse(raw) as DaySlotCache;
  } catch {
    return null;
  }
}

export async function setSlotCache(storeId: number, date: string, data: DaySlotCache): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(slotKey(storeId, date), JSON.stringify(data), "EX", SLOT_CACHE_TTL_SECONDS);
  } catch {
    // non-critical
  }
}

export async function invalidateSlotCacheForDate(storeId: number, date: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(slotKey(storeId, date));
  } catch {}
}

/**
 * Delete precomputed slot keys for the next `days` days for a store.
 * Used when business hours or staff schedules change.
 */
export async function invalidateSlotCacheForStore(storeId: number, days = 14): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now.getTime() + i * 86_400_000);
      keys.push(slotKey(storeId, d.toISOString().slice(0, 10)));
    }
    if (keys.length > 0) await redis.del(...keys);
  } catch {}
}

/**
 * Count how many precomputed slot keys exist in Redis.
 * Used by the admin stats endpoint.
 */
export async function countSlotCacheKeys(): Promise<number> {
  const redis = getRedisClient();
  if (!redis) return 0;
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, found] = await redis.scan(cursor, "MATCH", "store:*:slots:*", "COUNT", 200);
      cursor = next;
      keys.push(...found);
    } while (cursor !== "0");
    return keys.length;
  } catch {
    return 0;
  }
}

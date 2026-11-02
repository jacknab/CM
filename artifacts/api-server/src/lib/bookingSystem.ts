/**
 * The salon's booking system switch (Settings › Advanced Features › Booking System; owner, 2026-11-02). Off: no new
 * bookings anywhere — the online booking page closes, the public booking routes refuse, the website's booking
 * links are hidden, Autumn doesn't answer calls, and the calendar and booking settings leave the salon's screens.
 * Appointments already booked still happen (their reminders still go out; on their day they show at the front desk).
 * Kept in store_settings.preferences.features.bookingSystem; absent = on.
 */
import { pool } from "../db";

const CACHE_MS = 30_000;
const cache = new Map<number, { off: boolean; at: number }>();

/** True when the salon has switched its booking system off. A failed check never switches anything off. */
export async function isBookingSystemOff(storeId: number): Promise<boolean> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.off;
  try {
    const { rows } = await pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [storeId]);
    const raw = rows[0]?.preferences;
    const prefs = typeof raw === "string" ? JSON.parse(raw) : raw;
    const off = prefs?.features?.bookingSystem === false;
    cache.set(storeId, { off, at: Date.now() });
    return off;
  } catch {
    return false;
  }
}

/** The setting just changed (Advanced Features): no waiting for the cache. */
export function forgetBookingSystem(storeId: number): void {
  cache.delete(storeId);
}

/** The same check by the salon's booking slug (the public booking routes and the booking page). */
export async function isBookingSystemOffBySlug(slug: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(`SELECT id FROM locations WHERE booking_slug = $1 LIMIT 1`, [slug]);
    return rows[0] ? isBookingSystemOff(Number(rows[0].id)) : false;
  } catch {
    return false;
  }
}

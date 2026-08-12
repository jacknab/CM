/**
 * timezone.ts — Centralized timezone utilities for the AI Receptionist and all
 * features that must use the store's local timezone (from locations.timezone).
 *
 * This helper prevents timezone drift: every feature that deals with dates,
 * times, or day boundaries MUST go through these utilities instead of using
 * raw `new Date()` getters or server-local time.
 *
 * Usage:
 *   import { getStoreTimezone, toSalonDateKey, formatInSalonTime } from "@/lib/timezone";
 *
 *   const tz = await getStoreTimezone(storeId);
 *   const today = toSalonDateKey(new Date(), tz);
 *   const formatted = formatInSalonTime(utcDate, tz, "h:mm a");
 */

import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { db } from "../db";
import { locations } from "@shared/schema";
import { eq } from "drizzle-orm";

// ── Store timezone lookup ──────────────────────────────────────────────────

/**
 * Returns the IANA timezone string for a store, falling back to "UTC".
 * Always fetches from the database — never uses process.env.TZ or server local time.
 */
export async function getStoreTimezone(storeId: number): Promise<string> {
  try {
    const [row] = await db
      .select({ timezone: locations.timezone })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);
    return (row as any)?.timezone ?? "UTC";
  } catch {
    return "UTC";
  }
}

// ── Date key utilities ─────────────────────────────────────────────────────

/**
 * Returns a correctly-padded YYYY-MM-DD date key in the salon's local timezone.
 * Independent of the server's process timezone.
 */
export function toSalonDateKey(utcDate: Date, timezone: string): string {
  return formatInTimeZone(utcDate, timezone || "UTC", "yyyy-MM-dd");
}

/**
 * Returns UTC-equivalent Date objects representing midnight start and end of
 * a given local date key (YYYY-MM-DD) in the specified salon timezone.
 */
export function salonDayBoundaries(
  dateKey: string,
  timezone: string,
): { dayStart: Date; dayEnd: Date } {
  const tz = timezone || "UTC";
  return {
    dayStart: fromZonedTime(new Date(`${dateKey}T00:00:00`), tz),
    dayEnd: fromZonedTime(new Date(`${dateKey}T23:59:59.999`), tz),
  };
}

// ── Formatting utilities ────────────────────────────────────────────────────

/**
 * Format a UTC Date in the salon timezone using date-fns format tokens.
 * Example: formatInSalonTime(utcDate, "America/New_York", "h:mm a") → "2:30 PM"
 */
export function formatInSalonTime(utcDate: Date, timezone: string, fmt: string): string {
  return formatInTimeZone(utcDate, timezone || "UTC", fmt);
}

/**
 * Get the current local date string (YYYY-MM-DD) for the salon's timezone.
 */
export function todayInSalonTime(timezone: string): string {
  return formatInTimeZone(new Date(), timezone || "UTC", "yyyy-MM-dd");
}

// ── Conversion utilities ────────────────────────────────────────────────────

/**
 * Convert a local date+time string to a UTC Date in the given timezone.
 * Example: localTimeToUtc("2026-08-06", "14:30", "America/New_York") → UTC Date
 */
export function localTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, timezone || "UTC");
}

/**
 * Convert a UTC Date to a local time string in the given timezone.
 * Example: utcToLocalTime(utcDate, "America/New_York", "h:mm a") → "2:30 PM"
 */
export function utcToLocalTime(utcDate: Date, timezone: string, fmt: string): string {
  return formatInTimeZone(utcDate, timezone || "UTC", fmt);
}

// ── Day-of-week utility ─────────────────────────────────────────────────────

/**
 * Returns the day of week (0=Sun, 1=Mon, ..., 6=Sat) for a UTC Date
 * in the given salon timezone. Uses formatInTimeZone — never .getDay()
 * on a raw Date, which would use the server's process TZ.
 */
export function getDayOfWeekInSalonTime(utcDate: Date, timezone: string): number {
  // formatInTimeZone "i" token: 1=Mon…7=Sun → %7 gives 0=Sun,1=Mon,…,6=Sat
  return parseInt(formatInTimeZone(utcDate, timezone || "UTC", "i"), 10) % 7;
}

// ── Local date components ──────────────────────────────────────────────────

/**
 * Return the local hour (0–23) of a UTC instant in the salon timezone.
 * Never use utcDate.getHours() server-side — it depends on the server's TZ.
 */
export function getLocalHour(utcDate: Date, timezone: string): number {
  return parseInt(formatInTimeZone(utcDate, timezone || "UTC", "H"), 10);
}

/**
 * Return the local minute (0–59) of a UTC instant in the salon timezone.
 */
export function getLocalMinute(utcDate: Date, timezone: string): number {
  return parseInt(formatInTimeZone(utcDate, timezone || "UTC", "m"), 10);
}

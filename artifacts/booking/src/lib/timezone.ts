/**
 * timezone.ts — Certxa frontend timezone utilities
 *
 * This is the ONLY module that should perform timezone arithmetic in the
 * booking frontend. All other components must import from here — never
 * call date-fns-tz or Intl APIs directly.
 *
 * Architecture contract:
 *  • The API always returns UTC ISO-8601 timestamps (ending in "Z").
 *  • User input is converted to UTC via storeLocalToUtc() before submission.
 *  • Display is always via formatInTz() using the store's IANA timezone.
 *  • Never use Date.prototype.getHours(), getDay(), getMonth(), etc. on
 *    timezone-sensitive dates — use getHourInTz() / getDayOfWeekInTz() instead.
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

// ── Display helpers ──────────────────────────────────────────────────────────

/**
 * Format a UTC date/string in the salon's timezone using date-fns format tokens.
 * This is the primary display function for all appointment times.
 */
export function formatInTz(date: Date | string, timezone: string, fmt: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, timezone, fmt);
}

/**
 * Convert a UTC Date to its wall-clock representation in the salon timezone.
 * The returned Date has its UTC fields shifted:
 *   result.getUTCHours()  → correct local hour
 *   result.getUTCDate()   → correct local date
 * Always use getUTC* getters on the result to stay browser-TZ-independent.
 */
export function toStoreLocal(date: Date | string, timezone: string): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(d, timezone);
}

// ── Timezone metadata ────────────────────────────────────────────────────────

export function getTimezoneAbbr(timezone: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(now);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value ?? timezone;
  } catch {
    return timezone;
  }
}

export function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(now);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value ?? "";
  } catch {
    return "";
  }
}

// ── "Now" helpers ────────────────────────────────────────────────────────────

/**
 * Return the current moment as a wall-clock Date in the salon's timezone.
 *
 * The returned Date has its UTC fields set to the salon's local wall-clock
 * values so that getUTCFullYear/getUTCMonth/getUTCDate/getUTCHours all return
 * the correct local values regardless of the browser's own timezone.
 *
 * NOTE: We deliberately avoid toZonedTime() here. In date-fns-tz v3 that
 * function no longer shifts the internal UTC timestamp, so getUTCDate() on its
 * result returns the UTC date — not the local date. Using formatInTimeZone to
 * build a local wall-clock string and re-parsing it as UTC is the v3-safe
 * approach that all downstream helpers (isSameStoreDay, formatStoreDate,
 * addStoreDays) depend on.
 */
export function getNowInTimezone(timezone: string): Date {
  const now = new Date();
  // formatInTimeZone produces the local wall-clock string (e.g. "2026-07-23T20:24:00").
  // Appending 'Z' makes the Date constructor treat it as UTC so getUTC* methods
  // return the local wall-clock values rather than the true UTC values.
  const localStr = formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ss");
  return new Date(localStr + "Z");
}

/**
 * Format a wall-clock Date created by getNowInTimezone() or addStoreDays().
 *
 * These dates intentionally store the salon's calendar fields in UTC fields
 * so date-fns arithmetic is independent of the browser timezone. They are not
 * UTC instants, so formatting them in the salon timezone would apply the
 * offset a second time.
 */
export function formatStoreDate(date: Date, fmt: string): string {
  return formatInTimeZone(date, "UTC", fmt);
}

/** Compare two salon wall-clock calendar dates (not two UTC instants). */
export function isSameStoreDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Compare a UTC appointment instant with a salon wall-clock calendar date.
 * The second argument is the kind of Date returned by getNowInTimezone(),
 * not a UTC instant.
 */
export function isOnStoreDate(
  instant: Date | string,
  storeDate: Date,
  timezone: string,
): boolean {
  return toLocalDateStringInTz(instant, timezone) === formatStoreDate(storeDate, "yyyy-MM-dd");
}

/** Add calendar days to a salon wall-clock Date without browser-TZ drift. */
export function addStoreDays(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

// ── Conversion ───────────────────────────────────────────────────────────────

/**
 * Convert a local date-string (salon wall-clock) to a UTC Date for API submission.
 * Always use this when sending appointment times to the server.
 */
export function storeLocalToUtc(localDateStr: string, timezone: string): Date {
  const d = new Date(localDateStr);
  return fromZonedTime(d, timezone);
}

// ── Timezone-safe field accessors ────────────────────────────────────────────

/**
 * Return the local hour (0–23) of a UTC instant in the salon timezone.
 * Use instead of date.getHours() on timezone-sensitive dates.
 */
export function getHourInTz(date: Date | string, timezone: string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return parseInt(formatInTimeZone(d, timezone, "H"), 10);
}

/**
 * Return the local minute (0–59) of a UTC instant in the salon timezone.
 */
export function getMinuteInTz(date: Date | string, timezone: string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return parseInt(formatInTimeZone(d, timezone, "m"), 10);
}

/**
 * Return the local day-of-week (0=Sun … 6=Sat) in the salon timezone.
 * Use instead of date.getDay() on timezone-sensitive dates.
 */
export function getDayOfWeekInTz(date: Date | string, timezone: string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  // date-fns "i" token: 1=Mon…7=Sun → map to 0=Sun…6=Sat
  const iso = parseInt(formatInTimeZone(d, timezone, "i"), 10);
  return iso % 7;
}

/**
 * Return the local YYYY-MM-DD date string for a UTC instant in the salon timezone.
 */
export function toLocalDateStringInTz(date: Date | string, timezone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, timezone, "yyyy-MM-dd");
}

// ── Comparison helpers ────────────────────────────────────────────────────────

/**
 * Compare two dates produced by toZonedTime / getNowInTimezone for day equality.
 *
 * toZonedTime shifts the internal UTC timestamp so that getUTCHours() etc.
 * reflect the target timezone's wall-clock time. Always compare via getUTC*
 * so the browser's own offset is never applied on top.
 */
export function isSameDayTz(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth()    === b.getUTCMonth()    &&
    a.getUTCDate()     === b.getUTCDate()
  );
}

/**
 * True if two UTC Dates fall on the same salon-local calendar date.
 * Accepts raw UTC Dates (no prior toZonedTime call needed).
 */
export function isSameLocalDay(a: Date | string, b: Date | string, timezone: string): boolean {
  return toLocalDateStringInTz(a, timezone) === toLocalDateStringInTz(b, timezone);
}

// ── Common timezone list ──────────────────────────────────────────────────────

export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Ho_Chi_Minh",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

/**
 * TimeService — the single source of truth for all timezone operations on
 * the Certxa API server.
 *
 * Architecture rules enforced here:
 *  • The database stores all appointment timestamps as TIMESTAMPTZ (UTC).
 *  • The API accepts and returns UTC ISO-8601 strings (ending in "Z").
 *  • All local-time display and calculation uses the salon's IANA timezone
 *    from locations.timezone — the server's process timezone is irrelevant.
 *  • DST transitions are handled automatically by date-fns-tz / the V8
 *    Intl engine; no manual offset arithmetic is permitted.
 *
 * Usage:
 *   import { createTimeService } from "@/lib/timeService";
 *   const ts = createTimeService(store.timezone);  // e.g. "America/Denver"
 *
 *   ts.todayString()               // "2025-07-15"   (salon local date)
 *   ts.format(utcDate, "h:mm a")   // "9:00 AM"      (in salon TZ)
 *   ts.toUtc("2025-07-15T09:00")   // Date (UTC)
 *   ts.dayUtcRange("2025-07-15")   // { start, end }  (UTC midnight boundaries)
 *   ts.getLocalHour(utcDate)       // 9              (0-23, never server-local)
 *   ts.getLocalDayOfWeek(utcDate)  // 1              (0=Sun…6=Sat, salon TZ)
 */

import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export class TimeService {
  constructor(public readonly timezone: string) {
    if (!timezone) throw new Error("TimeService: timezone must be an IANA string, got empty value");
  }

  // ── "Now" helpers ────────────────────────────────────────────────────────────

  /** Current UTC instant — always the same regardless of timezone. */
  nowUtc(): Date {
    return new Date();
  }

  /** Current salon-local date as YYYY-MM-DD. Never uses the server clock's TZ. */
  todayString(): string {
    return formatInTimeZone(new Date(), this.timezone, "yyyy-MM-dd");
  }

  // ── Conversion ───────────────────────────────────────────────────────────────

  /**
   * Convert a UTC Date to its "wall-clock" representation in the salon TZ.
   *
   * The returned Date has its *UTC* fields shifted so that
   *   result.getUTCHours()     → local hour
   *   result.getUTCDay()       → local day-of-week
   *   result.getUTCDate()      → local day-of-month
   * Always prefer getUTC* over get* to stay server-TZ-independent.
   */
  toLocal(utc: Date): Date {
    return toZonedTime(utc, this.timezone);
  }

  /**
   * Convert a local date/time string (salon wall-clock) to a UTC Date.
   * Safe for all appointment creation/edit paths.
   *
   * @param localIso  e.g. "2025-07-15T09:00:00"  (no TZ suffix)
   */
  toUtc(localIso: string): Date {
    return fromZonedTime(localIso, this.timezone);
  }

  /**
   * Build a UTC Date from a separate local YYYY-MM-DD date string and HH:MM
   * time string. Convenience wrapper around toUtc().
   */
  localTimeToUtc(dateStr: string, timeStr: string): Date {
    return fromZonedTime(`${dateStr}T${timeStr}:00`, this.timezone);
  }

  // ── Formatting ───────────────────────────────────────────────────────────────

  /**
   * Format a UTC Date in the salon timezone using date-fns format tokens.
   * Example: ts.format(date, "EEEE, MMM d, yyyy")
   */
  format(utc: Date, fmt: string): string {
    return formatInTimeZone(utc, this.timezone, fmt);
  }

  /**
   * Return the local YYYY-MM-DD date string for a UTC instant.
   * The canonical replacement for any call to new Date().toISOString().slice(0,10).
   */
  toLocalDateString(utc: Date): string {
    return formatInTimeZone(utc, this.timezone, "yyyy-MM-dd");
  }

  // ── Date arithmetic ──────────────────────────────────────────────────────────

  /**
   * Return the [start, end) UTC instants for local midnight-to-midnight on the
   * given YYYY-MM-DD date string. Handles DST spring-forward / fall-back
   * correctly — the local "day" may be 23 or 25 hours long, but the UTC range
   * always spans the exact wall-clock day.
   */
  dayUtcRange(dateStr: string): { start: Date; end: Date } {
    const start = fromZonedTime(`${dateStr}T00:00:00`, this.timezone);
    // Compute the next calendar date string arithmetically — do NOT pass toZonedTime()
    // results into formatInTimeZone(), which would apply the offset a second time
    // (date-fns-tz v3 bug: toZonedTime shifts the fake-UTC fields, then
    // formatInTimeZone shifts them again, landing on the wrong day).
    const [y, m, d] = dateStr.split("-").map(Number);
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1)); // pure UTC arithmetic
    const nextDateStr = [
      nextDay.getUTCFullYear(),
      String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
      String(nextDay.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const end = fromZonedTime(`${nextDateStr}T00:00:00`, this.timezone);
    return { start, end };
  }

  /**
   * Return the next N local calendar dates starting from tomorrow (inclusive).
   * Useful for availability snapshot windows.
   */
  nextNDates(n: number, startOffsetDays = 1): string[] {
    const dates: string[] = [];
    const nowLocal = toZonedTime(new Date(), this.timezone);
    for (let i = startOffsetDays; i < startOffsetDays + n; i++) {
      const d = new Date(nowLocal);
      d.setUTCDate(nowLocal.getUTCDate() + i);
      dates.push(formatInTimeZone(d, this.timezone, "yyyy-MM-dd"));
    }
    return dates;
  }

  // ── Field accessors (server-TZ-safe) ────────────────────────────────────────

  /**
   * Return the local hour (0–23) of a UTC instant in the salon timezone.
   * Never use utcDate.getHours() server-side — it depends on the server's TZ.
   */
  getLocalHour(utc: Date): number {
    return parseInt(formatInTimeZone(utc, this.timezone, "H"), 10);
  }

  /**
   * Return the local minute (0–59) of a UTC instant in the salon timezone.
   */
  getLocalMinute(utc: Date): number {
    return parseInt(formatInTimeZone(utc, this.timezone, "m"), 10);
  }

  /**
   * Return the local day-of-week (0=Sun … 6=Sat) of a UTC instant.
   * date-fns uses 1-7 (Mon=1) for "e", so we map to 0-6 Sun-based.
   */
  getLocalDayOfWeek(utc: Date): number {
    // "i" token: 1=Mon…7=Sun. Convert to 0=Sun…6=Sat.
    const iso = parseInt(formatInTimeZone(utc, this.timezone, "i"), 10); // 1-7, Mon=1
    return iso % 7; // 0=Sun,1=Mon,...,6=Sat
  }

  /**
   * Return the local day-of-month (1–31) of a UTC instant.
   */
  getLocalDate(utc: Date): number {
    return parseInt(formatInTimeZone(utc, this.timezone, "d"), 10);
  }

  // ── Comparison helpers ───────────────────────────────────────────────────────

  /** True if two UTC Dates fall on the same salon-local calendar date. */
  isSameLocalDay(a: Date, b: Date): boolean {
    return this.toLocalDateString(a) === this.toLocalDateString(b);
  }

  /** True if a UTC Date's local date matches a YYYY-MM-DD string. */
  isOnDate(utc: Date, dateStr: string): boolean {
    return this.toLocalDateString(utc) === dateStr;
  }
}

/**
 * Convenience factory. Always prefer this over `new TimeService(...)` directly
 * so callers don't have to guard against undefined timezone.
 */
export function createTimeService(timezone: string | null | undefined): TimeService {
  const tz = timezone || "UTC";
  if (!timezone) {
    // Log a warning so ops can catch unconfigured salons.
    console.warn(`[TimeService] No timezone configured — falling back to UTC. Set locations.timezone to an IANA string (e.g. "America/Denver").`);
  }
  return new TimeService(tz);
}

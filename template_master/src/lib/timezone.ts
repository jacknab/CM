/**
 * timezone.ts — Certxa template timezone utilities
 * Ported from artifacts/booking/src/lib/timezone.ts
 *
 * Always use formatInTimeZone (not toZonedTime().getUTCHours()) — date-fns-tz v3
 * no longer shifts the internal UTC timestamp in toZonedTime.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export function formatInTz(date: Date | string, timezone: string, fmt: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, timezone, fmt);
}

export function getNowInTimezone(timezone: string): Date {
  const now = new Date();
  const localStr = formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ss");
  return new Date(localStr + 'Z');
}

export function addStoreDays(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

export function subStoreDays(date: Date, amount: number): Date {
  return addStoreDays(date, -amount);
}

export function isSameStoreDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function storeLocalToUtc(localDateStr: string, timezone: string): Date {
  return fromZonedTime(new Date(localDateStr), timezone);
}

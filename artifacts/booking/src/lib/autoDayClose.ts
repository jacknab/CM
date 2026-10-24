/**
 * When /nail opens Day Close by itself (owner, 2026-10-24): the salon has closed for the day — its closing time
 * from Settings → Business Hours has passed and it is not open again yet — and Day Close has not run since that
 * closing time. (The caller also requires no open tickets and nobody waiting.)
 *
 * Pure: the hours, the salon's time zone, now and when Day Close last ran go in; the answer comes out.
 */
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

export interface DayHours { dayOfWeek: number; openTime: string; closeTime: string; isClosed?: boolean | null }

const minutes = (hhmm: string) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/** One day's opening and closing as instants (a closing at or before the opening time is after midnight). */
function window(day: string, h: DayHours, tz: string): { open: Date; close: Date } {
  const open = fromZonedTime(`${day}T${h.openTime.slice(0, 5)}:00`, tz);
  let close = fromZonedTime(`${day}T${h.closeTime.slice(0, 5)}:00`, tz);
  if (minutes(h.closeTime) <= minutes(h.openTime)) close = new Date(close.getTime() + 24 * 3600_000);
  return { open, close };
}

/** The salon's most recent closing time at or before `now`; null when it is open right now (or has no hours). */
export function lastClosingTime(hours: DayHours[], tz: string, now: Date): Date | null {
  let latest: Date | null = null;
  for (let back = 0; back <= 7; back++) {
    const day = formatInTimeZone(new Date(now.getTime() - back * 24 * 3600_000), tz, "yyyy-MM-dd");
    const dow = Number(formatInTimeZone(fromZonedTime(`${day}T12:00:00`, tz), tz, "i")) % 7; // ISO 1–7 → 0 = Sunday
    const h = hours.find((x) => x.dayOfWeek === dow);
    if (!h || h.isClosed || !h.openTime || !h.closeTime) continue;
    const w = window(day, h, tz);
    if (w.open <= now && now < w.close) return null; // open now
    if (w.close <= now && (!latest || w.close > latest)) latest = w.close;
  }
  return latest;
}

export function dayCloseDue(hours: DayHours[], tz: string, now: Date, lastClosedAt: Date | null): boolean {
  const closedAt = lastClosingTime(hours, tz, now);
  if (!closedAt) return false;
  return !lastClosedAt || lastClosedAt < closedAt;
}

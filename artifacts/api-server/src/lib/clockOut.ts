import { and, eq, isNull } from "drizzle-orm";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "../db";
import { businessHours, locations, timeclock } from "@shared/schema";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * When a clock-in that was never closed should end. One from the salon's current day ends `now`. One left
 * open from an earlier day (forgotten overnight) ends at the end of ITS day — the salon's closing time that
 * day, or the end of that day when the salon was closed or the clock-in came after closing — never `now`,
 * which would credit weeks of hours. Never before the clock-in, never after `now`. Pure.
 */
export function clockOutTimeFor(opts: {
  clockIn: Date; workDate: string; now: Date; timezone: string;
  hours: { dayOfWeek: number; closeTime: string | null; isClosed: boolean | null }[];
}): Date {
  const { clockIn, workDate, now, timezone } = opts;
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  if (workDate >= today) return now;
  const dayOfWeek = new Date(`${workDate}T12:00:00Z`).getUTCDay();
  const day = opts.hours.find((h) => h.dayOfWeek === dayOfWeek);
  const close = day && !day.isClosed && day.closeTime && /^\d{1,2}:\d{2}/.test(day.closeTime)
    ? fromZonedTime(`${workDate}T${day.closeTime.slice(0, 5).padStart(5, "0")}:00`, timezone)
    : null;
  const endOfClockInDay = fromZonedTime(`${formatInTimeZone(clockIn, timezone, "yyyy-MM-dd")}T23:59:59`, timezone);
  const end = close && close > clockIn ? close : endOfClockInDay;
  return new Date(Math.min(now.getTime(), Math.max(clockIn.getTime(), end.getTime())));
}

/**
 * Close every clock-in still open for this salon (or one technician), whatever day it was made on.
 * Returns the staff ids clocked out.
 */
export async function clockOutOpenRecords(storeId: number, opts: { staffId?: number; now?: Date; exec?: Executor } = {}): Promise<number[]> {
  const exec = opts.exec ?? db;
  const now = opts.now ?? new Date();
  const open = await exec.select({ id: timeclock.id, staffId: timeclock.staffId, clockIn: timeclock.clockIn, workDate: timeclock.workDate })
    .from(timeclock)
    .where(and(eq(timeclock.storeId, storeId), isNull(timeclock.clockOut), ...(opts.staffId ? [eq(timeclock.staffId, opts.staffId)] : [])));
  if (open.length === 0) return [];
  const [store] = await exec.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId)).limit(1);
  const timezone = store?.timezone || "UTC";
  const hours = await exec.select({ dayOfWeek: businessHours.dayOfWeek, closeTime: businessHours.closeTime, isClosed: businessHours.isClosed })
    .from(businessHours).where(eq(businessHours.storeId, storeId));
  for (const r of open) {
    const clockOut = clockOutTimeFor({ clockIn: new Date(r.clockIn), workDate: String(r.workDate), now, timezone, hours });
    await exec.update(timeclock).set({ clockOut }).where(and(eq(timeclock.id, r.id), isNull(timeclock.clockOut)));
  }
  return [...new Set(open.map((r) => r.staffId))];
}

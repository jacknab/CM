/**
 * Days and times for the Solo dashboard, always in the business's time zone (as the Certxa Pro app's
 * lib/businessTime.ts). A day is its "yyyy-MM-dd" in that zone; a time of day is minutes after its midnight.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type Day = string;

const pad = (n: number) => String(n).padStart(2, "0");
const noon = (d: Day) => new Date(`${d}T12:00:00Z`);

export const dayOf = (date: Date | string, tz: string): Day => formatInTimeZone(new Date(date), tz, "yyyy-MM-dd");
export const todayIn = (tz: string): Day => dayOf(new Date(), tz);

export function addDays(d: Day, n: number): Day {
  const x = noon(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** The same day of the month n months on (the 31st becomes the month's last day). */
export function addMonths(d: Day, n: number): Day {
  const [y, m, day] = d.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(day, last), 12)).toISOString().slice(0, 10);
}

export const daysBetween = (a: Day, b: Day) => Math.round((noon(b).getTime() - noon(a).getTime()) / 86_400_000);

/** The moment `minutes` after the day's midnight, in business time. */
export function at(d: Day, minutes: number, tz: string): Date {
  const whole = Math.floor(minutes / 1440);
  const day = whole ? addDays(d, whole) : d;
  const m = minutes - whole * 1440;
  return fromZonedTime(`${day}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`, tz);
}

export function minutesIn(date: Date | string, tz: string): number {
  const [h, m] = formatInTimeZone(new Date(date), tz, "H:m").split(":").map(Number);
  return h * 60 + m;
}

export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 || 12}:${pad(minutes % 60)} ${h >= 12 ? "PM" : "AM"}`;
}

/** "09:30" for an <input type="time">, and back. */
export const timeValue = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export const fromTimeValue = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + (m || 0); };

/** Formats the day itself (no time zone shift: it is already the business's day). */
export const dayLabel = (d: Day, options: Intl.DateTimeFormatOptions) => noon(d).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
export const dayNumber = (d: Day) => Number(d.slice(8));
export const monthOf = (d: Day) => d.slice(0, 7);

/** The month grid: six weeks from the Monday on or before the 1st (as the app). */
export function monthCells(d: Day): Day[] {
  const first = `${d.slice(0, 8)}01`;
  const offset = (noon(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
}

/** The app's day strip and Week view: seven days that start with today, then the next seven, … — the window holding `d`. */
export function weekWindow(d: Day, today: Day): Day[] {
  const first = addDays(today, Math.floor(daysBetween(today, d) / 7) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

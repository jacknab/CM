/**
 * Booking a future visit on /nail with no connection: the technicians, the days and the open times are worked
 * out on the tablet from the salon data it holds (lib/snapshot-db: hours, each technician's weekly hours, who
 * does which service, the next 30 days of appointments), plus what the board and the bookings queued on this
 * tablet say. The same rules as the server's open-times calculation: the salon's hours narrowed to the
 * technician's own; one technician for both services when anyone does both, otherwise the second service goes
 * to another technician straight after. The server checks the booking again when it is sent, so a time taken
 * meanwhile on another device is refused then rather than double-booked.
 */
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { BookingSlot } from "./BookingPanel";

export const OFFLINE_BOOKING_DAYS = 30; // the saved appointments cover today and the next 30 days
const SLOT_MINUTES = 15;

export interface OfflineBookingData {
  timezone: string;
  hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[];
  rules: { staffId: number; dayOfWeek: number; startTime: string; endTime: string }[];
  staff: { id: number; name: string }[];
  /** staffId → the services they do. */
  skills: Map<number, Set<number>>;
  /** Time each technician is already taken. */
  busy: { staffId: number; start: number; end: number }[];
}

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Who can take this visit: those who do the service — with a second service, those who do both when anyone does. */
export function bookingTechs(d: OfflineBookingData, serviceId: number, extraServiceId: number | null): { id: number; name: string }[] {
  const does = (staffId: number, svc: number) => d.skills.get(staffId)?.has(svc) ?? false;
  const first = d.staff.filter((s) => does(s.id, serviceId));
  if (!extraServiceId) return first;
  const both = first.filter((s) => does(s.id, extraServiceId));
  return both.length ? both : first;
}

/** The open times on one day (salon date YYYY-MM-DD). Pure. */
export function openTimesOffline(d: OfflineBookingData, opts: {
  date: string; serviceId: number; extraServiceId: number | null; duration: number; extraDuration: number;
  staffId?: number | null; now: number; firstOnly?: boolean;
}): BookingSlot[] {
  const dayOfWeek = new Date(`${opts.date}T12:00:00Z`).getUTCDay();
  const salon = d.hours.find((h) => h.dayOfWeek === dayOfWeek);
  if (!salon || salon.isClosed) return [];
  const open = minutesOf(salon.openTime), close = minutesOf(salon.closeTime);
  if (open == null || close == null || close <= open) return [];

  const does = (staffId: number, svc: number) => d.skills.get(staffId)?.has(svc) ?? false;
  let first = d.staff.filter((s) => does(s.id, opts.serviceId) && (!opts.staffId || s.id === opts.staffId));
  let second: { id: number; name: string }[] = [];
  if (opts.extraServiceId) {
    const extra = d.staff.filter((s) => does(s.id, opts.extraServiceId!));
    const both = first.filter((s) => extra.some((x) => x.id === s.id));
    if (both.length) first = both;
    else if (extra.length && opts.duration - opts.extraDuration > 0) second = extra;
    else return [];
  }
  if (!first.length) return [];
  const split = second.length > 0;
  const firstMinutes = split ? opts.duration - opts.extraDuration : opts.duration;

  const at = (mins: number) => fromZonedTime(`${opts.date}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00`, d.timezone).getTime();
  /** Free for all of [from, to): inside their own hours that day, and nothing booked in the way. */
  const free = (staffId: number, from: number, to: number) => {
    const myRules = d.rules.filter((r) => r.staffId === staffId);
    if (myRules.length) {
      const rule = myRules.find((r) => r.dayOfWeek === dayOfWeek);
      if (!rule) return false;
      const s = minutesOf(rule.startTime), e = minutesOf(rule.endTime);
      if (s == null || e == null) return false;
      const fromMin = Number(formatInTimeZone(from, d.timezone, "H")) * 60 + Number(formatInTimeZone(from, d.timezone, "m"));
      const toMin = Number(formatInTimeZone(to, d.timezone, "H")) * 60 + Number(formatInTimeZone(to, d.timezone, "m"));
      if (fromMin < s || toMin > e) return false;
    }
    return !d.busy.some((b) => b.staffId === staffId && b.start < to && b.end > from);
  };

  const slots: BookingSlot[] = [];
  for (let mins = open; mins + opts.duration <= close; mins += SLOT_MINUTES) {
    const start = at(mins);
    if (start <= opts.now) continue;
    const end = start + opts.duration * 60_000;
    const firstEnd = start + firstMinutes * 60_000;
    // Whoever has the fewest bookings that day first, so the day is shared out.
    const who = first.filter((s) => free(s.id, start, firstEnd))
      .sort((a, b) => d.busy.filter((x) => x.staffId === a.id).length - d.busy.filter((x) => x.staffId === b.id).length)[0];
    if (!who) continue;
    let then: { id: number; name: string } | undefined;
    if (split) {
      then = second.find((s) => free(s.id, firstEnd, end));
      if (!then) continue;
    }
    slots.push({ time: new Date(start).toISOString(), staffId: who.id, staffName: who.name, ...(then ? { extraStaffId: then.id, extraStaffName: then.name } : {}) });
    if (opts.firstOnly) break;
  }
  return slots;
}

/** The days from `from` with at least one open time, up to `limit`, within the 30 days the tablet holds. Pure. */
export function openDaysOffline(d: OfflineBookingData, opts: {
  from: string; limit: number; serviceId: number; extraServiceId: number | null; duration: number; extraDuration: number;
  staffId?: number | null; now: number;
}): { days: string[]; next: string | null } {
  const today = formatInTimeZone(opts.now, d.timezone, "yyyy-MM-dd");
  const last = new Date(`${today}T12:00:00Z`); last.setUTCDate(last.getUTCDate() + OFFLINE_BOOKING_DAYS);
  const lastDay = last.toISOString().slice(0, 10);
  const days: string[] = [];
  let day = opts.from < today ? today : opts.from;
  while (day <= lastDay && days.length < opts.limit) {
    if (openTimesOffline(d, { ...opts, date: day, firstOnly: true }).length) days.push(day);
    const n = new Date(`${day}T12:00:00Z`); n.setUTCDate(n.getUTCDate() + 1); day = n.toISOString().slice(0, 10);
  }
  return { days, next: day <= lastDay ? day : null };
}

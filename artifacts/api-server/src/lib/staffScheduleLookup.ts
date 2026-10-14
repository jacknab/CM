import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { pool } from "../db";

/**
 * When each technician works — for the AI receptionist's "when is Tom in?" questions.
 *
 * A technician works the salon's open hours on a day, narrowed to their own weekly hours (Staff → Availability)
 * when they have any: with weekly hours set, a day without a line is a day off. Time away synced from their
 * calendar (external busy blocks) takes the whole day off when it covers it, and is mentioned otherwise.
 * The same rules decide which times can be booked with them, so the receptionist and the booking agree.
 */

export interface HoursLine { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }
export interface WeeklyRule { dayOfWeek: number; startTime: string; endTime: string }
export interface AwayBlock { startsAt: Date; endsAt: Date; allDay: boolean }

export interface ScheduleDay {
  date: string;
  /** "Wed, Oct 14" */
  label: string;
  working: boolean;
  /** "9:30 AM" – "7 PM" when working. */
  from?: string;
  to?: string;
  /** Why they are off, or time away during the day. */
  note?: string;
}

export interface StaffSchedule {
  staffId: number;
  name: string;
  services: string[];
  clockedInNow: boolean;
  days: ScheduleDay[];
}

const minutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const clock = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
};

/** One technician's day: the salon's hours, narrowed to their own, less any whole day away. Pure. */
export function scheduleForDay(opts: {
  date: string; timezone: string; salonHours: HoursLine[]; rules: WeeklyRule[]; away: AwayBlock[];
}): ScheduleDay {
  const { date, timezone } = opts;
  const noon = new Date(`${date}T12:00:00Z`);
  const label = noon.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  const dayOfWeek = noon.getUTCDay();
  const salon = opts.salonHours.find((h) => h.dayOfWeek === dayOfWeek);
  if (opts.salonHours.length > 0 && (!salon || salon.isClosed)) return { date, label, working: false, note: "the salon is closed" };
  let from = salon ? minutes(salon.openTime) ?? 0 : 0;
  let to = salon ? minutes(salon.closeTime) ?? 24 * 60 : 24 * 60;
  if (opts.rules.length > 0) {
    const rule = opts.rules.find((r) => r.dayOfWeek === dayOfWeek);
    if (!rule) return { date, label, working: false, note: "day off" };
    from = Math.max(from, minutes(rule.startTime) ?? from);
    to = Math.min(to, minutes(rule.endTime) ?? to);
    if (to <= from) return { date, label, working: false, note: "day off" };
  }
  // Time away that day, in the salon's time.
  const dayStart = fromZonedTime(`${date}T00:00:00`, timezone).getTime();
  const workStart = dayStart + from * 60_000, workEnd = dayStart + to * 60_000;
  const overlapping = opts.away.filter((b) => b.startsAt.getTime() < workEnd && b.endsAt.getTime() > workStart);
  if (overlapping.some((b) => b.allDay || (b.startsAt.getTime() <= workStart && b.endsAt.getTime() >= workEnd))) {
    return { date, label, working: false, note: "away" };
  }
  const note = overlapping.length
    ? `away ${overlapping.map((b) => `${formatInTimeZone(b.startsAt, timezone, "h:mm a")}–${formatInTimeZone(b.endsAt, timezone, "h:mm a")}`).join(", ")}`
    : undefined;
  return { date, label, working: true, from: clock(from), to: clock(to), ...(note ? { note } : {}) };
}

/** Every active technician (or the one named), for `days` days from `from` (salon dates). */
export async function getStaffSchedules(storeId: number, timezone: string, opts: { from?: string; days?: number; staffId?: number; name?: string } = {}): Promise<{ schedules: StaffSchedule[]; allNames: string[] }> {
  const tz = timezone || "UTC";
  const today = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
  const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) && opts.from >= today ? opts.from : today;
  const days = Math.max(1, Math.min(14, Math.round(opts.days ?? 7)));
  const dates = Array.from({ length: days }, (_, i) => { const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });

  const staffRows = (await pool.query(
    `SELECT id, name FROM staff
      WHERE store_id = $1 AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated') AND show_on_calendar IS NOT FALSE
      ORDER BY name`, [storeId])).rows as { id: number; name: string }[];
  const allNames = staffRows.map((s) => s.name);
  const wanted = opts.staffId ? staffRows.filter((s) => s.id === opts.staffId)
    : opts.name?.trim() ? matchByName(staffRows, opts.name) : staffRows;
  if (wanted.length === 0) return { schedules: [], allNames };
  const ids = wanted.map((s) => s.id);

  const [hours, rules, services, clocked, away] = await Promise.all([
    pool.query(`SELECT day_of_week, open_time, close_time, is_closed FROM business_hours WHERE store_id = $1`, [storeId]),
    pool.query(`SELECT staff_id, day_of_week, start_time, end_time FROM staff_availability WHERE staff_id = ANY($1::int[])`, [ids]),
    pool.query(`SELECT ss.staff_id, s.name FROM staff_services ss JOIN services s ON s.id = ss.service_id
                 WHERE ss.staff_id = ANY($1::int[]) AND s.store_id = $2 AND s.is_active IS NOT FALSE ORDER BY s.name`, [ids, storeId]),
    pool.query(`SELECT DISTINCT staff_id FROM timeclock WHERE store_id = $1 AND clock_out IS NULL AND work_date = $2 AND staff_id = ANY($3::int[])`, [storeId, today, ids]),
    pool.query(`SELECT staff_id, starts_at, ends_at, all_day FROM external_busy_blocks
                 WHERE store_id = $1 AND staff_id = ANY($2::int[]) AND status <> 'cancelled'
                   AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz`,
      [storeId, ids, fromZonedTime(`${dates[0]}T00:00:00`, tz).toISOString(), fromZonedTime(`${dates[dates.length - 1]}T23:59:59`, tz).toISOString()]),
  ]);
  const salonHours: HoursLine[] = hours.rows.map((r: any) => ({ dayOfWeek: r.day_of_week, openTime: r.open_time, closeTime: r.close_time, isClosed: !!r.is_closed }));
  const clockedIn = new Set(clocked.rows.map((r: any) => Number(r.staff_id)));

  const schedules = wanted.map((s): StaffSchedule => {
    const myRules: WeeklyRule[] = rules.rows.filter((r: any) => r.staff_id === s.id).map((r: any) => ({ dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time }));
    const myAway: AwayBlock[] = away.rows.filter((r: any) => r.staff_id === s.id).map((r: any) => ({ startsAt: new Date(r.starts_at), endsAt: new Date(r.ends_at), allDay: !!r.all_day }));
    return {
      staffId: s.id, name: s.name,
      services: services.rows.filter((r: any) => r.staff_id === s.id).map((r: any) => r.name),
      clockedInNow: clockedIn.has(s.id),
      days: dates.map((date) => scheduleForDay({ date, timezone: tz, salonHours, rules: myRules, away: myAway })),
    };
  });
  return { schedules, allNames };
}

/** "Tom", "tom lam", "Tommy" → the technicians whose name matches; first names count. */
export function matchByName<T extends { name: string }>(staff: T[], name: string): T[] {
  const q = name.trim().toLowerCase();
  const exact = staff.filter((s) => s.name.toLowerCase() === q);
  if (exact.length) return exact;
  const first = staff.filter((s) => s.name.toLowerCase().split(/\s+/)[0] === q.split(/\s+/)[0]);
  if (first.length) return first;
  return staff.filter((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase().split(/\s+/)[0]));
}

/** What the receptionist reads. Short lines; she answers from them in her own words. */
export function summarizeSchedules(result: { schedules: StaffSchedule[]; allNames: string[] }, askedName?: string): string {
  if (result.schedules.length === 0) {
    return askedName
      ? `No technician named "${askedName}" works here. The technicians are: ${result.allNames.join(", ") || "none listed"}.`
      : "No technicians are listed.";
  }
  return result.schedules.map((s) => {
    const days = s.days.map((d) => `${d.label}: ${d.working ? `${d.from} to ${d.to}${d.note ? ` (${d.note})` : ""}` : `not working (${d.note})`}`).join("; ");
    return `${s.name} — ${s.clockedInNow ? "clocked in right now" : "not clocked in right now"}. Does: ${s.services.join(", ") || "no services listed"}. Schedule: ${days}.`;
  }).join("\n");
}

/**
 * Operations reports (owner, 2026-10-29, plans/reports.md stage 4): what happens on the floor — bookings vs walk-ins,
 * how long clients wait, how long services really take, the busy hours, and which services and add-ons sell.
 */
import { pool } from "../../db";
import { previousRange, storeTimezone, type ReportRange } from "./money";
import { walkInSQL } from "../nailTickets";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
const ON_DAY = `(a.date AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`;

/** Appointments & walk-ins: booked vs walk-in, how many happened, and how far ahead people book. */
export async function appointmentsReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const counts = async (p: ReportRange) => (await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
            COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS no_shows,
            COUNT(*) FILTER (WHERE ${walkInSQL("a")})::int AS walk_ins,
            AVG(EXTRACT(EPOCH FROM (a.date - a.created_at)) / 86400) FILTER (WHERE NOT ${walkInSQL("a")} AND a.date > a.created_at) AS lead_days
       FROM appointments a WHERE a.store_id = $1 AND ${ON_DAY}`,
    [storeId, tz, p.from, p.to])).rows[0];
  const t = await counts(r);
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
  const byMonth = days > 93;
  const series = (await pool.query(
    `SELECT to_char((a.date AT TIME ZONE $2)::date, $5) AS label,
            COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
            COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS no_shows,
            COUNT(*) FILTER (WHERE ${walkInSQL("a")})::int AS walk_ins
       FROM appointments a WHERE a.store_id = $1 AND ${ON_DAY} GROUP BY 1 ORDER BY 1`,
    [storeId, tz, r.from, r.to, byMonth ? "YYYY-MM" : "YYYY-MM-DD"])).rows;
  let previous = null;
  if (compare) { const p = previousRange(r); const y = await counts(p); previous = { range: p, total: y.total, completed: y.completed, walkIns: y.walk_ins }; }
  return {
    range: r, by: byMonth ? "month" : "day",
    totals: { total: t.total, completed: t.completed, cancelled: t.cancelled, noShows: t.no_shows, walkIns: t.walk_ins,
      booked: t.total - t.walk_ins, leadDays: t.lead_days != null ? Math.round(num(t.lead_days) * 10) / 10 : null },
    series, previous,
  };
}

/** Wait times: from check-in to the service starting — average, median, slowest 10%, by hour and day. */
export async function waitTimesReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const waits = `FROM appointments a WHERE a.store_id = $1 AND a.checked_in_at IS NOT NULL AND a.started_at IS NOT NULL
      AND a.started_at >= a.checked_in_at AND a.started_at - a.checked_in_at < interval '6 hours'
      AND (a.checked_in_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`;
  const mins = `EXTRACT(EPOCH FROM (a.started_at - a.checked_in_at)) / 60`;
  const summary = async (p: ReportRange) => (await pool.query(
    `SELECT COUNT(*)::int AS n, AVG(${mins}) AS avg, percentile_cont(0.5) WITHIN GROUP (ORDER BY ${mins}) AS median,
            percentile_cont(0.9) WITHIN GROUP (ORDER BY ${mins}) AS p90, COUNT(*) FILTER (WHERE ${mins} <= 15)::int AS within15 ${waits}`,
    [storeId, tz, p.from, p.to])).rows[0];
  const s = await summary(r);
  const byHour = (await pool.query(
    `SELECT EXTRACT(HOUR FROM a.checked_in_at AT TIME ZONE $2)::int AS hour, COUNT(*)::int AS n, AVG(${mins}) AS avg ${waits} GROUP BY 1 ORDER BY 1`,
    [storeId, tz, r.from, r.to])).rows.map((x: any) => ({ hour: x.hour, clients: x.n, avg: Math.round(num(x.avg)) }));
  const byDay = (await pool.query(
    `SELECT EXTRACT(DOW FROM a.checked_in_at AT TIME ZONE $2)::int AS dow, COUNT(*)::int AS n, AVG(${mins}) AS avg ${waits} GROUP BY 1 ORDER BY 1`,
    [storeId, tz, r.from, r.to])).rows.map((x: any) => ({ dow: x.dow, clients: x.n, avg: Math.round(num(x.avg)) }));
  const round = (v: unknown) => (v == null ? null : Math.round(num(v)));
  let previous = null;
  if (compare) { const p = previousRange(r); const y = await summary(p); previous = { range: p, avg: round(y.avg) }; }
  return {
    range: r,
    totals: { clients: s.n, avg: round(s.avg), median: round(s.median), p90: round(s.p90), within15: s.n ? Math.round((s.within15 / s.n) * 100) : null },
    byHour, byDay, previous,
  };
}

/** Service times: how long each service really takes (START to DONE) against the time it is booked for. */
export async function serviceTimesReport(storeId: number, r: ReportRange, _compare: boolean) {
  const tz = await storeTimezone(storeId);
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.duration AS booked, COUNT(*)::int AS n, AVG(a.actual_minutes) AS avg,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY a.actual_minutes) AS median
       FROM appointments a JOIN services s ON s.id = a.service_id
      WHERE a.store_id = $1 AND a.actual_minutes > 0 AND (COALESCE(a.completed_at, a.date) AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      GROUP BY s.id, s.name, s.duration ORDER BY n DESC`,
    [storeId, tz, r.from, r.to],
  );
  return { range: r, services: rows.map((x: any) => {
    const avg = Math.round(num(x.avg));
    return { id: x.id, name: x.name, timed: x.n, booked: Number(x.booked) || 0, avg, median: Math.round(num(x.median)), over: avg - (Number(x.booked) || 0) };
  }) };
}

/** Busiest times: when clients come in, by day of the week and hour (check-in, else the start of the service). */
export async function busyTimesReport(storeId: number, r: ReportRange, _compare: boolean) {
  const tz = await storeTimezone(storeId);
  const at = `COALESCE(a.checked_in_at, a.started_at, a.date)`;
  const { rows } = await pool.query(
    `SELECT EXTRACT(DOW FROM ${at} AT TIME ZONE $2)::int AS dow, EXTRACT(HOUR FROM ${at} AT TIME ZONE $2)::int AS hour, COUNT(*)::int AS n
       FROM appointments a WHERE a.store_id = $1 AND a.status IN ('completed','started','confirmed')
        AND (${at} AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date GROUP BY 1, 2`,
    [storeId, tz, r.from, r.to],
  );
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const x of rows as any[]) heat[x.dow][x.hour] = x.n;
  // How many of each weekday the range holds, for a per-day average.
  const weekdays = Array(7).fill(0);
  for (let t = Date.parse(r.from); t <= Date.parse(r.to); t += 86_400_000) weekdays[new Date(t).getUTCDay()] += 1;
  const perDay = heat.map((row, d) => ({ dow: d, clients: row.reduce((s, n) => s + n, 0), avgPerDay: weekdays[d] ? r2(row.reduce((s, n) => s + n, 0) / weekdays[d]) : 0 }));
  return { range: r, heat, perDay };
}

/** Services & add-ons: what sells — how often, for how much — and how often each add-on goes with a service. */
export async function servicesReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const PAID_IN = `a.store_id = $1 AND a.status = 'completed' AND (COALESCE(a.completed_at, a.date) AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`;
  const services = (await pool.query(
    `SELECT s.id, s.name, COUNT(*)::int AS n, COALESCE(SUM(COALESCE(a.service_price, s.price)), 0) AS revenue
       FROM appointments a JOIN services s ON s.id = a.service_id WHERE ${PAID_IN}
      GROUP BY s.id, s.name ORDER BY n DESC`,
    [storeId, tz, r.from, r.to])).rows;
  const tickets = (await pool.query(`SELECT COUNT(*)::int AS n FROM appointments a WHERE ${PAID_IN}`, [storeId, tz, r.from, r.to])).rows[0].n;
  const addons = (await pool.query(
    `SELECT d.id, d.name, COUNT(*)::int AS n, COUNT(DISTINCT aa.appointment_id)::int AS tickets, COALESCE(SUM(d.price), 0) AS revenue
       FROM appointment_addons aa JOIN appointments a ON a.id = aa.appointment_id JOIN addons d ON d.id = aa.addon_id
      WHERE ${PAID_IN} GROUP BY d.id, d.name ORDER BY n DESC`,
    [storeId, tz, r.from, r.to])).rows;
  let previous = null;
  if (compare) {
    const p = previousRange(r);
    const prev = (await pool.query(`SELECT s.id, COUNT(*)::int AS n FROM appointments a JOIN services s ON s.id = a.service_id WHERE ${PAID_IN} GROUP BY s.id`,
      [storeId, tz, p.from, p.to])).rows;
    previous = { range: p, byService: Object.fromEntries(prev.map((x: any) => [x.id, x.n])) };
  }
  return {
    range: r, tickets,
    services: services.map((x: any) => ({ id: x.id, name: x.name, count: x.n, revenue: r2(num(x.revenue)), avgPrice: x.n ? r2(num(x.revenue) / x.n) : 0 })),
    addons: addons.map((x: any) => ({ id: x.id, name: x.name, count: x.n, revenue: r2(num(x.revenue)), attachRate: tickets ? Math.round((x.tickets / tickets) * 1000) / 10 : 0 })),
    previous,
  };
}

export const OPERATIONS_REPORTS = { appointments: appointmentsReport, "wait-times": waitTimesReport, "service-times": serviceTimesReport, "busy-times": busyTimesReport, services: servicesReport } as const;

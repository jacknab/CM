/**
 * Team reports (owner, 2026-10-29, plans/reports.md stage 2). A ticket belongs to the technician on it and to the day
 * it was checked out, in the salon's timezone. Net sales = service + product sales after discount (before tax and tip).
 */
import { pool } from "../../db";
import { previousRange, storeTimezone, type ReportRange } from "./money";
import { TURN_UNIT } from "@shared/turnRules";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
const PAID_DAY = `(COALESCE(a.completed_at, a.date) AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`;

async function staffRows(storeId: number, tz: string, r: ReportRange) {
  const { rows } = await pool.query(
    `SELECT a.staff_id, st.name,
            COUNT(*)::int AS tickets,
            COUNT(DISTINCT a.customer_id)::int AS clients,
            COALESCE(SUM(a.service_revenue), 0) AS services, COALESCE(SUM(a.product_revenue), 0) AS products,
            COALESCE(SUM(a.discount_amount), 0) AS discounts, COALESCE(SUM(a.tip_amount), 0) AS tips,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM appointment_addons aa WHERE aa.appointment_id = a.id))::int AS with_addons,
            AVG(a.actual_minutes) FILTER (WHERE a.actual_minutes > 0) AS avg_minutes,
            COALESCE(SUM(a.actual_minutes) FILTER (WHERE a.actual_minutes > 0), 0) AS service_minutes,
            -- Came back: the client has another finished visit within 60 days after this one.
            COUNT(*) FILTER (WHERE a.customer_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM appointments n WHERE n.store_id = a.store_id AND n.customer_id = a.customer_id AND n.status = 'completed'
                AND COALESCE(n.ticket_group_id, n.id) <> COALESCE(a.ticket_group_id, a.id)
                AND COALESCE(n.completed_at, n.date) > COALESCE(a.completed_at, a.date)
                AND COALESCE(n.completed_at, n.date) <= COALESCE(a.completed_at, a.date) + interval '60 days'))::int AS came_back,
            COUNT(*) FILTER (WHERE a.customer_id IS NOT NULL)::int AS with_client
       FROM appointments a JOIN staff st ON st.id = a.staff_id
      WHERE a.store_id = $1 AND a.status = 'completed' AND ${PAID_DAY}
      GROUP BY a.staff_id, st.name`,
    [storeId, tz, r.from, r.to],
  );
  return rows;
}

async function clockedHours(storeId: number, r: ReportRange): Promise<Map<number, { hours: number; days: number }>> {
  const { rows } = await pool.query(
    `SELECT staff_id, COUNT(DISTINCT work_date)::int AS days,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out, LEAST(now(), clock_in + interval '14 hours')) - clock_in))) / 3600, 0) AS hours
       FROM timeclock WHERE store_id = $1 AND work_date BETWEEN $2 AND $3 GROUP BY staff_id`,
    [storeId, r.from, r.to],
  );
  return new Map(rows.map((x: any) => [Number(x.staff_id), { hours: r2(num(x.hours)), days: Number(x.days) || 0 }]));
}

/** Staff performance: sales, tickets, average ticket, tips, add-on rate, clients who came back, time per service. */
export async function staffReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const rows = await staffRows(storeId, tz, r);
  const hours = await clockedHours(storeId, r);
  const staff = rows.map((x: any) => {
    const netSales = r2(num(x.services) + num(x.products) - num(x.discounts));
    const h = hours.get(Number(x.staff_id));
    return {
      staffId: Number(x.staff_id), name: x.name, tickets: x.tickets, clients: x.clients, netSales,
      services: r2(num(x.services)), products: r2(num(x.products)), tips: r2(num(x.tips)),
      avgTicket: x.tickets ? r2(netSales / x.tickets) : 0,
      addonRate: x.tickets ? Math.round((x.with_addons / x.tickets) * 100) : 0,
      cameBackRate: x.with_client ? Math.round((x.came_back / x.with_client) * 100) : 0,
      avgMinutes: x.avg_minutes != null ? Math.round(num(x.avg_minutes)) : null,
      hours: h?.hours ?? 0, days: h?.days ?? 0, salesPerHour: h?.hours ? r2(netSales / h.hours) : null,
    };
  }).sort((a, b) => b.netSales - a.netSales);
  let previous = null;
  if (compare) {
    const p = previousRange(r);
    const prev = await staffRows(storeId, tz, p);
    previous = { range: p, byStaff: Object.fromEntries(prev.map((x: any) => [x.staff_id, r2(num(x.services) + num(x.products) - num(x.discounts))])) };
  }
  const totals = {
    netSales: r2(staff.reduce((s, x) => s + x.netSales, 0)), tickets: staff.reduce((s, x) => s + x.tickets, 0),
    tips: r2(staff.reduce((s, x) => s + x.tips, 0)), hours: r2(staff.reduce((s, x) => s + x.hours, 0)),
  };
  return { range: r, totals, staff, previous };
}

/** Hours & chair use: hours on the clock against time spent with clients (START to DONE). */
export async function hoursReport(storeId: number, r: ReportRange, _compare: boolean) {
  const tz = await storeTimezone(storeId);
  const hours = await clockedHours(storeId, r);
  const { rows } = await pool.query(
    `SELECT st.id AS staff_id, st.name,
            COALESCE(SUM(a.actual_minutes) FILTER (WHERE a.actual_minutes > 0), 0) AS service_minutes,
            COUNT(a.id) FILTER (WHERE a.actual_minutes > 0)::int AS timed
       FROM staff st LEFT JOIN appointments a ON a.staff_id = st.id AND a.store_id = st.store_id AND a.status = 'completed' AND ${PAID_DAY}
      WHERE st.store_id = $1
      GROUP BY st.id, st.name`,
    [storeId, tz, r.from, r.to],
  );
  const staff = rows.map((x: any) => {
    const h = hours.get(Number(x.staff_id));
    const serviceHours = r2(num(x.service_minutes) / 60);
    return { staffId: Number(x.staff_id), name: x.name, hours: h?.hours ?? 0, days: h?.days ?? 0, serviceHours, timed: x.timed,
      chairUse: h?.hours ? Math.min(100, Math.round((serviceHours / h.hours) * 100)) : null };
  }).filter((x) => x.hours > 0 || x.serviceHours > 0).sort((a, b) => b.hours - a.hours);
  const total = { hours: r2(staff.reduce((s, x) => s + x.hours, 0)), serviceHours: r2(staff.reduce((s, x) => s + x.serviceHours, 0)) };
  return { range: r, totals: { ...total, chairUse: total.hours ? Math.min(100, Math.round((total.serviceHours / total.hours) * 100)) : null }, staff };
}

/** Turns: turns each technician earned, how many tickets the turn system gave them, and manager adjustments. */
export async function turnsReport(storeId: number, r: ReportRange, _compare: boolean) {
  const tz = await storeTimezone(storeId);
  const { rows } = await pool.query(
    `SELECT e.staff_id, st.name,
            COALESCE(SUM(e.turn_units) FILTER (WHERE e.kind = 'credited'), 0) AS earned_units,
            COUNT(*) FILTER (WHERE e.kind = 'credited')::int AS credited,
            COUNT(*) FILTER (WHERE e.kind = 'assigned')::int AS assigned,
            COUNT(*) FILTER (WHERE e.kind = 'adjusted')::int AS adjustments,
            COALESCE(SUM(e.turn_units) FILTER (WHERE e.kind = 'adjusted'), 0) AS adjusted_units,
            COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'credited'), 0) AS amount_cents
       FROM turn_events e JOIN staff st ON st.id = e.staff_id
      WHERE e.store_id = $1 AND (e.at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      GROUP BY e.staff_id, st.name`,
    [storeId, tz, r.from, r.to],
  );
  // Turns are stored in thousandths of a turn (shared/turnRules TURN_UNIT).
  const units = (v: unknown) => r2(num(v) / TURN_UNIT);
  const staff = rows.map((x: any) => ({
    staffId: Number(x.staff_id), name: x.name, turns: units(x.earned_units), credited: x.credited, assigned: x.assigned,
    adjustments: x.adjustments, adjustedTurns: units(x.adjusted_units), turnSales: r2(num(x.amount_cents) / 100),
  })).sort((a, b) => b.turns - a.turns);
  return { range: r, staff };
}

export const TEAM_REPORTS = { staff: staffReport, hours: hoursReport, turns: turnsReport } as const;

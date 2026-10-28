/**
 * Owner Dashboard Cache
 *
 * Redis-backed per-store cache of the owner dashboard aggregations.
 * Falls back to live DB computation when Redis is unavailable.
 *
 * Key:  dashboard:{storeId}
 * TTL:  30 seconds
 */

import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { getRedisClient } from "./redis";
import { locations } from "@shared/schema";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { allocateTenders } from "./tenderAllocation";

const CACHE_KEY_PREFIX = "dashboard:v2:"; // v2 (2026-10-29): the slimmed dashboard shape — old cached shapes are never read
const CACHE_TTL_SECONDS = 30;

function makeKey(storeId: number): string {
  return `${CACHE_KEY_PREFIX}${storeId}`;
}

/**
 * What the owner dashboard shows (owner audit 2026-10-29: only what a salon owner uses to run the day — today's
 * money, who is in the chair or waiting, the team, what needs attention, Autumn's calls, who's coming).
 * Money is what the checkout froze on each ticket: net sales = service + product sales after discount (before tax and
 * tip); payment methods come from tenderAllocation so split payments split correctly.
 */
export interface DashboardData {
  today: {
    netSales: number;
    yesterdayNetSales: number;
    salesDiff: number;
    visits: number;
    avgTicket: number;
    appointments: { completed: number; inService: number; waiting: number; upcoming: number; noShow: number };
    /** Longest current wait (minutes) of a client checked in and not started. */
    longestWaitMinutes: number | null;
    team: { working: number };
  };
  todayFinancials: {
    netSales: number; services: number; products: number; discounts: number; tax: number; tips: number; collected: number;
    byMethod: Record<string, number>;
  };
  schedule: {
    id: number; time: string; duration: number; customerType: "New" | "Regular" | "VIP"; customerName: string; serviceName: string;
    staffId: number | null; staffName: string | null; staffAvatarThumbUrl: string | null; status: string; totalPaid: number;
    startedAt: string | null; checkedInAt: string | null;
  }[];
  needsAttention: { type: string; label: string; count: number; priority: "high" | "medium" | "low" }[];
  teamPerformance: { name: string; sales: number; tickets: number; tips: number; avgTicket: number }[];
  aiReceptionist: { todayCalls: number; booked: number; missed: number; isLive: boolean };
  computedAt: number;
}

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Core computation ──────────────────────────────────────────────────────────

export async function computeDashboard(storeId: number): Promise<DashboardData> {
  const now = new Date();
  const [tzRow] = await db.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId)).limit(1);
  const storeTz = (tzRow as any)?.timezone ?? "UTC";
  // Today and yesterday in the SALON's timezone.
  const todayDateKey = formatInTimeZone(now, storeTz, "yyyy-MM-dd");
  const todayStart = fromZonedTime(`${todayDateKey}T00:00:00.000`, storeTz);
  const todayEnd = fromZonedTime(`${todayDateKey}T23:59:59.999`, storeTz);
  const yesterdayDateKey = formatInTimeZone(new Date(now.getTime() - 86400000), storeTz, "yyyy-MM-dd");
  const yesterdayStart = fromZonedTime(`${yesterdayDateKey}T00:00:00.000`, storeTz);
  const yesterdayEnd = fromZonedTime(`${yesterdayDateKey}T23:59:59.999`, storeTz);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
  const T0 = todayStart.toISOString(), T1 = todayEnd.toISOString();

  const [todayRows, yesterdayRow, lapsedRow, clockedInRow, aiRows, waitingMarkersRow] = await Promise.all([
    // Today's tickets: booked for today, or paid today (a ticket paid today belongs to today's money).
    db.execute(sql`
      WITH visit_counts AS (
        SELECT customer_id, COUNT(*) AS visit_count FROM appointments
         WHERE store_id = ${storeId} AND status = 'completed' AND customer_id IS NOT NULL GROUP BY customer_id)
      SELECT a.id, a.status, a.total_paid, a.payment_method, a.service_revenue, a.product_revenue, a.discount_amount,
             a.tax_amount, a.tip_amount, a.ticket_group_id,
             a.date, a.duration, a.started_at, a.checked_in_at, a.completed_at,
             s.name AS staff_name, s.id AS staff_id, s.avatar_thumb_url AS staff_avatar_thumb_url,
             sv.name AS service_name, c.full_name AS customer_name, a.customer_id, COALESCE(vc.visit_count, 0) AS visit_count
        FROM appointments a
        LEFT JOIN staff s ON s.id = a.staff_id AND s.store_id = ${storeId}
        LEFT JOIN services sv ON sv.id = a.service_id AND sv.store_id = ${storeId}
        LEFT JOIN clients c ON c.id::text = a.customer_id::text AND c.store_id = ${storeId}
        LEFT JOIN visit_counts vc ON vc.customer_id = a.customer_id
       WHERE a.store_id = ${storeId} AND a.status NOT IN ('cancelled')
         AND ((a.date >= ${T0} AND a.date <= ${T1}) OR (a.completed_at >= ${T0} AND a.completed_at <= ${T1}))
       ORDER BY COALESCE(a.completed_at, a.date) ASC`),
    // Yesterday's net sales (paid yesterday).
    db.execute(sql`
      SELECT COALESCE(SUM(COALESCE(service_revenue, total_paid - COALESCE(tip_amount, 0) - COALESCE(tax_amount, 0) + COALESCE(discount_amount, 0))
                          + COALESCE(product_revenue, 0) - COALESCE(discount_amount, 0)), 0)::float AS net
        FROM appointments
       WHERE store_id = ${storeId} AND status = 'completed' AND total_paid IS NOT NULL
         AND COALESCE(completed_at, date) >= ${yesterdayStart.toISOString()} AND COALESCE(completed_at, date) <= ${yesterdayEnd.toISOString()}`),
    // Regulars (2+ visits) not back in 60+ days — the win-back list (Reports › Lapsed clients).
    db.execute(sql`
      SELECT COUNT(*) AS lapsed FROM (
        SELECT a.customer_id FROM appointments a
          JOIN clients c ON c.id::text = a.customer_id::text AND c.store_id = ${storeId} AND c.archived_at IS NULL
         WHERE a.store_id = ${storeId} AND a.status = 'completed' AND a.customer_id IS NOT NULL
         GROUP BY a.customer_id
        HAVING COUNT(DISTINCT COALESCE(a.ticket_group_id, a.id)) >= 2 AND MAX(COALESCE(a.completed_at, a.date)) < ${sixtyDaysAgo.toISOString()}) t`),
    db.execute(sql`SELECT COUNT(DISTINCT staff_id) AS clocked_in FROM timeclock WHERE store_id = ${storeId} AND work_date = ${todayDateKey} AND clock_out IS NULL`)
      .catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT COUNT(*) AS total_calls, COUNT(*) FILTER (WHERE outcome = 'booked' OR appointment_id IS NOT NULL) AS booked,
             COUNT(*) FILTER (WHERE outcome NOT IN ('booked','in_progress','callback_required') AND outcome IS NOT NULL AND appointment_id IS NULL) AS missed
        FROM ai_call_log WHERE store_id = ${storeId} AND started_at >= ${T0}`).catch(() => ({ rows: [] })),
    // Kiosk check-ins with no ticket yet: waiting too.
    db.execute(sql`
      SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM kiosk_checkins
       WHERE store_id = ${storeId} AND status = 'waiting' AND appointment_id IS NULL AND created_at >= ${T0}`).catch(() => ({ rows: [] })),
  ]);

  const todayAppts = todayRows.rows as any[];
  // Checked in, not started yet: waiting (the ticket's status is still 'confirmed').
  const isWaiting = (a: any) => ["confirmed", "pending"].includes(a.status) && a.checked_in_at && !a.started_at;
  const paidToday = todayAppts.filter((a) => a.status === "completed" && a.completed_at && new Date(a.completed_at) >= todayStart);
  const saleOf = (a: any) => {
    const total = num(a.total_paid), tip = num(a.tip_amount), tax = num(a.tax_amount), discount = num(a.discount_amount);
    const services = a.service_revenue != null ? num(a.service_revenue) : Math.max(0, total - tip - tax + discount);
    const products = num(a.product_revenue);
    return { services, products, discount, tax, tip, total, net: services + products - discount };
  };
  const sales = paidToday.map(saleOf);
  const sum = (k: keyof ReturnType<typeof saleOf>) => r2(sales.reduce((s, x) => s + x[k], 0));
  const netSales = sum("net");
  const visits = new Set(paidToday.map((a) => a.ticket_group_id ?? a.id)).size;

  const byMethod: Record<string, number> = {};
  const shares = allocateTenders(paidToday.map((a) => ({ id: a.id, totalPaid: a.total_paid, paymentMethod: a.payment_method, date: new Date(a.completed_at) })) as any);
  for (const m of shares.values()) for (const [k, v] of Object.entries(m)) byMethod[k] = r2((byMethod[k] ?? 0) + v);

  const markers = (waitingMarkersRow.rows[0] as any) ?? {};
  const waitingTickets = todayAppts.filter(isWaiting);
  const oldestWait = [...waitingTickets.map((a) => new Date(a.checked_in_at).getTime()), ...(markers.oldest ? [new Date(markers.oldest).getTime()] : [])];
  const longestWaitMinutes = oldestWait.length ? Math.max(0, Math.round((now.getTime() - Math.min(...oldestWait)) / 60000)) : null;
  const appointmentBreakdown = {
    completed: todayAppts.filter((a) => a.status === "completed").length,
    inService: todayAppts.filter((a) => a.status === "started").length,
    waiting: waitingTickets.length + num(markers.n),
    upcoming: todayAppts.filter((a) => ["confirmed", "pending"].includes(a.status) && !isWaiting(a) && new Date(a.date) > now).length,
    noShow: todayAppts.filter((a) => a.status === "no_show").length,
  };
  const yesterdayNetSales = r2(num((yesterdayRow.rows[0] as any)?.net));

  // Needs attention: only what the owner can act on now.
  const needsAttention: DashboardData["needsAttention"] = [];
  if (appointmentBreakdown.waiting > 0 && (longestWaitMinutes ?? 0) >= 20) {
    needsAttention.push({ type: "waiting", label: `${appointmentBreakdown.waiting} waiting · longest ${longestWaitMinutes} min`, count: appointmentBreakdown.waiting, priority: "high" });
  }
  if (appointmentBreakdown.noShow > 0) {
    needsAttention.push({ type: "no_shows", label: `${appointmentBreakdown.noShow} no-show${appointmentBreakdown.noShow !== 1 ? "s" : ""} today`, count: appointmentBreakdown.noShow, priority: "medium" });
  }
  const lapsed = num((lapsedRow.rows[0] as any)?.lapsed);
  if (lapsed > 0) {
    needsAttention.push({ type: "lost_clients", label: `${lapsed} regular${lapsed !== 1 ? "s" : ""} not back in 60+ days`, count: lapsed, priority: "medium" });
  }

  const classify = (visitCount: number): "New" | "Regular" | "VIP" => (visitCount >= 10 ? "VIP" : visitCount <= 1 ? "New" : "Regular");
  const shortName = (fullName: string | null) => {
    if (!fullName) return "Guest";
    const parts = fullName.trim().split(/\s+/);
    return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };
  const schedule: DashboardData["schedule"] = todayAppts.map((a) => ({
    id: a.id, time: a.date, duration: a.duration, customerType: classify(parseInt(a.visit_count || "0", 10)), customerName: shortName(a.customer_name),
    serviceName: a.service_name || "Service", staffId: a.staff_id ? Number(a.staff_id) : null, staffName: a.staff_name || null,
    staffAvatarThumbUrl: a.staff_avatar_thumb_url || null,
    // A checked-in ticket not started yet shows as waiting.
    status: isWaiting(a) ? "waiting" : a.status,
    totalPaid: num(a.total_paid),
    startedAt: a.started_at ? new Date(a.started_at).toISOString() : null, checkedInAt: a.checked_in_at ? new Date(a.checked_in_at).toISOString() : null,
  }));

  // Each technician's tickets paid today: net sales, tips, average ticket.
  const team = new Map<string, { name: string; sales: number; tickets: number; tips: number }>();
  paidToday.forEach((a, i) => {
    if (!a.staff_name) return;
    const e = team.get(a.staff_name) ?? { name: a.staff_name, sales: 0, tickets: 0, tips: 0 };
    e.sales = r2(e.sales + sales[i].net); e.tips = r2(e.tips + sales[i].tip); e.tickets += 1;
    team.set(a.staff_name, e);
  });
  const teamPerformance = [...team.values()].sort((x, y) => y.sales - x.sales).map((m) => ({ ...m, avgTicket: m.tickets ? r2(m.sales / m.tickets) : 0 }));

  const aiRow = (aiRows.rows[0] as any) || {};
  return {
    today: {
      netSales, yesterdayNetSales, salesDiff: r2(netSales - yesterdayNetSales), visits, avgTicket: visits ? r2(netSales / visits) : 0,
      appointments: appointmentBreakdown, longestWaitMinutes,
      team: { working: num((clockedInRow.rows[0] as any)?.clocked_in) },
    },
    todayFinancials: { netSales, services: sum("services"), products: sum("products"), discounts: sum("discount"), tax: sum("tax"), tips: sum("tip"), collected: sum("total"), byMethod },
    schedule,
    needsAttention,
    teamPerformance,
    aiReceptionist: { todayCalls: num(aiRow.total_calls), booked: num(aiRow.booked), missed: num(aiRow.missed), isLive: true },
    computedAt: Date.now(),
  };
}

// ─── Redis helpers ─────────────────────────────────────────────────────────────

export async function getDashboardCache(
  storeId: number,
): Promise<DashboardData | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(makeKey(storeId));
    if (!raw) return null;
    return JSON.parse(raw) as DashboardData;
  } catch {
    return null;
  }
}

export async function setDashboardCache(
  storeId: number,
  data: DashboardData,
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(
      makeKey(storeId),
      JSON.stringify(data),
      "EX",
      CACHE_TTL_SECONDS,
    );
  } catch {}
}

export async function invalidateDashboardCache(storeId: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(makeKey(storeId));
  } catch {}
}

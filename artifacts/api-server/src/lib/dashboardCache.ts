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
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { getRecentActivity } from "./activityFeed";

const CACHE_KEY_PREFIX = "dashboard:";
const CACHE_TTL_SECONDS = 30;

function makeKey(storeId: number): string {
  return `${CACHE_KEY_PREFIX}${storeId}`;
}

export interface DashboardData {
  today: {
    revenue: number;
    yesterdayRevenue: number;
    revenueDiff: number;
    byPaymentMethod: Record<string, number>;
    totalAppointments: number;
    appointments: {
      completed: number;
      inService: number;
      waiting: number;
      upcoming: number;
      noShow: number;
    };
    clients: {
      total: number;
      new: number;
      returning: number;
      returningPct: number;
    };
    team: {
      working: number;
      servicesCompleted: number;
      generated: number;
    };
  };
  schedule: Array<{
    id: number;
    time: string;
    duration: number;
    customerType: "New" | "Regular" | "VIP";
    customerName: string;
    serviceName: string;
    staffId: number | null;
    staffName: string | null;
    staffAvatarThumbUrl: string | null;
    status: string;
    totalPaid: number;
    startedAt: string | null;
    checkedInAt: string | null;
  }>;
  monthRevenue: {
    total: number;
    byPaymentMethod: Record<string, number>;
  };
  clientLoyalty: {
    returningClients: number;
    newClients: number;
    allTimeClients: number;
    retentionPct: number;
    avgVisitsPerClient: number;
  };
  needsAttention: Array<{
    type: string;
    label: string;
    count?: number;
    priority: "high" | "medium" | "low";
  }>;
  recentActivity: Array<{
    id: number;
    eventType: string;
    message: string;
    amount: number | null;
    createdAt: string;
  }>;
  // ── NEW SECTIONS ──────────────────────────────────────────────────────────
  topServices: Array<{
    rank: number;
    name: string;
    revenue: number;
    count: number;
  }>;
  teamPerformance: Array<{
    name: string;
    sales: number;
    appointments: number;
    avgTicket: number;
  }>;
  aiReceptionist: {
    todayCalls: number;
    booked: number;
    missed: number;
    isLive: boolean;
  };
  inventoryAlerts: Array<{
    name: string;
    category: string | null;
    stock: number;
    threshold: number;
  }>;
  todayFinancials: {
    totalRevenue: number;
    serviceSales: number;
    productSales: number;
    tips: number;
    totalPayments: number;
    byMethod: Record<string, number>;
    outstandingBalance: number;
  };
  clientLoyaltySnapshot: {
    vipClients: number;
    regulars: number;
    newThisMonth: number;
    atRisk: number;
  };
  glanceStats: {
    walkInsToday: number;
    avgWaitMinutes: number;
    occupancyPct: number;
    avgTicket: number;
    tipsPct: number;
    clientRetentionPct: number;
  };
  newClientsThisWeek: {
    count: number;
    vsLastWeek: number;
  };
  computedAt: number;
}

// ─── Core computation ──────────────────────────────────────────────────────────

export async function computeDashboard(storeId: number): Promise<DashboardData> {
  const now = new Date();

  // Fetch store timezone FIRST so all date boundaries use salon-local time,
  // not server local time (which may be UTC or a different zone on VPS servers).
  const [tzRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);
  const storeTz = (tzRow as any)?.timezone ?? "UTC";

  // Today's date string in the store's local timezone (formatInTimeZone is safe in date-fns-tz v3)
  const todayDateKey = formatInTimeZone(now, storeTz, "yyyy-MM-dd");

  // Compute UTC timestamps for the start and end of today IN THE STORE'S TIMEZONE.
  // fromZonedTime() converts a local clock time string → UTC Date correctly in v3.
  const todayStart = fromZonedTime(`${todayDateKey}T00:00:00.000`, storeTz);
  const todayEnd   = fromZonedTime(`${todayDateKey}T23:59:59.999`, storeTz);

  const yesterdayDateKey = formatInTimeZone(new Date(now.getTime() - 86400000), storeTz, "yyyy-MM-dd");
  const yesterdayStart = fromZonedTime(`${yesterdayDateKey}T00:00:00.000`, storeTz);
  const yesterdayEnd   = fromZonedTime(`${yesterdayDateKey}T23:59:59.999`, storeTz);

  // Month boundaries — derived entirely in store-local time to avoid UTC-midnight
  // boundary crossings that would shift the date in negative-offset timezones.
  const storeYearStr  = formatInTimeZone(now, storeTz, "yyyy");
  const storeMonthStr = formatInTimeZone(now, storeTz, "MM"); // zero-padded, 1-based
  const storeYear     = parseInt(storeYearStr, 10);
  const storeMonth    = parseInt(storeMonthStr, 10); // 1-based

  // First moment of the current month in store timezone → UTC
  const monthStart = fromZonedTime(`${storeYearStr}-${storeMonthStr}-01T00:00:00.000`, storeTz);

  // Last moment of the current month: take the first moment of NEXT month (in store tz)
  // then subtract 1 ms.  This avoids any Date.UTC-midnight-to-local-date conversion.
  const nextMonthYear  = storeMonth === 12 ? storeYear + 1 : storeYear;
  const nextMonthNum   = storeMonth === 12 ? 1 : storeMonth + 1;
  const nextMonthStart = fromZonedTime(
    `${String(nextMonthYear)}-${String(nextMonthNum).padStart(2, "0")}-01T00:00:00.000`,
    storeTz,
  );
  const monthEnd = new Date(nextMonthStart.getTime() - 1);

  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(todayStart.getTime() - 14 * 86400000);

  const [
    todayRows,
    yesterdayRows,
    monthRows,
    clientCountRows,
    avgVisitsRows,
    lostClientsRow,
    clockedInRow,
    recentActivity,
    topServicesRows,
    aiRows,
    inventoryRows,
    tipsRow,
    walkInsRow,
    avgWaitRow,
    vipRow,
    atRiskRow,
    newThisMonthRow,
    newThisWeekRow,
    newLastWeekRow,
  ] = await Promise.all([
    // Today's appointments — includes any appointment:
    //   • scheduled today (date within today's window in the store's timezone), OR
    //   • completed/paid today (completed_at within today's window)
    // This ensures revenue is never missed when an appointment was rescheduled
    // or when a walk-in ticket has a date that doesn't align with the local day.
    db.execute(sql`
      WITH visit_counts AS (
        SELECT customer_id, COUNT(*) AS visit_count
        FROM appointments
        WHERE store_id = ${storeId}
          AND status = 'completed'
          AND customer_id IS NOT NULL
        GROUP BY customer_id
      )
      SELECT
        a.id, a.status, a.total_paid, a.payment_method,
        a.stripe_payment_intent_id,
        a.date, a.duration, a.started_at, a.checked_in_at, a.completed_at,
        s.name  AS staff_name,  s.id   AS staff_id, s.avatar_thumb_url AS staff_avatar_thumb_url,
        sv.name AS service_name,
        c.full_name AS customer_name,
        a.customer_id,
        COALESCE(vc.visit_count, 0) AS visit_count
      FROM appointments a
      LEFT JOIN staff    s  ON s.id  = a.staff_id   AND s.store_id  = ${storeId}
      LEFT JOIN services sv ON sv.id = a.service_id AND sv.store_id = ${storeId}
      LEFT JOIN clients  c  ON c.id::text = a.customer_id::text AND c.store_id = ${storeId}
      LEFT JOIN visit_counts vc ON vc.customer_id = a.customer_id
      WHERE a.store_id = ${storeId}
        AND a.status NOT IN ('cancelled')
        AND (
          -- Scheduled today
          (a.date >= ${todayStart.toISOString()} AND a.date <= ${todayEnd.toISOString()})
          OR
          -- Completed/paid today (catches rescheduled or cross-day walk-ins)
          (a.completed_at >= ${todayStart.toISOString()} AND a.completed_at <= ${todayEnd.toISOString()})
        )
      ORDER BY COALESCE(a.completed_at, a.date) ASC
    `),
    // Yesterday revenue — completed_at OR date within yesterday
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)::float AS revenue
      FROM appointments
      WHERE store_id = ${storeId}
        AND status = 'completed'
        AND total_paid IS NOT NULL
        AND (
          (date >= ${yesterdayStart.toISOString()} AND date <= ${yesterdayEnd.toISOString()})
          OR
          (completed_at >= ${yesterdayStart.toISOString()} AND completed_at <= ${yesterdayEnd.toISOString()})
        )
    `),
    // Month revenue by payment method
    db.execute(sql`
      SELECT
        CASE
          WHEN payment_method IS NOT NULL AND LOWER(TRIM(payment_method)) <> ''
            THEN LOWER(TRIM(payment_method))
          WHEN stripe_payment_intent_id IS NOT NULL
            THEN 'card'
          ELSE 'other'
        END AS payment_method,
        COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)::float AS revenue,
        COUNT(*) AS count
      FROM appointments
      WHERE store_id = ${storeId}
        AND date >= ${monthStart.toISOString()}
        AND date <= ${monthEnd.toISOString()}
        AND status = 'completed'
      GROUP BY 1
    `),
    // All-time enrolled clients
    db.execute(sql`
      SELECT COUNT(*) AS all_clients
      FROM clients
      WHERE store_id = ${storeId}
        AND archived_at IS NULL
    `),
    // Average visits per client
    db.execute(sql`
      SELECT COALESCE(AVG(visit_count), 0)::float AS avg_visits
      FROM (
        SELECT a.customer_id, COUNT(*) AS visit_count
        FROM appointments a
        JOIN clients c ON c.id::text = a.customer_id::text
          AND c.store_id = ${storeId}
          AND c.archived_at IS NULL
        WHERE a.store_id = ${storeId}
          AND a.status = 'completed'
          AND a.customer_id IS NOT NULL
        GROUP BY a.customer_id
      ) t
    `),
    // Clients not seen in 60+ days
    db.execute(sql`
      SELECT COUNT(*) AS lost_clients
      FROM (
        SELECT a.customer_id, MAX(a.date) AS last_seen
        FROM appointments a
        JOIN clients c ON c.id::text = a.customer_id::text
          AND c.store_id = ${storeId}
          AND c.archived_at IS NULL
        WHERE a.store_id = ${storeId}
          AND a.status = 'completed'
          AND a.customer_id IS NOT NULL
        GROUP BY a.customer_id
      ) t
      WHERE t.last_seen < ${sixtyDaysAgo.toISOString()}
    `),
    // Staff currently clocked in today
    (async () => {
      try {
        return await db.execute(sql`
          SELECT COUNT(DISTINCT staff_id) AS clocked_in
          FROM timeclock
          WHERE store_id = ${storeId}
            AND work_date = ${todayDateKey}
            AND clock_out IS NULL
        `);
      } catch (err: any) {
        if (err?.code === "42P01") return { rows: [] };
        throw err;
      }
    })(),
    // Owner Feed
    (async () => {
      try {
        return await getRecentActivity(storeId, 25);
      } catch (err: any) {
        if (err?.code === "42P01") return [];
        console.error("[dashboardCache] recentActivity fetch failed:", err);
        return [];
      }
    })(),
    // Top services by revenue today (same dual-window as todayRows)
    db.execute(sql`
      SELECT
        sv.name AS service_name,
        COUNT(*) AS cnt,
        COALESCE(SUM(CAST(a.total_paid AS DECIMAL(10,2))), 0)::float AS revenue
      FROM appointments a
      JOIN services sv ON sv.id = a.service_id AND sv.store_id = ${storeId}
      WHERE a.store_id = ${storeId}
        AND a.status = 'completed'
        AND (
          (a.date >= ${todayStart.toISOString()} AND a.date <= ${todayEnd.toISOString()})
          OR
          (a.completed_at >= ${todayStart.toISOString()} AND a.completed_at <= ${todayEnd.toISOString()})
        )
      GROUP BY sv.name
      ORDER BY revenue DESC
      LIMIT 5
    `),
    // AI Receptionist — today's calls
    (async () => {
      try {
        return await db.execute(sql`
          SELECT
            COUNT(*)                                                  AS total_calls,
            COUNT(*) FILTER (WHERE outcome = 'booked')               AS booked,
            COUNT(*) FILTER (WHERE outcome NOT IN ('booked','in_progress','callback_required') AND outcome IS NOT NULL) AS missed
          FROM ai_call_log
          WHERE store_id = ${storeId}
            AND started_at >= ${todayStart.toISOString()}
        `);
      } catch (err: any) {
        if (err?.code === "42P01") return { rows: [] };
        return { rows: [] };
      }
    })(),
    // Inventory alerts — products at or below threshold
    (async () => {
      try {
        return await db.execute(sql`
          SELECT name, category, COALESCE(stock, 0) AS stock, COALESCE(low_stock_threshold, 5) AS low_stock_threshold
          FROM products
          WHERE store_id = ${storeId}
            AND COALESCE(stock, 0) <= COALESCE(low_stock_threshold, 5)
          ORDER BY stock ASC
          LIMIT 10
        `);
      } catch {
        return { rows: [] };
      }
    })(),
    // Today's tips (same dual-window as todayRows)
    (async () => {
      try {
        return await db.execute(sql`
          SELECT COALESCE(SUM(CAST(tip_amount AS DECIMAL(10,2))), 0)::float AS tips
          FROM appointments
          WHERE store_id = ${storeId}
            AND status = 'completed'
            AND tip_amount IS NOT NULL
            AND (
              (date >= ${todayStart.toISOString()} AND date <= ${todayEnd.toISOString()})
              OR
              (completed_at >= ${todayStart.toISOString()} AND completed_at <= ${todayEnd.toISOString()})
            )
        `);
      } catch {
        return { rows: [{ tips: 0 }] };
      }
    })(),
    // Walk-ins today from kiosk_checkins
    (async () => {
      try {
        return await db.execute(sql`
          SELECT COUNT(*) AS walk_ins
          FROM kiosk_checkins
          WHERE store_id = ${storeId}
            AND created_at >= ${todayStart.toISOString()}
        `);
      } catch {
        return { rows: [{ walk_ins: 0 }] };
      }
    })(),
    // Average wait time today (checked_in → started_at) in minutes
    db.execute(sql`
      SELECT COALESCE(AVG(
        EXTRACT(EPOCH FROM (started_at::timestamptz - checked_in_at::timestamptz)) / 60
      ), 0)::float AS avg_wait_minutes
      FROM appointments
      WHERE store_id = ${storeId}
        AND started_at IS NOT NULL
        AND checked_in_at IS NOT NULL
        AND started_at > checked_in_at
        AND (
          (date >= ${todayStart.toISOString()} AND date <= ${todayEnd.toISOString()})
          OR
          (completed_at >= ${todayStart.toISOString()} AND completed_at <= ${todayEnd.toISOString()})
        )
    `),
    // VIP clients (10+ completed visits)
    db.execute(sql`
      SELECT COUNT(*) AS vip_count
      FROM (
        SELECT a.customer_id
        FROM appointments a
        JOIN clients c ON c.id::text = a.customer_id::text
          AND c.store_id = ${storeId} AND c.archived_at IS NULL
        WHERE a.store_id = ${storeId} AND a.status = 'completed' AND a.customer_id IS NOT NULL
        GROUP BY a.customer_id
        HAVING COUNT(*) >= 10
      ) t
    `),
    // At-risk clients — visited in the past but not in last 30 days
    db.execute(sql`
      SELECT COUNT(*) AS at_risk
      FROM (
        SELECT a.customer_id, MAX(a.date) AS last_seen
        FROM appointments a
        JOIN clients c ON c.id::text = a.customer_id::text
          AND c.store_id = ${storeId} AND c.archived_at IS NULL
        WHERE a.store_id = ${storeId} AND a.status = 'completed' AND a.customer_id IS NOT NULL
        GROUP BY a.customer_id
      ) t
      WHERE t.last_seen < ${thirtyDaysAgo.toISOString()}
        AND t.last_seen >= ${sixtyDaysAgo.toISOString()}
    `),
    // New clients this month (first visit this month)
    db.execute(sql`
      SELECT COUNT(*) AS new_this_month
      FROM (
        SELECT a.customer_id, MIN(a.date) AS first_visit
        FROM appointments a
        JOIN clients c ON c.id::text = a.customer_id::text
          AND c.store_id = ${storeId} AND c.archived_at IS NULL
        WHERE a.store_id = ${storeId} AND a.status = 'completed' AND a.customer_id IS NOT NULL
        GROUP BY a.customer_id
      ) t
      WHERE t.first_visit >= ${monthStart.toISOString()}
    `),
    // New clients this week
    db.execute(sql`
      SELECT COUNT(*) AS new_this_week
      FROM (
        SELECT a.customer_id, MIN(a.date) AS first_visit
        FROM appointments a
        JOIN clients c ON c.id::text = a.customer_id::text
          AND c.store_id = ${storeId} AND c.archived_at IS NULL
        WHERE a.store_id = ${storeId} AND a.status = 'completed' AND a.customer_id IS NOT NULL
        GROUP BY a.customer_id
      ) t
      WHERE t.first_visit >= ${weekStart.toISOString()}
    `),
    // New clients last week (for vs comparison)
    db.execute(sql`
      SELECT COUNT(*) AS new_last_week
      FROM (
        SELECT a.customer_id, MIN(a.date) AS first_visit
        FROM appointments a
        JOIN clients c ON c.id::text = a.customer_id::text
          AND c.store_id = ${storeId} AND c.archived_at IS NULL
        WHERE a.store_id = ${storeId} AND a.status = 'completed' AND a.customer_id IS NOT NULL
        GROUP BY a.customer_id
      ) t
      WHERE t.first_visit >= ${twoWeeksAgo.toISOString()}
        AND t.first_visit < ${weekStart.toISOString()}
    `),
  ]);

  // ─── Today aggregations ───────────────────────────────────────────────────
  const todayAppts = todayRows.rows as any[];
  const completedAppts = todayAppts.filter((a) => a.status === "completed");
  const todayRevenue = completedAppts.reduce((s, a) => s + parseFloat(a.total_paid || "0"), 0);
  const yesterdayRevenue = parseFloat((yesterdayRows.rows[0] as any)?.revenue || "0");

  const todayPaymentBreakdown: Record<string, number> = {};
  for (const a of completedAppts) {
    const pm = a.payment_method as string | null;
    const key =
      pm && pm.trim() !== ""
        ? pm.toLowerCase()
        : a.stripe_payment_intent_id
          ? "card"
          : "other";
    todayPaymentBreakdown[key] = (todayPaymentBreakdown[key] || 0) + parseFloat(a.total_paid || "0");
  }

  const appointmentBreakdown = {
    completed: todayAppts.filter((a) => a.status === "completed").length,
    inService: todayAppts.filter((a) => a.status === "started").length,
    waiting: todayAppts.filter((a) => a.status === "waiting").length,
    upcoming: todayAppts.filter((a) => ["confirmed", "pending"].includes(a.status)).length,
    noShow: todayAppts.filter((a) => a.status === "no_show").length,
  };

  const activeStaffRevenue = todayAppts
    .filter((a) => a.status === "completed" && a.staff_id)
    .reduce((s, a) => s + parseFloat(a.total_paid || "0"), 0);

  const uniqueClientIds = new Set(
    todayAppts.filter((a) => a.customer_id).map((a) => String(a.customer_id)),
  );

  const uniqueClientIdsArrayLiteral =
    `{${[...uniqueClientIds].map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")}}`;
  const returningCheck =
    uniqueClientIds.size > 0
      ? await db.execute(sql`
          SELECT customer_id::text AS customer_id
          FROM appointments
          WHERE store_id = ${storeId}
            AND customer_id::text = ANY(${uniqueClientIdsArrayLiteral}::text[])
            AND date < ${todayStart.toISOString()}
            AND status = 'completed'
          GROUP BY customer_id
        `)
      : { rows: [] };

  const returningIds = new Set(
    (returningCheck.rows as any[]).map((r) => String(r.customer_id)),
  );
  const returningToday = [...uniqueClientIds].filter((id) => returningIds.has(id)).length;
  const newToday = uniqueClientIds.size - returningToday;

  // ─── Month revenue ────────────────────────────────────────────────────────
  const paymentRows = monthRows.rows as any[];
  const totalMonthRevenue = paymentRows.reduce(
    (s, r) => s + parseFloat(r.revenue || "0"),
    0,
  );
  const paymentBreakdown: Record<string, number> = {};
  for (const r of paymentRows) {
    const key = (r.payment_method || "other").toLowerCase();
    paymentBreakdown[key] = (paymentBreakdown[key] || 0) + parseFloat(r.revenue || "0");
  }

  // ─── Loyalty ──────────────────────────────────────────────────────────────
  const loyaltyRow = (clientCountRows.rows[0] as any) || {};
  const allTimeClients = parseInt(loyaltyRow.all_clients || "0");
  const avgVisits = parseFloat((avgVisitsRows.rows[0] as any)?.avg_visits || "0");

  const returningClientsRow = await db.execute(sql`
    SELECT COUNT(*) AS returning_clients
    FROM (
      SELECT a.customer_id, COUNT(*) AS visits
      FROM appointments a
      JOIN clients c ON c.id::text = a.customer_id::text
        AND c.store_id = ${storeId}
        AND c.archived_at IS NULL
      WHERE a.store_id = ${storeId}
        AND a.status = 'completed'
        AND a.customer_id IS NOT NULL
      GROUP BY a.customer_id
      HAVING COUNT(*) > 1
    ) t
  `);
  const returningClients = parseInt(
    (returningClientsRow.rows[0] as any)?.returning_clients || "0",
  );
  const newClients = allTimeClients - returningClients;
  const retentionPct =
    allTimeClients > 0
      ? Math.round((returningClients / allTimeClients) * 100)
      : 0;

  // ─── Needs attention ──────────────────────────────────────────────────────
  const lostClients = parseInt((lostClientsRow.rows[0] as any)?.lost_clients || "0");
  const needsAttention: DashboardData["needsAttention"] = [];
  if (lostClients > 0) {
    needsAttention.push({
      type: "lost_clients",
      label: `${lostClients} client${lostClients !== 1 ? "s" : ""} haven't returned in 60+ days`,
      count: lostClients,
      priority: "high",
    });
  }
  if (appointmentBreakdown.noShow > 0) {
    needsAttention.push({
      type: "no_shows",
      label: `${appointmentBreakdown.noShow} no-show${appointmentBreakdown.noShow !== 1 ? "s" : ""} today`,
      count: appointmentBreakdown.noShow,
      priority: "medium",
    });
  }
  if (appointmentBreakdown.waiting > 0) {
    needsAttention.push({
      type: "waiting",
      label: `${appointmentBreakdown.waiting} client${appointmentBreakdown.waiting !== 1 ? "s" : ""} waiting right now`,
      count: appointmentBreakdown.waiting,
      priority: "medium",
    });
  }

  // ─── Schedule list ────────────────────────────────────────────────────────
  const classifyCustomerType = (visitCount: number): "New" | "Regular" | "VIP" => {
    if (visitCount >= 10) return "VIP";
    if (visitCount <= 1) return "New";
    return "Regular";
  };

  // Format customer name — show first name + last initial (e.g. "Jessica L.")
  function formatCustomerName(fullName: string | null): string {
    if (!fullName) return "Guest";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }

  const schedule = todayAppts.map((a) => ({
    id: a.id,
    time: a.date,
    duration: a.duration,
    customerType: classifyCustomerType(parseInt(a.visit_count || "0", 10)),
    customerName: formatCustomerName(a.customer_name),
    serviceName: a.service_name || "Service",
    staffId: a.staff_id ? Number(a.staff_id) : null,
    staffName: a.staff_name || null,
    staffAvatarThumbUrl: a.staff_avatar_thumb_url || null,
    status: a.status,
    totalPaid: parseFloat(a.total_paid || "0"),
    startedAt: a.started_at ? new Date(a.started_at).toISOString() : null,
    checkedInAt: a.checked_in_at ? new Date(a.checked_in_at).toISOString() : null,
  }));

  // ─── Top services ─────────────────────────────────────────────────────────
  const topServices: DashboardData["topServices"] = (topServicesRows.rows as any[]).map((r, i) => ({
    rank: i + 1,
    name: r.service_name || "Service",
    revenue: parseFloat(r.revenue || "0"),
    count: parseInt(r.cnt || "0"),
  }));

  // ─── Team performance (from today's appointments, server-computed) ─────────
  const teamMap: Record<string, { name: string; sales: number; appointments: number }> = {};
  for (const a of todayAppts) {
    if (!a.staff_name) continue;
    if (!teamMap[a.staff_name]) teamMap[a.staff_name] = { name: a.staff_name, sales: 0, appointments: 0 };
    teamMap[a.staff_name].appointments++;
    if (a.status === "completed" && parseFloat(a.total_paid || "0") > 0) {
      teamMap[a.staff_name].sales += parseFloat(a.total_paid || "0");
    }
  }
  const teamPerformance: DashboardData["teamPerformance"] = Object.values(teamMap)
    .sort((a, b) => b.sales - a.sales)
    .map((m) => ({
      name: m.name,
      sales: m.sales,
      appointments: m.appointments,
      avgTicket: m.appointments > 0 ? Math.round((m.sales / m.appointments) * 100) / 100 : 0,
    }));

  // ─── AI Receptionist ──────────────────────────────────────────────────────
  const aiRow = (aiRows.rows[0] as any) || {};
  const aiReceptionist: DashboardData["aiReceptionist"] = {
    todayCalls: parseInt(aiRow.total_calls || "0"),
    booked: parseInt(aiRow.booked || "0"),
    missed: parseInt(aiRow.missed || "0"),
    isLive: true,
  };

  // ─── Inventory alerts ─────────────────────────────────────────────────────
  const inventoryAlerts: DashboardData["inventoryAlerts"] = (inventoryRows.rows as any[]).map((r) => ({
    name: r.name,
    category: r.category || null,
    stock: parseInt(r.stock || "0"),
    threshold: parseInt(r.low_stock_threshold || "5"),
  }));

  // ─── Today's financials ───────────────────────────────────────────────────
  const tips = parseFloat((tipsRow.rows[0] as any)?.tips || "0");
  const todayFinancials: DashboardData["todayFinancials"] = {
    totalRevenue: todayRevenue,
    serviceSales: todayRevenue - tips,
    productSales: 0, // retail module not yet integrated
    tips,
    totalPayments: todayRevenue,
    byMethod: todayPaymentBreakdown,
    outstandingBalance: 0,
  };

  // ─── Client loyalty snapshot ──────────────────────────────────────────────
  const clientLoyaltySnapshot: DashboardData["clientLoyaltySnapshot"] = {
    vipClients: parseInt((vipRow.rows[0] as any)?.vip_count || "0"),
    regulars: returningClients,
    newThisMonth: parseInt((newThisMonthRow.rows[0] as any)?.new_this_month || "0"),
    atRisk: parseInt((atRiskRow.rows[0] as any)?.at_risk || "0"),
  };

  // ─── Glance stats ─────────────────────────────────────────────────────────
  const walkInsToday = parseInt((walkInsRow.rows[0] as any)?.walk_ins || "0");
  const avgWaitMinutes = Math.round(parseFloat((avgWaitRow.rows[0] as any)?.avg_wait_minutes || "0"));
  const totalApptCount = appointmentBreakdown.completed + appointmentBreakdown.inService + appointmentBreakdown.waiting + appointmentBreakdown.upcoming;
  const occupiedCount = appointmentBreakdown.completed + appointmentBreakdown.inService;
  const occupancyPct = totalApptCount > 0 ? Math.round((occupiedCount / totalApptCount) * 100) : 0;
  const avgTicket = appointmentBreakdown.completed > 0 ? Math.round((todayRevenue / appointmentBreakdown.completed) * 100) / 100 : 0;
  const tipsPct = todayRevenue > 0 ? Math.round((tips / todayRevenue) * 100 * 10) / 10 : 0;

  const glanceStats: DashboardData["glanceStats"] = {
    walkInsToday,
    avgWaitMinutes,
    occupancyPct,
    avgTicket,
    tipsPct,
    clientRetentionPct: retentionPct,
  };

  // ─── New clients this week ────────────────────────────────────────────────
  const thisWeekCount = parseInt((newThisWeekRow.rows[0] as any)?.new_this_week || "0");
  const lastWeekCount = parseInt((newLastWeekRow.rows[0] as any)?.new_last_week || "0");
  const newClientsThisWeek: DashboardData["newClientsThisWeek"] = {
    count: thisWeekCount,
    vsLastWeek: thisWeekCount - lastWeekCount,
  };

  return {
    today: {
      revenue: todayRevenue,
      yesterdayRevenue,
      revenueDiff: todayRevenue - yesterdayRevenue,
      byPaymentMethod: todayPaymentBreakdown,
      totalAppointments: todayAppts.length,
      appointments: appointmentBreakdown,
      clients: {
        total: uniqueClientIds.size,
        new: newToday,
        returning: returningToday,
        returningPct:
          uniqueClientIds.size > 0
            ? Math.round((returningToday / uniqueClientIds.size) * 100)
            : 0,
      },
      team: {
        working: parseInt((clockedInRow.rows[0] as any)?.clocked_in || "0"),
        servicesCompleted: appointmentBreakdown.completed,
        generated: activeStaffRevenue,
      },
    },
    schedule,
    monthRevenue: { total: totalMonthRevenue, byPaymentMethod: paymentBreakdown },
    clientLoyalty: {
      returningClients,
      newClients,
      allTimeClients,
      retentionPct,
      avgVisitsPerClient: Math.round(avgVisits * 10) / 10,
    },
    needsAttention,
    recentActivity,
    topServices,
    teamPerformance,
    aiReceptionist,
    inventoryAlerts,
    todayFinancials,
    clientLoyaltySnapshot,
    glanceStats,
    newClientsThisWeek,
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

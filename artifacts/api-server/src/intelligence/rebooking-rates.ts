import { db } from "../db";
import { appointments, staff } from "@shared/schema";
import { eq, and, gte, lte, sql, inArray, desc } from "drizzle-orm";

export interface StaffRebookingStats {
  staffId: number;
  staffName: string;
  totalCompleted: number;
  rebookedWithin30Days: number;
  rebookingRatePct: number;
  avgTicket: number;
  totalRevenue: number;
  noShowCount: number;
  uniqueClients: number;
  trend: "up" | "down" | "stable";
}

export async function computeRebookingRates(
  storeId: number
): Promise<StaffRebookingStats[]> {
  const last180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const last90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const staffList = await db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(and(eq(staff.storeId, storeId), eq(staff.status, "active")));

  const stats: StaffRebookingStats[] = [];

  for (const s of staffList) {
    const [overall] = await db
      .select({
        totalCompleted: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
        totalRevenue: sql<string>`COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(COALESCE(total_paid, '0') AS DECIMAL(10,2)) ELSE 0 END), 0)`,
        noShowCount: sql<number>`SUM(CASE WHEN status IN ('no_show', 'no-show') THEN 1 ELSE 0 END)`,
        uniqueClients: sql<number>`COUNT(DISTINCT customer_id)`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.storeId, storeId),
          eq(appointments.staffId, s.id),
          gte(appointments.date, last180)
        )
      );

    const totalCompleted = Number(overall?.totalCompleted || 0);
    const totalRevenue = parseFloat(overall?.totalRevenue || "0");
    const noShowCount = Number(overall?.noShowCount || 0);
    const uniqueClients = Number(overall?.uniqueClients || 0);
    const avgTicket = totalCompleted > 0 ? totalRevenue / totalCompleted : 0;

    if (totalCompleted === 0) continue;

    // Count rebookings: clients who came back within 30 days after a completed appointment with this staff member
    const completedAppts = await db
      .select({
        customerId: appointments.customerId,
        date: appointments.date,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.storeId, storeId),
          eq(appointments.staffId, s.id),
          eq(appointments.status, "completed"),
          gte(appointments.date, last180)
        )
      )
      .orderBy(appointments.customerId, appointments.date);

    let rebookedWithin30 = 0;

    for (const appt of completedAppts) {
      if (!appt.customerId) continue;
      const thirtyDaysAfter = new Date(
        appt.date.getTime() + 30 * 24 * 60 * 60 * 1000
      );

      // Check if this customer has another appointment within 30 days after this one
      const [followUp] = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.storeId, storeId),
            eq(appointments.customerId, appt.customerId),
            gte(appointments.date, new Date(appt.date.getTime() + 1)),
            lte(appointments.date, thirtyDaysAfter),
            inArray(appointments.status, ["completed", "confirmed", "pending"])
          )
        )
        .limit(1);

      if (followUp) rebookedWithin30++;
    }

    const rebookingRatePct =
      totalCompleted > 0 ? Math.round((rebookedWithin30 / totalCompleted) * 100) : 0;

    // Compute trend: compare last 90 days to prior 90 days
    const [recent90] = await db
      .select({
        count: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.storeId, storeId),
          eq(appointments.staffId, s.id),
          gte(appointments.date, last90)
        )
      );
    const prior90Start = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const prior90End = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [prior90] = await db
      .select({
        count: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.storeId, storeId),
          eq(appointments.staffId, s.id),
          gte(appointments.date, prior90Start),
          sql`date < ${prior90End.toISOString()}`
        )
      );

    const recentCount = Number(recent90?.count || 0);
    const priorCount = Number(prior90?.count || 0);
    let trend: "up" | "down" | "stable" = "stable";
    if (priorCount > 0) {
      const change = (recentCount - priorCount) / priorCount;
      if (change > 0.1) trend = "up";
      else if (change < -0.1) trend = "down";
    }

    stats.push({
      staffId: s.id,
      staffName: s.name,
      totalCompleted,
      rebookedWithin30Days: rebookedWithin30,
      rebookingRatePct,
      avgTicket,
      totalRevenue,
      noShowCount,
      uniqueClients,
      trend,
    });
  }

  return stats.sort((a, b) => b.rebookingRatePct - a.rebookingRatePct);
}

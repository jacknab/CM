import { db } from "../db";
import { appointments } from "@shared/schema";
import { eq, and, gte, sql, inArray } from "drizzle-orm";

export interface ClientLtvData {
  customerId: number;
  totalRevenue: number;
  ltv12Month: number;
  ltvAllTime: number;
  ltvScore: number;
  avgTicketValue: number;
  totalVisits: number;
}

export async function computeClientLtv(
  storeId: number,
  customerId: number
): Promise<ClientLtvData> {
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [allTimeResult] = await db
    .select({
      totalRevenue: sql<string>`COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)`,
      totalVisits: sql<number>`COUNT(*)`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        eq(appointments.customerId, customerId),
        inArray(appointments.status, ["completed"])
      )
    );

  const [last12Result] = await db
    .select({
      revenue12: sql<string>`COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        eq(appointments.customerId, customerId),
        inArray(appointments.status, ["completed"]),
        gte(appointments.date, twelveMonthsAgo)
      )
    );

  const totalRevenue = parseFloat(allTimeResult?.totalRevenue || "0");
  const totalVisits = Number(allTimeResult?.totalVisits || 0);
  const ltv12Month = parseFloat(last12Result?.revenue12 || "0");
  const avgTicketValue = totalVisits > 0 ? totalRevenue / totalVisits : 0;

  // LTV Score 0-100
  // Based on 12-month LTV relative to thresholds
  let ltvScore = 0;
  if (ltv12Month >= 2000) ltvScore = 100;
  else if (ltv12Month >= 1000) ltvScore = 85;
  else if (ltv12Month >= 500) ltvScore = 70;
  else if (ltv12Month >= 250) ltvScore = 55;
  else if (ltv12Month >= 100) ltvScore = 40;
  else if (ltv12Month > 0) ltvScore = 20;

  return {
    customerId,
    totalRevenue,
    ltv12Month,
    ltvAllTime: totalRevenue,
    ltvScore,
    avgTicketValue,
    totalVisits,
  };
}

export async function computeStoreLtvStats(storeId: number): Promise<{
  totalRevenueLast30: number;
  totalRevenueLast90: number;
  avgTicket: number;
  topCustomers: Array<{ customerId: number; ltv12: number }>;
}> {
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const last12m = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [rev30] = await db
    .select({ rev: sql<string>`COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)` })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        inArray(appointments.status, ["completed"]),
        gte(appointments.date, last30)
      )
    );

  const [rev90] = await db
    .select({ rev: sql<string>`COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)` })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        inArray(appointments.status, ["completed"]),
        gte(appointments.date, last90)
      )
    );

  const [avgResult] = await db
    .select({ avg: sql<string>`COALESCE(AVG(CAST(total_paid AS DECIMAL(10,2))), 0)` })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        inArray(appointments.status, ["completed"])
      )
    );

  const topCustomersResult = await db
    .select({
      customerId: appointments.customerId,
      ltv12: sql<string>`COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        inArray(appointments.status, ["completed"]),
        gte(appointments.date, last12m)
      )
    )
    .groupBy(appointments.customerId)
    .orderBy(sql`SUM(CAST(total_paid AS DECIMAL(10,2))) DESC`)
    .limit(20);

  return {
    totalRevenueLast30: parseFloat(rev30?.rev || "0"),
    totalRevenueLast90: parseFloat(rev90?.rev || "0"),
    avgTicket: parseFloat(avgResult?.avg || "0"),
    topCustomers: topCustomersResult
      .filter((r) => r.customerId !== null)
      .map((r) => ({
        customerId: r.customerId!,
        ltv12: parseFloat(r.ltv12),
      })),
  };
}

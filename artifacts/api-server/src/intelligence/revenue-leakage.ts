import { db } from "../db";
import { appointments, services } from "@shared/schema";
import { eq, and, gte, sql, inArray } from "drizzle-orm";

export interface RevenueLeakageReport {
  period: string;
  totalLeakage: number;
  breakdown: {
    noShowLoss: number;
    noShowCount: number;
    cancellationLoss: number;
    cancellationCount: number;
    discountLoss: number;
    discountCount: number;
    deadSeatLoss: number;
    deadSeatEstimate: boolean;
  };
  leakageByMonth: Array<{
    month: string;
    noShowLoss: number;
    cancellationLoss: number;
    discountLoss: number;
  }>;
  topLeakageServices: Array<{
    serviceName: string;
    noShowCount: number;
    estimatedLoss: number;
  }>;
  recoveryPotential: number;
  recommendations: string[];
}

export async function computeRevenueLeakage(
  storeId: number,
  deadSeatMonthlyLoss = 0
): Promise<RevenueLeakageReport> {
  const last90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // No-shows and cancellations in last 90 days
  const [noShowStats] = await db
    .select({
      noShowCount: sql<number>`SUM(CASE WHEN status IN ('no_show', 'no-show') THEN 1 ELSE 0 END)`,
      cancelCount: sql<number>`SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)`,
      avgTicket: sql<string>`COALESCE(AVG(CASE WHEN status = 'completed' THEN CAST(COALESCE(total_paid,'0') AS DECIMAL(10,2)) END), 0)`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, last90)
      )
    );

  const avgTicket = parseFloat(noShowStats?.avgTicket || "0") || 50;
  const noShowCount = Number(noShowStats?.noShowCount || 0);
  const cancellationCount = Number(noShowStats?.cancelCount || 0);

  const noShowLoss = Math.round(noShowCount * avgTicket);
  const cancellationLoss = Math.round(cancellationCount * avgTicket * 0.7); // 70% fill assumption

  // Discount leakage
  const [discountStats] = await db
    .select({
      discountCount: sql<number>`COUNT(*)`,
      totalDiscount: sql<string>`COALESCE(SUM(CAST(COALESCE(discount_amount,'0') AS DECIMAL(10,2))), 0)`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, last90),
        sql`CAST(COALESCE(discount_amount, '0') AS DECIMAL(10,2)) > 0`
      )
    );

  const discountLoss = parseFloat(discountStats?.totalDiscount || "0");
  const discountCount = Number(discountStats?.discountCount || 0);

  // Monthly breakdown (last 3 months)
  const leakageByMonth: Array<{ month: string; noShowLoss: number; cancellationLoss: number; discountLoss: number }> = [];

  for (let i = 0; i < 3; i++) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setMonth(monthStart.getMonth() - i);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const [monthStats] = await db
      .select({
        noShows: sql<number>`SUM(CASE WHEN status IN ('no_show', 'no-show') THEN 1 ELSE 0 END)`,
        cancels: sql<number>`SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)`,
        discounts: sql<string>`COALESCE(SUM(CAST(COALESCE(discount_amount,'0') AS DECIMAL(10,2))), 0)`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.storeId, storeId),
          gte(appointments.date, monthStart),
          sql`date < ${monthEnd.toISOString()}`
        )
      );

    const monthName = monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    leakageByMonth.push({
      month: monthName,
      noShowLoss: Math.round(Number(monthStats?.noShows || 0) * avgTicket),
      cancellationLoss: Math.round(Number(monthStats?.cancels || 0) * avgTicket * 0.7),
      discountLoss: Math.round(parseFloat(monthStats?.discounts || "0")),
    });
  }

  // Top leakage services
  const serviceLeakage = await db
    .select({
      serviceId: appointments.serviceId,
      serviceName: services.name,
      noShowCount: sql<number>`SUM(CASE WHEN appointments.status IN ('no_show', 'no-show') THEN 1 ELSE 0 END)`,
    })
    .from(appointments)
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, last90)
      )
    )
    .groupBy(appointments.serviceId, services.name)
    .having(sql`SUM(CASE WHEN appointments.status IN ('no_show', 'no-show') THEN 1 ELSE 0 END) > 0`)
    .orderBy(sql`SUM(CASE WHEN appointments.status IN ('no_show', 'no-show') THEN 1 ELSE 0 END) DESC`)
    .limit(5);

  const topLeakageServices = serviceLeakage.map((s) => ({
    serviceName: s.serviceName || "Unknown Service",
    noShowCount: Number(s.noShowCount),
    estimatedLoss: Math.round(Number(s.noShowCount) * avgTicket),
  }));

  const totalLeakage = Math.round(noShowLoss + cancellationLoss + discountLoss + (deadSeatMonthlyLoss * 3));
  const recoveryPotential = Math.round(totalLeakage * 0.4); // Realistic 40% recovery estimate

  const recommendations: string[] = [];
  if (noShowLoss > 200) recommendations.push("Enable SMS reminders 24 hours before appointments to reduce no-shows");
  if (cancellationLoss > 300) recommendations.push("Send cancellation recovery messages to fill last-minute open slots");
  if (discountLoss > 100) recommendations.push("Review discount policies — consider loyalty points as an alternative");
  if (deadSeatMonthlyLoss > 200) recommendations.push("Promote dead-seat time slots with targeted offers");

  return {
    period: "Last 90 days",
    totalLeakage,
    breakdown: {
      noShowLoss,
      noShowCount,
      cancellationLoss,
      cancellationCount,
      discountLoss,
      discountCount,
      deadSeatLoss: deadSeatMonthlyLoss * 3,
      deadSeatEstimate: true,
    },
    leakageByMonth: leakageByMonth.reverse(),
    topLeakageServices,
    recoveryPotential,
    recommendations,
  };
}

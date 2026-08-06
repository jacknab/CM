import { db } from "../db";
import { appointments } from "@shared/schema";
import { clients } from "@shared/schema/clients";
import { eq, and, gte, sql, inArray, isNull } from "drizzle-orm";

export interface GrowthScoreBreakdown {
  hasData: boolean;
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  components: {
    retention: { score: number; label: string; detail: string };
    rebooking: { score: number; label: string; detail: string };
    utilization: { score: number; label: string; detail: string };
    revenue: { score: number; label: string; detail: string };
    newClients: { score: number; label: string; detail: string };
  };
  insights: string[];
  activeClients: number;
  driftingClients: number;
  atRiskClients: number;
  monthlyRevenue: number;
  avgRebookingRate: number;
  seatUtilizationPct: number;
}

export async function computeGrowthScore(
  storeId: number,
  clientIntelligenceData?: {
    activeClients: number;
    driftingClients: number;
    atRiskClients: number;
    avgRebookingRate: number;
  },
  deadSeatUtilization?: number
): Promise<GrowthScoreBreakdown> {
  const now = new Date();
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const last90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const prev30Start = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const prev30End = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Revenue stats
  const [revLast30] = await db
    .select({ rev: sql<string>`COALESCE(SUM(CAST(COALESCE(total_paid,'0') AS DECIMAL(10,2))), 0)` })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        eq(appointments.status, "completed"),
        gte(appointments.date, last30)
      )
    );

  const [revPrev30] = await db
    .select({ rev: sql<string>`COALESCE(SUM(CAST(COALESCE(total_paid,'0') AS DECIMAL(10,2))), 0)` })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        eq(appointments.status, "completed"),
        gte(appointments.date, prev30Start),
        sql`date < ${prev30End.toISOString()}`
      )
    );

  const monthlyRevenue = parseFloat(revLast30?.rev || "0");
  const prevMonthRevenue = parseFloat(revPrev30?.rev || "0");

  // Revenue score
  let revenueScore = 50;
  if (prevMonthRevenue > 0) {
    const revGrowth = (monthlyRevenue - prevMonthRevenue) / prevMonthRevenue;
    if (revGrowth >= 0.15) revenueScore = 100;
    else if (revGrowth >= 0.05) revenueScore = 80;
    else if (revGrowth >= 0) revenueScore = 65;
    else if (revGrowth >= -0.05) revenueScore = 50;
    else if (revGrowth >= -0.15) revenueScore = 35;
    else revenueScore = 20;
  } else if (monthlyRevenue > 0) {
    revenueScore = 65;
  }

  // New client acquisition
  const [newClientsLast30] = await db
    .select({ count: sql<number>`COUNT(DISTINCT customer_id)` })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        inArray(appointments.status, ["completed", "confirmed"]),
        gte(appointments.date, last30)
      )
    );

  const [totalClients] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(clients)
    .where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt)));

  const newClientsCount = Number(newClientsLast30?.count || 0);
  const totalClientCount = Number(totalClients?.count || 0);

  // New client rate as % of total clientele
  const newClientRate =
    totalClientCount > 0 ? newClientsCount / totalClientCount : 0;
  let newClientScore = 50;
  if (newClientRate >= 0.15) newClientScore = 100;
  else if (newClientRate >= 0.1) newClientScore = 80;
  else if (newClientRate >= 0.05) newClientScore = 65;
  else if (newClientRate >= 0.02) newClientScore = 45;
  else newClientScore = 30;

  // No-show rate
  const [noShowStats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      noShows: sql<number>`SUM(CASE WHEN status IN ('no-show', 'no_show') THEN 1 ELSE 0 END)`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, last90)
      )
    );

  const totalAppts = Number(noShowStats?.total || 0);
  const noShowCount = Number(noShowStats?.noShows || 0);
  const noShowRate = totalAppts > 0 ? noShowCount / totalAppts : 0;

  // ── No-data early return ─────────────────────────────────────────────────
  // If the store has no clients, no appointments, and no revenue, every score
  // defaults to an artificial non-zero value due to the tiered scoring logic.
  // Return a clean "no data" result so the UI can show an appropriate state.
  if (totalClientCount === 0 && totalAppts === 0 && monthlyRevenue === 0) {
    const zeroComponent = { score: 0, label: "No data", detail: "No activity yet" };
    return {
      hasData: false,
      overallScore: 0,
      grade: "F",
      components: {
        retention:   zeroComponent,
        rebooking:   zeroComponent,
        utilization: zeroComponent,
        revenue:     zeroComponent,
        newClients:  zeroComponent,
      },
      insights: [],
      activeClients: 0,
      driftingClients: 0,
      atRiskClients: 0,
      monthlyRevenue: 0,
      avgRebookingRate: 0,
      seatUtilizationPct: 0,
    };
  }

  // Retention score — based on drifting/at-risk ratios
  const activeClients = clientIntelligenceData?.activeClients || totalClientCount;
  const driftingClients = clientIntelligenceData?.driftingClients || 0;
  const atRiskClients = clientIntelligenceData?.atRiskClients || 0;

  let retentionScore = 75;
  if (activeClients > 0) {
    const retentionRate =
      1 - (driftingClients + atRiskClients) / Math.max(activeClients, 1);
    if (retentionRate >= 0.9) retentionScore = 100;
    else if (retentionRate >= 0.75) retentionScore = 80;
    else if (retentionRate >= 0.6) retentionScore = 65;
    else if (retentionRate >= 0.5) retentionScore = 50;
    else retentionScore = 30;
  }

  // Rebooking score
  const avgRebooking = clientIntelligenceData?.avgRebookingRate || 0;
  let rebookingScore = 50;
  if (avgRebooking >= 70) rebookingScore = 100;
  else if (avgRebooking >= 55) rebookingScore = 80;
  else if (avgRebooking >= 40) rebookingScore = 65;
  else if (avgRebooking >= 25) rebookingScore = 50;
  else if (avgRebooking >= 10) rebookingScore = 35;
  else rebookingScore = 20;

  // Utilization score
  const utilPct = deadSeatUtilization ?? 50;
  let utilizationScore = 50;
  if (utilPct >= 80) utilizationScore = 100;
  else if (utilPct >= 65) utilizationScore = 80;
  else if (utilPct >= 50) utilizationScore = 65;
  else if (utilPct >= 35) utilizationScore = 50;
  else if (utilPct >= 20) utilizationScore = 35;
  else utilizationScore = 20;

  // Weighted overall score
  const overallScore = Math.round(
    retentionScore * 0.25 +
      rebookingScore * 0.25 +
      utilizationScore * 0.2 +
      revenueScore * 0.2 +
      newClientScore * 0.1
  );

  let grade: "A" | "B" | "C" | "D" | "F";
  if (overallScore >= 85) grade = "A";
  else if (overallScore >= 70) grade = "B";
  else if (overallScore >= 55) grade = "C";
  else if (overallScore >= 40) grade = "D";
  else grade = "F";

  // Actionable insights
  const insights: string[] = [];
  if (driftingClients > 0)
    insights.push(
      `${driftingClients} client${driftingClients > 1 ? "s are" : " is"} drifting — a win-back campaign could recover revenue`
    );
  if (noShowRate > 0.15)
    insights.push(
      `${Math.round(noShowRate * 100)}% no-show rate in the last 90 days — SMS reminders can help`
    );
  if (utilPct < 50)
    insights.push(
      `Seat utilization is only ${Math.round(utilPct)}% — filling dead slots could add significant revenue`
    );
  if (avgRebooking < 40)
    insights.push(
      `Rebooking rate is ${Math.round(avgRebooking)}% — clients are not being retained after appointments`
    );
  const revGrowthPct =
    prevMonthRevenue > 0
      ? Math.round(((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : null;
  if (revGrowthPct !== null && revGrowthPct < 0)
    insights.push(`Revenue is down ${Math.abs(revGrowthPct)}% from last month`);
  if (atRiskClients > 0)
    insights.push(
      `${atRiskClients} high-value client${atRiskClients > 1 ? "s are" : " is"} at churn risk`
    );

  return {
    hasData: true,
    overallScore,
    grade,
    components: {
      retention: {
        score: retentionScore,
        label: retentionScore >= 75 ? "Strong" : retentionScore >= 50 ? "Moderate" : "Weak",
        detail: `${driftingClients} drifting, ${atRiskClients} at risk`,
      },
      rebooking: {
        score: rebookingScore,
        label: rebookingScore >= 75 ? "Strong" : rebookingScore >= 50 ? "Moderate" : "Weak",
        detail: `${Math.round(avgRebooking)}% avg rebooking rate`,
      },
      utilization: {
        score: utilizationScore,
        label: utilizationScore >= 75 ? "Strong" : utilizationScore >= 50 ? "Moderate" : "Weak",
        detail: `${Math.round(utilPct)}% seat fill rate`,
      },
      revenue: {
        score: revenueScore,
        label: revenueScore >= 75 ? "Growing" : revenueScore >= 50 ? "Stable" : "Declining",
        detail:
          revGrowthPct !== null
            ? `${revGrowthPct >= 0 ? "+" : ""}${revGrowthPct}% vs last month`
            : "Insufficient history",
      },
      newClients: {
        score: newClientScore,
        label: newClientScore >= 75 ? "Strong" : newClientScore >= 50 ? "Moderate" : "Weak",
        detail: `${newClientsCount} new clients this month`,
      },
    },
    insights,
    activeClients,
    driftingClients,
    atRiskClients,
    monthlyRevenue,
    avgRebookingRate: avgRebooking,
    seatUtilizationPct: utilPct,
  };
}

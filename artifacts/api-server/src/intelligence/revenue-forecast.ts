import { db } from "../db";
import { appointments, locations } from "@shared/schema";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

export interface RevenueForecast {
  baselineForecast30: number;
  baselineForecast90: number;
  optimisticForecast30: number;
  optimisticForecast90: number;
  weeklyAvgRevenue: number;
  trend: "growing" | "stable" | "declining";
  trendPct: number;
  weeklyData: Array<{ weekLabel: string; revenue: number; weekStart: Date }>;
  insights: string[];
  recoveryAddon: number;
  projectedAnnual: number;
}

/** Return the ISO date string (YYYY-MM-DD) of the Monday of the week
 *  that contains `date`, computed in the salon's IANA timezone. */
function getLocalMondayIso(date: Date, tz: string): string {
  // date-fns "i" token: 1=Mon…7=Sun
  const isoDay = parseInt(formatInTimeZone(date, tz, "i"), 10);
  const daysFromMon = isoDay - 1; // Mon=0, Tue=1, …, Sun=6
  const localDate = formatInTimeZone(date, tz, "yyyy-MM-dd");
  // Use UTC noon to avoid DST ambiguity when subtracting days
  const d = new Date(localDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - daysFromMon);
  return d.toISOString().slice(0, 10);
}

export async function computeRevenueForecast(
  storeId: number,
  driftingClients: number = 0,
  avgClientLtv: number = 0
): Promise<RevenueForecast> {
  // Resolve store timezone so week boundaries follow salon-local Mondays.
  const [storeRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);
  const storeTimezone = storeRow?.timezone ?? "UTC";

  // Get last 12 weeks of revenue
  const twelveWeeksAgo = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000);

  const rawRevenue = await db
    .select({
      date: appointments.date,
      paid: appointments.totalPaid,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        eq(appointments.status, "completed"),
        gte(appointments.date, twelveWeeksAgo),
        sql`total_paid IS NOT NULL AND CAST(total_paid AS DECIMAL) > 0`
      )
    )
    .orderBy(appointments.date);

  // Group by week — bucket each appointment into its salon-local Monday
  const weeklyMap = new Map<string, { revenue: number; weekStart: Date }>();
  for (const row of rawRevenue) {
    const key = getLocalMondayIso(new Date(row.date), storeTimezone);
    // Use UTC noon so the Date object represents the right day regardless of server TZ
    const weekStart = new Date(key + "T12:00:00Z");
    const existing = weeklyMap.get(key) || { revenue: 0, weekStart };
    existing.revenue += parseFloat(row.paid || "0");
    weeklyMap.set(key, existing);
  }

  const weeklyData = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({
      weekLabel: new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      revenue: Math.round(val.revenue),
      weekStart: val.weekStart,
    }));

  // Fill in missing weeks with 0 — generate 12 salon-local Mondays ending at the current week
  const filledWeeks: typeof weeklyData = [];
  const thisMondayKey = getLocalMondayIso(new Date(), storeTimezone);
  const thisMondayD = new Date(thisMondayKey + "T12:00:00Z");
  for (let i = 11; i >= 0; i--) {
    const weekStartD = new Date(thisMondayD);
    weekStartD.setUTCDate(weekStartD.getUTCDate() - i * 7);
    const key = weekStartD.toISOString().slice(0, 10);
    const found = weeklyData.find(
      (w) => w.weekStart.toISOString().slice(0, 10) === key
    );
    filledWeeks.push(
      found || {
        weekLabel: new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        revenue: 0,
        weekStart: weekStartD,
      }
    );
  }

  // Compute trend — compare last 4 weeks vs prior 4 weeks
  const last4 = filledWeeks.slice(-4).reduce((s, w) => s + w.revenue, 0);
  const prior4 = filledWeeks.slice(-8, -4).reduce((s, w) => s + w.revenue, 0);
  const weeklyAvgRevenue = last4 > 0 ? Math.round(last4 / 4) : 0;

  let trendPct = 0;
  let trend: "growing" | "stable" | "declining" = "stable";
  if (prior4 > 0) {
    trendPct = Math.round(((last4 - prior4) / prior4) * 100);
    if (trendPct >= 5) trend = "growing";
    else if (trendPct <= -5) trend = "declining";
  } else if (weeklyAvgRevenue > 0) {
    trend = "stable";
  }

  // Apply weighted trend to forecast
  // Use exponential smoothing: recent weeks matter more
  const weights = [0.4, 0.25, 0.2, 0.15];
  const last4Revenues = filledWeeks.slice(-4).map((w) => w.revenue);
  let weightedWeekly = 0;
  for (let i = 0; i < 4; i++) {
    weightedWeekly += last4Revenues[3 - i] * weights[i];
  }
  weightedWeekly = Math.round(weightedWeekly);

  // Apply trend multiplier per week
  const trendMultiplierPerWeek =
    trend === "growing" ? 1 + Math.min(Math.abs(trendPct), 20) / 100 / 4
    : trend === "declining" ? 1 - Math.min(Math.abs(trendPct), 20) / 100 / 4
    : 1;

  // Baseline forecast
  let baseline30 = 0;
  let w = weightedWeekly;
  for (let i = 0; i < 4; i++) {
    baseline30 += w;
    w *= trendMultiplierPerWeek;
  }
  baseline30 = Math.round(baseline30);

  let baseline90 = 0;
  w = weightedWeekly;
  for (let i = 0; i < 13; i++) {
    baseline90 += w;
    w *= trendMultiplierPerWeek;
  }
  baseline90 = Math.round(baseline90);

  // Optimistic forecast adds expected recovery from drifting clients
  // If we win back 40% of drifting clients, each averages (avgClientLtv / 12) per month
  const recoveryAddon = Math.round(driftingClients * 0.4 * (avgClientLtv / 12));
  const optimistic30 = baseline30 + recoveryAddon;
  const optimistic90 = baseline90 + recoveryAddon * 3;

  const projectedAnnual = Math.round(
    weeklyAvgRevenue > 0 ? weeklyAvgRevenue * 52 : baseline90 * (52 / 13)
  );

  const insights: string[] = [];
  if (trend === "growing") {
    insights.push(`Revenue is growing at ${Math.abs(trendPct)}% per 4 weeks — strong momentum`);
  } else if (trend === "declining") {
    insights.push(`Revenue has declined ${Math.abs(trendPct)}% over the last 4 weeks — action needed`);
  }
  if (recoveryAddon > 0) {
    insights.push(
      `Winning back ${Math.round(driftingClients * 0.4)} drifting clients could add $${recoveryAddon.toLocaleString()}/month`
    );
  }
  if (weeklyAvgRevenue === 0) {
    insights.push("No completed appointment revenue in the last 4 weeks — run appointments to see forecast");
  }

  return {
    baselineForecast30: baseline30,
    baselineForecast90: baseline90,
    optimisticForecast30: optimistic30,
    optimisticForecast90: optimistic90,
    weeklyAvgRevenue,
    trend,
    trendPct,
    weeklyData: filledWeeks,
    insights,
    recoveryAddon,
    projectedAnnual,
  };
}

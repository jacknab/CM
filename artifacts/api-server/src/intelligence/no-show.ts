import { db } from "../db";
import { appointments, staff, services, locations } from "@shared/schema";
import { clients } from "@shared/schema/clients";
import { eq, and, gte, lte, inArray, sql, desc } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

export interface NoShowRisk {
  appointmentId: number;
  customerId: number | null;
  customerName: string;
  staffName: string | null;
  serviceName: string | null;
  appointmentDate: Date;
  noShowRiskScore: number;
  noShowRiskLabel: "low" | "medium" | "high";
  riskFactors: string[];
}

export async function computeNoShowRisks(
  storeId: number,
  targetDate?: Date
): Promise<NoShowRisk[]> {
  // Resolve store timezone once up front — used for the early/late hour check below.
  const [storeRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);
  const storeTimezone = storeRow?.timezone ?? "UTC";

  const date = targetDate || new Date();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get tomorrow's appointments if checking for tomorrow
  const checkDate = targetDate || new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dayStart = new Date(checkDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(checkDate);
  dayEnd.setHours(23, 59, 59, 999);

  const upcomingAppts = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      customerId: appointments.customerId,
      staffId: appointments.staffId,
      serviceId: appointments.serviceId,
      customerName: clients.fullName,
      customerPhone: sql<string>`(SELECT phone_number_e164 FROM client_phones WHERE client_id = ${appointments.customerId} AND is_primary = true LIMIT 1)`,
      staffName: staff.name,
      serviceName: services.name,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.customerId, clients.id))
    .leftJoin(staff, eq(appointments.staffId, staff.id))
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, dayStart),
        lte(appointments.date, dayEnd),
        inArray(appointments.status, ["pending", "confirmed"])
      )
    );

  const risks: NoShowRisk[] = [];

  for (const appt of upcomingAppts) {
    const factors: string[] = [];
    let score = 0;

    if (appt.customerId) {
      // Get historical no-show rate
      const [history] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          noShows: sql<number>`SUM(CASE WHEN status IN ('no_show', 'no-show') THEN 1 ELSE 0 END)`,
          cancellations: sql<number>`SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)`,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.storeId, storeId),
            eq(appointments.customerId, appt.customerId)
          )
        );

      const total = Number(history?.total || 0);
      const noShows = Number(history?.noShows || 0);
      const cancellations = Number(history?.cancellations || 0);

      if (total > 0) {
        const nsRate = noShows / total;
        const cancelRate = cancellations / total;

        if (nsRate >= 0.4) {
          score += 50;
          factors.push(`High no-show rate (${Math.round(nsRate * 100)}%)`);
        } else if (nsRate >= 0.2) {
          score += 30;
          factors.push(`Elevated no-show history`);
        } else if (nsRate >= 0.1) {
          score += 15;
          factors.push(`Some no-show history`);
        }

        if (cancelRate >= 0.3) {
          score += 15;
          factors.push(`Frequent cancellations`);
        }
      }

      // New client — slightly higher risk
      if (total <= 1) {
        score += 15;
        factors.push("New or first-time client");
      }
    } else {
      score += 20;
      factors.push("Walk-in / no customer record");
    }

    // Early morning or late evening = slightly higher risk
    // Use the store's IANA timezone (fetched above) for the hour check.
    const hour = parseInt(formatInTimeZone(appt.date, storeTimezone, "H"), 10);
    if (hour < 8 || hour >= 18) {
      score += 10;
      factors.push("Early/late time slot");
    }

    score = Math.min(score, 100);

    let label: "low" | "medium" | "high";
    if (score >= 50) label = "high";
    else if (score >= 25) label = "medium";
    else label = "low";

    risks.push({
      appointmentId: appt.id,
      customerId: appt.customerId,
      customerName: appt.customerName || "Walk-in",
      staffName: appt.staffName,
      serviceName: appt.serviceName,
      appointmentDate: appt.date,
      noShowRiskScore: score,
      noShowRiskLabel: label,
      riskFactors: factors,
    });
  }

  return risks.sort((a, b) => b.noShowRiskScore - a.noShowRiskScore);
}

export async function getNoShowStats(storeId: number): Promise<{
  noShowRate30d: number;
  noShowCount30d: number;
  lostRevenue30d: number;
}> {
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [result] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      noShows: sql<number>`SUM(CASE WHEN status IN ('no_show', 'no-show') THEN 1 ELSE 0 END)`,
      lostRevenue: sql<string>`COALESCE(SUM(CASE WHEN status IN ('no_show', 'no-show') THEN CAST(COALESCE(total_paid, '0') AS DECIMAL(10,2)) ELSE 0 END), 0)`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, last30)
      )
    );

  const total = Number(result?.total || 0);
  const noShows = Number(result?.noShows || 0);

  return {
    noShowRate30d: total > 0 ? noShows / total : 0,
    noShowCount30d: noShows,
    lostRevenue30d: parseFloat(result?.lostRevenue || "0"),
  };
}

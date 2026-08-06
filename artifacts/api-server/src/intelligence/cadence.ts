import { db } from "../db";
import { appointments } from "@shared/schema";
import { clients } from "@shared/schema/clients";
import { eq, and, inArray, desc, sql } from "drizzle-orm";

export interface ClientCadenceData {
  customerId: number;
  avgCadenceDays: number | null;
  lastVisitDate: Date | null;
  nextExpectedDate: Date | null;
  daysSinceLast: number | null;
  daysOverduePct: number | null;
  totalVisits: number;
  isDrifting: boolean;
}

export async function computeClientCadence(
  storeId: number,
  customerId: number
): Promise<ClientCadenceData> {
  const completedAppts = await db
    .select({ date: appointments.date })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        eq(appointments.customerId, customerId),
        inArray(appointments.status, ["completed", "confirmed"])
      )
    )
    .orderBy(desc(appointments.date))
    .limit(20);

  const totalVisits = completedAppts.length;

  if (totalVisits === 0) {
    return {
      customerId,
      avgCadenceDays: null,
      lastVisitDate: null,
      nextExpectedDate: null,
      daysSinceLast: null,
      daysOverduePct: null,
      totalVisits: 0,
      isDrifting: false,
    };
  }

  const lastVisitDate = completedAppts[0].date;
  const daysSinceLast = Math.floor(
    (Date.now() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Default cadence when there isn't enough visit history to compute a personal one
  const DEFAULT_CADENCE_DAYS = 21; // 3 weeks

  if (totalVisits < 2) {
    const nextExpectedDate = new Date(
      lastVisitDate.getTime() + DEFAULT_CADENCE_DAYS * 24 * 60 * 60 * 1000
    );
    const daysOverduePct =
      Math.round(((daysSinceLast - DEFAULT_CADENCE_DAYS) / DEFAULT_CADENCE_DAYS) * 100);
    const isDrifting = daysOverduePct >= 20 && daysSinceLast > 14;
    return {
      customerId,
      avgCadenceDays: DEFAULT_CADENCE_DAYS,
      lastVisitDate,
      nextExpectedDate,
      daysSinceLast,
      daysOverduePct,
      totalVisits,
      isDrifting,
    };
  }

  // Compute gaps between visits
  const gaps: number[] = [];
  for (let i = 0; i < completedAppts.length - 1; i++) {
    const gap = Math.floor(
      (completedAppts[i].date.getTime() - completedAppts[i + 1].date.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (gap > 0 && gap < 365) gaps.push(gap);
  }

  if (gaps.length === 0) {
    const nextExpectedDate = new Date(
      lastVisitDate.getTime() + DEFAULT_CADENCE_DAYS * 24 * 60 * 60 * 1000
    );
    const daysOverduePct =
      Math.round(((daysSinceLast - DEFAULT_CADENCE_DAYS) / DEFAULT_CADENCE_DAYS) * 100);
    const isDrifting = daysOverduePct >= 20 && daysSinceLast > 14;
    return {
      customerId,
      avgCadenceDays: DEFAULT_CADENCE_DAYS,
      lastVisitDate,
      nextExpectedDate,
      daysSinceLast,
      daysOverduePct,
      totalVisits,
      isDrifting,
    };
  }

  // Weighted average — recent gaps count more
  let weightedSum = 0;
  let weightTotal = 0;
  gaps.forEach((gap, i) => {
    const weight = gaps.length - i;
    weightedSum += gap * weight;
    weightTotal += weight;
  });
  const avgCadenceDays = Math.round(weightedSum / weightTotal);

  const nextExpectedDate = new Date(
    lastVisitDate.getTime() + avgCadenceDays * 24 * 60 * 60 * 1000
  );

  const daysOverduePct =
    avgCadenceDays > 0
      ? Math.round(((daysSinceLast - avgCadenceDays) / avgCadenceDays) * 100)
      : null;

  // Drifting = more than 20% past their cadence
  const isDrifting =
    daysOverduePct !== null && daysOverduePct >= 20 && daysSinceLast > 14;

  return {
    customerId,
    avgCadenceDays,
    lastVisitDate,
    nextExpectedDate,
    daysSinceLast,
    daysOverduePct,
    totalVisits,
    isDrifting,
  };
}

export async function computeAllCadences(
  storeId: number
): Promise<ClientCadenceData[]> {
  const allCustomers = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.storeId, storeId));

  const results: ClientCadenceData[] = [];
  for (const c of allCustomers) {
    const cadence = await computeClientCadence(storeId, c.id);
    results.push(cadence);
  }
  return results;
}

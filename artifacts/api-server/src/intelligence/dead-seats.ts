import { db } from "../db";
import { appointments, businessHours, locations } from "@shared/schema";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface DeadSeatSlot {
  dayOfWeek: number;
  dayName: string;
  hourStart: number;
  hourLabel: string;
  utilizationPct: number;
  bookedSlots: number;
  totalSlots: number;
  estimatedLostRevenue: number;
  severity: "low" | "medium" | "high";
}

export interface DeadSeatReport {
  deadSlots: DeadSeatSlot[];
  totalLostRevenuePotential: number;
  worstDay: string | null;
  worstHour: string | null;
  overallUtilization: number;
}

export async function computeDeadSeats(storeId: number): Promise<DeadSeatReport> {
  const last90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Resolve store timezone once up front — used for all DOW/hour calculations below.
  const [storeRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);
  const storeTimezone = storeRow?.timezone ?? "UTC";

  // Get all completed + no-show appointments in last 90 days
  const appts = await db
    .select({
      date: appointments.date,
      duration: appointments.duration,
      totalPaid: appointments.totalPaid,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, last90),
        inArray(appointments.status, ["completed", "no_show", "no-show", "cancelled", "confirmed", "pending"])
      )
    );

  if (appts.length === 0) {
    return {
      deadSlots: [],
      totalLostRevenuePotential: 0,
      worstDay: null,
      worstHour: null,
      overallUtilization: 0,
    };
  }

  // Count bookings per (dayOfWeek, hour) bucket
  const buckets = new Map<string, { booked: number; total: number; revenue: number }>();
  const avgTicket = appts
    .filter((a) => a.status === "completed" && a.totalPaid)
    .reduce(
      (acc, a) => {
        acc.sum += parseFloat(a.totalPaid || "0");
        acc.count++;
        return acc;
      },
      { sum: 0, count: 0 }
    );
  const avgTicketValue = avgTicket.count > 0 ? avgTicket.sum / avgTicket.count : 50;

  // Build count of how many weeks in the 90-day window each DOW appears
  const weekCounts = new Map<number, number>();
  for (let d = 0; d < 7; d++) {
    // Roughly 13 weeks each in 90 days
    weekCounts.set(d, 13);
  }

  for (const appt of appts) {
    // Use formatInTimeZone with the store's IANA timezone (fetched above) so
    // DOW/hour are salon-local, not server-local.
    const dow  = parseInt(formatInTimeZone(appt.date, storeTimezone, "i"), 10) % 7; // 0=Sun
    const hour = parseInt(formatInTimeZone(appt.date, storeTimezone, "H"), 10);
    const key = `${dow}:${hour}`;
    const bucket = buckets.get(key) || { booked: 0, total: 0, revenue: 0 };
    bucket.booked++;
    bucket.revenue += appt.status === "completed" ? parseFloat(appt.totalPaid || "0") : 0;
    buckets.set(key, bucket);
  }

  // Operating hours: assume 9am–6pm if no business hours in DB
  const operatingHours = { start: 9, end: 18 };

  // Build full grid of slots and compute utilization
  const deadSlots: DeadSeatSlot[] = [];
  let totalBooked = 0;
  let totalPossible = 0;

  for (let dow = 0; dow < 7; dow++) {
    const weeksInPeriod = weekCounts.get(dow) || 13;
    for (let hour = operatingHours.start; hour < operatingHours.end; hour++) {
      const key = `${dow}:${hour}`;
      const bucket = buckets.get(key) || { booked: 0, total: weeksInPeriod, revenue: 0 };
      const utilizationPct = Math.min(100, Math.round((bucket.booked / weeksInPeriod) * 100));

      totalBooked += bucket.booked;
      totalPossible += weeksInPeriod;

      if (utilizationPct < 50) {
        // Monthly lost revenue: missed slots in 90-day window × avg ticket ÷ 3 months
        const lostRevenue =
          ((weeksInPeriod - bucket.booked) * avgTicketValue) / 3;

        let severity: "low" | "medium" | "high";
        if (utilizationPct < 15) severity = "high";
        else if (utilizationPct < 30) severity = "medium";
        else severity = "low";

        const hourLabel =
          hour === 0
            ? "12 AM"
            : hour < 12
            ? `${hour} AM`
            : hour === 12
            ? "12 PM"
            : `${hour - 12} PM`;

        deadSlots.push({
          dayOfWeek: dow,
          dayName: DAY_NAMES[dow],
          hourStart: hour,
          hourLabel,
          utilizationPct,
          bookedSlots: bucket.booked,
          totalSlots: weeksInPeriod,
          estimatedLostRevenue: Math.round(lostRevenue),
          severity,
        });
      }
    }
  }

  deadSlots.sort((a, b) => b.estimatedLostRevenue - a.estimatedLostRevenue);

  const totalLostRevenuePotential = deadSlots.reduce(
    (sum, s) => sum + s.estimatedLostRevenue,
    0
  );

  const overallUtilization =
    totalPossible > 0 ? Math.round((totalBooked / totalPossible) * 100) : 0;

  const worstSlot = deadSlots[0] || null;

  return {
    deadSlots: deadSlots.slice(0, 20),
    totalLostRevenuePotential: Math.round(totalLostRevenuePotential),
    worstDay: worstSlot ? worstSlot.dayName : null,
    worstHour: worstSlot ? worstSlot.hourLabel : null,
    overallUtilization,
  };
}

/**
 * APPOINTMENT AUTO-ASSIGNMENT ENGINE
 * ============================================================
 * Weighted fairness system for assigning technicians to new
 * appointment bookings.
 *
 * This is NOT a random, round-robin, or revenue-balancing system.
 * It is a deterministic, auditable scoring engine.
 *
 * Assignment priority (highest to lowest weight):
 *   1. Technician is active (not removed/deactivated)          — HARD FILTER
 *   2. Technician supports the requested service               — HARD FILTER
 *   3. No direct scheduling conflict at the requested time     — HARD FILTER
 *   4. Not clocked in today                                    — soft penalty
 *   5. Has appointment within the near-conflict exclusion window — soft penalty
 *   6. Was the most recently assigned technician (back-to-back) — soft penalty
 *   7. High active workload today                              — soft penalty
 *   8. High total booking count today                          — soft penalty
 *   9. High revenue today                                      — soft micro-penalty
 *
 * IMPORTANT INVARIANTS:
 *   - Once an appointment is created, this engine is NEVER called
 *     retroactively on it. Assignment is decided once at creation time.
 *   - This engine never reshuffles or reassigns existing bookings.
 *   - The scoring is deterministic: identical inputs always produce
 *     the same winner (tiebreak by lowest staffId).
 *   - Every rejection and every score component is logged for audit.
 */

import { db } from "../db";
import {
  staff,
  staffServices,
  appointments,
  timeclock,
  locations,
} from "@shared/schema";
import { eq, and, gte, asc, isNotNull } from "drizzle-orm";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

// ─────────────────────────────────────────────────────────────────────────────
// Scoring weights
// Adjust these constants to tune the engine without touching logic.
// ─────────────────────────────────────────────────────────────────────────────

/** Bonus for being clocked in today — strongly prefer available staff */
const W_CLOCKED_IN = 50;

/** Bonus when no appointment falls in the near-conflict exclusion window */
const W_NO_NEAR_CONFLICT = 30;

/** Penalty applied to the most recently assigned technician (prevents back-to-back) */
const W_LAST_ASSIGNED = 25;

/** Penalty per active (pending/confirmed/started) appointment today */
const W_ACTIVE_WORKLOAD = 15;

/** Penalty per total booking today (includes completed, to balance load over the day) */
const W_BOOKING_COUNT = 10;

/**
 * Soft micro-penalty per dollar of revenue earned today.
 * This is intentionally tiny — revenue is a last-resort tiebreaker, NOT a primary
 * driver. The system must NOT become a revenue-balancing engine.
 */
const W_REVENUE_DOLLAR = 0.05;

/**
 * Minutes before the new appointment starts where an existing appointment
 * that ends in that window causes a "near-conflict" soft penalty.
 * e.g. if set to 10, a tech finishing at T-5min will be penalised.
 */
const NEAR_CONFLICT_BUFFER_BEFORE_MINUTES = 10;

/**
 * Minutes after the new appointment ends where a next appointment
 * starting in that window causes a "near-conflict" soft penalty.
 * e.g. if set to 20, a tech starting another job at T+15min will be penalised.
 */
const NEAR_CONFLICT_BUFFER_AFTER_MINUTES = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface AssignmentInput {
  storeId: number;
  serviceId: number;
  /** Proposed appointment start time */
  date: Date;
  /** Appointment duration in minutes */
  duration: number;
}

export interface TechnicianRejection {
  staffId: number;
  staffName: string;
  reason: RejectionReason;
}

export type RejectionReason =
  | "service_not_supported"
  | "scheduling_conflict"
  | "staff_inactive";

export interface TechnicianScoreBreakdown {
  clockedIn: number;
  noNearConflict: number;
  lastAssignedPenalty: number;
  workloadPenalty: number;
  bookingCountPenalty: number;
  revenuePenalty: number;
  total: number;
}

export interface TechnicianScore {
  staffId: number;
  staffName: string;
  score: number;
  breakdown: TechnicianScoreBreakdown;
}

export interface AssignmentResult {
  assigned: boolean;
  staffId: number | null;
  staffName: string | null;
  score: number | null;
  breakdown: TechnicianScoreBreakdown | null;
  rejections: TechnicianRejection[];
  allScores: TechnicianScore[];
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-assign the best available technician for an appointment.
 *
 * Returns an AssignmentResult. When `assigned` is false, `staffId` is null
 * and the caller should either reject the booking or require manual selection.
 *
 * This function is pure read-only — it does NOT create or modify any records.
 * The caller is responsible for writing the staffId to the appointment row.
 */
export async function autoAssignTechnician(
  input: AssignmentInput
): Promise<AssignmentResult> {
  const { storeId, serviceId, date, duration } = input;
  const logPrefix = `[auto-assign][store:${storeId}][svc:${serviceId}]`;

  console.log(
    `${logPrefix} Request: date=${date.toISOString()} duration=${duration}min`
  );

  // Pre-compute time boundary values once
  const appointmentEnd = new Date(date.getTime() + duration * 60_000);
  const bufferBeforeStart = new Date(
    date.getTime() - NEAR_CONFLICT_BUFFER_BEFORE_MINUTES * 60_000
  );
  const bufferAfterEnd = new Date(
    appointmentEnd.getTime() + NEAR_CONFLICT_BUFFER_AFTER_MINUTES * 60_000
  );

  // "Today" must be resolved in the salon's local timezone, not the server's
  // (server runs in UTC) — otherwise near-midnight requests can be scored
  // against the wrong day's workload/timeclock records.
  const [storeRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);
  const storeTz = storeRow?.timezone || "UTC";
  const localNow = toZonedTime(new Date(), storeTz);
  const todayKey = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;

  // today as YYYY-MM-DD (matches timeclock.workDate column format)
  const today = todayKey;

  // Start of today (salon-local midnight, expressed as a UTC instant) for
  // appointment query scope.
  const startOfToday = fromZonedTime(`${todayKey}T00:00:00`, storeTz);

  const rejections: TechnicianRejection[] = [];
  const allScores: TechnicianScore[] = [];

  // ── Step 1: Load all staff for this store ─────────────────────────────────
  const allStaff = await db
    .select()
    .from(staff)
    .where(eq(staff.storeId, storeId))
    .orderBy(asc(staff.id));

  if (allStaff.length === 0) {
    console.log(`${logPrefix} No staff found — aborting`);
    return buildNoAssignment("No staff found for this store", rejections, allScores);
  }

  // Hard filter: only active staff
  const activeStaff = allStaff.filter(
    (m) => m.status !== "removed" && m.status !== "deactivated"
  );

  if (activeStaff.length === 0) {
    console.log(`${logPrefix} No active staff — aborting`);
    return buildNoAssignment("No active staff in this store", rejections, allScores);
  }

  // ── Step 2: Load service capability set ───────────────────────────────────
  // Which staff members are configured to perform this service?
  const serviceCapabilityRows = await db
    .select({ staffId: staffServices.staffId })
    .from(staffServices)
    .where(eq(staffServices.serviceId, serviceId));
  const serviceCapableIds = new Set(serviceCapabilityRows.map((r) => r.staffId));

  // ── Step 3: Load today's timeclock records ─────────────────────────────────
  // We only consider a technician "clocked in" if they have an open record
  // (clockIn present, clockOut null) for today.
  const timeclockRows = await db
    .select({ staffId: timeclock.staffId, clockOut: timeclock.clockOut })
    .from(timeclock)
    .where(
      and(
        eq(timeclock.storeId, storeId),
        eq(timeclock.workDate, today)
      )
    );

  const clockedInIds = new Set(
    timeclockRows
      .filter((r) => r.clockOut === null || r.clockOut === undefined)
      .map((r) => r.staffId)
  );

  // ── Step 4: Load today's appointments for this store ──────────────────────
  // We fetch from start-of-today to cover all active load metrics.
  // No upper bound: future appointments matter for conflict detection.
  const todayAppointments = await db
    .select({
      id: appointments.id,
      staffId: appointments.staffId,
      date: appointments.date,
      duration: appointments.duration,
      status: appointments.status,
      totalPaid: appointments.totalPaid,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, startOfToday),
        isNotNull(appointments.staffId)
      )
    );

  // Split into sets for different scoring purposes
  // "Counting" appointments: exclude cancelled/no-show so they don't inflate workload
  const nonCancelledAppointments = todayAppointments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.status !== "no_show" &&
      a.status !== "no-show"
  );

  // ── Step 5: Identify the most recently assigned technician ────────────────
  // Sort by appointment ID descending (highest ID = most recently created).
  // This is used to penalise assigning the same tech back-to-back.
  const recentlySorted = [...nonCancelledAppointments].sort(
    (a, b) => b.id - a.id
  );
  const lastAssignedStaffId = recentlySorted[0]?.staffId ?? null;

  console.log(
    `${logPrefix} Context: ` +
      `clockedIn=[${[...clockedInIds].join(",")}] ` +
      `lastAssigned=${lastAssignedStaffId} ` +
      `serviceCapable=[${[...serviceCapableIds].join(",")}]`
  );

  // ── Step 6: Score each active technician ─────────────────────────────────
  for (const member of activeStaff) {
    const tPrefix = `${logPrefix}[${member.id}/${member.name}]`;

    // ── HARD FILTER A: service capability ───────────────────────────────────
    if (!serviceCapableIds.has(member.id)) {
      console.log(`${tPrefix} REJECTED reason=service_not_supported`);
      rejections.push({
        staffId: member.id,
        staffName: member.name,
        reason: "service_not_supported",
      });
      continue;
    }

    // Appointments for this specific technician (non-cancelled)
    const memberApts = nonCancelledAppointments.filter(
      (a) => a.staffId === member.id
    );

    // ── HARD FILTER B: direct scheduling conflict ────────────────────────────
    // A direct conflict exists when the proposed time window overlaps with any
    // existing appointment time window for this technician.
    // Overlap condition: newStart < existingEnd AND newEnd > existingStart
    const hardConflict = memberApts.find((apt) => {
      const aptStart = new Date(apt.date);
      const aptEnd = new Date(aptStart.getTime() + apt.duration * 60_000);
      return date < aptEnd && appointmentEnd > aptStart;
    });

    if (hardConflict) {
      const conflictStart = new Date(hardConflict.date).toISOString();
      console.log(
        `${tPrefix} REJECTED reason=scheduling_conflict ` +
          `conflicting_apt_id=${hardConflict.id} at=${conflictStart}`
      );
      rejections.push({
        staffId: member.id,
        staffName: member.name,
        reason: "scheduling_conflict",
      });
      continue;
    }

    // ── SOFT SCORING ─────────────────────────────────────────────────────────
    // All values below contribute to a total score.
    // Higher score = better candidate.

    // S1: Clocked-in bonus
    // Technicians who are actually at work are strongly preferred.
    const clockedInBonus = clockedInIds.has(member.id) ? W_CLOCKED_IN : 0;
    console.log(
      clockedInBonus > 0
        ? `${tPrefix} +${clockedInBonus} (clocked_in)`
        : `${tPrefix} +0 (not_clocked_in)`
    );

    // S2: Near-conflict bonus
    // Penalise techs with appointments that end just before, or start just after,
    // the proposed slot — leaving no breathing room between jobs.
    // We award a bonus when there is NO such near-conflict (inverse logic for readability).
    const hasNearConflict = memberApts.some((apt) => {
      const aptStart = new Date(apt.date);
      const aptEnd = new Date(aptStart.getTime() + apt.duration * 60_000);

      // Case A: an existing appointment ends in the buffer window before our slot
      //   bufferBeforeStart < aptEnd <= date
      const endsTooCloseBefore = aptEnd > bufferBeforeStart && aptEnd <= date;

      // Case B: an existing appointment starts in the buffer window after our slot
      //   appointmentEnd <= aptStart < bufferAfterEnd
      const startsTooCloseAfter =
        aptStart >= appointmentEnd && aptStart < bufferAfterEnd;

      return endsTooCloseBefore || startsTooCloseAfter;
    });

    const nearConflictBonus = hasNearConflict ? 0 : W_NO_NEAR_CONFLICT;
    console.log(
      hasNearConflict
        ? `${tPrefix} +0 (near_conflict_within_buffer)`
        : `${tPrefix} +${nearConflictBonus} (no_near_conflict)`
    );

    // S3: Last-assigned penalty
    // The most recently assigned technician is penalised to prevent
    // the same person receiving consecutive bookings.
    const lastAssignedPenalty =
      lastAssignedStaffId === member.id ? W_LAST_ASSIGNED : 0;
    if (lastAssignedPenalty > 0) {
      console.log(`${tPrefix} -${lastAssignedPenalty} (last_assigned_penalty)`);
    }

    // S4: Active workload penalty
    // Count appointments that are currently active (not yet completed),
    // indicating the technician is currently occupied or will be soon.
    const activeCount = memberApts.filter(
      (a) =>
        a.status === "started" ||
        a.status === "pending" ||
        a.status === "confirmed"
    ).length;
    const workloadPenalty = activeCount * W_ACTIVE_WORKLOAD;
    if (workloadPenalty > 0) {
      console.log(
        `${tPrefix} -${workloadPenalty} (workload: ${activeCount} active_apts)`
      );
    }

    // S5: Total booking count penalty
    // All non-cancelled bookings today, including completed ones.
    // This balances load distribution across the full day.
    const bookingCountPenalty = memberApts.length * W_BOOKING_COUNT;
    if (bookingCountPenalty > 0) {
      console.log(
        `${tPrefix} -${bookingCountPenalty} (booking_count: ${memberApts.length} today)`
      );
    }

    // S6: Revenue micro-penalty (intentionally tiny — last-resort tiebreaker only)
    const revenueToday = memberApts.reduce((sum, a) => {
      const paid = parseFloat((a.totalPaid as string | null) ?? "0") || 0;
      return sum + paid;
    }, 0);
    // Round to 2dp to keep logs readable
    const revenuePenalty =
      Math.round(revenueToday * W_REVENUE_DOLLAR * 100) / 100;
    if (revenuePenalty > 0) {
      console.log(
        `${tPrefix} -${revenuePenalty} (revenue_today: $${revenueToday.toFixed(2)})`
      );
    }

    // ── Compute total score ───────────────────────────────────────────────────
    const totalScore =
      clockedInBonus +
      nearConflictBonus -
      lastAssignedPenalty -
      workloadPenalty -
      bookingCountPenalty -
      revenuePenalty;

    const breakdown: TechnicianScoreBreakdown = {
      clockedIn: clockedInBonus,
      noNearConflict: nearConflictBonus,
      lastAssignedPenalty: -lastAssignedPenalty,
      workloadPenalty: -workloadPenalty,
      bookingCountPenalty: -bookingCountPenalty,
      revenuePenalty: -revenuePenalty,
      total: totalScore,
    };

    console.log(`${tPrefix} SCORE=${totalScore}`);
    allScores.push({
      staffId: member.id,
      staffName: member.name,
      score: totalScore,
      breakdown,
    });
  }

  // ── Step 7: Select the winner ─────────────────────────────────────────────
  if (allScores.length === 0) {
    const rejectionSummary = rejections
      .map((r) => `${r.staffName}:${r.reason}`)
      .join(", ");
    console.log(
      `${logPrefix} RESULT: no_eligible_technicians rejections=[${rejectionSummary}]`
    );
    return buildNoAssignment(
      "No eligible technicians after all filters",
      rejections,
      allScores
    );
  }

  // Sort: highest score first. Tiebreak: lowest staffId (deterministic and stable).
  allScores.sort(
    (a, b) => b.score - a.score || a.staffId - b.staffId
  );

  const winner = allScores[0];

  console.log(
    `${logPrefix} RESULT: assigned staffId=${winner.staffId} ` +
      `(${winner.staffName}) score=${winner.score} ` +
      `breakdown=${JSON.stringify(winner.breakdown)}`
  );
  console.log(
    `${logPrefix} Runner-up scores: ` +
      allScores
        .slice(1)
        .map((s) => `${s.staffName}=${s.score}`)
        .join(", ")
  );

  return {
    assigned: true,
    staffId: winner.staffId,
    staffName: winner.staffName,
    score: winner.score,
    breakdown: winner.breakdown,
    rejections,
    allScores,
    reason: "auto_assigned_by_fairness_engine",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildNoAssignment(
  reason: string,
  rejections: TechnicianRejection[],
  allScores: TechnicianScore[]
): AssignmentResult {
  return {
    assigned: false,
    staffId: null,
    staffName: null,
    score: null,
    breakdown: null,
    rejections,
    allScores,
    reason,
  };
}

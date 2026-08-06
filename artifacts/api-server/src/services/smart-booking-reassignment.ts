/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart Booking Reassignment Engine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Prevents scheduled appointments from becoming late when a technician is
 * occupied by a walk-in or earlier service that runs long.
 *
 * HARD RULES — never violated:
 *   • NEVER change appointment date or start time
 *   • NEVER change appointment end time (duration preserved)
 *   • NEVER split an appointment across multiple technicians
 *   • NEVER shorten the booked service duration
 *   • ONLY change the assigned technician (staffId)
 *   • ONLY reassign appointments in BOOKED status (confirmed / pending)
 *   • NEVER move if client_requested_staff = true
 *   • NEVER move if < 30 minutes from now (locked window)
 *
 * Lock window:
 *   60+ min away  → eligible for reassignment
 *   30–60 min     → eligible only when a conflict is predicted
 *   < 30 min      → LOCKED — never moved
 *
 * Runs every 5 minutes on a setInterval. Also exported as a targeted per-staff
 * function so the walk-in Turn System can trigger it immediately after
 * assigning a walk-in to a technician.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "../db";
import {
  appointments,
  staff,
  staffServices,
  timeclock,
  locations,
  storeSettings,
} from "@shared/schema";
import { and, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Appointments starting in < 30 min cannot be moved under any circumstances */
const LOCK_WINDOW_MS = 30 * 60_000;

/** Appointments 30–60 min away are only moved when a conflict is detected */
const PROACTIVE_WINDOW_MS = 60 * 60_000;

/** Scheduler interval */
const RUN_INTERVAL_MS = 5 * 60_000;

/**
 * Appointment statuses that represent an active, in-progress service.
 * Used to find the technician's current workload and project a finish time.
 */
const ACTIVE_STATUSES = ["started", "checked_in"] as const;

/**
 * Appointment statuses that represent a future scheduled (booked) appointment.
 * Only appointments in these statuses are candidates for reassignment.
 */
const BOOKED_STATUSES = ["confirmed", "pending"] as const;

// ── Audit log bootstrap ───────────────────────────────────────────────────────

async function ensureAuditTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS booking_reassignment_log (
      id                    SERIAL PRIMARY KEY,
      appointment_id        INTEGER NOT NULL,
      store_id              INTEGER NOT NULL,
      from_staff_id         INTEGER NOT NULL,
      to_staff_id           INTEGER NOT NULL,
      reason                TEXT NOT NULL,
      conflict_appt_id      INTEGER,
      projected_finish_at   TIMESTAMPTZ,
      appointment_start_at  TIMESTAMPTZ NOT NULL,
      score                 INTEGER,
      created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);
  // Each CREATE INDEX must be its own db.execute() call — node-postgres does
  // not support multiple semicolon-separated statements in a single prepared
  // statement, and Drizzle wraps every sql`` template in one.
  await db.execute(sql`CREATE INDEX IF NOT EXISTS brl_store_id_idx       ON booking_reassignment_log (store_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS brl_appointment_id_idx ON booking_reassignment_log (appointment_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS brl_created_at_idx     ON booking_reassignment_log (created_at DESC)`);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApptRow {
  id: number;
  staffId: number | null;
  date: Date | string;
  duration: number | null;
  status: string | null;
  serviceId: number | null;
  clientRequestedStaff: boolean | null;
}

interface CandidateScore {
  staffId: number;
  score: number;
}

// ── Overlap helper ────────────────────────────────────────────────────────────

/**
 * Returns true when [aStart, aStart+aDurationMin) overlaps [bStart, bEnd).
 * Uses the same closed-interval formula as bookingEngine.ts.
 */
function overlaps(
  aStart: Date,
  aDurationMin: number,
  bStart: Date,
  bEnd: Date,
): boolean {
  const aS = aStart.getTime();
  const aE = aS + aDurationMin * 60_000;
  return aS < bEnd.getTime() && aE > bStart.getTime();
}

// ── Turn deque reader ─────────────────────────────────────────────────────────

async function getTurnDeque(storeId: number): Promise<number[]> {
  try {
    const [row] = await db
      .select({ preferences: storeSettings.preferences })
      .from(storeSettings)
      .where(eq(storeSettings.storeId, storeId));
    if (!row) return [];
    const prefs = JSON.parse(row.preferences ?? "{}");
    const deque = prefs?.turnSystem?.dequeOrder ?? [];
    return Array.isArray(deque) ? (deque as unknown[]).map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

// ── Core engine: one store ────────────────────────────────────────────────────

/**
 * Evaluate and perform any needed reassignments for a single store.
 * Can optionally be scoped to a specific technician (used by the walk-in hook).
 */
export async function runEngineForStore(
  storeId: number,
  timezone: string,
  now: Date = new Date(),
  focusStaffId?: number,
): Promise<void> {
  const todayKey = formatInTimeZone(now, timezone || "UTC", "yyyy-MM-dd");

  // ── 1. Clocked-in staff today ─────────────────────────────────────────────
  const clockedInRows = await db
    .select({ staffId: timeclock.staffId })
    .from(timeclock)
    .where(
      and(
        eq(timeclock.storeId, storeId),
        eq(timeclock.workDate, todayKey),
        isNull(timeclock.clockOut), // still clocked in (no clock-out yet)
      ),
    );

  if (clockedInRows.length === 0) return;
  const clockedInIds = clockedInRows.map((r) => r.staffId);

  // ── 2. Active appointments (currently serving a client) ───────────────────
  // We use today's date as a rough lower bound — appointments started today.
  const todayMidnight = new Date(`${todayKey}T00:00:00Z`);

  const activeAppts = await db
    .select({
      id:                   appointments.id,
      staffId:              appointments.staffId,
      date:                 appointments.date,
      duration:             appointments.duration,
      status:               appointments.status,
      serviceId:            appointments.serviceId,
      clientRequestedStaff: appointments.clientRequestedStaff,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        inArray(appointments.status, [...ACTIVE_STATUSES]),
        gte(appointments.date, todayMidnight),
      ),
    );

  // Filter to clocked-in staff only; optionally scope to one technician
  const busyAppts = activeAppts.filter(
    (a) =>
      a.staffId !== null &&
      clockedInIds.includes(a.staffId) &&
      (focusStaffId === undefined || a.staffId === focusStaffId),
  );

  if (busyAppts.length === 0) return;

  // ── 3. All future booked appointments for this store ──────────────────────
  const futureBooked = (await db
    .select({
      id:                  appointments.id,
      staffId:             appointments.staffId,
      date:                appointments.date,
      duration:            appointments.duration,
      status:              appointments.status,
      serviceId:           appointments.serviceId,
      clientRequestedStaff: appointments.clientRequestedStaff,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        inArray(appointments.status, [...BOOKED_STATUSES]),
        gte(appointments.date, now),
      ),
    )
    .orderBy(appointments.date)) as ApptRow[];

  if (futureBooked.length === 0) return;

  const dequeOrder = await getTurnDeque(storeId);

  // ── 4. Check each busy technician for conflicts ───────────────────────────
  for (const activeAppt of busyAppts) {
    if (!activeAppt.staffId || !activeAppt.date) continue;

    // projectedFinishTime = scheduled end of the active appointment.
    // This is conservative — assumes the service runs to its full booked duration.
    const activeStart = activeAppt.date instanceof Date ? activeAppt.date : new Date(activeAppt.date);
    const projectedFinishTime = new Date(
      activeStart.getTime() + (activeAppt.duration ?? 60) * 60_000,
    );

    // Find the next booked appointment for this technician
    const nextAppt = futureBooked.find((a) => a.staffId === activeAppt.staffId);
    if (!nextAppt || !nextAppt.date) continue;

    const nextStart = new Date(nextAppt.date as string);
    const minutesToNext = (nextStart.getTime() - now.getTime()) / 60_000;

    // Hard lock: never touch appointments starting in < 30 minutes
    if (minutesToNext < 30) continue;

    const conflictPredicted = projectedFinishTime.getTime() > nextStart.getTime();

    // 30–60 min window: only act if a conflict is actually predicted
    if (minutesToNext < 60 && !conflictPredicted) continue;

    // Skip if client requested this specific technician
    if (nextAppt.clientRequestedStaff) continue;

    // Attempt reassignment
    await attemptReassignment({
      storeId,
      appt:                nextAppt,
      currentStaffId:      activeAppt.staffId,
      conflictApptId:      activeAppt.id,
      projectedFinishTime,
      futureBooked,
      activeAppts:         busyAppts,
      clockedInIds,
      dequeOrder,
      todayMidnight,
      now,
      reason: conflictPredicted
        ? `Active ticket #${activeAppt.id} projected to finish at ${projectedFinishTime.toISOString()}, which runs into appointment #${nextAppt.id} starting at ${nextStart.toISOString()}`
        : `Preventive: projected finish at ${projectedFinishTime.toISOString()} is approaching appointment #${nextAppt.id} start at ${nextStart.toISOString()}`,
    });
  }
}

// ── Reassignment attempt ──────────────────────────────────────────────────────

interface ReassignmentAttempt {
  storeId: number;
  appt: ApptRow;
  currentStaffId: number;
  conflictApptId: number;
  projectedFinishTime: Date;
  futureBooked: ApptRow[];
  activeAppts: ApptRow[];
  clockedInIds: number[];
  dequeOrder: number[];
  todayMidnight: Date;
  now: Date;
  reason: string;
}

async function attemptReassignment(params: ReassignmentAttempt): Promise<void> {
  const {
    storeId, appt, currentStaffId, conflictApptId, projectedFinishTime,
    futureBooked, activeAppts, clockedInIds, dequeOrder, todayMidnight, now, reason,
  } = params;

  const apptStart = appt.date instanceof Date ? appt.date : new Date(appt.date);
  const apptEnd   = new Date(apptStart.getTime() + (appt.duration ?? 60) * 60_000);

  // ── 1. Build candidate pool ───────────────────────────────────────────────
  // Must be clocked in and not the current (conflicting) technician
  const candidatePool = clockedInIds.filter((id) => id !== currentStaffId);
  if (candidatePool.length === 0) return;

  // Must have the required service skill
  if (!appt.serviceId) return;
  const skilledRows = await db
    .select({ staffId: staffServices.staffId })
    .from(staffServices)
    .where(
      and(
        inArray(staffServices.staffId, candidatePool),
        eq(staffServices.serviceId, appt.serviceId),
      ),
    );
  const skilledIds = new Set(skilledRows.map((r) => r.staffId));
  const eligibleIds = candidatePool.filter((id) => skilledIds.has(id));
  if (eligibleIds.length === 0) return;

  // ── 2. Filter by availability ─────────────────────────────────────────────

  const availableIds = eligibleIds.filter((candidateId) => {
    // (a) No overlapping BOOKED appointment in the same time slot
    const hasBookedConflict = futureBooked.some((a) => {
      if (a.staffId !== candidateId) return false;
      if (a.id === appt.id) return false; // the appointment being reassigned itself
      const s = new Date(a.date as string);
      return overlaps(s, a.duration ?? 60, apptStart, apptEnd);
    });
    if (hasBookedConflict) return false;

    // (b) No active appointment whose projected finish runs into this slot
    const hasActiveConflict = activeAppts.some((a) => {
      if (a.staffId !== candidateId) return false;
      const activeStart = new Date(a.date as string | Date);
      const activeEnd   = new Date(activeStart.getTime() + (a.duration ?? 60) * 60_000);
      // Candidate's current service would still be running when our slot starts
      return activeEnd.getTime() > apptStart.getTime();
    });
    if (hasActiveConflict) return false;

    return true;
  });

  if (availableIds.length === 0) return;

  // ── 3. Score each available candidate ────────────────────────────────────

  // Workload: number of appointments today (excluding cancelled) for normalization
  const workloadRows = await db.execute<{ staff_id: number; cnt: number }>(sql`
    SELECT staff_id, COUNT(*)::int AS cnt
    FROM appointments
    WHERE store_id = ${storeId}
      AND staff_id = ANY(${sql.raw(`ARRAY[${availableIds.join(",")}]`)}::int[])
      AND date >= ${todayMidnight.toISOString()}::timestamptz
      AND status != 'cancelled'
    GROUP BY staff_id
  `);
  const workloadMap = new Map<number, number>(
    (workloadRows.rows as any[]).map((r) => [Number(r.staff_id), Number(r.cnt)]),
  );
  const maxWorkload = Math.max(...availableIds.map((id) => workloadMap.get(id) ?? 0), 1);

  // Idle time: end time of the last completed appointment today
  const lastCompletedRows = await db.execute<{
    staff_id: number;
    last_end: string;
  }>(sql`
    SELECT staff_id,
           MAX(date + (duration || ' minutes')::interval) AS last_end
    FROM appointments
    WHERE store_id = ${storeId}
      AND staff_id = ANY(${sql.raw(`ARRAY[${availableIds.join(",")}]`)}::int[])
      AND date >= ${todayMidnight.toISOString()}::timestamptz
      AND status = 'completed'
    GROUP BY staff_id
  `);
  const lastEndMap = new Map<number, Date>(
    (lastCompletedRows.rows as any[]).map((r) => [
      Number(r.staff_id),
      new Date(r.last_end),
    ]),
  );

  const scored: CandidateScore[] = availableIds.map((staffId) => {
    let score = 50; // Base: available for the full time range

    // +20: lower workload (more points for fewer appointments today)
    const workload = workloadMap.get(staffId) ?? 0;
    score += Math.round(20 * (1 - workload / maxWorkload));

    // +10: idle time (up to 10 pts; 1 pt per 6 min idle since last job, capped)
    const lastEnd = lastEndMap.get(staffId);
    const idleMs = lastEnd ? Math.max(0, now.getTime() - lastEnd.getTime()) : 3600_000;
    score += Math.min(10, Math.floor(idleMs / 360_000)); // 360 000 ms = 6 minutes per point

    // +10: turn fairness priority (lower deque index = more points)
    const pos = dequeOrder.indexOf(staffId);
    if (pos === 0)       score += 10;
    else if (pos === 1)  score += 7;
    else if (pos === 2)  score += 5;
    else if (pos >= 0)   score += 3;
    else                 score += 2; // not in deque → lowest priority

    // +10: exact skill match (all eligible candidates pass the skill check)
    score += 10;

    return { staffId, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return;

  // ── 4. Atomic reassignment ────────────────────────────────────────────────
  await db.transaction(async (tx) => {
    // Re-read the appointment inside the transaction to guard against races
    const [live] = await tx
      .select({
        staffId:             appointments.staffId,
        status:              appointments.status,
        clientRequestedStaff: appointments.clientRequestedStaff,
        date:                appointments.date,
      })
      .from(appointments)
      .where(eq(appointments.id, appt.id));

    if (!live) return;
    if (!(BOOKED_STATUSES as readonly string[]).includes(live.status ?? "")) return;
    if (live.clientRequestedStaff) return;
    if (live.staffId !== currentStaffId) return; // already reassigned by a concurrent run

    // Re-verify the candidate has no conflict (in-transaction overlap check)
    const [candidateConflict] = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.storeId, storeId),
          eq(appointments.staffId, best.staffId),
          ne(appointments.id, appt.id),
          inArray(appointments.status, [...BOOKED_STATUSES, ...ACTIVE_STATUSES]),
          // Overlap: candidate's appointment starts before our end AND ends after our start
          sql`${appointments.date} < ${apptEnd.toISOString()}::timestamptz`,
          sql`${appointments.date} + (COALESCE(${appointments.duration}, 60) || ' minutes')::interval > ${apptStart.toISOString()}::timestamptz`,
        ),
      )
      .limit(1);

    if (candidateConflict) return; // race: candidate got booked between our check and now

    // Perform the reassignment — only staffId changes, nothing else
    await tx
      .update(appointments)
      .set({ staffId: best.staffId })
      .where(eq(appointments.id, appt.id));

    // Write audit log
    await tx.execute(sql`
      INSERT INTO booking_reassignment_log
        (appointment_id, store_id, from_staff_id, to_staff_id, reason,
         conflict_appt_id, projected_finish_at, appointment_start_at, score)
      VALUES
        (${appt.id}, ${storeId}, ${currentStaffId}, ${best.staffId}, ${reason},
         ${conflictApptId}, ${projectedFinishTime.toISOString()}::timestamptz,
         ${apptStart.toISOString()}::timestamptz, ${best.score})
    `);

    console.log(
      `[SmartBookingEngine] ✓ Appt #${appt.id} reassigned staff ${currentStaffId} → ${best.staffId}` +
      ` (score=${best.score}, storeId=${storeId})`,
    );
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the engine across all stores.
 * Called by the 5-minute scheduler.
 */
export async function runSmartBookingReassignment(): Promise<void> {
  const stores = await db
    .select({ id: locations.id, timezone: locations.timezone })
    .from(locations);

  await Promise.allSettled(
    stores.map((s) =>
      runEngineForStore(s.id, s.timezone, new Date()).catch((err: any) =>
        console.error(`[SmartBookingEngine] Store ${s.id} error:`, err.message),
      ),
    ),
  );
}

/**
 * Run the engine scoped to a single technician within a store.
 *
 * Call this from the Turn System immediately after a walk-in is assigned so
 * the engine can detect and resolve any resulting scheduling conflict without
 * waiting for the next 5-minute cycle.
 *
 * Looks up the store timezone internally — callers do not need to provide it.
 * Never throws; designed for fire-and-forget use.
 *
 * @param storeId - The store where the walk-in was assigned
 * @param staffId - The technician who just received the walk-in
 */
export async function runEngineForStaff(storeId: number, staffId: number): Promise<void> {
  try {
    const [store] = await db
      .select({ timezone: locations.timezone })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);
    const timezone = store?.timezone ?? "UTC";
    await runEngineForStore(storeId, timezone, new Date(), staffId);
  } catch (err: any) {
    // Never throw — this is fire-and-forget from the walk-in route
    console.error(
      `[SmartBookingEngine] Walk-in trigger failed (store=${storeId}, staff=${staffId}):`,
      err.message,
    );
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let _engineInterval: ReturnType<typeof setInterval> | null = null;

export function startSmartBookingEngine(): void {
  if (_engineInterval) return; // idempotent

  // Ensure the audit log table exists even if the migration hasn't run yet
  ensureAuditTable().catch((err: any) =>
    console.error("[SmartBookingEngine] Audit table init failed:", err.message),
  );

  const tick = (): void => {
    runSmartBookingReassignment().catch((err: any) =>
      console.error("[SmartBookingEngine] Tick error:", err.message),
    );
  };

  _engineInterval = setInterval(tick, RUN_INTERVAL_MS);

  // First run: 90 seconds after startup (let other schedulers and DB settle)
  setTimeout(tick, 90_000);

  console.log("[SmartBookingEngine] Started — evaluates every 5 minutes.");
}

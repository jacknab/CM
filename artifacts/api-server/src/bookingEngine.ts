/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Booking Engine — Unified Scheduling Authority
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Single source of truth for ALL booking scheduling logic. Every path that
 * creates, reschedules, or validates a booking slot MUST route through here.
 *
 * Enforces (non-negotiable):
 *   • Timezone normalization — salon local time only, never server or user tz
 *   • Same-day booking rule — rejected unless allowSameDay is explicitly set
 *   • Business hours enforcement — dynamic from DB, not hardcoded
 *   • Overlap / conflict detection — closed-interval formula
 *   • Atomic create and reschedule — overlap check + write in ONE DB transaction
 *
 * DURATION RULE:
 *   ALWAYS use appointment.duration (final stored value, includes addons).
 *   NEVER use service.duration or service.baseDuration.
 *
 * OVERLAP FORMULA:
 *   (existing.start < new.end) AND (existing.end > new.start)
 *
 * Calling sites:
 *   • AI Receptionist  — createBookingViaBookingRules, handleReschedule
 *   • Public route     — POST /api/public/store/:slug/book
 *   • Admin route      — POST /api/appointments
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "./db";
import { appointments } from "@shared/schema";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { storage } from "./storage";

/** The transaction type yielded by db.transaction(async (tx) => ...) */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Result type ───────────────────────────────────────────────────────────────

export type BookingErrorCode =
  | "SAME_DAY"
  | "PAST_DATE"
  | "CLOSED"
  | "OUTSIDE_HOURS"
  | "CONFLICT"
  | "INVALID_INPUT"
  | "NOT_FOUND";

export interface BookingEngineError {
  code: BookingErrorCode;
  message: string;
  /** Populated when code === "CONFLICT" — ID of the blocking appointment */
  conflictId?: number;
}

export type BookingEngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: BookingEngineError };

// ── Timezone utilities (exported for callers) ─────────────────────────────────

/**
 * Returns a correctly-padded YYYY-MM-DD date key in the salon's local timezone.
 * Uses formatInTimeZone so the result is always salon-wall-clock-correct,
 * independent of the server's process timezone (date-fns-tz v3 safe).
 */
export function toSalonDateKey(utcDate: Date, timezone: string): string {
  return formatInTimeZone(utcDate, timezone || "UTC", "yyyy-MM-dd");
}

/**
 * Returns UTC-equivalent Date objects representing midnight start and end of
 * a given local date key (YYYY-MM-DD) in the specified salon timezone.
 */
export function salonDayBoundaries(
  dateKey: string,
  timezone: string,
): { dayStart: Date; dayEnd: Date } {
  const tz = timezone || "UTC";
  return {
    dayStart: fromZonedTime(new Date(`${dateKey}T00:00:00`), tz),
    dayEnd:   fromZonedTime(new Date(`${dateKey}T23:59:59.999`), tz),
  };
}

// ── Internal: overlap formula ─────────────────────────────────────────────────

/**
 * Returns true if [existingStart, existingStart+duration) overlaps [newStart, newEnd).
 * existingDurationMin MUST come from appointment.duration — never service.duration.
 */
function overlaps(
  existingStart: Date,
  existingDurationMin: number,
  newStart: Date,
  newEnd: Date,
): boolean {
  const eStart = existingStart.getTime();
  const eEnd   = eStart + existingDurationMin * 60_000;
  return eStart < newEnd.getTime() && eEnd > newStart.getTime();
}

// ── validateBookingSlot ───────────────────────────────────────────────────────

export interface ValidateSlotInput {
  storeId: number;
  timezone: string;
  startTime: Date;
  /** ALWAYS the final computed duration including addons — never base service duration */
  durationMinutes: number;
  staffId?: number | null;
  /** For reschedule: exclude this appointment from the conflict scan */
  excludeAppointmentId?: number;
  /** Set true only for walk-in context — bypasses same-day and past-date guards */
  allowSameDay?: boolean;
  /** Optional: also verify this resource (station/chair) is free for the slot */
  resourceId?: number | null;
}

/**
 * Non-atomic pre-validation: same-day rule, past-date, business hours, overlap.
 *
 * Safe to call as a fast-rejection layer before committing an atomic write.
 * Does NOT hold a DB lock — use atomicCreateBooking / atomicRescheduleBooking
 * for the authoritative, race-proof write.
 */
export async function validateBookingSlot(
  input: ValidateSlotInput,
): Promise<BookingEngineResult<void>> {
  const { storeId, startTime, durationMinutes, staffId, excludeAppointmentId, allowSameDay } = input;
  const tz = input.timezone || "UTC";

  // ── Past-date guard ──────────────────────────────────────────────────────
  if (!allowSameDay && startTime.getTime() <= Date.now()) {
    return {
      ok: false,
      error: { code: "PAST_DATE", message: "Cannot book a time that is already in the past." },
    };
  }

  const dateKey  = toSalonDateKey(startTime, tz);
  const todayKey = toSalonDateKey(new Date(), tz);

  // ── Same-day rule ────────────────────────────────────────────────────────
  if (!allowSameDay && dateKey === todayKey) {
    return {
      ok: false,
      error: {
        code: "SAME_DAY",
        message:
          "Same-day bookings are not accepted. Walk-ins are welcome — please use get_walkin_availability for today's windows, then offer a future date.",
      },
    };
  }

  // ── Business hours ───────────────────────────────────────────────────────
  // Use formatInTimeZone throughout — never toZonedTime+getUTC* (broken in date-fns-tz v3).
  const endTime   = new Date(startTime.getTime() + durationMinutes * 60_000);
  // date-fns "i" token: 1=Mon…7=Sun → %7 gives 0=Sun,1=Mon,…,6=Sat (JS convention)
  const dayOfWeek = parseInt(formatInTimeZone(startTime, tz, "i"), 10) % 7;

  const hours    = await storage.getBusinessHours(storeId);
  const dayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);

  if (dayHours?.isClosed) {
    return {
      ok: false,
      error: { code: "CLOSED", message: "The salon is closed on that day." },
    };
  }

  if (dayHours?.openTime && dayHours?.closeTime) {
    const [openH,  openM]  = dayHours.openTime.split(":").map(Number);
    const [closeH, closeM] = dayHours.closeTime.split(":").map(Number);
    const openMin          = openH  * 60 + openM;
    const closeMin         = closeH * 60 + closeM;
    const startMin         = parseInt(formatInTimeZone(startTime, tz, "H"), 10) * 60
                           + parseInt(formatInTimeZone(startTime, tz, "m"), 10);
    const endMin           = parseInt(formatInTimeZone(endTime, tz, "H"), 10)   * 60
                           + parseInt(formatInTimeZone(endTime, tz, "m"), 10);

    if (startMin < openMin || endMin > closeMin) {
      return {
        ok: false,
        error: {
          code: "OUTSIDE_HOURS",
          message: `Booking falls outside business hours (${dayHours.openTime}–${dayHours.closeTime} salon time).`,
        },
      };
    }
  }

  // ── Overlap / conflict check (non-atomic) ────────────────────────────────
  const { dayStart, dayEnd } = salonDayBoundaries(dateKey, tz);
  const queryParams: Parameters<typeof storage.getAppointments>[0] = {
    storeId,
    from: dayStart,
    to: dayEnd,
  };
  if (staffId) queryParams.staffId = staffId;

  const dayAppts = await storage.getAppointments(queryParams);
  const newEnd   = endTime;

  const conflict = dayAppts.find((a) => {
    if (a.id === excludeAppointmentId) return false;
    if (String(a.status ?? "").toLowerCase() === "cancelled") return false;
    if (!staffId && a.staffId !== null) return false;
    // RULE: appointment.duration (incl. addons) — never service.duration
    return overlaps(new Date(a.date), (a.duration ?? 60) as number, startTime, newEnd);
  });

  if (conflict) {
    const conflictDisplayTime = new Date(conflict.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: `Time slot conflicts with an existing booking at ${conflictDisplayTime} (salon time).`,
        conflictId: conflict.id,
      },
    };
  }

  // ── Resource conflict check (non-atomic) ─────────────────────────────────
  if (input.resourceId) {
    const resourceConflict = dayAppts.find((a) => {
      if (a.id === excludeAppointmentId) return false;
      if (String(a.status ?? "").toLowerCase() === "cancelled") return false;
      if ((a as any).resourceId !== input.resourceId) return false;
      return overlaps(new Date(a.date), (a.duration ?? 60) as number, startTime, newEnd);
    });
    if (resourceConflict) {
      const conflictDisplayTime = new Date(resourceConflict.date).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      });
      return {
        ok: false,
        error: {
          code: "CONFLICT" as BookingErrorCode,
          message: `That station/chair is already booked at ${conflictDisplayTime} (salon time).`,
          conflictId: resourceConflict.id,
        },
      };
    }
  }

  return { ok: true, data: undefined };
}

// ── atomicCreateBooking ───────────────────────────────────────────────────────

export interface AtomicCreateInput {
  storeId: number;
  timezone: string;
  startTime: Date;
  /** ALWAYS the final computed duration including addons */
  durationMinutes: number;
  staffId: number;
  serviceId: number;
  /** Null for anonymous walk-ins with no client record (kiosk "guest" check-in) */
  customerId: number | null;
  status?: string;
  notes?: string | null;
  paymentMethod?: string | null;
  tipAmount?: string | null;
  discountAmount?: string | null;
  totalPaid?: string | null;
  clientRequestedStaff?: boolean;
  /** Set for kiosk walk-in check-ins that are created already checked in */
  checkedInAt?: Date | null;
  depositPaid?: boolean;
  /** Optional: assign a salon resource (station/chair) to this appointment */
  resourceId?: number | null;
  /**
   * Set true for a payment-pending hold (AI receptionist booking a store that
   * requires a deposit/card-on-file) — keeps the appointment off the Calendar
   * grid (Calendar.tsx filters on this) until payment completes, while still
   * counting as a real conflict for other bookings against the same slot.
   */
  calendarHidden?: boolean;
  paymentStatus?: string;
}

/**
 * Atomic booking creation: overlap check + INSERT in a single DB transaction.
 *
 * Eliminates the TOCTOU race condition between "slot available" and "write".
 * If two concurrent requests target the same slot, only one INSERT succeeds.
 *
 * Caller responsibilities (outside the transaction):
 *   • customer upsert before calling
 *   • add-on handling and duration extension after calling
 *   • booking confirmation notifications after calling
 *   • loyalty side-effects after calling
 */
export async function atomicCreateBooking(
  input: AtomicCreateInput,
  /**
   * Optional caller-owned transaction to run inside instead of opening a new
   * one. Lets a caller compose this with its own pre-checks (e.g. a
   * client-level dedupe lock) inside a single atomic unit of work instead of
   * releasing locks between separate transactions.
   */
  externalTx?: DbTx,
): Promise<BookingEngineResult<{ id: number }>> {
  const tz      = input.timezone || "UTC";
  const newStart = input.startTime;
  const newEnd   = new Date(newStart.getTime() + input.durationMinutes * 60_000);
  const dateKey  = toSalonDateKey(newStart, tz);
  const { dayStart, dayEnd } = salonDayBoundaries(dateKey, tz);

  const run = async (tx: DbTx) => {
    // Serialize all writers for this (store, staff) pair. Without this, two
    // concurrent transactions under READ COMMITTED can both run the overlap
    // SELECT below before either commits its INSERT, both see "no conflict,"
    // and both insert — a classic write-skew double-booking. The lock is
    // transaction-scoped (pg_advisory_xact_lock) so it's released automatically
    // at commit/rollback; the second transaction simply waits its turn and then
    // re-evaluates the (now up-to-date) conflict check below.
    // Serialize writers for this (store, staff) pair — prevents write-skew double-booking
    await tx.execute(
      sql`select pg_advisory_xact_lock(${input.storeId}::int, ${input.staffId}::int)`
    );
    // Also lock on resource to prevent two concurrent bookings from grabbing the same station/chair.
    // Use storeId+1_000_000 as namespace to avoid collisions with the staff lock space.
    if (input.resourceId) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${input.storeId + 1_000_000}::int, ${input.resourceId}::int)`
      );
    }

    const existing = await tx
      .select({
        id:       appointments.id,
        date:     appointments.date,
        duration: appointments.duration,
        status:   appointments.status,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.storeId,  input.storeId),
          eq(appointments.staffId,  input.staffId),
          gte(appointments.date,    dayStart),
          lte(appointments.date,    dayEnd),
        ),
      );

    const conflict = existing.find((a) => {
      if (String(a.status ?? "").toLowerCase() === "cancelled") return false;
      // RULE: appointment.duration (incl. addons) — never service.duration
      return overlaps(
        new Date(a.date as Date),
        (a.duration ?? 60) as number,
        newStart,
        newEnd,
      );
    });

    if (conflict) {
      const conflictDisplayTime = new Date(conflict.date as Date).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      });
      return {
        ok: false as const,
        error: {
          code: "CONFLICT" as BookingErrorCode,
          message: `Time slot is no longer available — conflicting booking at ${conflictDisplayTime} (salon time).`,
          conflictId: conflict.id as number,
        },
      };
    }

    // ── Resource conflict check (atomic) ───────────────────────────────────
    if (input.resourceId) {
      const resourceExisting = await tx
        .select({
          id:       appointments.id,
          date:     appointments.date,
          duration: appointments.duration,
          status:   appointments.status,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.storeId,                input.storeId),
            eq((appointments as any).resourceId,    input.resourceId),
            gte(appointments.date,                  dayStart),
            lte(appointments.date,                  dayEnd),
          ),
        );
      const resourceConflict = resourceExisting.find((a) => {
        if (String(a.status ?? "").toLowerCase() === "cancelled") return false;
        return overlaps(new Date(a.date as Date), (a.duration ?? 60) as number, newStart, newEnd);
      });
      if (resourceConflict) {
        const conflictDisplayTime = new Date(resourceConflict.date as Date).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", timeZone: tz,
        });
        return {
          ok: false as const,
          error: {
            code: "CONFLICT" as BookingErrorCode,
            message: `That station/chair is already booked at ${conflictDisplayTime} (salon time).`,
            conflictId: resourceConflict.id as number,
          },
        };
      }
    }

    const [created] = await tx
      .insert(appointments)
      .values({
        date:               input.startTime,
        serviceId:          input.serviceId,
        staffId:            input.staffId,
        customerId:         input.customerId,
        duration:           input.durationMinutes,
        status:             (input.status ?? "pending") as any,
        storeId:            input.storeId,
        notes:              input.notes ?? null,
        cancellationReason: null,
        paymentMethod:      input.paymentMethod ?? null,
        tipAmount:          input.tipAmount ?? null,
        discountAmount:     input.discountAmount ?? null,
        totalPaid:          input.totalPaid ?? null,
        clientRequestedStaff: input.clientRequestedStaff ?? false,
        checkedInAt:        input.checkedInAt ?? null,
        depositPaid:        input.depositPaid ?? false,
        resourceId:         input.resourceId ?? null,
        calendarHidden:     input.calendarHidden ?? false,
        ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
      } as any)
      .returning({ id: appointments.id });

    return { ok: true as const, data: { id: created.id } };
  };

  try {
    if (externalTx) return await run(externalTx);
    return await db.transaction(run);
  } catch (err) {
    console.error("[bookingEngine] atomicCreateBooking transaction failed:", err);
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Booking could not be created — scheduling conflict or database error. Please try another time.",
      },
    };
  }
}

// ── atomicRescheduleBooking ───────────────────────────────────────────────────

export interface AtomicRescheduleInput {
  appointmentId: number;
  storeId: number;
  timezone: string;
  newStartTime: Date;
  /** ALWAYS the final computed duration including addons */
  durationMinutes: number;
  staffId?: number | null;
}

/**
 * Atomic reschedule: overlap check (excluding the current appointment itself)
 * + UPDATE in a single DB transaction.
 *
 * Pre-conditions enforced by the caller before invoking:
 *   • same-day rule — validated via validateBookingSlot()
 *   • business hours — validated via validateBookingSlot()
 *   • allowlist ownership verified
 *   • storeId ownership verified
 */
export async function atomicRescheduleBooking(
  input: AtomicRescheduleInput,
): Promise<BookingEngineResult<{ id: number }>> {
  const tz      = input.timezone || "UTC";
  const newStart = input.newStartTime;
  const newEnd   = new Date(newStart.getTime() + input.durationMinutes * 60_000);
  const dateKey  = toSalonDateKey(newStart, tz);
  const { dayStart, dayEnd } = salonDayBoundaries(dateKey, tz);

  try {
    return await db.transaction(async (tx) => {
      const whereClause = and(
        eq(appointments.storeId,  input.storeId),
        ne(appointments.id,       input.appointmentId),   // exclude self — safe reschedule rule
        gte(appointments.date,    dayStart),
        lte(appointments.date,    dayEnd),
        ...(input.staffId ? [eq(appointments.staffId, input.staffId)] : []),
      );

      const existing = await tx
        .select({
          id:       appointments.id,
          date:     appointments.date,
          duration: appointments.duration,
          status:   appointments.status,
        })
        .from(appointments)
        .where(whereClause);

      const conflict = existing.find((a) => {
        if (String(a.status ?? "").toLowerCase() === "cancelled") return false;
        // RULE: appointment.duration (incl. addons) — never service.duration
        return overlaps(
          new Date(a.date as Date),
          (a.duration ?? 60) as number,
          newStart,
          newEnd,
        );
      });

      if (conflict) {
        const conflictDisplayTime = new Date(conflict.date as Date).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: tz,
        });
        return {
          ok: false as const,
          error: {
            code: "CONFLICT" as BookingErrorCode,
            message: `That time is not available — existing booking at ${conflictDisplayTime} (salon time). Please use search_available_slots to find the next open window.`,
            conflictId: conflict.id as number,
          },
        };
      }

      const [updated] = await tx
        .update(appointments)
        .set({ date: input.newStartTime, status: "confirmed" as any })
        .where(eq(appointments.id, input.appointmentId))
        .returning({ id: appointments.id });

      if (!updated) {
        return {
          ok: false as const,
          error: { code: "NOT_FOUND" as BookingErrorCode, message: "Appointment not found." },
        };
      }

      return { ok: true as const, data: { id: updated.id } };
    });
  } catch (err) {
    console.error("[bookingEngine] atomicRescheduleBooking transaction failed:", err);
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Reschedule failed due to a scheduling conflict or database error. Please try another time.",
      },
    };
  }
}

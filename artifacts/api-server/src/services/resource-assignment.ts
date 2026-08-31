/**
 * RESOURCE AUTO-ASSIGNMENT ENGINE
 * ============================================================
 * Assigns a physical salon resource (pedicure chair / nail station) to a
 * new appointment, mirroring appointment-assignment.ts's technician engine
 * but without fairness scoring — resources are interchangeable within a
 * type, so we just need the first active, conflict-free one.
 *
 * IMPORTANT INVARIANTS (same as the technician engine):
 *   - Pure read-only — never creates or modifies records. The caller is
 *     responsible for writing the winning resourceId to the appointment row.
 *   - Deterministic: identical inputs always produce the same winner
 *     (lowest sortOrder, tiebreak by lowest id).
 */

import { db } from "../db";
import { salonResources, appointments } from "@shared/schema";
import { eq, and, gte, asc, isNotNull } from "drizzle-orm";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { locations } from "@shared/schema";

export interface ResourceAssignmentInput {
  storeId: number;
  resourceType: "chair" | "station";
  /** Proposed appointment start time */
  date: Date;
  /** Appointment duration in minutes */
  duration: number;
  /** For reschedule/edit flows: exclude this appointment from the conflict scan */
  excludeAppointmentId?: number;
}

export interface ResourceAssignmentResult {
  assigned: boolean;
  resourceId: number | null;
  resourceName: string | null;
  reason: string;
  /**
   * True when the store has never configured any active resource of this
   * type (as opposed to having some, but all of them busy). Callers should
   * treat this as "this store hasn't opted into resource tracking yet" and
   * let the booking proceed without a resourceId, rather than rejecting it —
   * only an actual full-capacity conflict should block a booking.
   */
  noResourcesConfigured: boolean;
}

export async function autoAssignResource(
  input: ResourceAssignmentInput,
): Promise<ResourceAssignmentResult> {
  const { storeId, resourceType, date, duration, excludeAppointmentId } = input;
  const logPrefix = `[resource-assign][store:${storeId}][type:${resourceType}]`;
  const appointmentEnd = new Date(date.getTime() + duration * 60_000);

  const candidates = await db
    .select()
    .from(salonResources)
    .where(
      and(
        eq(salonResources.storeId, storeId),
        eq(salonResources.type, resourceType),
        eq(salonResources.isActive, true),
      ),
    )
    .orderBy(asc(salonResources.sortOrder), asc(salonResources.id));

  if (candidates.length === 0) {
    console.log(`${logPrefix} No active ${resourceType} resources configured — skipping requirement`);
    return {
      assigned: false,
      resourceId: null,
      resourceName: null,
      reason: `No active ${resourceType === "chair" ? "pedicure chairs" : "nail stations"} configured for this store`,
      noResourcesConfigured: true,
    };
  }

  // Resolve "today" in the salon's local timezone so the same-day conflict
  // scan window lines up with the salon's wall clock, not the server's.
  const [storeRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);
  const storeTz = storeRow?.timezone || "UTC";
  const localDate = toZonedTime(date, storeTz);
  const dateKey = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
  const startOfDay = fromZonedTime(`${dateKey}T00:00:00`, storeTz);

  // Fetch same-day appointments assigned to any candidate resource.
  const dayAppointments = await db
    .select({
      id: appointments.id,
      resourceId: appointments.resourceId,
      date: appointments.date,
      duration: appointments.duration,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        gte(appointments.date, startOfDay),
        isNotNull(appointments.resourceId),
      ),
    );

  const activeAppointments = dayAppointments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.status !== "no_show" &&
      a.status !== "no-show" &&
      a.id !== excludeAppointmentId,
  );

  for (const resource of candidates) {
    const conflict = activeAppointments.find((apt) => {
      if (apt.resourceId !== resource.id) return false;
      const aptStart = new Date(apt.date);
      const aptEnd = new Date(aptStart.getTime() + apt.duration * 60_000);
      return date < aptEnd && appointmentEnd > aptStart;
    });
    if (!conflict) {
      console.log(`${logPrefix} RESULT: assigned resourceId=${resource.id} (${resource.name})`);
      return {
        assigned: true,
        resourceId: resource.id,
        resourceName: resource.name,
        reason: "auto_assigned_first_available",
        noResourcesConfigured: false,
      };
    }
    console.log(`${logPrefix} resource=${resource.id}(${resource.name}) REJECTED reason=scheduling_conflict conflicting_apt_id=${conflict.id}`);
  }

  console.log(`${logPrefix} RESULT: no_available_resource — all ${candidates.length} candidates conflict`);
  return {
    assigned: false,
    resourceId: null,
    resourceName: null,
    reason: `No available ${resourceType === "chair" ? "pedicure chair" : "nail station"} for this time slot`,
    noResourcesConfigured: false,
  };
}

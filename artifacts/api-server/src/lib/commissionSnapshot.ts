/**
 * Commission reproducibility snapshot.
 *
 * Commission reports and contractor payroll runs derive their revenue basis and
 * rate from the LIVE `services.price` / `staff.commission_rate`. Editing either
 * one — or (hard-)deleting a service — silently rewrites what a team member
 * already earned on past work.
 *
 * `snapshotCompletionFields()` returns the values to freeze onto an appointment
 * the first time it is completed. It is idempotent: it returns an empty object
 * when the appointment is already completed or the columns are already set, so
 * the belt-and-suspenders "second completion write" (Terminal capture + the
 * client follow-up PATCH) never overwrites the first snapshot.
 *
 * Historical rows keep NULL snapshots; every consumer falls back to the live
 * value when the snapshot is absent, so no existing report changes.
 */

import { db } from "../db";
import { appointments, services, staff } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface CompletionSnapshot {
  servicePrice?: string;
  commissionRate?: string;
}

export async function snapshotCompletionFields(appointmentId: number): Promise<CompletionSnapshot> {
  const [cur] = await db
    .select({
      status:         appointments.status,
      serviceId:      appointments.serviceId,
      staffId:        appointments.staffId,
      servicePrice:   appointments.servicePrice,
      commissionRate: appointments.commissionRate,
    })
    .from(appointments)
    .where(eq(appointments.id, appointmentId));

  // Already completed → the snapshot (if any) was taken on the first completion.
  if (!cur || cur.status === "completed") return {};

  const out: CompletionSnapshot = {};

  if (cur.servicePrice == null && cur.serviceId != null) {
    const [svc] = await db
      .select({ price: services.price })
      .from(services)
      .where(eq(services.id, cur.serviceId));
    if (svc?.price != null) out.servicePrice = String(svc.price);
  }

  if (cur.commissionRate == null && cur.staffId != null) {
    const [st] = await db
      .select({ rate: staff.commissionRate })
      .from(staff)
      .where(eq(staff.id, cur.staffId));
    if (st?.rate != null) out.commissionRate = String(st.rate);
  }

  return out;
}

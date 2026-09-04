/**
 * commissionAccrual.ts — continuous, per-ticket commission accrual.
 *
 * Historically commission was only ever computed by re-querying `appointments`
 * from scratch when a payroll/payout run was created. This writes ONE row the
 * moment an appointment completes, so the Payroll hub can show a live running
 * total between runs and run-creation becomes a cheap SUM instead of a
 * recompute. See migration 0160 + .claude/skills (Payroll Home plan).
 *
 * Two destination tables, same shape, split by employment type:
 *   - contractor_commissions      — the staff member has a `contractors` row
 *   - staff_commission_accruals   — plain W-2 employee
 *
 * Idempotent: both tables have a partial unique index on appointment_id, so a
 * completion retry / edit-after-complete is a harmless no-op (unique-violation
 * is caught and swallowed here rather than pre-checked, to stay race-safe).
 */
import { db } from "../db";
import { contractors, contractorCommissions, staffCommissionAccruals, type Appointment } from "@shared/schema";
import { eq, and } from "drizzle-orm";

function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * Call right after an appointment's completion snapshot is taken
 * (storage.updateAppointment, status -> "completed"). Pass the POST-update row
 * so the just-frozen servicePrice/commissionRate (migration 0156) are used —
 * never re-reads live service/staff data, so a later edit can't move this
 * number.
 */
export async function recordCommissionAccrual(apt: Appointment): Promise<void> {
  try {
    if (!apt || apt.status !== "completed" || !apt.staffId || !apt.storeId) return;
    if (apt.servicePrice == null || apt.commissionRate == null) return; // nothing frozen — skip silently

    const servicePrice = Number(apt.servicePrice);
    const rate = Number(apt.commissionRate);
    if (!Number.isFinite(servicePrice) || !Number.isFinite(rate)) return;

    const amountCents = Math.round(servicePrice * (rate / 100) * 100);
    if (amountCents <= 0) return;

    const earnedDate = new Date(apt.date ?? Date.now()).toISOString().slice(0, 10);

    const [contractor] = await db
      .select({ id: contractors.id })
      .from(contractors)
      .where(and(eq(contractors.staffId, apt.staffId), eq(contractors.storeId, apt.storeId)));

    if (contractor) {
      await db.insert(contractorCommissions).values({
        storeId: apt.storeId,
        contractorId: contractor.id,
        appointmentId: apt.id,
        serviceId: apt.serviceId ?? null,
        amount: amountCents,
        status: "pending",
        earnedDate,
        scheduledPayoutDate: earnedDate, // firmed up once actually swept into a run
      });
    } else {
      await db.insert(staffCommissionAccruals).values({
        storeId: apt.storeId,
        staffId: apt.staffId,
        appointmentId: apt.id,
        serviceId: apt.serviceId ?? null,
        amount: amountCents,
        status: "pending",
        earnedDate,
      });
    }
  } catch (err) {
    if (isUniqueViolation(err)) return; // already accrued for this appointment — fine
    console.error("[commissionAccrual] failed to record accrual for appointment", apt?.id, err);
    // Never let an accrual failure block the appointment update itself.
  }
}

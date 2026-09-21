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
 * completion retry / edit-after-complete never creates a second row (the unique
 * violation is caught here rather than pre-checked, to stay race-safe); while the
 * row is still "pending" the retry just refreshes its amount.
 */
import { db } from "../db";
import { contractors, contractorCommissions, staffCommissionAccruals, staff, type Appointment } from "@shared/schema";
import { commissionAmount, commissionBasis } from "@shared/commissionBasis";
import { eq, and, sql } from "drizzle-orm";

function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * Call right after an appointment's completion snapshot is taken
 * (storage.updateAppointment, status -> "completed"). Pass the POST-update row
 * so the just-frozen servicePrice/commissionRate (migration 0156) are used —
 * never re-reads live service/staff data, so a later edit can't move this
 * number (the product rate is the one live value: it has no per-ticket snapshot).
 *
 * The amount follows the shared rule in @shared/commissionBasis: services + add-ons at the service
 * rate, retail products at the product rate, all before discount / tax / tip.
 */
export async function recordCommissionAccrual(apt: Appointment): Promise<void> {
  try {
    if (!apt || apt.status !== "completed" || !apt.staffId || !apt.storeId) return;
    if (apt.servicePrice == null || apt.commissionRate == null) return; // nothing frozen — skip silently

    const serviceRate = Number(apt.commissionRate);
    if (!Number.isFinite(serviceRate)) return;

    // Add-ons only matter for the fallback (a ticket with no frozen split and nothing collected).
    const hasSplit = (apt as any).serviceRevenue != null || (apt as any).productRevenue != null;
    let addonTotal = 0;
    if (!hasSplit && !(Number(apt.totalPaid) > 0)) {
      const res: any = await db.execute(sql`
        SELECT COALESCE(SUM(ad.price), 0)::float AS total
          FROM appointment_addons aa JOIN addons ad ON ad.id = aa.addon_id
         WHERE aa.appointment_id = ${apt.id}`);
      addonTotal = Number(res?.rows?.[0]?.total ?? 0);
    }
    const basis = commissionBasis(apt as any, { addonTotal });

    const [contractor] = await db
      .select({ id: contractors.id, productRate: contractors.productCommissionRate })
      .from(contractors)
      .where(and(eq(contractors.staffId, apt.staffId), eq(contractors.storeId, apt.storeId)));

    // A contractor is paid at their own product rate; an employee at the staff row's.
    const [member] = contractor
      ? [undefined]
      : await db.select({ rate: staff.productCommissionRate }).from(staff).where(eq(staff.id, apt.staffId));
    const productRate = contractor ? contractor.productRate : member?.rate;

    const amountCents = Math.round(commissionAmount(basis, serviceRate, productRate).total * 100);
    if (amountCents <= 0) return;

    const earnedDate = new Date(apt.date ?? Date.now()).toISOString().slice(0, 10);

    try {
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
      if (!isUniqueViolation(err)) throw err;
      // Already accrued (e.g. the card-reader capture completed the ticket first, before the checkout
      // sheet's own PATCH froze the service/product split). Refresh the amount while it is still unpaid.
      if (contractor) {
        await db.update(contractorCommissions).set({ amount: amountCents })
          .where(and(eq(contractorCommissions.appointmentId, apt.id), eq(contractorCommissions.status, "pending")));
      } else {
        await db.update(staffCommissionAccruals).set({ amount: amountCents })
          .where(and(eq(staffCommissionAccruals.appointmentId, apt.id), eq(staffCommissionAccruals.status, "pending")));
      }
    }
  } catch (err) {
    console.error("[commissionAccrual] failed to record accrual for appointment", apt?.id, err);
    // Never let an accrual failure block the appointment update itself.
  }
}

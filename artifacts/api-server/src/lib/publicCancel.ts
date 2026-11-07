/**
 * publicCancel.ts
 *
 * Shared cancellation-policy logic for the two public, unauthenticated
 * "cancel my booking" endpoints:
 *   • POST /api/appointments/confirmation/:confirmationNumber/cancel  (phone-number flow)
 *   • POST /api/booking/manage/:token/cancel                          (per-booking token flow)
 *
 * Keeping it here means the cancellation window, the late-cancel fee, and the
 * "online cancellation disabled" gate can never drift between the two paths.
 */

import { storage } from "../storage";
import { pushBookingEvent } from "./ownerPush";

type CancelOutcome =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: 403 | 409; body: Record<string, unknown> };

/**
 * Apply the store's cancellation policy to `appointment` and cancel it when
 * allowed. `store` is the raw locations row (needs allowOnlineCancellation,
 * cancellationHoursCutoff, cancellationFeeValue).
 */
export async function cancelBookingWithPolicy(
  appointment: any,
  store: any,
): Promise<CancelOutcome> {
  if ((store as any).allowOnlineCancellation === false) {
    return {
      ok: false,
      status: 403,
      body: { message: "Online cancellation isn't available for this salon — please call to cancel." },
    };
  }

  // The terms saved with the booking when the client booked (lib/feeTerms.ts); older bookings use the shop's settings.
  const { agreedFee } = await import("./feeTerms");
  const terms = await agreedFee(Number(appointment.id));
  const cutoffHours = terms?.saved && terms.cutoffHours != null ? terms.cutoffHours : ((store as any).cancellationHoursCutoff ?? 24);
  let cancellationFeeCharged: number | null = null;
  let cancellationFeeError = false;

  // A deposit the client paid (owner, 2026-11-07): cancelled within the policy it is refunded automatically; a late
  // cancel keeps it, and the kept deposit is the penalty (no fee is charged on top, and the cancel isn't refused).
  const { pool } = await import("../db");
  const dep = (await pool.query(
    `SELECT a.deposit_collected, a.payment_status, a.stripe_payment_intent_id,
            (SELECT COALESCE(SUM(r.amount_cents), 0) FROM payment_refunds r WHERE r.appointment_id = a.id AND r.status IS DISTINCT FROM 'failed')::int AS refunded
       FROM appointments a WHERE a.id = $1`, [appointment.id])).rows[0];
  const depositCents = dep && dep.payment_status !== "awaiting_payment"
    ? Math.max(0, Math.round((Number(dep.deposit_collected) || 0) * 100) - (Number(dep.refunded) || 0)) : 0;
  const late = cutoffHours > 0 && (new Date(appointment.date).getTime() - Date.now()) / 3600_000 < cutoffHours;

  if (cutoffHours > 0 && appointment.status !== "cancelled" && depositCents <= 0) {
    const hoursUntilAppointment = (new Date(appointment.date).getTime() - Date.now()) / 3600_000;
    if (hoursUntilAppointment < cutoffHours) {
      const feePct = terms?.saved ? terms.percent : (Number((store as any).cancellationFeeValue) || 0);
      const feeCust = (appointment as any).stripeCustomerIdApt ?? (appointment as any).customer?.stripeCustomerId ?? null;
      const feePm = (appointment as any).stripePaymentMethodIdApt ?? (appointment as any).customer?.stripePaymentMethodId ?? null;

      if (feePct > 0 && feeCust && feePm) {
        // Fee configured AND the client has a card on file — charge it, then allow the cancel.
        const servicePrice = Number((appointment as any).service?.price ?? 0);
        const feeCents = terms?.cents ?? Math.round(servicePrice * (feePct / 100) * 100);
        if (feeCents >= 50) {
          try {
            const { chargeCancellationFee } = await import("./cancellationFee");
            const piId = await chargeCancellationFee({
              storeId: store.id,
              appointmentId: appointment.id,
              stripeCustomerId: feeCust,
              stripePaymentMethodId: feePm,
              feeCents,
            });
            // Recorded like a fee the pro charges, so it can't be charged a second time from the app.
            await pool.query(`UPDATE appointments SET fee_kind='late_cancel', fee_charged_cents=$2, fee_payment_intent=$3, fee_charged_at=now()
              WHERE id=$1 AND fee_charged_cents IS NULL`, [appointment.id, feeCents, piId]);
            cancellationFeeCharged = feeCents / 100;
          } catch (feeErr: any) {
            console.error(`[cancel] late-cancel fee charge failed for appointment ${appointment.id}:`, feeErr?.message);
            cancellationFeeError = true;
          }
        }
        // fall through → cancellation proceeds regardless of the charge outcome
      } else if (feePct > 0) {
        // Fee configured but no card on file — allow the cancel for free.
      } else {
        // No fee configured — keep the hard block.
        return {
          ok: false,
          status: 409,
          body: {
            message: `Cancellations must be made at least ${cutoffHours} hour${cutoffHours === 1 ? "" : "s"} in advance.`,
            cutoffHours,
          },
        };
      }
    }
  }

  let depositRefunded: number | null = null;
  let depositKept: number | null = null;
  let depositRefundError = false;
  if (appointment.status !== "cancelled") {
    const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    await storage.updateAppointment(appointment.id, {
      status: "cancelled",
      cancellationReason: cancellationFeeCharged != null
        ? `Cancelled by customer (late-cancel fee $${cancellationFeeCharged.toFixed(2)} charged)`
        : depositCents > 0 && late ? `Cancelled by customer after the cancellation window (deposit ${money(depositCents)} kept)`
        : depositCents > 0 ? `Cancelled by customer within the cancellation policy (deposit ${money(depositCents)} refunded)`
        : "Cancelled by customer",
    });
    await pool.query(`UPDATE appointments SET cancelled_in_policy = $2 WHERE id = $1`, [appointment.id, !late]);
    if (depositCents > 0 && late) depositKept = depositCents / 100;
    if (depositCents > 0 && !late) {
      const refund = await refundDeposit(Number(store.id), Number(appointment.id), dep.stripe_payment_intent_id ?? null, depositCents);
      if (refund.ok) depositRefunded = depositCents / 100;
      else {
        depositRefundError = true;
        await storage.updateAppointment(appointment.id, { cancellationReason: `Cancelled by customer within the cancellation policy (deposit ${money(depositCents)} could not be refunded automatically)` } as any);
      }
    }
    // Tell the owner's phone (Certxa Pro app) that the client cancelled.
    if (appointment.storeId) void pushBookingEvent(Number(appointment.storeId), Number(appointment.id), "cancelled_client");
    // Someone on the waitlist for that day (Certxa Pro Waitlist, 2026-11-03): tell the owner the time is free.
    if (appointment.storeId) void notifyWaitlistForDay(Number(appointment.storeId), new Date(appointment.date)).catch(() => {});
  }

  const refreshed = await storage.getAppointment(appointment.id);
  const result: any = refreshed || appointment;
  if (result?.staff) {
    (result as any).staff = result.staff;
  }
  return { ok: true, status: 200, body: { ...result, cancellationFeeCharged, cancellationFeeError, depositRefunded, depositKept, depositRefundError } };
}

/** Refund a paid deposit in full to the client's card, once (Stripe idempotency + payment_refunds' unique id). */
async function refundDeposit(storeId: number, appointmentId: number, paymentIntentId: string | null, cents: number): Promise<{ ok: boolean }> {
  const { pool } = await import("../db");
  try {
    const { getPaymentAccount, refundCardPayment } = await import("./stripeConnect");
    const account = await getPaymentAccount(storeId);
    if (!account?.providerAccountId) throw new Error("The business's Stripe account isn't connected.");
    const r = await refundCardPayment(account.providerAccountId, {
      paymentIntentId, appointmentId, amountCents: cents, reason: "Cancelled within the cancellation policy",
      idempotencyKey: `deposit_refund_${appointmentId}`,
    });
    await pool.query(`INSERT INTO payment_refunds (store_id, appointment_id, stripe_refund_id, stripe_payment_intent, amount_cents, status, reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (stripe_refund_id) DO NOTHING`,
      [storeId, appointmentId, r.refundId, r.paymentIntentId, cents, r.status, "Deposit refunded: cancelled within the cancellation policy"]);
    await pool.query(`UPDATE appointments SET deposit_refunded_cents = $2, deposit_refund_error = NULL WHERE id = $1`, [appointmentId, cents]);
    return { ok: true };
  } catch (err: any) {
    const message = String(err?.raw?.message || err?.message || "The refund failed.").slice(0, 300);
    console.error(`[cancel] deposit refund failed for appointment ${appointmentId}:`, message);
    await pool.query(`UPDATE appointments SET deposit_refund_error = $2 WHERE id = $1`, [appointmentId, message]).catch(() => {});
    return { ok: false };
  }
}

async function notifyWaitlistForDay(storeId: number, when: Date): Promise<void> {
  const { pool } = await import("../db");
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM waitlist w JOIN locations l ON l.id = w.store_id
      WHERE w.store_id = $1 AND w.status = 'waiting' AND w.preferred_date IS NOT NULL
        AND (w.preferred_date AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(l.timezone, 'UTC'))::date = ($2::timestamptz AT TIME ZONE COALESCE(l.timezone, 'UTC'))::date`,
    [storeId, when]);
  const n = Number(r.rows[0]?.n) || 0;
  if (!n) return;
  const { pushOwnerMessage } = await import("./ownerPush");
  await pushOwnerMessage(storeId, {
    title: "A time opened up",
    body: `${n} ${n === 1 ? "client is" : "clients are"} on your waitlist for that day. Tap to see them.`,
    data: { type: "waitlist" },
  });
}

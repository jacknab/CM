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

  const cutoffHours = (store as any).cancellationHoursCutoff ?? 24;
  let cancellationFeeCharged: number | null = null;
  let cancellationFeeError = false;

  if (cutoffHours > 0 && appointment.status !== "cancelled") {
    const hoursUntilAppointment = (new Date(appointment.date).getTime() - Date.now()) / 3600_000;
    if (hoursUntilAppointment < cutoffHours) {
      const feePct = Number((store as any).cancellationFeeValue) || 0;
      const feeCust = (appointment as any).stripeCustomerIdApt ?? (appointment as any).customer?.stripeCustomerId ?? null;
      const feePm = (appointment as any).stripePaymentMethodIdApt ?? (appointment as any).customer?.stripePaymentMethodId ?? null;

      if (feePct > 0 && feeCust && feePm) {
        // Fee configured AND the client has a card on file — charge it, then allow the cancel.
        const servicePrice = Number((appointment as any).service?.price ?? 0);
        const feeCents = Math.round(servicePrice * (feePct / 100) * 100);
        if (feeCents >= 50) {
          try {
            const { chargeCancellationFee } = await import("./cancellationFee");
            await chargeCancellationFee({
              storeId: store.id,
              appointmentId: appointment.id,
              stripeCustomerId: feeCust,
              stripePaymentMethodId: feePm,
              feeCents,
            });
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

  if (appointment.status !== "cancelled") {
    await storage.updateAppointment(appointment.id, {
      status: "cancelled",
      cancellationReason: cancellationFeeCharged != null
        ? `Cancelled by customer (late-cancel fee $${cancellationFeeCharged.toFixed(2)} charged)`
        : "Cancelled by customer",
    });
  }

  const refreshed = await storage.getAppointment(appointment.id);
  const result: any = refreshed || appointment;
  if (result?.staff) {
    (result as any).staff = result.staff;
  }
  return { ok: true, status: 200, body: { ...result, cancellationFeeCharged, cancellationFeeError } };
}

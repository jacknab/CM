/**
 * BOOKING HOLD SCHEDULER
 * ============================================================
 * Manages the 60-minute lifecycle of AI-receptionist bookings that are
 * awaiting a deposit/card-on-file payment link (see aiReceptionist.ts's
 * createBookingViaBookingRules and lib/bookingPaymentLinks.ts).
 *
 *   T+0        appointment created, calendarHidden=true, SMS sent with link
 *   T+20 min   if still unpaid: resend the SMS once (urgency copy)
 *   T+60 min   if still unpaid: hard-delete the appointment + token, freeing
 *              the slot as if it had never been booked
 *
 * Styled after sms.ts's startReminderScheduler — a single guarded
 * setInterval plus an initial short-delay kick so it doesn't wait a full
 * interval on cold boot.
 */

import { sendSms } from "../sms";
import { storage } from "../storage";
import {
  getTokensNeedingReminder,
  markBookingPaymentTokenReminderSent,
  getExpiredUnusedTokens,
  deleteBookingPaymentToken,
  holdTimeLeft,
} from "../lib/bookingPaymentLinks";
import { pool } from "../db";
import { broadcastSyncEvent } from "../notifications";

let intervalId: ReturnType<typeof setInterval> | null = null;

async function processReminders(): Promise<void> {
  const tokens = await getTokensNeedingReminder();
  for (const t of tokens) {
    if (!t.customerPhone) {
      // Nothing to text — still mark it so we don't retry forever.
      await markBookingPaymentTokenReminderSent(t.id);
      continue;
    }
    const link = `${process.env.APP_URL ?? "https://certxa.com"}/complete-booking/${t.token}`;
    const body = t.requirement === "deposit"
      ? `Reminder: you have ${holdTimeLeft(t.expiresAt)} left to confirm your booking with a $${((t.depositAmountCents ?? 0) / 100).toFixed(2)} deposit, or your reserved time will be released: ${link}`
      : `Reminder: you have ${holdTimeLeft(t.expiresAt)} left to confirm your booking by adding a card on file, or your reserved time will be released: ${link}`;
    try {
      await sendSms(t.storeId, t.customerPhone, body, "booking_payment_reminder", t.appointmentId, t.customerId ?? undefined, {
        skipCreditDeduction: true,
        smsSource: "platform",
      });
    } catch (err) {
      console.error(`[BookingHold] Failed to send reminder SMS for token ${t.id}:`, err);
    }
    await markBookingPaymentTokenReminderSent(t.id);
  }
}

async function processExpirations(): Promise<void> {
  const tokens = await getExpiredUnusedTokens();
  for (const t of tokens) {
    try {
      // The token row itself FK-references the appointment, so it must be
      // deleted first — deleting the appointment while its own token still
      // points at it violates booking_payment_tokens_appointment_id_fkey.
      await deleteBookingPaymentToken(t.id);
      // A booking the professional approved (lib/bookingRequests.ts) is marked expired, and the client told.
      const request = await pool.query<{ id: number; booking_slug: string | null; name: string }>(
        `UPDATE booking_requests r SET status = 'expired', appointment_id = NULL FROM locations l
          WHERE r.appointment_id = $1 AND l.id = r.store_id RETURNING r.id, l.booking_slug, l.name`, [t.appointmentId]);
      // The second service of the same visit goes with it.
      const group = await pool.query<{ id: number }>(`SELECT id FROM appointments WHERE ticket_group_id = $1 AND id <> $1`, [t.appointmentId]);
      for (const member of group.rows) await storage.deleteAppointmentAndRelated(member.id);
      await storage.deleteAppointmentAndRelated(t.appointmentId);
      if (request.rows[0] && t.customerPhone) {
        const r = request.rows[0];
        void sendSms(t.storeId, t.customerPhone,
          `Your time with ${r.name} was released because the deposit wasn't paid. You can book again at ${r.booking_slug ? `https://${r.booking_slug}.certxa.com` : "certxa.com"}`,
          "booking_request", undefined, t.customerId ?? undefined).catch(() => undefined);
      }
      broadcastSyncEvent({ type: "booking_deleted", storeId: t.storeId, appointmentId: t.appointmentId });
      console.log(`[BookingHold] Expired unpaid hold — deleted appointment ${t.appointmentId} (token ${t.id})`);
    } catch (err) {
      console.error(`[BookingHold] Failed to delete expired appointment ${t.appointmentId} (token ${t.id}):`, err);
    }
  }
}

export function startBookingHoldScheduler(): void {
  if (intervalId) return;

  console.log("[BookingHold] Scheduler started (checks every 60 seconds)");

  intervalId = setInterval(async () => {
    try {
      await processReminders();
      await processExpirations();
    } catch (err) {
      console.error("[BookingHold] Scheduler error:", err);
    }
  }, 60 * 1000);

  setTimeout(() => {
    processReminders().catch((err) => console.error("[BookingHold] Initial reminder pass error:", err));
    processExpirations().catch((err) => console.error("[BookingHold] Initial expiration pass error:", err));
  }, 10_000);
}

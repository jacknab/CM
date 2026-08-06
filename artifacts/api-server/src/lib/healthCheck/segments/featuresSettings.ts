import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, rollup } from "../types";

export async function featuresSettings(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];

  const [settingsRes, storeRes, paymentRes] = await Promise.all([
    pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [accountId]),
    pool.query(`SELECT pos_enabled, cancellation_hours_cutoff, late_grace_period_minutes, booking_payment_policy FROM locations WHERE id = $1`, [accountId]),
    pool.query(`SELECT charges_enabled FROM store_payment_accounts WHERE store_id = $1`, [accountId]),
  ]);

  let prefs: Record<string, unknown> = {};
  if (settingsRes.rows[0]?.preferences) {
    try { prefs = JSON.parse(settingsRes.rows[0].preferences); } catch {}
  }
  const store = storeRes.rows[0] ?? {};
  const stripeConnected = paymentRes.rows[0]?.charges_enabled === true;

  // Online booking
  if (prefs.onlineBookingEnabled === false) {
    checks.push(warn("online_booking", "Online booking enabled", "Online booking is disabled — customers cannot book via the booking page.", "Settings → Booking → Online Booking"));
  } else {
    checks.push(pass("online_booking", "Online booking enabled", "Online booking is active."));
  }

  // Booking confirmation email
  if (!prefs.notificationEmail && !prefs.bookingConfirmationEmail) {
    checks.push(warn("confirmation_email", "Booking confirmation email configured", "No notification email address is set — confirmation and reminder emails may not be delivered correctly.", "Settings → Notifications → Email"));
  } else {
    const email = (prefs.notificationEmail ?? prefs.bookingConfirmationEmail) as string;
    checks.push(pass("confirmation_email", "Booking confirmation email configured", `Notification email: ${email}`));
  }

  // SMS reminders
  if (prefs.smsRemindersEnabled === false) {
    checks.push(warn("sms_reminders", "SMS reminders enabled", "SMS appointment reminders are disabled — clients won't receive reminder texts.", "Settings → Notifications → SMS"));
  } else {
    checks.push(pass("sms_reminders", "SMS reminders enabled", "SMS reminders are active."));
  }

  // Loyalty rewards
  const loyaltyOn = !!prefs.loyaltyEnabled;
  checks.push(pass("loyalty", "Loyalty rewards", loyaltyOn ? "Loyalty rewards are enabled." : "Loyalty rewards are disabled (informational)."));

  // Waitlist
  const waitlistOn = !!prefs.waitlistEnabled;
  checks.push(pass("waitlist", "Waitlist", waitlistOn ? "Waitlist is enabled." : "Waitlist is disabled (informational)."));

  // POS
  const posOn = !!store.pos_enabled;
  checks.push(pass("pos", "POS module", posOn ? "POS is enabled." : "POS is disabled (informational)."));

  // Payment policy vs Stripe
  const policy = store.booking_payment_policy ?? "none";
  if ((policy === "deposit" || policy === "card_on_file") && !stripeConnected) {
    checks.push(warn("payment_policy", "Payment policy matches Stripe setup", `Payment policy is set to "${policy}" but Stripe Connect is not fully connected — deposits cannot be collected.`, "Settings → Payments → Stripe Connect"));
  } else {
    checks.push(pass("payment_policy", "Payment policy matches Stripe setup", `Policy: ${policy}${stripeConnected ? ", Stripe connected" : ""}`));
  }

  // Cancellation cutoff
  const cutoff = Number(store.cancellation_hours_cutoff ?? 0);
  if (cutoff === 0) {
    checks.push(warn("cancellation_cutoff", "Cancellation cutoff set", "No cancellation cutoff is configured — clients can cancel with zero notice.", "Settings → Booking → Cancellation Policy"));
  } else {
    checks.push(pass("cancellation_cutoff", "Cancellation cutoff set", `${cutoff}-hour cancellation cutoff.`));
  }

  // Late grace period
  const grace = Number(store.late_grace_period_minutes ?? 0);
  checks.push(pass("grace_period", "Late grace period", grace > 0 ? `${grace}-minute late grace period.` : "No grace period set (informational)."));

  return {
    segmentId: "features_settings",
    label: "Features & Settings",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
  };
}

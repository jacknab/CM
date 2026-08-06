import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";

export async function smsCommunications(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];

  const [settingsRes, storeRes] = await Promise.all([
    pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [accountId]),
    pool.query(`SELECT sms_allowance, platform_credits FROM locations WHERE id = $1`, [accountId]),
  ]);

  let prefs: Record<string, unknown> = {};
  if (settingsRes.rows[0]?.preferences) {
    try { prefs = JSON.parse(settingsRes.rows[0].preferences); } catch {}
  }
  const store = storeRes.rows[0] ?? {};

  // 6a. Twilio configuration
  const hasTwilio = !!(
    prefs.twilioAccountSid ||
    prefs.twilioPhoneNumber ||
    process.env.TWILIO_ACCOUNT_SID
  );
  if (!hasTwilio) {
    checks.push(warn("twilio_config", "Twilio SMS configured", "No Twilio configuration found — SMS features (reminders, notifications) will silently fail.", "Settings → Integrations → Twilio"));
  } else {
    checks.push(pass("twilio_config", "Twilio SMS configured", "Twilio configuration is present."));
  }

  // 6b. SMS balance
  const allowance = Number(store.sms_allowance ?? 0);
  const credits   = parseFloat(store.platform_credits ?? "0");

  if (allowance === 0 && credits < 0.02) {
    checks.push(fail("sms_balance", "SMS balance available", "Both SMS allowance and platform credits are exhausted — the account cannot send any SMS messages.", "Billing → Credits → Add Credits"));
  } else if (allowance < 10) {
    checks.push(warn("sms_balance", "SMS balance available", `SMS allowance is nearly exhausted (${allowance} remaining) — will fall back to paid platform credits.`, "Billing → Credits"));
  } else {
    checks.push(pass("sms_balance", "SMS balance available", `SMS allowance: ${allowance} | Platform credits: $${credits.toFixed(2)}`));
  }

  if (credits < 0 && allowance < 10) {
    checks.push(warn("credits_balance", "Platform credits wallet positive", `Platform credits balance is $${credits.toFixed(2)} — negative balance may block paid SMS.`, "Billing → Credits → Top Up"));
  } else if (credits >= 0) {
    checks.push(pass("credits_balance", "Platform credits wallet positive", `Wallet balance: $${credits.toFixed(2)}`));
  }

  // 6c. Recent SMS delivery failures
  let smsFailures = 0;
  try {
    const failRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM store_activity_events
       WHERE store_id = $1
         AND event_type = 'api_error'
         AND created_at >= NOW() - INTERVAL '30 days'
         AND metadata->>'errorNumeric' = '854'`,
      [accountId],
    );
    smsFailures = Number(failRes.rows[0]?.cnt ?? 0);
  } catch {
    // store_activity_events may not exist on all DBs — skip silently
  }

  if (smsFailures > 3) {
    checks.push(warn("sms_failures", "Few SMS delivery failures", `${smsFailures} SMS delivery failure${smsFailures !== 1 ? "s" : ""} in the last 30 days — may indicate bad phone numbers or carrier issues.`, "Activity → Filter by SMS Error"));
  } else {
    checks.push(pass("sms_failures", "Few SMS delivery failures", smsFailures === 0 ? "No SMS delivery failures in the last 30 days." : `${smsFailures} failure${smsFailures !== 1 ? "s" : ""} in last 30 days (within threshold).`));
  }

  // 6d. Email configuration
  const mailgunOk = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
  const notifEmail = prefs.notificationEmail as string | undefined;

  if (!mailgunOk) {
    checks.push(warn("email_platform", "Email platform configured", "MAILGUN_API_KEY or MAILGUN_DOMAIN is not set at the platform level — transactional emails will fail.", "Platform Configuration → Email"));
  } else {
    checks.push(pass("email_platform", "Email platform configured", "Mailgun environment variables are set."));
  }

  if (!notifEmail) {
    checks.push(warn("store_notification_email", "Store notification email set", "No notification email address is set for this store — booking confirmation emails may not reach the owner.", "Settings → Notifications → Email"));
  } else {
    checks.push(pass("store_notification_email", "Store notification email set", `Notification email: ${notifEmail}`));
  }

  return {
    segmentId: "sms_communications",
    label: "SMS & Communications",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
  };
}

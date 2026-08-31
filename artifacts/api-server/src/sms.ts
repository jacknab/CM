import { storage } from "./storage";
import type { AppointmentWithDetails } from "@shared/schema";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "./db";
import { locations } from "@shared/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { toE164US } from "./lib/phoneUtils";
import Twilio from "twilio";

// ── Twilio direct sender (used for platform-level SMS like staff OTP) ──────────
// Does NOT touch the store credit/allowance system — this is a platform cost.
//
// Sender resolution order:
//   1. TWILIO_MESSAGING_SERVICE_SID  — preferred for A2P 10DLC / toll-free pools
//   2. TWILIO_PHONE_NUMBER           — direct from-number fallback
// At least one of the two must be set alongside the account credentials.
function getTwilioConfig() {
  const accountSid          = process.env.TWILIO_ACCOUNT_SID;
  const authToken           = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber          = process.env.TWILIO_PHONE_NUMBER          || null;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || null;

  if (!accountSid || !authToken) return null;
  if (!fromNumber && !messagingServiceSid) return null;

  return {
    client: Twilio(accountSid, authToken),
    fromNumber,
    messagingServiceSid,
  };
}

export async function sendTwilioSms(
  to: string,
  body: string,
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const e164 = toE164US(to);
  if (!e164) return { success: false, error: "Invalid phone number" };

  const twilio = getTwilioConfig();
  if (!twilio) {
    console.warn(
      "[SMS/Twilio] Not configured — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + " +
      "(TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER)"
    );
    return { success: false, error: "Twilio is not configured" };
  }

  try {
    // Prefer Messaging Service SID (A2P 10DLC / toll-free pools); fall back to
    // direct from-number for simpler setups.
    const params: Parameters<typeof twilio.client.messages.create>[0] = {
      to: e164,
      body,
      ...(twilio.messagingServiceSid
        ? { messagingServiceSid: twilio.messagingServiceSid }
        : { from: twilio.fromNumber! }),
    };

    const msg = await twilio.client.messages.create(params);
    console.log(`[SMS/Twilio] Sent to ${e164} — sid=${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err: any) {
    console.error("[SMS/Twilio] Send failed:", err.message ?? err);
    return { success: false, error: err.message ?? "Unknown error" };
  }
}


function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

// ── Atomic SMS credit deduction ───────────────────────────────────────────────
// Priority: smsAllowance (subscription, resets monthly, no rollover)
//         → platformCredits wallet ($0.02/SMS)
//         → block immediately (log as failed, no refund needed)
//
// Each deduction uses a conditional UPDATE WHERE ... > threshold to be
// race-condition safe. No balance ever goes negative via this path.

const SMS_WALLET_RATE_USD = 0.02;

type DeductResult =
  | { source: "allowance" | "wallet" }
  | { error: "no_credits" | "store_not_found" };

export interface SendSmsOptions {
  /**
   * Skip internal deduction when the caller has already charged via its own
   * pre-flight check (e.g. sms-inbox routes that call resolveSmsAccess first).
   */
  skipCreditDeduction?: boolean;
  /**
   * Explicit source to store in sms_log.sms_source when deduction is skipped.
   */
  smsSource?: string;
}

async function deductSmsCredit(storeId: number): Promise<DeductResult> {
  // Step 1: Monthly allowance (subscription bucket, resets on billing renewal)
  const allowanceRows = await db
    .update(locations)
    .set({ smsAllowance: sql`sms_allowance - 1` })
    .where(and(eq(locations.id, storeId), gt(locations.smsAllowance, 0)))
    .returning({ id: locations.id });

  if (allowanceRows.length > 0) return { source: "allowance" };

  // Step 2: Wallet fallback — deduct $0.02 atomically (only if sufficient balance)
  const walletRows = await db
    .update(locations)
    .set({ platformCredits: sql`COALESCE(platform_credits, 0) - ${SMS_WALLET_RATE_USD.toFixed(4)}` })
    .where(and(eq(locations.id, storeId), sql`COALESCE(platform_credits, 0) >= ${SMS_WALLET_RATE_USD}`))
    .returning({ id: locations.id, balance: locations.platformCredits });

  if (walletRows.length > 0) {
    const newBalance = parseFloat(walletRows[0].balance ?? "0");
    // Log to credit ledger + maybe trigger low-balance alert (both fire-and-forget)
    Promise.all([
      import("./lib/creditLedger").then(({ logCreditTransaction }) =>
        logCreditTransaction({
          storeId,
          type: "sms",
          amount: -SMS_WALLET_RATE_USD,
          description: "SMS message (wallet)",
          balanceAfter: newBalance,
        })
      ),
      import("./services/low-balance-scheduler").then(({ maybeSendLowBalanceAlert }) =>
        maybeSendLowBalanceAlert(storeId, newBalance)
      ),
    ]).catch(() => {});
    return { source: "wallet" };
  }

  // Step 3: Both exhausted — check if store even exists
  const [store] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  if (!store) return { error: "store_not_found" };
  return { error: "no_credits" };
}

export async function sendSms(
  storeId: number,
  phone: string,
  body: string,
  messageType: string,
  appointmentId?: number,
  customerId?: number,
  options?: SendSmsOptions
): Promise<{ success: boolean; sid?: string; error?: string; skipped?: boolean }> {
  // Normalize to E.164 — Twilio requires this format for the `to` field.
  // If the input can't be normalized (e.g. empty, too short) we bail early.
  const e164Phone = toE164US(phone);
  if (!e164Phone) {
    console.warn(`[SMS] Cannot send — invalid/unnormalizable phone "${phone}" for messageType=${messageType}`);
    return { success: false, error: "Invalid phone number" };
  }

  // Normalize phone number and check SMS opt-out list
  const normalizedPhone = e164Phone.replace(/\D/g, "");
  if (normalizedPhone.length >= 10) {
    try {
      const { smsOptOuts } = await import("@shared/schema");
      const { eq: deq, and: dand } = await import("drizzle-orm");
      const [optOut] = await db
        .select({ isOptedOut: smsOptOuts.isOptedOut })
        .from(smsOptOuts)
        .where(dand(eq(smsOptOuts.phone, normalizedPhone), eq(smsOptOuts.isOptedOut, true)))
        .limit(1);
      if (optOut?.isOptedOut) {
        console.log(`[SMS] Skipping opted-out number ${normalizedPhone}`);
        return { success: true, skipped: true };
      }
    } catch (err) {
      console.warn("[SMS] Opt-out check failed:", err);
    }
  }

  // ── Account status gate ────────────────────────────────────────────────────
  // Suspended and canceled accounts must not receive ANY SMS — system or otherwise.
  // This guard runs before credit deduction so no balance is ever touched.
  {
    const [storeRow] = await db
      .select({ accountStatus: locations.accountStatus })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);

    const acctStatus = (storeRow?.accountStatus ?? "Active").toLowerCase();
    if (
      acctStatus === "suspended" ||
      acctStatus === "canceled" ||
      acctStatus === "cancelled"
    ) {
      console.log(`[SMS] Skipping — store ${storeId} account is ${acctStatus}`);
      await storage.createSmsLog({
        storeId,
        appointmentId: appointmentId ?? null,
        customerId: customerId ?? null,
        phone: e164Phone,
        messageType,
        messageBody: body,
        status: "skipped",
        twilioSid: null,
        errorMessage: `Account ${acctStatus} — SMS delivery suppressed`,
        sentAt: new Date(),
        smsSource: "none",
        costEstimate: "0.0000",
      }).catch(() => {});
      return { success: false, skipped: true, error: `Account ${acctStatus}` };
    }
  }

  // ── System SMS are free to the account holder ──────────────────────────────
  // Booking confirmations, appointment reminders, and Google review requests are
  // platform-funded (Certxa absorbs the Twilio cost). These callers pass
  //   { skipCreditDeduction: true, smsSource: "platform" }
  // and NEVER touch the store's smsAllowance or platformCredits wallet.
  // Any other message type (marketing, inbox replies, etc.) goes through the
  // normal deductSmsCredit() flow below.

  let deductResult: DeductResult | null = null;

  // ── Credit deduction (atomic, race-condition safe) ─────────────────────────
  // Bypass only for skipCreditDeduction callers (platform-cost SMS like staff invites).
  if (!options?.skipCreditDeduction) {
    deductResult = await deductSmsCredit(storeId);

    if ("error" in deductResult) {
      const errorMsg = deductResult.error === "store_not_found"
        ? "Store not found"
        : "No SMS credits available — add wallet funds or upgrade your plan";
      console.warn(`[SMS] Blocked store=${storeId} type=${messageType}: ${errorMsg}`);
      // Log the failure immediately so the store owner can see it in sms_log
      await storage.createSmsLog({
        storeId,
        appointmentId: appointmentId ?? null,
        customerId: customerId ?? null,
        phone: e164Phone,
        messageType,
        messageBody: body,
        status: "failed",
        twilioSid: null,
        errorMessage: errorMsg,
        sentAt: new Date(),
        smsSource: "none",
        costEstimate: "0.0000",
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }
  }

  // ── Twilio send ────────────────────────────────────────────────────────────
  // All stores share Certxa's platform Twilio credentials (env vars).
  // Prefer TWILIO_MESSAGING_SERVICE_SID for A2P 10DLC / toll-free pool sends;
  // fall back to TWILIO_PHONE_NUMBER for simpler setups.
  const accountSid          = process.env.TWILIO_ACCOUNT_SID;
  const authToken           = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber          = process.env.TWILIO_PHONE_NUMBER          || null;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || null;

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
    // Twilio not configured — refund the deducted credit and fail
    if (deductResult?.source === "allowance") {
      await db.update(locations)
        .set({ smsAllowance: sql`sms_allowance + 1` })
        .where(eq(locations.id, storeId));
    } else if (deductResult?.source === "wallet") {
      await db.update(locations)
        .set({ platformCredits: sql`COALESCE(platform_credits, 0) + ${SMS_WALLET_RATE_USD.toFixed(4)}` })
        .where(eq(locations.id, storeId));
    }
    return {
      success: false,
      error: "Twilio is not configured — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + (TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER)",
    };
  }

  const twilioClient = Twilio(accountSid, authToken);

  try {
    const sendParams: Parameters<typeof twilioClient.messages.create>[0] = {
      to: e164Phone,
      body,
      ...(messagingServiceSid
        ? { messagingServiceSid }
        : { from: fromNumber! }),
    };
    const msg = await twilioClient.messages.create(sendParams);

    console.log(`[SMS/Twilio] Sent to ${e164Phone} sid=${msg.sid} store=${storeId} type=${messageType}`);

    // Deduction already happened atomically — log success
    const smsSource = options?.smsSource ?? deductResult?.source ?? null;
    const costEstimate = smsSource === "wallet" ? SMS_WALLET_RATE_USD.toFixed(4) : "0.0000";
    await storage.createSmsLog({
      storeId,
      appointmentId: appointmentId ?? null,
      customerId: customerId ?? null,
      phone: e164Phone,
      messageType,
      messageBody: body,
      status: "sent",
      twilioSid: msg.sid ?? null,
      errorMessage: null,
      sentAt: new Date(),
      smsSource,
      costEstimate,
    });

    return { success: true, sid: msg.sid };
  } catch (err: any) {
    const errorMessage = err.message || "Unknown error";

    // Provider failed after deduction — refund the credit so it isn't lost
    if (deductResult?.source === "allowance") {
      await db.update(locations)
        .set({ smsAllowance: sql`sms_allowance + 1` })
        .where(eq(locations.id, storeId));
    } else if (deductResult?.source === "wallet") {
      await db.update(locations)
        .set({ platformCredits: sql`COALESCE(platform_credits, 0) + ${SMS_WALLET_RATE_USD.toFixed(4)}` })
        .where(eq(locations.id, storeId));
    }

    await storage.createSmsLog({
      storeId,
      appointmentId: appointmentId ?? null,
      customerId: customerId ?? null,
      phone,
      messageType,
      messageBody: body,
      status: "failed",
      twilioSid: null,
      errorMessage,
      sentAt: new Date(),
      smsSource: options?.smsSource ?? deductResult?.source ?? null,
      costEstimate: "0.0000",
    });

    console.error(`[SMS/Twilio] Send failed for store ${storeId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Client phone numbers live in the `client_phones` table, NOT on the `clients`
 * row, so an appointment loaded with the Drizzle `customer` relation has no
 * `.phone` — it's always undefined. Every automated SMS below (confirmation,
 * reminder, review request) guarded on `appointment.customer.phone`, so none of
 * them ever sent. Resolve the customer's primary number here as a fallback.
 */
async function resolveCustomerPhone(
  customerId: number | null | undefined,
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const { pool } = await import("./db");
    const { rows } = await pool.query(
      `SELECT COALESCE(NULLIF(display_phone, ''), phone_number_e164) AS phone
         FROM client_phones
        WHERE client_id = $1
        ORDER BY is_primary DESC, id ASC
        LIMIT 1`,
      [customerId],
    );
    const phone = rows[0]?.phone;
    return phone ? String(phone) : null;
  } catch (e: any) {
    console.error("[SMS] resolveCustomerPhone failed:", e?.message ?? e);
    return null;
  }
}

/** The customer's phone: relation value if present, else looked up from client_phones. */
async function appointmentCustomerPhone(
  appointment: AppointmentWithDetails,
): Promise<string | null> {
  return (
    (appointment.customer as any)?.phone ||
    (await resolveCustomerPhone(
      appointment.customer?.id ?? (appointment as any).customerId,
    ))
  );
}

export async function sendBookingConfirmation(
  appointment: AppointmentWithDetails
): Promise<void> {
  if (!appointment.storeId) return;
  const customerPhone = await appointmentCustomerPhone(appointment);
  if (!customerPhone) return;

  const settings = await storage.getSmsSettings(appointment.storeId);
  if (!settings?.bookingConfirmationEnabled) return;

  const timezone = appointment.store?.timezone || "UTC";
  const template =
    settings.confirmationTemplate ||
    "Hi {customerName}, your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}. See you then!";

  const body = interpolateTemplate(template, {
    customerName: (appointment.customer as any)?.fullName || appointment.customer?.name || "there",
    storeName: appointment.store?.name || "our salon",
    appointmentDate: formatInTimeZone(
      appointment.date,
      timezone,
      "EEEE, MMMM d"
    ),
    appointmentTime: formatInTimeZone(
      appointment.date,
      timezone,
      "h:mm a"
    ),
    serviceName: appointment.service?.name || "your service",
  });

  await sendSms(
    appointment.storeId,
    customerPhone,
    body,
    "booking_confirmation",
    appointment.id,
    appointment.customer?.id,
    { skipCreditDeduction: true, smsSource: "platform" }
  );
}

export async function sendAppointmentReminder(
  appointment: AppointmentWithDetails
): Promise<void> {
  if (!appointment.storeId) return;
  const customerPhone = await appointmentCustomerPhone(appointment);
  if (!customerPhone) return;

  const settings = await storage.getSmsSettings(appointment.storeId);
  if (!settings?.reminderEnabled) return;

  const existing = await storage.getSmsLogByAppointmentAndType(
    appointment.id,
    "reminder"
  );
  if (existing) return;

  const timezone = appointment.store?.timezone || "UTC";
  const template =
    settings.reminderTemplate ||
    "Hi {customerName}, reminder: your appt at {storeName} is on {appointmentDate} at {appointmentTime}. Reply CANCEL to cancel.";

  const body = interpolateTemplate(template, {
    customerName: (appointment.customer as any)?.fullName || appointment.customer?.name || "there",
    storeName: appointment.store?.name || "our salon",
    appointmentDate: formatInTimeZone(
      appointment.date,
      timezone,
      "EEEE, MMMM d"
    ),
    appointmentTime: formatInTimeZone(
      appointment.date,
      timezone,
      "h:mm a"
    ),
    serviceName: appointment.service?.name || "your service",
  });

  await sendSms(
    appointment.storeId,
    customerPhone,
    body,
    "reminder",
    appointment.id,
    appointment.customer?.id,
    { skipCreditDeduction: true, smsSource: "platform" }
  );
}

export async function sendReviewRequest(
  appointment: AppointmentWithDetails
): Promise<{ sent: boolean; reason?: string }> {
  if (!appointment.storeId) return { sent: false, reason: "no store" };
  const customerPhone = await appointmentCustomerPhone(appointment);
  if (!customerPhone) return { sent: false, reason: "customer has no phone number on file" };

  const settings = await storage.getSmsSettings(appointment.storeId);
  if (!settings?.reviewRequestEnabled) return { sent: false, reason: "review requests are disabled in SMS settings" };

  // Only send if the store actually has a Google review URL to point at
  // (manual SMS-settings URL → connected GBP link → discovered Place ID).
  const { resolveExternalReviewUrl } = await import("./lib/reviewLinks");
  const externalReviewUrl = await resolveExternalReviewUrl(appointment.storeId);
  if (!externalReviewUrl) return { sent: false, reason: "no Google review URL configured for this store" };

  const existing = await storage.getSmsLogByAppointmentAndType(
    appointment.id,
    "review_request"
  );
  if (existing) return { sent: false, reason: "already sent for this appointment" };

  // Send a per-customer certxa.com/review/<token> link. The token is only for
  // attribution (which appointment/customer clicked) — GET /review/:token in
  // routes/reviewGating.ts 302-redirects straight to the store's Google review
  // page for everyone. No rating funnel / no gating (Google review policy).
  const crypto = await import("crypto");
  const { pool } = await import("./db");
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  const customerName = (appointment.customer as any)?.fullName || appointment.customer?.name || null;

  await pool.query(
    `INSERT INTO review_tokens (token, store_id, appointment_id, customer_id, customer_name, customer_phone, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      token,
      appointment.storeId,
      appointment.id,
      appointment.customer?.id ?? null,
      customerName,
      customerPhone,
      expiresAt,
    ]
  );

  const reviewUrl = `${process.env.APP_URL ?? "https://certxa.com"}/review/${token}`;

  const template =
    settings.reviewTemplate ||
    "Hi {customerName}, thank you for visiting {storeName}! We'd love your feedback. Leave us a review: {reviewUrl}";

  const body = interpolateTemplate(template, {
    customerName: customerName || "there",
    storeName: appointment.store?.name || "our salon",
    reviewUrl: reviewUrl,
  });

  await sendSms(
    appointment.storeId,
    customerPhone,
    body,
    "review_request",
    appointment.id,
    appointment.customer?.id,
    { skipCreditDeduction: true, smsSource: "platform" }
  );

  return { sent: true };
}

let reminderIntervalId: ReturnType<typeof setInterval> | null = null;

export function startReminderScheduler(): void {
  if (reminderIntervalId) return;

  console.log("[SMS] Reminder scheduler started (checks every 5 minutes)");

  reminderIntervalId = setInterval(async () => {
    try {
      await processReminders();
      await processReviewRequests();
    } catch (err) {
      console.error("[SMS] Scheduler error:", err);
    }
  }, 5 * 60 * 1000);

  setTimeout(() => {
    processReminders().catch(console.error);
    processReviewRequests().catch(console.error);
  }, 10_000);
}

async function processReminders(): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const upcomingAppointments = await storage.getAppointmentsNeedingReminders(
    in24h,
    in25h
  );

  for (const appt of upcomingAppointments) {
    await sendAppointmentReminder(appt);
  }

  if (upcomingAppointments.length > 0) {
    console.log(
      `[SMS] Processed ${upcomingAppointments.length} reminder(s)`
    );
  }
}

async function processReviewRequests(): Promise<void> {
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const ninetyMinAgo = new Date(now.getTime() - 90 * 60 * 1000);

  const completedAppointments = await storage.getRecentlyCompletedAppointments(
    ninetyMinAgo,
    thirtyMinAgo
  );

  let sent = 0;
  for (const appt of completedAppointments) {
    try {
      const result = await sendReviewRequest(appt);
      if (result.sent) sent++;
    } catch (err) {
      console.error(`[SMS] Review request error for appointment ${appt.id}:`, err);
    }
  }

  if (sent > 0) {
    console.log(`[SMS] Sent ${sent} review request(s)`);
  }
}

export function stopReminderScheduler(): void {
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
  }
}

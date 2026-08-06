/**
 * System transactional emails for Certxa.
 *
 * All platform-level emails (billing, auth, account events) live here.
 * Per-store booking/reminder emails remain in mail.ts.
 *
 * Design: inline styles only, max-width 600px, works in Gmail/Outlook/Apple Mail.
 */

import { sendEmail } from "../mail";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { locations, userEmailPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

// ─── Brand constants ──────────────────────────────────────────────────────────

const BRAND_COLOR   = "#6366f1";
const DANGER_COLOR  = "#ef4444";
const SUCCESS_COLOR = "#22c55e";
const WARN_COLOR    = "#f59e0b";
const APP_URL       = process.env.APP_URL || "https://app.certxa.com";

// ─── Unsubscribe token ────────────────────────────────────────────────────────

/** Build a signed, forgery-proof unsubscribe URL for a given userId + preference key. */
export function buildUnsubscribeUrl(userId: string, pref: EmailPrefKey): string {
  const secret = process.env.SESSION_SECRET || "certxa-email-unsub-secret";
  const sig    = createHmac("sha256", secret).update(`${userId}:${pref}`).digest("hex");
  return `${APP_URL}/api/unsubscribe?uid=${encodeURIComponent(userId)}&pref=${pref}&sig=${sig}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreOwnerContact {
  userId: string;
  email: string;
  firstName: string | null;
  storeName: string;
}

type EmailPrefKey = "billingReceipts" | "lowBalanceAlerts" | "dataOperations" | "trialReminders";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getStoreOwnerContact(storeId: number): Promise<StoreOwnerContact | null> {
  try {
    const rows = await db
      .select({
        userId:    users.id,
        email:     users.email,
        firstName: users.firstName,
        storeName: locations.name,
      })
      .from(locations)
      .innerJoin(users, eq(users.id, locations.userId))
      .where(eq(locations.id, storeId))
      .limit(1);

    if (!rows[0]) return null;
    return {
      userId:    rows[0].userId,
      email:     rows[0].email,
      firstName: rows[0].firstName ?? null,
      storeName: rows[0].storeName ?? "Your business",
    };
  } catch {
    return null;
  }
}

/** Returns false if the user has opted out of the given email category. Defaults to true (send) when no preference row exists. */
export async function userWantsEmail(userId: string, pref: EmailPrefKey): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(userEmailPreferences)
      .where(eq(userEmailPreferences.userId, userId))
      .limit(1);
    if (!row) return true;
    return row[pref] !== false;
  } catch {
    return true;
  }
}

/** Look up userId by email address (for non-storeId email functions). */
async function getUserIdByEmail(email: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

function greeting(firstName: string | null): string {
  return firstName ? `Hi ${firstName},` : "Hi there,";
}

// ─── Base HTML wrapper ────────────────────────────────────────────────────────

function wrap(
  { title, accentColor = BRAND_COLOR, body, unsubscribeUrl }:
  { title: string; accentColor?: string; body: string; unsubscribeUrl?: string }
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

  <!-- Header -->
  <tr><td style="background:${accentColor};padding:28px 40px;text-align:left;">
    <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Certxa</span>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:36px 40px;color:#1e293b;font-size:15px;line-height:1.65;">
    ${body}
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
      Certxa — Service Business Platform<br>
      Questions? Email <a href="mailto:support@certxa.com" style="color:${BRAND_COLOR};text-decoration:none;">support@certxa.com</a>${unsubscribeUrl ? `<br><a href="${unsubscribeUrl}" style="color:#94a3b8;font-size:11px;text-decoration:underline;margin-top:4px;display:inline-block;">Unsubscribe from billing emails</a>` : ""}
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function btn(label: string, url: string, color = BRAND_COLOR): string {
  return `<a href="${url}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;margin-top:20px;">${label}</a>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`;
}

// ─── 1. Welcome Email (on registration) ──────────────────────────────────────

export async function sendWelcomeEmail(
  email: string,
  firstName: string | null
): Promise<void> {
  const html = wrap({
    title: "Welcome to Certxa",
    body: `
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e293b;">Welcome to Certxa! 🎉</p>
      <p style="margin:0 0 16px;">${greeting(firstName)}</p>
      <p style="margin:0 0 16px;">
        Your account is live and your <strong>60-day free trial</strong> has started. Here's what you can do right now:
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
        ${["Set up your services &amp; pricing", "Add your team members", "Enable online booking", "Run your first POS transaction"].map(item =>
          `<tr><td style="padding:6px 0;"><span style="color:${BRAND_COLOR};font-weight:700;margin-right:8px;">✓</span>${item}</td></tr>`
        ).join("")}
      </table>
      ${btn("Open Certxa Dashboard", `${APP_URL}/dashboard`)}
      ${divider()}
      <p style="margin:0;color:#64748b;font-size:13px;">
        Need help getting started? Reply to this email — we're here.
      </p>
    `,
  });

  await sendEmail(0, email, "Welcome to Certxa — your 60-day trial has started!", html)
    .catch((e) => console.warn("[systemEmail] welcome email failed:", e?.message));
}

// ─── 2. Subscription Renewal Success ─────────────────────────────────────────

export async function sendSubscriptionRenewalEmail(
  storeId: number,
  amountDollars: number,
  invoiceUrl?: string | null
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;
  if (!await userWantsEmail(owner.userId, "billingReceipts")) return;

  const html = wrap({
    title: "Payment confirmed",
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">Your Certxa subscription payment was successfully processed.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Business</td>
          <td style="text-align:right;font-weight:600;">${owner.storeName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Amount paid</td>
          <td style="text-align:right;font-weight:600;color:${SUCCESS_COLOR};">$${amountDollars.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Date</td>
          <td style="text-align:right;font-weight:600;">${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td>
        </tr>
      </table>
      ${invoiceUrl ? btn("View Invoice", invoiceUrl, SUCCESS_COLOR) : ""}
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Thank you for being a Certxa customer.</p>
    `,
    unsubscribeUrl: buildUnsubscribeUrl(owner.userId, "billingReceipts"),
  });

  await sendEmail(storeId, owner.email, "Payment confirmed — Certxa subscription", html)
    .catch((e) => console.warn("[systemEmail] renewal email failed:", e?.message));
}

// ─── 3. Payment Failed ────────────────────────────────────────────────────────

export async function sendPaymentFailedEmail(
  storeId: number,
  reason: string,
  nextAttemptTimestamp?: number | null
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;

  const nextAttempt = nextAttemptTimestamp
    ? new Date(nextAttemptTimestamp * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : null;

  const html = wrap({
    title: "Payment failed",
    accentColor: DANGER_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        We were unable to process your Certxa subscription payment.
        <strong>Your account has been temporarily suspended</strong> until this is resolved.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Reason</td>
          <td style="text-align:right;font-weight:600;color:${DANGER_COLOR};">${reason}</td>
        </tr>
        ${nextAttempt ? `<tr><td style="color:#64748b;font-size:13px;">Next retry</td><td style="text-align:right;font-weight:600;">${nextAttempt}</td></tr>` : ""}
      </table>
      <p style="margin:0 0 16px;">To restore your account, please update your payment method:</p>
      ${btn("Update Payment Method", `${APP_URL}/billing`, DANGER_COLOR)}
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
        Questions? Contact <a href="mailto:support@certxa.com" style="color:${BRAND_COLOR};">support@certxa.com</a>
      </p>
    `,
    unsubscribeUrl: buildUnsubscribeUrl(owner.userId, "billingReceipts"),
  });

  await sendEmail(storeId, owner.email, "Action required — Certxa payment failed", html)
    .catch((e) => console.warn("[systemEmail] payment failed email error:", e?.message));
}

// ─── 4. Account Suspended ─────────────────────────────────────────────────────

export async function sendAccountSuspendedEmail(
  storeId: number,
  reason: string
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;

  const html = wrap({
    title: "Account suspended",
    accentColor: WARN_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        Your Certxa account (<strong>${owner.storeName}</strong>) has been suspended.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;">Reason</td>
          <td style="text-align:right;font-weight:600;color:${WARN_COLOR};">${reason}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">
        Your booking page and client-facing features are paused. To reactivate, please update your payment details.
      </p>
      ${btn("Resolve Now", `${APP_URL}/billing`, WARN_COLOR)}
    `,
  });

  await sendEmail(storeId, owner.email, "Your Certxa account has been suspended", html)
    .catch((e) => console.warn("[systemEmail] suspended email error:", e?.message));
}

// ─── 5. Account Locked (30 days past due) ────────────────────────────────────

export async function sendAccountLockedEmail(
  storeId: number,
  reason: string
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;

  const html = wrap({
    title: "Account locked",
    accentColor: DANGER_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        Your Certxa account has been <strong>locked</strong> due to an unpaid balance that has remained outstanding for 30 days.
        Your subscription has been canceled.
      </p>
      <p style="margin:0 0 16px;">
        To restore access, please contact our support team to arrange a payment plan or reactivate your account.
      </p>
      ${btn("Contact Support", "mailto:support@certxa.com", DANGER_COLOR)}
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Reason: ${reason}</p>
    `,
  });

  await sendEmail(storeId, owner.email, "Urgent: Your Certxa account has been locked", html)
    .catch((e) => console.warn("[systemEmail] locked email error:", e?.message));
}

// ─── 6. Account Restored ─────────────────────────────────────────────────────

export async function sendAccountRestoredEmail(storeId: number): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;

  const html = wrap({
    title: "Account restored",
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        Great news! Your Certxa account for <strong>${owner.storeName}</strong> has been fully restored.
        Your booking page, client features, and all services are active again.
      </p>
      ${btn("Go to Dashboard", `${APP_URL}/dashboard`, SUCCESS_COLOR)}
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
        Thank you for sorting this out. Let us know if you need anything.
      </p>
    `,
  });

  await sendEmail(storeId, owner.email, "Your Certxa account has been restored", html)
    .catch((e) => console.warn("[systemEmail] restored email error:", e?.message));
}

// ─── 7. Trial Expired ─────────────────────────────────────────────────────────

export async function sendTrialExpiredEmail(
  email: string,
  firstName: string | null
): Promise<void> {
  const uid = await getUserIdByEmail(email);
  if (uid && !await userWantsEmail(uid, "trialReminders")) return;

  const html = wrap({
    title: "Your Certxa trial has ended",
    accentColor: WARN_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(firstName)}</p>
      <p style="margin:0 0 16px;">
        Your 60-day free trial of Certxa has ended and your account has been deactivated.
      </p>
      <p style="margin:0 0 16px;">
        Your data is safe — subscribe to any plan to instantly restore access with everything intact.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
        ${["Unlimited bookings & appointments", "POS, loyalty rewards & gift cards", "Client CRM & automated reminders", "AI Receptionist & marketing tools"].map(item =>
          `<tr><td style="padding:6px 0;"><span style="color:${BRAND_COLOR};font-weight:700;margin-right:8px;">✓</span>${item}</td></tr>`
        ).join("")}
      </table>
      ${btn("View Plans & Subscribe", `${APP_URL}/billing`)}
      ${divider()}
      <p style="margin:0;color:#64748b;font-size:13px;">
        Have questions or need a discount? Reply to this email — we'd love to keep you.
      </p>
    `,
  });

  await sendEmail(0, email, "Your Certxa free trial has ended — don't lose your data", html)
    .catch((e) => console.warn("[systemEmail] trial expired email error:", e?.message));
}

// ─── 8. Credits Top-up Receipt ────────────────────────────────────────────────

export async function sendCreditsTopupReceiptEmail(
  storeId: number,
  type: "platform" | "sms",
  amountDisplay: string,
  receiptUrl?: string | null
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;
  if (!await userWantsEmail(owner.userId, "billingReceipts")) return;

  const label = type === "platform" ? "Platform Credits (AI)" : "SMS Credits";
  const description =
    type === "platform"
      ? "These credits power your AI Receptionist, smart scheduling, and usage-based features."
      : "These credits are used for SMS appointment reminders and marketing messages.";

  const html = wrap({
    title: `${label} top-up receipt`,
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">Your top-up was successful. Here's your receipt.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Business</td>
          <td style="text-align:right;font-weight:600;">${owner.storeName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Credit type</td>
          <td style="text-align:right;font-weight:600;">${label}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Amount</td>
          <td style="text-align:right;font-weight:700;color:${SUCCESS_COLOR};">${amountDisplay}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Date</td>
          <td style="text-align:right;font-weight:600;">${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;color:#64748b;font-size:13px;">${description}</p>
      ${receiptUrl ? btn("View Receipt", receiptUrl, SUCCESS_COLOR) : btn("Go to Billing", `${APP_URL}/billing`, SUCCESS_COLOR)}
    `,
    unsubscribeUrl: buildUnsubscribeUrl(owner.userId, "billingReceipts"),
  });

  await sendEmail(storeId, owner.email, `Receipt: ${label} top-up — Certxa`, html)
    .catch((e) => console.warn("[systemEmail] topup receipt email error:", e?.message));
}

// ─── 9. Auto-Refill Failure ───────────────────────────────────────────────────

export async function sendAutoRefillFailedEmail(
  storeId: number,
  amountDollars: string,
  reason: string
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;
  if (!await userWantsEmail(owner.userId, "billingReceipts")) return;

  const html = wrap({
    title: "Auto-refill payment failed",
    accentColor: DANGER_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        We tried to automatically top up your AI Credits balance for
        <strong>${owner.storeName}</strong> but the payment of
        <strong>$${amountDollars}</strong> could not be processed.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Amount</td>
          <td style="text-align:right;font-weight:700;color:${DANGER_COLOR};">$${amountDollars}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Reason</td>
          <td style="text-align:right;font-weight:600;color:#ef4444;">${reason}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">
        Your AI Receptionist and usage-based features may pause if your balance reaches zero.
        Please update your payment method or top up manually to restore service.
      </p>
      ${btn("Update Payment Method", `${APP_URL}/manage/billing`, DANGER_COLOR)}
    `,
    unsubscribeUrl: buildUnsubscribeUrl(owner.userId, "billingReceipts"),
  });

  await sendEmail(storeId, owner.email, `Action needed: auto-refill failed — ${owner.storeName}`, html)
    .catch((e) => console.warn("[systemEmail] auto-refill failed email error:", e?.message));
}

// ─── 10. Low Balance Alert ────────────────────────────────────────────────────

export async function sendLowBalanceAlertEmail(
  storeId: number,
  type: "platform_credits" | "sms_credits",
  remaining: number,
  isCritical = false
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;
  if (!await userWantsEmail(owner.userId, "lowBalanceAlerts")) return;

  const isPlatform = type === "platform_credits";
  const label      = isPlatform ? "platform credits" : "SMS credits";
  const isNeg      = remaining < 0;
  const formatted  = isPlatform
    ? (isNeg ? `-$${Math.abs(remaining).toFixed(2)}` : `$${remaining.toFixed(2)}`)
    : `${remaining} credits`;
  const topupPath  = isPlatform ? "/billing?tab=credits" : "/billing?tab=sms";
  const alertColor = isCritical || isNeg ? DANGER_COLOR : WARN_COLOR;
  const bgColor    = isCritical || isNeg ? "#fef2f2"    : "#fffbeb";
  const borderColor= isCritical || isNeg ? "#fca5a5"    : "#fde68a";

  const titleText = isCritical || isNeg
    ? `${label} balance is negative`
    : `Low ${label} balance`;

  const bodyMsg = isCritical || isNeg
    ? (isPlatform
      ? "Your platform credits balance has gone <strong>negative</strong>. New AI Receptionist calls are currently blocked. Please top up immediately to restore service."
      : "Your SMS credits balance is critically low. Appointment reminders and SMS messages may be paused.")
    : (isPlatform
      ? "When platform credits run out, AI Receptionist and usage-based features will pause until you top up."
      : "When SMS credits run out, appointment reminders and marketing SMS messages will stop sending.");

  const html = wrap({
    title: titleText,
    accentColor: alertColor,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        Your <strong>${label}</strong> balance for <strong>${owner.storeName}</strong>
        ${isCritical || isNeg ? "has gone negative." : "is running low."}
      </p>
      <table cellpadding="0" cellspacing="0" style="background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;">${isCritical || isNeg ? "Current balance" : "Remaining"} ${label}</td>
          <td style="text-align:right;font-weight:700;color:${alertColor};">${formatted}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">${bodyMsg}</p>
      ${btn("Top Up Now", `${APP_URL}${topupPath}`, alertColor)}
    `,
  });

  const subject = isCritical || isNeg
    ? `Action required: ${label} balance is negative — ${owner.storeName}`
    : `Low ${label} balance — action needed`;

  await sendEmail(storeId, owner.email, subject, html)
    .catch((e) => console.warn("[systemEmail] low balance email error:", e?.message));
}

// ─── 10. Subscription Cancellation Scheduled ─────────────────────────────────

export async function sendSubscriptionCancellationEmail(
  storeId: number,
  planName: string,
  accessUntil: Date
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;
  if (!await userWantsEmail(owner.userId, "billingReceipts")) return;

  const accessDate = accessUntil.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const html = wrap({
    title: "Subscription cancellation confirmed",
    accentColor: WARN_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        Your <strong>${planName}</strong> subscription for <strong>${owner.storeName}</strong> has been scheduled for cancellation.
        You will continue to have full access until your billing period ends.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Plan</td>
          <td style="text-align:right;font-weight:600;">${planName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Access until</td>
          <td style="text-align:right;font-weight:700;color:${WARN_COLOR};">${accessDate}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">Changed your mind? You can reactivate your subscription at any time before ${accessDate}.</p>
      ${btn("Reactivate Subscription", `${APP_URL}/subscription`, WARN_COLOR)}
      ${divider()}
      <p style="margin:0;color:#64748b;font-size:13px;">
        After ${accessDate}, your account will be downgraded to the free tier. Your data is always kept safe.
      </p>
    `,
    unsubscribeUrl: buildUnsubscribeUrl(owner.userId, "billingReceipts"),
  });

  await sendEmail(storeId, owner.email, "Your Certxa subscription has been cancelled", html)
    .catch((e) => console.warn("[systemEmail] cancellation email error:", e?.message));
}

// ─── 11. Subscription Ended (period expired after cancellation) ───────────────

export async function sendSubscriptionEndedEmail(
  storeId: number,
  planName: string,
  endedAt: Date
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;
  if (!await userWantsEmail(owner.userId, "billingReceipts")) return;

  const endDate = endedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const html = wrap({
    title: "Your Certxa subscription has ended",
    accentColor: DANGER_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        Your <strong>${planName}</strong> subscription for <strong>${owner.storeName}</strong> has now ended.
        Your account has been moved to the free tier and some features may no longer be available.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Plan</td>
          <td style="text-align:right;font-weight:600;">${planName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Access ended</td>
          <td style="text-align:right;font-weight:700;color:${DANGER_COLOR};">${endDate}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">
        Your booking history, clients, and all data are safe. Resubscribe anytime to restore full access instantly.
      </p>
      ${btn("Resubscribe Now", `${APP_URL}/subscription`, BRAND_COLOR)}
      ${divider()}
      <p style="margin:0;color:#64748b;font-size:13px;">
        Questions or need a discount to come back? Reply to this email — we'd love to have you.
      </p>
    `,
    unsubscribeUrl: buildUnsubscribeUrl(owner.userId, "billingReceipts"),
  });

  await sendEmail(storeId, owner.email, "Your Certxa subscription has ended", html)
    .catch((e) => console.warn("[systemEmail] subscription ended email error:", e?.message));
}

// ─── 12. Subscription Reactivated ────────────────────────────────────────────

export async function sendSubscriptionReactivatedEmail(
  storeId: number,
  planName: string,
  renewsAt: Date | null
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;
  if (!await userWantsEmail(owner.userId, "billingReceipts")) return;

  const renewDate = renewsAt
    ? renewsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const html = wrap({
    title: "You're back — subscription reactivated",
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        Your <strong>${planName}</strong> subscription for <strong>${owner.storeName}</strong> has been reactivated.
        Everything is back to normal — no action needed.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Plan</td>
          <td style="text-align:right;font-weight:600;">${planName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Status</td>
          <td style="text-align:right;font-weight:700;color:${SUCCESS_COLOR};">Active</td>
        </tr>
        ${renewDate ? `<tr><td style="color:#64748b;font-size:13px;padding-top:6px;">Next renewal</td><td style="text-align:right;font-weight:600;">${renewDate}</td></tr>` : ""}
      </table>
      <p style="margin:0 0 16px;color:#64748b;font-size:13px;">
        Your next charge will be on ${renewDate ?? "your next billing date"}.
      </p>
      ${btn("View Subscription", `${APP_URL}/subscription`, SUCCESS_COLOR)}
    `,
    unsubscribeUrl: buildUnsubscribeUrl(owner.userId, "billingReceipts"),
  });

  await sendEmail(storeId, owner.email, "Subscription reactivated — you're all set", html)
    .catch((e) => console.warn("[systemEmail] reactivation email error:", e?.message));
}

// ─── 13. Data Transfer Complete ───────────────────────────────────────────────

export async function sendDataTransferCompleteEmail(
  userEmail: string,
  userName: string,
  counts: Record<string, number>
): Promise<void> {
  const uid = await getUserIdByEmail(userEmail);
  if (uid && !await userWantsEmail(uid, "dataOperations")) return;

  const rows = Object.entries(counts)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `<tr><td style="color:#64748b;font-size:13px;padding-bottom:6px;text-transform:capitalize;">${k}</td><td style="text-align:right;font-weight:600;">${v}</td></tr>`)
    .join("");

  const html = wrap({
    title: "Your data transfer is complete",
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(userName || null)}</p>
      <p style="margin:0 0 16px;">
        Great news! Your Certxa data transfer has been reviewed, approved, and imported successfully.
      </p>
      ${rows ? `
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        ${rows}
      </table>` : ""}
      <p style="margin:0 0 16px;">Everything is now live in your Certxa account.</p>
      ${btn("View Your Data", `${APP_URL}/clients`, SUCCESS_COLOR)}
      ${divider()}
      <p style="margin:0;color:#64748b;font-size:13px;">
        If anything looks off, you can undo the import from the Data Transfer page at any time.
      </p>
    `,
  });

  await sendEmail(0, userEmail, "Your Certxa data transfer is complete!", html)
    .catch((e) => console.warn("[systemEmail] transfer complete email error:", e?.message));
}

// ─── 11. Data Transfer Rejected ───────────────────────────────────────────────

export async function sendDataTransferRejectedEmail(
  userEmail: string,
  userName: string,
  reason: string
): Promise<void> {
  const uid = await getUserIdByEmail(userEmail);
  if (uid && !await userWantsEmail(uid, "dataOperations")) return;

  const html = wrap({
    title: "Data transfer update",
    accentColor: DANGER_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(userName || null)}</p>
      <p style="margin:0 0 16px;">
        We reviewed your data transfer request and were unable to complete the import.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;">Reason</td>
          <td style="text-align:right;font-weight:600;color:${DANGER_COLOR};">${reason}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">
        You can try again by uploading corrected files on the Data Transfer page, or contact support for help.
      </p>
      ${btn("Retry Transfer", `${APP_URL}/data-transfer`)}
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
        Need help? Email <a href="mailto:support@certxa.com" style="color:${BRAND_COLOR};">support@certxa.com</a>
      </p>
    `,
  });

  await sendEmail(0, userEmail, "Update on your Certxa data transfer request", html)
    .catch((e) => console.warn("[systemEmail] transfer rejected email error:", e?.message));
}

// ─── 12. Owner notified — Contractor Stripe Account Verified ─────────────────

export async function sendOwnerContractorVerifiedEmail(
  storeId: number,
  contractorFirstName: string | null,
  contractorLastName: string | null
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;

  const contractorName = [contractorFirstName, contractorLastName].filter(Boolean).join(" ") || "A contractor";

  const html = wrap({
    title: "Contractor payout account activated",
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        <strong>${contractorName}</strong> has connected and verified their Stripe payout account.
        Payouts are now enabled for this contractor and will be sent automatically on each pay cycle.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Contractor</td>
          <td style="text-align:right;font-weight:600;">${contractorName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Payout status</td>
          <td style="text-align:right;font-weight:700;color:${SUCCESS_COLOR};">Active ✓</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;color:#64748b;font-size:13px;">
        No action needed — payouts will flow automatically. You can review contractor payout settings in your dashboard.
      </p>
      ${btn("View Contractors", `${APP_URL}/payouts/contractors`, SUCCESS_COLOR)}
    `,
  });

  await sendEmail(storeId, owner.email, `Contractor ${contractorName} has activated their payout account`, html)
    .catch((e) => console.warn("[systemEmail] owner contractor verified email error:", e?.message));
}

// ─── 13. Contractor Stripe Account Verified (contractor copy) ─────────────────

export async function sendContractorStripeVerifiedEmail(
  contractorEmail: string,
  contractorFirstName: string | null
): Promise<void> {
  const html = wrap({
    title: "Payout account verified",
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(contractorFirstName || null)}</p>
      <p style="margin:0 0 16px;">
        Great news — your Stripe payout account has been verified and payouts are now active.
        You'll receive your earnings automatically on each pay cycle.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Account status</td>
          <td style="text-align:right;font-weight:700;color:${SUCCESS_COLOR};">Verified ✓</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Payouts</td>
          <td style="text-align:right;font-weight:600;">Enabled</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">
        No further action is needed. Your salon will send payouts directly to your connected bank account.
        If you have any questions, reach out to your salon manager.
      </p>
      <p style="margin:0;color:#64748b;font-size:13px;">
        Need help? Email <a href="mailto:support@certxa.com" style="color:${BRAND_COLOR};">support@certxa.com</a>
      </p>
    `,
  });

  await sendEmail(0, contractorEmail, "Your payout account is verified — payouts are enabled", html)
    .catch((e) => console.warn("[systemEmail] contractor stripe verified email error:", e?.message));
}

// ─── 14. Contractor Stripe Account Restricted (owner copy) ───────────────────

export async function sendOwnerContractorRestrictedEmail(
  storeId: number,
  contractorFirstName: string | null,
  contractorLastName: string | null,
  contractorId: number
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;

  const contractorName = [contractorFirstName, contractorLastName].filter(Boolean).join(" ") || "A contractor";
  const contractorUrl  = `${APP_URL}/payouts/contractors/${contractorId}`;

  const html = wrap({
    title: "Action required — contractor payout account restricted",
    accentColor: DANGER_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        <strong>${contractorName}</strong>'s Stripe payout account has been flagged as <strong>restricted</strong>.
        Payouts to this contractor are currently on hold until the issue is resolved.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Contractor</td>
          <td style="text-align:right;font-weight:600;">${contractorName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Payout status</td>
          <td style="text-align:right;font-weight:700;color:${DANGER_COLOR};">Restricted ✗</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">
        Please reach out to <strong>${contractorName}</strong> and ask them to log in to their Stripe dashboard
        to resolve any outstanding requirements. Payouts will resume automatically once their account is back in good standing.
      </p>
      <p style="margin:0 0 20px;color:#64748b;font-size:13px;">
        You can also re-send their onboarding link from the contractor's detail page in your dashboard.
      </p>
      ${btn("View Contractor", contractorUrl, DANGER_COLOR)}
    `,
  });

  await sendEmail(storeId, owner.email, `Action required — ${contractorName}'s payout account needs attention`, html)
    .catch((e) => console.warn("[systemEmail] owner contractor restricted email error:", e?.message));
}

// ─── 15. Owner notified — Contractor Account Resolved ────────────────────────

export async function sendOwnerContractorResolvedEmail(
  storeId: number,
  contractorFirstName: string | null,
  contractorLastName: string | null,
  contractorId: number
): Promise<void> {
  const owner = await getStoreOwnerContact(storeId);
  if (!owner) return;

  const contractorName = [contractorFirstName, contractorLastName].filter(Boolean).join(" ") || "A contractor";
  const contractorUrl  = `${APP_URL}/payouts/contractors/${contractorId}`;

  const html = wrap({
    title: "Contractor payout account resolved",
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(owner.firstName)}</p>
      <p style="margin:0 0 16px;">
        Good news — <strong>${contractorName}</strong>'s Stripe payout account is back in good standing.
        Payouts have automatically resumed and will be sent on the next pay cycle.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Contractor</td>
          <td style="text-align:right;font-weight:600;">${contractorName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Payout status</td>
          <td style="text-align:right;font-weight:700;color:${SUCCESS_COLOR};">Active ✓</td>
        </tr>
      </table>
      <p style="margin:0 0 20px;color:#64748b;font-size:13px;">
        No action needed — everything is back to normal. You can review this contractor's details in your dashboard.
      </p>
      ${btn("View Contractor", contractorUrl, SUCCESS_COLOR)}
    `,
  });

  await sendEmail(storeId, owner.email, `${contractorName}'s payout account is back in good standing`, html)
    .catch((e) => console.warn("[systemEmail] owner contractor resolved email error:", e?.message));
}

// ─── 16. Contractor Payout Account Resolved (contractor copy) ────────────────

export async function sendContractorResolvedEmail(
  contractorEmail: string,
  contractorFirstName: string | null
): Promise<void> {
  const html = wrap({
    title: "Your payout account is back in good standing",
    accentColor: SUCCESS_COLOR,
    body: `
      <p style="margin:0 0 16px;">${greeting(contractorFirstName || null)}</p>
      <p style="margin:0 0 16px;">
        Great news — your Stripe payout account has been reviewed and is back in good standing.
        Payouts will automatically resume on your next pay cycle.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:20px;">
        <tr>
          <td style="color:#64748b;font-size:13px;padding-bottom:6px;">Account status</td>
          <td style="text-align:right;font-weight:700;color:${SUCCESS_COLOR};">Resolved ✓</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;">Payouts</td>
          <td style="text-align:right;font-weight:600;">Resuming next cycle</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">
        No further action is needed on your end. If you have any questions about your payout schedule,
        reach out to your salon manager.
      </p>
      <p style="margin:0;color:#64748b;font-size:13px;">
        Need help? Email <a href="mailto:support@certxa.com" style="color:${BRAND_COLOR};">support@certxa.com</a>
      </p>
    `,
  });

  await sendEmail(0, contractorEmail, "Your payout account is back in good standing", html)
    .catch((e) => console.warn("[systemEmail] contractor resolved email error:", e?.message));
}

// ─── Contractor Onboarding Invite ─────────────────────────────────────────────

/**
 * Sends a contractor a magic-link email so they can self-service their
 * Stripe Connect onboarding without the salon owner's involvement.
 * The link is valid for 48 hours.
 */
export async function sendContractorOnboardingInvite({
  email,
  firstName,
  storeName,
  token,
}: {
  email: string;
  firstName: string;
  storeName: string;
  token: string;
}): Promise<void> {
  const portalUrl = `${APP_URL}/contractor-onboarding/${token}`;

  const html = wrap({
    title: "Set up your direct deposit",
    accentColor: BRAND_COLOR,
    body: `
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e293b;">You've been invited to set up direct deposit</p>
      <p style="margin:0 0 16px;">Hi ${firstName},</p>
      <p style="margin:0 0 20px;">
        <strong>${storeName}</strong> uses Certxa to send contractor payouts.
        To receive direct deposits, you'll need to connect a payout account through our secure partner, Stripe.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:24px;">
        <tr><td style="padding-bottom:8px;">
          <span style="color:#16a34a;font-weight:700;font-size:14px;">What to expect:</span>
        </td></tr>
        ${["Takes about 5 minutes to complete", "You'll need your bank account or debit card details", "Your info is encrypted and handled by Stripe — not stored by Certxa", "Once verified, payouts go directly to your account"].map(item =>
          `<tr><td style="padding:3px 0;font-size:14px;color:#374151;"><span style="color:#16a34a;margin-right:8px;">✓</span>${item}</td></tr>`
        ).join("")}
      </table>
      ${btn("Set Up My Direct Deposit", portalUrl, "#0d9488")}
      <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">
        This link expires in 48 hours. If you didn't expect this email, you can safely ignore it.
      </p>
    `,
  });

  await sendEmail(0, email, `Action needed: set up your direct deposit with ${storeName}`, html)
    .catch((e) => console.warn("[systemEmail] contractor onboarding invite failed:", e?.message));
}

// ─── GBP Reconnect Required ────────────────────────────────────────────────

/**
 * Sent when the GBP optimization worker detects that a salon's Google Business
 * Profile connection has been revoked or expired.
 *
 * Deliberately avoids all technical error details — the owner only needs to know
 * their connection needs renewing and where to do it.
 */
export async function sendGBPReconnectEmail(
  storeId: number,
  ownerEmail: string,
  storeName: string,
): Promise<void> {
  const reconnectUrl = `${APP_URL}/settings/google-business`;

  const html = wrap({
    title: "Google Business Profile — reconnection needed",
    accentColor: WARN_COLOR,
    body: `
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e293b;">
        Your Google Business Profile connection needs to be renewed
      </p>
      <p style="margin:0 0 16px;">
        Hi there,
      </p>
      <p style="margin:0 0 20px;">
        Certxa is no longer able to automatically update your Google Business Profile
        for <strong>${storeName}</strong>. This usually happens when Google requires
        you to re-authorise the connection.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px;width:100%;box-sizing:border-box;margin-bottom:24px;">
        <tr><td style="padding-bottom:12px;">
          <span style="color:#92400e;font-weight:700;font-size:14px;">While disconnected, automatic updates are paused:</span>
        </td></tr>
        ${[
          "Business hours will not be kept in sync with Google",
          "New services won't appear on your Google listing",
          "Review responses will still work manually",
        ].map((item) => `
          <tr><td style="padding:3px 0;font-size:14px;color:#78350f;">
            <span style="color:#d97706;margin-right:8px;">⚠</span>${item}
          </td></tr>
        `).join("")}
      </table>
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">
        Reconnecting takes less than a minute — just click the button below and
        sign in with your Google account.
      </p>
      ${btn("Reconnect Google Business Profile", reconnectUrl, WARN_COLOR)}
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">
        If you've already reconnected, you can ignore this email.
        Questions? Email <a href="mailto:support@certxa.com" style="color:${BRAND_COLOR};">support@certxa.com</a>
      </p>
    `,
  });

  await sendEmail(
    storeId,
    ownerEmail,
    `Action needed: reconnect Google Business Profile for ${storeName}`,
    html,
  ).catch((e) => console.warn("[systemEmail] GBP reconnect email failed:", e?.message));
}

// ─── Service Import: Success ───────────────────────────────────────────────────

/**
 * Sent to the salon owner when AI finishes extracting their service menu.
 */
export async function sendServiceImportSuccessEmail(
  ownerEmail: string,
  firstName: string,
  storeName: string,
  categoryCount: number,
  serviceCount: number
): Promise<void> {
  const reviewUrl = `${APP_URL}/services`;
  const html = layout(`
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:${SUCCESS_COLOR}20;margin-bottom:12px;">
        <span style="font-size:28px;">✅</span>
      </div>
      <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1e293b;">Your Certxa service menu is ready</h2>
      <p style="margin:0;color:#64748b;font-size:14px;">Hi ${firstName}, we've finished building your service menu for <strong>${storeName}</strong>.</p>
    </div>
    <div style="background:#f8fafc;border-radius:12px;padding:20px 24px;margin-bottom:24px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#475569;">Here's what was created:</p>
      <div style="display:flex;gap:24px;">
        <div style="text-align:center;flex:1;">
          <div style="font-size:32px;font-weight:800;color:${BRAND_COLOR};">${categoryCount}</div>
          <div style="font-size:13px;color:#64748b;">categor${categoryCount === 1 ? "y" : "ies"}</div>
        </div>
        <div style="text-align:center;flex:1;">
          <div style="font-size:32px;font-weight:800;color:${BRAND_COLOR};">${serviceCount}</div>
          <div style="font-size:13px;color:#64748b;">service${serviceCount === 1 ? "" : "s"}</div>
        </div>
      </div>
    </div>
    <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
      Review your services, make any edits, and publish your menu so clients can start booking online.
    </p>
    ${btn("Review Your Service Menu →", reviewUrl, SUCCESS_COLOR)}
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">
      Questions? Email <a href="mailto:support@certxa.com" style="color:${BRAND_COLOR};text-decoration:none;">support@certxa.com</a>
    </p>
  `);

  await sendEmail(
    0,
    ownerEmail,
    `Your Certxa service menu is ready — ${serviceCount} services created`,
    html
  ).catch((e: any) => console.warn("[systemEmail] Service import success email failed:", e?.message));
}

// ─── Service Import: Failure ───────────────────────────────────────────────────

/**
 * Sent to the salon owner when AI could not extract services from their upload.
 */
export async function sendServiceImportFailureEmail(
  ownerEmail: string,
  firstName: string,
  storeName: string,
  reason: string
): Promise<void> {
  const retryUrl = `${APP_URL}/setup/service-import`;
  const html = layout(`
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:${WARN_COLOR}20;margin-bottom:12px;">
        <span style="font-size:28px;">📸</span>
      </div>
      <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1e293b;">We need clearer photos</h2>
      <p style="margin:0;color:#64748b;font-size:14px;">Hi ${firstName}, we had trouble reading your service menu for <strong>${storeName}</strong>.</p>
    </div>
    <div style="background:#fefce8;border-radius:12px;padding:16px 20px;margin-bottom:24px;border:1px solid #fde68a;">
      <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">${reason}</p>
    </div>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;font-weight:600;">For best results:</p>
    <ul style="margin:0 0 24px;padding:0 0 0 20px;color:#475569;font-size:14px;line-height:2;">
      <li>Make sure all prices are clearly visible</li>
      <li>Avoid glare, shadows, and reflections</li>
      <li>Keep the entire menu board in the frame</li>
      <li>Hold your phone straight and steady</li>
    </ul>
    ${btn("Try Again →", retryUrl, BRAND_COLOR)}
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">
      You can also <a href="${APP_URL}/setup/services" style="color:${BRAND_COLOR};text-decoration:none;">add services manually</a> if you prefer.
      Questions? Email <a href="mailto:support@certxa.com" style="color:${BRAND_COLOR};text-decoration:none;">support@certxa.com</a>
    </p>
  `);

  await sendEmail(
    0,
    ownerEmail,
    `Action needed: upload clearer photos for your ${storeName} menu`,
    html
  ).catch((e: any) => console.warn("[systemEmail] Service import failure email failed:", e?.message));
}

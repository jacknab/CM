/**
 * Trial Reminder Emails — 30 / 7 / 1 day before trial end.
 *
 * Runs alongside the trial-expiration scheduler (hourly).
 * Uses a lightweight "already sent" guard stored in billing_activity_log
 * to prevent duplicate sends across restarts.
 */
import { db } from "../db";
import { sendEmail } from "../mail";
import { users } from "@shared/models/auth";
import { userWantsEmail } from "../lib/systemEmails";
import { eq, and, gte, lte, isNotNull, inArray, sql } from "drizzle-orm";

const REMINDER_DAYS = [10, 7, 3, 1] as const;

function windowFor(daysLeft: number): { start: Date; end: Date } {
  const now = new Date();
  const windowStart = new Date(now.getTime() + daysLeft * 86400_000);
  const windowEnd   = new Date(windowStart.getTime() + 3600_000); // 1-hour window
  return { start: windowStart, end: windowEnd };
}

async function hasAlreadySentReminder(userId: string, daysLeft: number): Promise<boolean> {
  try {
    const { billingActivityLogs } = await import("@shared/schema/orphaned-tables");
    const [existing] = await db
      .select({ id: billingActivityLogs.id })
      .from(billingActivityLogs)
      .where(
        and(
          eq(billingActivityLogs.eventType, `trial.reminder.${daysLeft}d`),
          sql`${billingActivityLogs.metadataJson}->>'userId' = ${userId}`
        )
      )
      .limit(1);
    return !!existing;
  } catch {
    return false;
  }
}

async function logReminderSent(userId: string, email: string, daysLeft: number): Promise<void> {
  try {
    const { billingActivityLogs } = await import("@shared/schema/orphaned-tables");
    await db.insert(billingActivityLogs).values({
      salonId: 0,
      eventType: `trial.reminder.${daysLeft}d`,
      severity: "info",
      message: `Trial reminder (${daysLeft}d) sent to ${email}`,
      metadataJson: { userId, daysLeft },
      source: "system",
    } as any);
  } catch {}
}

async function buildReminderEmail(email: string, firstName: string | null, daysLeft: number): Promise<{ subject: string; html: string }> {
  const name = firstName || "there";
  const urgency = daysLeft === 1 ? "last chance" : daysLeft <= 7 ? "ending soon" : "heads up";

  const subject = daysLeft === 1
    ? "Your Certxa free trial ends tomorrow"
    : `Your Certxa trial ends in ${daysLeft} days`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border-radius:16px;overflow:hidden;max-width:560px;">
        <tr><td style="padding:32px 36px 0;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">
            Certxa<span style="color:#8b5cf6;">.</span>
          </p>
        </td></tr>
        <tr><td style="padding:28px 36px;">
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#fff;line-height:1.3;">
            Hi ${name} — ${urgency} on your free trial
          </h1>
          <p style="margin:0 0 20px;color:#a1a1aa;font-size:15px;line-height:1.6;">
            Your 60-day Certxa free trial ends in <strong style="color:#fff;">${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>.
            After that, your account and websites will be paused until you subscribe.
          </p>
          <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
            Keep your booking calendar, website, client data, and everything else you've built —
            just subscribe before your trial ends.
          </p>
          <a href="${process.env.APP_URL || ""}/manage/billing"
             style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;margin-bottom:24px;">
            Choose a plan →
          </a>
          <p style="margin:0;color:#52525b;font-size:13px;">
            Questions? Reply to this email or visit
            <a href="${process.env.APP_URL || ""}" style="color:#8b5cf6;">${process.env.APP_URL ? new URL(process.env.APP_URL).hostname : "our website"}</a>.
          </p>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #27272a;">
          <p style="margin:0;color:#52525b;font-size:12px;">
            You're receiving this because you have a Certxa account (${email}).
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

export async function runTrialReminderCheck(): Promise<void> {
  for (const daysLeft of REMINDER_DAYS) {
    const { start, end } = windowFor(daysLeft);

    const usersAboutToExpire = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        trialEndsAt: users.trialEndsAt,
      })
      .from(users)
      .where(
        and(
          // Only target account owners — managers/staff never hold a subscription
          inArray(users.role, ["owner", "admin"]),
          eq(users.subscriptionStatus, "trial"),
          isNotNull(users.trialEndsAt),
          gte(users.trialEndsAt, start),
          lte(users.trialEndsAt, end)
        )
      );

    for (const user of usersAboutToExpire) {
      try {
        const alreadySent = await hasAlreadySentReminder(user.id, daysLeft);
        if (alreadySent) continue;

        // Respect the user's email preferences before sending
        const wantsEmail = await userWantsEmail(user.id, "trialReminders");
        if (!wantsEmail) {
          console.log(`[TrialReminder] Skipping ${user.email} — unsubscribed from trial reminders`);
          continue;
        }

        const { subject, html } = await buildReminderEmail(user.email, user.firstName, daysLeft);

        const result = await sendEmail(0, user.email, subject, html);
        if (result.success) {
          await logReminderSent(user.id, user.email, daysLeft);
          console.log(`[TrialReminder] Sent ${daysLeft}d reminder to ${user.email}`);
        } else if (!result.skipped) {
          console.warn(`[TrialReminder] Email failed for ${user.email}: ${result.error}`);
        }
      } catch (err) {
        console.error(`[TrialReminder] Failed for user ${user.email}:`, err);
      }
    }
  }
}

export function startTrialReminderScheduler(): void {
  const run = () => runTrialReminderCheck().catch(err => console.error("[TrialReminder] Error:", err));
  run();
  setInterval(run, 60 * 60 * 1000); // hourly
  console.log("[TrialReminder] Scheduler started — checks for 30/7/1 day reminders every hour");
}

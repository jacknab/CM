/**
 * Trial Reminder Emails — 30 / 7 / 1 day before trial end.
 *
 * Runs alongside the trial-expiration scheduler (hourly).
 * Uses a lightweight "already sent" guard stored in billing_activity_log
 * to prevent duplicate sends across restarts.
 */
import { brandedEmail, emailButton, emailGreeting, emailNote, emailText, escapeEmailHtml } from "../lib/emailLayout";
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

  const appUrl = (process.env.APP_URL || "https://certxa.com").replace(/\/+$/, "");
  const html = brandedEmail({
    heading: `${urgency.charAt(0).toUpperCase()}${urgency.slice(1)}: your free trial`,
    preheader: `Your Certxa free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
    body: [
      emailGreeting(name),
      emailText(`Your 60-day Certxa free trial ends in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>. After that, your account and websites will be paused until you subscribe.`),
      emailText("Keep your booking calendar, website, client data, and everything else you've built: just subscribe before your trial ends."),
      emailButton("Choose a plan", `${appUrl}/manage/billing`),
      emailNote(`You're receiving this because you have a Certxa account (${escapeEmailHtml(email)}).`),
    ].join(""),
  });

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

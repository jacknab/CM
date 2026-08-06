/**
 * Payout Reminder Scheduler
 *
 * Sends an SMS nudge to contractors who haven't completed their Stripe
 * payout setup after a configurable delay. Runs every hour but only
 * dispatches messages between 9am–11am local-ish time (UTC) to avoid
 * waking anyone up.
 *
 * Configurable via env vars:
 *   PAYOUT_REMINDER_DELAY_DAYS     — days after contractor creation before
 *                                    first reminder (default: 3)
 *   PAYOUT_REMINDER_INTERVAL_DAYS  — minimum days between repeat reminders
 *                                    (default: 7)
 */

import { db } from "../db";
import { contractors } from "@shared/schema";
import { and, eq, isNull, isNotNull, lt, lte, or, ne, sql } from "drizzle-orm";
import { sendSms } from "../sms.js";

const DELAY_DAYS    = Math.max(0, parseInt(process.env.PAYOUT_REMINDER_DELAY_DAYS    ?? "3",  10));
const INTERVAL_DAYS = Math.max(1, parseInt(process.env.PAYOUT_REMINDER_INTERVAL_DAYS ?? "7",  10));

// ─── Column migration ─────────────────────────────────────────────────────────

async function ensureColumn(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE contractors
        ADD COLUMN IF NOT EXISTS payout_reminder_sent_at TIMESTAMPTZ`
  );
}

// ─── Send window guard ────────────────────────────────────────────────────────
// Only dispatch between 9:00 and 11:59 UTC (a reasonable morning window
// for US Eastern / Central / Pacific staff).

function isWithinSendWindow(): boolean {
  const hour = new Date().getUTCHours();
  return hour >= 9 && hour < 12;
}

// ─── Main tick ────────────────────────────────────────────────────────────────

async function runReminderTick(): Promise<void> {
  if (!isWithinSendWindow()) return;

  const now         = new Date();
  const delayMs     = DELAY_DAYS    * 86_400_000;
  const intervalMs  = INTERVAL_DAYS * 86_400_000;

  const eligibleCutoff  = new Date(now.getTime() - delayMs);    // created before this
  const reminderCutoff  = new Date(now.getTime() - intervalMs); // last reminder before this

  // Fetch contractors that need a nudge:
  //   • not fully set up (onboarding != complete OR bank not verified)
  //   • has a phone number
  //   • created long enough ago
  //   • never been reminded OR last reminder was > INTERVAL_DAYS ago
  const rows = await db
    .select({
      id:               contractors.id,
      storeId:          contractors.storeId,
      name:             contractors.name,
      phone:            contractors.phone,
      onboardingStatus: contractors.onboardingStatus,
      bankVerified:     contractors.bankVerified,
      payoutReminderSentAt: sql<Date | null>`payout_reminder_sent_at`,
    })
    .from(contractors)
    .where(
      and(
        isNotNull(contractors.phone),
        ne(contractors.phone, ""),
        eq(contractors.isActive, true),
        lte(contractors.createdAt, eligibleCutoff),
        or(
          ne(contractors.onboardingStatus, "complete"),
          eq(contractors.bankVerified, false),
        ),
        or(
          sql`payout_reminder_sent_at IS NULL`,
          sql`payout_reminder_sent_at <= ${reminderCutoff.toISOString()}`,
        ),
      )
    );

  if (rows.length === 0) return;

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");

  for (const contractor of rows) {
    try {
      const firstName = contractor.name.split(" ")[0] || contractor.name;
      const payoutsUrl = appUrl ? `${appUrl}/staff-payouts` : "/staff-payouts";

      const isFirstReminder  = !contractor.payoutReminderSentAt;
      const isInProgress     = contractor.onboardingStatus === "in_progress";

      const body = isFirstReminder
        ? `Hi ${firstName}! Your payout account isn't set up yet — you won't receive deposits until it's complete. It only takes a few minutes: ${payoutsUrl}`
        : isInProgress
          ? `Hi ${firstName}, just a reminder: your payout account setup isn't finished. Complete it here to start receiving deposits: ${payoutsUrl}`
          : `Hi ${firstName}, your payout account still needs attention. Please complete your bank setup to receive your earnings: ${payoutsUrl}`;

      const result = await sendSms(
        contractor.storeId,
        contractor.phone!,
        body,
        "payout_reminder",
      );

      if (result.skipped) {
        console.log(`[PayoutReminder] Skipped contractor ${contractor.id} (opted out or no Twilio)`);
        continue;
      }

      if (result.success) {
        // Update the tracking column
        await db.execute(
          sql`UPDATE contractors
              SET payout_reminder_sent_at = NOW()
              WHERE id = ${contractor.id}`
        );
        console.log(`[PayoutReminder] Sent reminder to contractor ${contractor.id} (store ${contractor.storeId})`);
      } else {
        console.warn(`[PayoutReminder] SMS failed for contractor ${contractor.id}: ${result.error}`);
      }
    } catch (err) {
      console.error(`[PayoutReminder] Error processing contractor ${contractor.id}:`, err);
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function startPayoutReminderScheduler(): void {
  ensureColumn()
    .then(() => {
      const tick = () =>
        runReminderTick().catch(e =>
          console.error("[PayoutReminder] Tick error:", e)
        );
      tick(); // first check immediately (will no-op outside send window)
      setInterval(tick, 60 * 60 * 1000); // re-check every hour
      console.log(
        `[PayoutReminder] Scheduler started — delay=${DELAY_DAYS}d, interval=${INTERVAL_DAYS}d, sends 9–12 UTC`
      );
    })
    .catch(err => {
      console.error("[PayoutReminder] Migration failed, scheduler not started:", err);
    });
}

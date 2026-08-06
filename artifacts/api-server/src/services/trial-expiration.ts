import { db } from "../db";
import { users } from "@shared/models/auth";
import { locations } from "@shared/schema";
import { eq, and, lte, isNotNull, inArray, sql } from "drizzle-orm";
import { cache } from "../cache";
import { sendTrialExpiredEmail } from "../lib/systemEmails";
import { emitPlatformEmailEvent } from "./platform-email-engine";
import { broadcastNotification } from "../notifications";

const FREE_TRIAL_DAYS = 60;

/**
 * How long after trial end before the account is suspended.
 * During this window the user retains full access so they can subscribe
 * without losing their data or being locked out of the calendar.
 */
const GRACE_PERIOD_DAYS = 7;

export async function runTrialExpirationCheck(): Promise<{ expired: number; suspended: number; skipped: number }> {
  const now = new Date();
  let expired = 0;
  let suspended = 0;
  let skipped = 0;

  // ── Phase 1: trial just ended → mark as expired, start grace period ────────
  // Account stays Active so the user retains full access for GRACE_PERIOD_DAYS.
  const justExpiredUsers = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, trialEndsAt: users.trialEndsAt })
    .from(users)
    .where(
      and(
        inArray(users.role, ["owner", "admin"]),
        eq(users.subscriptionStatus, "trial"),
        isNotNull(users.trialEndsAt),
        lte(users.trialEndsAt, now),
      )
    );

  for (const user of justExpiredUsers) {
    try {
      const hasActiveSub = await userHasActivePaidSubscription(user.id);
      if (hasActiveSub) { skipped++; continue; }

      // Mark subscription expired — account_status stays Active during grace period.
      await db
        .update(users)
        .set({ subscriptionStatus: "expired" })
        .where(eq(users.id, user.id));

      expired++;
      sendTrialExpiredEmail(user.email, user.firstName ?? null).catch(() => {});
      emitPlatformEmailEvent("trial_expired", user.id, { trialEndsAt: user.trialEndsAt }).catch(() => {});
      console.log(`[TrialExpiration] Trial ended for ${user.email} — ${GRACE_PERIOD_DAYS}-day grace period started`);
    } catch (err) {
      console.error(`[TrialExpiration] Phase 1 failed for user ${user.id}:`, err);
    }
  }

  // ── Phase 2: grace period over → suspend calendar + public booking access ──
  // Suspension is light: the user can still log in, access settings, and
  // export their data. Only calendar pages and the public booking site are
  // blocked (enforced by the server middleware and frontend route guard).
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const gracePeriodExpiredUsers = await db
    .select({ id: users.id, email: users.email, trialEndsAt: users.trialEndsAt })
    .from(users)
    .where(
      and(
        inArray(users.role, ["owner", "admin"]),
        eq(users.subscriptionStatus, "expired"),
        isNotNull(users.trialEndsAt),
        lte(users.trialEndsAt, graceCutoff),
      )
    );

  for (const user of gracePeriodExpiredUsers) {
    try {
      const hasActiveSub = await userHasActivePaidSubscription(user.id);
      if (hasActiveSub) { skipped++; continue; }

      const [store] = await db
        .select({ id: locations.id, accountStatus: locations.accountStatus })
        .from(locations)
        .where(eq(locations.userId, user.id))
        .limit(1);

      if (store && (store.accountStatus ?? "").toLowerCase() !== "suspended") {
        await db
          .update(locations)
          .set({ accountStatus: "Suspended" })
          .where(eq(locations.id, store.id));

        await deactivateLaunchSite(store.id);
        cache.billing.invalidate(store.id);
        emitPlatformEmailEvent("account_suspended", user.id, { source: "trial_grace_expired" }).catch(() => {});
        console.log(`[TrialExpiration] Suspended account for ${user.email} — grace period over`);
        suspended++;
      }
    } catch (err) {
      console.error(`[TrialExpiration] Phase 2 failed for user ${user.id}:`, err);
    }
  }

  if (expired > 0 || suspended > 0) {
    console.log(`[TrialExpiration] ${expired} trials entered grace period, ${suspended} suspended after grace, ${skipped} skipped (paid)`);
  }

  return { expired, suspended, skipped };
}

export async function reactivateExpiredAccount(salonId: number): Promise<void> {
  const [store] = await db
    .select({ id: locations.id, userId: locations.userId, accountStatus: locations.accountStatus })
    .from(locations)
    .where(eq(locations.id, salonId))
    .limit(1);

  if (!store) return;

  await db
    .update(locations)
    .set({ accountStatus: "Active" })
    .where(eq(locations.id, salonId));

  if (store.userId) {
    await db
      .update(users)
      .set({ subscriptionStatus: "active", trialEndsAt: null })
      .where(eq(users.id, store.userId));
    emitPlatformEmailEvent("account_reactivated", store.userId, { source: "trial_reactivation" }).catch(() => {});
  }

  await reactivateLaunchSite(salonId);

  cache.billing.invalidate(salonId);

  // Push a real-time status update so the frontend gate clears immediately
  // without requiring a page reload.
  broadcastNotification({ type: "account_status_changed", storeId: salonId, accountStatus: "active" });

  console.log(`[TrialExpiration] Reactivated account for store ${salonId}`);
}

async function userHasActivePaidSubscription(userId: string): Promise<boolean> {
  try {
    const { storeSubscriptions } = await import("@shared/schema/subscriptions");
    const [store] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.userId, userId))
      .limit(1);

    if (!store) return false;

    const [sub] = await db
      .select({ status: storeSubscriptions.status })
      .from(storeSubscriptions)
      .where(eq(storeSubscriptions.storeId, store.id))
      .limit(1);

    return sub?.status === "active" || sub?.status === "trialing";
  } catch {
    return false;
  }
}

async function deactivateLaunchSite(storeId: number): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE onboarding_submissions
      SET status = 'inactive'
      WHERE id IN (
        SELECT submission_id FROM subdomains
        WHERE submission_id IN (
          SELECT id FROM onboarding_submissions
          WHERE status = 'completed'
        )
      )
      AND id IN (
        SELECT os.id FROM onboarding_submissions os
        JOIN subdomains s ON s.submission_id = os.id
        WHERE os.store_id = ${storeId}
      )
    `);
  } catch {
    try {
      await db.execute(sql`
        UPDATE onboarding_submissions
        SET status = 'inactive'
        WHERE store_id = ${storeId}
        AND status = 'completed'
      `);
    } catch {}
  }
}

async function reactivateLaunchSite(storeId: number): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE onboarding_submissions
      SET status = 'completed'
      WHERE store_id = ${storeId}
      AND status = 'inactive'
    `);
  } catch {}
}

export function startTrialExpirationScheduler(): void {
  const INTERVAL_MS = 60 * 60 * 1000;

  const run = () => {
    runTrialExpirationCheck().catch((err) =>
      console.error("[TrialExpiration] Scheduler error:", err)
    );
  };

  run();
  setInterval(run, INTERVAL_MS);
  console.log("[TrialExpiration] Scheduler started — runs every hour");
}

/**
 * services/subscription-sync.ts — Daily Stripe subscription reconciliation
 *
 * Runs once at startup (with a short delay) and then every 24 hours.
 * For every store that has a stripe_subscription_id, fetches the live
 * subscription status from Stripe and makes sure locations.account_status
 * reflects it — catching any webhooks that were missed, delayed, or failed.
 *
 * Stripe status → account_status mapping:
 *   active / trialing          → Active
 *   past_due / unpaid          → Suspended
 *   incomplete_expired/canceled → Canceled
 */

import { db } from "../db";
import { locations, storeSubscriptions } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { isStripeConfigured, stripe } from "../lib/stripe";
import { broadcastNotification } from "../notifications";

const STRIPE_TO_ACCOUNT: Record<string, string> = {
  active:             "Active",
  trialing:           "Active",
  past_due:           "Suspended",
  unpaid:             "Suspended",
  incomplete_expired: "Canceled",
  canceled:           "Canceled",
};

async function runSubscriptionSync(): Promise<void> {
  if (!isStripeConfigured()) {
    return; // Stripe not set up — nothing to reconcile
  }

  console.log("[sub-sync] Starting subscription reconciliation…");

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Fetch all store subscriptions that have a Stripe subscription ID
    const subs = await db
      .select({
        storeId:              storeSubscriptions.storeId,
        stripeSubscriptionId: storeSubscriptions.stripeSubscriptionId,
        localStatus:          storeSubscriptions.status,
      })
      .from(storeSubscriptions)
      .where(isNotNull(storeSubscriptions.stripeSubscriptionId));

    for (const sub of subs) {
      if (!sub.stripeSubscriptionId || !sub.storeId) continue;

      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const stripeStatus = stripeSub.status;
        const targetAccountStatus = STRIPE_TO_ACCOUNT[stripeStatus];

        if (!targetAccountStatus) {
          skipped++;
          continue;
        }

        // Fetch current account status for this store
        const [loc] = await db
          .select({ accountStatus: (locations as any).accountStatus })
          .from(locations)
          .where(eq(locations.id, sub.storeId))
          .limit(1);

        const currentStatus = String(loc?.accountStatus ?? "").toLowerCase();
        const targetLower   = targetAccountStatus.toLowerCase();

        // Only update if out of sync
        if (currentStatus !== targetLower) {
          await db
            .update(locations)
            .set({ accountStatus: targetAccountStatus } as any)
            .where(eq(locations.id, sub.storeId));

          // Notify connected clients so the frontend gate updates immediately.
          if (sub.storeId) {
            broadcastNotification({
              type: "account_status_changed",
              storeId: sub.storeId,
              accountStatus: targetLower as "active" | "suspended" | "locked" | "canceled",
            });
          }

          console.log(
            `[sub-sync] storeId=${sub.storeId} ${currentStatus || "(unknown)"} → ${targetAccountStatus} (stripe: ${stripeStatus})`
          );
          synced++;
        }

        // Also sync the local subscription status if it drifted
        if (sub.localStatus !== stripeStatus) {
          await db
            .update(storeSubscriptions)
            .set({ status: stripeStatus, updatedAt: new Date() })
            .where(eq(storeSubscriptions.stripeSubscriptionId, sub.stripeSubscriptionId));
        }
      } catch (err: any) {
        // A 404 from Stripe means the subscription was deleted on their side
        if (err?.statusCode === 404 || err?.code === "resource_missing") {
          await db
            .update(locations)
            .set({ accountStatus: "Canceled" } as any)
            .where(eq(locations.id, sub.storeId!));
          console.log(`[sub-sync] storeId=${sub.storeId} sub ${sub.stripeSubscriptionId} not found on Stripe → Canceled`);
          synced++;
        } else {
          console.error(`[sub-sync] Error checking storeId=${sub.storeId}:`, err?.message);
          errors++;
        }
      }
    }

    console.log(
      `[sub-sync] Done — ${synced} updated, ${skipped} skipped (unmapped status), ${errors} errors`
    );
  } catch (err: any) {
    console.error("[sub-sync] Fatal error during reconciliation:", err?.message);
  }
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS  = 30 * 1000; // wait 30s after boot before first run

export function startSubscriptionSyncScheduler(): void {
  // First run: 30 seconds after startup (gives DB and Stripe time to initialize)
  setTimeout(() => {
    runSubscriptionSync();
    // Then run every 24 hours
    setInterval(runSubscriptionSync, TWENTY_FOUR_HOURS);
  }, STARTUP_DELAY_MS);

  console.log("[sub-sync] Scheduler registered — first run in 30s, then every 24h");
}

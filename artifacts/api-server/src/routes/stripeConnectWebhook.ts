/**
 * routes/stripeConnectWebhook.ts — Stripe Connect Webhook Handler
 *
 * Mounted at POST /api/stripe/connect-webhook (raw body, no JSON middleware).
 * Separate from the SaaS billing webhook (routes/stripeWebhook.ts).
 *
 * Handles connected-account events sent by Stripe to your platform:
 *
 *   account.updated
 *     Re-syncs charges_enabled / payouts_enabled / details_submitted
 *     whenever the connected salon's account state changes in Stripe.
 *
 *   account.application.deauthorized
 *     Fired when a salon owner revokes your platform's access directly
 *     from their Stripe dashboard. Marks the record as disconnected so
 *     your app stops trying to charge through a revoked account.
 *
 *   capability.updated
 *     Fired when a specific capability (card_payments, transfers, etc.)
 *     is approved or restricted. Triggers a full re-sync to pick up the
 *     latest charges_enabled / payouts_enabled flags.
 *
 * Requires:
 *   STRIPE_SECRET_KEY              — platform Stripe client
 *   STRIPE_CONNECT_WEBHOOK_SECRET  — signing secret from the Connect
 *                                    webhook endpoint in your Stripe dashboard
 */

import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import { webhookEvents, payoutRunItems } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "../lib/stripe";
import { syncAccountFromStripe } from "../lib/stripeConnect";
import { syncContractorAccountStatus, findContractorByStripeAccount } from "../lib/stripeContractorAccounts";
import type Stripe from "stripe";

const router = Router();

// ─── Idempotency guard ────────────────────────────────────────────────────────

/**
 * Returns true if this event was already processed (duplicate).
 * Otherwise records it and returns false.
 */
async function markEventProcessed(eventId: string, eventType: string): Promise<boolean> {
  try {
    await db.insert(webhookEvents).values({ eventId, eventType }).onConflictDoNothing();
    const [existing] = await db
      .select({ processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, eventId))
      .limit(1);

    if (existing && Date.now() - existing.processedAt.getTime() > 1000) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/** Look up the storeId for a given connected Stripe account ID. */
async function storeByConnectedAccount(accountId: string): Promise<number | null> {
  const { rows } = await pool.query<{ store_id: number }>(
    `SELECT store_id
     FROM store_payment_accounts
     WHERE provider_account_id = $1
       AND provider = 'stripe'
     LIMIT 1`,
    [accountId]
  );
  return rows[0]?.store_id ?? null;
}

/** Mark a connected account as disconnected in our DB. */
async function markAccountDisconnected(accountId: string): Promise<void> {
  await pool.query(
    `UPDATE store_payment_accounts
     SET status     = 'disconnected',
         updated_at = NOW()
     WHERE provider_account_id = $1
       AND provider = 'stripe'`,
    [accountId]
  );
}

// ─── Event handlers ───────────────────────────────────────────────────────────

/** True if the connected account belongs to a contractor (recipient-configured
 *  Custom account) — sync the contractor row and stop. */
async function syncedAsContractor(connectedAccountId: string, tag: string): Promise<boolean> {
  const contractor = await findContractorByStripeAccount(connectedAccountId);
  if (!contractor) return false;
  try {
    const s = await syncContractorAccountStatus(contractor.id);
    console.log(`[connect-webhook/${tag}] contractor ${contractor.id} → ${s?.onboardingStatus} bankVerified=${s?.bankVerified}`);
  } catch (e: any) {
    console.warn(`[connect-webhook/${tag}] contractor sync failed for ${connectedAccountId}:`, e?.message);
  }
  return true;
}

async function handleAccountUpdated(event: Stripe.Event): Promise<void> {
  const connectedAccountId = event.account;
  if (!connectedAccountId) return;

  if (await syncedAsContractor(connectedAccountId, "account.updated")) return;

  const storeId = await storeByConnectedAccount(connectedAccountId);
  if (!storeId) {
    console.log(`[connect-webhook/account.updated] No store/contractor for account ${connectedAccountId} — skipping`);
    return;
  }

  await syncAccountFromStripe(storeId, connectedAccountId);
  console.log(`[connect-webhook/account.updated] Synced account ${connectedAccountId} → storeId=${storeId}`);
}

async function handleCapabilityUpdated(event: Stripe.Event): Promise<void> {
  const connectedAccountId = event.account;
  if (!connectedAccountId) return;

  const capability = event.data.object as Stripe.Capability;

  if (await syncedAsContractor(connectedAccountId, "capability.updated")) return;

  const storeId = await storeByConnectedAccount(connectedAccountId);
  if (!storeId) {
    console.log(`[connect-webhook/capability.updated] No store/contractor for account ${connectedAccountId} — skipping`);
    return;
  }

  // Re-sync the full account to pick up updated charges_enabled / payouts_enabled
  await syncAccountFromStripe(storeId, connectedAccountId);
  console.log(
    `[connect-webhook/capability.updated] capability=${capability.id} status=${capability.status} ` +
    `→ synced account ${connectedAccountId} storeId=${storeId}`
  );
}

/** transfer.failed / transfer.reversed → flip the matching payout run item to failed. */
async function handleTransferProblem(event: Stripe.Event): Promise<void> {
  const transfer = event.data.object as Stripe.Transfer;
  const reason = event.type === "transfer.reversed" ? "Transfer reversed by Stripe" : "Transfer failed at Stripe";
  const [item] = await db.select().from(payoutRunItems).where(eq(payoutRunItems.stripeTransferId, transfer.id));
  if (!item) {
    console.log(`[connect-webhook/${event.type}] no payout_run_item for transfer ${transfer.id}`);
    return;
  }
  await db.update(payoutRunItems)
    .set({ status: "failed", failureReason: reason })
    .where(eq(payoutRunItems.id, item.id));
  console.log(`[connect-webhook/${event.type}] payout_run_item ${item.id} → failed (${transfer.id})`);
}

async function handleApplicationDeauthorized(event: Stripe.Event): Promise<void> {
  const connectedAccountId = event.account;
  if (!connectedAccountId) {
    console.warn("[connect-webhook/deauthorized] Event missing account ID");
    return;
  }

  await markAccountDisconnected(connectedAccountId);
  console.log(
    `[connect-webhook/account.application.deauthorized] Account ${connectedAccountId} ` +
    `revoked platform access — marked disconnected`
  );
}

// ─── Webhook endpoint ─────────────────────────────────────────────────────────

// Use router.use (not router.post) because app.post() in index.ts does NOT
// strip the path prefix before delegating here — unlike app.use(). The method
// and path are already guarded at the app.post("/api/stripe/connect-webhook")
// level, so a plain use() handler matches regardless of the full req.url.
router.use(async (req: any, res: Response) => {
  const sig    = req.headers["stripe-signature"] as string | undefined;
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!secret) {
    // If no secret is configured, log a warning and acknowledge so Stripe
    // doesn't keep retrying — the signature can't be verified without it.
    console.warn(
      "[connect-webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not set — " +
      "skipping signature verification. Set this secret to enable it."
    );
    return res.json({ received: true });
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.isBuffer((req as any).rawBody)
      ? (req as any).rawBody
      : Buffer.from(JSON.stringify(req.body));

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig as string, secret);
  } catch (err: any) {
    console.error("[connect-webhook] Signature verification failed:", err?.message);
    return res.status(400).json({ error: `Webhook Error: ${err?.message}` });
  }

  // Idempotency — skip if already processed
  const alreadyProcessed = await markEventProcessed(event.id, event.type);
  if (alreadyProcessed) {
    console.log(`[connect-webhook] Duplicate event skipped: ${event.id} (${event.type})`);
    return res.json({ received: true, duplicate: true });
  }

  console.log(
    `[connect-webhook] Processing ${event.type} (${event.id}) ` +
    `on account ${event.account ?? "platform"}`
  );

  try {
    switch (event.type) {
      case "account.updated":
        await handleAccountUpdated(event);
        break;

      case "capability.updated":
        await handleCapabilityUpdated(event);
        break;

      case "account.application.deauthorized":
        await handleApplicationDeauthorized(event);
        break;

      case "transfer.reversed":
        await handleTransferProblem(event);
        break;

      default:
        // `transfer.failed` isn't in every API version's typed union — catch it here.
        if ((event.type as string) === "transfer.failed") {
          await handleTransferProblem(event);
          break;
        }
        // Log but don't error on unhandled events — Stripe sends many
        console.log(`[connect-webhook] Unhandled event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error(`[connect-webhook] Error processing ${event.type}:`, err?.message);
    // Return 500 so Stripe retries the event
    return res.status(500).json({ error: "Webhook handler failed" });
  }
});

export default router;

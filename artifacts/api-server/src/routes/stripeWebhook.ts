/**
 * routes/stripeWebhook.ts — Stripe Webhook Handler
 *
 * Mounted at POST /api/stripe/webhook (raw body, no JSON middleware).
 *
 * Handles:
 *   Subscription events:
 *     customer.subscription.created
 *     customer.subscription.updated
 *     customer.subscription.deleted
 *
 *   Payment events:
 *     checkout.session.completed
 *     payment_intent.succeeded
 *     payment_intent.payment_failed
 *
 *   Invoice events:
 *     invoice.paid
 *     invoice.payment_failed
 */

import { Router } from "express";
import { db, pool } from "../db";
import {
  locations,
  storeSubscriptions as storeSubscriptionsTable,
  subscriptionPlans,
  storeInvoices,
  walletTransactions,
  platformCreditTransactions,
  webhookEvents,
} from "@shared/schema";

/** Fire-and-forget: log a billing/subscription event to store_activity_events. */
function logBillingEvent(storeId: number, eventType: string, message: string, metadata?: Record<string, unknown>): void {
  void pool.query(
    `INSERT INTO store_activity_events (store_id, event_type, message, metadata) VALUES ($1,$2,$3,$4)`,
    [storeId, eventType, message, metadata ? JSON.stringify(metadata) : null]
  ).catch((e: any) => console.error("[billingEvent]", eventType, e?.message));
}
import { eq, and, inArray } from "drizzle-orm";
import { stripe } from "../lib/stripe";
import { sendSubscriptionCancellationEmail, sendSubscriptionEndedEmail } from "../lib/systemEmails";
import { emitPlatformEmailEvent } from "../services/platform-email-engine";
import type Stripe from "stripe";
import { broadcastNotification } from "../notifications";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Look up a store by its Stripe Customer ID. */
async function storeByCustomer(customerId: string): Promise<number | null> {
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq((locations as any).stripeCustomerId, customerId))
    .limit(1);

  if (row) return row.id;

  // Fallback: check storeSubscriptions.stripeCustomerId
  const [sub] = await db
    .select({ storeId: storeSubscriptionsTable.storeId })
    .from(storeSubscriptionsTable)
    .where(eq(storeSubscriptionsTable.stripeCustomerId, customerId))
    .limit(1);

  return sub?.storeId ?? null;
}

/** Resolve a plan from its Stripe price ID. */
async function planByPriceId(priceId: string): Promise<{ id: number; code: string; name: string } | null> {
  const rows = await db.select({ id: subscriptionPlans.id, code: subscriptionPlans.code, name: subscriptionPlans.name }).from(subscriptionPlans);
  const match = rows.find(
    (p) => (p as any).stripePriceIdMonthly === priceId || (p as any).stripePriceIdYearly === priceId
  );
  return match ?? null;
}

/**
 * Idempotency guard — returns true if the event was already processed,
 * otherwise inserts it and returns false.
 */
async function markEventProcessed(eventId: string, eventType: string): Promise<boolean> {
  try {
    await db.insert(webhookEvents).values({ eventId, eventType }).onConflictDoNothing();
    // If onConflictDoNothing didn't insert, we already processed it
    const [existing] = await db
      .select({ processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, eventId))
      .limit(1);

    // If processed more than 1 second ago, it's a duplicate
    if (existing && Date.now() - existing.processedAt.getTime() > 1000) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Webhook endpoint ────────────────────────────────────────────────────────

router.post(
  "/",
  // Raw body is required for signature verification — applied in index.ts
  async (req: any, res) => {
    const sig = req.headers["stripe-signature"];
    const configuredSecrets = [
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.STRIPE_TEST_WEBHOOK_SECRET,
      ...(process.env.STRIPE_WEBHOOK_SECRETS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ].filter((s): s is string => Boolean(s));

    if (configuredSecrets.length === 0) {
      console.error(
        "[stripe/webhook] No webhook secret configured. Set STRIPE_WEBHOOK_SECRET (and optionally STRIPE_TEST_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRETS)."
      );
      // Return 400, not 500 — a 5xx causes Stripe to mark the endpoint as
      // "unreachable" and disables the webhook. 400 signals the endpoint is
      // live but the request cannot be processed (misconfiguration on our end).
      return res.status(400).json({ error: "Webhook secret not configured" });
    }

    // req.body is a raw Buffer when using express.raw() middleware.
    // If global JSON parsing already ran, preserve the original raw body from req.rawBody.
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.isBuffer((req as any).rawBody)
        ? (req as any).rawBody
        : Buffer.from(JSON.stringify(req.body));
    let event: Stripe.Event;

    try {
      let lastErr: any;
      let verified: Stripe.Event | null = null;

      for (const secret of configuredSecrets) {
        try {
          verified = stripe.webhooks.constructEvent(rawBody, sig as string, secret);
          break;
        } catch (err: any) {
          lastErr = err;
        }
      }

      if (!verified) {
        throw lastErr ?? new Error("Unable to verify Stripe signature");
      }

      event = verified;
    } catch (err: any) {
      console.error(
        "[stripe/webhook] Signature verification failed:",
        err.message,
        `| configured secrets: ${configuredSecrets.length}`
      );
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Idempotency check
    const alreadyProcessed = await markEventProcessed(event.id, event.type);
    if (alreadyProcessed) {
      console.log(`[stripe/webhook] Duplicate event skipped: ${event.id} (${event.type})`);
      return res.json({ received: true, duplicate: true });
    }

    console.log(`[stripe/webhook] Processing event: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        // ── Subscription events ───────────────────────────────────────────
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          await handleSubscriptionUpsert(sub);
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(sub);
          break;
        }

        // ── Checkout session completed ────────────────────────────────────
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutCompleted(session);
          break;
        }

        // ── Payment intent ────────────────────────────────────────────────
        case "payment_intent.succeeded": {
          const pi = event.data.object as Stripe.PaymentIntent;
          await handlePaymentIntentSucceeded(pi);
          break;
        }

        case "payment_intent.payment_failed": {
          const pi = event.data.object as Stripe.PaymentIntent;
          await handlePaymentIntentFailed(pi);
          break;
        }

        // ── Invoice events ────────────────────────────────────────────────
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaid(invoice);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaymentFailed(invoice);
          break;
        }

        default:
          console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
      }

      return res.json({ received: true });
    } catch (err: any) {
      console.error(`[stripe/webhook] Error processing ${event.type}:`, err?.message);
      return res.status(500).json({ error: "Webhook handler failed" });
    }
  }
);

// ─── Event Handlers ───────────────────────────────────────────────────────────

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const storeId = await storeByCustomer(customerId);
  if (!storeId) {
    console.warn("[webhook/sub-upsert] No store found for customer:", customerId);
    return;
  }

  const [storeOwner] = await db
    .select({ userId: locations.userId, accountStatus: locations.accountStatus })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);
  const previousAccountStatus = String(storeOwner?.accountStatus || "").toLowerCase();
  const priceId = sub.items.data[0]?.price?.id;
  const plan    = priceId ? await planByPriceId(priceId) : null;
  if (!plan) {
    console.warn("[webhook/sub-upsert] No plan found for price:", priceId);
    return;
  }

  const anySub = sub as any;
  const periodStart = new Date((anySub.current_period_start ?? anySub.billing_cycle_anchor ?? 0) * 1000);
  const periodEnd   = new Date((anySub.current_period_end   ?? 0) * 1000);
  const canceledAt  = anySub.canceled_at ? new Date(anySub.canceled_at * 1000) : null;

  // Cancel any existing active subscriptions for this store
  await db
    .update(storeSubscriptionsTable)
    .set({ status: "canceled", canceledAt: canceledAt ?? new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(storeSubscriptionsTable.storeId, storeId),
        inArray(storeSubscriptionsTable.status, ["active", "trialing", "past_due"])
      )
    );

  // Upsert by Stripe subscription ID
  const existing = await db
    .select({ id: storeSubscriptionsTable.id, cancelAtPeriodEnd: storeSubscriptionsTable.cancelAtPeriodEnd })
    .from(storeSubscriptionsTable)
    .where(eq(storeSubscriptionsTable.stripeSubscriptionId, sub.id))
    .limit(1);

  const newCancelAtPeriodEnd = anySub.cancel_at_period_end === true;

  const rowData = {
    storeId,
    planId:               plan.id,
    status:               sub.status,
    currentPeriodStart:   periodStart,
    currentPeriodEnd:     periodEnd,
    canceledAt:           canceledAt,
    cancelAtPeriodEnd:    newCancelAtPeriodEnd,
    stripeSubscriptionId: sub.id,
    stripeCustomerId:     customerId,
    updatedAt:            new Date(),
  };

  if (existing[0]) {
    await db
      .update(storeSubscriptionsTable)
      .set(rowData)
      .where(eq(storeSubscriptionsTable.id, existing[0].id));
  } else {
    await db.insert(storeSubscriptionsTable).values({ ...rowData, createdAt: new Date() } as any);
  }

  // Save Stripe Customer ID on the store (locations) record
  await db
    .update(locations)
    .set({ stripeCustomerId: customerId } as any)
    .where(eq(locations.id, storeId));

  // Sync accountStatus based on subscription status
  const stripeStatusToAccountStatus: Record<string, string> = {
    active:              "Active",
    trialing:            "Active",
    past_due:            "Suspended",
    unpaid:              "Suspended",
    incomplete_expired:  "Canceled",
    canceled:            "Canceled",
  };
  const newAccountStatus = stripeStatusToAccountStatus[sub.status];
  if (newAccountStatus) {
    await db
      .update(locations)
      .set({ accountStatus: newAccountStatus } as any)
      .where(eq(locations.id, storeId));
    // Notify connected clients so the frontend gate updates immediately.
    broadcastNotification({
      type: "account_status_changed",
      storeId,
      accountStatus: newAccountStatus.toLowerCase() as "active" | "suspended" | "locked" | "canceled",
    });
    console.log(`[webhook] storeId=${storeId} accountStatus → ${newAccountStatus} (stripe: ${sub.status})`);
    if (storeOwner?.userId && sub.status === "active") {
      const eventName = ["suspended", "canceled", "inactive"].includes(previousAccountStatus)
        ? "account_reactivated"
        : "subscription_started";
      emitPlatformEmailEvent(eventName, storeOwner.userId, { source: "stripe", subscriptionStatus: sub.status }).catch(() => {});
    }
  }

  // Send cancellation confirmation email when cancel_at_period_end flips to true
  if (newCancelAtPeriodEnd && !existing[0]?.cancelAtPeriodEnd) {
    sendSubscriptionCancellationEmail(storeId, plan.name, periodEnd)
      .catch((e) => console.warn("[webhook] cancellation email failed:", e?.message));
  }

  // Log subscription change event to activity feed
  if (newAccountStatus) {
    const evtType = newCancelAtPeriodEnd ? "subscription_cancelled"
      : sub.status === "active" ? (existing[0] ? "subscription_upgraded" : "subscription_reactivated")
      : sub.status === "past_due" || sub.status === "unpaid" ? "payment_failed"
      : sub.status === "canceled" ? "subscription_cancelled"
      : "subscription_upgraded";
    logBillingEvent(storeId, evtType,
      `Subscription ${sub.status}${plan?.name ? ` — ${plan.name}` : ""}`,
      { planCode: plan?.code, planName: plan?.name, stripeStatus: sub.status, cancelAtPeriodEnd: newCancelAtPeriodEnd }
    );
  }
  console.log(`[webhook] Subscription ${sub.id} upserted → storeId=${storeId} plan=${plan.code} status=${sub.status} cancelAtPeriodEnd=${newCancelAtPeriodEnd}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const storeId    = await storeByCustomer(customerId);
  if (!storeId) return;
  const [storeOwner] = await db
    .select({ userId: locations.userId })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  // Look up plan name before marking canceled (planId won't change)
  const [subRow] = await db
    .select({ planId: storeSubscriptionsTable.planId })
    .from(storeSubscriptionsTable)
    .where(eq(storeSubscriptionsTable.stripeSubscriptionId, sub.id))
    .limit(1);

  let planName = "Certxa";
  if (subRow?.planId) {
    const [plan] = await db
      .select({ name: subscriptionPlans.name })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, subRow.planId))
      .limit(1);
    if (plan?.name) planName = plan.name;
  }

  await db
    .update(storeSubscriptionsTable)
    .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(storeSubscriptionsTable.stripeSubscriptionId, sub.id));

  // Cascade: mark the store as Canceled so AccountStatusGate blocks access
  await db
    .update(locations)
    .set({ accountStatus: "Canceled" } as any)
    .where(eq(locations.id, storeId));
  broadcastNotification({ type: "account_status_changed", storeId, accountStatus: "canceled" });

  const anySub = sub as any;
  const endedAt = new Date((anySub.current_period_end ?? anySub.ended_at ?? Date.now() / 1000) * 1000);

  sendSubscriptionEndedEmail(storeId, planName, endedAt)
    .catch((e) => console.warn("[webhook] subscription ended email failed:", e?.message));
  if (storeOwner?.userId) {
    emitPlatformEmailEvent("account_suspended", storeOwner.userId, { source: "stripe", reason: "subscription_deleted" }).catch(() => {});
  }

  logBillingEvent(storeId, "subscription_cancelled", `Subscription cancelled — ${planName}`,
    { planName, reason: "subscription_deleted" });
  console.log(`[webhook] Subscription ${sub.id} deleted → storeId=${storeId} plan=${planName}`);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {};
  const type = meta.type;

  if (type === "sms_topup") {
    // Credit SMS tokens to the store
    const storeId = Number(meta.storeId);
    const credits  = Number(meta.credits ?? 0);
    if (!storeId || !credits) return;

    await pool.query(
      `UPDATE locations
       SET sms_credits = sms_credits + $1,
           sms_credits_total_purchased = sms_credits_total_purchased + $1
       WHERE id = $2`,
      [credits, storeId]
    );
    logBillingEvent(storeId, "sms_credits_purchased",
      `SMS credits purchased — ${credits} credits`, { credits });
    console.log(`[webhook/checkout] SMS top-up: ${credits} credits → storeId=${storeId}`);
    return;
  }

  if (type === "wallet_deposit") {
    const storeId     = Number(meta.storeId);
    const amountCents = Number(meta.amountCents ?? 0);
    const piId        = typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as any)?.id ?? null;

    if (!storeId || !amountCents) return;

    const amountDollars = (amountCents / 100).toFixed(2);

    // Mark or insert the wallet transaction as completed
    if (piId) {
      const updated = await db
        .update(walletTransactions)
        .set({ status: "completed", stripePaymentIntent: piId })
        .where(
          and(
            eq(walletTransactions.storeId, storeId),
            eq(walletTransactions.status, "pending"),
            eq(walletTransactions.stripePaymentIntent, piId)
          )
        )
        .returning({ id: walletTransactions.id });

      if (!updated.length) {
        await db.insert(walletTransactions).values({
          storeId,
          stripePaymentIntent: piId,
          amount:          amountCents,
          transactionType: "deposit",
          status:          "completed",
          description:     `Wallet top-up $${amountDollars}`,
        });
      }
    }

    // Credit platformCredits on the store and record ledger entry
    const creditResult = await pool.query<{ platform_credits: string }>(
      `UPDATE locations
       SET platform_credits = COALESCE(platform_credits, 0) + $1
       WHERE id = $2
       RETURNING platform_credits`,
      [amountDollars, storeId]
    );
    const balanceAfter = creditResult.rows?.[0]?.platform_credits ?? amountDollars;

    await db.insert(platformCreditTransactions).values({
      storeId,
      type:        "deposit",
      amount:      amountDollars,
      description: `Wallet top-up via Stripe`,
      balanceAfter: String(balanceAfter),
      referenceId:  piId ?? session.id,
    } as any);

    console.log(`[webhook/checkout] Wallet deposit: $${amountDollars} → storeId=${storeId} balance now $${balanceAfter}`);
    return;
  }

  if (type === "auto_refill_pm_setup") {
    // Save the setup intent's payment method as the customer's Stripe default
    const setupIntentId =
      typeof session.setup_intent === "string"
        ? session.setup_intent
        : (session.setup_intent as any)?.id ?? null;

    if (!setupIntentId) return;

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const pmId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : (setupIntent.payment_method as any)?.id ?? null;

    if (!pmId) return;

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer as any)?.id ?? null;

    if (customerId) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: pmId },
      });
      const storeId = Number(session.metadata?.storeId ?? 0);
      console.log(`[webhook/checkout] Auto-refill PM saved: pm=${pmId} storeId=${storeId} customer=${customerId}`);
    }
    return;
  }

  // For subscription checkouts, the subscription events handle everything
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  // Mark any matching pending wallet transaction as completed
  if (!pi.id) return;
  await db
    .update(walletTransactions)
    .set({ status: "completed", stripePaymentIntent: pi.id })
    .where(
      and(
        eq(walletTransactions.stripePaymentIntent, pi.id),
        eq(walletTransactions.status, "pending")
      )
    );
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  if (!pi.id) return;
  await db
    .update(walletTransactions)
    .set({ status: "failed" })
    .where(
      and(
        eq(walletTransactions.stripePaymentIntent, pi.id),
        eq(walletTransactions.status, "pending")
      )
    );
  console.warn(`[webhook] PaymentIntent ${pi.id} failed — wallet transaction marked failed`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
  if (!customerId) return;
  const storeId = await storeByCustomer(customerId);
  if (!storeId) return;

  // Upsert the invoice record
  const invoiceId = invoice.id;
  if (!invoiceId) return;

  try {
    await pool.query(
      `INSERT INTO store_invoices (store_id, stripe_invoice_id, invoice_number, status, paid, total_cents, amount_paid_cents, hosted_invoice_url, invoice_pdf_url, billing_reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (stripe_invoice_id) DO UPDATE SET
         paid = EXCLUDED.paid,
         status = EXCLUDED.status,
         amount_paid_cents = EXCLUDED.amount_paid_cents`,
      [
        storeId,
        invoiceId,
        invoice.number ?? null,
        invoice.status ?? "paid",
        true,
        invoice.total ?? 0,
        invoice.amount_paid ?? 0,
        invoice.hosted_invoice_url ?? null,
        invoice.invoice_pdf ?? null,
        invoice.billing_reason ?? null,
        new Date(),
      ]
    );
    logBillingEvent(storeId, "payment_succeeded",
      `Invoice paid — $${((invoice.amount_paid ?? 0) / 100).toFixed(2)}`,
      { invoiceId, amountPaid: invoice.amount_paid, billingReason: invoice.billing_reason }
    );
    console.log(`[webhook] Invoice ${invoiceId} paid → storeId=${storeId}`);
  } catch (err: any) {
    console.error("[webhook/invoice.paid] DB error:", err?.message);
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
  if (!customerId) return;
  const storeId = await storeByCustomer(customerId);
  if (!storeId) return;
  const [storeOwner] = await db
    .select({ userId: locations.userId })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  // Update store subscription to past_due
  await db
    .update(storeSubscriptionsTable)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(
      and(
        eq(storeSubscriptionsTable.storeId, storeId),
        inArray(storeSubscriptionsTable.status, ["active", "trialing"])
      )
    );

  // Suspend the account so launchsite/booking is immediately blocked
  await db
    .update(locations)
    .set({ accountStatus: "Suspended" } as any)
    .where(eq(locations.id, storeId));
  console.log(`[webhook/invoice.payment_failed] storeId=${storeId} accountStatus → Suspended`);
  if (storeOwner?.userId) {
    emitPlatformEmailEvent("payment_failed", storeOwner.userId, { source: "stripe", invoiceId: invoice.id });
    emitPlatformEmailEvent("account_suspended", storeOwner.userId, { source: "stripe", reason: "payment_failed" }).catch(() => {});
  }

  // Upsert the invoice record as unpaid
  const invoiceId = invoice.id;
  if (!invoiceId) return;

  try {
    await pool.query(
      `INSERT INTO store_invoices (store_id, stripe_invoice_id, invoice_number, status, paid, total_cents, amount_paid_cents, hosted_invoice_url, invoice_pdf_url, billing_reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (stripe_invoice_id) DO UPDATE SET
         status = EXCLUDED.status,
         paid = false`,
      [
        storeId,
        invoiceId,
        invoice.number ?? null,
        invoice.status ?? "open",
        false,
        invoice.total ?? 0,
        invoice.amount_paid ?? 0,
        invoice.hosted_invoice_url ?? null,
        invoice.invoice_pdf ?? null,
        invoice.billing_reason ?? null,
        new Date(),
      ]
    );
    logBillingEvent(storeId, "payment_failed",
      `Invoice payment failed — $${((invoice.total ?? 0) / 100).toFixed(2)}`,
      { invoiceId, total: invoice.total, billingReason: invoice.billing_reason }
    );
    console.warn(`[webhook] Invoice ${invoiceId} payment failed → storeId=${storeId} set to past_due`);
  } catch (err: any) {
    console.error("[webhook/invoice.payment_failed] DB error:", err?.message);
  }
}

export default router;

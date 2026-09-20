/**
 * routes/subscription.ts — Owner-facing subscription management
 *
 * Mounted at /api/subscription (with isAuthenticated applied in routes.ts)
 *
 * GET  /api/subscription/usage           — current period usage for 4 countable limits
 * POST /api/subscription/subscribe       — subscribe own store to a plan
 *                                          → embedded Stripe Elements (Payment/Setup) when configured + plan has a price
 *                                          → direct DB write fallback (free plans or Stripe not configured)
 * POST /api/subscription/finalize-setup  — completes a trial subscribe after the owner
 *                                          confirms a SetupIntent client-side (see below)
 *
 * ── Embedded checkout, not hosted Checkout ─────────────────────────────────
 * Paid plans used to redirect to a Stripe-hosted Checkout Session. They now
 * mount a Stripe Payment Element right on this page, branded to match Certxa,
 * mirroring the pattern used for marketplace deal checkout.
 *
 * /subscribe never creates the Subscription directly — it only creates a
 * SetupIntent scoped to the store's Stripe customer (usage: "off_session") to
 * collect and verify a card. This is deliberate even when a trial applies and
 * nothing is due today: creating the Subscription up front, before a card is
 * confirmed, would let Stripe put it straight into "trialing" — which our
 * webhook maps to an unlocked account — without ever collecting a card. It
 * also sidesteps relying on an invoice-linked PaymentIntent being available
 * synchronously at Subscription-creation time, which isn't guaranteed.
 *
 * /finalize-setup does the actual work, *after* the client confirms that
 * SetupIntent: verifies it succeeded (re-fetched from Stripe, not trusted
 * from the client beyond its id), attaches the resulting card as the
 * customer's default payment method, then creates the Subscription with
 * payment_behavior "error_if_incomplete" — trial_period_days if a trial
 * applies (nothing charged, starts "trialing" immediately), otherwise Stripe
 * attempts the first charge against the now-verified card synchronously and
 * throws a clean, catchable error if it's declined, rather than leaving a
 * dangling "incomplete" subscription.
 *
 * Either way, fulfillment (writing storeSubscriptions, unlocking the
 * account) happens off the customer.subscription.created webhook — never off
 * the client's report of success — same principle as deal checkout's
 * payment_intent.succeeded-driven fulfillment.
 */

import { Router } from "express";
import { db } from "../db";
import { storeSubscriptions, subscriptionPlans, staff, locations, storeInvoices } from "@shared/schema";
import { eq, and, count, inArray, sql, desc } from "drizzle-orm";
import { isStripeConfigured, stripe } from "../lib/stripe";
import { TrialService } from "../services/trial-service";
import { resolveFeature, resolveStorePlan } from "../lib/featureAccess";
import { sendSubscriptionReactivatedEmail } from "../lib/systemEmails";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSessionUserId(req: any): string | null {
  return req.session?.userId ?? req.auth?.userId ?? null;
}

async function getOwnedStoreId(req: any): Promise<number | null> {
  const sessionStoreId = Number(req.session?.storeId);
  if (sessionStoreId > 0) return sessionStoreId;

  const userId = getSessionUserId(req);
  if (!userId) return null;

  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.userId, userId))
    .limit(1);
  return loc?.id ?? null;
}

// Carry over any remaining trial days so the card isn't charged until the
// trial actually expires. If no trial exists yet, grant the full default
// trial on first-ever checkout. Shared by /subscribe (to size the SetupIntent
// request) and /finalize-setup (to size the actual Subscription) so both
// stay in lockstep.
async function computeTrialPeriodDays(req: any, storeId: number): Promise<number | undefined> {
  const [existingTrial] = await db
    .select({ currentPeriodEnd: storeSubscriptions.currentPeriodEnd, status: storeSubscriptions.status })
    .from(storeSubscriptions)
    .where(
      and(
        eq(storeSubscriptions.storeId, storeId),
        inArray(storeSubscriptions.status, ["trialing"])
      )
    )
    .orderBy(sql`${storeSubscriptions.id} DESC`)
    .limit(1);

  if (existingTrial?.currentPeriodEnd) {
    const msLeft = new Date(existingTrial.currentPeriodEnd as any).getTime() - Date.now();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    return daysLeft > 0 ? daysLeft : undefined;
  }

  // A store that already has a live PAID subscription is switching plans, not starting out —
  // it must never be handed a fresh free trial (which would defer the first charge for the full
  // trial length on every plan change). Free-plan rows don't count: upgrading from free is a
  // first paid checkout.
  const [payingSub] = await db
    .select({ id: storeSubscriptions.id })
    .from(storeSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, storeSubscriptions.planId))
    .where(
      and(
        eq(storeSubscriptions.storeId, storeId),
        inArray(storeSubscriptions.status, ["active", "past_due", "unpaid"]),
        sql`(COALESCE(${subscriptionPlans.priceMonthly}, 0) > 0 OR COALESCE(${subscriptionPlans.priceYearly}, 0) > 0)`,
      )
    )
    .limit(1);
  if (payingSub) return undefined;

  // First-ever checkout — check if the user's account is still in trial
  const userId: string | null = req.session?.userId ?? req.auth?.userId ?? null;
  if (userId) return TrialService.getFreeTrialDays();
  return undefined;
}

// ─── GET /api/subscription/usage ─────────────────────────────────────────────
//
// Returns current-period consumption for the 4 countable plan limits.
// Each metric includes: id, label, used, limit (null = unlimited), remaining, enabled.

router.get("/usage", async (req: any, res) => {
  try {
    const storeId = await getOwnedStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const plan = await resolveStorePlan(storeId);

    // ── Staff count ────────────────────────────────────────────────────────
    const [staffRow] = await db
      .select({ value: count() })
      .from(staff)
      .where(eq(staff.storeId, storeId));
    const staffCount = Number(staffRow?.value ?? 0);
    const staffAccess = await resolveFeature(storeId, "staff");

    // ── SMS credits (monthly counter tracked in feature_usage) ─────────────
    const smsAccess = await resolveFeature(storeId, "sms_credits");

    // ── Location / calendar count ──────────────────────────────────────────
    const userId = getSessionUserId(req);
    let locationCount = 1;
    if (userId) {
      const [locRow] = await db
        .select({ value: count() })
        .from(locations)
        .where(eq(locations.userId, userId));
      locationCount = Number(locRow?.value ?? 1);
    }
    const locAccess = await resolveFeature(storeId, "locations");

    // ── Website builder count ──────────────────────────────────────────────
    let websiteCount = 0;
    try {
      const { db: wsDb, websitesTable } = await import("@workspace/db");
      const { count: wsCount, eq: wsEq } = await import("drizzle-orm");
      const [wsRow] = await wsDb
        .select({ value: wsCount() })
        .from(websitesTable)
        .where(wsEq(websitesTable.storeid, String(storeId)));
      websiteCount = Number(wsRow?.value ?? 0);
    } catch {
      // website builder unavailable — silently skip
    }
    const websiteAccess = await resolveFeature(storeId, "website_builder");

    return res.json({
      planCode: plan?.planCode ?? "free",
      metrics: [
        {
          id: "staff",
          label: "Staff Members",
          used: staffCount,
          limit: staffAccess.limit,
          remaining: staffAccess.limit !== null ? Math.max(0, staffAccess.limit - staffCount) : null,
          enabled: staffAccess.enabled,
        },
        {
          id: "sms_credits",
          label: "SMS Credits",
          used: smsAccess.used,
          limit: smsAccess.limit,
          remaining: smsAccess.remaining,
          enabled: smsAccess.enabled,
        },
        {
          id: "locations",
          label: "Locations / Calendars",
          used: locationCount,
          limit: locAccess.limit,
          remaining: locAccess.limit !== null ? Math.max(0, locAccess.limit - locationCount) : null,
          enabled: locAccess.enabled,
        },
        {
          id: "website_builder",
          label: "Websites",
          used: websiteCount,
          limit: websiteAccess.limit,
          remaining: websiteAccess.limit !== null ? Math.max(0, websiteAccess.limit - websiteCount) : null,
          enabled: websiteAccess.enabled,
        },
      ],
    });
  } catch (err) {
    console.error("[subscription/usage] error:", err);
    return res.status(500).json({ error: "Failed to load usage" });
  }
});

// ─── POST /api/subscription/subscribe ────────────────────────────────────────
//
// Subscribes the owner's store to a plan.
//   - Stripe configured + paid plan → returns { checkoutUrl } for Stripe Checkout
//   - Free plan or Stripe not configured → direct DB write (sets plan immediately)

router.post("/subscribe", async (req: any, res) => {
  try {
    const storeId = await getOwnedStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const { planId, interval = "month" } = req.body;
    if (!planId || typeof planId !== "number") {
      return res.status(400).json({ error: "planId (number) is required" });
    }

    // Owners may only subscribe to plans that are active AND public.
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.id, planId),
          eq(subscriptionPlans.isActive, true),
          eq(subscriptionPlans.isPublic, true)
        )
      )
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: "Plan not found or not available" });
    }

    // ── Stripe Checkout for paid plans ─────────────────────────────────────
    const priceId = interval === "year"
      ? plan.stripePriceIdYearly
      : plan.stripePriceIdMonthly;

    const isPaidPlan = (plan.priceMonthly ?? 0) > 0 || (plan.priceYearly ?? 0) > 0;

    // Guard: paid plan without a Stripe price ID → surface a clear config error
    // rather than silently falling through to the free-plan DB write path.
    if (isPaidPlan && !priceId) {
      return res.status(400).json({
        error: "This plan has not been configured for Stripe checkout yet. Please contact support.",
      });
    }

    if (isPaidPlan && isStripeConfigured() && priceId) {
      const [store] = await db
        .select()
        .from(locations)
        .where(eq(locations.id, storeId))
        .limit(1);

      if (!store) return res.status(404).json({ error: "Store not found" });

      // Lazily create or reuse Stripe customer
      let customerId: string = store.stripeCustomerId ?? "";
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: store.name ?? undefined,
          email: store.email ?? undefined,
          metadata: { storeId: String(storeId) },
        });
        await db
          .update(locations)
          .set({ stripeCustomerId: customer.id })
          .where(eq(locations.id, storeId));
        customerId = customer.id;
      }

      const trialPeriodDays = await computeTrialPeriodDays(req, storeId);
      const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? null;
      const metadata = {
        storeId: String(storeId),
        planCode: (plan as any).code ?? "",
        planId: String(plan.id),
        interval,
      };

      // Collect + verify a card via a customer-scoped SetupIntent before any
      // Subscription (and therefore any money or trial entitlement) exists —
      // whether or not a trial applies. This sidesteps needing an
      // invoice-linked PaymentIntent at all (whose availability at creation
      // time is unreliable), and, for the trial case specifically, avoids
      // Stripe putting a brand-new Subscription straight into "trialing"
      // (unlocked, per the webhook) before a card has ever been confirmed.
      // /finalize-setup creates the real Subscription once this succeeds.
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: { ...metadata, trialPeriodDays: String(trialPeriodDays ?? 0) },
      });

      return res.json({
        requiresPayment: true,
        clientSecret: setupIntent.client_secret,
        publishableKey,
      });
    }
    // ── End Stripe path ────────────────────────────────────────────────────

    // Direct DB write: free plan, or Stripe not yet configured.
    // Preserve the existing trial period if the store is currently trialing.
    const [existingSub] = await db
      .select()
      .from(storeSubscriptions)
      .where(
        and(
          eq(storeSubscriptions.storeId, storeId),
          inArray(storeSubscriptions.status, ["active", "trialing"])
        )
      )
      .orderBy(sql`${storeSubscriptions.id} DESC`)
      .limit(1);

    await db
      .update(storeSubscriptions)
      .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(storeSubscriptions.storeId, storeId),
          inArray(storeSubscriptions.status, ["active", "trialing"])
        )
      );

    const now = new Date();

    // Determine new subscription status and period end:
    // - If previously trialing with time left → keep trialing, preserve end date
    // - If no prior subscription → grant full 30-day trial
    // - If previously active → start a new active billing month immediately
    let newStatus = "active";
    let periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (existingSub?.status === "trialing" && existingSub.currentPeriodEnd) {
      const trialEnd = new Date(existingSub.currentPeriodEnd as any);
      if (trialEnd > now) {
        newStatus = "trialing";
        periodEnd = trialEnd;
      }
    } else if (!existingSub) {
      // First subscription — start the 30-day trial
      const trialDays = await TrialService.getFreeTrialDays();
      newStatus = "trialing";
      periodEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    }

    const [row] = await db
      .insert(storeSubscriptions)
      .values({
        storeId,
        planId,
        status: newStatus,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    return res.status(201).json(row);
  } catch (err) {
    console.error("[subscription/subscribe] error:", err);
    return res.status(500).json({ error: "Failed to subscribe" });
  }
});

// ─── POST /api/subscription/finalize-setup ───────────────────────────────────
//
// Completes the trial branch of /subscribe: after the owner confirms the
// SetupIntent client-side (stripe.confirmSetup), this creates the actual
// Stripe Subscription using the card that was just verified. Re-fetches the
// SetupIntent from Stripe itself rather than trusting anything the client
// reports about it — the client only ever supplies its id.

router.post("/finalize-setup", async (req: any, res) => {
  try {
    const storeId = await getOwnedStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const { setupIntentId } = req.body;
    if (!setupIntentId || typeof setupIntentId !== "string") {
      return res.status(400).json({ error: "setupIntentId is required" });
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({ error: "Payments are not configured" });
    }

    const [store] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const setupCustomerId = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;

    if (setupIntent.status !== "succeeded") {
      return res.status(400).json({ error: "Card verification has not completed yet" });
    }
    if (!setupCustomerId || setupCustomerId !== store.stripeCustomerId) {
      return res.status(403).json({ error: "This setup does not belong to your store" });
    }
    if (setupIntent.metadata?.storeId !== String(storeId)) {
      return res.status(403).json({ error: "This setup does not belong to your store" });
    }

    const planId = Number(setupIntent.metadata?.planId);
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.id, planId),
          eq(subscriptionPlans.isActive, true),
          eq(subscriptionPlans.isPublic, true)
        )
      )
      .limit(1);
    if (!plan) return res.status(404).json({ error: "Plan not found or not available" });

    const interval = setupIntent.metadata?.interval === "year" ? "year" : "month";
    const priceId = interval === "year" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
    if (!priceId) {
      return res.status(400).json({ error: "This plan has not been configured for Stripe checkout yet." });
    }

    const pmId = typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;
    if (!pmId) return res.status(400).json({ error: "No payment method was saved" });

    await stripe.customers.update(store.stripeCustomerId!, {
      invoice_settings: { default_payment_method: pmId },
    });

    const trialPeriodDays = Number(setupIntent.metadata?.trialPeriodDays) || undefined;

    let subscription;
    try {
      subscription = await stripe.subscriptions.create({
        customer: store.stripeCustomerId!,
        items: [{ price: priceId }],
        default_payment_method: pmId,
        trial_period_days: trialPeriodDays,
        // No trial → charge the just-verified card now; fail loudly (rather
        // than leaving a dangling "incomplete" subscription) if it's declined.
        payment_behavior: "error_if_incomplete",
        automatic_tax: { enabled: false },
        metadata: {
          storeId: String(storeId),
          planCode: (plan as any).code ?? "",
          planId: String(plan.id),
          interval,
        },
      });
    } catch (err: any) {
      if (err?.type === "StripeCardError" || err?.type === "StripeInvalidRequestError") {
        return res.status(402).json({ error: err.message || "Your card was declined. Please try a different card." });
      }
      throw err;
    }

    // storeSubscriptions is written off the customer.subscription.created
    // webhook, not here — same server-authoritative principle as deal
    // checkout's webhook-driven fulfillment.
    return res.json({ ok: true, subscriptionId: subscription.id, status: subscription.status });
  } catch (err) {
    console.error("[subscription/finalize-setup] error:", err);
    return res.status(500).json({ error: "Failed to complete subscription" });
  }
});

// ─── POST /api/subscription/cancel ───────────────────────────────────────────
//
// Cancels the store's active Stripe subscription at period end (graceful).
// If Stripe is not configured or no stripeSubscriptionId exists, cancels immediately in DB.

router.post("/cancel", async (req: any, res) => {
  try {
    const storeId = await getOwnedStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    // Find the active subscription with a Stripe subscription ID
    const [sub] = await db
      .select()
      .from(storeSubscriptions)
      .where(
        and(
          eq(storeSubscriptions.storeId, storeId),
          inArray(storeSubscriptions.status, ["active", "trialing", "past_due"])
        )
      )
      .orderBy(sql`${storeSubscriptions.id} DESC`)
      .limit(1);

    if (!sub) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Already scheduled for cancellation
    if ((sub as any).cancelAtPeriodEnd) {
      return res.status(409).json({ error: "Subscription is already scheduled for cancellation" });
    }

    // ── Stripe path ────────────────────────────────────────────────────────
    if (isStripeConfigured() && sub.stripeSubscriptionId) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      // Optimistically update DB — webhook will confirm
      await db
        .update(storeSubscriptions)
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(storeSubscriptions.id, sub.id));

      return res.json({ ok: true, cancelAtPeriodEnd: true, currentPeriodEnd: sub.currentPeriodEnd });
    }

    // ── No Stripe: cancel immediately in DB ────────────────────────────────
    await db
      .update(storeSubscriptions)
      .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
      .where(eq(storeSubscriptions.id, sub.id));

    return res.json({ ok: true, canceled: true });
  } catch (err) {
    console.error("[subscription/cancel] error:", err);
    return res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// ─── POST /api/subscription/reactivate ───────────────────────────────────────
//
// Un-cancels a subscription that has cancel_at_period_end=true by calling
// stripe.subscriptions.update({ cancel_at_period_end: false }) and updating DB.

router.post("/reactivate", async (req: any, res) => {
  try {
    const storeId = await getOwnedStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const [sub] = await db
      .select()
      .from(storeSubscriptions)
      .where(
        and(
          eq(storeSubscriptions.storeId, storeId),
          inArray(storeSubscriptions.status, ["active", "trialing", "past_due"])
        )
      )
      .orderBy(sql`${storeSubscriptions.id} DESC`)
      .limit(1);

    if (!sub) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    if (!(sub as any).cancelAtPeriodEnd) {
      return res.status(409).json({ error: "Subscription is not scheduled for cancellation" });
    }

    // Look up plan name for the confirmation email
    let planName = "Certxa";
    if (sub.planId) {
      const [plan] = await db
        .select({ name: subscriptionPlans.name })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, sub.planId))
        .limit(1);
      if (plan?.name) planName = plan.name;
    }
    const renewsAt = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd as any) : null;

    // ── Stripe path ────────────────────────────────────────────────────────
    if (isStripeConfigured() && sub.stripeSubscriptionId) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      await db
        .update(storeSubscriptions)
        .set({ cancelAtPeriodEnd: false, updatedAt: new Date() })
        .where(eq(storeSubscriptions.id, sub.id));

      sendSubscriptionReactivatedEmail(storeId, planName, renewsAt)
        .catch((e) => console.warn("[subscription/reactivate] email failed:", e?.message));

      return res.json({ ok: true, cancelAtPeriodEnd: false, currentPeriodEnd: sub.currentPeriodEnd });
    }

    // ── No Stripe: just flip the flag in DB ────────────────────────────────
    await db
      .update(storeSubscriptions)
      .set({ cancelAtPeriodEnd: false, updatedAt: new Date() })
      .where(eq(storeSubscriptions.id, sub.id));

    sendSubscriptionReactivatedEmail(storeId, planName, renewsAt)
      .catch((e) => console.warn("[subscription/reactivate] email failed:", e?.message));

    return res.json({ ok: true, cancelAtPeriodEnd: false });
  } catch (err) {
    console.error("[subscription/reactivate] error:", err);
    return res.status(500).json({ error: "Failed to reactivate subscription" });
  }
});

// ─── GET /api/subscription/invoices ──────────────────────────────────────────
//
// Returns past invoices for the owner's store, newest first.

router.get("/invoices", async (req: any, res) => {
  try {
    const storeId = await getOwnedStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const invoices = await db
      .select({
        id:               storeInvoices.id,
        invoiceNumber:    storeInvoices.invoiceNumber,
        status:           storeInvoices.status,
        paid:             storeInvoices.paid,
        totalCents:       storeInvoices.totalCents,
        amountPaidCents:  storeInvoices.amountPaidCents,
        hostedInvoiceUrl: storeInvoices.hostedInvoiceUrl,
        invoicePdfUrl:    storeInvoices.invoicePdfUrl,
        billingReason:    storeInvoices.billingReason,
        createdAt:        storeInvoices.createdAt,
      })
      .from(storeInvoices)
      .where(eq(storeInvoices.storeId, storeId))
      .orderBy(desc(storeInvoices.createdAt))
      .limit(50);

    return res.json(invoices);
  } catch (err) {
    console.error("[subscription/invoices] error:", err);
    return res.status(500).json({ error: "Failed to load invoices" });
  }
});

export default router;

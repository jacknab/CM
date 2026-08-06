/**
 * routes/subscription.ts — Owner-facing subscription management
 *
 * Mounted at /api/subscription (with isAuthenticated applied in routes.ts)
 *
 * GET  /api/subscription/usage      — current period usage for 4 countable limits
 * POST /api/subscription/subscribe  — subscribe own store to a plan
 *                                     → Stripe Checkout when configured + plan has a price
 *                                     → direct DB write fallback (free plans or Stripe not configured)
 */

import { Router } from "express";
import { db } from "../db";
import { storeSubscriptions, subscriptionPlans, staff, locations, storeInvoices } from "@shared/schema";
import { eq, and, count, inArray, sql, desc } from "drizzle-orm";
import { isStripeConfigured, getReturnBaseUrl, stripe } from "../lib/stripe";
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

      // ── Carry over any remaining trial days ────────────────────────────────
      // If the store already has a trialing subscription, pass the remaining
      // days to Stripe so the card isn't charged until the trial expires.
      // If no trial exists yet, grant the full 30-day trial on first checkout.
      let trialPeriodDays: number | undefined;
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
        if (daysLeft > 0) trialPeriodDays = daysLeft;
      } else {
        // First-ever checkout — check if the user's account is still in trial
        const userId: string | null = req.session?.userId ?? req.auth?.userId ?? null;
        if (userId) {
          const defaultDays = await TrialService.getFreeTrialDays();
          trialPeriodDays = defaultDays;
        }
      }

      const base = getReturnBaseUrl();
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${base}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${base}/billing?status=cancelled`,
        metadata: {
          storeId: String(storeId),
          planCode: (plan as any).code ?? "",
          planId:   String(plan.id),
        },
        allow_promotion_codes: true,
        // SaaS subscription = service; disable automatic tax (tax applies to physical products only)
        automatic_tax: { enabled: false },
        ...(trialPeriodDays && trialPeriodDays > 0
          ? { subscription_data: { trial_period_days: trialPeriodDays } }
          : {}),
      });

      return res.json({ checkoutUrl: session.url });
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

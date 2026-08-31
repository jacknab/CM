/**
 * routes/billing.ts — Stripe Billing & Wallet Funding API
 *
 * Store-owner endpoints (all scoped to a specific salonId):
 *   GET  /api/billing/status                       — is Stripe configured?
 *   GET  /api/billing/profile/:salonId             — subscription + plan details
 *   GET  /api/billing/invoices/:salonId            — invoice history (from DB + Stripe)
 *   GET  /api/billing/upcoming/:salonId            — upcoming invoice preview
 *   GET  /api/billing/payment-methods/:salonId     — saved payment methods
 *   GET  /api/billing/sms-status/:salonId          — SMS credits & packages
 *   GET  /api/billing/wallet/balance/:salonId      — wallet balance & transactions
 *   POST /api/billing/subscribe/:salonId           — create Stripe Checkout for subscription
 *   POST /api/billing/change-plan/:salonId         — upgrade/downgrade plan
 *   POST /api/billing/cancel/:salonId              — cancel at period end
 *   POST /api/billing/resume/:salonId              — resume a cancellation
 *   POST /api/billing/portal                       — create Stripe Customer Portal session
 *   POST /api/billing/sms-bucket/checkout          — SMS credit top-up checkout
 *   POST /api/billing/wallet/fund                  — wallet funding checkout
 *
 * Admin endpoints (isAdmin):
 *   GET  /api/billing/admin/stats                  — MRR, subscribers, churned, deposits
 */

import { Router } from "express";
import { db, pool } from "../db";
import {
  locations,
  storeSubscriptions as storeSubscriptionsTable,
  subscriptionPlans,
  staff,
  storeInvoices,
  walletTransactions,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, desc, sql, inArray, sum, count } from "drizzle-orm";
import { stripe, isStripeConfigured, getReturnBaseUrl } from "../lib/stripe";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isAdmin(req: any): Promise<boolean> {
  const uid = req.session?.userId ?? req.user?.id ?? null;
  if (!uid) return false;
  try {
    const [user] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, uid)).limit(1);
    return user?.isAdmin === true;
  } catch {
    return false;
  }
}

function userId(req: any): string | null {
  return req.user?.id ?? req.session?.userId ?? null;
}

/** Verify the requesting user owns the given store. Returns the store row or null. */
async function ownedStore(req: any, salonId: number) {
  const uid = userId(req);
  if (!uid) return null;
  const [store] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, salonId))
    .limit(1);
  if (!store) return null;
  if (await isAdmin(req)) return store;
  if (store.userId !== uid) return null;
  return store;
}

/** Resolve or lazily-create a Stripe Customer for the given store.
 *  Validates any stored customer ID against the current Stripe account —
 *  if it belongs to a different account (e.g. a stale Connect customer),
 *  it is cleared and a fresh customer is created on the platform account. */
async function ensureStripeCustomer(store: typeof locations.$inferSelect): Promise<string> {
  if (store.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(store.stripeCustomerId);
      if (!(existing as any).deleted) return store.stripeCustomerId;
      // Customer was deleted on Stripe — fall through to recreate
    } catch (err: any) {
      // "No such customer" — stale ID from a different Stripe account
      console.warn(`[billing] Stale stripeCustomerId ${store.stripeCustomerId} for store ${store.id}: ${err?.message}. Recreating.`);
    }
    // Clear the invalid ID so we can write a fresh one
    await db.update(locations).set({ stripeCustomerId: null }).where(eq(locations.id, store.id));
  }

  const customer = await stripe.customers.create({
    name: store.name ?? undefined,
    email: store.email ?? undefined,
    metadata: { storeId: String(store.id) },
  });

  await db
    .update(locations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(locations.id, store.id));

  return customer.id;
}

/** Retrieve the active Stripe subscription for a store (from our DB). */
async function getActiveSubscription(storeId: number) {
  const [sub] = await db
    .select()
    .from(storeSubscriptionsTable)
    .where(
      and(
        eq(storeSubscriptionsTable.storeId, storeId),
        inArray(storeSubscriptionsTable.status, ["active", "trialing", "past_due"])
      )
    )
    .orderBy(desc(storeSubscriptionsTable.createdAt))
    .limit(1);
  return sub ?? null;
}

const SMS_PACKAGES = [
  { id: "sms_10",  priceCents: 1000,  credits: 333,  label: "$10 — 333 SMS"   },
  { id: "sms_25",  priceCents: 2500,  credits: 833,  label: "$25 — 833 SMS"   },
  { id: "sms_50",  priceCents: 5000,  credits: 1667, label: "$50 — 1,667 SMS" },
];

// ─── GET /api/billing/account-status ─────────────────────────────────────────

router.get("/account-status", async (req: any, res) => {
  const emptyResponse = {
    accountStatus: null,
    suspendedAt: null,
    lockedAt: null,
    suspendedReason: null,
    salonId: null,
    trialExpired: false,
    inGracePeriod: false,
    graceEndsAt: null as string | null,
    trialEndsAt: null,
    subscriptionStatus: null,
  };

  try {
    const uid = userId(req);
    const staffId = req.session?.staffId ?? null;

    let store: typeof locations.$inferSelect | null = null;
    let ownerUserId: string | null = null;

    if (uid) {
      const [ownerStore] = await db
        .select()
        .from(locations)
        .where(eq(locations.userId, uid))
        .limit(1);
      store = ownerStore ?? null;
      ownerUserId = uid;
    } else if (staffId) {
      const [staffMember] = await db
        .select({ storeId: staff.storeId })
        .from(staff)
        .where(eq(staff.id, Number(staffId)))
        .limit(1);

      if (staffMember?.storeId) {
        const [staffStore] = await db
          .select()
          .from(locations)
          .where(eq(locations.id, staffMember.storeId))
          .limit(1);
        store = staffStore ?? null;
        ownerUserId = store?.userId ?? null;
      }
    }

    if (!store) {
      return res.json(emptyResponse);
    }

    // ── Trial / subscription status ──────────────────────────────────────────
    // Staff users and platform admins are never trial-expired.
    // For owners: subscriptionStatus === 'expired' means trial ended. We still
    // allow through if they have a live Stripe store_subscription row.
    let trialExpired = false;
    let inGracePeriod = false;
    let graceEndsAt: string | null = null;
    let trialEndsAt: string | null = null;
    let subscriptionStatus: string | null = null;

    // Grace period: 7 days of full access after trial ends before suspension.
    const GRACE_PERIOD_DAYS = 7;

    if (ownerUserId && !staffId) {
      const [userRow] = await db
        .select({ subscriptionStatus: users.subscriptionStatus, trialEndsAt: users.trialEndsAt, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, ownerUserId))
        .limit(1);

      if (userRow) {
        subscriptionStatus = (userRow.subscriptionStatus as string) ?? null;
        trialEndsAt = userRow.trialEndsAt
          ? new Date(userRow.trialEndsAt as any).toISOString()
          : null;

        // Platform admins always bypass the trial wall — they run the platform.
        const isAdminUser = userRow.isAdmin === true;

        if (!isAdminUser && subscriptionStatus === "expired") {
          // Fallback: check for a live Stripe subscription before hard-blocking
          const [activeSub] = await db
            .select({ status: storeSubscriptionsTable.status })
            .from(storeSubscriptionsTable)
            .where(
              and(
                eq(storeSubscriptionsTable.storeId, store.id),
                inArray(storeSubscriptionsTable.status, ["active", "trialing"]),
              ),
            )
            .limit(1);

          if (!activeSub) {
            // Determine whether we're still within the 7-day grace period.
            const trialEndDate = userRow.trialEndsAt ? new Date(userRow.trialEndsAt as any) : null;
            const graceEnd = trialEndDate
              ? new Date(trialEndDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
              : null;

            if (graceEnd && graceEnd > new Date()) {
              // Still within grace window — full access, but show warning banner.
              inGracePeriod = true;
              graceEndsAt = graceEnd.toISOString();
            } else {
              // Grace period over — account is (or will be) suspended.
              trialExpired = true;
            }
          }
        }
      }
    }

    return res.json({
      accountStatus: (store.accountStatus ?? "active").toLowerCase(),
      suspendedAt:   store.suspendedAt   ?? null,
      lockedAt:      store.lockedAt      ?? null,
      suspendedReason: store.suspendedReason ?? null,
      salonId: store.id,
      trialExpired,
      inGracePeriod,
      graceEndsAt,
      trialEndsAt,
      subscriptionStatus,
    });
  } catch (err: any) {
    console.error("[billing/account-status]", err?.message);
    return res.json(emptyResponse);
  }
});

// ─── GET /api/billing/status ──────────────────────────────────────────────────

router.get("/status", (_req, res) => {
  res.json({ configured: isStripeConfigured() });
});

// ─── GET /api/billing/profile/:salonId ───────────────────────────────────────

router.get("/profile/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  try {
    const sub = await getActiveSubscription(salonId);
    const [plan] = sub
      ? await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, sub.planId))
          .limit(1)
      : [null];

    let stripeSub: any = null;
    let paymentMethod: any = null;

    if (isStripeConfigured() && sub?.stripeSubscriptionId) {
      try {
        stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
          expand: ["default_payment_method"],
        });
        const pm = stripeSub.default_payment_method;
        if (pm?.card) {
          paymentMethod = {
            brand:    pm.card.brand,
            last4:    pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear:  pm.card.exp_year,
          };
        }
      } catch (err: any) {
        console.warn("[billing/profile] Stripe fetch failed:", err?.message);
      }
    }

    return res.json({
      store: { id: store.id, name: store.name, email: store.email },
      profile: {
        subscriptionStartedAt: sub?.createdAt ?? null,
        currentSubscriptionStatus: sub?.status ?? null,
        stripeCustomerId: store.stripeCustomerId ?? null,
      },
      subscription: sub
        ? {
            ...sub,
            planCode: plan?.code ?? null,
            cancelAtPeriodEnd: stripeSub?.cancel_at_period_end ?? false,
          }
        : null,
      stripeSub,
      plan: plan ?? null,
      paymentMethod,
    });
  } catch (err: any) {
    console.error("[billing/profile] Error:", err?.message);
    return res.status(500).json({ error: "Failed to load billing profile" });
  }
});

// ─── GET /api/billing/invoices/:salonId ──────────────────────────────────────

router.get("/invoices/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  try {
    const dbInvoices = await db
      .select()
      .from(storeInvoices)
      .where(eq(storeInvoices.storeId, salonId))
      .orderBy(desc(storeInvoices.createdAt))
      .limit(50);

    return res.json({ invoices: dbInvoices });
  } catch (err: any) {
    console.error("[billing/invoices] Error:", err?.message);
    return res.status(500).json({ error: "Failed to load invoices" });
  }
});

// ─── GET /api/billing/upcoming/:salonId ──────────────────────────────────────

router.get("/upcoming/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) return res.json(null);

  try {
    const sub = await getActiveSubscription(salonId);
    if (!sub?.stripeSubscriptionId) return res.json(null);

    const invoicesApi = stripe.invoices as any;
    const upcoming = await (invoicesApi.createPreview ?? invoicesApi.retrieveUpcoming).call(invoicesApi, {
      subscription: sub.stripeSubscriptionId,
    });

    return res.json({
      amountDueCents:    upcoming.amount_due,
      nextPaymentAttempt: upcoming.next_payment_attempt,
      currency:          upcoming.currency,
      lines: (upcoming.lines?.data ?? []).map((l: any) => ({
        description: l.description ?? "",
        amountCents: l.amount,
        quantity:    l.quantity ?? undefined,
      })),
    });
  } catch (err: any) {
    if (err?.code === "invoice_upcoming_none") return res.json(null);
    console.warn("[billing/upcoming] Error:", err?.message);
    return res.json(null);
  }
});

// ─── GET /api/billing/payment-methods/:salonId ───────────────────────────────

router.get("/payment-methods/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) return res.json([]);

  try {
    const customerId = store.stripeCustomerId;
    if (!customerId) return res.json([]);

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return res.json([]);

    const pms = await stripe.customers.listPaymentMethods(customerId, { type: "card" });
    const defaultPmId = (customer as any).invoice_settings?.default_payment_method;

    return res.json(
      pms.data.map((pm) => ({
        id:           pm.id,
        brand:        pm.card!.brand,
        last4:        pm.card!.last4,
        expMonth:     pm.card!.exp_month,
        expYear:      pm.card!.exp_year,
        isDefault:    pm.id === defaultPmId,
        billingEmail: (customer as any).email,
      }))
    );
  } catch (err: any) {
    console.warn("[billing/payment-methods] Error:", err?.message);
    return res.json([]);
  }
});

// ─── GET /api/billing/sms-status/:salonId ────────────────────────────────────

router.get("/sms-status/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  try {
    const planResult = await pool.query(
      `SELECT sp.name AS plan_name,
              COALESCE((
                SELECT pf.limit_value FROM plan_features pf
                JOIN features f ON pf.feature_id = f.id
                WHERE pf.plan_id = sp.id AND f.id = 'sms_notifications' AND pf.enabled = true
                LIMIT 1
              ), 0) AS plan_monthly_allowance
       FROM store_subscriptions ss
       JOIN subscription_plans sp ON ss.plan_id = sp.id
       WHERE ss.store_id = $1 AND ss.status IN ('active','trialing')
       ORDER BY ss.created_at DESC LIMIT 1`,
      [salonId]
    );

    const planName          = planResult.rows?.[0]?.plan_name ?? "Free";
    const planMonthlyAllowance = Number(planResult.rows?.[0]?.plan_monthly_allowance ?? 0);

    return res.json({
      smsAllowance:            store.smsAllowance ?? 0,
      smsCredits:              store.smsCredits   ?? 0,
      smsCreditsTotalPurchased: store.smsCreditsTotalPurchased ?? 0,
      planMonthlyAllowance,
      planName,
      packages: SMS_PACKAGES,
    });
  } catch (err: any) {
    console.error("[billing/sms-status] Error:", err?.message);
    return res.status(500).json({ error: "Failed to load SMS status" });
  }
});

// ─── GET /api/billing/wallet/balance/:salonId ────────────────────────────────

router.get("/wallet/balance/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  try {
    const [balanceRow] = await db
      .select({ balance: sum(walletTransactions.amount) })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.storeId, salonId),
          eq(walletTransactions.status, "completed")
        )
      );

    const transactions = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.storeId, salonId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(50);

    return res.json({
      balanceCents: Number(balanceRow?.balance ?? 0),
      transactions,
    });
  } catch (err: any) {
    console.error("[billing/wallet/balance] Error:", err?.message);
    return res.status(500).json({ error: "Failed to load wallet balance" });
  }
});

// ─── POST /api/billing/subscribe/:salonId ────────────────────────────────────
// Creates a Stripe Checkout Session for a new subscription.

router.post("/subscribe/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const { planCode, interval = "month" } = req.body;
  if (!planCode) return res.status(400).json({ error: "planCode is required" });

  try {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.code, planCode), eq(subscriptionPlans.isActive, true)))
      .limit(1);

    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const priceId =
      interval === "year"
        ? plan.stripePriceIdYearly
        : plan.stripePriceIdMonthly;

    if (!priceId) {
      return res.status(422).json({
        error: `No Stripe price configured for ${planCode} (${interval}). Set the price ID in the admin panel.`,
      });
    }

    const customerId = await ensureStripeCustomer(store);
    const base = getReturnBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode:      "subscription",
      customer:  customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/manage/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/manage/billing?status=cancelled`,
      metadata: { storeId: String(salonId), planCode, planId: String(plan.id) },
      allow_promotion_codes: true,
      // SaaS subscription = service; disable automatic tax (tax applies to physical products only)
      automatic_tax: { enabled: false },
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing/subscribe] Error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Failed to create checkout session" });
  }
});

// ─── POST /api/billing/change-plan/:salonId ──────────────────────────────────
// Upgrades or downgrades the plan via Stripe proration.

router.post("/change-plan/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const { newPlanCode, interval = "month" } = req.body;
  if (!newPlanCode) return res.status(400).json({ error: "newPlanCode is required" });

  try {
    const sub = await getActiveSubscription(salonId);
    if (!sub?.stripeSubscriptionId) {
      // No active subscription — redirect to checkout instead
      return res.status(409).json({ error: "No active Stripe subscription. Use /subscribe to start one." });
    }

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.code, newPlanCode), eq(subscriptionPlans.isActive, true)))
      .limit(1);

    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const priceId =
      interval === "year"
        ? plan.stripePriceIdYearly
        : plan.stripePriceIdMonthly;

    if (!priceId) {
      return res.status(422).json({
        error: `No Stripe price configured for ${newPlanCode} (${interval}).`,
      });
    }

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) return res.status(422).json({ error: "Subscription has no items" });

    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
    });

    // Mirror plan change to DB immediately (webhook will also update)
    await db
      .update(storeSubscriptionsTable)
      .set({ planId: plan.id, updatedAt: new Date() })
      .where(eq(storeSubscriptionsTable.id, sub.id));

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[billing/change-plan] Error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Failed to change plan" });
  }
});

// ─── POST /api/billing/cancel/:salonId ───────────────────────────────────────

router.post("/cancel/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const { stripeSubscriptionId, atPeriodEnd = true } = req.body;
  const subId = stripeSubscriptionId;
  if (!subId) return res.status(400).json({ error: "stripeSubscriptionId is required" });

  try {
    if (atPeriodEnd) {
      await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    } else {
      await stripe.subscriptions.cancel(subId);
    }

    // Mirror to DB
    const sub = await getActiveSubscription(salonId);
    if (sub) {
      await db
        .update(storeSubscriptionsTable)
        .set({ canceledAt: new Date(), updatedAt: new Date() })
        .where(eq(storeSubscriptionsTable.id, sub.id));
    }

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[billing/cancel] Error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Failed to cancel subscription" });
  }
});

// ─── POST /api/billing/resume/:salonId ───────────────────────────────────────

router.post("/resume/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const { stripeSubscriptionId } = req.body;
  if (!stripeSubscriptionId) return res.status(400).json({ error: "stripeSubscriptionId is required" });

  try {
    await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: false });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[billing/resume] Error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Failed to resume subscription" });
  }
});

// ─── POST /api/billing/portal ────────────────────────────────────────────────

router.post("/portal", async (req: any, res) => {
  const { salonId } = req.body;
  const id = Number(salonId);
  if (!id) return res.status(400).json({ error: "salonId is required" });

  const store = await ownedStore(req, id);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  try {
    const customerId = await ensureStripeCustomer(store);
    const base = getReturnBaseUrl();

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${base}/manage/billing`,
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing/portal] Error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Failed to open billing portal" });
  }
});

// ─── POST /api/billing/sms-bucket/checkout ───────────────────────────────────

router.post("/sms-bucket/checkout", async (req: any, res) => {
  const { salonId, packageId } = req.body;
  const id = Number(salonId);
  if (!id || !packageId) return res.status(400).json({ error: "salonId and packageId are required" });

  const store = await ownedStore(req, id);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const pkg = SMS_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  try {
    const customerId = await ensureStripeCustomer(store);
    const base = getReturnBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode:     "payment",
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency:     "usd",
          unit_amount:  pkg.priceCents,
          product_data: { name: pkg.label, description: `${pkg.credits.toLocaleString()} SMS credits` },
        },
      }],
      success_url: `${base}/manage/billing?status=sms_success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/manage/billing`,
      metadata: {
        storeId:    String(id),
        type:       "sms_topup",
        packageId,
        credits:    String(pkg.credits),
        priceCents: String(pkg.priceCents),
      },
      // Digital service credits; disable automatic tax (tax applies to physical products only)
      automatic_tax: { enabled: false },
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing/sms-bucket/checkout] Error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Failed to create SMS checkout" });
  }
});

// ─── POST /api/billing/wallet/fund ───────────────────────────────────────────
// Account funding (prepaid wallet balance) via Stripe one-time payment.

const WALLET_PRESETS = [10, 25, 50, 100, 250];

router.post("/wallet/fund", async (req: any, res) => {
  const { salonId, amountCents, successUrl: customSuccessUrl, cancelUrl: customCancelUrl } = req.body;
  const id = Number(salonId);
  const cents = Number(amountCents);

  if (!id || !cents || cents < 100) {
    return res.status(400).json({ error: "salonId and amountCents (min 100) are required" });
  }

  const store = await ownedStore(req, id);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  try {
    const customerId = await ensureStripeCustomer(store);
    const base = getReturnBaseUrl();
    const dollars = (cents / 100).toFixed(2);

    const successUrl = customSuccessUrl
      ?? `${base}/manage/billing?status=wallet_funded&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = customCancelUrl ?? `${base}/manage/billing`;

    const session = await stripe.checkout.sessions.create({
      mode:     "payment",
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency:     "usd",
          unit_amount:  cents,
          product_data: { name: "Account Balance Top-Up", description: `Add ${dollars} to your account balance for AI calls and SMS` },
        },
      }],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      metadata: {
        storeId:    String(id),
        type:       "wallet_deposit",
        amountCents: String(cents),
      },
      // Digital credits / platform service; disable automatic tax (tax applies to physical products only)
      automatic_tax: { enabled: false },
    });

    // Create a pending wallet transaction
    await db.insert(walletTransactions).values({
      storeId:             id,
      stripePaymentIntent: session.payment_intent as string ?? null,
      amount:              cents,
      transactionType:     "deposit",
      status:              "pending",
      description:         `Wallet top-up $${dollars}`,
    });

    return res.json({ url: session.url, presets: WALLET_PRESETS });
  } catch (err: any) {
    console.error("[billing/wallet/fund] Error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Failed to create wallet checkout" });
  }
});

// ─── Auto-Refill Settings ─────────────────────────────────────────────────────
// GET  /api/billing/auto-refill/:salonId  — fetch settings + current PM + balance
// PUT  /api/billing/auto-refill/:salonId  — save settings
// POST /api/billing/auto-refill/setup-pm/:salonId — Stripe Setup checkout

router.get("/auto-refill/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .select({
      autoRefillEnabled:   locations.autoRefillEnabled,
      autoRefillThreshold: locations.autoRefillThreshold,
      autoRefillAmount:    locations.autoRefillAmount,
      platformCredits:     locations.platformCredits,
      stripeCustomerId:    locations.stripeCustomerId,
    })
    .from(locations)
    .where(eq(locations.id, salonId));

  if (!row) return res.status(404).json({ error: "Store not found" });

  let paymentMethod: { brand: string; last4: string } | null = null;
  let hasPaymentMethod = false;

  if (isStripeConfigured() && row.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(row.stripeCustomerId) as any;
      if (!customer.deleted) {
        const defaultPmId: string | undefined =
          typeof customer.invoice_settings?.default_payment_method === "string"
            ? customer.invoice_settings.default_payment_method
            : typeof customer.default_source === "string"
              ? customer.default_source
              : undefined;

        if (defaultPmId) {
          const pm = await stripe.paymentMethods.retrieve(defaultPmId);
          if (pm.card) {
            paymentMethod    = { brand: pm.card.brand, last4: pm.card.last4 };
            hasPaymentMethod = true;
          }
        }
      }
    } catch {
      // Stripe unavailable — degrade gracefully
    }
  }

  return res.json({
    enabled:          row.autoRefillEnabled,
    threshold:        parseFloat(row.autoRefillThreshold ?? "5.00"),
    amount:           parseFloat(row.autoRefillAmount    ?? "25.00"),
    currentBalance:   parseFloat(row.platformCredits     ?? "0"),
    hasPaymentMethod,
    paymentMethod,
  });
});

router.put("/auto-refill/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  const { enabled, threshold, amount } = req.body;

  const VALID_THRESHOLDS = [3, 5, 10, 15, 20];
  const VALID_AMOUNTS    = [10, 25, 50, 100, 250];

  if (typeof enabled !== "boolean")
    return res.status(400).json({ error: "enabled must be boolean" });
  if (!VALID_THRESHOLDS.includes(Number(threshold)))
    return res.status(400).json({ error: `Invalid threshold (allowed: ${VALID_THRESHOLDS.join(", ")})` });
  if (!VALID_AMOUNTS.includes(Number(amount)))
    return res.status(400).json({ error: `Invalid amount (allowed: ${VALID_AMOUNTS.join(", ")})` });

  await db
    .update(locations)
    .set({
      autoRefillEnabled:   enabled,
      autoRefillThreshold: Number(threshold).toFixed(2),
      autoRefillAmount:    Number(amount).toFixed(2),
    })
    .where(eq(locations.id, salonId));

  return res.json({ ok: true });
});

router.post("/auto-refill/setup-pm/:salonId", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  try {
    const customerId = await ensureStripeCustomer(store);
    const base       = getReturnBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode:                  "setup",
      customer:              customerId,
      currency:              "usd",
      payment_method_types:  ["card"],
      success_url:           `${base}/manage/billing?status=pm_saved&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:            `${base}/manage/billing`,
      metadata: {
        type:    "auto_refill_pm_setup",
        storeId: String(salonId),
      },
      // Setup-only session (no charge); disable automatic tax for consistency
      automatic_tax: { enabled: false },
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing/auto-refill/setup-pm] Error:", err?.message);
    return res.status(500).json({ error: err.message ?? "Failed to create setup session" });
  }
});

// ─── GET /api/billing/auto-refill/:salonId/history ───────────────────────────
// Returns recent platformCreditTransactions (top-ups and auto-refills) for the store.

router.get("/auto-refill/:salonId/history", async (req: any, res) => {
  const salonId = Number(req.params.salonId);
  if (!salonId) return res.status(400).json({ error: "Invalid salonId" });

  const store = await ownedStore(req, salonId);
  if (!store) return res.status(403).json({ error: "Forbidden" });

  try {
    const rows = await pool.query(
      `SELECT id, type, amount, description, balance_after, reference_id, created_at
       FROM platform_credit_transactions
       WHERE store_id = $1
         AND type IN ('topup', 'deposit')
       ORDER BY created_at DESC
       LIMIT 10`,
      [salonId]
    );
    return res.json({ history: rows.rows });
  } catch (err: any) {
    console.error("[billing/auto-refill/history] Error:", err?.message);
    return res.status(500).json({ error: "Failed to load history" });
  }
});

// ─── GET /api/billing/admin/stats ────────────────────────────────────────────
// Admin dashboard: MRR, active subscribers, churned, wallet deposits, etc.

router.get("/admin/stats", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  try {
    const mrrResult = await pool.query(`
      WITH latest_subscriptions AS (
        SELECT DISTINCT ON (store_id) *
        FROM store_subscriptions
        ORDER BY store_id, created_at DESC, id DESC
      )
      SELECT
        COUNT(DISTINCT ss.store_id) FILTER (WHERE ss.status = 'active')    AS active_subs,
        COUNT(DISTINCT ss.store_id) FILTER (WHERE ss.status = 'trialing')  AS trialing_subs,
        COUNT(DISTINCT ss.store_id) FILTER (WHERE ss.status = 'past_due')  AS past_due_subs,
        COUNT(DISTINCT ss.store_id) FILTER (WHERE ss.status = 'canceled')  AS churned_subs,
        COALESCE(SUM(sp.price_monthly_cents)
          FILTER (WHERE ss.status = 'active'), 0)                          AS mrr_cents,
        COALESCE(
          SUM(sp.price_yearly_cents) FILTER (WHERE ss.status = 'active'),
          0
        ) / 12                                                             AS mrr_from_annual_cents
      FROM latest_subscriptions ss
      JOIN subscription_plans sp ON ss.plan_id = sp.id
    `);

    const walletResult = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0)                      AS total_wallet_deposits_cents,
        COUNT(*)                                       AS total_deposit_count,
        COUNT(*) FILTER (WHERE status = 'pending')     AS pending_deposits
      FROM wallet_transactions
      WHERE transaction_type = 'deposit' AND status = 'completed'
    `);

    const invoiceResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE paid = false AND status != 'void') AS failed_payments,
        COUNT(*) FILTER (WHERE paid = true)                       AS paid_invoices,
        COALESCE(SUM(total_cents) FILTER (WHERE paid = true), 0) AS total_revenue_cents
      FROM store_invoices
    `);

    const stats = mrrResult.rows?.[0] ?? {};
    const wStats = walletResult.rows?.[0] ?? {};
    const iStats = invoiceResult.rows?.[0] ?? {};

    return res.json({
      activeSubs:            Number(stats.active_subs ?? 0),
      trialingSubs:          Number(stats.trialing_subs ?? 0),
      pastDueSubs:           Number(stats.past_due_subs ?? 0),
      churnedSubs:           Number(stats.churned_subs ?? 0),
      mrrCents:              Number(stats.mrr_cents ?? 0) + Number(stats.mrr_from_annual_cents ?? 0),
      walletDepositCents:    Number(wStats.total_wallet_deposits_cents ?? 0),
      totalDepositCount:     Number(wStats.total_deposit_count ?? 0),
      failedPayments:        Number(iStats.failed_payments ?? 0),
      paidInvoices:          Number(iStats.paid_invoices ?? 0),
      totalRevenueCents:     Number(iStats.total_revenue_cents ?? 0),
    });
  } catch (err: any) {
    console.error("[billing/admin/stats] Error:", err?.message);
    return res.status(500).json({ error: "Failed to load billing stats" });
  }
});

// ─── GET /api/billing/admin/auto-refill-stats ─────────────────────────────────
// Admin view: platform-wide auto-refill activity and health.

router.get("/admin/auto-refill-stats", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  try {
    // Aggregate totals
    const totalsResult = await pool.query(`
      SELECT
        COUNT(*)                                         AS auto_refill_count,
        COALESCE(SUM(amount::numeric), 0)                AS auto_refill_total_dollars,
        COUNT(DISTINCT store_id)                         AS stores_with_refills,
        COALESCE(AVG(amount::numeric), 0)                AS avg_refill_amount
      FROM platform_credit_transactions
      WHERE type = 'topup'
        AND description ILIKE '%auto-refill%'
    `);

    // Stores with auto-refill enabled
    const enabledResult = await pool.query(`
      SELECT COUNT(*) AS enabled_count
      FROM locations
      WHERE auto_refill_enabled = true
    `);

    // Top 5 stores by auto-refill volume (all time)
    const topStoresResult = await pool.query(`
      SELECT
        l.id                         AS store_id,
        l.name                       AS store_name,
        COUNT(t.id)                  AS refill_count,
        COALESCE(SUM(t.amount::numeric), 0) AS total_refilled,
        MAX(t.created_at)            AS last_refill_at
      FROM locations l
      JOIN platform_credit_transactions t ON t.store_id = l.id
      WHERE t.type = 'topup'
        AND t.description ILIKE '%auto-refill%'
      GROUP BY l.id, l.name
      ORDER BY total_refilled DESC
      LIMIT 5
    `);

    // Last 10 auto-refill transactions across all stores
    const recentResult = await pool.query(`
      SELECT
        t.id,
        t.store_id,
        l.name        AS store_name,
        t.amount,
        t.balance_after,
        t.reference_id,
        t.created_at
      FROM platform_credit_transactions t
      JOIN locations l ON l.id = t.store_id
      WHERE t.type = 'topup'
        AND t.description ILIKE '%auto-refill%'
      ORDER BY t.created_at DESC
      LIMIT 10
    `);

    // Stores with auto-refill enabled but no refill in last 30 days
    // (could be brand new or stale PM)
    const staleResult = await pool.query(`
      SELECT
        l.id,
        l.name,
        l.auto_refill_threshold,
        l.auto_refill_amount,
        l.platform_credits::numeric AS current_balance
      FROM locations l
      WHERE l.auto_refill_enabled = true
        AND l.id NOT IN (
          SELECT DISTINCT store_id
          FROM platform_credit_transactions
          WHERE type = 'topup'
            AND description ILIKE '%auto-refill%'
            AND created_at > NOW() - INTERVAL '30 days'
        )
      LIMIT 10
    `);

    const totals = totalsResult.rows[0] ?? {};

    return res.json({
      totals: {
        autoRefillCount:       Number(totals.auto_refill_count ?? 0),
        autoRefillTotalDollars: parseFloat(totals.auto_refill_total_dollars ?? 0),
        storesWithRefills:     Number(totals.stores_with_refills ?? 0),
        avgRefillAmount:       parseFloat(totals.avg_refill_amount ?? 0),
        enabledCount:          Number(enabledResult.rows[0]?.enabled_count ?? 0),
      },
      topStores:    topStoresResult.rows.map(r => ({
        storeId:       Number(r.store_id),
        storeName:     r.store_name,
        refillCount:   Number(r.refill_count),
        totalRefilled: parseFloat(r.total_refilled),
        lastRefillAt:  r.last_refill_at,
      })),
      recent:       recentResult.rows.map(r => ({
        id:           Number(r.id),
        storeId:      Number(r.store_id),
        storeName:    r.store_name,
        amount:       parseFloat(r.amount),
        balanceAfter: parseFloat(r.balance_after),
        referenceId:  r.reference_id,
        createdAt:    r.created_at,
      })),
      staleStores:  staleResult.rows.map(r => ({
        storeId:        Number(r.id),
        storeName:      r.name,
        threshold:      parseFloat(r.auto_refill_threshold ?? 5),
        amount:         parseFloat(r.auto_refill_amount ?? 25),
        currentBalance: parseFloat(r.current_balance ?? 0),
      })),
    });
  } catch (err: any) {
    console.error("[billing/admin/auto-refill-stats] Error:", err?.message);
    return res.status(500).json({ error: "Failed to load auto-refill stats" });
  }
});

export default router;

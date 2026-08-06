/**
 * routes/plans.ts — Subscription plans & feature management API
 *
 * Public endpoints (store-scoped):
 *   GET  /api/plans/my-features          — feature access for current store
 *   GET  /api/plans/my-plan              — current plan details for current store
 *
 * Admin-only endpoints (platform admin):
 *   GET    /api/plans/features            — list all features in registry
 *   POST   /api/plans/features            — create a new feature
 *   PATCH  /api/plans/features/:id        — update a feature
 *
 *   GET    /api/plans                     — list all subscription plans
 *   POST   /api/plans                     — create a plan
 *   PATCH  /api/plans/:planId             — update a plan
 *   DELETE /api/plans/:planId             — deactivate a plan
 *
 *   GET    /api/plans/:planId/features    — get plan's feature config
 *   PUT    /api/plans/:planId/features/:featureId  — set/update a plan feature
 *   DELETE /api/plans/:planId/features/:featureId  — remove feature from plan
 *
 *   POST   /api/plans/stores/:storeId/subscribe   — assign a plan to a store
 */

import { Router } from "express";
import { db } from "../db";
import {
  features,
  subscriptionPlans,
  planFeatures,
  storeSubscriptions,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { resolveFeature, resolveStorePlan } from "../lib/featureAccess";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isAdmin(req: any): Promise<boolean> {
  const userId = req.session?.userId ?? req.user?.id ?? null;
  if (!userId) return false;
  try {
    const [user] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    return user?.isAdmin === true;
  } catch {
    return false;
  }
}

function storeIdFromReq(req: any): number | null {
  const raw =
    req.query.storeId ||
    req.body?.storeId ||
    req.session?.storeId;
  const n = Number(raw);
  return n > 0 ? n : null;
}

// ─── Store-scoped: feature access summary ────────────────────────────────────

// GET /api/plans/my-features?storeId=X
// Returns the full feature access map for the store's active plan.
router.get("/my-features", async (req: any, res) => {
  const storeId = storeIdFromReq(req);
  if (!storeId) return res.status(400).json({ error: "storeId is required" });

  try {
    const plan = await resolveStorePlan(storeId);
    if (!plan) {
      return res.json({ planCode: null, features: {} });
    }

    // Fetch all features enabled on this plan
    const rows = await db
      .select({
        featureId: planFeatures.featureId,
        enabled: planFeatures.enabled,
        limitValue: planFeatures.limitValue,
      })
      .from(planFeatures)
      .where(eq(planFeatures.planId, plan.planId));

    // Also fetch all known features so we can report disabled ones too
    const allFeatures = await db
      .select({ id: features.id })
      .from(features)
      .where(eq(features.isActive, true));

    const featureMap: Record<string, {
      enabled: boolean;
      limit: number | null;
    }> = {};

    // Default all to disabled
    for (const f of allFeatures) {
      featureMap[f.id] = { enabled: false, limit: null };
    }

    // Apply plan overrides
    for (const row of rows) {
      featureMap[row.featureId] = {
        enabled: row.enabled,
        limit: row.limitValue ?? null,
      };
    }

    return res.json({ planCode: plan.planCode, features: featureMap });
  } catch (err: any) {
    console.error("[plans] GET /my-features error:", err?.message);
    return res.status(500).json({ error: "Failed to load feature access" });
  }
});

// GET /api/plans/my-plan?storeId=X
// Returns the active plan + subscription metadata (status, currentPeriodEnd, stripeSubscriptionId).
router.get("/my-plan", async (req: any, res) => {
  const storeId = storeIdFromReq(req);
  if (!storeId) return res.status(400).json({ error: "storeId is required" });

  try {
    // Join store_subscriptions to get renewal date and status alongside plan details
    const [row] = await db
      .select({
        id:                   subscriptionPlans.id,
        code:                 subscriptionPlans.code,
        name:                 subscriptionPlans.name,
        description:          subscriptionPlans.description,
        priceMonthly:         subscriptionPlans.priceMonthly,
        priceYearly:          subscriptionPlans.priceYearly,
        sortOrder:            subscriptionPlans.sortOrder,
        subscriptionStatus:   storeSubscriptions.status,
        currentPeriodEnd:     storeSubscriptions.currentPeriodEnd,
        stripeSubscriptionId: storeSubscriptions.stripeSubscriptionId,
        cancelAtPeriodEnd:    storeSubscriptions.cancelAtPeriodEnd,
      })
      .from(storeSubscriptions)
      .innerJoin(subscriptionPlans, eq(storeSubscriptions.planId, subscriptionPlans.id))
      .where(
        and(
          eq(storeSubscriptions.storeId, storeId),
          // Include past_due so stores with failed payments still see their plan + renewal date
          inArray(storeSubscriptions.status, ["active", "trialing", "past_due"])
        )
      )
      .orderBy(sql`${storeSubscriptions.id} DESC`)
      .limit(1);

    if (!row) {
      // Fall back: store is on free plan or has no subscription row — use resolveStorePlan
      // which itself falls back to the 'free' plan when no active subscription exists.
      const plan = await resolveStorePlan(storeId);
      if (!plan) return res.json(null);
      const [planRow] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, plan.planId))
        .limit(1);
      return res.json(planRow ?? null);
    }

    return res.json(row);
  } catch (err: any) {
    console.error("[plans] GET /my-plan error:", err?.message);
    return res.status(500).json({ error: "Failed to load plan" });
  }
});

// ─── Public: Plans listing (no admin required) ───────────────────────────────

// GET /api/plans/public-plans
// Returns all active + public plans with their enabled features.
// Used by the owner Subscription page to render plan cards.
router.get("/public-plans", async (req: any, res) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.isActive, true), eq(subscriptionPlans.isPublic, true)))
      .orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.id));

    const plansWithFeatures = await Promise.all(
      plans.map(async (plan) => {
        const featureRows = await db
          .select({
            featureId: planFeatures.featureId,
            enabled: planFeatures.enabled,
            limitValue: planFeatures.limitValue,
            featureName: features.name,
            featureCategory: features.category,
            featureDescription: features.description,
            sortOrder: features.sortOrder,
          })
          .from(planFeatures)
          .innerJoin(features, eq(planFeatures.featureId, features.id))
          .where(
            and(
              eq(planFeatures.planId, plan.id),
              eq(planFeatures.enabled, true),
              eq(features.isActive, true)
            )
          )
          .orderBy(asc(features.sortOrder), asc(features.category), asc(features.name));

        return { ...plan, features: featureRows };
      })
    );

    return res.json(plansWithFeatures);
  } catch (err: any) {
    console.error("[plans] GET /public-plans error:", err?.message);
    return res.status(500).json({ error: "Failed to load plans" });
  }
});

// ─── Admin: Feature registry ──────────────────────────────────────────────────

// GET /api/plans/features
router.get("/features", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  try {
    const rows = await db
      .select()
      .from(features)
      .orderBy(asc(features.sortOrder), asc(features.category), asc(features.name));
    return res.json(rows);
  } catch (err: any) {
    console.error("[plans] GET /features error:", err?.message);
    return res.status(500).json({ error: "Failed to list features" });
  }
});

const createFeatureSchema = z.object({
  id:          z.string().min(1).regex(/^[a-z0-9_]+$/, "id must be lowercase snake_case"),
  name:        z.string().min(1),
  description: z.string().optional(),
  category:    z.string().min(1),
  isActive:    z.boolean().optional().default(true),
  sortOrder:   z.number().int().optional().default(0),
});

// POST /api/plans/features
router.post("/features", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const parsed = createFeatureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    const [row] = await db.insert(features).values(parsed.data).returning();
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Feature id already exists" });
    console.error("[plans] POST /features error:", err?.message);
    return res.status(500).json({ error: "Failed to create feature" });
  }
});

const updateFeatureSchema = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().optional(),
  category:    z.string().min(1).optional(),
  isActive:    z.boolean().optional(),
  sortOrder:   z.number().int().optional(),
});

// PATCH /api/plans/features/:featureId
router.patch("/features/:featureId", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const parsed = updateFeatureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    const [row] = await db
      .update(features)
      .set(parsed.data)
      .where(eq(features.id, req.params.featureId))
      .returning();
    if (!row) return res.status(404).json({ error: "Feature not found" });
    return res.json(row);
  } catch (err: any) {
    console.error("[plans] PATCH /features/:id error:", err?.message);
    return res.status(500).json({ error: "Failed to update feature" });
  }
});

// ─── Admin: Subscription plans ────────────────────────────────────────────────

// GET /api/plans
router.get("/", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  try {
    const rows = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.id));
    return res.json(rows);
  } catch (err: any) {
    console.error("[plans] GET / error:", err?.message);
    return res.status(500).json({ error: "Failed to list plans" });
  }
});

const createPlanSchema = z.object({
  code:                 z.string().min(1).regex(/^[a-z0-9_]+$/),
  name:                 z.string().min(1),
  description:          z.string().optional(),
  priceMonthly:         z.number().int().min(0).optional().default(0),
  priceYearly:          z.number().int().min(0).optional().default(0),
  stripePriceIdMonthly: z.string().optional(),
  stripePriceIdYearly:  z.string().optional(),
  isActive:             z.boolean().optional().default(true),
  isPublic:             z.boolean().optional().default(true),
  sortOrder:            z.number().int().optional().default(0),
});

// POST /api/plans
router.post("/", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    const [row] = await db.insert(subscriptionPlans).values(parsed.data).returning();
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Plan code already exists" });
    console.error("[plans] POST / error:", err?.message);
    return res.status(500).json({ error: "Failed to create plan" });
  }
});

const updatePlanSchema = z.object({
  name:                 z.string().min(1).optional(),
  description:          z.string().optional(),
  priceMonthly:         z.number().int().min(0).optional(),
  priceYearly:          z.number().int().min(0).optional(),
  stripePriceIdMonthly: z.string().optional(),
  stripePriceIdYearly:  z.string().optional(),
  isActive:             z.boolean().optional(),
  isPublic:             z.boolean().optional(),
  sortOrder:            z.number().int().optional(),
});

// PATCH /api/plans/:planId
router.patch("/:planId", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const planId = Number(req.params.planId);
  if (!planId) return res.status(400).json({ error: "Invalid planId" });

  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    const [row] = await db
      .update(subscriptionPlans)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, planId))
      .returning();
    if (!row) return res.status(404).json({ error: "Plan not found" });
    return res.json(row);
  } catch (err: any) {
    console.error("[plans] PATCH /:planId error:", err?.message);
    return res.status(500).json({ error: "Failed to update plan" });
  }
});

// DELETE /api/plans/:planId  (soft-delete: sets is_active = false)
router.delete("/:planId", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const planId = Number(req.params.planId);
  if (!planId) return res.status(400).json({ error: "Invalid planId" });

  try {
    const [row] = await db
      .update(subscriptionPlans)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, planId))
      .returning();
    if (!row) return res.status(404).json({ error: "Plan not found" });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[plans] DELETE /:planId error:", err?.message);
    return res.status(500).json({ error: "Failed to deactivate plan" });
  }
});

// ─── Admin: Plan feature config ───────────────────────────────────────────────

// GET /api/plans/:planId/features
// Returns all plan_features rows joined with feature metadata.
router.get("/:planId/features", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const planId = Number(req.params.planId);
  if (!planId) return res.status(400).json({ error: "Invalid planId" });

  try {
    const rows = await db
      .select({
        id:          planFeatures.id,
        planId:      planFeatures.planId,
        featureId:   planFeatures.featureId,
        enabled:     planFeatures.enabled,
        limitValue:  planFeatures.limitValue,
        updatedAt:   planFeatures.updatedAt,
        name:        features.name,
        description: features.description,
        category:    features.category,
        sortOrder:   features.sortOrder,
      })
      .from(planFeatures)
      .innerJoin(features, eq(planFeatures.featureId, features.id))
      .where(eq(planFeatures.planId, planId))
      .orderBy(asc(features.sortOrder));

    return res.json(rows);
  } catch (err: any) {
    console.error("[plans] GET /:planId/features error:", err?.message);
    return res.status(500).json({ error: "Failed to load plan features" });
  }
});

const setPlanFeatureSchema = z.object({
  enabled:    z.boolean().optional().default(true),
  limitValue: z.number().int().positive().nullable().optional(),
});

// PUT /api/plans/:planId/features/:featureId
// Upserts a plan_features row (add or update).
router.put("/:planId/features/:featureId", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const planId = Number(req.params.planId);
  const featureId = req.params.featureId;
  if (!planId || !featureId) return res.status(400).json({ error: "Invalid params" });

  const parsed = setPlanFeatureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    const [row] = await db
      .insert(planFeatures)
      .values({
        planId,
        featureId,
        enabled:    parsed.data.enabled ?? true,
        limitValue: parsed.data.limitValue ?? null,
      })
      .onConflictDoUpdate({
        target: [planFeatures.planId, planFeatures.featureId],
        set: {
          enabled:    sql`excluded.enabled`,
          limitValue: sql`excluded.limit_value`,
          updatedAt:  sql`NOW()`,
        },
      })
      .returning();

    return res.json(row);
  } catch (err: any) {
    console.error("[plans] PUT /:planId/features/:featureId error:", err?.message);
    return res.status(500).json({ error: "Failed to set plan feature" });
  }
});

// DELETE /api/plans/:planId/features/:featureId
// Removes a feature from a plan (feature becomes inaccessible to that plan's stores).
router.delete("/:planId/features/:featureId", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const planId = Number(req.params.planId);
  const featureId = req.params.featureId;
  if (!planId || !featureId) return res.status(400).json({ error: "Invalid params" });

  try {
    await db
      .delete(planFeatures)
      .where(
        and(
          eq(planFeatures.planId, planId),
          eq(planFeatures.featureId, featureId)
        )
      );
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[plans] DELETE /:planId/features/:featureId error:", err?.message);
    return res.status(500).json({ error: "Failed to remove plan feature" });
  }
});

// ─── Admin: Assign plan to store ──────────────────────────────────────────────

const subscribeSchema = z.object({
  planId:    z.number().int().positive(),
  status:    z.enum(["active", "trialing"]).optional().default("active"),
});

// POST /api/plans/stores/:storeId/subscribe
router.post("/stores/:storeId/subscribe", async (req: any, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: "Admin only" });

  const storeId = Number(req.params.storeId);
  if (!storeId) return res.status(400).json({ error: "Invalid storeId" });

  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    // Cancel any existing active subscriptions for this store
    await db
      .update(storeSubscriptions)
      .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(storeSubscriptions.storeId, storeId),
          inArray(storeSubscriptions.status, ["active", "trialing"])
        )
      );

    // Create new subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [row] = await db
      .insert(storeSubscriptions)
      .values({
        storeId,
        planId: parsed.data.planId,
        status: parsed.data.status ?? "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    return res.status(201).json(row);
  } catch (err: any) {
    console.error("[plans] POST /stores/:storeId/subscribe error:", err?.message);
    return res.status(500).json({ error: "Failed to assign plan" });
  }
});

export default router;

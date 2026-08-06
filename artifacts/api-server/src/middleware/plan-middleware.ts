/**
 * plan-middleware.ts — Feature-gate enforcement middleware
 *
 * Provides Express middleware and helper functions for checking feature
 * access via the dynamic feature registry (plan_features table).
 * No hardcoded plan names — all entitlements come from the DB.
 */

import { Request, Response, NextFunction } from "express";
import { resolveFeature, canUseFeature } from "../lib/featureAccess";
import { db } from "../db";
import { and, count, eq } from "drizzle-orm";

// ─── requireFeature middleware ────────────────────────────────────────────────

/**
 * Express middleware that blocks the request if the store does not have
 * access to the specified feature.
 *
 * storeId is resolved (in priority order) from:
 *   req.params.storeId → req.query.storeId → req.body.storeId
 *
 * If no storeId is found, the request is allowed through (non-store routes).
 */
export function requireFeature(featureId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(
        (req.params as any)?.storeId ||
        req.query.storeId ||
        req.body?.storeId
      );
      if (!storeId) return next();

      const access = await resolveFeature(storeId, featureId);

      if (!access.enabled) {
        return res.status(403).json({
          message: `Your current plan does not include "${featureId}". Please upgrade to access this feature.`,
          code: "FEATURE_NOT_ENABLED",
          featureId,
          planCode: access.planCode,
        });
      }

      if (access.limit !== null && (access.remaining ?? 0) <= 0) {
        return res.status(403).json({
          message: `You have reached your ${featureId} limit (${access.limit}) for this billing period.`,
          code: "FEATURE_LIMIT_REACHED",
          featureId,
          planCode: access.planCode,
          limit: access.limit,
          used: access.used,
          remaining: 0,
        });
      }

      // Attach access info so downstream handlers can use it
      (req as any).featureAccess = access;
      next();
    } catch (err) {
      console.error("[requireFeature] Error checking feature access:", err);
      next(); // Fail open — do not block on infra errors
    }
  };
}

// ─── Staff limit helper ───────────────────────────────────────────────────────

/**
 * Checks whether a store can add another staff member based on
 * the 'staff' feature limit in their plan.
 */
export async function checkStaffLimit(
  storeId: number
): Promise<{ allowed: boolean; limit: number | null; current: number }> {
  const { staff } = await import("@shared/schema");
  const [{ value }] = await db
    .select({ value: count() })
    .from(staff)
    .where(eq(staff.storeId, storeId));
  const current = Number(value);

  const access = await resolveFeature(storeId, "staff");
  if (!access.enabled) return { allowed: false, limit: 0, current };
  if (access.limit === null) return { allowed: true, limit: null, current };

  return {
    allowed: current < access.limit,
    limit: access.limit,
    current,
  };
}

// ─── Client limit helper ──────────────────────────────────────────────────────

/**
 * Checks client count against plan limits.
 * Currently no plan gates clients — returns allowed: true.
 */
export async function checkClientLimit(
  storeId: number
): Promise<{ allowed: boolean; limit: number | null; current: number }> {
  const { clients: clientsTable } = await import("@shared/schema/clients");
  const { isNull: isNullOp } = await import("drizzle-orm");
  const [{ value }] = await db
    .select({ value: count() })
    .from(clientsTable)
    .where(and(eq(clientsTable.storeId, storeId), isNullOp(clientsTable.archivedAt)));
  const current = Number(value);
  return { allowed: true, limit: null, current };
}

// ─── Location limit helper ────────────────────────────────────────────────────

/**
 * Checks how many locations the given user already has and whether
 * their plan allows them to create another one.
 *
 * Pass the user's primary (existing) storeId to resolve the plan.
 * If no storeId is provided the check always passes (first location).
 */
export async function checkLocationLimit(
  userId: string,
  primaryStoreId: number | null
): Promise<{ allowed: boolean; limit: number | null; current: number }> {
  const { locations } = await import("@shared/schema");
  const [{ value }] = await db
    .select({ value: count() })
    .from(locations)
    .where(eq(locations.userId, userId));
  const current = Number(value);

  if (!primaryStoreId) return { allowed: true, limit: null, current };

  const access = await resolveFeature(primaryStoreId, "locations");
  if (!access.enabled) return { allowed: false, limit: 0, current };
  if (access.limit === null) return { allowed: true, limit: null, current };

  return {
    allowed: current < access.limit,
    limit: access.limit,
    current,
  };
}

// ─── Legacy compat — keep callers that used requirePlan compiling ─────────────

/** @deprecated Use requireFeature() instead. */
export function requirePlan(_minimumTier: string) {
  return async (_req: Request, _res: Response, next: NextFunction) => next();
}

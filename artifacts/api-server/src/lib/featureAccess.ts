/**
 * featureAccess.ts — Feature-gate access layer
 *
 * Single source of truth for "can this store use this feature?".
 * All backend routes and middleware must use `resolveFeature()` instead
 * of any hardcoded plan-name checks.
 *
 * Resolution logic:
 *   1. Find the store's active subscription (status = 'active' | 'trialing')
 *   2. Look up the plan_features row for that plan + feature
 *   3. Return { enabled, limit, used, remaining }
 *
 * If the store has no subscription, the system falls back to the 'free' plan.
 * This keeps existing stores functional after a plan expires.
 */

import { db } from "../db";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  storeSubscriptions,
  subscriptionPlans,
  planFeatures,
  featureUsage,
  locations,
} from "@shared/schema";
import { users } from "@shared/models/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureAccess {
  enabled: boolean;
  /** Hard cap. null = unlimited. */
  limit: number | null;
  /** Units consumed this billing period (0 if not tracked). */
  used: number;
  /** null when limit is null (unlimited). */
  remaining: number | null;
  /** The plan code that resolved this feature (e.g. 'pro'). */
  planCode: string;
}

export interface FeatureAccessDenied {
  enabled: false;
  reason: "no_plan" | "feature_disabled" | "limit_reached";
  limit: number | null;
  used: number;
  remaining: number | null;
  planCode: string;
}

// ─── Current billing period ───────────────────────────────────────────────────

/** Returns the period_start key (YYYY-MM-01) for the current calendar month. */
function currentPeriodStart(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// ─── Plan resolution ──────────────────────────────────────────────────────────

/**
 * Resolves the active plan for a store.
 *
 * Resolution order:
 *  1. Active/trialing store_subscription row (Stripe-managed or free_trial).
 *  2. If none exists, check whether the store's owner is on an active free
 *     trial (users.subscription_status = 'trial' and trial_ends_at > NOW()).
 *     If so, return the 'free_trial' plan so all features are unlocked.
 *  3. Fall back to the 'free' plan when the trial has expired or never started.
 */
export async function resolveStorePlan(storeId: number): Promise<{
  planId: number;
  planCode: string;
} | null> {
  // 1. Find active/trialing subscription
  const [sub] = await db
    .select({
      planId: storeSubscriptions.planId,
      planCode: subscriptionPlans.code,
    })
    .from(storeSubscriptions)
    .innerJoin(subscriptionPlans, eq(storeSubscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(storeSubscriptions.storeId, storeId),
        inArray(storeSubscriptions.status, ["active", "trialing"])
      )
    )
    .orderBy(sql`${storeSubscriptions.id} DESC`)
    .limit(1);

  if (sub) return { planId: sub.planId, planCode: sub.planCode };

  // 2. No subscription row — check if the store owner is on an active trial.
  const [store] = await db
    .select({ userId: locations.userId })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  if (store?.userId) {
    const [user] = await db
      .select({
        subscriptionStatus: users.subscriptionStatus,
        trialEndsAt: users.trialEndsAt,
      })
      .from(users)
      .where(eq(users.id, store.userId))
      .limit(1);

    const now = new Date();
    const onActiveTrial =
      user?.subscriptionStatus === "trial" &&
      user?.trialEndsAt != null &&
      new Date(user.trialEndsAt) > now;

    const targetCode = onActiveTrial ? "free_trial" : "free";

    const [plan] = await db
      .select({ id: subscriptionPlans.id, code: subscriptionPlans.code })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.code, targetCode))
      .limit(1);

    if (plan) return { planId: plan.id, planCode: plan.code };
  }

  // 3. Fall back to 'free' plan (safety net — should always exist).
  const [freePlan] = await db
    .select({ id: subscriptionPlans.id, code: subscriptionPlans.code })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.code, "free"))
    .limit(1);

  if (!freePlan) return null;

  return { planId: freePlan.id, planCode: freePlan.code };
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolves feature access for a store.
 *
 * @param storeId   The locations.id of the store.
 * @param featureId The string key from the features registry (e.g. 'sms_notifications').
 * @returns         FeatureAccess describing entitlement + current usage.
 */
export async function resolveFeature(
  storeId: number,
  featureId: string
): Promise<FeatureAccess> {
  const plan = await resolveStorePlan(storeId);

  const unknownPlan = { planCode: "free" };

  if (!plan) {
    return {
      enabled: false,
      limit: 0,
      used: 0,
      remaining: 0,
      planCode: unknownPlan.planCode,
    };
  }

  // Look up plan_features row
  const [pf] = await db
    .select({
      enabled: planFeatures.enabled,
      limitValue: planFeatures.limitValue,
    })
    .from(planFeatures)
    .where(
      and(
        eq(planFeatures.planId, plan.planId),
        eq(planFeatures.featureId, featureId)
      )
    )
    .limit(1);

  // Feature not in plan → disabled
  if (!pf || !pf.enabled) {
    return {
      enabled: false,
      limit: pf?.limitValue ?? null,
      used: 0,
      remaining: 0,
      planCode: plan.planCode,
    };
  }

  // No limit → unlimited
  if (pf.limitValue === null) {
    return {
      enabled: true,
      limit: null,
      used: 0,
      remaining: null,
      planCode: plan.planCode,
    };
  }

  // Has a limit — look up current usage
  const period = currentPeriodStart();
  const [usage] = await db
    .select({ usageCount: featureUsage.usageCount })
    .from(featureUsage)
    .where(
      and(
        eq(featureUsage.storeId, storeId),
        eq(featureUsage.featureId, featureId),
        eq(featureUsage.periodStart, period)
      )
    )
    .limit(1);

  const used = usage?.usageCount ?? 0;
  const remaining = Math.max(0, pf.limitValue - used);

  return {
    enabled: true,
    limit: pf.limitValue,
    used,
    remaining,
    planCode: plan.planCode,
  };
}

// ─── Usage tracking ───────────────────────────────────────────────────────────

/**
 * Increments the usage counter for a feature in the current billing period.
 * Uses an upsert so concurrent calls are safe.
 *
 * @param storeId   The store consuming the feature.
 * @param featureId The feature being used.
 * @param by        How many units to add (default 1).
 */
export async function incrementFeatureUsage(
  storeId: number,
  featureId: string,
  by = 1
): Promise<void> {
  const period = currentPeriodStart();

  await db
    .insert(featureUsage)
    .values({
      storeId,
      featureId,
      periodStart: period,
      usageCount: by,
    })
    .onConflictDoUpdate({
      target: [featureUsage.storeId, featureUsage.featureId, featureUsage.periodStart],
      set: {
        usageCount: sql`${featureUsage.usageCount} + ${by}`,
        lastUpdatedAt: sql`NOW()`,
      },
    });
}

// ─── Wallet-fallback SMS gate ─────────────────────────────────────────────────

/**
 * Per-SMS wallet deduction rate in USD ($0.02).
 * Override via SMS_WALLET_RATE_USD env var if needed.
 */
export const SMS_WALLET_RATE_USD = parseFloat(process.env.SMS_WALLET_RATE_USD ?? "0.02");

export interface SmsAccessResult {
  allowed: boolean;
  /**
   * "plan"   = covered by monthly sms_allowance (subscription bucket).
   * "wallet" = allowance empty; will deduct $0.02 from platformCredits.
   * "none"   = blocked — no allowance and insufficient wallet.
   */
  source: "plan" | "wallet" | "none";
  /** Remaining monthly allowance (meaningful when source === "plan"). */
  allowanceRemaining: number;
  walletBalance: number;
  /** USD to deduct per message when source === "wallet". */
  rateUsd: number;
  /** Human-readable reason when allowed === false. */
  blockReason?: "no_allowance" | "insufficient_wallet";
}

/**
 * Resolves SMS send permission — monthly allowance first, wallet fallback second.
 *
 * Resolution order:
 *  1. locations.sms_allowance > 0 → "plan" (deduction is atomic inside sendSms).
 *  2. Allowance = 0 → check platformCredits >= $0.02 → "wallet".
 *  3. Both exhausted → blocked ("none").
 *
 * NOTE: This function is read-only. Actual deduction is performed atomically
 * inside sendSms() so there is no TOCTOU issue.
 */
export async function resolveSmsAccess(storeId: number): Promise<SmsAccessResult> {
  const [store] = await db
    .select({ smsAllowance: locations.smsAllowance, platformCredits: locations.platformCredits })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  const allowance = store?.smsAllowance ?? 0;
  const balance   = parseFloat(store?.platformCredits ?? "0");

  if (allowance > 0) {
    return { allowed: true, source: "plan", allowanceRemaining: allowance, walletBalance: balance, rateUsd: 0 };
  }

  if (balance >= SMS_WALLET_RATE_USD) {
    return { allowed: true, source: "wallet", allowanceRemaining: 0, walletBalance: balance, rateUsd: SMS_WALLET_RATE_USD };
  }

  const blockReason: SmsAccessResult["blockReason"] = balance <= 0 ? "no_allowance" : "insufficient_wallet";
  return { allowed: false, source: "none", allowanceRemaining: 0, walletBalance: balance, rateUsd: SMS_WALLET_RATE_USD, blockReason };
}

/**
 * Deducts rateUsd from the store's platformCredits and records the ledger entry.
 * Fire-and-forget safe — never throws. Used externally; sendSms() calls this internally.
 */
export async function deductSmsWalletCharge(storeId: number, rateUsd: number, description = "SMS message (wallet)"): Promise<void> {
  try {
    const updated = await db
      .update(locations)
      .set({ platformCredits: sql`COALESCE(platform_credits, 0) - ${rateUsd.toFixed(4)}` })
      .where(eq(locations.id, storeId))
      .returning({ balance: locations.platformCredits });

    const newBalance = parseFloat(updated[0]?.balance ?? "0");

    const { logCreditTransaction } = await import("./creditLedger");
    await logCreditTransaction({
      storeId,
      type: "sms",
      amount: -rateUsd,
      description,
      balanceAfter: newBalance,
    });
  } catch (err: any) {
    console.error("[featureAccess] Failed to deduct SMS wallet charge:", err.message);
  }
}

// ─── Convenience gate ─────────────────────────────────────────────────────────

/**
 * Returns true if the store can use the feature right now (enabled and not over limit).
 * Quick boolean check for middleware guards.
 */
export async function canUseFeature(
  storeId: number,
  featureId: string
): Promise<boolean> {
  const access = await resolveFeature(storeId, featureId);
  if (!access.enabled) return false;
  if (access.limit === null) return true;
  return (access.remaining ?? 0) > 0;
}

import { db } from "../db";
import { users } from "@shared/models/auth";
import { locations, storeSubscriptions } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export interface TrialStatus {
  isActive: boolean;
  daysRemaining: number | null;
  subscriptionStatus: string;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
}

export class TrialService {
  /**
   * Get the free trial days setting — reads TRIAL_PERIOD_DAYS env var,
   * falls back to 60 days if not set. The /isadmin Platform Settings page
   * surfaces this same value (via GET /api/admin/platform-settings).
   */
  static async getFreeTrialDays(): Promise<number> {
    const envDays = parseInt(process.env.TRIAL_PERIOD_DAYS || '', 10);
    return isNaN(envDays) || envDays <= 0 ? 60 : envDays;
  }

  /**
   * Set up trial for a new user.
   *
   * Only account owners hold a subscription — calling this for a manager or
   * staff user would wrongly put their row into 'trial' status, causing the
   * trial-reminder and trial-expiration schedulers to email them. Non-owner
   * roles are explicitly rejected here so the guard is enforced in one place
   * regardless of the call site.
   */
  static async setupTrialForUser(userId: string): Promise<void> {
    // Guard: verify the user exists and is an account owner before starting a trial.
    // Fail-closed: any state other than an explicit owner/admin role is blocked.
    const [existingUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existingUser) {
      // User not found — do not mutate anything.
      console.warn(`[TrialService] setupTrialForUser: user ${userId} not found, no action taken`);
      return;
    }

    const role = existingUser.role ?? null;
    const isOwnerRole = role !== null && ["owner", "admin"].includes(role);

    if (!isOwnerRole) {
      // Non-owner users (managers, staff, null/unknown role) do not hold a
      // subscription. Reset to 'active' so they can access the dashboard
      // without being caught by trial lifecycle schedulers.
      // The WHERE clause also filters by role to prevent a race condition where
      // the role changes between the SELECT and this UPDATE.
      await db.update(users)
        .set({ subscriptionStatus: "active", trialStartedAt: null, trialEndsAt: null })
        .where(and(eq(users.id, userId), sql`${users.role} NOT IN ('owner', 'admin') OR ${users.role} IS NULL`));
      console.warn(`[TrialService] setupTrialForUser blocked for non-owner user ${userId} (role: ${role ?? "null"}) — reset to active`);
      return;
    }

    const freeTrialDays = await this.getFreeTrialDays();

    if (freeTrialDays <= 0) {
      // Trials are disabled, set to inactive — still scoped to owner/admin only.
      await db.update(users)
        .set({ subscriptionStatus: 'inactive', trialStartedAt: null, trialEndsAt: null })
        .where(and(eq(users.id, userId), inArray(users.role, ["owner", "admin"])));
      return;
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + freeTrialDays * 24 * 60 * 60 * 1000);

    // The role filter in WHERE eliminates the race window between the SELECT
    // above and this UPDATE: if the role changes concurrently, the update
    // simply touches zero rows rather than incorrectly setting trial status.
    await db.update(users)
      .set({ subscriptionStatus: 'trial', trialStartedAt: now, trialEndsAt })
      .where(and(eq(users.id, userId), inArray(users.role, ["owner", "admin"])));
  }

  /**
   * Get trial status for a user
   */
  static async getTrialStatus(userId: string): Promise<TrialStatus> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error("User not found");
    }

    const now = new Date();
    let isActive = false;
    let daysRemaining: number | null = null;

    // Treat null/undefined as 'active' for backward compatibility with users
    // who existed before the trial system was introduced.
    const status = user.subscriptionStatus ?? 'active';

    if (status === 'active') {
      isActive = true;
    } else if (status === 'trial' && user.trialEndsAt) {
      if (now <= user.trialEndsAt) {
        isActive = true;
        const diffTime = user.trialEndsAt.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      } else {
        // Trial has expired, update status
        await db.update(users)
          .set({ subscriptionStatus: 'expired' })
          .where(eq(users.id, userId));
        
        user.subscriptionStatus = 'expired';
      }
    }

    return {
      isActive,
      daysRemaining,
      subscriptionStatus: status,
      trialStartedAt: user.trialStartedAt || null,
      trialEndsAt: user.trialEndsAt || null
    };
  }

  /**
   * Check if user can perform booking actions.
   * Returns true when any of the following is true:
   *  1. users.subscriptionStatus is 'active' or a valid unexpired 'trial'
   *  2. The store has an active or trialing Stripe subscription in store_subscriptions
   *
   * Checking both tables ensures paying Stripe subscribers are never blocked
   * if users.subscriptionStatus hasn't been synced back (e.g. after a fresh
   * Stripe webhook that only wrote to store_subscriptions).
   */
  static async canPerformBookingActions(userId: string): Promise<boolean> {
    const trialStatus = await this.getTrialStatus(userId);
    if (trialStatus.isActive) return true;

    // Fall back to checking store_subscriptions for an active paid subscription
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

    return sub?.status === 'active' || sub?.status === 'trialing';
  }

  /**
   * Extend trial for a user (admin function)
   */
  static async extendTrial(userId: string, additionalDays: number): Promise<void> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error("User not found");
    }

    const newTrialEndsAt = new Date();
    if (user.trialEndsAt && user.trialEndsAt > newTrialEndsAt) {
      // Extend from existing end date
      newTrialEndsAt.setTime(user.trialEndsAt.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    } else {
      // Start from now
      newTrialEndsAt.setTime(newTrialEndsAt.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    }

    await db.update(users)
      .set({
        subscriptionStatus: 'trial',
        trialEndsAt: newTrialEndsAt,
        trialStartedAt: user.trialStartedAt || new Date()
      })
      .where(eq(users.id, userId));

    // Also sync store_subscriptions.current_period_end so the billing page
    // reflects the new trial end date immediately.
    const [store] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.userId, userId))
      .limit(1);

    if (store) {
      await db
        .update(storeSubscriptions)
        .set({ currentPeriodEnd: newTrialEndsAt, status: 'trialing', updatedAt: new Date() })
        .where(and(
          eq(storeSubscriptions.storeId, store.id),
          eq(storeSubscriptions.status, 'trialing'),
        ));
    }
  }

  /**
   * Reset trial for a user (admin function)
   */
  static async resetTrial(userId: string): Promise<void> {
    const freeTrialDays = await this.getFreeTrialDays();
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + freeTrialDays * 24 * 60 * 60 * 1000);

    await db.update(users)
      .set({
        subscriptionStatus: 'trial',
        trialStartedAt: now,
        trialEndsAt: trialEndsAt
      })
      .where(eq(users.id, userId));
  }

  /**
   * Convert trial to active subscription (admin function)
   */
  static async activateSubscription(userId: string): Promise<void> {
    await db.update(users)
      .set({
        subscriptionStatus: 'active',
        trialEndsAt: null
      })
      .where(eq(users.id, userId));
  }

  /**
   * Cancel subscription (admin function)
   */
  static async cancelSubscription(userId: string): Promise<void> {
    await db.update(users)
      .set({
        subscriptionStatus: 'cancelled'
      })
      .where(eq(users.id, userId));
  }
}

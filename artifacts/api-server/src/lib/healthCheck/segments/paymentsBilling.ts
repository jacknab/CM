import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";
import { differenceInDays } from "date-fns";

export async function paymentsBilling(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];

  const [subRes, paymentRes, storeRes] = await Promise.all([
    // The plan as billing runs it today (store_subscriptions, services/saas-billing.ts) and the owner's trial; the old
    // subscriptions table is no longer written, so every account looked like it had no plan (found 2026-11-04).
    pool.query(
      `SELECT ss.status, sp.code AS plan_code,
              CASE WHEN u.account_type = 'certxa_pro' THEN CASE WHEN sp.code = 'solo_plus' THEN 'Certxa Pro+' ELSE 'Certxa Pro' END ELSE sp.name END AS plan_name,
              u.subscription_status, u.trial_ends_at
         FROM locations l
         LEFT JOIN users u ON u.id = l.user_id
         LEFT JOIN LATERAL (
           SELECT ss.status, ss.plan_id FROM store_subscriptions ss
            WHERE ss.store_id = l.id AND ss.status IN ('active', 'trialing', 'past_due') ORDER BY ss.id DESC LIMIT 1
         ) ss ON true
         LEFT JOIN subscription_plans sp ON sp.id = ss.plan_id
        WHERE l.id = $1`,
      [accountId],
    ),
    pool.query(
      `SELECT charges_enabled, payouts_enabled, details_submitted, provider_account_id, status
       FROM store_payment_accounts WHERE store_id = $1`,
      [accountId],
    ),
    pool.query(`SELECT booking_payment_policy, platform_credits FROM locations WHERE id = $1`, [accountId]),
  ]);

  const sub = subRes.rows[0];
  const payment = paymentRes.rows[0];
  const store = storeRes.rows[0] ?? {};

  // 7a. Subscription & trial
  const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const daysLeft = trialEnd && !isNaN(trialEnd.getTime()) ? differenceInDays(trialEnd, new Date()) : null;
  if (sub?.subscription_status === "trial") {
    if (daysLeft !== null && daysLeft < 7) {
      checks.push(warn("subscription", "Subscription or trial active", `Trial expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`, "Accounts → Extend Trial"));
    } else {
      checks.push(pass("subscription", "Subscription or trial active", `On trial — ${daysLeft !== null ? `${daysLeft} days remaining` : "end date unknown"}`));
    }
  } else if (sub?.status && sub.plan_code !== "free_trial") {
    if (sub.status === "past_due") {
      checks.push(warn("subscription", "Subscription or trial active", `${sub.plan_name ?? "Plan"} — the last payment failed.`, "Billing"));
    } else {
      checks.push(pass("subscription", "Subscription or trial active", `${sub.plan_name ?? "Plan"} — ${sub.status}`));
    }
  } else if (sub?.subscription_status === "expired") {
    checks.push(fail("subscription", "Subscription or trial active", "The free trial has ended and no plan has been chosen.", "Accounts → Extend Trial"));
  } else {
    checks.push(warn("subscription", "Subscription or trial active", "No active plan or trial found for this account.", "Billing"));
  }

  // 7b. Stripe Connect
  const policy = store.booking_payment_policy ?? "none";
  const needsStripe = policy === "deposit" || policy === "card_on_file";

  if (!payment) {
    if (needsStripe) {
      checks.push(fail("stripe_connect", "Stripe Connect account linked", `Payment policy is "${policy}" but no Stripe Connect account is linked — deposits cannot be collected.`, "Settings → Payments → Connect Stripe"));
    } else {
      checks.push(pass("stripe_connect", "Stripe Connect account linked", `No Stripe Connect account (payment policy: ${policy}).`));
    }
  } else if (!payment.charges_enabled) {
    checks.push(warn("stripe_connect", "Stripe Connect account linked", `Stripe account linked (${payment.provider_account_id}) but charges are not enabled — onboarding may be incomplete.`, "Settings → Payments → Complete Stripe Onboarding"));
  } else {
    checks.push(pass("stripe_connect", "Stripe Connect account linked", `Stripe Connect active — charges enabled.`));
  }

  // 7c. Platform credits wallet
  const credits = parseFloat(store.platform_credits ?? "0");
  if (credits < 0) {
    checks.push(warn("platform_credits", "Platform credits balance healthy", `Platform credits balance is negative ($${credits.toFixed(2)}) — SMS or other credit-funded features may be blocked.`, "Billing → Credits → Top Up"));
  } else {
    checks.push(pass("platform_credits", "Platform credits balance healthy", `Balance: $${credits.toFixed(2)}`));
  }

  return {
    segmentId: "payments_billing",
    label: "Payments & Billing",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
  };
}

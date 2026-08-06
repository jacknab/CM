import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";
import { differenceInDays } from "date-fns";

export async function paymentsBilling(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];

  const [subRes, paymentRes, storeRes] = await Promise.all([
    pool.query(
      `SELECT s.status, s.current_period_end,
              bp.name AS plan_name, bp.price_cents
       FROM subscriptions s
       LEFT JOIN billing_plans bp ON bp.code = s.plan_code
       WHERE s.store_number = $1
       ORDER BY s.created_at DESC LIMIT 1`,
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
  if (!sub) {
    checks.push(warn("subscription", "Subscription or trial active", "No subscription record found — the account may not have a plan assigned.", "Admin → Subscriptions → Assign Plan"));
  } else {
    const status = sub.status ?? "unknown";
    // current_period_end is a text column (ISO string or Stripe timestamp)
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const daysLeft = periodEnd && !isNaN(periodEnd.getTime()) ? differenceInDays(periodEnd, new Date()) : null;

    if (status === "canceled" || status === "cancelled" || status === "lapsed") {
      checks.push(fail("subscription", "Subscription or trial active", `Subscription is ${status} — the account has no active plan.`, "Admin → Subscriptions → Renew"));
    } else if (status === "trialing" || status === "trial") {
      if (daysLeft !== null && daysLeft < 7) {
        checks.push(warn("subscription", "Subscription or trial active", `Trial expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} (${sub.plan_name ?? "plan"}).`, "Admin → Accounts → Extend Trial"));
      } else {
        checks.push(pass("subscription", "Subscription or trial active", `On trial — ${daysLeft !== null ? `${daysLeft} days remaining` : "end date unknown"} (${sub.plan_name ?? "plan"})`));
      }
    } else {
      checks.push(pass("subscription", "Subscription or trial active", `${sub.plan_name ?? "Plan"} — ${status}`));
    }
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

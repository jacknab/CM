/**
 * services/saas-billing.ts — in-house billing for the Certxa SaaS plans.
 *
 * Stripe Subscriptions are no longer used. Stripe stores the card (a SetupIntent confirmed in the
 * embedded Payment Element on the billing page); Certxa keeps one saas_billing_profiles row per
 * store with the amount to charge, and the billing run (saasBillingCore.ts) charges it every
 * interval_days (31) and logs every attempt in saas_billing_charges.
 *
 * SAAS_BILLING_MODE in /etc/certxa.env controls the scheduled run:
 *   off      (default) nothing runs
 *   dry_run  logs and records what would be charged — no card is touched
 *   live     charges cards
 * A charge the owner asks for (subscribing, paying after a failure) always goes through,
 * whatever the mode.
 *
 * Access follows the charges:
 *   charged    → store_subscriptions active for the new period, account Active
 *   declined   → nothing changes while the retries run (1, 3 and 5 days later)
 *   suspended  → after the last retry: store_subscriptions past_due, account Suspended
 *   canceled   → the owner cancelled and the paid period ran out
 */

import { pool } from "../db";
import { stripe, isStripeConfigured } from "../lib/stripe";
import { cache } from "../cache";
import { broadcastNotification } from "../notifications";
import { emitPlatformEmailEvent } from "./platform-email-engine";
import { runSaasBilling, chargeProfile, type BillingDeps, type BillingMode, type BillingResult } from "./saasBillingCore";

const RUN_EVERY_MS = 60 * 60 * 1000;

export function billingMode(): BillingMode {
  const m = String(process.env.SAAS_BILLING_MODE ?? "off").trim().toLowerCase();
  return m === "live" || m === "dry_run" ? m : "off";
}

function deps(mode: BillingMode): BillingDeps {
  return {
    query: (text, params) => pool.query(text, params as any[]),
    stripe: {
      paymentIntents: {
        create: (params, options) => stripe.paymentIntents.create(params as any, options),
        retrieve: (id) => stripe.paymentIntents.retrieve(id),
      },
    },
    mode,
    log: (m) => console.log(m),
    onResult: applyResult,
  };
}

async function setAccountStatus(storeId: number, status: "Active" | "Suspended"): Promise<{ userId: string | null; changed: boolean }> {
  const before = await pool.query(`SELECT account_status, user_id FROM locations WHERE id = $1`, [storeId]);
  const row = before.rows[0];
  if (!row) return { userId: null, changed: false };
  const changed = String(row.account_status ?? "").toLowerCase() !== status.toLowerCase();
  if (changed) {
    await pool.query(`UPDATE locations SET account_status = $2 WHERE id = $1`, [storeId, status]);
    cache.billing.invalidate(storeId);
    broadcastNotification({ type: "account_status_changed", storeId, accountStatus: status.toLowerCase() as "active" | "suspended" });
    console.log(`[saas-billing] storeId=${storeId} accountStatus → ${status}`);
  }
  return { userId: row.user_id ?? null, changed };
}

/** Make the account's access match what just happened to its charge. */
export async function applyResult(r: BillingResult): Promise<void> {
  if (r.outcome === "charged") {
    await pool.query(
      `UPDATE store_subscriptions s
          SET status = 'active', current_period_start = p.last_charged_at, current_period_end = p.next_charge_at, updated_at = now()
         FROM saas_billing_profiles p
        WHERE p.id = $1 AND s.id = (
              SELECT id FROM store_subscriptions
               WHERE store_id = p.store_id AND status IN ('active', 'trialing', 'past_due')
               ORDER BY id DESC LIMIT 1)`,
      [r.profileId],
    );
    const { userId, changed } = await setAccountStatus(r.storeId, "Active");
    if (userId && changed) emitPlatformEmailEvent("account_reactivated", userId, { source: "saas_billing" }).catch(() => {});
    return;
  }
  if (r.outcome === "declined") {
    const owner = await pool.query(`SELECT user_id FROM locations WHERE id = $1`, [r.storeId]);
    const userId = owner.rows[0]?.user_id;
    if (userId) emitPlatformEmailEvent("payment_failed", userId, { source: "saas_billing", attempt: r.attempt, reason: r.message }).catch(() => {});
    return;
  }
  // Certxa Pro Plus is an extra on the free Solo plan: when its payment finally fails, or the owner's
  // cancellation takes effect, the account goes back to free Solo — it is never suspended (owner, 2026-10-30).
  if ((r.outcome === "suspended" || r.outcome === "canceled") && await isSoloPlusProfile(r.profileId)) {
    await backToSolo(r.storeId, r.outcome === "suspended" ? "payment_failed" : "canceled");
    return;
  }
  if (r.outcome === "suspended") {
    await pool.query(
      `UPDATE store_subscriptions SET status = 'past_due', updated_at = now()
        WHERE store_id = $1 AND status IN ('active', 'trialing')`,
      [r.storeId],
    );
    const { userId } = await setAccountStatus(r.storeId, "Suspended");
    if (userId) emitPlatformEmailEvent("account_suspended", userId, { source: "saas_billing_payment_failed" }).catch(() => {});
    return;
  }
  if (r.outcome === "canceled") {
    await pool.query(
      `UPDATE store_subscriptions SET status = 'canceled', canceled_at = now(), updated_at = now()
        WHERE store_id = $1 AND status IN ('active', 'trialing', 'past_due')`,
      [r.storeId],
    );
    cache.billing.invalidate(r.storeId);
  }
}

async function isSoloPlusProfile(profileId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM saas_billing_profiles p JOIN subscription_plans sp ON sp.id = p.plan_id WHERE p.id = $1 AND sp.code = 'solo_plus'`,
    [profileId],
  );
  return !!r.rows[0];
}

/** Plus has ended: the store is on the free Solo plan again. */
export async function backToSolo(storeId: number, why: string): Promise<void> {
  const solo = await pool.query(`SELECT id FROM subscription_plans WHERE code = 'solo' LIMIT 1`);
  if (!solo.rows[0]) { console.error(`[saas-billing] no 'solo' plan — storeId=${storeId} left as it is`); return; }
  await pool.query(
    `UPDATE store_subscriptions SET status = 'canceled', canceled_at = now(), updated_at = now()
      WHERE store_id = $1 AND status IN ('active', 'trialing', 'past_due')`,
    [storeId],
  );
  await pool.query(
    `INSERT INTO store_subscriptions (store_id, plan_id, status, current_period_start, created_at, updated_at, cancel_at_period_end)
     VALUES ($1, $2, 'active', now(), now(), now(), false)`,
    [storeId, solo.rows[0].id],
  );
  cache.billing.invalidate(storeId);
  console.log(`[saas-billing] storeId=${storeId} Plus ended (${why}) → free Solo`);
}

let running = false;
async function tick(): Promise<void> {
  if (running || !isStripeConfigured()) return;
  running = true;
  try {
    const results = await runSaasBilling(deps(billingMode()));
    if (results.length) {
      const count = (o: string) => results.filter((r) => r.outcome === o).length;
      console.log(`[saas-billing] run finished (${billingMode()}): ${results.length} profiles — charged ${count("charged")}, declined ${count("declined")}, suspended ${count("suspended")}, pending ${count("pending")}, needs_review ${count("needs_review")}, dry_run ${count("dry_run")}`);
    }
  } catch (err: any) {
    console.error("[saas-billing] run failed:", err?.message ?? err);
  } finally {
    running = false;
  }
}

export function startSaasBillingScheduler(): void {
  const mode = billingMode();
  console.log(`[saas-billing] scheduled billing mode: ${mode}`);
  if (mode === "off") return;
  setTimeout(() => { void tick(); }, 2 * 60 * 1000);
  setInterval(() => { void tick(); }, RUN_EVERY_MS);
}

// ── Subscribing ──────────────────────────────────────────────────────────────

export interface StartSubscription {
  storeId: number;
  plan: { id: number; name: string; priceMonthly: number; priceYearly: number };
  interval: "month" | "year";
  customerId: string;
  paymentMethodId: string;
  /** Days of free trial left, if any: the card is saved now and first charged when the trial ends. */
  trialDays?: number;
}

export type StartResult =
  | { ok: true; status: "active" | "trialing"; nextChargeAt: Date }
  | { ok: false; httpStatus: number; error: string };

/**
 * The owner confirmed a card and picked a plan. Record the card on file and the amount, take the
 * first charge now (unless a trial is running), and open the plan.
 */
export async function startInHouseSubscription(input: StartSubscription): Promise<StartResult> {
  const { storeId, plan, interval, customerId, paymentMethodId } = input;
  const amountCents = interval === "year" ? plan.priceYearly : plan.priceMonthly;
  const intervalDays = interval === "year" ? 365 : 31;
  if (!(amountCents > 0)) return { ok: false, httpStatus: 400, error: "This plan has no price configured." };

  let card: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } = {};
  try { card = ((await stripe.paymentMethods.retrieve(paymentMethodId)) as any).card ?? {}; } catch { /* details are for display only */ }

  const existing = (await pool.query(`SELECT * FROM saas_billing_profiles WHERE store_id = $1`, [storeId])).rows[0];
  if (existing?.status === "needs_review") {
    return { ok: false, httpStatus: 409, error: "A previous payment on this account is still being checked. Please contact support before trying again." };
  }

  const now = new Date();
  const trialDays = input.trialDays && input.trialDays > 0 ? input.trialDays : 0;
  // An account that is paid up and simply changing plan keeps its dates: the new price applies
  // from its next charge. Everyone else is charged now (or when their trial ends).
  const keepDates = existing?.status === "active" && existing.last_charged_at && new Date(existing.next_charge_at) > now;
  const chargeNow = !keepDates && trialDays === 0;
  const due = keepDates ? new Date(existing.next_charge_at) : new Date(now.getTime() + trialDays * 86_400_000);

  const saved = await pool.query(
    `INSERT INTO saas_billing_profiles
       (store_id, plan_id, amount_cents, interval_days, stripe_customer_id, stripe_payment_method_id,
        card_brand, card_last4, card_exp_month, card_exp_year, status, next_charge_at, next_attempt_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$11)
     ON CONFLICT (store_id) DO UPDATE SET
       plan_id = EXCLUDED.plan_id, amount_cents = EXCLUDED.amount_cents, interval_days = EXCLUDED.interval_days,
       stripe_customer_id = EXCLUDED.stripe_customer_id, stripe_payment_method_id = EXCLUDED.stripe_payment_method_id,
       card_brand = EXCLUDED.card_brand, card_last4 = EXCLUDED.card_last4,
       card_exp_month = EXCLUDED.card_exp_month, card_exp_year = EXCLUDED.card_exp_year,
       status = 'active', next_charge_at = EXCLUDED.next_charge_at, next_attempt_at = EXCLUDED.next_attempt_at,
       last_error = NULL, cancel_at_period_end = false, canceled_at = NULL, updated_at = now()
     RETURNING id, next_charge_at`,
    [storeId, plan.id, amountCents, intervalDays, customerId, paymentMethodId,
     card.brand ?? null, card.last4 ?? null, card.exp_month ?? null, card.exp_year ?? null, due],
  );
  const profileId: number = saved.rows[0].id;
  let nextChargeAt: Date = new Date(saved.rows[0].next_charge_at);

  if (chargeNow) {
    const d = deps("live");
    d.onResult = undefined;
    let result = await chargeProfile(d, profileId);
    if (result?.outcome === "pending") {
      // Stripe did not answer. Ask once more — the same idempotency key, so never a second charge.
      await new Promise((r) => setTimeout(r, 2500));
      result = await chargeProfile(d, profileId);
    }
    if (!result || result.outcome !== "charged") {
      const declined = result?.outcome === "declined" || result?.outcome === "suspended";
      if (declined && !existing) {
        // Nothing was paid and there was no plan before: leave no profile behind to be retried.
        await pool.query(`DELETE FROM saas_billing_profiles WHERE id = $1`, [profileId]);
      } else if (declined) {
        // Put the account back as it was. failed_attempts stays raised so that another try today
        // gets its own attempt number (and so its own idempotency key).
        await pool.query(
          `UPDATE saas_billing_profiles SET status = $2, next_attempt_at = $3, next_charge_at = $4 WHERE id = $1`,
          [profileId, existing.status, existing.next_attempt_at, existing.next_charge_at],
        );
      }
      return declined
        ? { ok: false, httpStatus: 402, error: result?.message || "Your card was declined. Please try a different card." }
        : { ok: false, httpStatus: 502, error: "We could not confirm the payment with the card processor. You have not been charged twice. Please try again in a few minutes or contact support." };
    }
    nextChargeAt = new Date((await pool.query(`SELECT next_charge_at FROM saas_billing_profiles WHERE id = $1`, [profileId])).rows[0].next_charge_at);
  }

  // Open the plan: one live store_subscriptions row per store.
  const status: "active" | "trialing" = trialDays > 0 && !keepDates ? "trialing" : "active";
  await pool.query(
    `UPDATE store_subscriptions SET status = 'canceled', canceled_at = now(), updated_at = now()
      WHERE store_id = $1 AND status IN ('active', 'trialing', 'past_due')`,
    [storeId],
  );
  await pool.query(
    `INSERT INTO store_subscriptions (store_id, plan_id, status, current_period_start, current_period_end, stripe_customer_id, cancel_at_period_end)
     VALUES ($1, $2, $3, $4, $5, $6, false)`,
    [storeId, plan.id, status, now, nextChargeAt, customerId],
  );
  const { userId, changed } = await setAccountStatus(storeId, "Active");
  cache.billing.invalidate(storeId);
  if (userId && status === "active" && changed) {
    emitPlatformEmailEvent("account_reactivated", userId, { source: "saas_billing" }).catch(() => {});
  }
  console.log(`[saas-billing] storeId=${storeId} subscribed to plan ${plan.id} (${status}), next charge ${nextChargeAt.toISOString().slice(0, 10)}`);
  return { ok: true, status, nextChargeAt };
}

/** Owner cancelled / changed their mind: stop (or resume) charging when the paid period ends. */
export async function setCancelAtPeriodEnd(storeId: number, cancel: boolean): Promise<boolean> {
  const r = await pool.query(
    `UPDATE saas_billing_profiles SET cancel_at_period_end = $2, updated_at = now()
      WHERE store_id = $1 AND status IN ('active', 'past_due') RETURNING id`,
    [storeId, cancel],
  );
  return r.rows.length > 0;
}

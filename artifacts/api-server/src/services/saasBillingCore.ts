/**
 * In-house monthly billing for the Certxa SaaS plans — the billing run.
 *
 * Stripe stores the card; Certxa decides when to charge it. Each store has one row in
 * saas_billing_profiles (card on file, amount, dates). This run finds the rows that are due,
 * charges the saved card off-session with a PaymentIntent, and writes one row to
 * saas_billing_charges for every attempt, successful or not.
 *
 *   • Due        = next_attempt_at <= now, status active or past_due.
 *   • Success    → last_charged_at = now, next_charge_at = now + interval_days (31), so the card is
 *                  not charged again until the next cycle.
 *   • Decline    → status past_due, retried after RETRY_AFTER_DAYS; after the last retry the
 *                  profile is suspended and no longer charged.
 *
 * Never charging twice is the rule everything else bends to:
 *   • A profile is claimed with a lock (FOR UPDATE SKIP LOCKED + locked_until), so two workers
 *     (pm2 runs two) cannot take the same row.
 *   • The attempt is written as a 'pending' charge row BEFORE Stripe is called, and Stripe is
 *     called with that row's idempotency key. If the process dies, or the network drops after
 *     Stripe took the money, the next run finds the pending row and asks Stripe what happened
 *     (same key, or the PaymentIntent id) instead of starting a new charge.
 *   • A pending row that cannot be resolved within PENDING_REVIEW_HOURS puts the profile in
 *     'needs_review' and stops charging it until a person has looked.
 *
 * This module has no imports from the app: the database and Stripe are passed in, so the same
 * code runs under test against a stand-in Stripe.
 */

export type BillingMode = "off" | "dry_run" | "live";

export interface BillingDeps {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  stripe: {
    paymentIntents: {
      create(params: Record<string, unknown>, options: { idempotencyKey: string }): Promise<any>;
      retrieve(id: string): Promise<any>;
    };
  };
  mode: BillingMode;
  now?: () => Date;
  log?: (message: string) => void;
  /** Called after each profile is settled (entitlements, emails). Failures here never undo a charge. */
  onResult?: (result: BillingResult) => Promise<void>;
}

export interface BillingResult {
  profileId: number;
  storeId: number;
  chargeId: number | null;
  outcome: "charged" | "declined" | "suspended" | "canceled" | "pending" | "needs_review" | "dry_run";
  amountCents: number;
  attempt: number;
  message?: string;
}

/** Days to wait after the 1st, 2nd and 3rd failed attempt. A 4th failure suspends the profile. */
export const RETRY_AFTER_DAYS = [1, 3, 5];
export const MAX_ATTEMPTS = RETRY_AFTER_DAYS.length + 1;
/** Stripe forgets an idempotency key after 24 hours — an unresolved attempt older than this needs a person. */
export const PENDING_REVIEW_HOURS = 23;
/** A row asking for more than this is treated as a data error, not charged. */
export const MAX_AMOUNT_CENTS = 200_000;
const LOCK_MINUTES = 10;
const MAX_PER_RUN = 200;

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The same cycle always produces the same key, whichever worker or run makes the attempt. */
export function idempotencyKey(profileId: number, cycleDue: Date, attempt: number): string {
  return `saas-${profileId}-${day(cycleDue)}-a${attempt}`;
}

export async function runSaasBilling(deps: BillingDeps): Promise<BillingResult[]> {
  const results: BillingResult[] = [];
  if (deps.mode === "off") return results;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});

  if (deps.mode === "dry_run") {
    const due = await deps.query(
      `SELECT * FROM saas_billing_profiles
        WHERE status IN ('active', 'past_due') AND next_attempt_at <= $1
        ORDER BY next_attempt_at LIMIT ${MAX_PER_RUN}`,
      [now()],
    );
    for (const p of due.rows) {
      const attempt = p.failed_attempts + 1;
      const key = idempotencyKey(p.id, new Date(p.next_charge_at), attempt) + "-dry";
      const inserted = await deps.query(
        `INSERT INTO saas_billing_charges
           (profile_id, store_id, plan_id, amount_cents, currency, period_start, period_end, attempt_number, status, idempotency_key, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'dry_run',$9,$6)
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [p.id, p.store_id, p.plan_id, p.amount_cents, p.currency, now(), addDays(now(), p.interval_days), attempt, key],
      );
      if (inserted.rows.length) {
        log(`[saas-billing] DRY RUN: would charge store ${p.store_id} ${p.amount_cents} ${p.currency} (attempt ${attempt})`);
        results.push({ profileId: p.id, storeId: p.store_id, chargeId: inserted.rows[0].id, outcome: "dry_run", amountCents: p.amount_cents, attempt });
      }
    }
    return results;
  }

  // Each profile is handled at most once per run, whatever the outcome — an attempt left pending
  // (Stripe unreachable) waits for the next run instead of being retried in a tight loop.
  const seen: number[] = [];
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const claimed = await deps.query(
      `UPDATE saas_billing_profiles SET locked_until = $2, updated_at = $1
        WHERE id = (
          SELECT id FROM saas_billing_profiles
           WHERE status IN ('active', 'past_due') AND next_attempt_at <= $1
             AND (locked_until IS NULL OR locked_until < $1)
             AND NOT (id = ANY($3::int[]))
           ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      [now(), new Date(now().getTime() + LOCK_MINUTES * 60_000), seen],
    );
    const profile = claimed.rows[0];
    if (!profile) break;
    seen.push(profile.id);

    let result: BillingResult;
    try {
      result = await settleProfile(deps, profile, now(), log);
    } catch (err: any) {
      // Unexpected failure in our own code or the database: leave the lock to expire and try again later.
      log(`[saas-billing] profile ${profile.id} could not be processed: ${err?.message ?? err}`);
      continue;
    }
    results.push(result);
    if (deps.onResult) {
      try { await deps.onResult(result); } catch (err: any) { log(`[saas-billing] onResult failed for profile ${profile.id}: ${err?.message ?? err}`); }
    }
  }
  return results;
}

/**
 * Charge one profile right now — used when an owner subscribes (the first charge) or pays to
 * come back after a failed payment. It is the owner asking to pay, so it ignores `mode` and the
 * profile's status and due date, but uses the same lock, charge row and idempotency key as the
 * billing run. Returns null when another worker holds the profile.
 */
export async function chargeProfile(deps: BillingDeps, profileId: number): Promise<BillingResult | null> {
  const now = (deps.now ?? (() => new Date()))();
  const claimed = await deps.query(
    `UPDATE saas_billing_profiles SET locked_until = $2, updated_at = $1
      WHERE id = $3 AND status <> 'needs_review' AND (locked_until IS NULL OR locked_until < $1)
      RETURNING *`,
    [now, new Date(now.getTime() + LOCK_MINUTES * 60_000), profileId],
  );
  if (!claimed.rows[0]) return null;
  return settleProfile(deps, { ...claimed.rows[0], cancel_at_period_end: false }, now, deps.log ?? (() => {}));
}

async function settleProfile(deps: BillingDeps, p: any, now: Date, log: (m: string) => void): Promise<BillingResult> {
  const base = { profileId: p.id as number, storeId: p.store_id as number, amountCents: p.amount_cents as number };

  // The owner cancelled: the paid-for period has now run out. Stop, without charging.
  if (p.cancel_at_period_end) {
    await deps.query(
      `UPDATE saas_billing_profiles SET status = 'canceled', canceled_at = $2, locked_until = NULL, updated_at = $2 WHERE id = $1`,
      [p.id, now],
    );
    return { ...base, chargeId: null, outcome: "canceled", attempt: 0 };
  }

  if (!(p.amount_cents > 0) || p.amount_cents > MAX_AMOUNT_CENTS) {
    return review(deps, p, now, null, 0, `Amount ${p.amount_cents} is outside the allowed range`);
  }

  // An attempt that was started and never finished? Find out what Stripe did before anything else.
  const open = await deps.query(
    `SELECT * FROM saas_billing_charges WHERE profile_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1`,
    [p.id],
  );
  let charge = open.rows[0];
  let pi: any = null;
  let failure: { code: string; message: string } | null = null;

  if (charge) {
    const ageHours = (now.getTime() - new Date(charge.created_at).getTime()) / 3_600_000;
    if (charge.stripe_payment_intent_id) {
      try { pi = await deps.stripe.paymentIntents.retrieve(charge.stripe_payment_intent_id); }
      catch (err: any) { return stillPending(deps, p, now, charge, ageHours, err); }
    } else if (ageHours >= PENDING_REVIEW_HOURS) {
      return review(deps, p, now, charge.id, charge.attempt_number, "An earlier attempt never completed and can no longer be checked automatically");
    }
  } else {
    const attempt = p.failed_attempts + 1;
    const inserted = await deps.query(
      `INSERT INTO saas_billing_charges
         (profile_id, store_id, plan_id, amount_cents, currency, period_start, period_end, attempt_number, trigger, idempotency_key, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$6) RETURNING *`,
      [p.id, p.store_id, p.plan_id, p.amount_cents, p.currency, now, addDays(now, p.interval_days), attempt,
       attempt > 1 ? "retry" : "scheduled", idempotencyKey(p.id, new Date(p.next_charge_at), attempt)],
    );
    charge = inserted.rows[0];
  }

  if (!pi) {
    try {
      pi = await deps.stripe.paymentIntents.create(
        {
          amount: charge.amount_cents,
          currency: charge.currency,
          customer: p.stripe_customer_id,
          payment_method: p.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `Certxa subscription ${day(new Date(charge.period_start))} to ${day(new Date(charge.period_end))} (store #${p.store_id})`,
          metadata: { type: "saas_subscription", storeId: String(p.store_id), profileId: String(p.id), chargeId: String(charge.id) },
        },
        { idempotencyKey: charge.idempotency_key },
      );
    } catch (err: any) {
      // A decline arrives as an error that carries the PaymentIntent. A request Stripe rejected
      // outright (card removed, customer deleted) is also a definite "not charged".
      if (err?.type === "StripeCardError" || err?.type === "StripeInvalidRequestError") {
        failure = { code: String(err.code ?? err.type), message: String(err.message ?? "The card was declined") };
        pi = err.payment_intent ?? err.raw?.payment_intent ?? null;
      } else {
        // Network trouble, Stripe outage, rate limit: we do not know whether the card was charged.
        const ageHours = (now.getTime() - new Date(charge.created_at).getTime()) / 3_600_000;
        return stillPending(deps, p, now, charge, ageHours, err);
      }
    }
  }

  const piId: string | null = pi?.id ?? null;

  if (!failure && pi?.status === "succeeded") {
    const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
    await deps.query(
      `UPDATE saas_billing_charges SET status = 'succeeded', stripe_payment_intent_id = $2, stripe_charge_id = $3, completed_at = $4 WHERE id = $1`,
      [charge.id, piId, chargeId, now],
    );
    const next = addDays(now, p.interval_days);
    await deps.query(
      `UPDATE saas_billing_profiles
          SET status = 'active', last_charged_at = $2, next_charge_at = $3, next_attempt_at = $3,
              failed_attempts = 0, last_attempt_at = $2, last_error = NULL, locked_until = NULL, updated_at = $2
        WHERE id = $1`,
      [p.id, now, next],
    );
    log(`[saas-billing] charged store ${p.store_id} ${charge.amount_cents} ${charge.currency} (charge row ${charge.id})`);
    return { ...base, chargeId: charge.id, outcome: "charged", attempt: charge.attempt_number };
  }

  if (!failure && pi?.status === "processing") {
    await deps.query(`UPDATE saas_billing_charges SET stripe_payment_intent_id = $2 WHERE id = $1`, [charge.id, piId]);
    await deps.query(`UPDATE saas_billing_profiles SET locked_until = NULL, updated_at = $2 WHERE id = $1`, [p.id, now]);
    return { ...base, chargeId: charge.id, outcome: "pending", attempt: charge.attempt_number, message: "Stripe is still processing the payment" };
  }

  // Declined, needs the cardholder present (3-D Secure), or otherwise not paid.
  if (!failure) {
    const last = pi?.last_payment_error;
    failure = {
      code: String(last?.decline_code ?? last?.code ?? pi?.status ?? "not_paid"),
      message: String(last?.message ?? (pi?.status === "requires_action" ? "The bank requires the cardholder to approve this payment" : "The payment did not complete")),
    };
  }
  await deps.query(
    `UPDATE saas_billing_charges SET status = 'failed', stripe_payment_intent_id = $2, failure_code = $3, failure_message = $4, completed_at = $5 WHERE id = $1`,
    [charge.id, piId, failure.code.slice(0, 80), failure.message.slice(0, 500), now],
  );
  const failed = charge.attempt_number;
  const suspended = failed >= MAX_ATTEMPTS;
  await deps.query(
    `UPDATE saas_billing_profiles
        SET status = $2, failed_attempts = $3, next_attempt_at = $4, last_attempt_at = $5, last_error = $6,
            locked_until = NULL, updated_at = $5
      WHERE id = $1`,
    [p.id, suspended ? "suspended" : "past_due", failed,
     suspended ? new Date(p.next_attempt_at) : addDays(now, RETRY_AFTER_DAYS[failed - 1]), now, failure.message.slice(0, 500)],
  );
  log(`[saas-billing] store ${p.store_id} attempt ${failed} failed (${failure.code})${suspended ? " — suspended" : ""}`);
  return { ...base, chargeId: charge.id, outcome: suspended ? "suspended" : "declined", attempt: failed, message: failure.message };
}

/** We could not learn the outcome. Keep the attempt open and look again next run — or hand it to a person. */
async function stillPending(deps: BillingDeps, p: any, now: Date, charge: any, ageHours: number, err: any): Promise<BillingResult> {
  const message = String(err?.message ?? err ?? "Stripe could not be reached").slice(0, 500);
  if (ageHours >= PENDING_REVIEW_HOURS) return review(deps, p, now, charge.id, charge.attempt_number, message);
  await deps.query(
    `UPDATE saas_billing_profiles SET locked_until = NULL, last_attempt_at = $2, last_error = $3, updated_at = $2 WHERE id = $1`,
    [p.id, now, message],
  );
  return { profileId: p.id, storeId: p.store_id, chargeId: charge.id, outcome: "pending", amountCents: p.amount_cents, attempt: charge.attempt_number, message };
}

async function review(deps: BillingDeps, p: any, now: Date, chargeId: number | null, attempt: number, message: string): Promise<BillingResult> {
  await deps.query(
    `UPDATE saas_billing_profiles SET status = 'needs_review', last_error = $3, locked_until = NULL, updated_at = $2 WHERE id = $1`,
    [p.id, now, message.slice(0, 500)],
  );
  return { profileId: p.id, storeId: p.store_id, chargeId, outcome: "needs_review", amountCents: p.amount_cents, attempt, message };
}

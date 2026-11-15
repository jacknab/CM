/**
 * Certxa Pro memberships (owner, 2026-11-15: "match GlossGenius"; migration 0365).
 *
 * A plan: a monthly or yearly price, visits of chosen services included each period, and/or a percent off other
 * services. A client joins
 *   • from a link the pro sends (certxa.com/join/<code>): they pay the first period on their phone, and the card is
 *     kept on the business's Stripe account for renewals; or
 *   • from the app, when the client already has a card on file: the first period is charged at once.
 * Renewals are charged here (hourly sweep) on the business's own Stripe account, with Certxa's usual per-payment fee.
 * A declined renewal makes the membership past due; it is tried again daily, three more times, then cancelled.
 * Cancelling ends it at the end of the paid period (or at once). Visits not used in a period don't carry over.
 */
import crypto from "crypto";
import type Stripe from "stripe";
import { pool } from "../db";
import { getStripe, isStripeConfigured } from "./stripe";
import { PLATFORM_CONNECTION_FEE_CENTS } from "./stripeConnect";
import { sendSms } from "../sms";
import { sendEmail } from "../mail";
import { emailButton, emailText, escapeEmailHtml } from "./emailLayout";
import { pushOwnerMessage } from "./ownerPush";

const APP_URL = () => (process.env.APP_URL || "https://certxa.com").replace(/\/$/, "");
export const joinLink = (token: string) => `${APP_URL()}/join/${token}`;
const RETRIES = 3;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export type Include = { serviceId: number; name: string; visits: number };

export function addPeriod(from: Date, interval: string): Date {
  const d = new Date(from);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else {
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); // Jan 31 → Feb 28, never into March
  }
  return d;
}

export async function connectedAccount(storeId: number): Promise<string | null> {
  const r = await pool.query(`SELECT provider_account_id FROM store_payment_accounts WHERE store_id = $1 AND provider = 'stripe' AND status = 'connected' LIMIT 1`, [storeId]);
  return r.rows[0]?.provider_account_id ?? null;
}

const fee = (cents: number) => (cents > PLATFORM_CONNECTION_FEE_CENTS ? PLATFORM_CONNECTION_FEE_CENTS : 0);

/** The visits used of each included service in the membership's current period. */
export async function usedThisPeriod(membershipId: number, periodStart: Date | string | null): Promise<Record<number, number>> {
  if (!periodStart) return {};
  const r = await pool.query(`SELECT service_id, COUNT(*)::int AS n FROM client_membership_uses WHERE membership_id = $1 AND period_start = $2 GROUP BY service_id`, [membershipId, periodStart]);
  return Object.fromEntries(r.rows.map((x) => [Number(x.service_id), Number(x.n)]));
}

/** A membership as the app shows it. */
export async function describe(m: any) {
  const used = await usedThisPeriod(m.id, m.period_start);
  const includes = (m.includes as Include[]).map((i) => ({ ...i, used: used[i.serviceId] ?? 0, left: Math.max(0, i.visits - (used[i.serviceId] ?? 0)) }));
  return {
    id: m.id, planId: m.plan_id, customerId: m.customer_id, name: m.name, priceCents: m.price_cents, interval: m.interval, discountPercent: m.discount_percent,
    status: m.status, includes, periodStart: m.period_start, periodEnd: m.period_end, cancelAtPeriodEnd: m.cancel_at_period_end,
    lastError: m.status === "past_due" ? m.last_error : null, startedAt: m.started_at, createdAt: m.created_at,
    link: m.status === "pending" && m.token ? joinLink(m.token) : null,
  };
}

async function planSnapshot(storeId: number, planId: number) {
  const plan = (await pool.query(`SELECT * FROM membership_plans WHERE id = $1 AND store_id = $2 AND is_active = true`, [planId, storeId])).rows[0];
  if (!plan) return null;
  const inc = (await pool.query(
    `SELECT p.service_id, p.visits_per_period, s.name FROM membership_plan_services p JOIN services s ON s.id = p.service_id WHERE p.plan_id = $1 ORDER BY s.name`, [planId])).rows;
  return { plan, includes: inc.map((i) => ({ serviceId: Number(i.service_id), name: String(i.name), visits: Number(i.visits_per_period) })) as Include[] };
}

async function hasLiveMembership(storeId: number, customerId: number, planId: number) {
  return !!(await pool.query(`SELECT 1 FROM client_memberships WHERE store_id = $1 AND customer_id = $2 AND plan_id = $3 AND status IN ('active', 'past_due')`, [storeId, customerId, planId])).rows[0];
}

/** Charges one period off-session. Throws Stripe's error on a decline. */
async function chargePeriod(m: { id: number; store_id: number; name: string; price_cents: number; stripe_customer_id: string; stripe_payment_method_id: string }, periodStart: Date, periodEnd: Date, attempt = 0): Promise<string> {
  const account = await connectedAccount(m.store_id);
  if (!account || !isStripeConfigured()) throw new Error("Card payments aren't set up for this business.");
  const pi = await getStripe().paymentIntents.create({
    amount: m.price_cents, currency: "usd", customer: m.stripe_customer_id, payment_method: m.stripe_payment_method_id,
    off_session: true, confirm: true, payment_method_types: ["card"], application_fee_amount: fee(m.price_cents),
    description: `Membership: ${m.name}`,
    metadata: { type: "membership", membership_id: String(m.id), certxa_store_id: String(m.store_id), period_start: periodStart.toISOString() },
  }, { stripeAccount: account, idempotencyKey: `membership_${m.id}_${periodStart.toISOString()}_${attempt}` });
  if (pi.status !== "succeeded") throw new Error(`The payment did not go through (${pi.status}).`);
  await pool.query(`INSERT INTO client_membership_charges (membership_id, store_id, amount_cents, period_start, period_end, status, payment_intent) VALUES ($1,$2,$3,$4,$5,'paid',$6)`,
    [m.id, m.store_id, m.price_cents, periodStart, periodEnd, pi.id]);
  return pi.id;
}

/** Joining from the app with the client's card on file: the first period is charged now. */
export async function startWithCardOnFile(storeId: number, planId: number, customerId: number) {
  const snap = await planSnapshot(storeId, planId);
  if (!snap) return { ok: false as const, status: 404, error: "Plan not found" };
  if (await hasLiveMembership(storeId, customerId, planId)) return { ok: false as const, status: 409, error: "This client already has this membership." };
  const card = (await pool.query(`SELECT stripe_customer_id, stripe_payment_method_id FROM clients WHERE id = $1 AND store_id = $2`, [customerId, storeId])).rows[0];
  if (!card) return { ok: false as const, status: 404, error: "Client not found" };
  if (!card.stripe_customer_id || !card.stripe_payment_method_id) return { ok: false as const, status: 409, error: "This client has no card on file. Send them the link to join instead." };
  const now = new Date();
  const end = addPeriod(now, snap.plan.interval);
  const m = (await pool.query(
    `INSERT INTO client_memberships (store_id, plan_id, customer_id, name, price_cents, interval, discount_percent, includes, status, stripe_customer_id, stripe_payment_method_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10) RETURNING *`,
    [storeId, planId, customerId, snap.plan.name, snap.plan.price_cents, snap.plan.interval, snap.plan.discount_percent, JSON.stringify(snap.includes), card.stripe_customer_id, card.stripe_payment_method_id])).rows[0];
  try {
    await chargePeriod(m, now, end);
  } catch (err: any) {
    await pool.query(`DELETE FROM client_memberships WHERE id = $1`, [m.id]);
    return { ok: false as const, status: 402, error: err?.raw?.message || err?.message || "The card was declined." };
  }
  const active = (await pool.query(`UPDATE client_memberships SET status = 'active', period_start = $2, period_end = $3, started_at = now() WHERE id = $1 RETURNING *`, [m.id, now, end])).rows[0];
  return { ok: true as const, membership: await describe(active) };
}

/** A join link for the client (pending until they pay). Sent by e-mail, or text when there's no e-mail. */
export async function createJoinLink(storeId: number, planId: number, customerId: number, send: boolean) {
  const snap = await planSnapshot(storeId, planId);
  if (!snap) return { ok: false as const, status: 404, error: "Plan not found" };
  if (await hasLiveMembership(storeId, customerId, planId)) return { ok: false as const, status: 409, error: "This client already has this membership." };
  if (!(await connectedAccount(storeId))) return { ok: false as const, status: 409, error: "Set up card payments first." };
  const client = (await pool.query(
    `SELECT c.first_name, c.full_name,
       (SELECT COALESCE(p.phone_number_e164, p.display_phone) FROM client_phones p WHERE p.client_id = c.id ORDER BY p.is_primary DESC, p.id LIMIT 1) AS phone,
       (SELECT e.email_address FROM client_emails e WHERE e.client_id = c.id ORDER BY e.is_primary DESC, e.id LIMIT 1) AS email
     FROM clients c WHERE c.id = $1 AND c.store_id = $2`, [customerId, storeId])).rows[0];
  if (!client) return { ok: false as const, status: 404, error: "Client not found" };
  // One open link per client and plan, kept up to date with the plan.
  await pool.query(`DELETE FROM client_memberships WHERE store_id = $1 AND customer_id = $2 AND plan_id = $3 AND status = 'pending'`, [storeId, customerId, planId]);
  const token = crypto.randomBytes(18).toString("base64url");
  const m = (await pool.query(
    `INSERT INTO client_memberships (store_id, plan_id, customer_id, name, price_cents, interval, discount_percent, includes, status, token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING *`,
    [storeId, planId, customerId, snap.plan.name, snap.plan.price_cents, snap.plan.interval, snap.plan.discount_percent, JSON.stringify(snap.includes), token])).rows[0];
  const link = joinLink(token);
  let sentVia: string | null = null;
  if (send) {
    const business = (await pool.query(`SELECT name FROM locations WHERE id = $1`, [storeId])).rows[0]?.name || "Your salon";
    const price = `${money(snap.plan.price_cents)}/${snap.plan.interval}`;
    if (client.email) {
      const html = [
        emailText(`Hi ${escapeEmailHtml(client.first_name || "there")},`),
        emailText(`${escapeEmailHtml(business)} invites you to join <strong>${escapeEmailHtml(snap.plan.name)}</strong> for ${price}.`),
        emailButton("See the membership and join", link),
      ].join("");
      const r = await sendEmail(storeId, client.email, `${business}: join ${snap.plan.name}`, html, undefined, undefined, { business, preheader: `${snap.plan.name}, ${price}` });
      if (r.success) sentVia = "email";
    }
    if (!sentVia && client.phone) {
      const r = await sendSms(storeId, client.phone, `${business}: join ${snap.plan.name} (${price}) here: ${link}`, "membership_invite", undefined, customerId);
      if (r.success) sentVia = "sms";
    }
  }
  return { ok: true as const, link, sentVia, membership: await describe(m) };
}

export async function membershipByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  return (await pool.query(`SELECT m.*, l.name AS business FROM client_memberships m JOIN locations l ON l.id = m.store_id WHERE m.token = $1`, [token])).rows[0] ?? null;
}

/** The card form for a join link: a PaymentIntent for the first period that keeps the card for renewals. */
export async function joinIntent(m: any): Promise<string> {
  const account = await connectedAccount(m.store_id);
  if (!account || !isStripeConfigured()) throw Object.assign(new Error("Card payments aren't available for this business right now."), { status: 409 });
  const stripe = getStripe();
  let customerId: string | null = m.stripe_customer_id;
  if (!customerId) {
    const client = (await pool.query(
      `SELECT c.full_name, c.stripe_customer_id,
         (SELECT e.email_address FROM client_emails e WHERE e.client_id = c.id ORDER BY e.is_primary DESC, e.id LIMIT 1) AS email
       FROM clients c WHERE c.id = $1 AND c.store_id = $2`, [m.customer_id, m.store_id])).rows[0];
    customerId = client?.stripe_customer_id ?? null;
    if (!customerId) {
      const c = await stripe.customers.create({ name: client?.full_name || undefined, email: client?.email || undefined, metadata: { certxa_store_id: String(m.store_id), certxa_client_id: String(m.customer_id) } }, { stripeAccount: account });
      customerId = c.id;
    }
    await pool.query(`UPDATE client_memberships SET stripe_customer_id = $2 WHERE id = $1`, [m.id, customerId]);
  }
  const pi = await stripe.paymentIntents.create({
    amount: m.price_cents, currency: "usd", customer: customerId, setup_future_usage: "off_session", payment_method_types: ["card"],
    application_fee_amount: fee(m.price_cents), description: `Membership: ${m.name}`,
    metadata: { type: "membership_join", membership_id: String(m.id), certxa_store_id: String(m.store_id) },
  }, { stripeAccount: account, idempotencyKey: `membership_join_${m.id}` });
  await pool.query(`UPDATE client_memberships SET join_payment_intent = $2 WHERE id = $1`, [m.id, pi.id]);
  return pi.client_secret!;
}

/** After the client paid on the join page: the membership starts and the card is kept on the client too. */
export async function confirmJoin(m: any, paymentIntentId: string) {
  if (m.status !== "pending") return { ok: true as const };
  const account = await connectedAccount(m.store_id);
  if (!account) return { ok: false as const, status: 409, error: "Card payments aren't available for this business right now." };
  const pi: Stripe.PaymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: account });
  if (pi.status !== "succeeded" || pi.metadata?.membership_id !== String(m.id)) return { ok: false as const, status: 409, error: "The payment hasn't gone through." };
  const pmId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? null;
  const now = new Date();
  const end = addPeriod(now, m.interval);
  const r = await pool.query(
    `UPDATE client_memberships SET status = 'active', stripe_payment_method_id = $2, period_start = $3, period_end = $4, started_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING id`, [m.id, pmId, now, end]);
  if (!r.rowCount) return { ok: true as const };
  await pool.query(`INSERT INTO client_membership_charges (membership_id, store_id, amount_cents, period_start, period_end, status, payment_intent) VALUES ($1,$2,$3,$4,$5,'paid',$6)`,
    [m.id, m.store_id, m.price_cents, now, end, pi.id]);
  if (pmId && m.stripe_customer_id) {
    const { rememberClientCard } = await import("../routes/bookingPayments");
    await rememberClientCard(m.store_id, m.customer_id, { stripeCustomerId: m.stripe_customer_id, stripePaymentMethodId: pmId }).catch(() => {});
  }
  const name = (await pool.query(`SELECT full_name FROM clients WHERE id = $1`, [m.customer_id])).rows[0]?.full_name || "A client";
  void pushOwnerMessage(m.store_id, { title: "New member", body: `${name} joined ${m.name}`, data: { type: "membership_joined", customerId: m.customer_id } }).catch(() => {});
  return { ok: true as const };
}

/** The membership that covers a service on a booking, if any: an included visit left, or the member discount. */
export async function coverageForAppointment(storeId: number, appointmentId: number) {
  const appt = (await pool.query(`SELECT customer_id, service_id FROM appointments WHERE id = $1 AND store_id = $2`, [appointmentId, storeId])).rows[0];
  if (!appt?.customer_id) return null;
  const used = (await pool.query(`SELECT membership_id FROM client_membership_uses WHERE appointment_id = $1`, [appointmentId])).rows[0];
  const list = (await pool.query(`SELECT * FROM client_memberships WHERE store_id = $1 AND customer_id = $2 AND status = 'active' ORDER BY id`, [storeId, appt.customer_id])).rows;
  let visit: { membershipId: number; name: string; left: number } | null = null;
  let discount: { membershipId: number; name: string; percent: number } | null = null;
  for (const m of list) {
    const d = await describe(m);
    const inc = d.includes.find((i) => i.serviceId === Number(appt.service_id));
    if (!visit && inc && inc.left > 0) visit = { membershipId: m.id, name: m.name, left: inc.left };
    if (m.discount_percent > 0 && (!discount || m.discount_percent > discount.percent)) discount = { membershipId: m.id, name: m.name, percent: m.discount_percent };
  }
  return { visit, discount, usedMembershipId: used?.membership_id ?? null };
}

/** Uses one included visit on a booking (once per booking, only while visits are left this period). */
export async function useVisit(storeId: number, membershipId: number, appointmentId: number) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const m = (await db.query(`SELECT * FROM client_memberships WHERE id = $1 AND store_id = $2 FOR UPDATE`, [membershipId, storeId])).rows[0];
    const appt = (await db.query(`SELECT customer_id, service_id FROM appointments WHERE id = $1 AND store_id = $2`, [appointmentId, storeId])).rows[0];
    if (!m || !appt || Number(appt.customer_id) !== Number(m.customer_id)) { await db.query("ROLLBACK"); return { ok: false as const, status: 404, error: "Membership not found" }; }
    if (m.status !== "active") { await db.query("ROLLBACK"); return { ok: false as const, status: 409, error: "This membership isn't active." }; }
    const inc = (m.includes as Include[]).find((i) => i.serviceId === Number(appt.service_id));
    if (!inc) { await db.query("ROLLBACK"); return { ok: false as const, status: 409, error: "This membership doesn't include this service." }; }
    const n = (await db.query(`SELECT COUNT(*)::int AS n FROM client_membership_uses WHERE membership_id = $1 AND service_id = $2 AND period_start = $3`, [m.id, inc.serviceId, m.period_start])).rows[0].n;
    if (n >= inc.visits) { await db.query("ROLLBACK"); return { ok: false as const, status: 409, error: "No membership visits left this period." }; }
    const once = await db.query(`INSERT INTO client_membership_uses (membership_id, service_id, appointment_id, period_start) VALUES ($1,$2,$3,$4) ON CONFLICT (appointment_id) DO NOTHING RETURNING id`,
      [m.id, inc.serviceId, appointmentId, m.period_start]);
    if (!once.rowCount) { await db.query("ROLLBACK"); return { ok: false as const, status: 409, error: "A membership visit was already used on this booking." }; }
    await db.query("COMMIT");
    return { ok: true as const, left: inc.visits - n - 1 };
  } catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  finally { db.release(); }
}

export async function giveBackVisit(storeId: number, appointmentId: number) {
  await pool.query(`DELETE FROM client_membership_uses u USING client_memberships m WHERE u.appointment_id = $1 AND m.id = u.membership_id AND m.store_id = $2`, [appointmentId, storeId]);
}

export async function cancelMembership(storeId: number, membershipId: number, now: boolean) {
  const m = (await pool.query(`SELECT * FROM client_memberships WHERE id = $1 AND store_id = $2`, [membershipId, storeId])).rows[0];
  if (!m) return null;
  if (m.status === "pending" || now || m.status === "past_due") {
    if (m.status === "pending") await pool.query(`DELETE FROM client_memberships WHERE id = $1`, [m.id]);
    else await pool.query(`UPDATE client_memberships SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [m.id]);
  } else {
    await pool.query(`UPDATE client_memberships SET cancel_at_period_end = true WHERE id = $1`, [m.id]);
  }
  return true;
}

// ── Renewals ──
const SWEEP_MS = 60 * 60_000;
let timer: ReturnType<typeof setInterval> | null = null;

export async function renewDueOnce(): Promise<{ renewed: number; failed: number; ended: number }> {
  const out = { renewed: 0, failed: 0, ended: 0 };
  const lock = await pool.connect();
  try {
    if (!(await lock.query(`SELECT pg_try_advisory_lock(hashtext('pro_membership_renewals')) AS got`)).rows[0]?.got) return out;
    try {
      // Paid on the join page but the page closed before it said so: finished here.
      const paidPending = (await pool.query(
        `SELECT * FROM client_memberships WHERE status = 'pending' AND join_payment_intent IS NOT NULL AND created_at > now() - interval '3 days' LIMIT 50`)).rows;
      for (const m of paidPending) await confirmJoin(m, m.join_payment_intent).catch(() => {});
      // Cancelled at the end of the period: ended now.
      out.ended = (await pool.query(`UPDATE client_memberships SET status = 'cancelled', cancelled_at = now() WHERE status = 'active' AND cancel_at_period_end AND period_end <= now()`)).rowCount ?? 0;
      const due = (await pool.query(
        `SELECT * FROM client_memberships WHERE status IN ('active', 'past_due') AND NOT cancel_at_period_end AND period_end <= now()
           AND (next_attempt_at IS NULL OR next_attempt_at <= now()) ORDER BY period_end LIMIT 100`)).rows;
      for (const m of due) {
        const start = new Date(m.period_end);
        const end = addPeriod(start, m.interval);
        try {
          if (!m.stripe_customer_id || !m.stripe_payment_method_id) throw new Error("No card on file.");
          await chargePeriod(m, start, end, m.failed_attempts);
          await pool.query(`UPDATE client_memberships SET status = 'active', period_start = $2, period_end = $3, failed_attempts = 0, next_attempt_at = NULL, last_error = NULL WHERE id = $1`, [m.id, start, end]);
          out.renewed++;
        } catch (err: any) {
          const message = String(err?.raw?.message || err?.message || "The card was declined.").slice(0, 300);
          const attempts = m.failed_attempts + 1;
          await pool.query(`INSERT INTO client_membership_charges (membership_id, store_id, amount_cents, period_start, period_end, status, error) VALUES ($1,$2,$3,$4,$5,'failed',$6)`,
            [m.id, m.store_id, m.price_cents, start, end, message]);
          const give = attempts > RETRIES;
          await pool.query(
            `UPDATE client_memberships SET status = $2, failed_attempts = $3, last_error = $4, next_attempt_at = now() + interval '1 day', cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END WHERE id = $1`,
            [m.id, give ? "cancelled" : "past_due", attempts, message]);
          if (attempts === 1 || give) {
            const name = (await pool.query(`SELECT full_name FROM clients WHERE id = $1`, [m.customer_id])).rows[0]?.full_name || "A client";
            void pushOwnerMessage(m.store_id, {
              title: give ? "Membership cancelled" : "Membership payment declined",
              body: give ? `${name}'s ${m.name} ended after the card was declined ${attempts} times.` : `${name}'s ${m.name} renewal was declined. Certxa will try again tomorrow.`,
              data: { type: "membership_declined", customerId: m.customer_id },
            }).catch(() => {});
          }
          out.failed++;
        }
      }
    } finally { await lock.query(`SELECT pg_advisory_unlock(hashtext('pro_membership_renewals'))`).catch(() => {}); }
  } finally { lock.release(); }
  if (out.renewed || out.failed || out.ended) console.log(`[memberships] renewed ${out.renewed}, declined ${out.failed}, ended ${out.ended}`);
  return out;
}

export function startMembershipRenewals() {
  if (timer) return;
  const run = () => void renewDueOnce().catch((e) => console.error("[memberships] renewals failed", e instanceof Error ? e.message : e));
  setTimeout(run, 90_000).unref?.();
  timer = setInterval(run, SWEEP_MS);
}

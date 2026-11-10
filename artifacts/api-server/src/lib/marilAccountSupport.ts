/**
 * Maril, Certxa's AI Account Services agent on the phone (owner, 2026-11-10). Tom transfers account and billing calls
 * to her, and her own number (602) 560-9931 is the account-support line (routes/salesAgent.ts, agent "shavez").
 *
 * Who she is talking to (the owner's rule): a call from the account owner's mobile on file is the owner; otherwise she
 * texts a 6-digit code to that mobile and the caller reads it back. Nothing about an account is shared or changed before.
 *
 * What she can do for a verified owner, all logged on the account as the "Maril (AI)" support agent (migration 0341),
 * with credits and refunds held to the isAdmin limits (lib/supportPolicy.ts) like any agent:
 *   read the account and billing · e-mail the billing page, a password reset or a receipt · retry a failed payment ·
 *   extend a trial (within the 74-day rule) · apply a credit · refund a payment · open a ticket for the team.
 */
import crypto from "node:crypto";
import { pool } from "../db";
import { sendTwilioSms } from "../sms";
import { sendEmail } from "../mail";
import { emailButton, emailDetails, emailGreeting, emailNote, emailText } from "./emailLayout";
import { creditRefusal, loadLimits, refundRefusal, spendSoFar } from "./supportPolicy";
import { latestTrialEnd, trialEndRefusal } from "./trialLimit";
import { retryFailedCharge } from "../services/saas-billing";
import { liftTrialSuspension } from "../services/trial-expiration";
import { stripe, isStripeConfigured } from "./stripe";

const SITE = () => (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
const mask = (phone: string | null | undefined) => { const d = digits(phone); return d.length === 10 ? `ending in ${d.slice(6)}` : null; };
const money = (cents: number) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

export type VerifiedOwner = { userId: string; firstName: string | null; email: string | null; storeId: number; businessName: string; accountType: string | null };

let marilAgentId: number | null = null;
/** Maril's support_agents row (migration 0341): who her actions are logged as. */
export async function marilAgent(): Promise<number> {
  if (marilAgentId) return marilAgentId;
  const { rows: [row] } = await pool.query(`SELECT id FROM support_agents WHERE email = 'maril.ai@certxa.invalid' LIMIT 1`);
  if (!row) throw new Error("Maril's support agent record is missing (migration 0341)");
  marilAgentId = Number(row.id);
  return marilAgentId;
}

async function log(storeId: number, action: string, details: Record<string, unknown> = {}): Promise<void> {
  await pool.query(`INSERT INTO support_agent_activity (agent_id, account_id, action, details) VALUES ($1, $2, $3, $4)`,
    [await marilAgent(), storeId, action, JSON.stringify({ ...details, via: "maril_phone" })]).catch(() => {});
}

async function ownerRow(where: string, params: unknown[]): Promise<(VerifiedOwner & { phone: string | null })[]> {
  const { rows } = await pool.query(
    `SELECT u.id, u.first_name, u.email, u.phone, u.account_type, l.id AS store_id, l.name
       FROM users u JOIN LATERAL (SELECT id, name FROM locations WHERE user_id = u.id ORDER BY id LIMIT 1) l ON true
      WHERE u.unclaimed_at IS NULL AND coalesce(u.role, 'owner') IN ('owner', 'admin') AND ${where}
      LIMIT 5`, params);
  return rows.map((r: any) => ({ userId: r.id, firstName: r.first_name, email: r.email, phone: r.phone, accountType: r.account_type, storeId: Number(r.store_id), businessName: r.name }));
}

/** The account whose owner's mobile on file is this caller's number (caller-ID verification). */
export async function ownerByCallerId(phone: string | null | undefined): Promise<VerifiedOwner | null> {
  const d = digits(phone);
  if (d.length !== 10) return null;
  const rows = await ownerRow(`right(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g'), 10) = $1`, [d]);
  return rows.length === 1 ? rows[0] : null;
}

/** Accounts matching what the caller said (e-mail, business name, or the business or owner phone): masked, to pick one for the code. */
export async function findAccounts(q: { email?: string; businessName?: string; phone?: string }) {
  const email = String(q.email ?? "").trim().toLowerCase();
  const name = String(q.businessName ?? "").trim().toLowerCase();
  const phone = digits(q.phone);
  const rows = email.includes("@")
    ? await ownerRow(`lower(u.email) = $1`, [email])
    : phone.length === 10
      ? await ownerRow(`(right(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g'), 10) = $1 OR EXISTS (SELECT 1 FROM locations x WHERE x.user_id = u.id AND right(regexp_replace(coalesce(x.phone, ''), '\\D', '', 'g'), 10) = $1))`, [phone])
      : name.length >= 3
        ? await ownerRow(`EXISTS (SELECT 1 FROM locations x WHERE x.user_id = u.id AND lower(x.name) LIKE '%' || $1 || '%')`, [name])
        : [];
  return rows.map((r) => ({ accountRef: r.userId, businessName: r.businessName, ownerFirstName: r.firstName, codeGoesTo: mask(r.phone) }));
}

/** Texts a 6-digit code to the owner's mobile on file. The caller reads it back (checkCode in the call). */
export async function sendVerificationCode(userId: string): Promise<{ ok: true; codeHash: string; owner: VerifiedOwner; sentTo: string } | { ok: false; message: string }> {
  const [owner] = await ownerRow(`u.id = $1`, [userId]);
  if (!owner) return { ok: false, message: "That account was not found." };
  if (digits(owner.phone).length !== 10) return { ok: false, message: "This account has no mobile number on file to text a code to. Offer a ticket so the team can verify them another way." };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const sms = await sendTwilioSms(owner.phone!, `Certxa: your Account Services code is ${code}. Maril will ask you for it on the call. Don't share it with anyone else.`);
  if (!sms.success) return { ok: false, message: "The code could not be texted." };
  const { phone: _p, ...safe } = owner;
  return { ok: true, codeHash: hashCode(code), owner: safe, sentTo: mask(owner.phone)! };
}
export const hashCode = (code: string) => crypto.createHash("sha256").update(String(code).replace(/\D/g, "")).digest("hex");

/** What Maril can tell a verified owner about their account and billing. */
export async function accountSummary(owner: VerifiedOwner) {
  const s = owner.storeId;
  const [store, sub, profile, charges, tickets, credits] = await Promise.all([
    pool.query(`SELECT l.name, l.account_status, l.suspended_reason, l.platform_credits, u.subscription_status, u.trial_ends_at, u.account_type
                  FROM locations l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`, [s]),
    pool.query(`SELECT CASE WHEN u.account_type = 'certxa_pro' THEN CASE WHEN sp.code = 'solo_plus' THEN 'Certxa Pro+' ELSE 'Certxa Pro' END ELSE sp.name END AS plan_name,
                       sp.code, ss.status, COALESCE(bp.amount_cents, sp.price_monthly_cents) AS price_cents,
                       CASE WHEN COALESCE(bp.interval_days, 31) >= 365 THEN 'year' ELSE 'month' END AS interval,
                       COALESCE(bp.next_charge_at, ss.current_period_end) AS next_date, COALESCE(bp.cancel_at_period_end, ss.cancel_at_period_end) AS cancelling,
                       bp.next_attempt_at
                  FROM store_subscriptions ss JOIN subscription_plans sp ON sp.id = ss.plan_id JOIN locations l ON l.id = ss.store_id LEFT JOIN users u ON u.id = l.user_id
                  LEFT JOIN saas_billing_profiles bp ON bp.store_id = ss.store_id AND bp.plan_id = ss.plan_id
                 WHERE ss.store_id = $1 AND ss.status IN ('active', 'trialing', 'past_due') ORDER BY ss.id DESC LIMIT 1`, [s]),
    pool.query(`SELECT card_brand, card_last4, card_exp_month, card_exp_year FROM saas_billing_profiles WHERE store_id = $1 ORDER BY id DESC LIMIT 1`, [s]),
    pool.query(`SELECT id, amount_cents, status, failure_message, created_at FROM saas_billing_charges WHERE store_id = $1 ORDER BY created_at DESC LIMIT 5`, [s]),
    pool.query(`SELECT ticket_number, subject, status, created_at FROM support_tickets WHERE account_id = $1 AND status NOT IN ('closed', 'resolved') ORDER BY created_at DESC LIMIT 3`, [s]),
    pool.query(`SELECT sms_credits FROM locations WHERE id = $1`, [s]).catch(() => ({ rows: [] as any[] })),
  ]);
  const st = store.rows[0] ?? {};
  const plan = sub.rows[0];
  const card = profile.rows[0];
  await log(s, "maril_viewed_account");
  return {
    business: owner.businessName,
    accountStatus: st.account_status ?? null,
    suspendedReason: st.suspended_reason ?? null,
    trial: st.subscription_status === "trial" && st.trial_ends_at ? { endsOn: new Date(st.trial_ends_at).toDateString() } : null,
    plan: plan ? {
      name: plan.plan_name, status: plan.status, price: plan.price_cents != null ? `${money(plan.price_cents)} a ${plan.interval}` : null,
      nextChargeOn: plan.next_date ? new Date(plan.next_date).toDateString() : null, cancellingAtPeriodEnd: Boolean(plan.cancelling),
      nextRetryOn: plan.next_attempt_at ? new Date(plan.next_attempt_at).toDateString() : null,
    } : null,
    cardOnFile: card?.card_last4 ? `${card.card_brand ?? "card"} ending ${card.card_last4}, expires ${card.card_exp_month}/${card.card_exp_year}` : null,
    recentCharges: charges.rows.map((c: any) => ({ chargeRef: Number(c.id), date: new Date(c.created_at).toDateString(), amount: money(c.amount_cents), status: c.status, reason: c.failure_message ?? null })),
    platformCredit: st.platform_credits != null ? `$${Number(st.platform_credits).toFixed(2)}` : null,
    smsCredits: credits.rows[0]?.sms_credits ?? null,
    openTickets: tickets.rows.map((t: any) => ({ number: t.ticket_number, subject: t.subject, status: t.status, opened: new Date(t.created_at).toDateString() })),
  };
}

// ── Self-service links (e-mailed to the owner's address on file) ─────────────

export async function sendBillingLink(owner: VerifiedOwner): Promise<string> {
  if (!owner.email) return "This account has no e-mail on file.";
  const link = `${SITE()}${owner.accountType === "certxa_pro" ? "/solo/billing" : "/billing"}`;
  await sendEmail(owner.storeId, owner.email, "Your Certxa billing page", [
    emailGreeting(owner.firstName), emailText("Here's your billing page, where you can update your card, see your invoices and change or cancel your plan."),
    emailButton("Open billing", link), emailNote("Sent by Maril from Certxa Account Services, as you asked on the phone."),
  ].join(""));
  await log(owner.storeId, "billing_link_sent_by_support", { to: owner.email });
  return `Sent to ${owner.email}.`;
}

export async function sendPasswordReset(owner: VerifiedOwner): Promise<string> {
  if (!owner.email) return "This account has no e-mail on file.";
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [owner.userId, token]);
  await sendEmail(0, owner.email, "Reset your Certxa password", [
    emailText(`<strong style="font-size:18px;">Reset your Certxa password</strong>`), emailGreeting(owner.firstName),
    emailText("Maril from Certxa Account Services sent this as you asked on the phone. Tap the button to set a new password."),
    emailButton("Reset password", `${SITE()}/reset-password?token=${token}`),
    emailNote("This link expires in 1 hour. If you didn't ask for it, you can ignore this e-mail."),
  ].join(""));
  await log(owner.storeId, "password_reset_sent_by_support", { to: owner.email });
  return `Sent to ${owner.email}; the link works for one hour.`;
}

export async function sendReceipt(owner: VerifiedOwner, chargeRef?: number): Promise<string> {
  if (!owner.email) return "This account has no e-mail on file.";
  const { rows: [c] } = await pool.query(
    `SELECT id, amount_cents, created_at, completed_at, period_start, period_end FROM saas_billing_charges
      WHERE store_id = $1 AND status = 'succeeded' ${chargeRef ? "AND id = $2" : ""} ORDER BY created_at DESC LIMIT 1`,
    chargeRef ? [owner.storeId, chargeRef] : [owner.storeId]);
  if (!c) return "There is no paid charge on this account to send a receipt for.";
  await sendEmail(owner.storeId, owner.email, "Your Certxa receipt", [
    emailGreeting(owner.firstName), emailText("Here's your receipt."),
    emailDetails([["Business", owner.businessName], ["Paid", new Date(c.completed_at ?? c.created_at).toDateString()],
      c.period_start && c.period_end ? ["Period", `${new Date(c.period_start).toDateString()} – ${new Date(c.period_end).toDateString()}`] : null,
      ["Amount", money(c.amount_cents)]], { emphasizeLast: true }),
  ].join(""));
  await log(owner.storeId, "receipt_sent_by_support", { chargeId: c.id, to: owner.email });
  return `Receipt for ${money(c.amount_cents)} sent to ${owner.email}.`;
}

// ── Billing fixes, within the isAdmin limits ─────────────────────────────────

export async function retryPayment(owner: VerifiedOwner): Promise<string> {
  const result = await retryFailedCharge(owner.storeId);
  await log(owner.storeId, "payment_retry_by_support", result);
  return result.message;
}

/** Up to 14 more days, never past the 74-day trial limit (lib/trialLimit.ts). */
export async function extendTrial(owner: VerifiedOwner, days: number, reason: string): Promise<string> {
  const add = Math.max(1, Math.min(14, Math.round(Number(days) || 0)));
  if (reason.trim().length < 5) return "Say why the trial is being extended.";
  const { rows: [u] } = await pool.query(`SELECT trial_ends_at, subscription_status FROM users WHERE id = $1`, [owner.userId]);
  if (!u?.trial_ends_at) return "This account isn't on a trial.";
  const base = Math.max(Date.now(), new Date(u.trial_ends_at).getTime());
  const newEnd = new Date(base + add * 86_400_000);
  const refusal = trialEndRefusal(newEnd, await latestTrialEnd(owner.userId));
  if (refusal) return refusal;
  await pool.query(`UPDATE users SET trial_ends_at = $1, subscription_status = 'trial' WHERE id = $2`, [newEnd, owner.userId]);
  await pool.query(`UPDATE store_subscriptions SET current_period_end = $1, status = 'trialing' WHERE store_id = $2 AND status IN ('trialing', 'trial', 'expired')`, [newEnd, owner.storeId]);
  await liftTrialSuspension(owner.storeId);
  await log(owner.storeId, "trial_extended_by_support", { newTrialEnd: newEnd.toISOString(), reason });
  return `Trial now ends ${newEnd.toDateString()}.`;
}

export async function applyCredit(owner: VerifiedOwner, amount: number, reason: string): Promise<string> {
  const dollars = Math.round(Number(amount) * 100) / 100;
  if (!(dollars > 0)) return "Give a positive amount.";
  if (reason.trim().length < 5) return "Say why this credit is being given.";
  const agentId = await marilAgent();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('support-credit'), $1)`, [agentId]);
    const [limits, spent] = await Promise.all([loadLimits(), spendSoFar(db as any, agentId, owner.storeId)]);
    const refusal = creditRefusal({ amount: dollars, isAdmin: false, limits, agentThisMonth: spent.agentCredits, accountLast30Days: spent.accountCredits });
    if (refusal) { await db.query("ROLLBACK"); return `Not allowed: ${refusal} Offer a ticket so the team can review it.`; }
    const r = await db.query(`UPDATE locations SET platform_credits = COALESCE(platform_credits, 0) + $1 WHERE id = $2 RETURNING platform_credits`, [dollars, owner.storeId]);
    await db.query(`INSERT INTO platform_credit_transactions (store_id, type, amount, description, balance_after) VALUES ($1, 'credit', $2, $3, $4)`,
      [owner.storeId, dollars, reason, r.rows[0].platform_credits]);
    await db.query(`INSERT INTO support_agent_activity (agent_id, account_id, action, details) VALUES ($1, $2, 'credit_issued', $3)`,
      [agentId, owner.storeId, JSON.stringify({ amount: dollars, description: reason, via: "maril_phone" })]);
    await db.query("COMMIT");
    return `Credit of $${dollars.toFixed(2)} added; the account's credit balance is now $${Number(r.rows[0].platform_credits).toFixed(2)}.`;
  } catch (e: any) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("[maril] credit failed:", e?.message ?? e);
    return "The credit could not be applied.";
  } finally {
    db.release();
  }
}

export async function refundCharge(owner: VerifiedOwner, chargeRef: number, amount: number | null, reason: string): Promise<string> {
  if (reason.trim().length < 5) return "Say why this refund is being given.";
  if (!isStripeConfigured()) return "Refunds aren't available right now. Offer a ticket.";
  const { rows: [c] } = await pool.query(
    `SELECT id, amount_cents, stripe_payment_intent_id, stripe_charge_id FROM saas_billing_charges WHERE id = $1 AND store_id = $2 AND status = 'succeeded'`,
    [chargeRef, owner.storeId]);
  if (!c) return "That paid charge was not found on this account.";
  const refunded = Number((await pool.query(`SELECT COALESCE(SUM(amount_cents), 0) AS n FROM refunds WHERE salon_id = $1 AND (stripe_payment_intent_id = $2 OR stripe_charge_id = $3)`,
    [owner.storeId, c.stripe_payment_intent_id, c.stripe_charge_id])).rows[0].n);
  const remaining = Number(c.amount_cents) - refunded;
  const cents = amount == null ? remaining : Math.round(Number(amount) * 100);
  if (!(cents > 0) || cents > remaining) return `The most that can be refunded on that charge is ${money(remaining)}.`;
  const agentId = await marilAgent();
  const refusal = refundRefusal({ amount: cents / 100, isAdmin: false, limits: await loadLimits(), agentThisMonth: (await spendSoFar(pool, agentId, owner.storeId)).agentRefunds });
  if (refusal) return `Not allowed: ${refusal} Offer a ticket so the team can review it.`;
  const target = c.stripe_charge_id ? { charge: c.stripe_charge_id } : c.stripe_payment_intent_id ? { payment_intent: c.stripe_payment_intent_id } : null;
  if (!target) return "That charge has no card payment on record to refund. Offer a ticket.";
  try {
    const refund = await stripe.refunds.create({ ...target, amount: cents, reason: "requested_by_customer" }, { idempotencyKey: `maril-refund-${c.id}-${cents}-${refunded}` });
    await pool.query(
      `INSERT INTO refunds (stripe_refund_id, stripe_charge_id, stripe_payment_intent_id, salon_id, user_id, initiated_by_user_id, amount_cents, reason, internal_reason_notes, refund_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'requested_by_customer', $8, 'manual', $9)`,
      [refund.id, c.stripe_charge_id, c.stripe_payment_intent_id, owner.storeId, owner.userId, `support:${agentId}`, cents, reason, refund.status ?? "pending"]);
    await log(owner.storeId, "payment_refunded", { amountCents: cents, chargeId: c.id, stripeRefundId: refund.id, reason });
    return `Refund of ${money(cents)} issued to the card; banks usually show it in 5–10 business days.`;
  } catch (e: any) {
    console.error("[maril] refund failed:", e?.message ?? e);
    return "The refund could not be issued. Offer a ticket.";
  }
}

/** A ticket for the team, with what the caller needs, when Maril can't finish it on the call. */
export async function openTicket(owner: VerifiedOwner | null, t: { subject: string; description: string; priority?: string; callerName?: string; callerPhone?: string | null }): Promise<string> {
  const priority = ["low", "normal", "high", "urgent"].includes(String(t.priority)) ? String(t.priority) : "normal";
  const number = `TK-${Date.now().toString(36).toUpperCase()}`;
  const agentId = await marilAgent();
  await pool.query(
    `INSERT INTO support_tickets (account_id, ticket_number, subject, description, priority, channel, customer_name, customer_email, phone, business_name, created_by_agent_id, status)
     VALUES ($1, $2, $3, $4, $5, 'VOICE', $6, $7, $8, $9, $10, 'open')`,
    [owner?.storeId ?? null, number, t.subject.slice(0, 200), t.description.slice(0, 4000), priority, t.callerName ?? owner?.firstName ?? null,
      owner?.email ?? null, t.callerPhone ?? null, owner?.businessName ?? null, agentId]);
  if (owner) await log(owner.storeId, "ticket_opened_by_support", { ticket: number, subject: t.subject });
  return number;
}

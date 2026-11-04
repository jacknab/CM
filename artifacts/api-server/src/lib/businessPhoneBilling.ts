/**
 * Business Phone billing (owner, 2026-11-04): $10/month for the Certxa Pro app's business number, charged to the
 * card on file (the one Plus and credits use, routes/soloCredits.ts savedCard) every 31 days by this renewal run.
 * Plus has the business's one saas_billing_profiles row, so the phone is billed on its own line
 * (business_phone_lines, migration 0300).
 *
 *   Renewal due     → charge; paid → paid until 31 days later
 *   Declined        → past_due, tried again 1, 3 and 5 days later; calls and texts still work
 *   Last retry fails → held: calls and texts stop, the number is kept 14 days for the pro to pay, then released
 *   Cancelled       → works until paid_until, then the number is released
 *
 * The run follows SAAS_BILLING_MODE like Plus (services/saas-billing.ts): 'live' charges, 'dry_run' only logs what
 * it would charge (the line keeps working), 'off' charges nothing. Releasing a cancelled or held number happens in
 * every mode. A charge the pro asks for (getting a number, paying after a failure) always goes through.
 */
import twilio from "twilio";
import { pool } from "../db";
import { stripe, isStripeConfigured } from "./stripe";
import { savedCard } from "../routes/soloCredits";
import { pushOwnerMessage } from "./ownerPush";

export const MONTHLY_CENTS = 1000;
export const PERIOD_DAYS = 31;
export const RETRY_AFTER_DAYS = [1, 3, 5];
export const HOLD_DAYS = 14;
const RUN_EVERY_MS = 60 * 60 * 1000;
const DAY = 86_400_000;

export type ChargeResult = { ok: true; paymentId: string } | { ok: false; declined: boolean; needsCard?: boolean; message: string };

const pretty = (n: string) => { const d = n.replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Charge the card on file. `key` makes a repeat of the same attempt return the same payment, never a second one. */
export async function chargePhone(storeId: number, amountCents: number, key: string, description: string): Promise<ChargeResult> {
  if (!isStripeConfigured()) return { ok: false, declined: false, message: "Card payments are not available right now." };
  const card = await savedCard(storeId);
  if (!card) return { ok: false, declined: true, needsCard: true, message: "No card on file." };
  try {
    const pi = await stripe.paymentIntents.create({
      amount: amountCents, currency: "usd", customer: card.customerId, payment_method: card.paymentMethodId,
      off_session: true, confirm: true, description: `${description} (store #${storeId})`,
      metadata: { type: "business_phone", storeId: String(storeId) },
    }, { idempotencyKey: key });
    if (pi.status !== "succeeded") return { ok: false, declined: true, message: "Your bank needs you to confirm this payment." };
    // A repeat of an attempt that was refunded doesn't pay for anything.
    const fresh = await stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
    const charge = fresh.latest_charge as { refunded?: boolean; amount_refunded?: number } | null;
    if (charge && (charge.refunded || (charge.amount_refunded ?? 0) > 0)) return { ok: false, declined: true, message: "That payment was refunded. Try again." };
    return { ok: true, paymentId: pi.id };
  } catch (error: any) {
    const declined = error?.type === "StripeCardError";
    return { ok: false, declined, message: declined ? (error?.message || "Your card was declined.") : "The card processor didn't answer. Try again in a few minutes." };
  }
}

export async function refundPhone(paymentId: string): Promise<void> {
  await stripe.refunds.create({ payment_intent: paymentId }, { idempotencyKey: `refund_${paymentId}` })
    .catch((e: any) => console.error(`[business-phone] refund ${paymentId} failed:`, e?.message));
}

/** Give the number back to Twilio and remove the line. Call history, texts and blocked numbers stay. */
export async function releaseLine(storeId: number, why: "canceled" | "unpaid"): Promise<void> {
  const r = await pool.query<{ phone_number: string; twilio_sid: string }>(
    `DELETE FROM business_phone_lines WHERE store_id = $1 RETURNING phone_number, twilio_sid`, [storeId]);
  const line = r.rows[0];
  if (!line) return;
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (sid && token) {
    await twilio(sid, token).incomingPhoneNumbers(line.twilio_sid).remove().catch((e: any) =>
      console.error(`[business-phone] store=${storeId} number NOT released at Twilio (${line.twilio_sid}):`, e?.message));
  }
  console.log(`[business-phone] store=${storeId} number released (${why})`);
  void pushOwnerMessage(storeId, {
    title: "Business number released",
    body: why === "canceled" ? `Your Business Phone has ended and ${pretty(line.phone_number)} was released.` : `${pretty(line.phone_number)} was released because the Business Phone payment wasn't made.`,
    data: { type: "business_phone" },
  });
}

type DueLine = { store_id: number; phone_number: string; billing_status: string; paid_until: Date; failed_attempts: number };

/** One renewal attempt for a line that is due (active past paid_until, or past_due at next_attempt_at). */
export async function renewLine(line: DueLine, now = new Date()): Promise<"charged" | "declined" | "held" | "pending"> {
  const attempt = line.failed_attempts + 1;
  const result = await chargePhone(line.store_id, MONTHLY_CENTS, `bp-renew-${line.store_id}-${day(new Date(line.paid_until))}-a${attempt}`, "Business Phone, 1 month");
  if (result.ok) {
    const next = new Date(Math.max(new Date(line.paid_until).getTime() + PERIOD_DAYS * DAY, now.getTime() + DAY));
    await pool.query(
      `UPDATE business_phone_lines SET billing_status = 'active', paid_until = $2, failed_attempts = 0, next_attempt_at = NULL, held_until = NULL, last_payment_id = $3
        WHERE store_id = $1`, [line.store_id, next, result.paymentId]);
    console.log(`[business-phone] store=${line.store_id} renewed until ${day(next)} (${result.paymentId})`);
    return "charged";
  }
  if (!result.declined) return "pending";  // Stripe didn't answer: the same attempt again next run
  if (attempt <= RETRY_AFTER_DAYS.length) {
    const retry = new Date(now.getTime() + RETRY_AFTER_DAYS[attempt - 1] * DAY);
    await pool.query(`UPDATE business_phone_lines SET billing_status = 'past_due', failed_attempts = $2, next_attempt_at = $3 WHERE store_id = $1`,
      [line.store_id, attempt, retry]);
    void pushOwnerMessage(line.store_id, { title: "Business Phone payment failed", body: `We couldn't charge $10 for your business number. We'll try again ${retry.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, or pay now in Settings › Business Phone.`, data: { type: "business_phone" } });
    return "declined";
  }
  const until = new Date(now.getTime() + HOLD_DAYS * DAY);
  await pool.query(`UPDATE business_phone_lines SET billing_status = 'held', failed_attempts = $2, next_attempt_at = NULL, held_until = $3 WHERE store_id = $1`,
    [line.store_id, attempt, until]);
  void pushOwnerMessage(line.store_id, { title: "Business Phone paused", body: `Calls and texts to ${pretty(line.phone_number)} are paused. Pay $10 in Settings › Business Phone by ${until.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to keep your number.`, data: { type: "business_phone" } });
  return "held";
}

const dryRunNoted = new Set<string>();

export async function runBusinessPhoneBilling(now = new Date()): Promise<void> {
  const client = await pool.connect();
  try {
    const lock = await client.query(`SELECT pg_try_advisory_lock(hashtext('business-phone-billing')) AS got`);
    if (!lock.rows[0]?.got) return;
    try {
      // Cancelled and paid-up period over, or held 14 days without payment: the number goes.
      const ending = await pool.query<{ store_id: number; why: "canceled" | "unpaid" }>(
        `SELECT store_id, CASE WHEN billing_status = 'held' THEN 'unpaid' ELSE 'canceled' END AS why FROM business_phone_lines
          WHERE (billing_status IN ('active', 'past_due') AND cancel_at_period_end AND paid_until <= $1)
             OR (billing_status = 'held' AND held_until <= $1)`, [now]);
      for (const row of ending.rows) await releaseLine(row.store_id, row.why);

      const mode = String(process.env.SAAS_BILLING_MODE ?? "off").trim().toLowerCase();
      if (mode !== "live" && mode !== "dry_run") return;
      const due = await pool.query<DueLine>(
        `SELECT store_id, phone_number, billing_status, paid_until, failed_attempts FROM business_phone_lines
          WHERE NOT cancel_at_period_end AND ((billing_status = 'active' AND paid_until <= $1) OR (billing_status = 'past_due' AND next_attempt_at <= $1))
          ORDER BY paid_until LIMIT 200`, [now]);
      for (const line of due.rows) {
        if (mode === "dry_run") {
          const key = `${line.store_id}-${day(new Date(line.paid_until))}-${line.failed_attempts}`;
          if (!dryRunNoted.has(key)) { dryRunNoted.add(key); console.log(`[business-phone] DRY RUN: would charge store ${line.store_id} $10 for its business number`); }
          continue;
        }
        await renewLine(line, now).catch((e: any) => console.error(`[business-phone] store=${line.store_id} renewal failed:`, e?.message));
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('business-phone-billing'))`).catch(() => undefined);
    }
  } catch (e: any) {
    console.error("[business-phone] billing run failed:", e?.message);
  } finally {
    client.release();
  }
}

export function startBusinessPhoneBilling(): void {
  setTimeout(() => { void runBusinessPhoneBilling(); }, 3 * 60 * 1000);
  setInterval(() => { void runBusinessPhoneBilling(); }, RUN_EVERY_MS);
}

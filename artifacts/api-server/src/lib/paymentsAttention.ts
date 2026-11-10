/**
 * "Your Stripe account needs attention" (owner, 2026-11-10). After the owner has finished Stripe's setup, Stripe can
 * still ask for more (a new document, a detail that didn't verify) and pauses card payments or payouts if it isn't
 * given in time. Certxa's copy of the account (store_payment_accounts.raw_data.requirements, kept up to date by the
 * account.updated webhook) says when that is so:
 *   - every page of the Certxa Pro app and the salon dashboard shows a thin banner that opens the setup form;
 *   - the owner gets a push (Certxa Pro app) and an e-mail, at most once a day while it lasts.
 * Something Stripe is still checking on its side (pending_verification) needs nothing from the owner, so it is left out.
 */
import { pool } from "../db";
import { sendEmail } from "../mail";
import { emailButton, emailGreeting, emailText } from "./emailLayout";
import { pushOwnerMessage } from "./ownerPush";
import { isSoloUser } from "./soloApiAllowList";

export type PaymentsAttention = { needed: boolean; paused: boolean; deadline: string | null };

type Requirements = {
  currently_due?: string[]; past_due?: string[]; pending_verification?: string[];
  disabled_reason?: string | null; current_deadline?: number | null;
} | null | undefined;

const NO_ACTION_REASONS = new Set(["requirements.pending_verification", "under_review", "listed", "platform_paused"]);

export function attentionFrom(detailsSubmitted: boolean, requirements: Requirements): PaymentsAttention {
  const none = { needed: false, paused: false, deadline: null };
  // Before the setup form is finished the app's Get paid page already says to finish it.
  if (!detailsSubmitted || !requirements) return none;
  const checking = new Set(requirements.pending_verification ?? []);
  const due = [...(requirements.past_due ?? []), ...(requirements.currently_due ?? [])].filter((f) => !checking.has(f));
  const reason = requirements.disabled_reason ?? null;
  const paused = Boolean(reason && !NO_ACTION_REASONS.has(reason) && !reason.startsWith("rejected"));
  if (!due.length && !paused) return none;
  return {
    needed: true,
    paused: paused || Boolean(requirements.past_due?.some((f) => !checking.has(f))),
    deadline: requirements.current_deadline ? new Date(requirements.current_deadline * 1000).toISOString() : null,
  };
}

/** From Certxa's copy of the account. */
export async function storePaymentsAttention(storeId: number): Promise<PaymentsAttention> {
  const { rows: [row] } = await pool.query(
    `SELECT details_submitted, raw_data FROM store_payment_accounts
      WHERE store_id = $1 AND provider = 'stripe' AND status <> 'disconnected' LIMIT 1`, [storeId]);
  return attentionFrom(Boolean(row?.details_submitted), row?.raw_data?.requirements);
}

const SITE = () => (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");

/** After every sync from Stripe: tells the owner (push + e-mail) once a day while Stripe is waiting on them. */
export async function notifyPaymentsAttention(storeId: number): Promise<void> {
  try {
    const attention = await storePaymentsAttention(storeId);
    if (!attention.needed) {
      // Sorted: the next time Stripe asks, the owner hears at once.
      await pool.query(`UPDATE store_payment_accounts SET attention_notified_at = NULL WHERE store_id = $1 AND provider = 'stripe' AND attention_notified_at IS NOT NULL`, [storeId]);
      return;
    }
    const claimed = await pool.query(
      `UPDATE store_payment_accounts SET attention_notified_at = now()
        WHERE store_id = $1 AND provider = 'stripe' AND (attention_notified_at IS NULL OR attention_notified_at < now() - interval '1 day')
        RETURNING id`, [storeId]);
    if (!claimed.rowCount) return;

    const { rows: [owner] } = await pool.query(
      `SELECT l.user_id, u.email, u.first_name FROM locations l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`, [storeId]);
    const solo = owner?.user_id ? await isSoloUser(String(owner.user_id)).catch(() => false) : false;
    const deadline = attention.deadline
      ? new Date(attention.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : null;
    const why = attention.paused
      ? "Stripe has paused card payments or payouts until it gets them."
      : `Card payments and payouts keep working${deadline ? ` until ${deadline}` : ""}, then Stripe pauses them until it gets them.`;

    await pushOwnerMessage(storeId, {
      title: "Stripe needs something from you",
      body: `Stripe asked for more details about you or your business. ${why} Tap to add them.`,
      data: { type: "payments_attention" },
    });
    if (owner?.email) {
      const where = solo
        ? emailText("Open the Certxa Pro app and tap the banner at the top of the screen, or go to Get paid.")
        : emailButton("Add the details", `${SITE()}/payments/payouts`);
      await sendEmail(storeId, owner.email, "Stripe needs something from you", [
        emailGreeting(owner.first_name),
        emailText(`Stripe, who processes your card payments, asked for more details about you or your business. ${why}`),
        emailText("It takes a few minutes, in the same Stripe form you filled in before."),
        where,
      ].join(""), undefined, undefined, { preheader: "Add the details Stripe asked for to keep taking card payments." });
    }
    console.log(`[payments-attention] store=${storeId} told the owner (paused=${attention.paused})`);
  } catch (err: any) {
    console.warn(`[payments-attention] store=${storeId} not sent:`, err?.message ?? err);
  }
}

/**
 * Certxa Pro (Solo plan) text message credits — owner, 2026-10-30; plans/certxa-pro-sms.md.
 *
 * The Solo plan is free, but its texts are not:
 *   • A new Solo account gets free credits (platform_settings.solo_free_sms_credits, default 50).
 *   • Every text to a client from a Solo account spends 1 credit (locations.sms_credits).
 *     With no credits left the text is not sent; e-mails still go. The owner is not e-mailed about a low or
 *     empty balance (owner, 2026-10-30).
 *   • Solo Plus ($3/month, plan code 'solo_plus') sends notification texts without spending credits.
 *     Marketing campaigns still spend credits on Plus.
 *   • Texts that are not to a client (staff invites, owner test texts, payout reminders) are free.
 * Every change to the balance writes one sms_credit_ledger row, so the balance can always be explained.
 */

import { pool } from "../db";
import { resolveStorePlan } from "./featureAccess";

export const SOLO_PLAN_CODES = ["solo", "solo_plus"] as const;
export type SoloPlanCode = (typeof SOLO_PLAN_CODES)[number];

/** Texts that never go to a client — never charged to a Solo account. */
const NOT_TO_CLIENTS = new Set([
  "test", "staff_invite_app_link", "staff_invite_otp", "payout_reminder", "gbp_postcard_day_7", "gbp_postcard_day_10",
]);
/** Marketing texts: Plus does not make these free. */
const MARKETING = new Set(["campaign", "campaign_test", "bulk_sms"]);

export async function soloPlanCode(storeId: number): Promise<SoloPlanCode | null> {
  const plan = await resolveStorePlan(storeId).catch(() => null);
  return plan && (SOLO_PLAN_CODES as readonly string[]).includes(plan.planCode) ? (plan.planCode as SoloPlanCode) : null;
}

/** What a text of this type costs this store: 'credit' (spend 1 Solo credit) or null (the usual rules apply). */
export async function soloTextCharge(storeId: number, messageType: string): Promise<"credit" | "free" | null> {
  if (NOT_TO_CLIENTS.has(messageType)) return null;
  const code = await soloPlanCode(storeId);
  if (!code) return null;
  if (code === "solo_plus" && !MARKETING.has(messageType)) return "free";
  return "credit";
}

/** Take 1 credit for a text. Returns the balance left, or null when there was none to take. */
export async function spendSoloCredit(storeId: number, messageType: string): Promise<number | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE locations SET sms_credits = sms_credits - 1 WHERE id = $1 AND sms_credits > 0 RETURNING sms_credits`,
      [storeId],
    );
    if (!r.rows[0]) { await client.query("ROLLBACK"); return null; }
    const left = Number(r.rows[0].sms_credits);
    await client.query(
      `INSERT INTO sms_credit_ledger (store_id, change, balance_after, reason, message_type) VALUES ($1, -1, $2, 'text', $3)`,
      [storeId, left, messageType],
    );
    await client.query("COMMIT");
    return left;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Give back a credit taken for a text that could not be sent. */
export async function refundSoloCredit(storeId: number, messageType: string, why: string): Promise<void> {
  await addSoloCredits(storeId, 1, "refund", { messageType, note: why, clearAlert: false }).catch((e) =>
    console.error(`[solo-sms] refund failed store=${storeId}:`, e?.message ?? e));
}

/**
 * Add credits (free grant, purchase, refund, admin). With a reference the same addition can only happen once —
 * returns null when that reference was already used.
 */
export async function addSoloCredits(
  storeId: number,
  amount: number,
  reason: "free_grant" | "purchase" | "refund" | "admin",
  opts: { reference?: string; note?: string; messageType?: string; clearAlert?: boolean } = {},
): Promise<number | null> {
  if (!Number.isInteger(amount) || amount === 0) throw new Error("amount must be a whole number");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (opts.reference) {
      // Serialize additions per store so the reference check and the insert can't race.
      await client.query(`SELECT id FROM locations WHERE id = $1 FOR UPDATE`, [storeId]);
      const seen = await client.query(`SELECT 1 FROM sms_credit_ledger WHERE store_id = $1 AND reference = $2`, [storeId, opts.reference]);
      if (seen.rows[0]) { await client.query("ROLLBACK"); return null; }
    }
    const r = await client.query(
      `UPDATE locations SET sms_credits = GREATEST(sms_credits + $2, 0)${opts.clearAlert === false ? "" : ", sms_credit_alert = NULL"}
        WHERE id = $1 RETURNING sms_credits`,
      [storeId, amount],
    );
    if (!r.rows[0]) throw new Error("store not found");
    const balance = Number(r.rows[0].sms_credits);
    await client.query(
      `INSERT INTO sms_credit_ledger (store_id, change, balance_after, reason, message_type, reference, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [storeId, amount, balance, reason, opts.messageType ?? null, opts.reference ?? null, opts.note ?? null],
    );
    if (reason === "purchase") {
      await client.query(`UPDATE locations SET sms_credits_total_purchased = sms_credits_total_purchased + $2 WHERE id = $1`, [storeId, amount]);
    }
    await client.query("COMMIT");
    return balance;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function soloFreeCreditsSetting(): Promise<number> {
  const r = await pool.query(`SELECT solo_free_sms_credits FROM platform_settings ORDER BY id LIMIT 1`);
  return Number(r.rows[0]?.solo_free_sms_credits ?? 50);
}

/** A new Solo account's free credits — once per account. */
export async function grantSoloFreeCredits(storeId: number): Promise<void> {
  const amount = await soloFreeCreditsSetting();
  if (amount <= 0) return;
  await addSoloCredits(storeId, amount, "free_grant", { reference: "free_grant", note: "Free credits for a Solo account" });
}

/** Balance, plan and recent activity for the app and the website. */
export async function soloCreditsSummary(storeId: number) {
  const code = await soloPlanCode(storeId);
  const bal = await pool.query(`SELECT sms_credits FROM locations WHERE id = $1`, [storeId]);
  const recent = await pool.query(
    `SELECT change, balance_after, reason, message_type, note, created_at FROM sms_credit_ledger
      WHERE store_id = $1 ORDER BY id DESC LIMIT 30`,
    [storeId],
  );
  const month = await pool.query(
    `SELECT count(*)::int AS n FROM sms_log WHERE store_id = $1 AND status = 'sent' AND sent_at >= date_trunc('month', now())
       AND message_type NOT IN ('test', 'staff_invite_app_link', 'staff_invite_otp', 'payout_reminder')`,
    [storeId],
  );
  return {
    plan: code,
    unlimited: code === "solo_plus",
    credits: Number(bal.rows[0]?.sms_credits ?? 0),
    textsThisMonth: Number(month.rows[0]?.n ?? 0),
    recent: recent.rows.map((r) => ({
      change: r.change, balanceAfter: r.balance_after, reason: r.reason, messageType: r.message_type, note: r.note, at: r.created_at,
    })),
  };
}

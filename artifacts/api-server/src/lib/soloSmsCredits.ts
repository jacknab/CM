/**
 * Certxa Pro (Solo plan) text message credits — owner, 2026-10-30; plans/certxa-pro-sms.md.
 *
 * The Solo plan is free, but its texts are not:
 *   • A new Solo account gets free credits once (platform_settings.solo_free_sms_credits, default 50). Certxa
 *     never tops the balance up by itself; more credits come only from a bought package.
 *   • Every text the account sends spends 1 credit (locations.sms_credits), taken before it goes to Twilio. A text
 *     Twilio then fails still costs its credit (owner, 2026-11-03). With no credits left the text is not sent;
 *     e-mails still go. The owner is not e-mailed about a low or empty balance (owner, 2026-10-30).
 *   • Plus (locations.sms_plus, on while the $5/month Plus plan runs): ONLY notification texts (NOTIFICATIONS
 *     below) are free. Every other text, and every text with the switch off, spends a credit (owner, 2026-11-03).
 *   • Certxa's own texts to the owner or team (PLATFORM_TO_OWNER) are not the account's texts and are free.
 * Every change to the balance writes one sms_credit_ledger row, so the balance can always be explained.
 */

import { pool } from "../db";
import { resolveStorePlan } from "./featureAccess";

export const SOLO_PLAN_CODES = ["solo", "solo_plus"] as const;
export type SoloPlanCode = (typeof SOLO_PLAN_CODES)[number];

/** Certxa's own texts to the owner or team — never charged. */
const PLATFORM_TO_OWNER = new Set([
  "staff_invite_app_link", "staff_invite_otp", "payout_reminder", "gbp_postcard_day_7", "gbp_postcard_day_10",
]);
/**
 * Notification texts: about the client's own booking or visit. The only texts Plus makes free. A type not listed
 * here (marketing, win-back and rebooking nudges, review requests, two-way replies, test texts, anything new)
 * spends a credit even on Plus.
 */
export const NOTIFICATIONS = new Set([
  "booking_confirmation", "booking_request", "reschedule_notice", "reminder",
  "sms_cancel_confirm", "sms_cancel_noop", "chatbot_confirm", "chatbot_cancel", "chatbot_reschedule", "dialer_confirm", "dialer_cancel",
  "booking_payment_required", "booking_payment_reminder", "pos_receipt", "pos_receipt_link",
  "kiosk_called", "nail_ready", "queue_travel_alert",
  "line_joined", "line_leave_now", "line_your_turn", "line_moved_back", "line_removed", "line_up",
]);

export async function soloPlanCode(storeId: number): Promise<SoloPlanCode | null> {
  const plan = await resolveStorePlan(storeId).catch(() => null);
  return plan && (SOLO_PLAN_CODES as readonly string[]).includes(plan.planCode) ? (plan.planCode as SoloPlanCode) : null;
}

/** Whether the store's texts are paid from Solo credits: a Solo/Plus plan, or a Certxa Pro (app) account. */
async function usesSoloCredits(storeId: number): Promise<boolean> {
  if (await soloPlanCode(storeId)) return true;
  const r = await pool.query(
    `SELECT 1 FROM locations l JOIN users u ON u.id = l.user_id WHERE l.id = $1 AND u.account_type = 'certxa_pro'`,
    [storeId],
  );
  return r.rows.length > 0;
}

/** Plus's switch for this store's texts (locations.sms_plus). */
export async function smsPlusOn(storeId: number): Promise<boolean> {
  const r = await pool.query(`SELECT sms_plus FROM locations WHERE id = $1`, [storeId]);
  return r.rows[0]?.sms_plus === true;
}

/** Turns Plus's free notification texts on or off (Plus starting or ending, or by hand). */
export async function setSmsPlus(storeId: number, on: boolean): Promise<void> {
  await pool.query(`UPDATE locations SET sms_plus = $2 WHERE id = $1`, [storeId, on]);
}

/** What a text of this type costs this store: 'credit' (spend 1 Solo credit), 'free' (Plus notification) or null (not a Solo account: the usual rules apply). */
export async function soloTextCharge(storeId: number, messageType: string): Promise<"credit" | "free" | null> {
  if (PLATFORM_TO_OWNER.has(messageType)) return null;
  if (!(await usesSoloCredits(storeId))) return null;
  if (NOTIFICATIONS.has(messageType) && (await smsPlusOn(storeId))) return "free";
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

/** Give back a credit when Certxa never tried to send the text (no text service configured). A text Twilio refused still costs its credit. */
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

/** A package of text message credits the app sells (set in /isAdmin › Platform Settings; migration 0293). */
export type SoloCreditPack = { id: string; credits: number; priceCents: number };
export const DEFAULT_CREDIT_PACKS: SoloCreditPack[] = [
  { id: "c100", credits: 100, priceCents: 499 }, { id: "c250", credits: 250, priceCents: 799 }, { id: "c500", credits: 500, priceCents: 1199 },
];
export const MAX_CREDIT_PACKS = 6;

/** Keeps only well-formed packages: whole credits 1–100,000, a price from $0.50 to $1,000, at most six. */
export function cleanCreditPacks(raw: unknown): SoloCreditPack[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p: any) => {
    const credits = Number(p?.credits), priceCents = Number(p?.priceCents);
    const id = typeof p?.id === "string" && /^[a-z0-9_-]{1,20}$/i.test(p.id) ? p.id : null;
    if (!id || !Number.isInteger(credits) || credits < 1 || credits > 100_000 || !Number.isInteger(priceCents) || priceCents < 50 || priceCents > 100_000) return [];
    return [{ id, credits, priceCents }];
  }).slice(0, MAX_CREDIT_PACKS);
}

export async function soloCreditPacks(): Promise<SoloCreditPack[]> {
  const r = await pool.query(`SELECT solo_credit_packs FROM platform_settings ORDER BY id LIMIT 1`).catch(() => null);
  const packs = cleanCreditPacks(r?.rows[0]?.solo_credit_packs);
  return packs.length ? packs : DEFAULT_CREDIT_PACKS;
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
  const bal = await pool.query(`SELECT sms_credits, sms_plus FROM locations WHERE id = $1`, [storeId]);
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
    unlimited: bal.rows[0]?.sms_plus === true,
    credits: Number(bal.rows[0]?.sms_credits ?? 0),
    textsThisMonth: Number(month.rows[0]?.n ?? 0),
    recent: recent.rows.map((r) => ({
      change: r.change, balanceAfter: r.balance_after, reason: r.reason, messageType: r.message_type, note: r.note, at: r.created_at,
    })),
  };
}

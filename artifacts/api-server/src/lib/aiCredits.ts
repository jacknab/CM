/**
 * AI credits for the Website Builder (owner, 2026-11-09; plans/ai-website-builder.md). Separate from text-message
 * credits. Every account (Certxa Pro and salons) gets AI_FREE_CREDITS (200) once, the first time it opens the builder.
 * A charge is atomic (never below zero) and happens once per charge key, so a retried request isn't charged twice;
 * a failed AI step is refunded.
 */
import { pool } from "../db";

export const AI_FREE_CREDITS = Number(process.env.AI_FREE_CREDITS || 200);
/** What each step costs (plans/ai-website-builder.md, Stage 0). */
export const AI_CREDIT_PRICES = { ideas: 10, moreIdeas: 10, build: 15, edit: 2, research: 5 } as const;

export class NotEnoughCreditsError extends Error {
  constructor(public needed: number, public balance: number) { super(`This needs ${needed} credits; you have ${balance}.`); }
}

/** The balance, granting the free credits the first time. */
export async function aiCreditBalance(storeId: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO ai_credit_accounts (store_id) VALUES ($1) ON CONFLICT DO NOTHING`, [storeId]);
    const row = (await client.query(`SELECT balance, free_granted_at FROM ai_credit_accounts WHERE store_id = $1 FOR UPDATE`, [storeId])).rows[0];
    let balance = Number(row.balance);
    if (!row.free_granted_at && AI_FREE_CREDITS > 0) {
      balance += AI_FREE_CREDITS;
      await client.query(`UPDATE ai_credit_accounts SET balance = $2, free_granted_at = now(), updated_at = now() WHERE store_id = $1`, [storeId, balance]);
      await client.query(`INSERT INTO ai_credit_ledger (store_id, change, reason, charge_key, balance_after) VALUES ($1,$2,'free credits',$3,$4) ON CONFLICT (charge_key) DO NOTHING`,
        [storeId, AI_FREE_CREDITS, `free:${storeId}`, balance]);
    }
    await client.query("COMMIT");
    return balance;
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; }
  finally { client.release(); }
}

/** Take credits for a step. Same key twice = charged once. Throws NotEnoughCreditsError. Returns the balance after. */
export async function chargeAiCredits(storeId: number, credits: number, reason: string, key: string): Promise<number> {
  await aiCreditBalance(storeId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const done = (await client.query(`SELECT balance_after FROM ai_credit_ledger WHERE charge_key = $1`, [key])).rows[0];
    if (done) { await client.query("COMMIT"); return Number(done.balance_after); }
    const row = (await client.query(`UPDATE ai_credit_accounts SET balance = balance - $2, updated_at = now() WHERE store_id = $1 AND balance >= $2 RETURNING balance`, [storeId, credits])).rows[0];
    if (!row) {
      const have = Number((await client.query(`SELECT balance FROM ai_credit_accounts WHERE store_id = $1`, [storeId])).rows[0]?.balance ?? 0);
      await client.query("ROLLBACK");
      throw new NotEnoughCreditsError(credits, have);
    }
    await client.query(`INSERT INTO ai_credit_ledger (store_id, change, reason, charge_key, balance_after) VALUES ($1,$2,$3,$4,$5)`, [storeId, -credits, reason, key, row.balance]);
    await client.query("COMMIT");
    return Number(row.balance);
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; }
  finally { client.release(); }
}

/** Give back a charge whose AI step failed (once per charge key). */
export async function refundAiCredits(storeId: number, key: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const charge = (await client.query(`SELECT change FROM ai_credit_ledger WHERE charge_key = $1 AND store_id = $2`, [key, storeId])).rows[0];
    if (!charge || Number(charge.change) >= 0) { await client.query("ROLLBACK"); return; }
    const already = (await client.query(`SELECT 1 FROM ai_credit_ledger WHERE charge_key = $1`, [`refund:${key}`])).rows[0];
    if (already) { await client.query("ROLLBACK"); return; }
    const row = (await client.query(`UPDATE ai_credit_accounts SET balance = balance + $2, updated_at = now() WHERE store_id = $1 RETURNING balance`, [storeId, -Number(charge.change)])).rows[0];
    await client.query(`INSERT INTO ai_credit_ledger (store_id, change, reason, charge_key, balance_after) VALUES ($1,$2,'refund: the AI step failed',$3,$4) ON CONFLICT (charge_key) DO NOTHING`,
      [storeId, -Number(charge.change), `refund:${key}`, row.balance]);
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; }
  finally { client.release(); }
}

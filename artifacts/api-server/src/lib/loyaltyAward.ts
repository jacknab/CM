import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Loyalty points — one place that changes a client's balance, so the balance and the ledger (loyalty_transactions) can never drift.
 *
 *   applyLoyaltyDelta  — the only writer: locks the client row, applies a signed change (never below zero), and writes the ledger row
 *                        for what was ACTUALLY applied, in one transaction.
 *   awardLoyaltyForCompletion — points for a completed, paid appointment. Idempotent per appointment: it works out what the appointment
 *                        SHOULD have earned and only books the difference, so completing, reopening and completing again (or a retry, or two
 *                        code paths racing) can never award twice.
 *   redeemLoyaltyReward — spends points on a reward, atomically and once per ticket.
 *
 * Every code path that can complete a paid appointment (the web PATCH route, Stripe Terminal capture, offline-sync reconciliation) calls
 * awardLoyaltyForCompletion. It never throws — a loyalty failure must never block a checkout.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Points earned for a paid amount: whole points, on what was spent — a tip is a gratuity, not spend, so it earns nothing. */
export function pointsToAward(totalPaid: number, tip: number, pointsPerDollar: number): number {
  const spend = Math.max(0, (Number(totalPaid) || 0) - Math.max(0, Number(tip) || 0));
  return Math.round(spend * (Number(pointsPerDollar) > 0 ? Number(pointsPerDollar) : 1));
}

/** What still has to be booked so an appointment has earned exactly `target`, given what it has already earned (net). */
export const awardDelta = (target: number, alreadyAwarded: number): number => Math.round(target) - Math.round(alreadyAwarded);

export interface DeltaInput {
  storeId: number;
  customerId: number;
  /** Signed: positive adds points, negative takes them away. */
  points: number;
  type: "earn" | "redeem" | "bonus" | "adjust";
  description: string;
  appointmentId?: number | null;
}
export interface DeltaResult { applied: number; balance: number; transactionId: number | null }

/** Change a balance inside an open transaction. Returns what was really applied (a deduction can't take a balance below zero). */
export async function applyLoyaltyDeltaTx(tx: Tx, a: DeltaInput): Promise<DeltaResult | null> {
  const locked: any = (await tx.execute(sql`
    SELECT loyalty_points FROM clients WHERE id = ${a.customerId} AND store_id = ${a.storeId} FOR UPDATE`)).rows[0];
  if (!locked) return null;
  const before = Number(locked.loyalty_points) || 0;
  const after = Math.max(0, before + Math.trunc(a.points));
  const applied = after - before;
  if (applied === 0) return { applied: 0, balance: before, transactionId: null };
  await tx.execute(sql`UPDATE clients SET loyalty_points = ${after} WHERE id = ${a.customerId}`);
  const row: any = (await tx.execute(sql`
    INSERT INTO loyalty_transactions (store_id, customer_id, appointment_id, type, points, description)
    VALUES (${a.storeId}, ${a.customerId}, ${a.appointmentId ?? null}, ${a.type}, ${applied}, ${a.description})
    RETURNING id`)).rows[0];
  return { applied, balance: after, transactionId: Number(row.id) };
}

/** Change a balance (its own transaction). Null when the client isn't in that store. */
export const applyLoyaltyDelta = (a: DeltaInput): Promise<DeltaResult | null> => db.transaction((tx) => applyLoyaltyDeltaTx(tx, a));

/**
 * Keep the cached `clients.total_visits` / `total_spent_cents` right (the client pages compute them live, but the at-risk report and the
 * kiosk lookup read the stored copy, and the client merge used to write dollars into the cents column). `last_visit_at` is left alone on
 * purpose — the lapsed-client campaign scheduler keys off it.
 */
export async function refreshClientStats(customerId: number, storeId: number): Promise<void> {
  await db.execute(sql`
    UPDATE clients c SET
      total_visits = (SELECT COUNT(*)::int FROM appointments a WHERE a.customer_id = c.id AND a.store_id = c.store_id AND a.status = 'completed'),
      total_spent_cents = COALESCE((SELECT ROUND(SUM(CAST(a.total_paid AS DECIMAL(10,2))) * 100)::int FROM appointments a
                                     WHERE a.customer_id = c.id AND a.store_id = c.store_id AND a.status = 'completed'), 0)
    WHERE c.id = ${customerId} AND c.store_id = ${storeId}`);
}

export async function awardLoyaltyForCompletion(opts: {
  storeId: number;
  customerId: number | null | undefined;
  appointmentId: number;
  totalPaid: number;
}): Promise<void> {
  const { storeId, customerId, appointmentId, totalPaid } = opts;
  if (!customerId) return;

  try {
    await refreshClientStats(customerId, storeId).catch((e) => console.error("[Loyalty] stats refresh:", e?.message));
    if (!(totalPaid > 0)) return;

    const cfg: any = (await db.execute(sql`SELECT preferences FROM store_settings WHERE store_id = ${storeId}`)).rows[0];
    const lp = cfg?.preferences ? (JSON.parse(cfg.preferences as string).loyalty ?? {}) : {};
    if (lp.enabled === false) return;
    const pointsPerDollar = Number(lp.pointsPerDollar) > 0 ? Number(lp.pointsPerDollar) : 1;

    await db.transaction(async (tx) => {
      // Lock the client first so two completions of the same ticket take turns, then look at what it has already earned.
      const locked: any = (await tx.execute(sql`SELECT id FROM clients WHERE id = ${customerId} AND store_id = ${storeId} FOR UPDATE`)).rows[0];
      if (!locked) return;
      const appt: any = (await tx.execute(sql`SELECT tip_amount FROM appointments WHERE id = ${appointmentId} AND store_id = ${storeId}`)).rows[0];
      const target = pointsToAward(totalPaid, Number(appt?.tip_amount) || 0, pointsPerDollar);
      const already: any = (await tx.execute(sql`
        SELECT COALESCE(SUM(points), 0)::int AS net FROM loyalty_transactions
         WHERE customer_id = ${customerId} AND appointment_id = ${appointmentId} AND type IN ('earn', 'adjust')`)).rows[0];
      const delta = awardDelta(target, Number(already?.net) || 0);
      if (delta === 0) return;
      const spend = (totalPaid - (Number(appt?.tip_amount) || 0)).toFixed(2);
      const res = await applyLoyaltyDeltaTx(tx, {
        storeId, customerId, appointmentId, points: delta,
        type: delta > 0 ? "earn" : "adjust",
        description: delta > 0
          ? `Earned for appointment #${appointmentId} (${spend} @ ${pointsPerDollar}pt/$)`
          : `Correction for appointment #${appointmentId} (${spend} @ ${pointsPerDollar}pt/$)`,
      });
      if (res) console.log(`[Loyalty] ${delta > 0 ? "Awarded" : "Corrected"} ${delta} pts for customer ${customerId} (appointment ${appointmentId})`);
    });
  } catch (loyaltyErr) {
    console.error("[Loyalty] Auto-earn error:", loyaltyErr);
  }
}

/**
 * Client merge: move the loser's loyalty history AND balance to the winner, keeping balance == ledger on both sides. Its transactions are
 * re-pointed, the balance is carried across and the loser is zeroed; points the loser had with no transaction behind them are booked as
 * an "adjust" row on the winner so the winner's ledger still adds up to its balance.
 */
export async function mergeLoyaltyTx(tx: Tx, storeId: number, winnerId: number, loserId: number): Promise<void> {
  const lp: any = (await tx.execute(sql`
    SELECT COALESCE(loyalty_points, 0) AS bal,
           (SELECT COALESCE(SUM(points), 0) FROM loyalty_transactions WHERE customer_id = ${loserId}) AS led
      FROM clients WHERE id = ${loserId} FOR UPDATE`)).rows[0];
  await tx.execute(sql`UPDATE loyalty_transactions SET customer_id = ${winnerId} WHERE customer_id = ${loserId}`);
  const loserBal = Number(lp?.bal) || 0;
  const loserLedger = Number(lp?.led) || 0;
  if (loserBal !== 0) {
    await tx.execute(sql`UPDATE clients SET loyalty_points = COALESCE(loyalty_points, 0) + ${loserBal} WHERE id = ${winnerId}`);
    await tx.execute(sql`UPDATE clients SET loyalty_points = 0 WHERE id = ${loserId}`);
  }
  if (loserBal !== loserLedger) {
    await tx.execute(sql`
      INSERT INTO loyalty_transactions (store_id, customer_id, type, points, description)
      VALUES (${storeId}, ${winnerId}, 'adjust', ${loserBal - loserLedger}, ${`Points carried over from merged client #${loserId} (no transaction history)`})`);
  }
}

export type RedeemResult =
  | { ok: true; rewardId: number; name: string; pointsCost: number; dollarValue: number; newBalance: number; alreadyRedeemed: boolean }
  | { ok: false; status: number; message: string; balance?: number; pointsCost?: number };

/**
 * Spend points on a reward. One atomic transaction (a stale read can't let two stations spend the same points) and once per ticket:
 * asking again for the same reward on the same appointment returns the earlier redemption instead of charging again.
 */
export async function redeemLoyaltyReward(a: { storeId: number; customerId: number; rewardId: number; appointmentId: number | null }): Promise<RedeemResult> {
  return db.transaction(async (tx): Promise<RedeemResult> => {
    const reward: any = (await tx.execute(sql`
      SELECT id, name, points_cost, dollar_value FROM loyalty_rewards WHERE id = ${a.rewardId} AND store_id = ${a.storeId}`)).rows[0];
    if (!reward) return { ok: false, status: 404, message: "Reward not found" };
    const cost = Number(reward.points_cost);
    const dollarValue = Number(reward.dollar_value);
    const description = `Redeemed "${reward.name}" — $${dollarValue.toFixed(2)} off`;

    const locked: any = (await tx.execute(sql`
      SELECT loyalty_points FROM clients WHERE id = ${a.customerId} AND store_id = ${a.storeId} FOR UPDATE`)).rows[0];
    if (!locked) return { ok: false, status: 404, message: "Customer not found" };
    const balance = Number(locked.loyalty_points) || 0;

    if (a.appointmentId != null) {
      const prior: any = (await tx.execute(sql`
        SELECT id FROM loyalty_transactions
         WHERE customer_id = ${a.customerId} AND appointment_id = ${a.appointmentId} AND type = 'redeem' AND description = ${description} LIMIT 1`)).rows[0];
      if (prior) return { ok: true, rewardId: reward.id, name: reward.name, pointsCost: cost, dollarValue, newBalance: balance, alreadyRedeemed: true };
    }
    if (balance < cost) return { ok: false, status: 400, message: "Not enough points", balance, pointsCost: cost };

    const res = await applyLoyaltyDeltaTx(tx, { storeId: a.storeId, customerId: a.customerId, appointmentId: a.appointmentId, points: -cost, type: "redeem", description });
    return { ok: true, rewardId: reward.id, name: reward.name, pointsCost: cost, dollarValue, newBalance: res?.balance ?? balance - cost, alreadyRedeemed: false };
  });
}

/**
 * Gift cards as a payment on the Nail POS checkout.
 *
 * The older /api/gift-cards/check + /redeem routes are neither store-scoped nor atomic (a stale read lets two stations spend the
 * same balance, any signed-in store can redeem any store's card, and a negative / non-numeric amount corrupts the balance), so the
 * POS uses these instead:
 *   lookup — the card must belong to THIS store, be active, unexpired and have a balance.
 *   redeem — one atomic conditional UPDATE (never below zero), the ledger row, and the ticket's gift_card_amount (which
 *            Reports / Analytics / Dashboard read) all commit together. Redeeming the same card for the same ticket twice
 *            is a no-op, so a retry after a failed sale-close never charges the card twice.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export type GiftResult<T> = ({ ok: true } & T) | { ok: false; status: number; message: string };
export interface GiftCardInfo { code: string; balance: number; issuedTo: string | null }
export interface GiftRedeemed { code: string; redeemed: number; balance: number; alreadyRedeemed: boolean }

export const normalizeGiftCode = (raw: unknown): string => String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
/** Whole cents, or null when the amount is missing / not a positive number. */
export const giftAmountCents = (raw: unknown): number | null => {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const c = Math.round(n * 100);
  return c > 0 ? c : null;
};
const dollars = (cents: number) => (cents / 100).toFixed(2);

/** Why a card can't be spent, or null when it can. */
export function giftCardProblem(card: { isActive: boolean; balance: number; expiresAt: Date | string | null }, now = new Date()): string | null {
  if (card.expiresAt && new Date(card.expiresAt) <= now) return "This gift card has expired";
  if (!card.isActive || card.balance <= 0) return "This gift card has no balance left";
  return null;
}

export async function lookupGiftCard(storeId: number, rawCode: unknown): Promise<GiftResult<{ card: GiftCardInfo }>> {
  const code = normalizeGiftCode(rawCode);
  if (!code) return { ok: false, status: 400, message: "Enter the gift card code" };
  const r = await db.execute(sql`
    SELECT code, remaining_balance, is_active, expires_at, issued_to_name
      FROM gift_cards WHERE code = ${code} AND store_id = ${storeId} LIMIT 1`);
  const row: any = r.rows[0];
  if (!row) return { ok: false, status: 404, message: "Gift card not found" };
  const balance = Number(row.remaining_balance) || 0;
  const problem = giftCardProblem({ isActive: !!row.is_active, balance, expiresAt: row.expires_at });
  if (problem) return { ok: false, status: 400, message: problem };
  return { ok: true, card: { code: row.code, balance, issuedTo: row.issued_to_name ?? null } };
}

/**
 * Redeem points off a gift card. `appointmentId` is optional: the Nail POS checkout always passes one (so the ticket's
 * `gift_card_amount` is updated for Reports/Analytics/Dashboard, and redeeming for the same ticket twice is a no-op); the
 * owner's manual Gift Cards console (a phone order, a balance correction — no ticket involved) passes null, so it always
 * redeems fresh with no idempotency key. Either way the update is one atomic conditional UPDATE, scoped to this store, and
 * the balance can never go below zero.
 */
export async function redeemGiftCard(a: { storeId: number; code: unknown; amount: unknown; appointmentId: number | null }): Promise<GiftResult<GiftRedeemed>> {
  const code = normalizeGiftCode(a.code);
  const cents = giftAmountCents(a.amount);
  if (!code) return { ok: false, status: 400, message: "Enter the gift card code" };
  if (cents === null) return { ok: false, status: 400, message: "Enter an amount greater than zero" };
  const amt = dollars(cents);

  return db.transaction(async (tx): Promise<GiftResult<GiftRedeemed>> => {
    if (a.appointmentId != null) {
      const own: any = (await tx.execute(sql`SELECT id FROM appointments WHERE id = ${a.appointmentId} AND store_id = ${a.storeId}`)).rows[0];
      if (!own) return { ok: false, status: 404, message: "Ticket not found" };
    }

    // Lock the card row so two stations redeeming at once take turns.
    const card: any = (await tx.execute(sql`SELECT id FROM gift_cards WHERE code = ${code} AND store_id = ${a.storeId} FOR UPDATE`)).rows[0];
    if (!card) return { ok: false, status: 404, message: "Gift card not found" };

    if (a.appointmentId != null) {
      const prior: any = (await tx.execute(sql`
        SELECT amount, balance_after FROM gift_card_transactions
         WHERE gift_card_id = ${card.id} AND appointment_id = ${a.appointmentId} AND type = 'redemption' LIMIT 1`)).rows[0];
      if (prior) return { ok: true, code, redeemed: Number(prior.amount) || 0, balance: Number(prior.balance_after) || 0, alreadyRedeemed: true };
    }

    const upd: any = (await tx.execute(sql`
      UPDATE gift_cards
         SET remaining_balance = remaining_balance - ${amt}::numeric,
             is_active = (remaining_balance - ${amt}::numeric) > 0
       WHERE id = ${card.id} AND is_active = true AND remaining_balance >= ${amt}::numeric
         AND (expires_at IS NULL OR expires_at > now())
   RETURNING remaining_balance`)).rows[0];
    if (!upd) {
      const now: any = (await tx.execute(sql`SELECT remaining_balance, is_active, expires_at FROM gift_cards WHERE id = ${card.id}`)).rows[0];
      const bal = Number(now?.remaining_balance) || 0;
      const problem = giftCardProblem({ isActive: !!now?.is_active, balance: bal, expiresAt: now?.expires_at ?? null });
      return { ok: false, status: 400, message: problem ?? `Only $${bal.toFixed(2)} is left on this gift card` };
    }
    const balance = Number(upd.remaining_balance) || 0;

    await tx.execute(sql`
      INSERT INTO gift_card_transactions (gift_card_id, store_id, appointment_id, amount, type, balance_after, notes)
      VALUES (${card.id}, ${a.storeId}, ${a.appointmentId}, ${amt}::numeric, 'redemption', ${balance.toFixed(2)}::numeric,
              ${a.appointmentId != null ? "Nail POS checkout" : "Manual redemption"})`);
    if (a.appointmentId != null) {
      // What Reports / Analytics / Dashboard subtract as "paid by gift card".
      await tx.execute(sql`
        UPDATE appointments SET gift_card_id = ${card.id}, gift_card_amount = COALESCE(gift_card_amount, 0) + ${amt}::numeric
         WHERE id = ${a.appointmentId} AND store_id = ${a.storeId}`);
    }
    return { ok: true, code, redeemed: cents / 100, balance, alreadyRedeemed: false };
  });
}

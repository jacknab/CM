/** Nail checkout's single PostgreSQL transaction. Stripe is verified outside this
 * transaction because an external capture cannot be rolled back by PostgreSQL. */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { captureTerminalPaymentIntent, getPaymentAccount, retrieveTerminalPaymentIntent } from "./stripeConnect";
import { applyLoyaltyDeltaTx } from "./loyaltyAward";
import { NO_SALES_TAX, salesTaxCents, type SalesTaxSettings } from "@shared/nailCheckout";

/** `card`: a card taken on the salon's own terminal and only recorded here — no Certxa charge behind it. */
export interface NailTender { method: "cash" | "gift" | "m2" | "tap" | "card"; amount: number; code?: string; paymentIntentId?: string }
export interface NailShare { appointmentId: number; tip: number; discount: number; totalPaid: number; serviceRevenue: number; productRevenue: number; paymentMethod: string }
export interface NailCheckoutInput {
  storeId: number; appointmentId: number; idempotencyKey: string;
  /** When the money was actually taken, for a sale recorded on a tablet while it was offline and sent later.
   *  The sale is dated then, so it lands in the drawer shift it was really collected in, not the one that
   *  happens to be open when the tablet reconnects. Absent = now. */
  collectedAt?: Date | null;
  tip: number; discount: number; totalPaid: number; serviceRevenue: number; productRevenue: number; paymentMethod: string;
  /** Sales tax on the whole sale (included in totalPaid). Must equal what the store's own POS tax settings give. */
  tax?: number;
  tenders: NailTender[]; groupTickets?: NailShare[];
  /** Explicit staff-added retail/custom/removal lines not attached to the appointment. */
  extras?: { label: string; price: number }[];
  redemption?: { customerId: number; rewardId: number };
}
export class NailCheckoutError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
const cents = (value: number) => Math.round(value * 100);
const validMoney = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100000 && cents(v) / 100 === v;

/**
 * The sale's card payments, before anything is saved. Each was only authorized when it was taken (see the
 * capture route in routes/stripeConnect.ts): it must still be this ticket's, for this amount, and is charged
 * now. A voided or expired authorization stops the sale instead of saving it unpaid.
 */
export async function chargeCardTenders(a: Pick<NailCheckoutInput, "storeId" | "appointmentId">, cards: NailTender[]): Promise<void> {
  const account = await getPaymentAccount(a.storeId);
  if (!account || account.status === "disconnected") throw new NailCheckoutError("Stripe account is unavailable");
  for (const card of cards) {
    let pi = await retrieveTerminalPaymentIntent(account.providerAccountId, card.paymentIntentId!);
    const matches = pi.currency === "usd" && pi.amount === cents(card.amount) &&
      pi.metadata?.store_id === String(a.storeId) && pi.metadata?.appointment_id === String(a.appointmentId);
    if (!matches) throw new NailCheckoutError("Card payment does not match this ticket. Check Stripe before retrying.");
    if (pi.status === "requires_capture") pi = await captureTerminalPaymentIntent(account.providerAccountId, pi.id);
    if (pi.status === "canceled") throw new NailCheckoutError("A card payment on this ticket was voided or has expired. Take it off and charge the card again.");
    if (pi.status !== "succeeded") throw new NailCheckoutError("A card payment on this ticket did not go through. Check Stripe before retrying.");
  }
}

/**
 * The tickets of one visit (ticket_group_id: a service another technician does, or one split off) are paid in
 * one checkout, so none is left unpaid at the end of the day. Refuses a checkout that leaves one of them open.
 */
async function requireWholeVisit(conn: { execute: typeof db.execute }, storeId: number, ids: number[]): Promise<void> {
  const left: any[] = (await conn.execute(sql`SELECT o.ticket_number FROM appointments o
    WHERE o.store_id = ${storeId} AND o.status IN ('confirmed', 'started')
      AND o.id NOT IN ${sql`(${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`}
      AND o.ticket_group_id IN (SELECT g.ticket_group_id FROM appointments g
        WHERE g.store_id = ${storeId} AND g.ticket_group_id IS NOT NULL
          AND g.id IN ${sql`(${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`})
    ORDER BY o.ticket_number`)).rows as any[];
  if (left.length) {
    const list = left.map((r) => `#${r.ticket_number}`).join(", ");
    throw new NailCheckoutError(`Ticket ${list} is part of this visit. Pay the visit's tickets together in Group Pay, or cancel ${left.length > 1 ? "those tickets" : "that ticket"} first.`);
  }
}

export function validateNailCheckoutInput(a: NailCheckoutInput): void {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(a.idempotencyKey)) throw new NailCheckoutError("Invalid checkout key", 400);
  if (!Number.isSafeInteger(a.appointmentId) || a.appointmentId <= 0 || !Array.isArray(a.tenders) || a.tenders.length > 30 ||
      ![a.tip, a.discount, a.totalPaid, a.serviceRevenue, a.productRevenue, a.tax ?? 0].every(validMoney)) throw new NailCheckoutError("Invalid checkout amounts", 400);
  if ((a.extras?.length ?? 0) > 30 || a.extras?.some((e) => !e.label?.trim() || e.label.length > 100 || !validMoney(e.price) || e.price > 9999.99))
    throw new NailCheckoutError("Invalid checkout line", 400);
  const shares = a.groupTickets?.length ? a.groupTickets : [{ appointmentId: a.appointmentId, tip: a.tip, discount: a.discount, totalPaid: a.totalPaid,
    serviceRevenue: a.serviceRevenue, productRevenue: a.productRevenue, paymentMethod: a.paymentMethod }];
  if (shares.length > 30 || !shares.some((s) => s.appointmentId === a.appointmentId) ||
      new Set(shares.map((s) => s.appointmentId)).size !== shares.length ||
      shares.some((s) => !Number.isSafeInteger(s.appointmentId) || s.appointmentId <= 0 ||
        ![s.tip, s.discount, s.totalPaid, s.serviceRevenue, s.productRevenue].every(validMoney)) ||
      cents(shares.reduce((n, s) => n + s.tip, 0)) !== cents(a.tip) ||
      cents(shares.reduce((n, s) => n + s.discount, 0)) !== cents(a.discount) ||
      cents(shares.reduce((n, s) => n + s.totalPaid, 0)) !== cents(a.totalPaid)) throw new NailCheckoutError("Group checkout shares do not match", 400);
  if (a.tenders.some((t) => !validMoney(t.amount) || t.amount <= 0 || !["cash", "gift", "m2", "tap", "card"].includes(t.method) ||
    ((t.method === "m2" || t.method === "tap") && !/^pi_[a-zA-Z0-9]+$/.test(t.paymentIntentId ?? "")) ||
    (t.method === "gift" && !t.code?.trim()))) throw new NailCheckoutError("Invalid tender", 400);
  if (new Set(a.tenders.filter((t) => t.paymentIntentId).map((t) => t.paymentIntentId)).size !== a.tenders.filter((t) => t.paymentIntentId).length)
    throw new NailCheckoutError("Duplicate card charge", 409);
  const tendered = cents(a.tenders.reduce((n, t) => n + t.amount, 0));
  const cash = cents(a.tenders.filter((t) => t.method === "cash").reduce((n, t) => n + t.amount, 0));
  if (tendered < cents(a.totalPaid) || tendered - cents(a.totalPaid) > cash ||
      (tendered === 0 && a.totalPaid !== 0)) throw new NailCheckoutError("Payment amounts do not settle the sale", 400);
}

export async function settleNailCheckout(a: NailCheckoutInput, salesTax: SalesTaxSettings = NO_SALES_TAX): Promise<{ replay: boolean; appointmentIds: number[]; newlyCompleted: any[] }> {
  validateNailCheckoutInput(a);
  // The time it was collected is not part of what makes two requests "the same sale": the same checkout may be
  // tried once online (no time) and again later from the tablet's offline queue (with one).
  const { collectedAt, ...sameSale } = a;
  const hash = createHash("sha256").update(JSON.stringify(sameSale)).digest("hex");
  const paidAt = collectedAt ?? null;
  // A lost response after commit must be answerable even if Stripe is briefly
  // offline (or the payment account has since been disconnected).
  const earlier: any = (await db.execute(sql`SELECT request_hash, result FROM nail_checkout_operations
    WHERE store_id = ${a.storeId} AND idempotency_key = ${a.idempotencyKey}`)).rows[0];
  if (earlier) {
    if (earlier.request_hash !== hash) throw new NailCheckoutError("Checkout key already used with different details");
    return { replay: true, appointmentIds: earlier.result.appointmentIds as number[], newlyCompleted: [] };
  }
  const shares = a.groupTickets?.length ? a.groupTickets : [{ appointmentId: a.appointmentId, tip: a.tip, discount: a.discount,
    totalPaid: a.totalPaid, serviceRevenue: a.serviceRevenue, productRevenue: a.productRevenue, paymentMethod: a.paymentMethod }];
  // Every open ticket of the visit is paid together (owner, 2026-10-21), checked before any card is charged.
  // A sale a tablet took while offline is recorded as it happened.
  if (!collectedAt) await requireWholeVisit(db, a.storeId, shares.map((s) => s.appointmentId));
  // Stripe verification before locks: no network request while holding DB rows.
  const cards = a.tenders.filter((t) => t.method === "m2" || t.method === "tap");
  if (cards.length) await chargeCardTenders(a, cards);
  return db.transaction(async (tx) => {
    // The key's unique index serializes identical attempts; all other locks have
    // a stable order to prevent a group checkout deadlocking another register.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${a.storeId}::int, hashtext(${a.idempotencyKey}))`);
    const existing: any = (await tx.execute(sql`SELECT request_hash, result FROM nail_checkout_operations
      WHERE store_id = ${a.storeId} AND idempotency_key = ${a.idempotencyKey}`)).rows[0];
    if (existing) {
      if (existing.request_hash !== hash) throw new NailCheckoutError("Checkout key already used with different details");
      return { replay: true, appointmentIds: existing.result.appointmentIds as number[], newlyCompleted: [] };
    }
    const ids = shares.map((s) => s.appointmentId).sort((x, y) => x - y);
    const rows: any[] = (await tx.execute(sql`SELECT id, status, customer_id, staff_id, service_id, duration,
      total_paid, gift_card_amount, service_price, commission_rate FROM appointments
      WHERE store_id = ${a.storeId} AND id IN ${sql`(${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`}
      ORDER BY id FOR UPDATE`)).rows as any[];
    if (rows.length !== ids.length) throw new NailCheckoutError("A group ticket is no longer in this salon");
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const primary = byId.get(a.appointmentId)!;
    if (!collectedAt) await requireWholeVisit(tx, a.storeId, ids);
    for (const row of rows) {
      if (!["confirmed", "started", "completed"].includes(row.status) ||
          (row.status === "completed" && (Number(row.id) !== a.appointmentId || cards.length === 0)))
        throw new NailCheckoutError("A ticket is already closed. Refresh the board before charging again.");
    }
    // Captures can pre-complete the primary ticket. Require that its existing
    // recorded amount does not exceed this whole checkout (group or split).
    if (primary.status === "completed" && Number(primary.total_paid ?? 0) > a.totalPaid + 0.001)
      throw new NailCheckoutError("Captured charge exceeds checkout amount");
    // Every ticket needs its technician before it's paid — otherwise nobody gets the commission or the TURN credit.
    if (rows.some((row) => row.status !== "completed" && row.staff_id == null))
      throw new NailCheckoutError("Assign a technician to every ticket before checking out.");
    // Tax is recomputed from the store's own POS settings, never taken on trust from the register.
    const expectedTax = salesTaxCents(
      shares.reduce((n, s) => n + s.serviceRevenue, 0), shares.reduce((n, s) => n + s.productRevenue, 0), a.discount, salesTax);
    if (cents(a.tax ?? 0) !== expectedTax)
      throw new NailCheckoutError("Sales tax doesn't match this salon's tax settings. Refresh the checkout before collecting payment.");
    if (cents(shares.reduce((sum, s) => sum + s.serviceRevenue + s.productRevenue - s.discount + s.tip, 0)) + expectedTax !== cents(a.totalPaid))
      throw new NailCheckoutError("Checkout totals do not balance");
    // Only the primary ticket can receive unsaved point-of-sale lines. Linked
    // tickets must match their stored service, add-ons, nail options and custom lines.
    for (const share of shares) {
      const priced: any = (await tx.execute(sql`SELECT
        COALESCE(s.price, 0) AS service_price,
        COALESCE((SELECT SUM(ad.price) FROM appointment_addons aa JOIN addons ad ON ad.id = aa.addon_id
          WHERE aa.appointment_id = a.id), 0) AS addon_price,
        COALESCE(ns.length_price_adj_snapshot, 0) + COALESCE(ns.shape_price_adj_snapshot, 0) +
          COALESCE(ns.art_price_adj_snapshot, 0) AS nail_price, a.custom_lines
        FROM appointments a LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN appointment_nail_selection ns ON ns.appointment_id = a.id
        WHERE a.id = ${share.appointmentId} AND a.store_id = ${a.storeId}`)).rows[0];
      const lines = Array.isArray(priced?.custom_lines) ? priced.custom_lines : [];
      const base = cents(Number(priced.service_price) + Number(priced.addon_price) + Number(priced.nail_price) +
        lines.reduce((sum: number, line: any) => sum + (Number(line.price) || 0), 0));
      const extra = share.appointmentId === a.appointmentId ? cents((a.extras ?? []).reduce((sum, line) => sum + line.price, 0)) : 0;
      if (cents(share.serviceRevenue + share.productRevenue) !== base + extra)
        throw new NailCheckoutError("Ticket changed while checking out. Refresh before collecting more payment.");
    }
    for (const card of cards) {
      const prior: any = (await tx.execute(sql`SELECT idempotency_key, store_id, appointment_id, amount_cents
        FROM nail_checkout_card_intents WHERE payment_intent_id = ${card.paymentIntentId!} FOR UPDATE`)).rows[0];
      if (prior && (prior.idempotency_key !== "pending" || Number(prior.store_id) !== a.storeId ||
          Number(prior.appointment_id) !== a.appointmentId || Number(prior.amount_cents) !== cents(card.amount)))
        throw new NailCheckoutError("Card charge is already used by another checkout");
      if (prior) await tx.execute(sql`UPDATE nail_checkout_card_intents SET idempotency_key = ${a.idempotencyKey}
        WHERE payment_intent_id = ${card.paymentIntentId!}`);
      else await tx.execute(sql`INSERT INTO nail_checkout_card_intents (payment_intent_id, store_id, appointment_id, amount_cents, idempotency_key)
        VALUES (${card.paymentIntentId!}, ${a.storeId}, ${a.appointmentId}, ${cents(card.amount)}, ${a.idempotencyKey})`);
    }
    let giftTotal = 0;
    const gifts = new Map<string, number>();
    for (const tender of a.tenders.filter((t) => t.method === "gift")) {
      const code = tender.code!.trim().toUpperCase().replace(/\s+/g, "");
      gifts.set(code, (gifts.get(code) ?? 0) + cents(tender.amount));
    }
    for (const [code, giftCents] of [...gifts].sort(([a], [b]) => a.localeCompare(b))) {
      const amount = (giftCents / 100).toFixed(2);
      const card: any = (await tx.execute(sql`SELECT id, remaining_balance, is_active, expires_at FROM gift_cards
        WHERE store_id = ${a.storeId} AND code = ${code} FOR UPDATE`)).rows[0];
      if (!card || !card.is_active || (card.expires_at && new Date(card.expires_at) <= new Date()) ||
          cents(Number(card.remaining_balance)) < giftCents) throw new NailCheckoutError("Gift card has insufficient available balance");
      const prior: any = (await tx.execute(sql`SELECT id FROM gift_card_transactions WHERE gift_card_id = ${card.id}
        AND appointment_id = ${a.appointmentId} AND type = 'redemption'`)).rows[0];
      if (prior) throw new NailCheckoutError("Gift card was already redeemed for this ticket");
      const after = (Number(card.remaining_balance) - giftCents / 100).toFixed(2);
      await tx.execute(sql`UPDATE gift_cards SET remaining_balance = ${after}::numeric, is_active = (${after}::numeric > 0) WHERE id = ${card.id}`);
      await tx.execute(sql`INSERT INTO gift_card_transactions (gift_card_id, store_id, appointment_id, amount, type, balance_after, notes)
        VALUES (${card.id}, ${a.storeId}, ${a.appointmentId}, ${amount}::numeric,
          'redemption', ${after}::numeric, 'POS checkout')`);
      await tx.execute(sql`UPDATE appointments SET gift_card_id = ${card.id}, gift_card_amount = COALESCE(gift_card_amount, 0) + ${amount}::numeric
        WHERE id = ${a.appointmentId} AND store_id = ${a.storeId}`);
      giftTotal += giftCents;
    }
    if (giftTotal > cents(a.totalPaid)) throw new NailCheckoutError("Gift card exceeds amount due");
    if (a.redemption) {
      if (Number(primary.customer_id) !== a.redemption.customerId) throw new NailCheckoutError("Reward belongs to a different client");
      const reward: any = (await tx.execute(sql`SELECT name, points_cost, dollar_value, is_active FROM loyalty_rewards
        WHERE id = ${a.redemption.rewardId} AND store_id = ${a.storeId}`)).rows[0];
      if (!reward || reward.is_active === false || cents(Number(reward.dollar_value)) > cents(a.discount))
        throw new NailCheckoutError("Reward is not valid for this discount");
      const priorReward: any = (await tx.execute(sql`SELECT id FROM loyalty_transactions
        WHERE store_id = ${a.storeId} AND customer_id = ${a.redemption.customerId}
          AND appointment_id = ${a.appointmentId} AND type = 'redeem' LIMIT 1`)).rows[0];
      if (priorReward) throw new NailCheckoutError("Reward has already been redeemed for this ticket");
      const result = await applyLoyaltyDeltaTx(tx, { storeId: a.storeId, customerId: a.redemption.customerId,
        appointmentId: a.appointmentId, points: -Number(reward.points_cost), type: "redeem",
        description: `Redeemed "${reward.name}" — $${Number(reward.dollar_value).toFixed(2)} off` });
      if (!result || result.applied !== -Number(reward.points_cost)) throw new NailCheckoutError("Not enough loyalty points");
    }
    const completed: any[] = [];
    for (const share of shares) {
      const row = byId.get(share.appointmentId)!;
      // Older Android binaries may have pre-completed the primary ticket at
      // capture time. Reconcile its final share and refresh idempotent loyalty/
      // commission side effects; capture itself does not rotate TURN.
      if (row.status === "completed") {
        const reconciled: any = (await tx.execute(sql`UPDATE appointments SET payment_method = ${share.paymentMethod},
          tip_amount = ${share.tip.toFixed(2)}::numeric, discount_amount = ${share.discount.toFixed(2)}::numeric,
          total_paid = ${share.totalPaid.toFixed(2)}::numeric, service_revenue = ${share.serviceRevenue.toFixed(2)}::numeric,
          product_revenue = ${share.productRevenue.toFixed(2)}::numeric
          WHERE id = ${share.appointmentId} AND store_id = ${a.storeId} RETURNING *`)).rows[0];
        completed.push(reconciled);
        continue;
      }
      const srv: any = row.service_id ? (await tx.execute(sql`SELECT price FROM services WHERE id = ${row.service_id} AND store_id = ${a.storeId}`)).rows[0] : null;
      const member: any = row.staff_id ? (await tx.execute(sql`SELECT commission_rate FROM staff WHERE id = ${row.staff_id} AND store_id = ${a.storeId}`)).rows[0] : null;
      const updated: any = (await tx.execute(sql`UPDATE appointments SET status = 'completed', completed_at = COALESCE(${paidAt ? paidAt.toISOString() : null}::timestamptz, now()),
        payment_method = ${share.paymentMethod}, tip_amount = ${share.tip.toFixed(2)}::numeric,
        discount_amount = ${share.discount.toFixed(2)}::numeric, total_paid = ${share.totalPaid.toFixed(2)}::numeric,
        service_revenue = ${share.serviceRevenue.toFixed(2)}::numeric, product_revenue = ${share.productRevenue.toFixed(2)}::numeric,
        service_price = COALESCE(service_price, ${srv?.price ?? null}::numeric),
        commission_rate = COALESCE(commission_rate, ${member?.commission_rate ?? null}::numeric)
        WHERE id = ${share.appointmentId} AND store_id = ${a.storeId} RETURNING *`)).rows[0];
      completed.push(updated);
    }
    await tx.execute(sql`INSERT INTO nail_checkout_operations (store_id, idempotency_key, request_hash, result)
      VALUES (${a.storeId}, ${a.idempotencyKey}, ${hash}, ${JSON.stringify({ appointmentIds: ids })}::jsonb)`);
    return { replay: false, appointmentIds: ids, newlyCompleted: completed };
  });
}

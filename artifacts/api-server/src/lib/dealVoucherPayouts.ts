/**
 * Redeemed-voucher payouts — the "step 4" of the deals feature. Certxa
 * collects the full purchase amount into its own platform Stripe account at
 * checkout (see routes/marketplaceDealsApi.ts + the deal_purchase webhook
 * branch); this module runs when a voucher is actually redeemed (triggered
 * from storage.updateAppointment() the moment its linked appointment's
 * status becomes "started") and settles up with the salon: Certxa keeps a
 * flat commission, the rest is transferred to the salon's Stripe Connect
 * account via a platform→connected-account Transfer.
 *
 * Never blocks or throws into the redemption path — a Stripe/payout hiccup
 * must never stop a client's service from being marked started. Every
 * attempt (success, failure, or skip) is recorded in deal_voucher_payouts
 * for a full audit trail and manual follow-up.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { dealVouchers, deals, dealVoucherPayouts } from "@shared/schema";
import { stripe, isStripeConfigured } from "./stripe";
import { getPaymentAccount } from "./stripeConnect";
import { logger } from "./logger";

/** Certxa's cut of every redeemed voucher. Change in one place if it ever varies. */
export const DEAL_COMMISSION_RATE = 0.10;

export async function payoutRedeemedVoucher(voucherId: number): Promise<void> {
  try {
    const [row] = await db
      .select({ voucher: dealVouchers, deal: deals })
      .from(dealVouchers)
      .innerJoin(deals, eq(dealVouchers.dealId, deals.id))
      .where(eq(dealVouchers.id, voucherId));
    if (!row) {
      logger.error({ voucherId }, "[deal-payout] voucher not found");
      return;
    }
    const { voucher, deal } = row;

    // Idempotency: never attempt a second transfer for the same voucher —
    // the unique index on voucher_id backs this up at the DB layer too.
    const [existing] = await db.select({ id: dealVoucherPayouts.id }).from(dealVoucherPayouts).where(eq(dealVoucherPayouts.voucherId, voucherId));
    if (existing) {
      logger.info({ voucherId }, "[deal-payout] already recorded, skipping");
      return;
    }

    const grossAmountCents = Math.round(Number(deal.dealPrice) * 100);
    const commissionAmountCents = Math.round(grossAmountCents * DEAL_COMMISSION_RATE);
    const amountCents = grossAmountCents - commissionAmountCents;

    const recordSkipped = async (reason: string) => {
      await db.insert(dealVoucherPayouts).values({
        voucherId, dealId: deal.id, storeId: deal.storeId,
        grossAmountCents, commissionRate: String(DEAL_COMMISSION_RATE), commissionAmountCents, amountCents,
        status: "skipped", failureReason: reason,
      }).onConflictDoNothing();
      logger.warn({ voucherId, reason }, "[deal-payout] skipped");
    };
    const recordFailed = async (reason: string) => {
      await db.insert(dealVoucherPayouts).values({
        voucherId, dealId: deal.id, storeId: deal.storeId,
        grossAmountCents, commissionRate: String(DEAL_COMMISSION_RATE), commissionAmountCents, amountCents,
        status: "failed", failureReason: reason,
      }).onConflictDoNothing();
      logger.error({ voucherId, reason }, "[deal-payout] failed");
    };

    if (!isStripeConfigured()) { await recordSkipped("Stripe not configured"); return; }
    if (!voucher.stripePaymentIntentId) { await recordSkipped("No payment intent on voucher — cannot trace the original charge"); return; }

    const account = await getPaymentAccount(deal.storeId);
    if (!account || !account.payoutsEnabled) {
      await recordSkipped(account ? "Salon's Stripe Connect account cannot yet receive payouts" : "Salon has no connected Stripe account");
      return;
    }

    let chargeId: string | null = null;
    try {
      const pi = await stripe.paymentIntents.retrieve(voucher.stripePaymentIntentId, { expand: ["latest_charge"] });
      const charge = pi.latest_charge;
      chargeId = typeof charge === "string" ? charge : charge?.id ?? null;
    } catch (err: any) {
      await recordFailed(`Could not retrieve original charge: ${err?.message}`);
      return;
    }
    if (!chargeId) { await recordFailed("Original payment has no associated charge yet"); return; }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: amountCents,
          currency: "usd",
          destination: account.providerAccountId,
          source_transaction: chargeId,
          transfer_group: `deal_voucher_${voucherId}`,
          metadata: { voucherId: String(voucherId), dealId: String(deal.id), storeId: String(deal.storeId) },
        },
        { idempotencyKey: `deal-voucher-payout-${voucherId}` },
      );
      await db.insert(dealVoucherPayouts).values({
        voucherId, dealId: deal.id, storeId: deal.storeId,
        stripeTransferId: transfer.id, stripeChargeId: chargeId,
        grossAmountCents, commissionRate: String(DEAL_COMMISSION_RATE), commissionAmountCents, amountCents,
        status: "succeeded",
      }).onConflictDoNothing();
      logger.info({ voucherId, transferId: transfer.id, amountCents }, "[deal-payout] transferred to salon");
    } catch (err: any) {
      await recordFailed(err?.message ?? "Transfer failed");
    }
  } catch (err: any) {
    // Belt-and-suspenders — this function must never throw into its caller
    // (the redemption path inside storage.updateAppointment()).
    logger.error({ voucherId, err: err?.message }, "[deal-payout] unexpected error");
  }
}

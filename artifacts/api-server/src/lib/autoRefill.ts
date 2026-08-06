/**
 * Auto-Refill — automatic platform credit top-up via saved Stripe payment method.
 *
 * When an AI call (or any deduction) drops `platform_credits` below the owner's
 * configured threshold, this module fires an off-session Stripe charge and credits
 * the balance immediately — no redirect required.
 *
 * Concurrency: an in-memory Set prevents double-charging the same store while a
 * charge is already in flight. Across restarts the risk window is tiny (a missed
 * refill just waits for the next deduction to re-trigger).
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { stripe, isStripeConfigured } from "./stripe";
import { logCreditTransaction } from "./creditLedger";
import { sendCreditsTopupReceiptEmail, sendAutoRefillFailedEmail } from "./systemEmails";

const refillInProgress = new Set<number>();

export async function maybeAutoRefill(storeId: number, newBalance: number): Promise<void> {
  if (!isStripeConfigured()) return;
  if (refillInProgress.has(storeId)) return;

  let refillAmount = 0;

  try {
    const [store] = await db
      .select({
        autoRefillEnabled:   locations.autoRefillEnabled,
        autoRefillThreshold: locations.autoRefillThreshold,
        autoRefillAmount:    locations.autoRefillAmount,
        stripeCustomerId:    locations.stripeCustomerId,
      })
      .from(locations)
      .where(eq(locations.id, storeId));

    if (!store?.autoRefillEnabled) return;

    const threshold = parseFloat(store.autoRefillThreshold ?? "5.00");
    if (newBalance >= threshold) return;

    const customerId = store.stripeCustomerId;
    if (!customerId) return;

    refillAmount = parseFloat(store.autoRefillAmount ?? "25.00");
    if (refillAmount <= 0) return;

    // Validate the stored customer ID against the platform Stripe account.
    // If it's stale (from a different account), warn and bail — the user must
    // re-run setup-pm to create a fresh customer + saved PM.
    let customer: any;
    try {
      customer = await stripe.customers.retrieve(customerId);
    } catch (err: any) {
      console.warn(
        `[AutoRefill] Stale stripeCustomerId ${customerId} for store ${storeId}: ${err?.message}. ` +
        `User must re-add payment method.`
      );
      sendAutoRefillFailedEmail(storeId, refillAmount.toFixed(2), "Payment method not found — please re-add your card").catch(() => {});
      return;
    }
    if (customer.deleted) return;

    const defaultPmId: string | undefined =
      customer.invoice_settings?.default_payment_method ??
      customer.default_source;

    if (!defaultPmId) {
      console.warn(`[AutoRefill] Store ${storeId} has auto-refill ON but no saved payment method.`);
      sendAutoRefillFailedEmail(storeId, refillAmount.toFixed(2), "No payment method saved — please add a card in billing settings").catch(() => {});
      return;
    }

    refillInProgress.add(storeId);

    try {
      const cents = Math.round(refillAmount * 100);

      const pi = await stripe.paymentIntents.create({
        amount:         cents,
        currency:       "usd",
        customer:       customerId,
        payment_method: defaultPmId,
        off_session:    true,
        confirm:        true,
        description:    `AI Credits auto-refill +$${refillAmount.toFixed(2)} (store #${storeId})`,
        metadata: {
          type:          "platform_credits_auto_refill",
          storeId:       String(storeId),
          amountDollars: refillAmount.toFixed(2),
        },
      });

      if (pi.status === "succeeded") {
        const updated = await db
          .update(locations)
          .set({ platformCredits: sql`COALESCE(platform_credits, 0) + ${refillAmount.toFixed(2)}` })
          .where(eq(locations.id, storeId))
          .returning({ balance: locations.platformCredits });

        const balanceAfter = parseFloat(updated[0]?.balance ?? "0");

        await logCreditTransaction({
          storeId,
          type:         "topup",
          amount:       refillAmount,
          description:  `Auto-refill +$${refillAmount.toFixed(2)} via saved card`,
          balanceAfter,
          referenceId:  pi.id,
        });

        // Send receipt email (fire-and-forget — never crash the caller)
        sendCreditsTopupReceiptEmail(storeId, "platform", `$${refillAmount.toFixed(2)}`).catch(() => {});

        console.log(
          `[AutoRefill] ✓ Store ${storeId}: +$${refillAmount.toFixed(2)} charged` +
          ` (${pi.id}) balance_after=$${balanceAfter.toFixed(2)}`
        );
      } else {
        console.warn(`[AutoRefill] PaymentIntent status=${pi.status} for store=${storeId}`);
        sendAutoRefillFailedEmail(storeId, refillAmount.toFixed(2), `Payment status: ${pi.status}`).catch(() => {});
      }
    } finally {
      refillInProgress.delete(storeId);
    }
  } catch (err: any) {
    refillInProgress.delete(storeId);
    const code = err?.code ?? err?.type ?? "unknown";
    const humanReason =
      code === "card_declined"          ? "Card declined" :
      code === "insufficient_funds"     ? "Insufficient funds" :
      code === "authentication_required"? "Card requires authentication — please re-add in billing" :
      code === "expired_card"           ? "Card expired" :
                                          `Payment failed (${code})`;
    console.error(`[AutoRefill] Failed for store=${storeId} (${code}): ${err.message}`);
    sendAutoRefillFailedEmail(storeId, refillAmount.toFixed(2), humanReason).catch(() => {});
  }
}

/**
 * Late-cancellation fee — off-session charge of a % of the service price to a
 * client's card on file when they cancel inside the store's cancellation
 * window. The card + customer live on the store's CONNECTED Stripe account
 * (saved during a card_on_file / deposit online booking), so the charge is
 * made with { stripeAccount: connectedAccountId }.
 *
 * Mirrors the off-session pattern in lib/autoRefill.ts, but on the connected
 * account rather than the platform account.
 */

import { pool } from "../db";
import { getStripe, isStripeConfigured } from "./stripe";

export type CancellationFeeParams = {
  storeId: number;
  appointmentId: number;
  /** Stripe Customer id ON THE CONNECTED ACCOUNT (clients.stripe_customer_id / appointments.stripe_customer_id) */
  stripeCustomerId: string;
  /** PaymentMethod id ON THE CONNECTED ACCOUNT (clients.stripe_payment_method_id / appointments.stripe_payment_method_id) */
  stripePaymentMethodId: string;
  /** fee amount in cents */
  feeCents: number;
};

async function getConnectedAccountId(storeId: number): Promise<string | null> {
  const row = await pool.query<{ provider_account_id: string }>(
    `SELECT provider_account_id FROM store_payment_accounts
     WHERE store_id = $1 AND provider = 'stripe' AND status = 'connected'
     LIMIT 1`,
    [storeId],
  );
  return row.rows[0]?.provider_account_id ?? null;
}

/**
 * Charges the fee. Returns the succeeded PaymentIntent id.
 * Throws if Stripe isn't configured, the store has no connected account, or
 * the charge doesn't succeed — the caller decides what to do with a failure
 * (we still let the cancellation through so the customer is never trapped).
 */
export async function chargeCancellationFee(params: CancellationFeeParams): Promise<string> {
  const { storeId, appointmentId, stripeCustomerId, stripePaymentMethodId, feeCents } = params;

  if (feeCents < 50) throw new Error(`cancellation fee ${feeCents}c is below Stripe's $0.50 minimum`);
  if (!isStripeConfigured()) throw new Error("Stripe is not configured");

  const connectedAccountId = await getConnectedAccountId(storeId);
  if (!connectedAccountId) throw new Error(`store ${storeId} has no connected Stripe account`);

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.create(
    {
      amount: feeCents,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `Late-cancellation fee — appointment #${appointmentId}`,
      metadata: {
        type: "cancellation_fee",
        certxa_store_id: String(storeId),
        appointmentId: String(appointmentId),
      },
    },
    { stripeAccount: connectedAccountId },
  );

  if (pi.status !== "succeeded") {
    throw new Error(`cancellation fee PaymentIntent ${pi.id} status=${pi.status}`);
  }
  return pi.id;
}

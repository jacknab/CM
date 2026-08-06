/**
 * lib/stripeConnect.ts — Stripe Connect service (salon customer payments)
 *
 * COMPLETELY ISOLATED from the Certxa SaaS billing system.
 *
 * This service handles:
 *   - OAuth Connect onboarding (Standard accounts)
 *   - Stripe Terminal connection tokens for M2 card readers
 *   - Payment Intent creation on connected accounts
 *   - Connected account status sync
 *
 * Uses the same STRIPE_SECRET_KEY as the platform but always operates
 * in the context of the connected salon account (stripeAccount param).
 */

import Stripe from "stripe";
import { pool } from "../db";

// ─── Platform fee collected on every salon transaction ───────────────────────
// $0.60 per transaction flows from the connected salon account to Certxa's
// platform Stripe balance via Stripe Connect application_fee_amount.
export const PLATFORM_CONNECTION_FEE_CENTS = 60;

// ─── Platform Stripe client (used to manage connected accounts) ──────────────

let _platformStripe: Stripe | null = null;

function getPlatformStripe(): Stripe {
  if (_platformStripe) return _platformStripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _platformStripe = new Stripe(key, {
    apiVersion: "2026-05-27.dahlia" as any,
    typescript: true,
  });
  return _platformStripe;
}

export function isConnectConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// ─── Database helpers ─────────────────────────────────────────────────────────

export interface PaymentAccount {
  id: number;
  storeId: number;
  provider: string;
  providerAccountId: string;
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  displayName: string | null;
  email: string | null;
  country: string | null;
  currency: string | null;
  contractorExpressEnabled: boolean;
  contractorPayoutMode: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function getPaymentAccount(storeId: number): Promise<PaymentAccount | null> {
  const { rows } = await pool.query(
    `SELECT id, store_id, provider, provider_account_id, status,
            charges_enabled, payouts_enabled, details_submitted,
            display_name, email, country, currency,
            contractor_express_enabled, contractor_payout_mode,
            created_at, updated_at
     FROM store_payment_accounts
     WHERE store_id = $1 AND provider = 'stripe'
     LIMIT 1`,
    [storeId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    storeId: r.store_id,
    provider: r.provider,
    providerAccountId: r.provider_account_id,
    status: r.status,
    chargesEnabled: r.charges_enabled,
    payoutsEnabled: r.payouts_enabled,
    detailsSubmitted: r.details_submitted,
    displayName: r.display_name,
    email: r.email,
    country: r.country,
    currency: r.currency,
    contractorExpressEnabled: r.contractor_express_enabled ?? false,
    contractorPayoutMode:     r.contractor_payout_mode     ?? "manual",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function upsertPaymentAccount(
  storeId: number,
  accountId: string,
  data: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    displayName?: string | null;
    email?: string | null;
    country?: string | null;
    currency?: string | null;
    rawData?: object;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO store_payment_accounts
       (store_id, provider, provider_account_id, status,
        charges_enabled, payouts_enabled, details_submitted,
        display_name, email, country, currency, raw_data,
        created_at, updated_at)
     VALUES ($1, 'stripe', $2, 'connected',
             $3, $4, $5, $6, $7, $8, $9, $10,
             NOW(), NOW())
     ON CONFLICT (store_id) DO UPDATE SET
       provider_account_id = EXCLUDED.provider_account_id,
       status              = 'connected',
       charges_enabled     = EXCLUDED.charges_enabled,
       payouts_enabled     = EXCLUDED.payouts_enabled,
       details_submitted   = EXCLUDED.details_submitted,
       display_name        = EXCLUDED.display_name,
       email               = EXCLUDED.email,
       country             = EXCLUDED.country,
       currency            = EXCLUDED.currency,
       raw_data            = EXCLUDED.raw_data,
       updated_at          = NOW()`,
    [
      storeId,
      accountId,
      data.chargesEnabled,
      data.payoutsEnabled,
      data.detailsSubmitted,
      data.displayName ?? null,
      data.email ?? null,
      data.country ?? null,
      data.currency ?? null,
      JSON.stringify(data.rawData ?? {}),
    ]
  );
}

export async function removePaymentAccount(storeId: number): Promise<void> {
  await pool.query(
    `UPDATE store_payment_accounts
     SET status = 'disconnected', updated_at = NOW()
     WHERE store_id = $1 AND provider = 'stripe'`,
    [storeId]
  );
}

// ─── OAuth Connect (Standard accounts) ───────────────────────────────────────

/**
 * Build the Stripe Connect OAuth URL to send the salon owner to.
 * Requires STRIPE_CONNECT_CLIENT_ID (the platform's Connect app client_id).
 */
export function buildConnectOAuthUrl(storeId: number, returnUrl: string): string {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) throw new Error("STRIPE_CONNECT_CLIENT_ID is not configured");

  const state = Buffer.from(JSON.stringify({ storeId, ts: Date.now() })).toString("base64url");
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     clientId,
    scope:         "read_write",
    state,
    redirect_uri:  returnUrl,
    "stripe_user[business_type]": "individual",
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange an OAuth authorization code for a connected account ID.
 */
export async function exchangeOAuthCode(code: string): Promise<{
  stripeAccountId: string;
  scope: string;
}> {
  const stripe = getPlatformStripe();
  const response = await (stripe.oauth as any).token({
    grant_type: "authorization_code",
    code,
  });
  return {
    stripeAccountId: response.stripe_user_id,
    scope: response.scope,
  };
}

/**
 * Fetch the latest account details from Stripe and sync to our DB.
 */
export async function syncAccountFromStripe(
  storeId: number,
  accountId: string
): Promise<Stripe.Account> {
  const stripe = getPlatformStripe();
  const account = await stripe.accounts.retrieve(accountId);

  await upsertPaymentAccount(storeId, accountId, {
    chargesEnabled:   account.charges_enabled ?? false,
    payoutsEnabled:   account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    displayName:      account.business_profile?.name ?? null,
    email:            account.email ?? null,
    country:          account.country ?? null,
    currency:         account.default_currency ?? null,
    rawData: {
      type:              account.type,
      business_type:     account.business_type,
      requirements:      (account as any).requirements,
    },
  });

  return account;
}

/**
 * Revoke platform access to a connected account.
 * Does NOT delete historical transactions.
 */
export async function deauthorizeAccount(accountId: string): Promise<void> {
  try {
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    if (clientId) {
      const stripe = getPlatformStripe();
      await (stripe.oauth as any).deauthorize({
        client_id:       clientId,
        stripe_user_id:  accountId,
      });
    }
  } catch (err: any) {
    // If already deauthorized, Stripe returns an error — log and continue
    console.warn("[stripeConnect] deauthorize warning:", err?.message);
  }
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export interface ConnectedAccountBalance {
  available: { amount: number; currency: string }[];
  pending:   { amount: number; currency: string }[];
  fetchedAt: string;
}

/**
 * Fetch the live balance of a connected Stripe account.
 * Returns available and pending totals in the account's default currency.
 */
export async function getConnectedAccountBalance(
  connectedAccountId: string
): Promise<ConnectedAccountBalance> {
  const stripe = getPlatformStripe();
  const balance = await stripe.balance.retrieve(
    {},
    { stripeAccount: connectedAccountId }
  );

  return {
    available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
    pending:   balance.pending.map((b)   => ({ amount: b.amount, currency: b.currency })),
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Stripe Terminal (M2 card reader) ────────────────────────────────────────

/**
 * Create a connection token for the Stripe Terminal SDK.
 * Must be called in the context of the connected salon account.
 */
export async function createTerminalConnectionToken(connectedAccountId: string): Promise<string> {
  const stripe = getPlatformStripe();
  const token = await (stripe as any).terminal.connectionTokens.create(
    {},
    { stripeAccount: connectedAccountId }
  );
  return token.secret;
}

/**
 * Create a PaymentIntent on the connected account for Terminal collection.
 * Funds flow to the salon's connected account; Certxa collects
 * PLATFORM_CONNECTION_FEE_CENTS ($0.60) as an application_fee_amount on
 * every transaction, which lands in the Certxa platform Stripe balance.
 */
export async function createTerminalPaymentIntent(
  connectedAccountId: string,
  amountCents: number,
  currency: string = "usd",
  metadata: Record<string, string> = {}
): Promise<Stripe.PaymentIntent> {
  const stripe = getPlatformStripe();

  // Only collect the platform fee when the transaction amount exceeds it.
  const applicationFee = amountCents > PLATFORM_CONNECTION_FEE_CENTS
    ? PLATFORM_CONNECTION_FEE_CENTS
    : 0;

  const pi = await stripe.paymentIntents.create(
    {
      amount:                  amountCents,
      currency,
      payment_method_types:    ["card_present"],
      capture_method:          "manual",
      application_fee_amount:  applicationFee,
      metadata,
    },
    { stripeAccount: connectedAccountId }
  );
  return pi;
}

/**
 * Capture a previously-authorized Terminal PaymentIntent.
 */
export async function captureTerminalPaymentIntent(
  connectedAccountId: string,
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getPlatformStripe();
  const pi = await stripe.paymentIntents.capture(
    paymentIntentId,
    {},
    { stripeAccount: connectedAccountId }
  );
  return pi;
}

/**
 * Cancel a Terminal PaymentIntent (e.g. if the reader is removed).
 */
export async function cancelTerminalPaymentIntent(
  connectedAccountId: string,
  paymentIntentId: string
): Promise<void> {
  const stripe = getPlatformStripe();
  await stripe.paymentIntents.cancel(
    paymentIntentId,
    {},
    { stripeAccount: connectedAccountId }
  );
}

-- Migration: Stripe Connect — salon payment accounts
-- Adds the store_payment_accounts table for connecting salon Stripe accounts.
-- This is completely separate from the existing Certxa SaaS billing system.
-- Uses a generic provider structure to support future providers (Square, PayPal).

CREATE TABLE IF NOT EXISTS store_payment_accounts (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL UNIQUE,
  provider            VARCHAR(32) NOT NULL DEFAULT 'stripe',
  provider_account_id TEXT NOT NULL,
  status              VARCHAR(32) NOT NULL DEFAULT 'connected',
  charges_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted   BOOLEAN NOT NULL DEFAULT FALSE,
  display_name        TEXT,
  email               TEXT,
  country             TEXT,
  currency            TEXT,
  raw_data            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_payment_accounts_store_id ON store_payment_accounts (store_id);
CREATE INDEX IF NOT EXISTS idx_store_payment_accounts_provider ON store_payment_accounts (provider, provider_account_id);

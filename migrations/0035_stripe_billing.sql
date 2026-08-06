-- ─── Migration 0035: Stripe Billing & Wallet Funding System ─────────────────

-- Add stripe_customer_id to locations table (one Stripe Customer per store)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_locations_stripe_customer_id ON locations(stripe_customer_id);

-- ─── Wallet Transactions ──────────────────────────────────────────────────────
-- Immutable ledger for account funding. Balance is always derived from ledger.
-- transaction_type: 'deposit' | 'usage' | 'refund' | 'adjustment'
-- status:           'pending' | 'completed' | 'failed'
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  stripe_payment_intent TEXT,
  amount                INTEGER NOT NULL,
  transaction_type      TEXT NOT NULL DEFAULT 'deposit',
  status                TEXT NOT NULL DEFAULT 'pending',
  description           TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_store_id     ON wallet_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status       ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_stripe_pi    ON wallet_transactions(stripe_payment_intent);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_store_status ON wallet_transactions(store_id, status);

-- ─── Webhook Events (idempotency guard) ───────────────────────────────────────
-- Prevents the same Stripe event from being processed twice.
CREATE TABLE IF NOT EXISTS webhook_events (
  id           SERIAL PRIMARY KEY,
  event_id     TEXT NOT NULL UNIQUE,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);

-- ─── Store Invoices (mirror of Stripe invoices) ───────────────────────────────
CREATE TABLE IF NOT EXISTS store_invoices (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  stripe_invoice_id   TEXT NOT NULL UNIQUE,
  invoice_number      TEXT,
  status              TEXT,
  paid                BOOLEAN NOT NULL DEFAULT FALSE,
  total_cents         INTEGER NOT NULL DEFAULT 0,
  amount_paid_cents   INTEGER NOT NULL DEFAULT 0,
  hosted_invoice_url  TEXT,
  invoice_pdf_url     TEXT,
  billing_reason      TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_invoices_store_id         ON store_invoices(store_id);
CREATE INDEX IF NOT EXISTS idx_store_invoices_stripe_invoice_id ON store_invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_store_invoices_paid             ON store_invoices(paid);

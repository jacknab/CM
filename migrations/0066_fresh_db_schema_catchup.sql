-- Migration 0066: Catch-up schema fixes for fresh database installs.
-- These columns were added in migrations 0059-0063 which were baselined
-- on the first run (schema.sql applied) but the support_tickets table
-- was pre-created by the runtime init code with fewer columns.
-- All statements are idempotent (IF NOT EXISTS).

-- support_tickets: email/channel columns
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS channel          VARCHAR(16) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS customer_email   VARCHAR(255);
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS customer_name    VARCHAR(128);
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS imap_message_id  TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS imap_thread_id   TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS account_name     TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS subcategory      TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at      TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at        TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS tags             JSONB;

-- support_ticket_messages: direction for AutoClose query
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS direction   VARCHAR(16) NOT NULL DEFAULT 'outbound';
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- platform_credit_transactions: needed by billing and support routes
CREATE TABLE IF NOT EXISTS platform_credit_transactions (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  type        VARCHAR(32) NOT NULL DEFAULT 'credit',
  amount      DECIMAL(10,2) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_ticket_number
  ON support_tickets (ticket_number) WHERE ticket_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_imap_message_id
  ON support_tickets (imap_message_id) WHERE imap_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_channel
  ON support_tickets (channel);

CREATE INDEX IF NOT EXISTS idx_platform_credit_transactions_store_id
  ON platform_credit_transactions (store_id);

-- Catch-up migration: support_tickets schema drift on VPS environments.
--
-- Some deployments have a legacy support_tickets table created by older runtime
-- code (or partial migration history) that is missing core back-office/email
-- columns like `subject`. Email sync inserts then fail with:
--   column "subject" does not exist

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS account_id          INTEGER,
  ADD COLUMN IF NOT EXISTS ticket_number       VARCHAR(32),
  ADD COLUMN IF NOT EXISTS subject             TEXT,
  ADD COLUMN IF NOT EXISTS description         TEXT,
  ADD COLUMN IF NOT EXISTS priority            VARCHAR(16) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS status              VARCHAR(16) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS channel             VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS customer_email      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_name       VARCHAR(128),
  ADD COLUMN IF NOT EXISTS imap_message_id     TEXT,
  ADD COLUMN IF NOT EXISTS imap_thread_id      TEXT,
  ADD COLUMN IF NOT EXISTS first_response_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_response_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_agent_id   INTEGER,
  ADD COLUMN IF NOT EXISTS created_by_agent_id INTEGER,
  ADD COLUMN IF NOT EXISTS assigned_agent_name VARCHAR(128),
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_ticket_number
  ON support_tickets (ticket_number)
  WHERE ticket_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_imap_message_id
  ON support_tickets (imap_message_id)
  WHERE imap_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_channel
  ON support_tickets (channel);

CREATE INDEX IF NOT EXISTS idx_support_tickets_imap_thread_id
  ON support_tickets (imap_thread_id)
  WHERE imap_thread_id IS NOT NULL;


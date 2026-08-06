-- support_tickets: make account_id nullable so emails from non-registered
-- senders (general public) can become support tickets without a matching account.
ALTER TABLE support_tickets ALTER COLUMN account_id DROP NOT NULL;

-- Also ensure all columns added by emailTicketSync are present (idempotent guards).
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS channel          text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS customer_email   text,
  ADD COLUMN IF NOT EXISTS customer_name    text,
  ADD COLUMN IF NOT EXISTS ip_address       text,
  ADD COLUMN IF NOT EXISTS account_name     text,
  ADD COLUMN IF NOT EXISTS category         text,
  ADD COLUMN IF NOT EXISTS subcategory      text,
  ADD COLUMN IF NOT EXISTS last_response_at  timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS imap_message_id  text,
  ADD COLUMN IF NOT EXISTS imap_thread_id   text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_imap_message_id
  ON support_tickets (imap_message_id)
  WHERE imap_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_channel
  ON support_tickets (channel);

CREATE INDEX IF NOT EXISTS idx_support_tickets_imap_thread_id
  ON support_tickets (imap_thread_id)
  WHERE imap_thread_id IS NOT NULL;

ALTER TABLE support_ticket_messages
  ADD COLUMN IF NOT EXISTS direction   text NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS raw_headers jsonb;

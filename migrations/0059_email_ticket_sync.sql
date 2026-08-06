-- Email → Ticket sync: schema additions
-- Adds channel tracking, customer email, IMAP dedup keys, and direction to messages

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS channel         text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS customer_email  text,
  ADD COLUMN IF NOT EXISTS imap_message_id text,
  ADD COLUMN IF NOT EXISTS imap_thread_id  text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_imap_message_id
  ON support_tickets (imap_message_id)
  WHERE imap_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_channel
  ON support_tickets (channel);

CREATE INDEX IF NOT EXISTS idx_support_tickets_imap_thread_id
  ON support_tickets (imap_thread_id)
  WHERE imap_thread_id IS NOT NULL;

ALTER TABLE support_ticket_messages
  ADD COLUMN IF NOT EXISTS direction    text NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS raw_headers  jsonb;

CREATE TABLE IF NOT EXISTS processed_emails (
  id              serial PRIMARY KEY,
  message_id      text NOT NULL UNIQUE,
  ticket_id       integer REFERENCES support_tickets(id),
  processed_at    timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_emails_message_id
  ON processed_emails (message_id);

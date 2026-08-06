-- Migration 0049: Fix support_tickets missing core columns on VPS + create
-- contractor_onboarding_tokens table (never had a migration file).
--
-- On VPS the AI voice agent's startup CREATE TABLE ran first for support_tickets,
-- leaving account_id/ticket_number/subject/priority/status/updated_at all missing.
-- Every prior migration used CREATE TABLE IF NOT EXISTS which was silently skipped.

-- ── support_tickets: add every core column that may be absent ────────────────
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS account_id           INTEGER;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_number        VARCHAR(32);
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS subject              TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS description          TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority             VARCHAR(16) NOT NULL DEFAULT 'normal';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS status               VARCHAR(16) NOT NULL DEFAULT 'open';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_agent_id    INTEGER;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS created_by_agent_id  INTEGER;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_agent_name  VARCHAR(128);
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();

-- Unique index on ticket_number (skip if column has nulls from existing rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_ticket_number
  ON support_tickets (ticket_number)
  WHERE ticket_number IS NOT NULL;

-- ── support_ticket_messages: ensure table + columns exist ────────────────────
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type VARCHAR(16)  NOT NULL DEFAULT 'user',
  author_name VARCHAR(128),
  agent_id    INTEGER,
  content     TEXT NOT NULL,
  is_internal BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id
  ON support_ticket_messages(ticket_id);

-- ── contractor_onboarding_tokens: first-ever migration for this table ────────
CREATE TABLE IF NOT EXISTS contractor_onboarding_tokens (
  id            SERIAL PRIMARY KEY,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  store_id      INTEGER NOT NULL REFERENCES locations(id)   ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cot_token
  ON contractor_onboarding_tokens(token);
CREATE INDEX IF NOT EXISTS idx_cot_contractor_id
  ON contractor_onboarding_tokens(contractor_id);

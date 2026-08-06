-- Fix support_account_tags: ensure table exists, then rename column and add unique constraint

-- Create core support tables if they were never created
CREATE TABLE IF NOT EXISTS support_agents (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL DEFAULT '',
  last_name     TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'agent',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS support_notes (
  id         SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL,
  agent_id   INTEGER NOT NULL REFERENCES support_agents(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_name TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS support_agent_activity (
  id         SERIAL PRIMARY KEY,
  agent_id   INTEGER NOT NULL REFERENCES support_agents(id),
  action     TEXT NOT NULL,
  account_id INTEGER,
  metadata   JSONB,
  details    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id                  SERIAL PRIMARY KEY,
  account_id          INTEGER NOT NULL,
  ticket_number       TEXT NOT NULL UNIQUE,
  subject             TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  priority            TEXT NOT NULL DEFAULT 'normal',
  assigned_agent_id   INTEGER REFERENCES support_agents(id),
  created_by_agent_id INTEGER REFERENCES support_agents(id),
  account_name        TEXT,
  assigned_agent_name TEXT,
  category            TEXT,
  subcategory         TEXT,
  last_response_at    TIMESTAMPTZ,
  first_response_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create table if it was never created (safety net when 0031 was baseline'd but not applied)
CREATE TABLE IF NOT EXISTS support_account_tags (
  id                   SERIAL PRIMARY KEY,
  account_id           INTEGER NOT NULL,
  tag                  TEXT NOT NULL,
  color                TEXT NOT NULL DEFAULT 'slate',
  created_by_agent_id  INTEGER REFERENCES support_agents(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_account_tags' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE support_account_tags RENAME COLUMN created_by TO created_by_agent_id;
  END IF;
END $$;

ALTER TABLE support_account_tags ADD COLUMN IF NOT EXISTS created_by_agent_id INTEGER REFERENCES support_agents(id);
ALTER TABLE support_account_tags DROP CONSTRAINT IF EXISTS support_account_tags_account_tag_unique;
ALTER TABLE support_account_tags ADD CONSTRAINT support_account_tags_account_tag_unique UNIQUE (account_id, tag);

-- Fix support_notes: add agent_name column
ALTER TABLE support_notes ADD COLUMN IF NOT EXISTS agent_name TEXT NOT NULL DEFAULT '';

-- Fix support_agent_activity: add details column
ALTER TABLE support_agent_activity ADD COLUMN IF NOT EXISTS details TEXT;

-- Fix support_tickets: add missing columns
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_agent_name TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_response_at TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

-- Create support_ticket_messages table
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id            SERIAL PRIMARY KEY,
  ticket_id     INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type   TEXT NOT NULL DEFAULT 'agent',
  author_name   TEXT NOT NULL DEFAULT '',
  agent_id      INTEGER REFERENCES support_agents(id),
  content       TEXT NOT NULL,
  is_internal   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON support_ticket_messages(ticket_id);

-- Support back-office tables
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_account_tags (
  id         SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL,
  tag        TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'slate',
  created_by INTEGER REFERENCES support_agents(id),
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
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_agent_activity (
  id         SERIAL PRIMARY KEY,
  agent_id   INTEGER NOT NULL REFERENCES support_agents(id),
  action     TEXT NOT NULL,
  account_id INTEGER,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default admin agent (password: support2024!)
INSERT INTO support_agents (email, password_hash, name, first_name, last_name, role)
VALUES (
  'admin@certxa.com',
  '$2b$10$rOzJqxvpF3K5F2e8Zb3XPOuHfBz3Nh7XQmYk5L9dVWqT8cMgN4Zm2',
  'Admin Agent',
  'Admin',
  'Agent',
  'admin'
)
ON CONFLICT (email) DO NOTHING;

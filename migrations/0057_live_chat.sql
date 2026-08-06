-- Live chat departments
CREATE TABLE IF NOT EXISTS live_chat_departments (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Live chat sessions
CREATE TABLE IF NOT EXISTS live_chats (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name  TEXT,
  visitor_email TEXT,
  visitor_token TEXT,                  -- ephemeral cookie token for reconnection
  department_id INTEGER REFERENCES live_chat_departments(id),
  agent_id      INTEGER REFERENCES support_agents(id),
  status        TEXT    NOT NULL DEFAULT 'queued', -- queued|active|transferred|closed|missed
  subject       TEXT,
  page_url      TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  rating        INTEGER,               -- 1‒5 after close
  rating_comment TEXT
);

-- Live chat messages
CREATE TABLE IF NOT EXISTS live_chat_messages (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID  NOT NULL REFERENCES live_chats(id) ON DELETE CASCADE,
  sender_type TEXT  NOT NULL,          -- visitor | agent | system
  sender_id   INTEGER,                 -- support_agents.id when agent
  sender_name TEXT,
  content     TEXT  NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Canned responses
CREATE TABLE IF NOT EXISTS live_chat_canned (
  id         SERIAL PRIMARY KEY,
  shortcut   TEXT NOT NULL UNIQUE,     -- e.g. "greet"
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_live_chats_status     ON live_chats (status);
CREATE INDEX IF NOT EXISTS idx_live_chats_agent_id   ON live_chats (agent_id);
CREATE INDEX IF NOT EXISTS idx_live_chat_msgs_chat   ON live_chat_messages (chat_id, created_at);

-- Default departments
INSERT INTO live_chat_departments (name, description) VALUES
  ('General Support',   'General questions and help'),
  ('Billing',           'Billing, invoices, and payment questions'),
  ('Technical Support', 'Technical issues and bug reports'),
  ('Sales',             'New customer inquiries and demos')
ON CONFLICT DO NOTHING;

-- Default canned responses
INSERT INTO live_chat_canned (shortcut, title, content) VALUES
  ('greet',    'Greeting',              'Hi there! Thanks for reaching out to Certxa Support. How can I help you today?'),
  ('wait',     'Please wait',           'Give me just a moment while I look into that for you.'),
  ('transfer', 'Transfer notice',       'I''m going to transfer you to our specialist team who can best assist with this. Please hold on.'),
  ('close',    'Closing message',       'Is there anything else I can help you with? If not, I hope we resolved your issue today!'),
  ('billing',  'Billing redirect',      'For billing questions, you can also reach our billing team directly at billing@certxa.com.'),
  ('ticket',   'Create ticket',         'I''ve made note of your issue. Our team will follow up within 1 business day. Would you like a ticket number for reference?')
ON CONFLICT (shortcut) DO NOTHING;

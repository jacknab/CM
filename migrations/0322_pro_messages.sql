-- Website messages (owner, 2026-11-07, plans/pro-messages.md): a client writes to a Certxa Pro business from its
-- website, the pro answers in the app, the client reads and answers on a private page linked from the e-mail.
-- One conversation per first message.
CREATE TABLE IF NOT EXISTS pro_message_threads (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  subject TEXT NOT NULL,
  pro_unread INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_message_threads_store_idx ON pro_message_threads (store_id, last_message_at DESC);

-- sender: client or pro. ip_hash: a salted hash of the address of the sender, for the spam limits only.
CREATE TABLE IF NOT EXISTS pro_messages (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES pro_message_threads(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('client', 'pro')),
  body TEXT NOT NULL,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_messages_thread_idx ON pro_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS pro_messages_ip_idx ON pro_messages (ip_hash, created_at) WHERE ip_hash IS NOT NULL;

-- Private links of the client: every e-mail carries its own code and they all keep working. Only the SHA-256 of a code
-- is kept, never the code.
CREATE TABLE IF NOT EXISTS pro_message_links (
  token_hash TEXT PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES pro_message_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

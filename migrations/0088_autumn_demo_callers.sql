-- Create autumn_demo_callers table so drizzle-kit push does not
-- prompt about a potential rename from an unrelated table.
CREATE TABLE IF NOT EXISTS autumn_demo_callers (
  id         SERIAL PRIMARY KEY,
  phone      TEXT NOT NULL,
  ip         TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

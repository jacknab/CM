-- Personal time and days off (Certxa Pro app, owner 2026-11-03): time a professional blocks on their own calendar.
-- Online booking offers no time inside a block. staff_id NULL = the whole business.
CREATE TABLE IF NOT EXISTS time_blocks (
  id         SERIAL PRIMARY KEY,
  store_id   INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id   INTEGER,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  all_day    BOOLEAN NOT NULL DEFAULT FALSE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS time_blocks_store_time_idx ON time_blocks (store_id, starts_at, ends_at);

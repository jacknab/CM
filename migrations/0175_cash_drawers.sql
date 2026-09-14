-- Migration 0175: Cash Drawers
--
-- Optional per-store list of named physical cash drawers, distinct from
-- `registers` (checkout station pairing): a salon can run 2 checkout
-- registers sharing 1 drawer, or 1 register with 2 drawers, or any other
-- combination. A store with zero rows here has every cash-drawer session
-- implicitly share drawer_id NULL (today's single-shared-drawer behavior).
--
-- target_float is an optional per-drawer override of locations.register_target_float
-- (the cash amount swept-to at Day Close) — falls back to the store-wide value
-- when null, so existing stores are unaffected.

CREATE TABLE IF NOT EXISTS cash_drawers (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  register_id  INTEGER REFERENCES registers(id) ON DELETE SET NULL,
  target_float NUMERIC(10,2),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_drawers_store_id ON cash_drawers(store_id);

ALTER TABLE cash_drawer_sessions
  ADD COLUMN IF NOT EXISTS drawer_id INTEGER REFERENCES cash_drawers(id) ON DELETE SET NULL;

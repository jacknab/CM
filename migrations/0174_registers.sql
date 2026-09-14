-- Migration 0174: Registers
--
-- Optional per-store list of named checkout stations ("registers"), used to
-- pair a specific /calendar (staff POS) terminal with a specific /frontdesk
-- (customer-facing) tablet so checkout events (cart, tip, payment, loyalty
-- redemption) route only to the matching pair instead of broadcasting to
-- every device connected to the store.
--
-- A store with zero rows here behaves exactly as before this migration —
-- every /calendar and /frontdesk connection implicitly shares registerId 0.
-- Not to be confused with salon_resources (physical scheduling chairs/
-- stations an appointment occupies) — a completely separate concept.

CREATE TABLE IF NOT EXISTS registers (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registers_store_id ON registers(store_id);

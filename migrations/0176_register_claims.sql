-- Migration 0176: Register Claims
--
-- Tracks which physical device (browser fingerprint, not a logged-in user —
-- staff rotate through the same terminal) currently "owns" each POS station,
-- so the /calendar picker can hide stations another terminal is already
-- using instead of letting two terminals both claim "POS #1" and silently
-- recreate the checkout cross-talk bug the register-pairing feature exists
-- to prevent.
--
-- register_id 0 = the implicit default/original station ("POS #1"), which
-- has no row in `registers` — so this table intentionally has no FK on
-- register_id and is keyed by (store_id, register_id) directly.
--
-- Claims are considered stale after ~15 minutes without a heartbeat (see
-- POST /api/registers/claim) and are then free for any device to reclaim —
-- there is no manual "release" step, so a retired/offline terminal never
-- permanently locks a station.

CREATE TABLE IF NOT EXISTS register_claims (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  register_id INTEGER NOT NULL,
  device_id   TEXT NOT NULL,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, register_id)
);

CREATE INDEX IF NOT EXISTS idx_register_claims_store_id ON register_claims(store_id);

-- Driving distances already asked of Google (owner, 2026-11-04), so one address is paid for once. The key is a hash of
-- the two addresses and nothing about the client is stored. Google allows keeping results for 30 days, so older rows
-- are ignored and removed (lib/houseCalls.ts).
CREATE TABLE IF NOT EXISTS house_call_distances (
  key        TEXT PRIMARY KEY,
  miles      NUMERIC(7, 1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

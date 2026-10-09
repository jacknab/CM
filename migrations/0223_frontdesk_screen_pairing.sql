-- Customer screen pairing. A customer facing screen used to be told which POS station it belonged
-- to by someone typing a station number on it, and a POS tablet picked its own station from a list
-- that any staff member could reset or take over. Now each POS tablet keeps its station
-- automatically (register_claims, see routes/stationPairing.ts), and a customer screen is paired to
-- a POS by a 4-digit code it shows, typed on that POS.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   frontdesk_screens      which station each customer screen belongs to. One screen per station
--                          and one station per screen: pairing again replaces the old link.
--   frontdesk_pair_codes   the code a screen is showing, valid for ten minutes.

CREATE TABLE IF NOT EXISTS frontdesk_screens (
  id serial PRIMARY KEY,
  store_id integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  screen_id text NOT NULL,
  register_id integer NOT NULL,
  paired_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  UNIQUE (store_id, screen_id),
  UNIQUE (store_id, register_id)
);

CREATE TABLE IF NOT EXISTS frontdesk_pair_codes (
  id serial PRIMARY KEY,
  store_id integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  screen_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);

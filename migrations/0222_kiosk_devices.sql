-- Kiosk devices. The check-in kiosk and the customer screen call the public kiosk API with only the
-- salon address in the URL, so anyone could look clients up by phone, check them in or make the
-- salon send texts. Those calls now need a device the salon has set up: either a signed-in session
-- for the salon (what the Certxa owner app carries) or a browser paired once with the salon
-- device code from Settings, POS Stations. A pairing is stored here.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   token_hash     SHA-256 of the random token kept in that browser. The token itself is never stored.
--   last_used_at   updated on every check-in call from the device
--   revoked_at     a revoked device has to be paired again

CREATE TABLE IF NOT EXISTS kiosk_devices (
  id serial PRIMARY KEY,
  store_id integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS kiosk_devices_store ON kiosk_devices (store_id);

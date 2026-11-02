-- Receipt printers set up in the Certxa app on the salon's tablets (owner, 2026-11-02): each tablet reports the
-- printer it prints to (type, IP/port or Bluetooth/USB id, name) and how its last print went, so support sees them
-- under Devices › Receipt printers on /isTeam/accounts/:id. One row per salon and printer.
CREATE TABLE IF NOT EXISTS app_receipt_printers (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  printer_key     TEXT NOT NULL,
  connection      TEXT NOT NULL,
  address         TEXT NOT NULL,
  port            INTEGER,
  name            TEXT,
  model           TEXT,
  tablet_role     TEXT,
  app_build       TEXT,
  reported_ip     TEXT,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_print_at   TIMESTAMPTZ,
  last_print_ok   BOOLEAN,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, printer_key)
);
CREATE INDEX IF NOT EXISTS idx_app_receipt_printers_store ON app_receipt_printers (store_id);

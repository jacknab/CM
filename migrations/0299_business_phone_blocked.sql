-- Numbers blocked from calling a business number (Certxa Pro app › Settings › Business Phone, owner 2026-11-04).
-- Same shape as booking_ban_list (which blocks online booking); a blocked caller hears a busy signal and the pro is not
-- told. Texts are not blocked.
CREATE TABLE IF NOT EXISTS business_phone_blocked (
  id         SERIAL PRIMARY KEY,
  store_id   INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, phone_e164)
);

-- Text consent from the online booking form (owner, 2026-11-04): carriers and A2P rules expect a client's own agreement
-- to texts. Each answer is kept as proof (wording, when, from where). A client whose latest answer here is "no" isn't
-- sent automatic texts by that business (sms.ts); no row means nothing changes.
CREATE TABLE IF NOT EXISTS sms_consents (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  phone_e164  TEXT NOT NULL,
  consented   BOOLEAN NOT NULL,
  source      TEXT NOT NULL,
  wording     TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_consents_store_phone_idx ON sms_consents (store_id, phone_e164, created_at DESC);

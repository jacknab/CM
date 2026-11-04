-- Business Phone for the Certxa Pro app (owner, 2026-11-04): a pro picks a local number, Certxa buys it on its own
-- Twilio account and wires its webhooks (routes/businessPhone.ts). Calls ring the app; texts to the number are shown
-- (sending comes later). No recordings are ever made.
CREATE TABLE IF NOT EXISTS business_phone_lines (
  store_id     INTEGER PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,
  twilio_sid   TEXT NOT NULL,
  ring         TEXT NOT NULL DEFAULT 'hours',  -- 'hours' = ring during business hours only, 'always'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_phone_calls (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  call_sid         TEXT NOT NULL UNIQUE,
  direction        TEXT NOT NULL,             -- 'incoming' | 'outgoing'
  other_number     TEXT NOT NULL,
  status           TEXT NOT NULL,             -- 'ringing' | 'answered' | 'missed' | 'no-answer' | 'failed'
  duration_seconds INTEGER,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_phone_calls_store_idx ON business_phone_calls (store_id, started_at DESC);

CREATE TABLE IF NOT EXISTS business_phone_texts (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  message_sid  TEXT NOT NULL UNIQUE,
  from_number  TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  media_count  INTEGER NOT NULL DEFAULT 0,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_phone_texts_store_idx ON business_phone_texts (store_id, received_at DESC);

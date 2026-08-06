-- Create AI receptionist tables (if not yet present) and add transcript column.
-- These tables are defined in shared/schema.ts but were never created via a migration.

CREATE TABLE IF NOT EXISTS ai_call_log (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES locations(id),
  call_sid         TEXT,
  caller_phone     TEXT,
  caller_name      TEXT,
  outcome          TEXT NOT NULL DEFAULT 'in_progress',
  appointment_id   INTEGER REFERENCES appointments(id),
  duration_seconds INTEGER,
  started_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMP,
  notes            TEXT,
  transcript       JSONB
);

CREATE TABLE IF NOT EXISTS call_usage_records (
  id                  SERIAL PRIMARY KEY,
  call_log_id         INTEGER REFERENCES ai_call_log(id),
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  call_sid            TEXT,
  duration_seconds    INTEGER NOT NULL DEFAULT 0,
  audio_tokens_in     INTEGER NOT NULL DEFAULT 0,
  audio_tokens_out    INTEGER NOT NULL DEFAULT 0,
  text_tokens_in      INTEGER NOT NULL DEFAULT 0,
  text_tokens_out     INTEGER NOT NULL DEFAULT 0,
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  total_tokens        INTEGER NOT NULL DEFAULT 0,
  cached_tokens       INTEGER NOT NULL DEFAULT 0,
  raw_usage           JSONB,
  tool_call_count     INTEGER NOT NULL DEFAULT 0,
  ai_response_count   INTEGER NOT NULL DEFAULT 0,
  twilio_minutes      DECIMAL(10,4) NOT NULL DEFAULT 0,
  twilio_est_cost     DECIMAL(10,6) NOT NULL DEFAULT 0,
  openai_est_cost     DECIMAL(10,6) NOT NULL DEFAULT 0,
  total_est_cost      DECIMAL(10,6) NOT NULL DEFAULT 0,
  termination_reason  TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salon_usage_limits (
  store_id               INTEGER PRIMARY KEY REFERENCES locations(id),
  max_call_duration_min  INTEGER NOT NULL DEFAULT 12,
  max_daily_minutes      INTEGER NOT NULL DEFAULT 480,
  max_monthly_cost_usd   DECIMAL(10,2) NOT NULL DEFAULT 200,
  max_concurrent_calls   INTEGER NOT NULL DEFAULT 3,
  idle_timeout_seconds   INTEGER NOT NULL DEFAULT 30,
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_silence_incidents (
  id                  SERIAL PRIMARY KEY,
  call_log_id         INTEGER REFERENCES ai_call_log(id),
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  call_sid            TEXT,
  layer               TEXT NOT NULL,
  silence_duration_ms INTEGER NOT NULL,
  recovery_action     TEXT NOT NULL,
  occurred_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add transcript column in case table already existed without it
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS transcript JSONB;

-- Columns added by migration 0022 that may already exist or may be missing
ALTER TABLE call_usage_records ADD COLUMN IF NOT EXISTS input_tokens   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE call_usage_records ADD COLUMN IF NOT EXISTS output_tokens  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE call_usage_records ADD COLUMN IF NOT EXISTS total_tokens   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE call_usage_records ADD COLUMN IF NOT EXISTS cached_tokens  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE call_usage_records ADD COLUMN IF NOT EXISTS raw_usage      JSONB;

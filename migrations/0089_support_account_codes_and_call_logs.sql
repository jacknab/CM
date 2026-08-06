-- Create support_account_codes table
CREATE TABLE IF NOT EXISTS support_account_codes (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code              VARCHAR(32) NOT NULL,
  business_name     TEXT,
  support_phone     TEXT,
  owner_user_id     TEXT,
  used_at           TIMESTAMP,
  last_call_sid     TEXT,
  last_caller_phone TEXT,
  last_caller_name  TEXT,
  last_issue_summary TEXT,
  last_transcript   TEXT,
  last_ticket_id    INTEGER,
  last_seen_at      TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS support_account_codes_code_unique ON support_account_codes(code);
CREATE INDEX IF NOT EXISTS idx_support_account_codes_store_id ON support_account_codes(store_id);

-- Create support_call_logs table
CREATE TABLE IF NOT EXISTS support_call_logs (
  id                SERIAL PRIMARY KEY,
  call_sid          TEXT,
  caller_phone      TEXT,
  caller_name       TEXT,
  business_name     TEXT,
  account_store_id  INTEGER,
  subscription_plan TEXT,
  outcome           TEXT NOT NULL DEFAULT 'in_progress',
  ticket_id         INTEGER,
  duration_seconds  INTEGER,
  summary           TEXT,
  escalated         BOOLEAN NOT NULL DEFAULT FALSE,
  priority          TEXT NOT NULL DEFAULT 'normal',
  transcript        JSONB,
  started_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_support_call_logs_caller_phone ON support_call_logs(caller_phone);
CREATE INDEX IF NOT EXISTS idx_support_call_logs_started_at ON support_call_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_support_call_logs_outcome ON support_call_logs(outcome);

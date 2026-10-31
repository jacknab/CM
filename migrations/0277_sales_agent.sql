-- Tom, Certxa's inbound sales phone agent (owner, 2026-10-31): (888) 814-7623, routes/salesAgent.ts.
-- Every call is logged, and callers who are interested are saved as leads for the back office (isTeam Sales Leads).
-- (No semicolons inside strings here: the migration runner splits on them.)
CREATE TABLE IF NOT EXISTS sales_leads (
  id                 SERIAL PRIMARY KEY,
  name               TEXT,
  business_name      TEXT,
  phone              TEXT,
  email              TEXT,
  business_type      TEXT,
  team_size          TEXT,
  city               TEXT,
  current_software   TEXT,
  interested_plan    TEXT,
  notes              TEXT,
  trial_link_sent_at TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'new',
  source             TEXT NOT NULL DEFAULT 'phone',
  call_log_id        INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_leads_created_idx ON sales_leads (created_at DESC);

CREATE TABLE IF NOT EXISTS sales_call_logs (
  id               SERIAL PRIMARY KEY,
  call_sid         TEXT,
  caller_phone     TEXT,
  lead_id          INTEGER,
  outcome          TEXT NOT NULL DEFAULT 'in_progress',
  duration_seconds INTEGER,
  summary          TEXT,
  transcript       JSONB,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sales_call_logs_started_idx ON sales_call_logs (started_at DESC);

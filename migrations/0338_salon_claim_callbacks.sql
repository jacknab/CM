-- Tom verifying a salon owner by calling the salon back (owner, 2026-11-10): the caller isn't on the salon's listed line,
-- is at the salon, and Tom hangs up and calls that number a minute later asking for them by name (routes/salesAgent.ts).
CREATE TABLE IF NOT EXISTS salon_claim_callbacks (
  id           serial PRIMARY KEY,
  token        text NOT NULL UNIQUE,
  job_id       integer NOT NULL REFERENCES salon_account_creation_jobs(id) ON DELETE CASCADE,
  caller_name  text NOT NULL,
  caller_phone text,
  salon_phone  text NOT NULL,
  call_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'pending',   -- pending → calling → connected | failed
  call_sid     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salon_claim_callbacks_due_idx ON salon_claim_callbacks (status, call_at);
-- A claim link Tom sends after verifying the owner by caller ID or call-back starts verified (no code call needed).
ALTER TABLE salon_claim_links ADD COLUMN IF NOT EXISTS verified_by text;

-- Claiming a Certxa-prepared salon page (owner, 2026-11-10): Tom (sales line) texts the owner a one-time link. The owner
-- proves the salon is theirs with a code Certxa reads out in a call to the salon's listed phone number, then creates a
-- Certxa Salon login, and the prepared account moves over to it (routes/salonClaim.ts).
CREATE TABLE IF NOT EXISTS salon_claim_links (
  id             serial PRIMARY KEY,
  token_hash     text NOT NULL UNIQUE,
  job_id         integer NOT NULL REFERENCES salon_account_creation_jobs(id) ON DELETE CASCADE,
  sent_to        text,
  code_hash      text,
  code_expires_at timestamptz,
  code_calls     integer NOT NULL DEFAULT 0,
  code_attempts  integer NOT NULL DEFAULT 0,
  verified_at    timestamptz,
  used_at        timestamptz,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salon_claim_links_job_idx ON salon_claim_links (job_id);

-- An owner asking Certxa to take their prepared page down (Tom records it; the team removes it).
CREATE TABLE IF NOT EXISTS salon_page_removal_requests (
  id           serial PRIMARY KEY,
  job_id       integer REFERENCES salon_account_creation_jobs(id) ON DELETE SET NULL,
  store_id     integer,
  caller_phone text,
  caller_name  text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  done_at      timestamptz
);

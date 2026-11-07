-- Controlled, idempotent salon-to-Solo account provisioning. The campaign is
-- deliberately paused and unapproved until an administrator starts a run.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS unclaimed_at timestamptz;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_unpriced_placeholder boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS salon_account_creation_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  paused boolean NOT NULL DEFAULT true,
  production_approved boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz,
  paused_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO salon_account_creation_control (singleton, paused, production_approved)
VALUES (true, true, false)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS salon_account_creation_jobs (
  id bigserial PRIMARY KEY,
  source_salon_id integer NOT NULL UNIQUE REFERENCES nail_salons(id) ON DELETE RESTRICT,
  place_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scanning', 'scan_failed', 'eligible', 'queued', 'processing', 'created', 'expired', 'skipped', 'failed', 'claimed')),
  store_id integer REFERENCES locations(id) ON DELETE RESTRICT,
  user_id text REFERENCES users(id) ON DELETE RESTRICT,
  website_id integer,
  assigned_slug varchar(63),
  match_score numeric(5,4),
  google_data_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  claimed_at timestamptz,
  claimed_by_user_id text REFERENCES users(id),
  scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS salon_account_creation_jobs_status_idx
  ON salon_account_creation_jobs (status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS salon_account_creation_jobs_store_idx
  ON salon_account_creation_jobs (store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS salon_account_creation_jobs_expiry_idx
  ON salon_account_creation_jobs (google_data_expires_at)
  WHERE google_data_expires_at IS NOT NULL AND status = 'created';
CREATE UNIQUE INDEX IF NOT EXISTS salon_account_creation_jobs_place_store_unique
  ON salon_account_creation_jobs (place_id)
  WHERE place_id IS NOT NULL AND store_id IS NOT NULL AND status IN ('created','claimed','expired');

CREATE TABLE IF NOT EXISTS salon_account_creation_logs (
  id bigserial PRIMARY KEY,
  job_id bigint REFERENCES salon_account_creation_jobs(id) ON DELETE RESTRICT,
  source_salon_id integer NOT NULL,
  event text NOT NULL,
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salon_account_creation_logs_source_idx
  ON salon_account_creation_logs (source_salon_id, created_at DESC);

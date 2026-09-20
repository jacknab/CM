-- 0194_owner_phone_otps_and_health_checks_tables.sql
--
-- Both tables were previously created by ad-hoc `pool.query(CREATE TABLE IF
-- NOT EXISTS ...)` calls that ran on every single process boot (auth.ts's
-- setupAuth() and healthCheck/index.ts's bootstrapHealthCheckTable()) instead
-- of through a tracked migration — contributing an extra couple of DDL round
-- trips to every deploy/reload's already-slow cold-start window (the
-- `[db:slow] ~4900ms` entries seen right after a restart). Moving them here
-- means they run exactly once, ever, tracked in schema_migrations like every
-- other migration.

CREATE TABLE IF NOT EXISTS owner_phone_otps (
  id         SERIAL PRIMARY KEY,
  phone      TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS owner_phone_otps_phone_idx ON owner_phone_otps (phone);

CREATE TABLE IF NOT EXISTS account_health_checks (
  id            SERIAL PRIMARY KEY,
  account_id    INTEGER NOT NULL,
  agent_id      INTEGER NOT NULL DEFAULT 1,
  agent_name    TEXT    NOT NULL DEFAULT 'System',
  run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  segments_run  TEXT[]  NOT NULL DEFAULT '{}',
  results       JSONB   NOT NULL DEFAULT '{}',
  pass_count    INTEGER NOT NULL DEFAULT 0,
  warn_count    INTEGER NOT NULL DEFAULT 0,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_ahc_account_run
  ON account_health_checks (account_id, run_at DESC);

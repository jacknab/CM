-- Certxa Print Agent. Lets Certxa send a salon check PDF to a small Windows app (the Print Agent)
-- on the salon PC, which prints it on the salon printer. The agent only ever makes outbound HTTPS
-- calls to Certxa and nothing listens on the salon PC.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   print_agent_enrollments  one row per Generate Setup Code click. Holds only a keyed hash of the
--                            code, the public IP that asked for it, a 5 minute expiry, an attempt
--                            counter and a status (PENDING / USED / EXPIRED / LOCKED / CANCELLED).
--                            Rows are kept as an audit trail.
--   print_agents             one row per paired computer with its public key and the hash of its
--                            device token. Revoking marks the row (revoked_at / revoked_by) and
--                            never deletes it. Pairing the same PC again creates a new row.
--   print_jobs               the queue. The PDF lives here only until the job finishes (printed /
--                            failed / cancelled / expired), then it is erased.

CREATE TABLE IF NOT EXISTS print_agents (
  id              serial PRIMARY KEY,
  store_id        integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  installation_id text NOT NULL,
  machine_name    text,
  public_key      text NOT NULL,
  token_hash      text NOT NULL,
  printer_name    text,
  printer_status  text,
  agent_version   text,
  paired_ip       text,
  last_seen_at    timestamptz,
  revoked_at      timestamptz,
  revoked_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS print_agents_token_hash_unique ON print_agents (token_hash);
CREATE INDEX IF NOT EXISTS print_agents_store_idx ON print_agents (store_id);

CREATE TABLE IF NOT EXISTS print_agent_enrollments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code_hash        text NOT NULL,
  requesting_ip    text NOT NULL,
  created_by       text,
  status           text NOT NULL DEFAULT 'PENDING',
  attempts         integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 5,
  paired_device_id integer REFERENCES print_agents(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS print_agent_enrollments_code_hash_unique ON print_agent_enrollments (code_hash);
CREATE INDEX IF NOT EXISTS print_agent_enrollments_store_idx ON print_agent_enrollments (store_id, status);

CREATE TABLE IF NOT EXISTS print_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  agent_id        integer REFERENCES print_agents(id) ON DELETE SET NULL,
  document_type   text NOT NULL,
  title           text NOT NULL,
  copies          integer NOT NULL DEFAULT 1,
  document        bytea,
  document_sha256 text,
  status          text NOT NULL DEFAULT 'QUEUED',
  status_message  text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,
  expires_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS print_jobs_store_status_idx ON print_jobs (store_id, status, created_at);

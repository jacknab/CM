-- Certxa Print Agent, secure check transactions. The server now builds the check PDF itself, using
-- bank details that live only on the salon PC and are sent by the paired agent for one transaction.
-- Nothing added here ever holds bank details, a signature image or a finished PDF.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   print_jobs.payload                  the check WITHOUT bank details (payee, amount, stub rows).
--                                       Erased when the job reaches a final state.
--   print_jobs.bank_nonce_hash          SHA-256 of the one-time nonce issued when the agent claims the
--                                       job. Cleared the moment it is used, so it can be used once.
--   print_jobs.bank_request_expires_at  the agent must answer before this (about 90 seconds).
--   print_jobs.client_request_id        idempotency key from the browser so a double click or a retry
--                                       cannot create a second transaction.
--   print_agents.bank_ready             whether the PC says its bank details are filled in (yes or no only).

ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS bank_nonce_hash text;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS bank_request_expires_at timestamptz;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_client_request_unique
  ON print_jobs (store_id, client_request_id) WHERE client_request_id IS NOT NULL;

ALTER TABLE print_agents ADD COLUMN IF NOT EXISTS bank_ready boolean NOT NULL DEFAULT false;

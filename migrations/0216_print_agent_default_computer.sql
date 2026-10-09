-- Certxa Print Agent, choosing which computer prints. A salon may pair several computers. The owner
-- marks one as the computer that prints checks, and each check transaction is addressed to it.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   print_agents.is_default      true on the one computer (per salon) that prints checks.
--   print_jobs.target_agent_id   the computer a transaction is addressed to. Only that computer may
--                                claim it. NULL means any computer of the salon (no default chosen).

ALTER TABLE print_agents ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS target_agent_id integer REFERENCES print_agents(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS print_agents_one_default_per_store
  ON print_agents (store_id) WHERE is_default AND revoked_at IS NULL;

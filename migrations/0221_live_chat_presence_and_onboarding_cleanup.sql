-- Two repairs found while auditing the support back office.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
-- 1. live_chat_agent_presence. Every API worker stamps last_seen_at for the support agents whose
--    chat connection it holds, every 20 seconds. The workers do not share memory, so this table is
--    how any of them can tell that an agent is gone for good (browser closed, connection lost) and
--    not just reloading the page. A chat still assigned to an agent who has not been seen for 75
--    seconds is put back in the queue and the visitor is told. See routes/liveChat.ts.
--
-- 2. onboarding_progress kept rows for stores that no longer exist, because store_id had no
--    foreign key. Those rows are removed and the key is added, so a deleted store takes its
--    progress rows with it from now on.

CREATE TABLE IF NOT EXISTS live_chat_agent_presence (
  agent_id integer PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

DELETE FROM onboarding_progress p WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = p.store_id);

ALTER TABLE onboarding_progress
  ADD CONSTRAINT onboarding_progress_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;

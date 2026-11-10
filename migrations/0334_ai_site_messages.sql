-- AI Website Builder, Stage 5 (owner, 2026-11-09): the "Describe a change" conversation. Each owner message and the
-- designer's reply; a reply points at the version it made.
CREATE TABLE IF NOT EXISTS ai_site_messages (
  id         serial PRIMARY KEY,
  store_id   integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner', 'designer')),
  text       text NOT NULL,
  version_id integer REFERENCES ai_site_versions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_site_messages_store_idx ON ai_site_messages (store_id, id DESC);

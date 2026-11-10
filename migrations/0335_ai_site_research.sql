-- AI Website Builder, research step (owner, 2026-11-09): "What I found" — what Google, the old website and (with Claude)
-- the web say about the business, as cards with their sources, plus questions where sources disagree. The owner's
-- answers (by question id) feed the ideas and the build.
CREATE TABLE IF NOT EXISTS ai_site_research (
  id         serial PRIMARY KEY,
  store_id   integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  found      jsonb NOT NULL,
  answers    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_site_research_store_idx ON ai_site_research (store_id, id DESC);

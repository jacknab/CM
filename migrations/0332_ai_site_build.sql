-- AI Website Builder, Stage 3 (owner, 2026-11-09; plans/ai-website-builder.md).

-- Long AI steps run in the background (they can pass the 60-second web timeout); the app polls the job.
CREATE TABLE IF NOT EXISTS ai_site_jobs (
  id          serial PRIMARY KEY,
  store_id    integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  charge_key  text,
  result      jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_site_jobs_store_idx ON ai_site_jobs (store_id, id DESC);

-- Each built (or later changed) site: the design spec. Facts (prices, hours, reviews, photos, phone, address) are not in
-- it; they are read from Certxa when the page is shown. preview_token opens the private preview.
CREATE TABLE IF NOT EXISTS ai_site_versions (
  id            serial PRIMARY KEY,
  store_id      integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  spec          jsonb NOT NULL,
  made_by       text NOT NULL,
  note          text,
  preview_token text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_site_versions_store_idx ON ai_site_versions (store_id, id DESC);

-- Kiosk Builder (plans/kiosk-builder.md): a business's saved kiosk configurations — named kiosk designs it can
-- load into its draft, export to a file, or make by importing a file. Separate from kiosk_layouts (the draft and
-- the published versions): a configuration never changes the kiosk until it is loaded and published.
CREATE TABLE IF NOT EXISTS kiosk_configs (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  layout        JSONB NOT NULL,
  -- 'saved' (from the builder) or 'imported' (from a file)
  source        TEXT NOT NULL DEFAULT 'saved' CHECK (source IN ('saved', 'imported')),
  created_by    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kiosk_configs_store ON kiosk_configs (store_id, updated_at DESC);

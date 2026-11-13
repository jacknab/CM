-- Kiosk Builder (plans/kiosk-builder.md): each store's check-in kiosk layout.
-- One draft row per store (version NULL) that the builder saves into, and numbered published versions.
-- Only the newest published version is 'published'; older ones are 'archived'. A published or archived
-- row's layout is never changed: going back to an old version publishes a copy of it as a new version.
-- No row at all: the store's kiosk uses its business type's preset (shared/kiosk/presets.ts).
CREATE TABLE IF NOT EXISTS kiosk_layouts (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  version        INTEGER,
  schema_version INTEGER NOT NULL DEFAULT 1,
  layout         JSONB NOT NULL,
  note           TEXT,
  created_by     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at   TIMESTAMPTZ,
  CONSTRAINT kiosk_layouts_version_by_status CHECK ((status = 'draft') = (version IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS kiosk_layouts_one_draft ON kiosk_layouts (store_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS kiosk_layouts_one_published ON kiosk_layouts (store_id) WHERE status = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS kiosk_layouts_store_version ON kiosk_layouts (store_id, version) WHERE version IS NOT NULL;

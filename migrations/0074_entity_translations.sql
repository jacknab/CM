CREATE TABLE IF NOT EXISTS entity_translations (
  id              SERIAL PRIMARY KEY,
  entity_type     TEXT NOT NULL,   -- 'category' | 'service' | 'addon' | 'product'
  entity_id       INTEGER NOT NULL,
  language        TEXT NOT NULL,   -- 'es' | 'vi' | 'zh' | 'ko'
  name            TEXT NOT NULL,
  description     TEXT,
  auto_generated  BOOLEAN NOT NULL DEFAULT TRUE,
  is_edited_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  confidence_score  REAL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, language)
);

CREATE INDEX IF NOT EXISTS idx_entity_translations_lookup
  ON entity_translations (entity_type, entity_id);

-- French content translations use the existing language-keyed translation
-- table. No schema change is necessary because language is stored as TEXT.
-- This index makes French lookups explicit and efficient as the catalog grows.
CREATE INDEX IF NOT EXISTS idx_entity_translations_french
  ON entity_translations (entity_type, entity_id)
  WHERE language = 'fr';

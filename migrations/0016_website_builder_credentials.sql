ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS website_builder_token TEXT,
  ADD COLUMN IF NOT EXISTS website_builder_secret TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS locations_website_builder_token_idx
  ON locations (website_builder_token)
  WHERE website_builder_token IS NOT NULL;

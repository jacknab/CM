-- Add auto-publisher columns to wb_websites
-- publisher_type: 'template' (default, existing behaviour) | 'auto' (GlossGenius-style renderer)
-- auto_settings: JSONB blob for brand color, tagline, section toggles, social links, announcement bar

ALTER TABLE wb_websites
  ADD COLUMN IF NOT EXISTS publisher_type VARCHAR(32) NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS auto_settings JSONB NOT NULL DEFAULT '{}';

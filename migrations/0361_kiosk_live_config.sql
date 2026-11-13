-- Kiosk Builder (plans/kiosk-builder.md, owner 2026-11-13): the business edits kiosk configurations (kiosk_configs),
-- each made with one builder, and puts one on its kiosk. config_id: the configuration a published version came from,
-- so the builder can show which configuration is on the kiosk now. NULL for versions published before this.
ALTER TABLE kiosk_layouts ADD COLUMN IF NOT EXISTS config_id INTEGER REFERENCES kiosk_configs(id) ON DELETE SET NULL;

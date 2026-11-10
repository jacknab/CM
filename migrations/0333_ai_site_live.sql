-- AI Website Builder, Stage 4 (owner, 2026-11-09): the AI-designed version that is the live website. NULL = the
-- business's regular design (bookingTheme), so "Use my old design" is one switch back.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS ai_site_live_version_id integer REFERENCES ai_site_versions(id) ON DELETE SET NULL;

-- Migration 0182: nail_salons.about_text
--
-- Short AI-generated "About us" copy for the salon marketplace's profile
-- pages (the "Why go / The short version" section) — backfilled by
-- scripts/generate-salon-about-text.ts, not written here. NULL until that
-- script has processed a given row.

ALTER TABLE nail_salons ADD COLUMN IF NOT EXISTS about_text text;

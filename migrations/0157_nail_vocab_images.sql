-- 0157_nail_vocab_images.sql
--
-- Nail size / shape / art-application vocab rows get an optional image, so the
-- check-in kiosk (and any other picker) can show a real photo card per option.
-- `nail_art_effects` already has `image_url` — this brings the other three in
-- line. Nullable; existing rows keep working with an emoji / tile fallback.

ALTER TABLE nail_sizes            ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE nail_shapes           ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE nail_art_applications ADD COLUMN IF NOT EXISTS image_url TEXT;

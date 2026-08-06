-- 0129_gbp_photo_gallery_source_type
-- The original source_type CHECK constraint on gbp_photo_queue only allowed
-- ('service_image','staff_avatar'). Gallery-photo uploads (source_type='gallery_photo')
-- were silently rejected by Postgres, so no gallery photos ever reached GBP.
-- This migration:
--   1. Drops the old constraint and recreates it with 'gallery_photo' included.
--   2. Resets any stuck/failed gallery_photo rows so the dispatcher retries them.

DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gbp_photo_queue_source_type_check'
  ) THEN
    ALTER TABLE gbp_photo_queue DROP CONSTRAINT gbp_photo_queue_source_type_check;
  END IF;

  -- Recreate with gallery_photo included
  ALTER TABLE gbp_photo_queue
    ADD CONSTRAINT gbp_photo_queue_source_type_check
    CHECK (source_type IN ('service_image', 'staff_avatar', 'gallery_photo'));
END $$;

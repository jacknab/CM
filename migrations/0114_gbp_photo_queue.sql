-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0114: GBP Photo Automation Engine — queue and settings tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-store settings for the photo engine
CREATE TABLE IF NOT EXISTS gbp_photo_settings (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL UNIQUE REFERENCES locations(id),
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  max_photos_per_day  INTEGER NOT NULL DEFAULT 3,
  min_hours_between   INTEGER NOT NULL DEFAULT 4,  -- min hours between consecutive uploads
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Photo upload queue — one row per candidate photo for GBP
CREATE TABLE IF NOT EXISTS gbp_photo_queue (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  image_url           TEXT NOT NULL,           -- R2 public/proxy URL
  image_r2_key        TEXT,                    -- raw R2 key for binary fetching (preferred)
  source_type         TEXT NOT NULL,           -- 'service_image' | 'staff_avatar'
  service_id          INTEGER,                 -- related service if applicable
  staff_id            INTEGER,                 -- related staff member if applicable
  google_location_id  TEXT,                    -- resolved locationResourceName
  status              TEXT NOT NULL DEFAULT 'pending',
  scheduled_for       TIMESTAMPTZ,             -- when this photo is eligible to upload
  uploaded_photo_id   TEXT,                    -- Google media resource name after success
  ai_description      TEXT,                    -- generated caption/description
  ai_tags             TEXT[],                  -- classification tags from vision model
  attempts            INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT,
  api_response        JSONB,                   -- raw GBP API response
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CHECK constraint: only valid statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gbp_photo_queue_status_check'
  ) THEN
    ALTER TABLE gbp_photo_queue
      ADD CONSTRAINT gbp_photo_queue_status_check
      CHECK (status IN ('pending','processing','uploaded','failed','cancelled'));
  END IF;
END $$;

-- CHECK constraint: only valid source types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gbp_photo_queue_source_type_check'
  ) THEN
    ALTER TABLE gbp_photo_queue
      ADD CONSTRAINT gbp_photo_queue_source_type_check
      CHECK (source_type IN ('service_image','staff_avatar'));
  END IF;
END $$;

-- Dedup index: same R2 image never uploads twice to the same GBP location
-- Allows re-queuing only after cancel/fail
CREATE UNIQUE INDEX IF NOT EXISTS gbppq_image_location_unique_idx
  ON gbp_photo_queue (store_id, image_r2_key, google_location_id)
  WHERE status NOT IN ('cancelled', 'failed') AND image_r2_key IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS gbppq_store_id_idx      ON gbp_photo_queue (store_id);
CREATE INDEX IF NOT EXISTS gbppq_status_idx        ON gbp_photo_queue (status);
CREATE INDEX IF NOT EXISTS gbppq_scheduled_for_idx ON gbp_photo_queue (scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS gbppq_created_at_idx    ON gbp_photo_queue (created_at DESC);

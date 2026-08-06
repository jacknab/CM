-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0113: GBP Post Automation Engine — queue and settings tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-store settings for the post engine
CREATE TABLE IF NOT EXISTS gbp_post_settings (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL UNIQUE REFERENCES locations(id),
  auto_post_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  require_approval  BOOLEAN NOT NULL DEFAULT TRUE,  -- all posts start as draft; owner must approve
  max_posts_per_week INTEGER NOT NULL DEFAULT 2,
  post_delay_hours  INTEGER NOT NULL DEFAULT 2,     -- minimum hours between event and eligible-to-post
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post queue — one row per generated post candidate
CREATE TABLE IF NOT EXISTS gbp_post_queue (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES locations(id),
  post_type             TEXT NOT NULL,        -- WHATS_NEW | OFFER | EVENT | ALERT
  status                TEXT NOT NULL DEFAULT 'draft',
  source_event_type     TEXT NOT NULL,        -- service_created | service_updated | staff_added | holiday_hours | gift_cards_enabled | announcement
  source_event_id       TEXT,                 -- e.g. "service:42", "staff:17"
  topic_hash            TEXT NOT NULL,        -- SHA256({storeId}:{eventType}:{entityId}) — dedup key
  generated_summary     TEXT NOT NULL,        -- the post body shown on GBP
  generated_title       TEXT,                 -- for EVENT posts (optional)
  cta_type              TEXT,                 -- BOOK | LEARN_MORE | CALL | null
  cta_url               TEXT,                 -- booking link or null
  media_url             TEXT,                 -- optional photo URL
  eligible_after        TIMESTAMPTZ NOT NULL, -- minimum delay: created_at + post_delay_hours
  scheduled_for         TIMESTAMPTZ,          -- next business-hours slot (set on approve)
  gbp_post_id           TEXT,                 -- resource name returned by GBP after publish
  publish_result        JSONB,                -- raw GBP API response
  attempts              INTEGER NOT NULL DEFAULT 0,
  failure_reason        TEXT,
  approved_at           TIMESTAMPTZ,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CHECK constraint: only valid statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gbp_post_queue_status_check'
  ) THEN
    ALTER TABLE gbp_post_queue
      ADD CONSTRAINT gbp_post_queue_status_check
      CHECK (status IN ('draft','approved','scheduled','published','failed','cancelled'));
  END IF;
END $$;

-- CHECK constraint: only valid post types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gbp_post_queue_post_type_check'
  ) THEN
    ALTER TABLE gbp_post_queue
      ADD CONSTRAINT gbp_post_queue_post_type_check
      CHECK (post_type IN ('WHATS_NEW','OFFER','EVENT','ALERT'));
  END IF;
END $$;

-- Partial unique index on topic_hash — prevents duplicate posts for the same entity
-- while allowing re-queuing after cancel/fail
CREATE UNIQUE INDEX IF NOT EXISTS gbpq_topic_hash_unique_idx
  ON gbp_post_queue (store_id, topic_hash)
  WHERE status NOT IN ('cancelled', 'failed');

-- Indexes for the dispatcher and queue-list queries
CREATE INDEX IF NOT EXISTS gbpq_store_id_idx        ON gbp_post_queue (store_id);
CREATE INDEX IF NOT EXISTS gbpq_status_idx          ON gbp_post_queue (status);
CREATE INDEX IF NOT EXISTS gbpq_scheduled_for_idx   ON gbp_post_queue (scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS gbpq_created_at_idx      ON gbp_post_queue (created_at DESC);

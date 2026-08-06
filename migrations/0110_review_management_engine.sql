-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2: Google Review Management Engine
--
-- Two new tables:
--   google_review_engine_settings  — per-store automation config
--   google_review_response_queue   — scheduling + audit log for every queued reply
--
-- Designed to slot into the existing schema without altering any existing tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Per-store engine settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_review_engine_settings (
  id                             SERIAL PRIMARY KEY,
  store_id                       INTEGER NOT NULL UNIQUE REFERENCES locations(id),

  -- Master on/off toggle
  auto_respond_enabled           BOOLEAN NOT NULL DEFAULT TRUE,

  -- Minimum delay (minutes) before a response can be published (default: 60 = 1 hour)
  min_response_delay_minutes     INTEGER NOT NULL DEFAULT 60,

  -- Sentiment-based rules
  auto_respond_5_star            BOOLEAN NOT NULL DEFAULT TRUE,
  auto_respond_4_star            BOOLEAN NOT NULL DEFAULT TRUE,
  require_approval_3_star        BOOLEAN NOT NULL DEFAULT TRUE,
  notify_owner_1_2_star          BOOLEAN NOT NULL DEFAULT TRUE,

  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS greset_store_id_idx
  ON google_review_engine_settings(store_id);

-- ── 2. Response queue / audit log ────────────────────────────────────────────
-- status values:
--   pending          — just inserted, pre-scheduling
--   scheduled        — response generated, waiting for scheduled_for window
--   awaiting_approval — 3-star: needs owner sign-off before publishing
--   owner_notified   — 1-2 star: owner alerted, response drafted but NOT auto-published
--   approved         — owner approved a 3-star draft; will publish at scheduled_for
--   published        — successfully posted to Google
--   cancelled        — cancelled by the owner
--   failed           — publish attempt failed (see failure_reason)

CREATE TABLE IF NOT EXISTS google_review_response_queue (
  id                             SERIAL PRIMARY KEY,
  store_id                       INTEGER NOT NULL REFERENCES locations(id),
  google_review_id               INTEGER NOT NULL REFERENCES google_reviews(id),
  google_review_response_id      INTEGER REFERENCES google_review_responses(id),

  -- Cached rating (avoids a JOIN on every dispatcher tick)
  rating                         INTEGER NOT NULL,

  -- Lifecycle
  status                         TEXT NOT NULL DEFAULT 'pending',

  -- Timing
  review_received_at             TIMESTAMPTZ,          -- review_create_time from GBP
  eligible_after                 TIMESTAMPTZ,          -- review_received_at + delay
  scheduled_for                  TIMESTAMPTZ,          -- first business-hours slot after eligible_after
  published_at                   TIMESTAMPTZ,
  owner_notified_at              TIMESTAMPTZ,

  -- Content
  generated_response_text        TEXT,

  -- Error tracking
  failure_reason                 TEXT,
  attempts                       INTEGER NOT NULL DEFAULT 0,

  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS grrq_store_id_idx         ON google_review_response_queue(store_id);
CREATE INDEX IF NOT EXISTS grrq_google_review_id_idx ON google_review_response_queue(google_review_id);
CREATE INDEX IF NOT EXISTS grrq_status_idx           ON google_review_response_queue(status);
CREATE INDEX IF NOT EXISTS grrq_scheduled_for_idx    ON google_review_response_queue(scheduled_for)
  WHERE status IN ('scheduled', 'approved');

-- Prevent the same review from being queued twice
CREATE UNIQUE INDEX IF NOT EXISTS grrq_review_unique_idx
  ON google_review_response_queue(google_review_id)
  WHERE status NOT IN ('cancelled', 'failed');

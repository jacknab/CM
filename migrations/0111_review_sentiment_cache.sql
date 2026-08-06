-- Migration: review_sentiment_cache
-- Stores the last AI-generated Review Themes & Sentiment result per store.
-- One row per store; upserted on each re-analysis so storage stays bounded.

CREATE TABLE IF NOT EXISTS review_sentiment_cache (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL UNIQUE,
  themes       JSONB    NOT NULL DEFAULT '[]',
  review_count INTEGER  NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_sentiment_cache_store
  ON review_sentiment_cache (store_id);

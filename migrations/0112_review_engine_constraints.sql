-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0112: Review Engine data integrity constraints
--
-- RISK-3: Add FK from review_sentiment_cache.store_id → locations(id)
-- RISK-4: Add CHECK constraints for queue status and rating
-- ─────────────────────────────────────────────────────────────────────────────

-- RISK-3: Add foreign key on review_sentiment_cache.store_id
-- (table exists from 0111 — add the FK via ALTER)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'review_sentiment_cache_store_id_fkey'
  ) THEN
    ALTER TABLE review_sentiment_cache
      ADD CONSTRAINT review_sentiment_cache_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES locations(id);
  END IF;
END $$;

-- RISK-4: CHECK constraint on google_review_response_queue.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grrq_status_check'
  ) THEN
    ALTER TABLE google_review_response_queue
      ADD CONSTRAINT grrq_status_check CHECK (
        status IN (
          'pending',
          'scheduled',
          'awaiting_approval',
          'owner_notified',
          'approved',
          'published',
          'cancelled',
          'failed'
        )
      );
  END IF;
END $$;

-- RISK-4: CHECK constraint on google_review_response_queue.rating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grrq_rating_check'
  ) THEN
    ALTER TABLE google_review_response_queue
      ADD CONSTRAINT grrq_rating_check CHECK (rating >= 1 AND rating <= 5);
  END IF;
END $$;

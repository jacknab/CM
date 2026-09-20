-- 0193_account_timeline_indexes.sql
--
-- The support-agent "account activity timeline" (routes/support.ts,
-- fetchActivityEvents + the account-detail sidebar) fires ~13 parallel
-- queries per page load, each filtered by account_id/store_id and ordered by
-- a timestamp. Six of those tables had no index at all beyond their primary
-- key, so every load did a full sequential scan on each — the source of the
-- repeated `[db:slow]` warnings (200-280ms each) for these specific queries
-- in the certxa-api log.

CREATE INDEX IF NOT EXISTS idx_support_agent_activity_account_created
  ON support_agent_activity (account_id, created_at);

CREATE INDEX IF NOT EXISTS idx_store_activity_events_store_type_created
  ON store_activity_events (store_id, event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_call_log_store_started
  ON ai_call_log (store_id, started_at);

CREATE INDEX IF NOT EXISTS idx_support_account_tags_account_created
  ON support_account_tags (account_id, created_at);

CREATE INDEX IF NOT EXISTS idx_support_tickets_account_created
  ON support_tickets (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_usage_records_store_created
  ON call_usage_records (store_id, created_at);

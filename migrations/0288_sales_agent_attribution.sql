-- Distinguish sales agents on the shared sales call history (Tom rows remain Tom).
ALTER TABLE sales_call_logs
  ADD COLUMN IF NOT EXISTS sales_agent_id TEXT NOT NULL DEFAULT 'tom';

CREATE INDEX IF NOT EXISTS sales_call_logs_agent_started_idx
  ON sales_call_logs (sales_agent_id, started_at DESC);

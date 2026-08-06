ALTER TABLE call_usage_records
  ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_usage jsonb;


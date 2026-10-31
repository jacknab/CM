-- Every call to Tom (the AI sales line) is fact-checked afterwards against the approved fact sheet (owner, 2026-10-31).
ALTER TABLE sales_call_logs ADD COLUMN IF NOT EXISTS fact_check_ok BOOLEAN;
ALTER TABLE sales_call_logs ADD COLUMN IF NOT EXISTS fact_check_issues JSONB;

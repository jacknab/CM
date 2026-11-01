-- Each /manage assistant answer is fact-checked afterwards against what it looked up and the help guide (2026-11-01).
ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS fact_check JSONB;

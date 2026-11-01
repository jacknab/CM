-- The /manage opening briefing is kept, so a refresh shows it again instead of an empty page (owner, 2026-11-01).
-- A new one is written when the kept one is 30 minutes old (it talks about what is happening in the salon now).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_manage_briefing JSONB;

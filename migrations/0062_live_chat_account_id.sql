-- Attach logged-in account to live chat sessions
ALTER TABLE live_chats ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_live_chats_account_id ON live_chats (account_id);

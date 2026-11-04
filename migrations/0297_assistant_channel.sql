-- Which chat a message belongs to (2026-11-03): 'web' = the /manage assistant, 'app' = Business AI in the Certxa Pro
-- app. The same owner can use both; each keeps its own conversation.
ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'web';
CREATE INDEX IF NOT EXISTS assistant_messages_channel_idx ON assistant_messages (user_id, store_id, channel, id DESC);
-- Business AI answers carry client buttons and text drafts for the app to show again with the history.
ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS extras JSONB;

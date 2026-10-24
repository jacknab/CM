-- 0261_live_chat_visitor_left.sql
--
-- Live chat (owner, 2026-10-24): the agent is told when the visitor has left an ongoing chat — they pressed
-- End chat, or their page lost its connection and didn't come back. Cleared if they come back.
ALTER TABLE live_chats ADD COLUMN IF NOT EXISTS visitor_left_at TIMESTAMPTZ;

-- When the visitor of a live chat was last connected. Every API worker stamps it for the chats whose
-- visitor it holds a connection to, the same way live_chat_agent_presence works for agents. A chat
-- waiting in the queue whose visitor has not been seen for a while is marked missed instead of
-- waiting there for an agent to close it by hand.
ALTER TABLE live_chats ADD COLUMN IF NOT EXISTS visitor_seen_at TIMESTAMPTZ;

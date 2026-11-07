-- Website messages (owner, 2026-11-07, plans/pro-messages.md): the pro's switch at the top of the Inbox. Off: clients see
-- the pro as away even while the app is open, answers go by e-mail and alerts come as pushes.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS live_chat_available BOOLEAN NOT NULL DEFAULT true;

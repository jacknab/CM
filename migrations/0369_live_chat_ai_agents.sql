-- Tom and Marel answer the certxa.com live chat (owner, 2026-11-15; lib/liveChatAi.ts). A chat they hold has their
-- support agent as its agent, so the isTeam console shows who has it and any agent can take it over. Tom's row is new
-- (Marel's is migration 0341); like hers it can't sign in and isn't routed chats (inactive).
INSERT INTO support_agents (email, first_name, last_name, name, role, is_active, departments, created_at, updated_at)
SELECT 'tom.ai@certxa.invalid', 'Tom', '(AI)', 'Tom (AI)', 'agent', false, ARRAY['sales'], now(), now()
WHERE NOT EXISTS (SELECT 1 FROM support_agents WHERE email = 'tom.ai@certxa.invalid');

-- What the AI holds for the chat between messages: the verified account, a pending code, Tom's hand-over note, the lead.
ALTER TABLE live_chats ADD COLUMN IF NOT EXISTS ai_state jsonb NOT NULL DEFAULT '{}'::jsonb;

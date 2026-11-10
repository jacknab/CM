-- Maril, Certxa's AI Account Services agent on the phone (owner, 2026-11-10; lib/marilAccountSupport.ts). Her actions on
-- an account are logged as this support agent, so they show on the account's timeline and count against the isAdmin
-- credit/refund limits like any agent's. She can't sign in (no password) and isn't offered as an assignee (inactive).
INSERT INTO support_agents (email, first_name, last_name, name, role, is_active, departments, created_at, updated_at)
SELECT 'maril.ai@certxa.invalid', 'Maril', '(AI)', 'Maril (AI)', 'agent', false, ARRAY['support', 'billing'], now(), now()
WHERE NOT EXISTS (SELECT 1 FROM support_agents WHERE email = 'maril.ai@certxa.invalid');

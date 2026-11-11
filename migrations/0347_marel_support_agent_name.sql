-- The Account Services AI is called Marel now (owner, 2026-11-11; was Maril). Only her own support agent row, found by
-- its fixed e-mail; her past activity keeps its agent id.
UPDATE support_agents SET first_name = 'Marel', name = 'Marel (AI)' WHERE email = 'maril.ai@certxa.invalid';

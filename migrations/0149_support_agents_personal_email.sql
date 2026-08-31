-- support_agents.personal_email — the agent's real-world email address, used
-- to deliver their auto-generated @certxa.com login and temporary password.
-- Distinct from support_agents.email, which is the auto-generated login
-- identity ({slugified name}{id}@certxa.com) used to sign in to /isTeam.
ALTER TABLE support_agents ADD COLUMN IF NOT EXISTS personal_email TEXT;

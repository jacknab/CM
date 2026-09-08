-- Persist the optional pronoun question shown in the online booking form.
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS ask_clients_for_pronouns BOOLEAN NOT NULL DEFAULT FALSE;
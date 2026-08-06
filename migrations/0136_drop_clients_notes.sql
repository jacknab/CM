-- Drop the unused `notes` plain-text column from clients.
-- All client notes live in the client_notes table.
ALTER TABLE clients DROP COLUMN IF EXISTS notes;

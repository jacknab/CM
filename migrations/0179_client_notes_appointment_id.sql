-- Migration 0179: client_notes.appointment_id
--
-- Adds a nullable link from a client_notes row back to the appointment it
-- was generated for. Used by the new automatic visit-notes system: after
-- every completed appointment, one "visit_auto" note is inserted here so an
-- AI-generated client profile summary can be built from accumulated visit
-- history. The unique index makes that insert idempotent (a repeat
-- "completed" write for the same appointment never creates a duplicate
-- visit note) — Postgres unique indexes ignore NULLs, so this has no effect
-- on the pre-existing manual/general notes, which never set this column.

ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS appointment_id integer REFERENCES appointments(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS client_notes_appointment_id_key ON client_notes(appointment_id);

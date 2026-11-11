-- Quick Notes after checkout (owner, 2026-11-11; shared/quickNotes.ts, routes/quickNotes.ts). Its own table because
-- client_notes allows one row per appointment (taken by the automatic visit note). Each Quick Note also writes one
-- client_notes row (note_type 'quick_note', client_note_id here) so it shows in every existing client notes list.
-- details: { template, choices, extra, services, remember } - remember = the choices that carry forward.
CREATE TABLE IF NOT EXISTS client_quick_notes (
  id serial PRIMARY KEY,
  store_id integer NOT NULL REFERENCES locations(id),
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  appointment_id integer REFERENCES appointments(id) ON DELETE SET NULL,
  staff_id integer,
  created_by_user_id text,
  template text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  note_text text NOT NULL,
  client_note_id integer REFERENCES client_notes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS client_quick_notes_appointment_key ON client_quick_notes (appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS client_quick_notes_client_idx ON client_quick_notes (client_id, created_at DESC);

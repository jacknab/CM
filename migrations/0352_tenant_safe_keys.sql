-- PROPOSED rev 2 (Last Cut Formula Engine) - NOT APPLIED. Renumber to the next free numbers at implementation.
-- Composite keys so new tables can reference (id, store_id) together: a row can then never point at a client, barber,
-- ticket or Quick Note of another store. Additive only: no existing row, column or constraint changes.
-- Sizes on 2026-11-12: clients 218, staff 256, appointments 402, client_quick_notes 4 rows.
-- Runner safety: every statement is idempotent. No semicolons inside quoted text.

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL OR to_regclass('public.staff') IS NULL
     OR to_regclass('public.appointments') IS NULL OR to_regclass('public.client_quick_notes') IS NULL THEN
    RAISE EXCEPTION 'LCF 0352: prerequisite table missing (clients, staff, appointments, client_quick_notes)';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS clients_id_store_uidx ON clients (id, store_id);
CREATE UNIQUE INDEX IF NOT EXISTS staff_id_store_uidx ON staff (id, store_id);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_id_store_uidx ON appointments (id, store_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_quick_notes_id_store_uidx ON client_quick_notes (id, store_id);

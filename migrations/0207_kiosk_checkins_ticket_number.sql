-- A walk-in check-in (kiosk_checkins with no appointment_id yet) previously had no short,
-- per-store, human-typeable identifier — only its raw `id`, a platform-wide sequence shared
-- across every store, which risks coincidentally colliding with an unrelated appointment's
-- ticket_number at the same store. This reuses the exact same per-store counter appointments
-- already use (locations.next_ticket_number / storage.getNextTicketNumber), assigning it at
-- check-in time instead of waiting for a ticket to be created. When a ticket later gets created
-- from this marker, the number is carried forward rather than a new one being minted, so a walk-in
-- has exactly one ticket number for its whole visit.
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS ticket_number integer;

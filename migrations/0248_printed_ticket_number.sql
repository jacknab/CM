-- The ticket number printed on a client's slip / receipt while the salon was offline, kept when the server
-- had to give the ticket a different number (another ticket already had it). A lookup by the printed number
-- still finds the ticket. Empty for nearly every ticket: offline numbers are normally kept as they are.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS printed_ticket_number INTEGER;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS printed_ticket_number INTEGER;
CREATE INDEX IF NOT EXISTS appointments_store_printed_ticket_idx ON appointments (store_id, printed_ticket_number) WHERE printed_ticket_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS kiosk_checkins_store_printed_ticket_idx ON kiosk_checkins (store_id, printed_ticket_number) WHERE printed_ticket_number IS NOT NULL;

-- A /nail ticket with more than one service is saved as one ticket per service.
-- Tickets made together share ticket_group_id (the id of the first one) so the
-- screens can show them as one visit and pay them together.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ticket_group_id INTEGER;
CREATE INDEX IF NOT EXISTS appointments_ticket_group_idx ON appointments (ticket_group_id) WHERE ticket_group_id IS NOT NULL;

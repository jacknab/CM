-- 0263_nail_ringing_up.sql
-- /nail POS, one server-first POS (2026-10-28): a ticket exists on the server from the first key tapped, so every
-- POS station sees it while it is being rung up. Until SAVE it is not given to TURN and the waiting-ticket matcher
-- leaves it alone. NULL = a normal (saved) ticket.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ringing_up_since TIMESTAMPTZ;

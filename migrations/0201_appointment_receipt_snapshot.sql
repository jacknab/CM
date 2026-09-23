-- 0201_appointment_receipt_snapshot.sql
--
-- The Nail POS's "Text Receipt" button (checkout, once a ticket is paid in full) sends the client a link to a public,
-- read-only web receipt (certxa.com/receipt/<manage_token> — the same per-appointment token already used for "manage
-- my booking" links; no new token column needed). The link has to keep showing the SAME numbers no matter what
-- happens to the appointment afterward, so what was charged is stored as a snapshot at send time rather than
-- reconstructed from the appointment's live columns later.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS receipt_snapshot JSONB;

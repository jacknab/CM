-- The Online Check-In Line for barbershops and haircut studios (plans/online-checkin-line.md, 2026-11-03). A client who
-- joins the line from their phone is a check-in like any other (kiosk_checkins), so every screen shows one line.
--   source              'online' for a phone check-in (NULL: the kiosk, the front desk, the POS)
--   arrived_at          an online client said "I'm here" or checked in at the shop (in-shop check-ins are here already)
--   preferred_staff_id  the barber the client asked for (the shop allows choosing); NULL = any barber
--   party_token         the people who joined together (one spot each)
--   wait_promised_min   the wait shown when they joined (estimate accuracy report)
--   leave_text_at / up_text_at   the "head over now" and "you're up" texts went out
--   late_stage          0 on time · 1 skipped and held · 2 moved back once (removed after that)
--   held_until          a late client's place is kept until then
--   removed_reason      'late', 'left' (the client left the line), 'shop' (the front desk took them off)
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS preferred_staff_id INTEGER;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS party_token TEXT;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS wait_promised_min INTEGER;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS leave_text_at TIMESTAMPTZ;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS up_text_at TIMESTAMPTZ;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS late_stage SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS held_until TIMESTAMPTZ;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS removed_reason TEXT;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS kiosk_checkins_token_idx ON kiosk_checkins (token);
CREATE INDEX IF NOT EXISTS kiosk_checkins_online_open_idx ON kiosk_checkins (store_id, created_at)
  WHERE source = 'online' AND appointment_id IS NULL AND status IN ('waiting', 'called');

-- 0166_booking_controls_settings.sql
--
-- New Booking Controls settings, modelled on the GlossGenius "Booking Controls"
-- page. All live on the location row alongside the existing online-booking
-- policy cluster (booking_payment_policy, allow_online_cancellation, …) and are
-- served/edited through /api/booking-policies.
--
-- - online_booking_mode         : who may book online — 'all' | 'existing' | 'off'
-- - advance_booking_enabled     : cap how far ahead clients can book online
-- - advance_booking_months      : the cap, in months from today (when enabled)
-- - online_waitlist_enabled     : show a "join the waitlist" option on the public
--                                  booking page when a preferred time is full.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS online_booking_mode      text    NOT NULL DEFAULT 'all';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS advance_booking_enabled  boolean NOT NULL DEFAULT false;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS advance_booking_months   integer NOT NULL DEFAULT 3;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS online_waitlist_enabled  boolean NOT NULL DEFAULT false;

-- Fold any NULLs that slipped in before the NOT NULL default took (defensive).
UPDATE locations SET online_booking_mode           = 'all'  WHERE online_booking_mode IS NULL;
UPDATE locations SET advance_booking_months        = 3      WHERE advance_booking_months IS NULL OR advance_booking_months < 1;

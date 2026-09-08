-- 0161_cancellation_policy_and_ban_list.sql
--
-- Online-booking cancellation policy controls + a per-store booking ban list.
-- Surfaced on the Booking Policies settings page; enforced in the public
-- booking flow (POST /api/public/store/:slug/book) and the public cancel
-- endpoint (POST /api/appointments/confirmation/:num/cancel).
--
-- - allow_online_cancellation      : hide/disable the customer "cancel" action
-- - cancellation_policy_required   : force an acknowledgement checkbox at booking
-- - cancellation_policy_text       : the policy shown to customers
-- - cancellation_fee_type / _value : % of service price charged to the card on
--                                    file when a customer cancels inside the
--                                    cancellation window
-- booking_ban_list                 : phone numbers blocked from ONLINE booking

ALTER TABLE locations ADD COLUMN IF NOT EXISTS allow_online_cancellation    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cancellation_policy_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cancellation_policy_text     TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cancellation_fee_type        TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cancellation_fee_value       NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS booking_ban_list (
    id          SERIAL PRIMARY KEY,
    store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    phone_e164  TEXT NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_ban_list_store_phone_udx
    ON booking_ban_list (store_id, phone_e164);

-- Phone numbers an account owner has proved they call from (owner, 2026-11-11). When Marel verifies an owner calling from
-- a number that isn't the mobile on file (the texted code), the number is kept here with their name and store, and on
-- later calls Tom and Marel recognise it like the mobile on file. One row per number and store.
CREATE TABLE IF NOT EXISTS verified_caller_numbers (
  id                serial PRIMARY KEY,
  phone_e164        text NOT NULL,
  store_id          integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id           varchar,
  name              text,
  verified_via      text NOT NULL,          -- 'sms_code'
  verified_by       text NOT NULL,          -- 'marel'
  call_sid          text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_verified_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_e164, store_id)
);
CREATE INDEX IF NOT EXISTS verified_caller_numbers_phone ON verified_caller_numbers (phone_e164);

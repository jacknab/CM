-- Solo plan: where the professional sees clients, house calls, and booking approval
-- (plans/solo-work-places-and-approval.md). Every default keeps today's behaviour.

-- Where the business sees clients.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS own_place TEXT NOT NULL DEFAULT 'salon';            -- 'salon' (public address) | 'home' (private) | 'none' (house calls only)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS house_calls BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS house_call_radius_miles INTEGER NOT NULL DEFAULT 15; -- from the business (base) address
ALTER TABLE locations ADD COLUMN IF NOT EXISTS house_call_fee NUMERIC(10,2) NOT NULL DEFAULT 0;     -- flat, added to every house call
ALTER TABLE locations ADD COLUMN IF NOT EXISTS house_call_travel_minutes INTEGER NOT NULL DEFAULT 15; -- kept free before and after a house call
-- Online bookings: accepted at once ('auto') or sent to the professional as requests ('manual').
ALTER TABLE locations ADD COLUMN IF NOT EXISTS booking_approval TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS booking_request_expiry_hours INTEGER NOT NULL DEFAULT 48;

-- Where a service is offered: at the professional's place, at the client's place, or either.
ALTER TABLE services ADD COLUMN IF NOT EXISTS offered_at TEXT NOT NULL DEFAULT 'any';               -- 'place' | 'client' | 'any'

-- Where a visit happens, and for a house call the client's address and the travel fee.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS visit_at TEXT NOT NULL DEFAULT 'place';            -- 'place' | 'client'
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_address JSONB;                              -- { line1, line2?, city, state, postcode, lat?, lng? }
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS travel_fee NUMERIC(10,2);

-- A client's address, kept for their next house call.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address JSONB;

-- A booking waiting for the professional's approval. Not an appointment: many queries count every
-- non-cancelled appointment as a real booking, so a request only becomes one when it's approved.
CREATE TABLE IF NOT EXISTS booking_requests (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES locations(id),
  client_id       INTEGER,
  client_name     TEXT NOT NULL,
  client_phone    TEXT,
  client_email    TEXT,
  staff_id        INTEGER,
  service_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- the service and its add-ons, as the booking page sent them
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- everything else the booking would have been made with
  starts_at       TIMESTAMPTZ NOT NULL,                 -- the time the client asked for
  duration        INTEGER NOT NULL,
  visit_at        TEXT NOT NULL DEFAULT 'place',
  client_address  JSONB,
  travel_fee      NUMERIC(10,2),
  notes           TEXT,
  -- requested → approved | offered | declined | expired; offered → booked | expired
  status          TEXT NOT NULL DEFAULT 'requested',
  offer_token     TEXT UNIQUE,                          -- the client's link to the offered times
  offered_times   JSONB,                                -- [iso start, ...] the professional can do instead
  appointment_id  INTEGER,                              -- the booking it became
  expires_at      TIMESTAMPTZ NOT NULL,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_requests_store_status_idx ON booking_requests (store_id, status);

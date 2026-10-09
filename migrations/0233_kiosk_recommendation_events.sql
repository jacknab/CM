-- Smart Check-In: every suggestion the kiosk made during a check-in that produced a ticket, and whether the
-- client took it. Joined to the ticket (appointment_id), so results are measured on completed, paid tickets
-- rather than on taps at the kiosk.
CREATE TABLE IF NOT EXISTS kiosk_recommendation_events (
  id             serial PRIMARY KEY,
  store_id       integer NOT NULL,
  client_id      integer,
  appointment_id integer,
  kind           text NOT NULL,      -- 'service' | 'addon'
  item_id        integer NOT NULL,   -- services.id or addons.id
  accepted       boolean NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiosk_recommendation_events_store_idx ON kiosk_recommendation_events (store_id, created_at);
CREATE INDEX IF NOT EXISTS kiosk_recommendation_events_appt_idx ON kiosk_recommendation_events (appointment_id);

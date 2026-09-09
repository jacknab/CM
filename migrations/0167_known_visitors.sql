-- Returning-visitor ledger for the Real-Time Website Visitors dashboard.
-- One row per stable marketing-site visitor id (certxa_vid localStorage uuid),
-- written by the live-chat visitor/ping beacon. Lets the dashboard tell a
-- brand-new visitor from one who has been on the site before.
-- (routes/liveChat.ts also creates this lazily via CREATE TABLE IF NOT EXISTS.)

CREATE TABLE IF NOT EXISTS known_visitors (
  visitor_id  text PRIMARY KEY,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  visits      integer     NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS known_visitors_last_seen_idx ON known_visitors (last_seen);

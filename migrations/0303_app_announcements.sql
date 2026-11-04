-- App announcements (owner, 2026-11-04): a short message an admin schedules in /isAdmin › App Announcements, sent as a
-- push notification to every phone with the Certxa Pro app signed in (owner_push_devices) at send_at
-- (lib/appAnnouncements.ts).
CREATE TABLE IF NOT EXISTS app_announcements (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  send_at     TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | sending | sent | canceled | failed
  sent_count  INTEGER,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS app_announcements_due_idx ON app_announcements (status, send_at);

-- What a service includes, one line per bullet, for the kiosk Order Board's service screen (owner, 2026-11-16).
ALTER TABLE services ADD COLUMN IF NOT EXISTS kiosk_includes text;

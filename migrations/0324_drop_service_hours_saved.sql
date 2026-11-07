-- The Certxa Pro "Available for services" hours grid was a test and is removed (owner, 2026-11-07). Its put-aside grid
-- (migration 0319) goes with it. The one saved value (store 41) is in /root/service-hours-saved-backup-2026-11-07.json.
ALTER TABLE locations DROP COLUMN IF EXISTS service_hours_saved;

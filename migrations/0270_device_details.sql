-- Back office POS tab (2026-10-30): what support needs to help with a salon's devices — the address each device last
-- reached the server from, what it is (browser / app), which screen and station it was on, and the Certxa app build.
ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS last_ip text;
ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS page text;
ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS register_id integer;
ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS app_build text;
ALTER TABLE frontdesk_screens ADD COLUMN IF NOT EXISTS last_ip text;
ALTER TABLE frontdesk_screens ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS last_ip text;

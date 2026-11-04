-- When the pro last used the Certxa Pro app (owner, 2026-11-04): stamped at most hourly by any app request
-- (middleware/permissions.ts). Plus calling (lib/plusLine.ts) gives a busy signal for a pro not seen in 30 days.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS pro_app_seen_at TIMESTAMPTZ;
UPDATE locations l SET pro_app_seen_at = d.seen
  FROM (SELECT store_id, MAX(last_seen_at) AS seen FROM owner_push_devices GROUP BY store_id) d
 WHERE d.store_id = l.id AND l.pro_app_seen_at IS NULL;

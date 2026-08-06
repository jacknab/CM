-- Add archive and block support to sms_contact_routing
ALTER TABLE sms_contact_routing
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_at  timestamptz;

CREATE INDEX IF NOT EXISTS sms_routing_archived_idx ON sms_contact_routing (store_id, archived_at);
CREATE INDEX IF NOT EXISTS sms_routing_blocked_idx  ON sms_contact_routing (store_id, blocked_at);

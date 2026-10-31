-- When the salon owner was last told by text and e-mail that staff hit a blocked page (owner, 2026-10-31).
-- The blocked screen asks for a notice every time it opens; this keeps it to one per salon per hour.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS blocked_notice_at TIMESTAMPTZ;

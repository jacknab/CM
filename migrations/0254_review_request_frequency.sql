-- 0254_review_request_frequency.sql
--
-- How often a client is texted a review request (owner, 2026-10-22): every Nth visit, counted from the last
-- review text they were sent (1 = every visit). Texting a regular client after every visit is too much;
-- the default is every 3rd visit. A client never asked before is asked after their first visit.

ALTER TABLE sms_settings ADD COLUMN IF NOT EXISTS review_request_every_visits INTEGER NOT NULL DEFAULT 3;

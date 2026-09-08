-- Collapse drifted appointment status values onto the canonical set:
--   pending | confirmed | started | completed | cancelled | no_show
-- "Booked" keeps the stored token `pending` (label/behaviour change only),
-- so there is no pending -> booked rewrite here.

UPDATE appointments SET status = 'confirmed' WHERE status = 'checked_in';
UPDATE appointments SET status = 'no_show'   WHERE status = 'no-show';
UPDATE appointments SET status = 'started'   WHERE status = 'in_progress';
UPDATE appointments SET status = 'completed' WHERE status IN ('finished', 'done');

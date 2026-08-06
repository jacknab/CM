-- Run this on the VPS database BEFORE running drizzle-kit push
-- It removes appointments whose customer_id has no matching record in clients
-- (caused by the customers → clients table migration leaving stale FK references)

BEGIN;

-- Preview what will be deleted
SELECT id, customer_id, date, status
FROM appointments
WHERE customer_id IS NOT NULL
  AND customer_id NOT IN (SELECT id FROM clients);

-- Delete orphaned appointments
DELETE FROM appointments
WHERE customer_id IS NOT NULL
  AND customer_id NOT IN (SELECT id FROM clients);

COMMIT;

ALTER TABLE locations
ADD COLUMN IF NOT EXISTS "aiR_minutes" INTEGER;

UPDATE locations
SET "aiR_minutes" = 99999
WHERE lower(name) IN ('jim', 'jims', 'jim''s')
   OR id = 2;

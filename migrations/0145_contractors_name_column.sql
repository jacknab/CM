-- Add missing `name` column to contractors table.
-- The Drizzle schema defines name TEXT NOT NULL DEFAULT '' but this column
-- was never applied to the live DB, causing schema drift warnings on startup
-- and query failures when contractors rows are selected with explicit column lists.

ALTER TABLE contractors ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

-- Back-fill existing rows: derive name from first_name + last_name so the column
-- is never empty for existing contractors.
UPDATE contractors
SET    name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
WHERE  name = '';

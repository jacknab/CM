-- Remove the SERIAL id column from schema_migrations and promote filename to PRIMARY KEY.
-- The id column was never used by the migration runner (all queries use filename only).
-- The sequence schema_migrations_id_seq that comes with SERIAL causes drizzle-kit push
-- to fail on every deploy because the sequence is not part of the Drizzle schema.
-- After this migration runs, the sequence is gone and drizzle-kit push is clean.

ALTER TABLE schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_pkey;
ALTER TABLE schema_migrations DROP COLUMN IF EXISTS id;
ALTER TABLE schema_migrations ADD PRIMARY KEY (filename);

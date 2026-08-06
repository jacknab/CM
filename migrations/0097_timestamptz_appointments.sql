-- Migration 0097: Convert appointment timestamp columns to TIMESTAMPTZ
--
-- Safety analysis:
--   All appointment times are written via fromZonedTime() (date-fns-tz), which
--   converts salon-local input → UTC before storage. The existing TIMESTAMP
--   WITHOUT TIME ZONE values therefore represent UTC instants stored without
--   an explicit zone marker.
--
--   Using `AT TIME ZONE 'UTC'` in the USING clause instructs PostgreSQL to
--   interpret each stored value as UTC and produce the correct TIMESTAMPTZ.
--   No data is modified — only the column type changes.
--
-- This migration is safe to apply to existing production data.
-- Historical appointments created before this migration are unaffected because
-- the API has always normalised input through fromZonedTime() before insertion.

ALTER TABLE appointments
  ALTER COLUMN date          TYPE TIMESTAMPTZ USING date          AT TIME ZONE 'UTC',
  ALTER COLUMN started_at    TYPE TIMESTAMPTZ USING started_at    AT TIME ZONE 'UTC',
  ALTER COLUMN completed_at  TYPE TIMESTAMPTZ USING completed_at  AT TIME ZONE 'UTC',
  ALTER COLUMN checked_in_at TYPE TIMESTAMPTZ USING checked_in_at AT TIME ZONE 'UTC';

-- Migration: give contractors.name a default empty string so existing code
-- that omits the column never triggers a NOT NULL violation.
-- The application code now always sets name explicitly, but this default
-- acts as a permanent safety net for any future insert path that misses it.

ALTER TABLE contractors ALTER COLUMN name SET DEFAULT '';

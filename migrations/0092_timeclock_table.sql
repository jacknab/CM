-- Migration 0092: create the timeclock table (staff clock-in / clock-out)
-- This table tracks when staff members clock in and out each work day.
-- It was defined in shared/schema.ts but never got a numbered migration file,
-- so VPS deployments using the migration runner did not have the table.

CREATE TABLE IF NOT EXISTS timeclock (
  id          SERIAL PRIMARY KEY,
  staff_id    INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  clock_in    TIMESTAMP NOT NULL DEFAULT NOW(),
  clock_out   TIMESTAMP,
  work_date   TEXT NOT NULL,            -- 'YYYY-MM-DD' in the store's local date
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tc_staff_date_idx ON timeclock (staff_id, work_date);
CREATE INDEX IF NOT EXISTS tc_store_date_idx  ON timeclock (store_id,  work_date);

-- 0198_quick_area_codes.sql
--
-- Quick Area Codes: the three area codes a salon chooses for the phone keypads on the Nail POS
-- (tap "720" instead of typing 7-2-0). Per store, chosen by the salon only — never derived from
-- location or client history. JSON array of exactly three strings, "" = button left unconfigured.
-- NULL = the salon has never configured it (the buttons show blank).

ALTER TABLE locations ADD COLUMN IF NOT EXISTS quick_area_codes JSONB;

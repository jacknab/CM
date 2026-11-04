-- Where a house-call distance is measured from (owner, 2026-11-04): the pro's exact street address, placed by the same
-- geocoder as the client's address. { "for": the address it was looked up for, "lat", "lng" }; looked up again when the
-- address changes. store_latitude/longitude can be up to a mile or two out (OpenStreetMap, saved for the time zone).
ALTER TABLE locations ADD COLUMN IF NOT EXISTS house_call_base JSONB;

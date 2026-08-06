-- Fix dayOfWeek convention mismatch.
-- The booking UI saved Mon=0…Sun=6 but every backend reader uses JS Date.getDay()
-- which is Sun=0, Mon=1…Sat=6.
-- Transform existing rows: new_dow = (old_dow + 1) % 7
--   Old Mon=0 → New Mon=1
--   Old Tue=1 → New Tue=2
--   Old Wed=2 → New Wed=3
--   Old Thu=3 → New Thu=4
--   Old Fri=4 → New Fri=5
--   Old Sat=5 → New Sat=6
--   Old Sun=6 → New Sun=0
UPDATE business_hours
SET day_of_week = (day_of_week + 1) % 7;

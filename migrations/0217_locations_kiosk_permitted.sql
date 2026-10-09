-- Kiosk permission, set by a platform admin on the /isadmin Accounts page.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   locations.kiosk_permitted   1 = this account may use the self check-in kiosk, 0 = it may not.
--                               New accounts start at 0. This is separate from the owner on/off
--                               switch for the kiosk (kiosk settings), which only applies when
--                               the account is permitted at all.
--
-- The Android app never stores this value. It asks the server every time the tablet is turned to
-- portrait, at every launch, and once a day while it is running in kiosk mode.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS kiosk_permitted integer NOT NULL DEFAULT 0;

-- Accounts that already existed when this was introduced keep their kiosk.
UPDATE locations SET kiosk_permitted = 1 WHERE id IN (2, 15) AND kiosk_permitted = 0;

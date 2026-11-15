-- Kiosk Order Board (owner, 2026-11-15): a coloured label on a service's photo ("Acrylic Full Set") and a line under
-- a category's name ("Full nail sets with simple, beautiful designs.").
ALTER TABLE services ADD COLUMN IF NOT EXISTS kiosk_badge TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS kiosk_badge_color TEXT;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS description TEXT;

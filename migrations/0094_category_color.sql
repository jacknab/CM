-- Add calendar card color to service categories
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS color text;

-- Add target float to locations for register day-close bank deposit calculation
ALTER TABLE locations ADD COLUMN IF NOT EXISTS register_target_float NUMERIC(10,2) DEFAULT NULL;

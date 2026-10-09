-- Certxa Rentals — Space Base Rate Period (Phase 8)
--
-- Add a numeric "Every ___ days" field to Spaces, replacing the monthly-only assumption.
-- Existing spaces default to 30 days (monthly) for backward compatibility.
-- The field applies to Spaces only; rental agreements keep their own rentFrequency.

ALTER TABLE rental_spaces
ADD COLUMN base_rate_period_days INTEGER NOT NULL DEFAULT 30;

-- Add a check constraint to ensure the period is reasonable (1-365 days)
ALTER TABLE rental_spaces
ADD CONSTRAINT chk_rental_spaces_base_rate_period_days
CHECK (base_rate_period_days >= 1 AND base_rate_period_days <= 365);

-- Create an index for efficient filtering by period
CREATE INDEX idx_rental_spaces_base_rate_period_days ON rental_spaces(base_rate_period_days);
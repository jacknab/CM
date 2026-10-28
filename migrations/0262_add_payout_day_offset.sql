-- 0262_add_payout_day_offset.sql
-- Adds payout_day_offset to pay_schedules so salon owners can configure
-- when payouts are executed relative to the period end (e.g. "pay 2 days
-- after the period closes"). A value of 0 means "same day as period end".
ALTER TABLE pay_schedules
  ADD COLUMN IF NOT EXISTS payout_day_offset integer NOT NULL DEFAULT 0;
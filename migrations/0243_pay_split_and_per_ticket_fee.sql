-- Paying technicians part by check, part in cash: the share of each paycheck paid by check (100 = all by
-- check, which is every salon until it changes it). The cash part is kept on the line when it is worked out.
ALTER TABLE pay_schedules ADD COLUMN IF NOT EXISTS check_percent INTEGER NOT NULL DEFAULT 100;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS cash_portion NUMERIC(10,2) NOT NULL DEFAULT 0;

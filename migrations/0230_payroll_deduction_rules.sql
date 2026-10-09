-- Payroll: recurring deductions. The salon's saved deduction rules (payout_deduction_rules — made in the
-- setup wizard and on the old Payouts → Deductions page) are applied to every pay period again.
-- A rule for one person now points at the staff member (the old contractors list is frozen).
ALTER TABLE payout_deduction_rules ADD COLUMN IF NOT EXISTS staff_id integer REFERENCES staff(id) ON DELETE CASCADE;
UPDATE payout_deduction_rules r SET staff_id = c.staff_id
  FROM contractors c
 WHERE r.contractor_id = c.id AND r.staff_id IS NULL AND c.staff_id IS NOT NULL;

-- The part of a line's other_deductions that came from those rules (other_deductions stays the total, so
-- check stubs and year-to-date keep adding up), and which rule took how much.
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS rule_deductions numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS rule_deductions_detail jsonb;

-- Payroll deductions: a "card fee on tips" rule (type 'card_tips') is a percentage of each card tip
-- (amount) plus a flat fee per tipped card transaction (per_transaction).
ALTER TABLE payout_deduction_rules ADD COLUMN IF NOT EXISTS per_transaction numeric(10,2) NOT NULL DEFAULT 0;

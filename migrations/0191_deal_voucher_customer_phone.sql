-- 0191_deal_voucher_customer_phone.sql
--
-- Deal-voucher checkout requires a 10-digit mobile number that can receive
-- SMS, but the purchase flow never actually collected or stored it —
-- deal_vouchers only had customer_email/customer_name. This adds the column
-- so the marketplace support agent can look up a caller's voucher by phone
-- (matching how they identify themselves on a call) instead of email.
-- Nullable: existing vouchers were purchased before this field existed and
-- have no phone on file; new purchases populate it (enforced at the
-- checkout API/form level, not a DB constraint, to avoid breaking old rows).

ALTER TABLE deal_vouchers ADD COLUMN IF NOT EXISTS customer_phone TEXT;

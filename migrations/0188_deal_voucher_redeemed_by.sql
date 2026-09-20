-- 0188_deal_voucher_redeemed_by.sql
--
-- Records which staff member's session performed the QR-scan redemption of
-- a deal voucher, for audit purposes (previously only redeemed_at existed,
-- with no record of who actually redeemed it). Nullable: pre-existing rows
-- have no value, and an owner-login session (no staffId) redeeming one also
-- leaves this null.

ALTER TABLE deal_vouchers ADD COLUMN IF NOT EXISTS redeemed_by_staff_id INTEGER REFERENCES staff(id);

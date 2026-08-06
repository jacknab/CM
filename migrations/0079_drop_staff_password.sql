-- Drop staff.password column and the entire staff_password_reset_tokens table.
-- Staff now log in exclusively via phone+OTP (staff_sms_otps).
-- Any remaining hashed values are no longer usable after this migration.

ALTER TABLE staff DROP COLUMN IF EXISTS password;

DROP TABLE IF EXISTS staff_password_reset_tokens;

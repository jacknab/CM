-- Support ticket columns for web contact form submissions
-- On some VPSes support_tickets was created by older runtime code and may not
-- include account_id yet. Ensure it exists before altering nullability.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS account_id INTEGER;

ALTER TABLE support_tickets ALTER COLUMN account_id DROP NOT NULL;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS channel       VARCHAR(16)  NOT NULL DEFAULT 'APP',
  ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_name  VARCHAR(128),
  ADD COLUMN IF NOT EXISTS ip_address     VARCHAR(64);

-- What happened to a paid deposit when the client cancelled online (owner, 2026-11-07). Within the cancellation
-- policy the deposit is refunded automatically; a late cancel or a no-show keeps it.
-- cancelled_in_policy: true = cancelled within the policy, false = late; NULL = not cancelled online.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_in_policy BOOLEAN;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_refunded_cents INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_refund_error TEXT;

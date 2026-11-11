-- Tom's one-line reason when he transfers a caller to Marel (owner, 2026-11-11): she opens with it so the caller never
-- repeats themselves ("Tom mentioned you can't sign in — let's get you back in").
ALTER TABLE sales_call_logs ADD COLUMN IF NOT EXISTS transfer_reason text;

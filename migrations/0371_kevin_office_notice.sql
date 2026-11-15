-- Kevin e-mails the property's office a notice for every routine (non-emergency) request (owner, 2026-11-15).
ALTER TABLE kevin_incidents ADD COLUMN IF NOT EXISTS office_notice_sent_at timestamptz;
ALTER TABLE kevin_incidents ADD COLUMN IF NOT EXISTS office_notice_error text;

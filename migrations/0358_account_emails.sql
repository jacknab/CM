-- Extra e-mail addresses on an account (owner, 2026-11-13). The sign-up (login) e-mail can never be changed; an owner
-- can add other addresses, and once an added address is confirmed every e-mail Certxa sends to the account also goes
-- there (mail.ts sendEmail; lib/accountEmails.ts).
CREATE TABLE IF NOT EXISTS account_emails (
  id                 serial PRIMARY KEY,
  user_id            varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email              text NOT NULL,
  verified_at        timestamptz,
  verify_token_hash  text,
  verify_expires_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_emails_user_email_uidx ON account_emails (user_id, lower(email));
CREATE INDEX IF NOT EXISTS account_emails_email_idx ON account_emails (lower(email));

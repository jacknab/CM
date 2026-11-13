-- isTeam › Tickets: "Mark as Junk" blocks the sender (owner, 2026-11-13: junked senders kept coming back every day).
-- The e-mail sync drops mail from a blocked address, or from any address at a blocked domain, before it becomes a ticket.
CREATE TABLE IF NOT EXISTS support_email_blocks (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('address', 'domain')),
  value TEXT NOT NULL,
  ticket_id INTEGER,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

-- Every sender already marked as junk.
INSERT INTO support_email_blocks (kind, value, ticket_id, created_by_name)
SELECT 'address', lower(trim(customer_email)), max(id), 'Junk before 2026-11-13'
FROM support_tickets
WHERE category = 'junk' AND channel = 'EMAIL' AND coalesce(trim(customer_email), '') LIKE '%@%'
GROUP BY lower(trim(customer_email))
ON CONFLICT (kind, value) DO NOTHING;

-- And their company domains (e.g. em.linkedin.com → linkedin.com), but never a public mail service, a company Certxa
-- works with (Stripe, Apple, Twilio…: only the junked address), or a domain a Certxa login uses (lib/supportEmailBlocks.ts has the same rules).
INSERT INTO support_email_blocks (kind, value, ticket_id, created_by_name)
SELECT DISTINCT ON (d) 'domain', d, id, 'Junk before 2026-11-13'
FROM (
  SELECT id, substring(lower(split_part(trim(customer_email), '@', 2)) from '([^.]+\.[^.]+)$') AS d
  FROM support_tickets WHERE category = 'junk' AND channel = 'EMAIL' AND coalesce(trim(customer_email), '') LIKE '%@%'
) j
WHERE d IS NOT NULL
  AND d NOT IN ('gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com',
    'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','comcast.net','att.net','sbcglobal.net',
    'verizon.net','cox.net','charter.net','earthlink.net','gmx.com','mail.com','yandex.com','zoho.com','certxa.com',
    'apple.com','stripe.com','link.com','zendesk.com','twilio.com','taxbandits.com','taxbandits.io','intuit.com','google.com','openai.com','mailgun.com','mailgun.net','namecheap.com','privateemail.com','expo.dev','github.com','paypal.com','squareup.com','ups.com','godaddy.com','cloudflare.com','anthropic.com','microsoft.com','facebookmail.com','meta.com')
  AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) LIKE '%@' || j.d OR lower(u.email) LIKE '%.' || j.d)
ORDER BY d, id DESC
ON CONFLICT (kind, value) DO NOTHING;

-- Open tickets from those senders are closed as junk, as a new "Mark as Junk" does.
UPDATE support_tickets t SET status = 'closed', category = 'junk', closed_at = now(), updated_at = now()
WHERE t.channel = 'EMAIL' AND t.status NOT IN ('closed', 'resolved')
  AND EXISTS (
    SELECT 1 FROM support_email_blocks b
    WHERE (b.kind = 'address' AND b.value = lower(trim(t.customer_email)))
       OR (b.kind = 'domain' AND (split_part(lower(trim(t.customer_email)), '@', 2) = b.value
                                  OR split_part(lower(trim(t.customer_email)), '@', 2) LIKE '%.' || b.value))
  );

/**
 * isTeam › Tickets: blocked e-mail senders (migration 0362). "Mark as Junk" on an e-mail ticket blocks its sender's
 * address and, for a company domain, the whole domain (em.linkedin.com → linkedin.com); the e-mail sync then drops
 * their mail before it becomes, or reopens, a ticket. Taking "junk" off the ticket lifts the block.
 * Never blocked as a domain: public mail services (real clients write from them), companies Certxa works with (Stripe,
 * Apple, Twilio…) and domains a Certxa login uses.
 */
import { pool } from "../db";

const PUBLIC_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "comcast.net", "att.net", "sbcglobal.net",
  "verizon.net", "cox.net", "charter.net", "earthlink.net", "gmx.com", "mail.com", "yandex.com", "zoho.com", "certxa.com",
]);
/** Companies Certxa works with: a junked newsletter blocks that address only, so their account mail still arrives. */
const VENDORS = new Set([
  "apple.com", "stripe.com", "link.com", "zendesk.com", "twilio.com", "taxbandits.com", "taxbandits.io", "intuit.com", "google.com", "openai.com", "mailgun.com", "mailgun.net", "namecheap.com", "privateemail.com", "expo.dev", "github.com", "paypal.com", "squareup.com", "ups.com", "godaddy.com", "cloudflare.com", "anthropic.com", "microsoft.com", "facebookmail.com", "meta.com",
]);

const clean = (email: string) => email.trim().toLowerCase();

/** The company domain of an address: its last two labels (mail.instagram.com → instagram.com). */
export function baseDomain(email: string): string | null {
  const host = clean(email).split("@")[1] ?? "";
  const m = host.match(/([^.]+\.[^.]+)$/);
  return m ? m[1] : null;
}

/** The domain to block with an address, or null when the domain can't be blocked. */
async function blockableDomain(email: string): Promise<string | null> {
  const d = baseDomain(email);
  if (!d || PUBLIC_MAIL.has(d) || VENDORS.has(d)) return null;
  const used = await pool.query(`SELECT 1 FROM users WHERE lower(email) LIKE '%@' || $1 OR lower(email) LIKE '%.' || $1 LIMIT 1`, [d]);
  return used.rows.length ? null : d;
}

/** True when mail from this address must not become a ticket. */
export async function isBlockedSender(email: string): Promise<boolean> {
  const addr = clean(email);
  const host = addr.split("@")[1] ?? "";
  const r = await pool.query(
    `SELECT 1 FROM support_email_blocks
     WHERE (kind = 'address' AND value = $1) OR (kind = 'domain' AND ($2 = value OR $2 LIKE '%.' || value)) LIMIT 1`,
    [addr, host],
  );
  return r.rows.length > 0;
}

/**
 * Blocks a junk ticket's sender and closes their other open tickets as junk. Returns what was blocked and how many
 * other tickets were closed.
 */
export async function blockJunkSender(ticketId: number, byName: string | null): Promise<{ address: string; domain: string | null; closed: number } | null> {
  const t = await pool.query(`SELECT customer_email FROM support_tickets WHERE id = $1 AND channel = 'EMAIL'`, [ticketId]);
  const email = t.rows[0]?.customer_email;
  if (!email || !String(email).includes("@")) return null;
  const address = clean(email);
  const domain = await blockableDomain(address);
  await pool.query(
    `INSERT INTO support_email_blocks (kind, value, ticket_id, created_by_name) VALUES ('address', $1, $2, $3) ON CONFLICT (kind, value) DO NOTHING`,
    [address, ticketId, byName],
  );
  if (domain) {
    await pool.query(
      `INSERT INTO support_email_blocks (kind, value, ticket_id, created_by_name) VALUES ('domain', $1, $2, $3) ON CONFLICT (kind, value) DO NOTHING`,
      [domain, ticketId, byName],
    );
  }
  const closed = await pool.query(
    `UPDATE support_tickets SET status = 'closed', category = 'junk', closed_at = now(), updated_at = now()
     WHERE id <> $1 AND channel = 'EMAIL' AND status NOT IN ('closed', 'resolved')
       AND (lower(trim(customer_email)) = $2
            OR ($3::text IS NOT NULL AND (split_part(lower(trim(customer_email)), '@', 2) = $3 OR split_part(lower(trim(customer_email)), '@', 2) LIKE '%.' || $3)))`,
    [ticketId, address, domain],
  );
  return { address, domain, closed: closed.rowCount ?? 0 };
}

/** Lifts the block a junk ticket put on its sender (the ticket was taken out of junk). */
export async function unblockSender(ticketId: number): Promise<void> {
  const t = await pool.query(`SELECT customer_email FROM support_tickets WHERE id = $1`, [ticketId]);
  const email = t.rows[0]?.customer_email;
  if (!email) return;
  await pool.query(
    `DELETE FROM support_email_blocks WHERE (kind = 'address' AND value = $1) OR (kind = 'domain' AND value = $2)`,
    [clean(email), baseDomain(email)],
  );
}

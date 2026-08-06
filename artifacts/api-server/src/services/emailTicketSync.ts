/**
 * services/emailTicketSync.ts
 *
 * Background IMAP poller: connects to support@certxa.com (Namecheap Private Email),
 * polls for unread messages every 20 seconds, and converts them into support_tickets
 * + support_ticket_messages rows. Replies are threaded to existing tickets.
 *
 * Requires IMAP_PASSWORD env var. Gracefully no-ops if missing.
 */

import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import { pool, waitForDb } from "../db";
import { broadcastToAgents } from "../routes/liveChat";

const IMAP_HOST     = "mail.privateemail.com";
const IMAP_PORT     = 993;
const IMAP_USER     = "support@certxa.com";
const POLL_INTERVAL = 300_000;
// Used by cleanBody to cap the stored description length
const MAX_BODY_BYTES = 150_000;

let running = false;

function log(msg: string) {
  console.log(`[EmailSync] ${msg}`);
}
function logError(msg: string, err?: unknown) {
  const errMsg = err instanceof Error ? err.message : String(err ?? "");
  console.error(`[EmailSync] ${msg}${errMsg ? ": " + errMsg : ""}`);
}

function extractAddress(addr: AddressObject | AddressObject[] | undefined): string {
  const first = Array.isArray(addr) ? addr[0] : addr;
  return first?.value?.[0]?.address ?? "";
}

function extractName(addr: AddressObject | AddressObject[] | undefined): string {
  const first = Array.isArray(addr) ? addr[0] : addr;
  return first?.value?.[0]?.name ?? first?.value?.[0]?.address ?? "Customer";
}

function cleanSubject(subject: string): string {
  return subject.replace(/^(Re:|Fwd?:|FW:)\s*/gi, "").trim();
}

/**
 * Strips HTML markup from an email body and returns clean plain text.
 *
 * Handles:
 * - Removes <style>, <script>, <head> blocks entirely
 * - Removes elements hidden via inline CSS (display:none / visibility:hidden)
 * - Removes empty block elements (<div></div>, <p></p>, etc.)
 * - Collapses multiple consecutive <br> tags into a single newline
 * - Converts block-level elements to newlines to preserve paragraph structure
 * - Strips all remaining HTML tags
 * - Decodes HTML entities
 * - Normalises whitespace and removes excessive blank lines
 */
export function stripHtml(html: string): string {
  return html
    // Drop entire style / script / head blocks (no content worth keeping)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    // Drop elements that are visually hidden in email clients
    .replace(/<[^>]+style=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["'][^>]*>[\s\S]*?<\/[a-zA-Z]+>/gi, "")
    // Drop base64 inline images before stripping tags
    .replace(/src=["'][^"']*base64[^"']*["']/gi, 'src=""')
    // Strip inline style attributes — they're noise in plain text output
    .replace(/\s+style=["'][^"']*["']/gi, "")
    // Multiple consecutive <br> tags → single newline
    .replace(/(<br\s*\/?>[\s\n\r]*){2,}/gi, "\n")
    // Remove genuinely empty block elements before the block→newline pass
    .replace(/<(p|div|span|td|th)[^>]*>(\s|&nbsp;)*<\/\1>/gi, "")
    // Block-level elements → newlines so paragraph structure is preserved
    .replace(/<\/?(p|div|br|li|ul|ol|tr|td|th|h[1-6]|blockquote|article|section|header|footer)[^>]*>/gi, "\n")
    // Strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-zA-Z]+;/g, " ")
    // Normalise line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Collapse horizontal whitespace (spaces/tabs) on each line to a single space
    .replace(/[ \t]+/g, " ")
    // Remove leading/trailing spaces on individual lines
    .replace(/^ /gm, "")
    .replace(/ $/gm, "")
    // Collapse three or more consecutive blank lines → one blank line
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Normalises a plain-text email body:
 * - Converts \r\n and \r to \n
 * - Converts tabs to spaces
 * - Trims trailing whitespace from each line
 * - Collapses three or more blank lines into one
 */
export function normalizePlainText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    // Trailing spaces per line
    .replace(/[ \t]+$/gm, "")
    // Collapse 3+ blank lines → single blank line
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Removes quoted reply history from the end of an email body.
 *
 * Detects and cuts at:
 * - Gmail / Apple Mail:  "On [date], [person] wrote:"
 * - Outlook separators:  "-----Original Message-----" / "-----Forwarded Message-----"
 * - Outlook header block: "From: sender@example.com" followed within a few
 *   lines by "Sent:", "To:", or "Subject:" (classic Outlook inline reply format)
 * - Underline separators used by some clients: "____…"
 * - Standard ">" quoted lines
 */
export function removeQuotedReplies(text: string): string {
  const lines = text.split("\n");
  let cutIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Gmail / Apple Mail: "On Mon, Jul 19, 2026 at 10:00 AM John wrote:"
    // The pattern spans multiple lines in some clients — handle single-line form
    if (/^On .{5,} wrote:\s*$/i.test(line)) {
      cutIndex = i;
      break;
    }

    // Outlook / Thunderbird separator lines
    if (/^-{3,}\s*(Original|Forwarded)\s+Message\s*-{0,}/i.test(line)) {
      cutIndex = i;
      break;
    }

    // Underline separators used by some email clients (e.g. Outlook web)
    if (/^_{5,}\s*$/.test(line)) {
      cutIndex = i;
      break;
    }

    // Quoted ">" lines
    if (/^>/.test(line)) {
      cutIndex = i;
      break;
    }

    // Outlook-style inline reply header block:
    // "From: John Doe <john@example.com>"
    // "Sent: Monday, July 19, 2026 10:00 AM"
    // "To: support@certxa.com"
    // "Subject: Re: Help needed"
    // Require an @ sign in the From: line to avoid false positives.
    if (/^From:\s+.+@/i.test(line)) {
      // Look ahead up to 6 lines for at least one of Sent/To/Subject
      const lookahead = lines.slice(i + 1, i + 7).map(l => l.trim());
      if (lookahead.some(l => /^(Sent|To|Subject|Date):\s+/i.test(l))) {
        cutIndex = i;
        break;
      }
    }
  }

  return lines.slice(0, cutIndex).join("\n").trim();
}

export function removeSignature(text: string): string {
  const sigMarkers = [
    /^--\s*$/m,
    /^Sent from my /im,
    /^Get Outlook for /im,
    /^Best regards,/im,
    /^Kind regards,/im,
    /^Warm regards,/im,
    /^Thanks,/im,
    /^Thank you,/im,
    /^Sincerely,/im,
    /^Cheers,/im,
    /^Regards,/im,
  ];
  for (const marker of sigMarkers) {
    const match = marker.exec(text);
    if (match && match.index !== undefined) {
      const truncated = text.slice(0, match.index).trim();
      // Only strip the signature if the remaining body has at least 5 characters,
      // to avoid returning an empty or near-empty string for very short messages.
      if (truncated.length >= 5) return truncated;
    }
  }
  return text;
}

/**
 * Extracts a clean, human-readable body from a parsed email.
 *
 * Pipeline:
 *   HTML path  → stripHtml → removeQuotedReplies → removeSignature → final tidy
 *   Text path  → normalizePlainText → removeQuotedReplies → removeSignature → final tidy
 *
 * The result stored in the database should look as if the customer typed the
 * message directly into the support form — no email formatting artifacts, no
 * excessive blank lines, no quoted reply history.
 */
function cleanBody(parsed: ParsedMail): string {
  let body = "";
  if (parsed.html) {
    // Prefer the HTML part — stripping gives cleaner, image-free text than the
    // auto-generated text/plain alternative (which may contain "[image: …]" markers
    // or raw HTML fragments from certain email clients).
    body = stripHtml(parsed.html);
  } else if (parsed.text) {
    body = parsed.text;
    // Catch edge cases where the "plain text" part still contains HTML markup
    if (/<[a-z][^>]{0,100}>/i.test(body)) {
      body = stripHtml(body);
    } else {
      body = normalizePlainText(body);
    }
  }
  body = removeQuotedReplies(body);
  body = removeSignature(body);
  // Strip non-printable control characters (excluding \n and \t)
  body = body.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  // Final normalisation pass: ensure no 3+ consecutive blank lines slipped through
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  if (body.length > MAX_BODY_BYTES) body = body.slice(0, MAX_BODY_BYTES);
  return body;
}

async function ensureProcessedEmailsTable(): Promise<void> {
  await waitForDb("processed-emails");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_emails (
      id          SERIAL PRIMARY KEY,
      message_id  TEXT NOT NULL,
      ticket_id   INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT processed_emails_message_id_key UNIQUE (message_id)
    )
  `);
}

async function isAlreadyProcessed(messageId: string): Promise<boolean> {
  const r = await pool.query(
    "SELECT 1 FROM processed_emails WHERE message_id = $1 LIMIT 1",
    [messageId]
  );
  return r.rowCount !== null && r.rowCount > 0;
}

async function markProcessed(messageId: string, ticketId: number): Promise<void> {
  await pool.query(
    "INSERT INTO processed_emails (message_id, ticket_id) VALUES ($1, $2) ON CONFLICT (message_id) DO NOTHING",
    [messageId, ticketId]
  );
}

async function findExistingTicketByThread(
  inReplyTo: string | null | undefined,
  references: string | string[] | null | undefined,
  senderEmail: string,
  subject: string,
): Promise<number | null> {
  const refList: string[] = [];
  if (inReplyTo) refList.push(inReplyTo);
  if (references) {
    const refs = Array.isArray(references) ? references : references.split(/\s+/);
    refList.push(...refs);
  }

  for (const ref of refList) {
    const clean = ref.replace(/[<>]/g, "").trim();
    if (!clean) continue;
    const r = await pool.query(
      "SELECT ticket_id FROM processed_emails WHERE message_id = $1 LIMIT 1",
      [clean]
    );
    if (r.rows[0]?.ticket_id) return r.rows[0].ticket_id;

    const r2 = await pool.query(
      "SELECT id FROM support_tickets WHERE imap_message_id = $1 LIMIT 1",
      [clean]
    );
    if (r2.rows[0]?.id) return r2.rows[0].id;
  }

  const cleanedSubject = cleanSubject(subject);
  if (cleanedSubject) {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r3 = await pool.query(
      `SELECT id FROM support_tickets
       WHERE customer_email = $1
         AND subject = $2
         AND channel = 'EMAIL'
         AND status NOT IN ('closed','resolved')
         AND created_at >= $3
       ORDER BY created_at DESC LIMIT 1`,
      [senderEmail, cleanedSubject, windowStart]
    );
    if (r3.rows[0]?.id) return r3.rows[0].id;
  }

  return null;
}

async function generateTicketNumber(): Promise<string> {
  return `TK-${Date.now().toString(36).toUpperCase()}`;
}

async function resolveAccountId(email: string): Promise<number | null> {
  const lc = email.toLowerCase();
  // 1. Try owner email or store email
  const r = await pool.query(
    `SELECT l.id FROM locations l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE u.email = $1 OR l.email = $1
     LIMIT 1`,
    [lc]
  );
  if (r.rows[0]?.id) return r.rows[0].id;
  // 2. Try staff email — resolve to the staff member's primary store
  const r2 = await pool.query(
    `SELECT s.store_id FROM staff s WHERE lower(s.email) = $1 LIMIT 1`,
    [lc]
  );
  return r2.rows[0]?.store_id ?? null;
}

async function processEmail(parsed: ParsedMail): Promise<"new" | "duplicate"> {
  const messageId = (parsed.messageId ?? "").replace(/[<>]/g, "").trim();
  if (!messageId) {
    log("Skipping email with no Message-ID");
    return "duplicate";
  }

  if (await isAlreadyProcessed(messageId)) {
    return "duplicate";
  }

  const senderEmail = extractAddress(parsed.from).toLowerCase();
  if (!senderEmail) {
    log(`Skipping email ${messageId} — no sender address`);
    return "duplicate";
  }

  if (senderEmail === IMAP_USER.toLowerCase()) {
    log(`Skipping self-sent email ${messageId}`);
    return "duplicate";
  }

  // Skip emails that contain HTML but no plain-text alternative.
  // These are almost always marketing newsletters or automated HTML blasts,
  // not genuine support requests. Real customer emails (from Gmail, Outlook,
  // Apple Mail) always include a text/plain part alongside any HTML.
  if (parsed.html && !parsed.text) {
    log(`Skipping HTML-only email ${messageId} from ${senderEmail}`);
    await markProcessed(messageId, 0);  // record as processed so we don't retry
    return "duplicate";
  }

  const senderName = extractName(parsed.from);
  const subject    = (parsed.subject ?? "(no subject)").trim();
  const body       = cleanBody(parsed);
  const receivedAt = parsed.date ?? new Date();

  const rawHeaders: Record<string, string> = {};
  if (parsed.headerLines) {
    for (const h of parsed.headerLines) {
      rawHeaders[h.key] = h.line.slice(h.key.length + 1).trim();
    }
  }

  const existingTicketId = await findExistingTicketByThread(
    parsed.inReplyTo,
    parsed.references as string | string[] | undefined,
    senderEmail,
    subject,
  );

  if (existingTicketId) {
    await pool.query(
      `INSERT INTO support_ticket_messages
         (ticket_id, author_type, author_name, content, is_internal, direction, raw_headers, created_at)
       VALUES ($1, 'customer', $2, $3, false, 'inbound', $4, $5)`,
      [existingTicketId, senderName, body || "(empty)", JSON.stringify(rawHeaders), receivedAt]
    );
    await pool.query(
      "UPDATE support_tickets SET status = 'open', updated_at = now() WHERE id = $1 AND status IN ('resolved','closed','pending')",
      [existingTicketId]
    );
    await markProcessed(messageId, existingTicketId);
    log(`Appended reply to ticket #${existingTicketId} from ${senderEmail}`);
    return "new";
  }

  const accountId = await resolveAccountId(senderEmail);
  const ticketNum = await generateTicketNumber();
  const cleanedSubject = cleanSubject(subject);

  const ticketRes = await pool.query(
    `INSERT INTO support_tickets
       (ticket_number, subject, description, status, priority, channel,
        customer_email, customer_name, account_id, imap_message_id,
        created_at, updated_at)
     VALUES ($1, $2, $3, 'open', 'normal', 'EMAIL', $4, $5, $6, $7, $8, $8)
     RETURNING id`,
    [
      ticketNum,
      cleanedSubject || "(no subject)",
      body || null,
      senderEmail,
      senderName,
      accountId,
      messageId,
      receivedAt,
    ]
  );
  const ticketId: number = ticketRes.rows[0].id;

  await pool.query(
    `INSERT INTO support_ticket_messages
       (ticket_id, author_type, author_name, content, is_internal, direction, raw_headers, created_at)
     VALUES ($1, 'customer', $2, $3, false, 'inbound', $4, $5)`,
    [ticketId, senderName, body || "(empty)", JSON.stringify(rawHeaders), receivedAt]
  );

  await markProcessed(messageId, ticketId);
  log(`Created ticket ${ticketNum} (#${ticketId}) from ${senderEmail} — "${cleanedSubject}"`);

  // Push real-time notification to all connected support agents
  broadcastToAgents({
    type: "new_ticket",
    ticketId,
    ticketNumber: ticketNum,
    subject: cleanedSubject || "(no subject)",
    senderName,
    senderEmail,
    channel: "EMAIL",
  });
  return "new";
}

// ── Diagnostics state (exported via getEmailSyncStatus) ─────────────────────
let lastPollAt: Date | null = null;
let lastPollNew = 0;
let lastPollSeen = 0;
let lastPollError: string | null = null;
let totalProcessed = 0;
let pollCount = 0;
let lastPollConnected = false;
const recentMessageErrors: string[] = [];   // up to 5 most recent per-message errors

export function getEmailSyncStatus() {
  return {
    running,
    connected: lastPollConnected,
    imapPasswordSet: !!process.env.IMAP_PASSWORD,
    imapUser: IMAP_USER,
    lastPollAt: lastPollAt?.toISOString() ?? null,
    lastPollNew,
    lastPollSeen,
    lastPollError,
    recentMessageErrors: [...recentMessageErrors],
    totalProcessed,
    pollCount,
    pollIntervalMs: POLL_INTERVAL,
  };
}

// Maximum raw email size — IMAP `smaller:` criterion (bytes).
// Emails over this limit are almost always HTML newsletters / marketing mail
// with embedded images, not plain-text support requests.  They are excluded
// before any bytes are downloaded.
const MAX_EMAIL_SIZE = 100_000;  // 100 KB

// Guard — only one poll runs at a time.  setInterval fires regardless of
// whether the previous run has finished, so we skip if already in progress.
let pollRunning = false;

// In-memory set of UIDs handled this session (any path).
// Once a UID is touched — processed, skipped, or errored-but-confirmed-dedup —
// it is never fetched again until the server restarts.  This is the most
// reliable guard against seen-30d re-fetching the same messages every poll
// when the IMAP server doesn't honour delete or \Seen flag operations.
const handledUids = new Set<number>();

/** Build a fresh ImapFlow instance.  Every poll gets its own. */
function makeImapClient(): ImapFlow {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: process.env.IMAP_PASSWORD! },
    logger: false,
    tls: { rejectUnauthorized: true },
  });
}

/**
 * Get the list of UIDs matching the search criteria.
 * Uses a short-lived connection so the UID list doesn't stale the main fetch.
 */
async function getUids(
  searchCriteria: Record<string, unknown>,
): Promise<number[]> {
  const c = makeImapClient();
  try {
    await c.connect();
    const mailbox = await c.getMailboxLock("INBOX");
    try {
      const criteria = { ...searchCriteria, smaller: MAX_EMAIL_SIZE };
      return (await c.search(criteria, { uid: true })) || [];
    } finally {
      try { mailbox.release(); } catch {}
    }
  } finally {
    try { await c.logout(); } catch {}
    try { c.close(); } catch {}
  }
}

/**
 * Fetch and process a SINGLE uid in its own fresh IMAP connection.
 *
 * The PrivateEmail IMAP server consistently stalls after delivering the first
 * FETCH response in a multi-message session.  Using a dedicated connection per
 * UID sidesteps the server-side quirk: each connection does exactly one FETCH,
 * gets one response, then disconnects cleanly.
 *
 * A 30-second hard timeout closes the socket if the server stops responding.
 *
 * @param deleteAfterProcess  When true, the message is permanently deleted from
 *   the mailbox after successful processing (or when already-processed/skipped).
 *   Only set for the unseen path — never for seen-30d recovery or manual rescans.
 */
async function fetchOneUid(
  uid: number,
  markSeen: boolean,
  deleteAfterProcess = false,
): Promise<"processed" | "skipped" | "error"> {
  const c = makeImapClient();
  const abort = setTimeout(() => { try { c.close(); } catch {} }, 30_000);
  try {
    await c.connect();
    const mailbox = await c.getMailboxLock("INBOX");
    try {
      const messages = c.fetch([uid], { source: true, uid: true, flags: true }, { uid: true });
      let result: "processed" | "skipped" = "skipped";
      for await (const msg of messages) {
        const raw = msg.source as unknown as Buffer;
        if (!raw || raw.length === 0) {
          result = "skipped";
          break;
        }
        const parsed = await simpleParser(raw);
        const outcome = await processEmail(parsed);
        if (markSeen) {
          await c.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
        }
        // "new" = ticket created or reply appended; "duplicate" = dedup skip.
        result = outcome === "new" ? "processed" : "skipped";
      }
      return result;
    } finally {
      try { mailbox.release(); } catch {}
    }
  } catch (e) {
    logError(`fetchOneUid uid=${uid}`, e);
    const errMsg = `uid=${uid}: ${e instanceof Error ? e.message : String(e)}`;
    recentMessageErrors.unshift(errMsg);
    if (recentMessageErrors.length > 5) recentMessageErrors.pop();
    return "error";
  } finally {
    clearTimeout(abort);
    try { await c.logout(); } catch {}
    try { c.close(); } catch {}
  }
}

/**
 * Mark a single UID as \Seen AND \Deleted using its own fresh IMAP connection.
 *
 * Both flags are set in a single STORE command — no EXPUNGE is issued, which
 * avoids the server stall we hit with messageDelete().  Most IMAP servers
 * auto-expunge \Deleted messages on the next session open or on disconnect;
 * at minimum the \Seen flag immediately removes the email from UNSEEN searches
 * and the in-session handledUids set prevents it being touched again.
 *
 * Non-fatal: ticket is already created; if this fails the handledUids set
 * ensures the message is not re-fetched for the rest of this session.
 */
async function markSeenAndDeleted(uid: number): Promise<void> {
  const c = makeImapClient();
  const abort = setTimeout(() => { try { c.close(); } catch {} }, 15_000);
  try {
    await c.connect();
    const mailbox = await c.getMailboxLock("INBOX");
    try {
      await c.messageFlagsAdd({ uid }, ["\\Seen", "\\Deleted"], { uid: true });
      log(`Marked uid=${uid} as seen+deleted`);
    } finally {
      try { mailbox.release(); } catch {}
    }
  } catch (e) {
    logError(`Could not mark uid=${uid} as seen+deleted (non-fatal)`, e);
  } finally {
    clearTimeout(abort);
    try { await c.logout(); } catch {}
    try { c.close(); } catch {}
  }
}

/**
 * Fetch just the Message-ID header for a UID using a minimal IMAP fetch.
 * Much lighter than a full body fetch — used to check whether a stuck
 * (repeatedly-failing) email is already in our dedup table so we can safely
 * delete it without re-processing it.
 */
async function fetchMessageId(uid: number): Promise<string | null> {
  const c = makeImapClient();
  const abort = setTimeout(() => { try { c.close(); } catch {} }, 15_000);
  try {
    await c.connect();
    const mailbox = await c.getMailboxLock("INBOX");
    try {
      const messages = c.fetch([uid], { headers: ["message-id"], uid: true }, { uid: true });
      for await (const msg of messages) {
        const raw = msg.headers?.toString() ?? "";
        const match = raw.match(/^message-id:\s*<?([^>\r\n]+)>?\s*$/im);
        return match ? match[1].trim() : null;
      }
      return null;
    } finally {
      try { mailbox.release(); } catch {}
    }
  } catch {
    return null;
  } finally {
    clearTimeout(abort);
    try { await c.logout(); } catch {}
    try { c.close(); } catch {}
  }
}

/**
 * What to do with a message on the IMAP server after it has been handled.
 *
 * - "mark-seen"  — add the \Seen flag (used for the unseen path so the
 *                  message no longer appears in UNSEEN searches).
 * - "delete"     — permanently remove the message from the inbox (used for
 *                  the seen-30d recovery path so already-seen emails don't
 *                  accumulate and get re-fetched every poll indefinitely).
 * - "none"       — leave the message untouched (used for manual rescans).
 */
type PostProcessAction = "mark-seen" | "delete" | "none";

/**
 * Fetch and process all matching emails, one fresh connection per UID.
 * Isolating connections prevents one stalled message from blocking the rest.
 */
async function fetchAndProcess(
  searchCriteria: Record<string, unknown>,
  markSeen: boolean,
  label: string,
  postProcess: PostProcessAction = "none",
): Promise<{ processed: number; scanned: number }> {
  let uids: number[];
  try {
    uids = await getUids(searchCriteria);
  } catch (e) {
    logError(`${label} getUids failed`, e);
    return { processed: 0, scanned: 0 };
  }

  if (!uids.length) {
    log(`${label} — no emails under ${MAX_EMAIL_SIZE / 1000}KB`);
    return { processed: 0, scanned: 0 };
  }
  log(`${label} — found ${uids.length} uid(s) under ${MAX_EMAIL_SIZE / 1000}KB [uids: ${uids.join(",")}]`);

  let processed = 0, scanned = 0;
  for (const uid of uids) {
    // Skip UIDs already handled in a previous poll this session.  This is the
    // primary guard when the IMAP server doesn't honour delete/mark-seen.
    if (handledUids.has(uid)) {
      log(`${label} — uid=${uid} already handled this session, skipping`);
      continue;
    }

    const result = await fetchOneUid(uid, markSeen);
    // Always record as handled — even errors — so we don't keep fetching a
    // message that consistently fails.  (If a transient error is the cause,
    // the next restart will retry it.)
    handledUids.add(uid);

    if (result !== "error") scanned++;
    if (result === "processed") processed++;

    if (postProcess !== "none") {
      if (result !== "error") {
        // Processed or dedup-skipped cleanly — mark \Seen + \Deleted in one
        // STORE command.  \Seen removes it from UNSEEN searches; \Deleted lets
        // the server auto-expunge on next session open.  No EXPUNGE call is
        // issued here — that's what was stalling the PrivateEmail server.
        await markSeenAndDeleted(uid);
      } else {
        // Full fetch failed.  Lightweight headers-only fetch to get Message-ID;
        // if already in our dedup table it's safe to flag as seen+deleted.
        const msgId = await fetchMessageId(uid);
        if (msgId && await isAlreadyProcessed(msgId)) {
          log(`uid=${uid} already processed — marking stuck email as seen+deleted`);
          await markSeenAndDeleted(uid);
        }
      }
    }
    // postProcess === "none": leave the message untouched.
  }

  log(`${label} — scanned ${scanned}, created/updated ${processed} ticket(s)`);
  return { processed, scanned };
}

async function pollInbox(): Promise<void> {
  if (pollRunning) {
    log("Poll skipped — previous poll still running");
    return;
  }
  pollRunning = true;
  pollCount++;
  log(`Poll #${pollCount} starting`);

  try {
    // Path 1 — unseen messages (normal real-time path).
    // "mark-seen": after creating the ticket, flag the email \Seen so it
    // never appears in future UNSEEN searches.  If the full fetch stalls but
    // the email is already in our dedup table, it is also marked seen to clear
    // stuck messages.
    const { processed: newCount, scanned: newScanned } =
      await fetchAndProcess({ seen: false }, true, "unseen", "mark-seen");

    // Path 2 — seen messages from the last 30 days.
    // Catches emails read via webmail before the poller ran.
    // "delete": after processing (or dedup-skipping), permanently remove the
    // email from the inbox so it never re-appears in the seen-30d scan.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { processed: seenCount, scanned: seenScanned } =
      await fetchAndProcess({ seen: true, since }, false, "seen-30d", "delete");

    lastPollAt = new Date();
    lastPollNew = newCount;
    lastPollSeen = seenCount;
    lastPollError = null;
    lastPollConnected = true;
    totalProcessed += newCount + seenCount;

    log(`Poll #${pollCount} done — unseen:${newScanned}(${newCount} tickets) seen-30d:${seenScanned}(${seenCount} recovered)`);
  } catch (e) {
    lastPollConnected = false;
    const msg = e instanceof Error ? e.message : String(e);
    lastPollError = msg;
    logError(`Poll #${pollCount} error`, e);
  } finally {
    pollRunning = false;
  }
}

/**
 * Force a full rescan of the inbox for the last `days` days.
 * Uses per-UID connections (same strategy as the poller) so one stalled
 * email can't block the rest.  Dedup via processed_emails prevents double-
 * creating tickets.  Called by the back-office manual rescan endpoint.
 */
export async function rescanInbox(days = 30): Promise<{ scanned: number; errors: string[] }> {
  const errors: string[] = [];
  let scanned = 0;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let uids: number[];
  try {
    uids = await getUids({ since });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError("Rescan getUids failed", e);
    return { scanned: 0, errors: [msg] };
  }

  if (!uids.length) {
    log(`Rescan — no emails under ${MAX_EMAIL_SIZE / 1000}KB in the last ${days} days`);
    return { scanned: 0, errors: [] };
  }
  log(`Rescan — found ${uids.length} uid(s) since ${since.toISOString()}`);

  for (const uid of uids) {
    const result = await fetchOneUid(uid, false /* don't mark seen during rescan */);
    if (result !== "error") scanned++;
    if (result === "error") errors.push(`uid=${uid}: fetch failed`);
  }

  log(`Rescan complete — scanned ${scanned} messages, ${errors.length} errors`);
  return { scanned, errors };
}

export async function startEmailTicketSync(): Promise<void> {
  const password = process.env.IMAP_PASSWORD;
  if (!password) {
    log("IMAP_PASSWORD not set — email ticket sync disabled");
    return;
  }

  if (running) return;
  running = true;

  // Ensure the dedup table exists — protects against missing migration in prod
  try {
    await ensureProcessedEmailsTable();
    log("processed_emails table ready");
  } catch (e) {
    logError("Could not ensure processed_emails table", e);
  }

  // Fire every POLL_INTERVAL; the pollRunning guard prevents overlap.
  setInterval(() => { void pollInbox(); }, POLL_INTERVAL);

  log(`Email ticket sync started (polling every ${POLL_INTERVAL / 1000}s)`);
  void pollInbox();  // run immediately on startup
}

/**
 * Website messages (owner, 2026-11-07; plans/pro-messages.md). A client writes to a Certxa Pro business from its
 * website (SoloTheme › Contact › Send a message, or <slug>.certxa.com/#message). The pro reads and answers in the
 * app (Home › envelope › inbox). The client gets each answer by e-mail as a link to a private page
 * (certxa.com/msg/<code>) where they read the conversation and write back, so it is a conversation, not one message.
 *
 *   POST   /api/public/store/:slug/messages    { name, email, phone?, subject?, message, website, startedAt }
 *   GET    /api/public/messages/:token         the conversation, for the client's private page
 *   POST   /api/public/messages/:token/reply   { message, website }
 *   GET    /api/pro/messages/unread            { count } — unread client messages, for the envelope's badge
 *   GET    /api/pro/messages                   the inbox
 *   GET    /api/pro/messages/:id               one conversation (marks it read)
 *   POST   /api/pro/messages/:id/reply         { message } → e-mailed to the client with the link
 *   DELETE /api/pro/messages/:id               deleted for good (spam)
 *
 * Spam protection, all on the server: a hidden field only bots fill in, a minimum time to fill in the form, Google
 * reCAPTCHA v3 when its keys are set (lib/recaptcha.ts), limits per
 * sender address (hashed) and per e-mail address, length and link limits, and the same message twice dropped. A
 * request caught by the hidden field or the timer is answered as if it worked, so a bot learns nothing.
 */
import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { resolveStoreIdBySlug } from "../lib/salonNetworkGuard";
import { pushOwnerMessage } from "../lib/ownerPush";
import { sendEmail } from "../mail";
import { emailButton, emailText, escapeEmailHtml } from "../lib/emailLayout";
import { checkRecaptcha, recaptchaSiteKey } from "../lib/recaptcha";
import { clientViewing, liveAvailabilityChanged, liveChatAvailable, liveMessage, liveRead, proOnline } from "../lib/proMessagesLive";

const router = Router();

export const LIMITS = {
  /** A person needs at least this long to fill in the form; a bot posts at once. */
  minFillMs: 3_000,
  /** Client messages (new or replies) per sender address. */
  perIpHour: 10, perIpDay: 30,
  /** New conversations per e-mail address per business. */
  perEmailHour: 3,
  /** Client replies per conversation. */
  perThreadHour: 15,
  maxLinks: 3,
};

const APP_URL = () => (process.env.APP_URL || "https://certxa.com").replace(/\/$/, "");
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const ipHash = (req: Request) => hash(`${process.env.SESSION_SECRET ?? "certxa"}|msg|${req.ip ?? ""}`);
const linkFor = (token: string) => `${APP_URL()}/msg/${token}`;
const linkCount = (s: string) => (s.match(/https?:\/\/|www\./gi) ?? []).length;
const snippet = (s: string, n = 120) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const htmlBody = (s: string) => escapeEmailHtml(s).replace(/\r?\n/g, "<br>");

// A first layer per server process; the database limits below are the real ones.
const publicLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many messages. Please try again later." } });

const text = (max: number) => z.string().trim().max(max);
const newInput = z.object({
  name: text(100).min(1, "Enter your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(254),
  phone: text(30).optional().default(""),
  subject: text(150).optional().default(""),
  message: text(5000).min(2, "Write your message"),
  website: z.string().max(500).optional().default(""), // the hidden field
  startedAt: z.number().int().optional(),
  // Google reCAPTCHA v3 token (lib/recaptcha.ts), when the keys are set.
  recaptchaToken: z.string().max(4000).optional(),
}).strict();
const replyInput = z.object({ message: text(5000).min(1, "Write your message"), website: z.string().max(500).optional().default(""), recaptchaToken: z.string().max(4000).optional() }).strict();
const proReplyInput = z.object({ message: text(5000).min(1, "Write your message") }).strict();

function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: error.issues[0]?.message ?? "Please check the form." });
}

/** Spam rules for a client's message. "drop": a bot, answer as if it worked. A string: a refusal to show. */
async function spamCheck(req: Request, body: string, opts: { website: string; startedAt?: number; email?: string; storeId?: number; threadId?: number; recaptchaToken?: string; action: string }): Promise<"ok" | "drop" | string> {
  if (opts.website.trim()) return "drop";
  if (opts.startedAt !== undefined && Date.now() - opts.startedAt < LIMITS.minFillMs) return "drop";
  if (linkCount(body) > LIMITS.maxLinks) return "Please send fewer links in your message.";
  // Google reCAPTCHA v3: how human the visit looked (lib/recaptcha.ts). Scores are logged to tune the cutoff.
  const rc = await checkRecaptcha(opts.recaptchaToken, opts.action, req.ip);
  if (!(rc.ok && rc.skipped)) console.log(`[pro-messages] recaptcha ${opts.action}: ${rc.ok ? `ok ${rc.score}` : `refused ${rc.reason}${rc.score !== undefined ? ` ${rc.score}` : ""}`}`);
  if (!rc.ok) return "Your message couldn't be sent. Please try again in a moment.";
  const ip = ipHash(req);
  const r = (await pool.query(
    `SELECT COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour,
            COUNT(*)::int AS day,
            COUNT(*) FILTER (WHERE created_at > now() - interval '10 minutes' AND body = $2)::int AS same
       FROM pro_messages WHERE ip_hash = $1 AND sender = 'client' AND created_at > now() - interval '1 day'`, [ip, body])).rows[0];
  if (r.same > 0) return "drop";
  if (r.hour >= LIMITS.perIpHour || r.day >= LIMITS.perIpDay) return "Too many messages. Please try again later.";
  if (opts.email && opts.storeId) {
    const e = (await pool.query(`SELECT COUNT(*)::int AS n FROM pro_message_threads WHERE store_id = $1 AND client_email = $2 AND created_at > now() - interval '1 hour'`,
      [opts.storeId, opts.email])).rows[0];
    if (e.n >= LIMITS.perEmailHour) return "You've sent several messages already. Please wait for an answer.";
  }
  if (opts.threadId) {
    const t = (await pool.query(`SELECT COUNT(*)::int AS n FROM pro_messages WHERE thread_id = $1 AND sender = 'client' AND created_at > now() - interval '1 hour'`, [opts.threadId])).rows[0];
    if (t.n >= LIMITS.perThreadHour) return "Too many messages. Please try again later.";
  }
  return "ok";
}

async function businessName(storeId: number): Promise<string> {
  return (await pool.query(`SELECT name FROM locations WHERE id = $1`, [storeId])).rows[0]?.name || "Your appointment";
}

/**
 * A client message reaches the pro: live in the app when it's open (it chimes there for every message), else a push
 * alert — one per conversation until the pro reads it (owner, 2026-11-07: not a push for every message). `firstUnread`:
 * the conversation had nothing unread before this message.
 */
async function notifyPro(storeId: number, threadId: number, name: string, subject: string, m: { id: number; body: string; created_at: Date }, firstUnread: boolean) {
  liveMessage({ storeId, threadId, clientName: name, subject, message: { id: m.id, sender: "client", body: m.body, createdAt: new Date(m.created_at).toISOString() } });
  if (!firstUnread || await proOnline(storeId)) return;
  console.log(`[pro-messages] push store=${storeId} thread=${threadId}`);
  void pushOwnerMessage(storeId, { title: `Message from ${name}`, body: snippet(`${subject ? `${subject}: ` : ""}${m.body}`, 140), data: { type: "web_message", threadId } });
}

// ── The client (public) ─────────────────────────────────────────────────────────────────────────────────

/** What the message pages need before sending: the reCAPTCHA site key (public), or null when it's off. */
router.get("/api/public/messages-config", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ recaptchaSiteKey: recaptchaSiteKey() });
});

router.post("/api/public/store/:slug/messages", publicLimiter, async (req, res) => {
  const parsed = newInput.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await resolveStoreIdBySlug(String(req.params.slug));
    if (!storeId) return res.status(404).json({ error: "This business wasn't found." });
    const d = parsed.data;
    const spam = await spamCheck(req, d.message, { website: d.website, startedAt: d.startedAt, email: d.email, storeId, recaptchaToken: d.recaptchaToken, action: "message" });
    if (spam === "drop") return res.json({ ok: true });
    if (spam !== "ok") return res.status(429).json({ error: spam });

    const token = crypto.randomBytes(24).toString("base64url");
    // The client's record, when this e-mail is already one of the business's clients.
    const client = (await pool.query(
      `SELECT c.id FROM clients c JOIN client_emails e ON e.client_id = c.id
        WHERE c.store_id = $1 AND c.archived_at IS NULL AND lower(e.email_address) = $2 ORDER BY c.id LIMIT 1`, [storeId, d.email])).rows[0];
    const subject = d.subject || snippet(d.message, 60);
    const thread = (await pool.query(
      `INSERT INTO pro_message_threads (store_id, client_id, client_name, client_email, client_phone, subject, pro_unread)
       VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING id`,
      [storeId, client?.id ?? null, d.name, d.email, d.phone || null, subject])).rows[0];
    await pool.query(`INSERT INTO pro_message_links (token_hash, thread_id) VALUES ($1,$2)`, [hash(token), thread.id]);
    const first = (await pool.query(`INSERT INTO pro_messages (thread_id, sender, body, ip_hash) VALUES ($1,'client',$2,$3) RETURNING id, body, created_at`, [thread.id, d.message, ipHash(req)])).rows[0];
    void notifyPro(storeId, thread.id, d.name, subject, first, true);

    const business = await businessName(storeId);
    void sendEmail(storeId, d.email, `Your message to ${business}`, [
      emailText(`Hi ${escapeEmailHtml(d.name.split(/\s+/)[0])}, your message was sent to ${escapeEmailHtml(business)}. You'll get an e-mail when they answer.`),
      emailText(htmlBody(d.message), { muted: true }),
      emailButton("View the conversation", linkFor(token)),
      emailText("Keep this e-mail: the button opens your conversation, where you can read answers and write back.", { muted: true, size: 13 }),
    ].join(""), undefined, undefined, { business, preheader: `Your message to ${business} was sent.` })
      .catch((e: any) => console.warn("[pro-messages] confirmation e-mail:", e?.message ?? e));
    return res.status(201).json({ ok: true });
  } catch (err: any) {
    console.error("[pro-messages] new", err?.message ?? err);
    return res.status(500).json({ error: "Your message could not be sent. Please try again." });
  }
});

async function threadByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return (await pool.query(`SELECT t.* FROM pro_message_links l JOIN pro_message_threads t ON t.id = l.thread_id WHERE l.token_hash = $1`, [hash(token)])).rows[0] ?? null;
}
const messagesOf = async (threadId: number) =>
  (await pool.query(`SELECT id, sender, body, created_at FROM pro_messages WHERE thread_id = $1 ORDER BY created_at, id`, [threadId])).rows;

router.get("/api/public/messages/:token", async (req, res) => {
  try {
    const t = await threadByToken(String(req.params.token));
    if (!t) return res.status(404).json({ error: "This conversation wasn't found. The link may be incomplete." });
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      business: await businessName(t.store_id), subject: t.subject, clientName: t.client_name,
      messages: (await messagesOf(t.id)).map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.created_at })),
      // The pro has the app open: answers come straight in (lib/proMessagesLive.ts keeps this current on the page).
      proOnline: await proOnline(t.store_id),
    });
  } catch (err: any) {
    console.error("[pro-messages] open", err?.message ?? err);
    return res.status(500).json({ error: "This conversation could not be opened." });
  }
});

router.post("/api/public/messages/:token/reply", publicLimiter, async (req, res) => {
  const parsed = replyInput.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const t = await threadByToken(String(req.params.token));
    if (!t) return res.status(404).json({ error: "This conversation wasn't found." });
    const spam = await spamCheck(req, parsed.data.message, { website: parsed.data.website, threadId: t.id, recaptchaToken: parsed.data.recaptchaToken, action: "reply" });
    if (spam === "drop") return res.json({ ok: true });
    if (spam !== "ok") return res.status(429).json({ error: spam });
    const m = (await pool.query(`INSERT INTO pro_messages (thread_id, sender, body, ip_hash) VALUES ($1,'client',$2,$3) RETURNING id, sender, body, created_at`, [t.id, parsed.data.message, ipHash(req)])).rows[0];
    const unread = (await pool.query(`UPDATE pro_message_threads SET pro_unread = pro_unread + 1, last_message_at = now() WHERE id = $1 RETURNING pro_unread`, [t.id])).rows[0]?.pro_unread;
    void notifyPro(t.store_id, t.id, t.client_name, t.subject, m, unread === 1);
    return res.status(201).json({ ok: true, message: { id: m.id, sender: m.sender, body: m.body, createdAt: m.created_at } });
  } catch (err: any) {
    console.error("[pro-messages] client reply", err?.message ?? err);
    return res.status(500).json({ error: "Your message could not be sent. Please try again." });
  }
});

// ── The pro (signed in: the app, or the website) ───────────────────────────────────────────────────────

async function storeOf(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ error: "No business found for this account." });
  return storeId;
}
const threadId = (raw: string) => (/^\d{1,9}$/.test(raw) ? Number(raw) : null);

// The switch at the top of the Inbox: available for live chat (owner, 2026-11-07). Before /:id, which takes digits only.
router.get("/api/pro/messages/live-chat", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    return res.json({ available: await liveChatAvailable(storeId) });
  } catch (err: any) { console.error("[pro-messages] live-chat", err?.message ?? err); return res.status(500).json({ error: "Could not load the setting." }); }
});
router.put("/api/pro/messages/live-chat", isAuthenticated, async (req, res) => {
  const parsed = z.object({ available: z.boolean() }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    await pool.query(`UPDATE locations SET live_chat_available = $2 WHERE id = $1`, [storeId, parsed.data.available]);
    await liveAvailabilityChanged(storeId);
    return res.json({ available: parsed.data.available });
  } catch (err: any) { console.error("[pro-messages] live-chat save", err?.message ?? err); return res.status(500).json({ error: "Could not save the setting." }); }
});

router.get("/api/pro/messages/unread", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const r = (await pool.query(`SELECT COALESCE(SUM(pro_unread), 0)::int AS n FROM pro_message_threads WHERE store_id = $1`, [storeId])).rows[0];
    return res.json({ count: r.n });
  } catch (err: any) { console.error("[pro-messages] unread", err?.message ?? err); return res.status(500).json({ error: "Could not load messages." }); }
});

router.get("/api/pro/messages", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const rows = (await pool.query(
      `SELECT t.id, t.client_name, t.client_email, t.subject, t.pro_unread, t.last_message_at,
              m.body AS last_body, m.sender AS last_sender
         FROM pro_message_threads t
         LEFT JOIN LATERAL (SELECT body, sender FROM pro_messages WHERE thread_id = t.id ORDER BY created_at DESC, id DESC LIMIT 1) m ON true
        WHERE t.store_id = $1 ORDER BY t.last_message_at DESC LIMIT 300`, [storeId])).rows;
    return res.json(rows.map((r) => ({
      id: r.id, clientName: r.client_name, clientEmail: r.client_email, subject: r.subject, unread: r.pro_unread,
      lastMessageAt: r.last_message_at, lastSender: r.last_sender, snippet: snippet(r.last_body ?? ""),
    })));
  } catch (err: any) { console.error("[pro-messages] list", err?.message ?? err); return res.status(500).json({ error: "Could not load messages." }); }
});

async function ownThread(req: Request, res: Response) {
  const storeId = await storeOf(req, res); if (!storeId) return null;
  const id = threadId(String(req.params.id));
  const t = id ? (await pool.query(`SELECT * FROM pro_message_threads WHERE id = $1 AND store_id = $2`, [id, storeId])).rows[0] : null;
  if (!t) { res.status(404).json({ error: "This message wasn't found." }); return null; }
  return t;
}

router.get("/api/pro/messages/:id", isAuthenticated, async (req, res) => {
  try {
    const t = await ownThread(req, res); if (!t) return;
    if (t.pro_unread) { await pool.query(`UPDATE pro_message_threads SET pro_unread = 0 WHERE id = $1`, [t.id]); liveRead(t.store_id, t.id); }
    return res.json({
      id: t.id, clientId: t.client_id, clientName: t.client_name, clientEmail: t.client_email, clientPhone: t.client_phone,
      subject: t.subject, createdAt: t.created_at,
      messages: (await messagesOf(t.id)).map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.created_at })),
    });
  } catch (err: any) { console.error("[pro-messages] open", err?.message ?? err); return res.status(500).json({ error: "Could not open this message." }); }
});

router.post("/api/pro/messages/:id/reply", isAuthenticated, async (req, res) => {
  const parsed = proReplyInput.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const t = await ownThread(req, res); if (!t) return;
    const m = (await pool.query(`INSERT INTO pro_messages (thread_id, sender, body) VALUES ($1,'pro',$2) RETURNING id, sender, body, created_at`, [t.id, parsed.data.message])).rows[0];
    await pool.query(`UPDATE pro_message_threads SET last_message_at = now(), pro_unread = 0 WHERE id = $1`, [t.id]);
    const message = { id: m.id, sender: m.sender, body: m.body, createdAt: new Date(m.created_at).toISOString() };
    liveMessage({ storeId: t.store_id, threadId: t.id, message });
    // The client has the conversation open and sees it arrive: no e-mail (owner, 2026-11-07).
    if (await clientViewing(t.id)) return res.status(201).json({ message, emailed: false, live: true });
    // A private-link code for this e-mail (the code itself is never stored; earlier e-mails' links keep working).
    const token = crypto.randomBytes(24).toString("base64url");
    await pool.query(`INSERT INTO pro_message_links (token_hash, thread_id) VALUES ($1,$2)`, [hash(token), t.id]);
    const business = await businessName(t.store_id);
    const sent = await sendEmail(t.store_id, t.client_email, `${business} answered your message`, [
      emailText(`Hi ${escapeEmailHtml(String(t.client_name).split(/\s+/)[0])}, ${escapeEmailHtml(business)} answered your message${t.subject ? ` about “${escapeEmailHtml(t.subject)}”` : ""}.`),
      emailText(htmlBody(parsed.data.message)),
      emailButton("View and reply", linkFor(token)),
      emailText("Replying to this e-mail doesn't reach them: use the button to answer.", { muted: true, size: 13 }),
    ].join(""), undefined, undefined, { business, preheader: snippet(parsed.data.message, 90) })
      .catch((e: any) => ({ success: false, error: e?.message ?? String(e) }));
    if (!sent.success) console.warn(`[pro-messages] thread=${t.id} answer e-mail not sent: ${sent.error ?? "unknown"}`);
    return res.status(201).json({ message, emailed: !!sent.success, live: false });
  } catch (err: any) { console.error("[pro-messages] reply", err?.message ?? err); return res.status(500).json({ error: "Your answer could not be sent. Please try again." }); }
});

router.delete("/api/pro/messages/:id", isAuthenticated, async (req, res) => {
  try {
    const t = await ownThread(req, res); if (!t) return;
    await pool.query(`DELETE FROM pro_message_threads WHERE id = $1`, [t.id]);
    return res.status(204).end();
  } catch (err: any) { console.error("[pro-messages] delete", err?.message ?? err); return res.status(500).json({ error: "Could not delete this message." }); }
});

export default router;

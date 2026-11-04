/**
 * Business AI — the Certxa Pro app's chat (owner, 2026-11-03), built on the /manage assistant (routes/ownerAssistant.ts)
 * with the same trust rules: every number from a lookup, changes only proposed and run on Confirm, every answer
 * fact-checked afterwards. Made for one independent pro (no team, payroll, turns or cash drawers):
 *   - Looks up: earnings and other reports, the schedule, clients and their history, clients who haven't been back,
 *     booking requests waiting, services and prices, text credits and Plus, card payments, the booking link.
 *   - Changes on Confirm: business hours, sales tax, tip choices, booking approval, the website's About text (written
 *     from what the pro answers, nothing invented; the app's About you page starts this with its AI button).
 *   - Drafts a text to a client that the app opens in the phone's Messages (sent from the pro's own phone, no credits).
 *   - Never: bookings, payments, refunds, prices.
 * Its conversation is the 'app' channel of assistant_messages, apart from the website's.
 *
 *   POST /api/pro-assistant/chat     { message } → { reply, actions, clients, drafts }
 *   GET  /api/pro-assistant/history  the kept conversation (last 40 messages)
 *   Confirm / Cancel: POST /api/assistant/actions/:id/confirm | cancel (shared)
 */
import { Router, type Request, type Response } from "express";
import { formatInTimeZone } from "date-fns-tz";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { asOwner, assistantTurn, CHANGE_TOOLS, loadGuide, ownerContext, READ_TOOLS } from "./ownerAssistant";

const router = Router();
const GUIDE = loadGuide("certxa-pro-help.md");

// The reports a one-person business uses (the same report pages as the website).
const PRO_REPORTS = ["sales", "payments", "tips", "sales-tax", "client-retention", "clients-not-back", "top-clients", "no-shows", "loyalty", "appointments", "services", "busy-times", "reviews", "texts"];

const pick = (list: any[], names: string[]) => list.filter((t) => names.includes(t.name));
const readTools = pick(READ_TOOLS, ["get_report", "find_clients", "client_history", "list_appointments"]).map((t) => {
  if (t.name === "get_report") {
    return { ...t, description: "Any of the pro's reports for a date range — the same numbers as the Reports pages: sales and earnings, payments, tips, sales tax collected, client retention, clients who haven't been back, top clients, no-shows, loyalty, appointments, services, busy times, reviews, texts sent.",
      parameters: { ...t.parameters, properties: { ...t.parameters.properties, report: { type: "string", enum: PRO_REPORTS } } } };
  }
  if (t.name === "list_appointments") {
    return { ...t, description: "The pro's schedule (read only) for a date range: time, client, service, status.",
      parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] } };
  }
  return t;
});
const OWN_READ = [
  { name: "my_business", description: "The pro's business and account: text message credits and whether Plus is on, card payments (Stripe) ready or not, the booking website link, booking approval (automatic or review each one), where they see clients, business hours, sales tax, tip choices, deposit policy.",
    parameters: { type: "object", properties: {}, required: [] } },
  { name: "booking_requests", description: "Online booking requests waiting for the pro to approve, offer other times, or decline.",
    parameters: { type: "object", properties: {}, required: [] } },
  { name: "list_services", description: "The services the pro offers: name, price, length, category.",
    parameters: { type: "object", properties: {}, required: [] } },
  { name: "draft_text", description: "Write a text message to one client (found with find_clients). The pro sees it with a button that opens it in their phone's Messages app to send from their own number; nothing is sent from Certxa and no credits are used. Use when they ask to text, remind, thank or invite a client back.",
    parameters: { type: "object", properties: { clientId: { type: "number" }, message: { type: "string", description: "The text, under 320 characters, warm and short, signed with the business name." } }, required: ["clientId", "message"] } },
];
const changeTools = [
  ...pick(CHANGE_TOOLS, ["change_opening_hours", "change_sales_tax", "change_tip_choices"]),
  { name: "change_booking_approval", description: "Propose how online bookings are handled: 'auto' = accepted automatically, 'manual' = the client sends a request and the pro approves, offers other times, or declines.",
    parameters: { type: "object", properties: { mode: { type: "string", enum: ["auto", "manual"] } }, required: ["mode"] } },
  { name: "change_about_text", description: "Propose the About text for the pro's website, using only what they told you. It replaces the current text when they tap Confirm.",
    parameters: { type: "object", properties: { text: { type: "string", description: "The text, first person, 40 to 80 words, under 600 characters." } }, required: ["text"] } },
];
const CHANGE_NAMES = new Set(changeTools.map((t) => t.name));
const TOOLS = [...readTools, ...OWN_READ, ...changeTools].map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));

async function ownTool(req: Request, storeId: number, name: string, a: any): Promise<unknown | undefined> {
  if (name === "get_report" && !PRO_REPORTS.includes(String(a.report))) return { error: "That report isn't part of Certxa Pro." };
  if (name === "my_business") {
    const [credits, stripe, places, hours, pos, tips, deposits, site] = await Promise.all([
      asOwner(req, "GET", "/api/solo/sms-credits"), asOwner(req, "GET", "/api/payments/stripe/status"), asOwner(req, "GET", "/api/work-places"),
      asOwner(req, "GET", "/api/business-hours"), asOwner(req, "GET", `/api/pos-settings/${storeId}`), asOwner(req, "GET", "/api/tip-presets"),
      asOwner(req, "GET", "/api/booking-policies"),
      pool.query(`SELECT booking_slug, name, category, booking_site->>'about' AS about FROM locations WHERE id = $1`, [storeId]),
    ]);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return {
      business: site.rows[0]?.name ?? null,
      businessType: site.rows[0]?.category ?? null,
      aboutText: site.rows[0]?.about ?? null,
      bookingWebsite: site.rows[0]?.booking_slug ? `https://${site.rows[0].booking_slug}.certxa.com` : null,
      textCredits: credits.ok ? { balance: credits.data.credits, plusOn: !!credits.data.unlimited, textsThisMonth: credits.data.textsThisMonth,
        rule: "1 credit per text; with Plus on, notification texts are free" } : null,
      cardPayments: stripe.ok ? { connected: !!stripe.data?.connected, readyToTakeCards: !!stripe.data?.chargesEnabled } : null,
      bookingApproval: places.ok ? (places.data.bookingApproval === "manual" ? "review each booking first" : "accept automatically") : null,
      whereYouSeeClients: places.ok ? { ownPlace: places.data.ownPlace, houseCalls: !!places.data.houseCalls } : null,
      businessHours: hours.ok && Array.isArray(hours.data) ? hours.data.sort((x: any, y: any) => x.dayOfWeek - y.dayOfWeek)
        .map((h: any) => ({ day: h.dayOfWeek, dayName: days[h.dayOfWeek], open: h.openTime, close: h.closeTime, closed: h.isClosed })) : null,
      salesTax: pos.ok ? { ratePercent: Number(pos.data.salesTaxRate ?? 0) * 100, services: pos.data.taxServicesTaxable, addons: pos.data.taxAddonsTaxable, products: pos.data.taxProductsTaxable, giftCards: pos.data.taxGiftCardsTaxable } : null,
      tipChoices: tips.ok ? (tips.data?.presets ?? tips.data) : null,
      deposits: deposits.ok ? deposits.data : null,
    };
  }
  if (name === "booking_requests") {
    const r = await asOwner(req, "GET", "/api/booking-requests");
    if (!r.ok) return { error: "Could not load booking requests." };
    const tz = (await pool.query(`SELECT timezone FROM locations WHERE id = $1`, [storeId])).rows[0]?.timezone || "UTC";
    // Waiting on the pro: a new request; "offered" waits on the client to pick one of the other times.
    const list = (Array.isArray(r.data) ? r.data : []).filter((x: any) => ["requested", "offered"].includes(String(x.status)));
    return { waitingForYou: list.filter((x: any) => x.status === "requested").length, requests: list.slice(0, 20).map((x: any) => ({
      client: x.clientName ?? null, when: x.startsAt ? formatInTimeZone(x.startsAt, tz, "EEE MMM d h:mm a") : null,
      service: x.serviceName ?? null, status: x.status === "offered" ? "other times offered, waiting for the client" : "waiting for you" })), page: "More → Booking requests" };
  }
  if (name === "list_services") {
    const { rows } = await pool.query(
      `SELECT s.name, s.price, s.duration, c.name AS category FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
        WHERE s.store_id = $1 AND s.is_active = true ORDER BY c.name NULLS LAST, s.name LIMIT 80`, [storeId]).catch(() =>
      pool.query(`SELECT name, price, duration, NULL AS category FROM services WHERE store_id = $1 AND is_active = true ORDER BY name LIMIT 80`, [storeId]));
    return rows.map((r) => ({ name: r.name, price: `$${Number(r.price ?? 0).toFixed(2)}`, minutes: Number(r.duration ?? 0), category: r.category }));
  }
  if (name === "draft_text") {
    const c = (await pool.query(
      `SELECT c.id, COALESCE(NULLIF(c.full_name, ''), TRIM(CONCAT_WS(' ', c.first_name, c.last_name))) AS name,
              p.display_phone, p.phone_number_e164, p.phone_type
         FROM clients c LEFT JOIN LATERAL (SELECT * FROM client_phones p WHERE p.client_id = c.id ORDER BY p.is_primary DESC, p.id LIMIT 1) p ON true
        WHERE c.id = $1 AND c.store_id = $2`, [Number(a.clientId), storeId])).rows[0];
    if (!c) return { error: "No such client." };
    if (!c.phone_number_e164) return { error: `${c.name} has no phone number.` };
    if (c.phone_type === "landline") return { error: `${c.name}'s number is a landline, so it can't receive texts.` };
    const message = String(a.message ?? "").trim().slice(0, 480);
    if (!message) return { error: "Write the message." };
    return { draft: true, clientId: c.id, name: c.name, phone: c.display_phone ?? c.phone_number_e164, message, note: "Shown to the pro with a button to open it in Messages." };
  }
  return undefined;
}

function systemPrompt(o: { business: string; firstName: string | null; today: string; weekday: string; partOfDay: string }): string {
  return `You are Business AI in the Certxa Pro app, talking with ${o.firstName ?? "the owner"}, an independent beauty professional who runs ${o.business} on their own. Today is ${o.weekday}, ${o.today} (${o.partOfDay}) where they work.

WHO YOU ARE: a warm, smart business partner in their pocket. Plain words, short answers that fit a phone screen, no jargon, no emojis. Talk to them as "you" (it's their own business, not a team). Use their first name now and then.

TRUST — THE MOST IMPORTANT RULES:
- Every number, name, date or setting you state must come from a tool result in this conversation. Never guess, estimate or invent. If no tool has it, say plainly that you can't see that. (What they tell you about themselves for their About text is the one other source.)
- Say where a number came from in a few words ("from your Sales report for October").
- Don't use words like utilization, churn, at-risk, leakage, KPI. Dates in words ("October 31"), money like $1,234.

WHAT YOU CAN DO:
- Look things up: earnings and any report for any dates (get_report), their schedule (list_appointments, read only), clients and a client's history (find_clients, client_history), clients who haven't been back (get_report clients-not-back), booking requests waiting (booking_requests), their services and prices (list_services), and their account: text credits, Plus, card payments, booking link, hours, tax, tips, deposits, booking approval (my_business).
- Help them grow: when they ask how to get more bookings or fill their week, look at the numbers first (busy times, clients not back, top clients, no-shows), then give two or three specific, practical ideas based on what you found. Offer to draft texts to the clients you named.
- Draft a text to a client with draft_text (find the client first). The app shows it with a button to send it from their phone. Never say a text was sent.
- Write the About text for their website (see WRITING THEIR ABOUT TEXT).
- Change these settings: business hours, sales tax, tip choices, booking approval. You only PROPOSE with a change_ tool; it shows a Confirm button and happens only when they tap it. Check the current setting first with my_business, and ask for anything you need instead of guessing. After proposing, say in one sentence what will change and to tap Confirm.

WHAT YOU NEVER DO: create, move, cancel or change bookings; take payments or refunds; change service prices; send texts from Certxa; anything about a team, staff, payroll, commission, turns or cash drawers (the app is one person's business). If asked, say kindly you can't do that here and where in the app they can (the Calendar for bookings, More → Settings for the rest). A paid booking is locked and can't be moved, edited, cancelled or deleted anywhere (check its status with list_appointments before pointing them to the Calendar).

WRITING THEIR ABOUT TEXT: when they ask for help with it, look at my_business first (their business type and any aboutText they already have, and say you'll replace it if there is one). Then ask these one at a time, one short question per message, in words that fit their craft, and let them skip any:
  1. How many years have you been doing this? (for example "How many years have you been doing nails?")
  2. What do clients come to you for most, or what are you best known for?
  3. Where did you train, or are you licensed? Only share what you'd like clients to see.
  4. How do you want clients to feel when they leave?
When you have their answers, write it: first person ("I"), warm and plain, 40 to 80 words. It must be true: use only what they told you and what my_business shows. Never add years, training, licences, awards, products, client numbers or promises they didn't give; if they skipped something, leave it out. No exaggeration like "the best" or "top-rated". Propose it with change_about_text, and in your reply say only: "Here's your About text. Tap Confirm to put it on your website, or tell me what to change." Don't repeat the text in your reply; the Confirm card shows it. If they ask for a change, propose the new version the same way.

BE BRIEF — owners read you on a phone between clients (owner, 2026-11-04: long answers are hard to read and not helpful):
- Answer in 1 to 3 short sentences, under 50 words (the About text itself may be longer). Lead with the answer itself (the number, the name, the time).
- A list only when it's truly a list (appointments, clients), at most 5 lines, one short item per line. Never list categories or everything you could look up.
- Don't add what you can't do unless they asked for it. No closing summaries or offers of more help, unless one short offer is genuinely useful (e.g. "Want me to draft a text to her?").
- "What can you do?" or similar: one sentence and three short examples, exactly like this, then stop:
  I look things up from your numbers, draft texts to clients, and change a few settings when you confirm. Try:
  - How much did I make this week?
  - Who haven't I seen in a while?
  - What's on tomorrow?
  For the full list, hold the Business AI title for help.

FORMAT: plain text only — no markdown, no asterisks, no headings. Short paragraphs or simple lines starting with "-". When you mention clients, use their full names exactly as the lookup gave them (the app turns them into buttons).

"HOW DO I…?" QUESTIONS: answer only from the HELP GUIDE below, giving the path the way the app shows it (for example "More → Settings → Business hours"). Never describe a screen, button or menu the guide doesn't give; if it isn't there, say you're not sure and that Certxa support can help.

HELP GUIDE:
${GUIDE}`;
}

/** Clients the answer names, from this turn's lookups: buttons that open their profile. Drafts: texts ready to send. */
function extrasOf(reply: string, results: { name: string; args: any; out: any }[]) {
  const seen = new Map<number, { id: number; name: string }>();
  for (const r of results) {
    const rows = r.name === "find_clients" && Array.isArray(r.out) ? r.out : [];
    for (const c of rows) if (c?.id && c?.name && reply.includes(String(c.name))) seen.set(Number(c.id), { id: Number(c.id), name: String(c.name) });
    if (r.name === "client_history" && r.out?.client && reply.includes(String(r.out.client))) seen.set(Number(r.args?.clientId), { id: Number(r.args?.clientId), name: String(r.out.client) });
  }
  const drafts = results.filter((r) => r.name === "draft_text" && r.out?.draft).map((r) => ({
    clientId: r.out.clientId, name: r.out.name, phone: r.out.phone, message: r.out.message,
  }));
  for (const d of drafts) seen.delete(Number(d.clientId)); // the draft card already opens that client
  return { clients: [...seen.values()].slice(0, 6), drafts: drafts.slice(0, 5) };
}

router.post("/api/pro-assistant/chat", isAuthenticated, async (req: Request, res: Response) => {
  const ctx = await ownerContext(req, res); if (!ctx) return;
  const message = String(req.body?.message ?? "").trim().slice(0, 2000);
  if (!message) return res.status(400).json({ message: "Type a question." });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ message: "Business AI is unavailable right now." });
  try {
    const info = (await pool.query(`SELECT l.name, l.timezone, u.first_name FROM locations l JOIN users u ON u.id = $2 WHERE l.id = $1`, [ctx.storeId, ctx.userId])).rows[0] ?? {};
    const tz = info.timezone || "UTC";
    const hour = Number(formatInTimeZone(new Date(), tz, "H"));
    const system = systemPrompt({
      business: info.name ?? "their business", firstName: String(info.first_name ?? "").trim().split(/\s+/)[0] || null,
      today: formatInTimeZone(new Date(), tz, "MMMM d, yyyy (yyyy-MM-dd)"), weekday: formatInTimeZone(new Date(), tz, "EEEE"),
      partOfDay: hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
    });
    const turn = await assistantTurn(req, ctx, {
      message, system, key, channel: "app", tools: TOOLS, guide: GUIDE,
      isChange: (n) => CHANGE_NAMES.has(n),
      ownTool: (n, a) => ownTool(req, ctx.storeId, n, a),
    });
    const extras = extrasOf(turn.reply, turn.toolResults as any);
    await pool.query(`UPDATE assistant_messages SET extras = $2::jsonb WHERE id = $1`, [turn.messageId, JSON.stringify(extras)]);
    return res.json({ reply: turn.reply, actions: turn.actions, ...extras });
  } catch (err: any) {
    console.error("[pro-assistant] chat failed:", err?.message);
    return res.status(500).json({ message: "Business AI is unavailable right now. Please try again shortly." });
  }
});

router.get("/api/pro-assistant/history", isAuthenticated, async (req: Request, res: Response) => {
  const ctx = await ownerContext(req, res); if (!ctx) return;
  const msgs = (await pool.query(
    `SELECT id, role, content, action_ids, extras, created_at FROM assistant_messages
      WHERE user_id = $1 AND store_id = $2 AND channel = 'app' ORDER BY id DESC LIMIT 40`, [ctx.userId, ctx.storeId])).rows.reverse();
  const ids = msgs.flatMap((m) => (Array.isArray(m.action_ids) ? m.action_ids : []));
  const acts = ids.length ? (await pool.query(`SELECT id, summary, status, result FROM assistant_actions WHERE id = ANY($1::int[]) AND user_id = $2`, [ids, ctx.userId])).rows : [];
  const byId = new Map(acts.map((a) => [a.id, a]));
  res.json(msgs.map((m) => ({
    id: m.id, role: m.role, content: m.content, createdAt: m.created_at,
    actions: (Array.isArray(m.action_ids) ? m.action_ids : []).map((id: number) => byId.get(id)).filter(Boolean),
    clients: m.extras?.clients ?? [], drafts: m.extras?.drafts ?? [],
  })));
});

export default router;

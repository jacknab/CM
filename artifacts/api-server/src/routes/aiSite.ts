/**
 * AI Website Builder API (owner, 2026-11-09; plans/ai-website-builder.md). For every signed-in account (Certxa Pro app
 * and salon dashboard).
 *   GET  /api/ai-site                         — credits, prices, the business facts, latest ideas + feedback, latest
 *                                               built site, and a job still running
 *   POST /api/ai-site/ideas                   — six new ideas (10 credits; "more": true uses the feedback) → { jobId }
 *   PUT  /api/ai-site/ideas/:roundId/:index   — Love it / Not this, a note and chips for one idea
 *   POST /api/ai-site/build                   — build the site from the loved ideas (15 credits) → { jobId }
 *   GET  /api/ai-site/jobs/:id                — a job's status; when done, the new round / site
 *   POST /api/ai-site/change                   — "Describe a change": a new version with only that change (2 credits,
 *                                               given back when nothing needed changing) → { jobId }
 *   POST /api/ai-site/research                — "What I found": Google, the old site and (with Claude) the web (5 credits)
 *                                               → { jobId }
 *   PUT  /api/ai-site/research/:id/answers/:qid — the owner's answer to a "which is right?" question; a phone number
 *                                               they pick is saved as the business phone
 *   GET  /api/ai-site/versions                 — every built/changed version, newest first, which one is online
 *   POST /api/ai-site/versions/:id/publish     — put that version online at <slug>.certxa.com (also "restore")
 *   POST /api/ai-site/unpublish                — back to the regular design
 *   GET  /api/public/store/:slug/ai-site[?preview=<token>] — the live AI site, or a version's private preview: its spec
 *                                               + the facts it shows, read now
 * AI steps run as background jobs (lib/aiSiteJobs.ts): they can take longer than the web server's 60 seconds. Credits
 * are charged when a job starts and given back if it fails.
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { AI_CREDIT_PRICES, aiCreditBalance, chargeAiCredits, NotEnoughCreditsError } from "../lib/aiCredits";
import { aiProvider } from "../lib/aiProvider";
import { siteFacts } from "../lib/aiSiteFacts";
import { sketchIdeas, type IdeaFeedback, type SiteIdea } from "../lib/aiSiteIdeas";
import { buildSite, type SiteSpec } from "../lib/aiSiteBuild";
import { changeSite } from "../lib/aiSiteChange";
import { refundAiCredits } from "../lib/aiCredits";
import { getJob, jobByKey, runningJob, startJob } from "../lib/aiSiteJobs";
import { researchBusiness, researchForPrompt, type Answer, type Found } from "../lib/aiSiteResearch";

const router = Router();
const CHIPS = ["colours", "letters", "layout", "words"] as const;

async function latestRound(storeId: number) {
  const round = (await pool.query(`SELECT id, ideas, created_at FROM ai_site_idea_rounds WHERE store_id = $1 ORDER BY id DESC LIMIT 1`, [storeId])).rows[0];
  if (!round) return null;
  const fb = (await pool.query(`SELECT idea_index, verdict, note, chips FROM ai_site_feedback WHERE round_id = $1`, [round.id])).rows;
  return {
    id: Number(round.id), createdAt: round.created_at, ideas: round.ideas as SiteIdea[],
    feedback: (round.ideas as SiteIdea[]).map((_, i) => {
      const f = fb.find((r: any) => Number(r.idea_index) === i);
      return { verdict: f?.verdict ?? null, note: f?.note ?? null, chips: f?.chips ?? [] };
    }),
  };
}

async function latestResearch(storeId: number): Promise<{ id: number; found: Found; answers: Record<string, Answer>; createdAt: string } | null> {
  const r = (await pool.query(`SELECT id, found, answers, created_at FROM ai_site_research WHERE store_id = $1 ORDER BY id DESC LIMIT 1`, [storeId])).rows[0];
  return r ? { id: Number(r.id), found: r.found, answers: r.answers ?? {}, createdAt: r.created_at } : null;
}
async function researchNotes(storeId: number): Promise<string> {
  const r = await latestResearch(storeId);
  return r ? researchForPrompt(r.found, r.answers) : "";
}

const versionView = (v: any) => ({
  id: Number(v.id), madeBy: v.made_by, note: v.note ?? null, createdAt: v.created_at, summary: v.spec?.summary ?? null,
  live: v.ai_site_live_version_id != null && Number(v.ai_site_live_version_id) === Number(v.id),
  previewUrl: v.booking_slug ? `https://${v.booking_slug}.certxa.com/?aiPreview=${v.preview_token}` : null,
});
async function versions(storeId: number, limit = 30) {
  const rows = (await pool.query(`SELECT v.id, v.spec, v.made_by, v.note, v.preview_token, v.created_at, l.booking_slug, l.ai_site_live_version_id
    FROM ai_site_versions v JOIN locations l ON l.id = v.store_id WHERE v.store_id = $1 ORDER BY v.id DESC LIMIT $2`, [storeId, limit])).rows;
  return rows.map(versionView);
}
async function latestVersion(storeId: number) {
  return (await versions(storeId, 1))[0] ?? null;
}
async function liveUrl(storeId: number): Promise<string | null> {
  const r = (await pool.query(`SELECT booking_slug, ai_site_live_version_id FROM locations WHERE id = $1`, [storeId])).rows[0];
  return r?.booking_slug ? `https://${r.booking_slug}.certxa.com` : null;
}

async function messages(storeId: number) {
  const rows = (await pool.query(`SELECT id, role, text, version_id, created_at FROM ai_site_messages WHERE store_id = $1 ORDER BY id DESC LIMIT 20`, [storeId])).rows;
  return rows.reverse().map((m: any) => ({ id: Number(m.id), role: m.role, text: m.text, versionId: m.version_id != null ? Number(m.version_id) : null, createdAt: m.created_at }));
}

async function storeOf(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(403).json({ error: "No business found for this account." }); return null; }
  return storeId;
}

router.get("/api/ai-site", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const [credits, facts, round, version, job, chat, research] = await Promise.all([aiCreditBalance(storeId), siteFacts(storeId), latestRound(storeId), latestVersion(storeId), runningJob(storeId), messages(storeId), latestResearch(storeId)]);
    const live = (await pool.query(`SELECT ai_site_live_version_id FROM locations WHERE id = $1`, [storeId])).rows[0]?.ai_site_live_version_id ?? null;
    return res.json({ available: aiProvider() != null, credits, prices: AI_CREDIT_PRICES, facts, round, version,
      liveVersionId: live != null ? Number(live) : null, siteUrl: await liveUrl(storeId), messages: chat, research,
      job: job && job.status === "running" ? { id: job.id, kind: job.kind } : null });
  } catch (err: any) {
    console.error("[ai-site] get", err?.message ?? err);
    return res.status(500).json({ error: "The website designer could not be opened." });
  }
});

/** Charge, then run `work` as a background job. A retried request (same key) gets the job it already started. */
async function startPaidJob(req: Request, res: Response, storeId: number, kind: string, price: number, reason: string, idempotencyKey: string, work: () => Promise<unknown>) {
  if (!aiProvider()) return res.status(503).json({ error: "The website designer isn't switched on yet." });
  const key = `${kind}:${storeId}:${idempotencyKey}`;
  const existing = await jobByKey(storeId, key);
  if (existing) return res.json({ jobId: existing.id, credits: await aiCreditBalance(storeId) });
  const busy = await runningJob(storeId);
  if (busy) return res.status(409).json({ error: "The designer is still working on your last request.", jobId: busy.id });
  try {
    const credits = await chargeAiCredits(storeId, price, reason, key);
    const jobId = await startJob(storeId, kind, key, work);
    return res.json({ jobId, credits });
  } catch (err: any) {
    if (err instanceof NotEnoughCreditsError) return res.status(402).json({ error: `This needs ${err.needed} credits; you have ${err.balance}.`, code: "NO_CREDITS" });
    console.error(`[ai-site] start ${kind}`, err?.message ?? err);
    return res.status(500).json({ error: "The designer could not start. Your credits were not used." });
  }
}

const startInput = z.object({ more: z.boolean().optional(), idempotencyKey: z.string().trim().min(8).max(80) }).strict();
router.post("/api/ai-site/ideas", isAuthenticated, async (req: Request, res: Response) => {
  const parsed = startInput.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const storeId = await storeOf(req, res); if (!storeId) return;
  const more = parsed.data.more === true;
  return startPaidJob(req, res, storeId, more ? "more-ideas" : "ideas", more ? AI_CREDIT_PRICES.moreIdeas : AI_CREDIT_PRICES.ideas,
    more ? "more website ideas" : "six website ideas", parsed.data.idempotencyKey, async () => {
      const facts = await siteFacts(storeId);
      let previous: IdeaFeedback[] = [];
      if (more) {
        const last = await latestRound(storeId);
        if (last) previous = last.ideas.map((idea, i) => ({ idea, ...last.feedback[i] }));
      }
      const ideas = await sketchIdeas(storeId, facts, previous, await researchNotes(storeId));
      const round = (await pool.query(`INSERT INTO ai_site_idea_rounds (store_id, facts, ideas) VALUES ($1, $2, $3) RETURNING id`,
        [storeId, JSON.stringify(facts), JSON.stringify(ideas)])).rows[0];
      return { roundId: Number(round.id) };
    });
});

router.post("/api/ai-site/build", isAuthenticated, async (req: Request, res: Response) => {
  const parsed = startInput.omit({ more: true }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const storeId = await storeOf(req, res); if (!storeId) return;
  const round = await latestRound(storeId);
  if (!round || !round.feedback.some((f) => f.verdict === "love")) return res.status(400).json({ error: "Mark at least one idea Love it first." });
  return startPaidJob(req, res, storeId, "build", AI_CREDIT_PRICES.build, "build the website", parsed.data.idempotencyKey, async () => {
    const facts = await siteFacts(storeId);
    const spec = await buildSite(storeId, facts, round.ideas.map((idea, i) => ({ idea, ...round.feedback[i] })), await researchNotes(storeId));
    const v = (await pool.query(`INSERT INTO ai_site_versions (store_id, spec, made_by, note, preview_token) VALUES ($1, $2, 'build', $3, $4) RETURNING id`,
      [storeId, JSON.stringify(spec), `Built from round ${round.id}`, crypto.randomBytes(18).toString("base64url")])).rows[0];
    return { versionId: Number(v.id) };
  });
});

const changeInput = z.object({
  message: z.string().trim().min(2).max(500),
  versionId: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(8).max(80),
}).strict();
router.post("/api/ai-site/change", isAuthenticated, async (req: Request, res: Response) => {
  const parsed = changeInput.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Describe the change in a few words." });
  const storeId = await storeOf(req, res); if (!storeId) return;
  // The version to change: the one asked for, else the newest.
  const base = (await pool.query(`SELECT id, spec FROM ai_site_versions WHERE store_id = $1 ${parsed.data.versionId ? "AND id = $2" : ""} ORDER BY id DESC LIMIT 1`,
    parsed.data.versionId ? [storeId, parsed.data.versionId] : [storeId])).rows[0];
  if (!base) return res.status(400).json({ error: "Build your site first." });
  const key = `change:${storeId}:${parsed.data.idempotencyKey}`;
  return startPaidJob(req, res, storeId, "change", AI_CREDIT_PRICES.edit, "website change", parsed.data.idempotencyKey, async () => {
    // Saved once the change has really started (not when it was refused for credits or a job already running).
    await pool.query(`INSERT INTO ai_site_messages (store_id, role, text) VALUES ($1, 'owner', $2)`, [storeId, parsed.data.message]);
    const out = await changeSite(storeId, await siteFacts(storeId), base.spec as SiteSpec, parsed.data.message);
    let versionId: number | null = null;
    if (out.changed) {
      versionId = Number((await pool.query(`INSERT INTO ai_site_versions (store_id, spec, made_by, note, preview_token) VALUES ($1, $2, 'change', $3, $4) RETURNING id`,
        [storeId, JSON.stringify(out.spec), parsed.data.message.slice(0, 300), crypto.randomBytes(18).toString("base64url")])).rows[0].id);
    } else {
      await refundAiCredits(storeId, key); // nothing needed changing: no charge
    }
    await pool.query(`INSERT INTO ai_site_messages (store_id, role, text, version_id) VALUES ($1, 'designer', $2, $3)`, [storeId, out.reply, versionId]);
    return { versionId, changed: out.changed };
  });
});

router.post("/api/ai-site/research", isAuthenticated, async (req: Request, res: Response) => {
  const parsed = startInput.omit({ more: true }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const storeId = await storeOf(req, res); if (!storeId) return;
  return startPaidJob(req, res, storeId, "research", AI_CREDIT_PRICES.research, "look the business up", parsed.data.idempotencyKey, async () => {
    const facts = await siteFacts(storeId);
    const loc = (await pool.query(`SELECT booking_slug, website, address, city, state, postcode FROM locations WHERE id = $1`, [storeId])).rows[0];
    // Google is searched with the real street even when the site keeps it private (it is never shown from here).
    const street = loc?.address ? [loc.address, loc.city, loc.state, loc.postcode].filter(Boolean).join(", ") : null;
    const found = await researchBusiness(storeId, facts, { ownSlug: loc?.booking_slug ?? null, street, website: loc?.website || null });
    const row = (await pool.query(`INSERT INTO ai_site_research (store_id, found) VALUES ($1, $2) RETURNING id`, [storeId, JSON.stringify(found)])).rows[0];
    return { researchId: Number(row.id) };
  });
});

const answerInput = z.object({
  choice: z.number().int().min(0).max(5).optional(),
  text: z.string().trim().min(1).max(200).optional(),
  skipped: z.boolean().optional(),
}).strict();
router.put("/api/ai-site/research/:id/answers/:qid", isAuthenticated, async (req: Request, res: Response) => {
  const parsed = answerInput.safeParse(req.body ?? {});
  const id = Number(req.params.id), qid = String(req.params.qid);
  if (!parsed.success || !Number.isInteger(id) || !/^[a-z0-9-]{1,20}$/.test(qid)) return res.status(400).json({ error: "Invalid request." });
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const r = (await pool.query(`SELECT found FROM ai_site_research WHERE id = $1 AND store_id = $2`, [id, storeId])).rows[0];
    const q = (r?.found as Found | undefined)?.questions.find((x) => x.id === qid);
    if (!q) return res.status(404).json({ error: "Question not found." });
    const a = parsed.data;
    if (a.choice != null && !q.options[a.choice]) return res.status(400).json({ error: "Invalid choice." });
    let phoneSaved: string | null = null;
    // The phone number the owner picks becomes their business phone (in the format the business already uses).
    if (q.topic === "phone" && a.choice != null && q.options[a.choice].phone) {
      const d = q.options[a.choice].phone!;
      const cur = String((await pool.query(`SELECT phone FROM locations WHERE id = $1`, [storeId])).rows[0]?.phone ?? "");
      if (cur.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "") !== d) {
        phoneSaved = cur.startsWith("+1") ? `+1 ${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
        await pool.query(`UPDATE locations SET phone = $2 WHERE id = $1`, [storeId, phoneSaved]);
      }
    }
    await pool.query(`UPDATE ai_site_research SET answers = answers || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1`, [id, qid, JSON.stringify(a)]);
    return res.json({ research: await latestResearch(storeId), facts: await siteFacts(storeId), phoneSaved });
  } catch (err: any) {
    console.error("[ai-site] answer", err?.message ?? err);
    return res.status(500).json({ error: "Could not save that." });
  }
});

router.get("/api/ai-site/jobs/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const job = await getJob(storeId, Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Not found." });
    const credits = await aiCreditBalance(storeId);
    if (job.status !== "done") return res.json({ status: job.status, error: job.error, credits });
    return res.json({ status: "done", credits, research: await latestResearch(storeId), round: await latestRound(storeId), version: await latestVersion(storeId), messages: await messages(storeId), result: job.result });
  } catch (err: any) {
    console.error("[ai-site] job", err?.message ?? err);
    return res.status(500).json({ error: "Could not check the designer." });
  }
});

router.get("/api/ai-site/versions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    return res.json({ versions: await versions(storeId), siteUrl: await liveUrl(storeId) });
  } catch (err: any) {
    console.error("[ai-site] versions", err?.message ?? err);
    return res.status(500).json({ error: "Could not load your versions." });
  }
});

// Put a version online: the live website at <slug>.certxa.com shows it from now on. Picking an older one is "restore".
router.post("/api/ai-site/versions/:id/publish", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    const slug = (await pool.query(`SELECT booking_slug FROM locations WHERE id = $1`, [storeId])).rows[0]?.booking_slug;
    if (!slug) return res.status(409).json({ error: "Set up your website link first (Settings › Website)." });
    const done = (await pool.query(`UPDATE locations SET ai_site_live_version_id = v.id FROM ai_site_versions v WHERE locations.id = $1 AND v.id = $2 AND v.store_id = $1 RETURNING v.id`, [storeId, id])).rows[0];
    if (!done) return res.status(404).json({ error: "Version not found." });
    return res.json({ versions: await versions(storeId), siteUrl: await liveUrl(storeId) });
  } catch (err: any) {
    console.error("[ai-site] publish", err?.message ?? err);
    return res.status(500).json({ error: "Your site could not be put online." });
  }
});

// Back to the regular design (the one chosen in Settings › Website). The AI versions are kept.
router.post("/api/ai-site/unpublish", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    await pool.query(`UPDATE locations SET ai_site_live_version_id = NULL WHERE id = $1`, [storeId]);
    return res.json({ versions: await versions(storeId), siteUrl: await liveUrl(storeId) });
  } catch (err: any) {
    console.error("[ai-site] unpublish", err?.message ?? err);
    return res.status(500).json({ error: "Could not switch back." });
  }
});

const feedbackInput = z.object({
  verdict: z.enum(["love", "not"]).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  chips: z.array(z.enum(CHIPS)).max(4).optional(),
}).strict();
router.put("/api/ai-site/ideas/:roundId/:index", isAuthenticated, async (req: Request, res: Response) => {
  const parsed = feedbackInput.safeParse(req.body ?? {});
  const roundId = Number(req.params.roundId), index = Number(req.params.index);
  if (!parsed.success || !Number.isInteger(roundId) || !Number.isInteger(index) || index < 0 || index > 11) return res.status(400).json({ error: "Invalid request." });
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const own = (await pool.query(`SELECT jsonb_array_length(ideas) AS n FROM ai_site_idea_rounds WHERE id = $1 AND store_id = $2`, [roundId, storeId])).rows[0];
    if (!own || index >= Number(own.n)) return res.status(404).json({ error: "Idea not found." });
    const d = parsed.data;
    await pool.query(
      `INSERT INTO ai_site_feedback (round_id, idea_index, verdict, note, chips) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (round_id, idea_index) DO UPDATE SET
         verdict = CASE WHEN $6 THEN EXCLUDED.verdict ELSE ai_site_feedback.verdict END,
         note = CASE WHEN $7 THEN EXCLUDED.note ELSE ai_site_feedback.note END,
         chips = CASE WHEN $8 THEN EXCLUDED.chips ELSE ai_site_feedback.chips END, updated_at = now()`,
      [roundId, index, d.verdict ?? null, d.note ?? null, d.chips ?? [], d.verdict !== undefined, d.note !== undefined, d.chips !== undefined]);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[ai-site] feedback", err?.message ?? err);
    return res.status(500).json({ error: "Could not save that." });
  }
});

// ── The private preview of a built site (opened from the app). The spec plus the facts it shows, read now. ──
const previewLimiter = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });
router.get("/api/public/store/:slug/ai-site", previewLimiter, async (req: Request, res: Response) => {
  try {
    // ?preview=<token>: that version, privately. No token: the version that is online, if any.
    const token = String(req.query.preview ?? "");
    const v = token
      ? (await pool.query(`SELECT v.store_id, v.spec FROM ai_site_versions v JOIN locations l ON l.id = v.store_id
          WHERE v.preview_token = $1 AND lower(l.booking_slug) = lower($2)`, [token, String(req.params.slug)])).rows[0]
      : (await pool.query(`SELECT v.store_id, v.spec FROM locations l JOIN ai_site_versions v ON v.id = l.ai_site_live_version_id
          WHERE lower(l.booking_slug) = lower($1)`, [String(req.params.slug)])).rows[0];
    if (!v) return res.status(404).json({ error: token ? "This preview link has expired." : "Not found." });
    const storeId = Number(v.store_id);
    const [facts, photos] = await Promise.all([
      siteFacts(storeId),
      pool.query(`SELECT image_url, caption FROM wb_gallery_photos WHERE store_id = $1 AND COALESCE(show_on_website, true) AND image_url IS NOT NULL ORDER BY sort_order NULLS LAST, id DESC LIMIT 12`, [storeId]),
    ]);
    res.setHeader("Cache-Control", "no-store");
    if (token) res.setHeader("X-Robots-Tag", "noindex");
    const { missing: _missing, sources: _sources, ...shown } = facts;
    return res.json({ spec: v.spec, facts: { ...shown, photoUrls: photos.rows.map((p: any) => ({ url: p.image_url, caption: p.caption ?? null })) } });
  } catch (err: any) {
    console.error("[ai-site] preview", err?.message ?? err);
    return res.status(500).json({ error: "The preview could not be opened." });
  }
});

export default router;

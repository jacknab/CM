/**
 * routes/supportFeed.ts — the support team's Home feed
 *
 * A platform admin writes posts on /isadmin → Support Feed. The support back office (/isTeam)
 * shows them on its Home page, newest first. Agents can only read: there is no endpoint for an
 * agent to post, edit or comment.
 *
 * Support back office (support agent session):
 *   GET    /api/support/feed              the posts, newest first
 *
 * Platform admin (signed-in user with users.is_admin):
 *   GET    /api/admin/support-feed        the same list, for the editor
 *   POST   /api/admin/support-feed        { title, body }
 *   PATCH  /api/admin/support-feed/:id    { title, body }
 *   DELETE /api/admin/support-feed/:id
 *
 * This router is mounted ahead of the global /api gate (next to the support router), so the admin
 * endpoints check for a platform admin themselves, the same way the gate does for /api/admin/*.
 */

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { requireSupportAuth } from "../lib/supportAuth";

const router = Router();

const MAX_TITLE = 200;
const MAX_BODY = 20000;
const FEED_LIMIT = 200;

const POST_COLUMNS = `id, title, body, author_name AS "authorName", created_at AS "createdAt", updated_at AS "updatedAt"`;
const NEWEST_FIRST = `ORDER BY created_at DESC, id DESC LIMIT ${FEED_LIMIT}`;

type Admin = { id: string; name: string };
const adminOf = (req: Request) => (req as Request & { feedAdmin: Admin }).feedAdmin;

async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Admin access required" });
  try {
    const r = await pool.query(`SELECT id, first_name, last_name, email, is_admin FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const u = r.rows[0];
    if (!u?.is_admin) return res.status(403).json({ error: "Forbidden — platform admin access required" });
    (req as Request & { feedAdmin: Admin }).feedAdmin = {
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Admin",
    };
    next();
  } catch (err) {
    console.error("[support-feed] admin check failed:", (err as Error)?.message);
    res.status(500).json({ error: "Could not verify admin access" });
  }
}

/** Title and body from the request, trimmed. Null (after answering 400) when either is missing or too long. */
function readPost(req: Request, res: Response): { title: string; body: string } | null {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!title || !body) { res.status(400).json({ error: "A post needs a title and some text." }); return null; }
  if (title.length > MAX_TITLE) { res.status(400).json({ error: `The title can be at most ${MAX_TITLE} characters.` }); return null; }
  if (body.length > MAX_BODY) { res.status(400).json({ error: `The post can be at most ${MAX_BODY} characters.` }); return null; }
  return { title, body };
}

// ── Support back office ──────────────────────────────────────────────────────

router.get("/api/support/feed", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(`SELECT ${POST_COLUMNS} FROM support_feed_posts ${NEWEST_FIRST}`);
    res.json(r.rows);
  } catch (err) {
    console.error("[support-feed] list failed:", (err as Error)?.message);
    res.status(500).json({ error: "Failed to load the feed" });
  }
});

// ── Platform admin ───────────────────────────────────────────────────────────

router.get("/api/admin/support-feed", requirePlatformAdmin, async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(`SELECT ${POST_COLUMNS} FROM support_feed_posts ${NEWEST_FIRST}`);
    res.json(r.rows);
  } catch (err) {
    console.error("[support-feed] admin list failed:", (err as Error)?.message);
    res.status(500).json({ error: "Failed to load posts" });
  }
});

router.post("/api/admin/support-feed", requirePlatformAdmin, async (req: Request, res: Response) => {
  const post = readPost(req, res);
  if (!post) return;
  try {
    const r = await pool.query(
      `INSERT INTO support_feed_posts (title, body, author_name) VALUES ($1, $2, $3) RETURNING ${POST_COLUMNS}`,
      [post.title, post.body, adminOf(req).name],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[support-feed] create failed:", (err as Error)?.message);
    res.status(500).json({ error: "Failed to publish the post" });
  }
});

router.patch("/api/admin/support-feed/:id", requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid post id" });
  const post = readPost(req, res);
  if (!post) return;
  try {
    // created_at is left alone: an edited post keeps its place in the feed.
    const r = await pool.query(
      `UPDATE support_feed_posts SET title = $2, body = $3, updated_at = now() WHERE id = $1 RETURNING ${POST_COLUMNS}`,
      [id, post.title, post.body],
    );
    if (!r.rows.length) return res.status(404).json({ error: "Post not found" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[support-feed] update failed:", (err as Error)?.message);
    res.status(500).json({ error: "Failed to save the post" });
  }
});

router.delete("/api/admin/support-feed/:id", requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid post id" });
  try {
    const r = await pool.query(`DELETE FROM support_feed_posts WHERE id = $1 RETURNING id`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: "Post not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[support-feed] delete failed:", (err as Error)?.message);
    res.status(500).json({ error: "Failed to delete the post" });
  }
});

export default router;

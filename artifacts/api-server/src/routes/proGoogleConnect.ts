/**
 * Connecting Google Business Profile from the Certxa Pro app (owner, 2026-11-11), on Certxa's own page, the same way
 * card payment setup works (routes/proPaymentsSetup.ts):
 *   POST /api/google-business/app-connect-link (app)  → { url }  a single-use, 15-minute link
 *   GET  /pro-google-connect/start?code=…      (web)  → signs the owner in for this page only, then
 *        /pro-google-connect?storeId=…               → Google's sign-in (business.manage), choosing the business,
 *                                                      then certxa-pro://google-business, which closes it in the app.
 * Once connected, the owner's Google reviews show on their website and in the app's Reviews (lib/reviewLinks.ts).
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { claimAppWebLink, startAppWebSession } from "../lib/appWebSession";

const router = Router();
const SITE = () => (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

router.post("/api/google-business/app-connect-link", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    const userId = (req.session as any)?.userId;
    if (!storeId || !userId) return res.status(401).json({ error: "Please sign in again" });
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query(
      `INSERT INTO app_web_links (token_hash, user_id, store_id, purpose, expires_at) VALUES ($1, $2, $3, 'google-connect', now() + interval '15 minutes')`,
      [hash(token), userId, storeId]);
    return res.json({ url: `${SITE()}/pro-google-connect/start?code=${token}` });
  } catch (err: any) {
    console.error("[pro-google-connect/link]", err?.message ?? err);
    return res.status(500).json({ error: "We couldn't open Google. Please try again." });
  }
});

router.get("/pro-google-connect/start", async (req: Request, res: Response) => {
  const code = String(req.query.code ?? "");
  const fail = () => res.redirect(302, "/pro-google-connect?link=expired");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return fail();
  try {
    const row = await claimAppWebLink(req, hash(code), 'google-connect');
    if (!row?.user_id || !row.store_id) return fail();
    startAppWebSession(req, res, row.user_id, row.store_id, `/pro-google-connect?storeId=${Number(row.store_id)}`, fail);
  } catch (err: any) {
    console.error("[pro-google-connect/start]", err?.message ?? err);
    return fail();
  }
});

export default router;

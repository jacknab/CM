/**
 * Card payment setup for the Certxa Pro app, on Certxa's own page (owner, 2026-11-10): the same embedded Stripe
 * onboarding the website uses (ConnectAccountOnboarding), instead of Stripe's hosted pages. The app opens
 * certxa.com/pro-payments-setup in its in-app browser, already signed in through a one-time link:
 *   POST /api/payments/stripe/app-setup-link  (app)  → { url }   a single-use, 15-minute link
 *   GET  /pro-payments-setup/start?code=…     (web)  → signs the owner in, then /pro-payments-setup
 * The page asks POST /api/payments/stripe/account-session for the embedded form, and sends the browser to
 * certxa-pro://payments-setup when the owner is done, which closes it in the app. The sign-in is the narrow,
 * browser-session-only kind the app's billing pages use (lib/appWebSession.ts).
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { startAppWebSession } from "../lib/appWebSession";

const router = Router();
const SITE = () => (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");
const LINK_MINUTES = 15;
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

router.post("/api/payments/stripe/app-setup-link", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    const userId = (req.session as any)?.userId;
    if (!storeId || !userId) return res.status(401).json({ error: "Please sign in again" });
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query(`DELETE FROM app_web_links WHERE expires_at < now() - interval '1 day'`).catch(() => {});
    await pool.query(
      `INSERT INTO app_web_links (token_hash, user_id, store_id, purpose, expires_at) VALUES ($1, $2, $3, 'payments-setup', now() + ($4 || ' minutes')::interval)`,
      [hash(token), userId, storeId, String(LINK_MINUTES)],
    );
    return res.json({ url: `${SITE()}/pro-payments-setup/start?code=${token}` });
  } catch (err: any) {
    console.error("[pro-payments-setup/link]", err?.message ?? err);
    return res.status(500).json({ error: "We couldn't open payment setup. Please try again." });
  }
});

router.get("/pro-payments-setup/start", async (req: Request, res: Response) => {
  const code = String(req.query.code ?? "");
  const fail = () => res.redirect(302, "/pro-payments-setup?link=expired");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return fail();
  try {
    // Used once: the update only succeeds for an unused, unexpired link.
    const r = await pool.query(
      `UPDATE app_web_links SET used_at = now() WHERE token_hash = $1 AND purpose = 'payments-setup' AND used_at IS NULL AND expires_at > now()
       RETURNING user_id, store_id`,
      [hash(code)],
    );
    const userId = r.rows[0]?.user_id;
    if (!userId) return fail();
    startAppWebSession(req, res, userId, r.rows[0].store_id ?? null, "/pro-payments-setup", fail);
  } catch (err: any) {
    console.error("[pro-payments-setup/start]", err?.message ?? err);
    return fail();
  }
});

export default router;

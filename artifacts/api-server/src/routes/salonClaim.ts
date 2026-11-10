/**
 * The claim page's server side (certxa.com/claim/<token>, booking pages/ClaimSalon.tsx; lib/salonClaim.ts):
 *   GET  /api/salon-claim/:token           the salon, its masked phone, and how far the claim has got
 *   POST /api/salon-claim/:token/call      calls the salon's listed number and reads out a 6-digit code
 *   POST /api/salon-claim/:token/verify    { code } proves the salon is theirs
 *   POST /api/salon-claim/:token/complete  moves the prepared account to the signed-in Certxa Salon login
 */
import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { callClaimCode, checkClaimCode, completeSalonClaim, loadClaimLink, maskPhone } from "../lib/salonClaim";

const router = Router();

type Link = NonNullable<Awaited<ReturnType<typeof loadClaimLink>>>;

async function linkOr404(req: Request, res: Response): Promise<Link | null> {
  const link = await loadClaimLink(String(req.params.token ?? "")).catch(() => null);
  if (!link) { res.status(404).json({ state: "invalid", message: "This claim link isn't valid. Call Certxa at (888) 814-7623 for a new one." }); return null; }
  return link;
}

const stateOf = (link: Link) =>
  link.status === "claimed" || link.claimed_at || link.used_at ? "claimed"
    : new Date(link.expires_at) < new Date() ? "expired"
      : link.verified_at ? "verified" : "ready";

router.get("/api/salon-claim/:token", async (req: Request, res: Response) => {
  const link = await linkOr404(req, res);
  if (!link) return;
  const userId = (req.session as any)?.userId as string | undefined;
  const user = userId
    ? (await pool.query(`SELECT u.email, u.account_type, EXISTS (SELECT 1 FROM locations l WHERE l.user_id = u.id) AS has_store
                           FROM users u WHERE u.id = $1 AND u.unclaimed_at IS NULL`, [userId])).rows[0] ?? null
    : null;
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    state: stateOf(link),
    salon: { name: link.name, address: link.address, phone: maskPhone(link.phone), pageUrl: `https://${link.booking_slug}.certxa.com/` },
    // A signed-in Certxa Salon login with no business yet can take the salon as it is.
    signedIn: user ? { email: user.email, canClaim: user.account_type !== "certxa_pro" && !user.has_store } : null,
  });
});

router.post("/api/salon-claim/:token/call", async (req: Request, res: Response) => {
  const link = await linkOr404(req, res);
  if (!link) return;
  if (stateOf(link) !== "ready") return res.status(409).json({ message: stateOf(link) === "verified" ? "The salon is already confirmed." : "This link can no longer be used." });
  const result = await callClaimCode(link);
  return result.ok ? res.json({ ok: true }) : res.status(result.status).json({ message: result.message });
});

router.post("/api/salon-claim/:token/verify", async (req: Request, res: Response) => {
  const link = await linkOr404(req, res);
  if (!link) return;
  if (stateOf(link) !== "ready") return res.status(409).json({ message: "This link can no longer be used." });
  const result = await checkClaimCode(link, String(req.body?.code ?? ""));
  return result.ok ? res.json({ ok: true }) : res.status(result.status).json({ message: result.message });
});

router.post("/api/salon-claim/:token/complete", async (req: Request, res: Response) => {
  const link = await linkOr404(req, res);
  if (!link) return;
  if (stateOf(link) !== "verified") return res.status(409).json({ message: "Confirm the code from the salon's phone first." });
  const userId = (req.session as any)?.userId as string | undefined;
  if (!userId) return res.status(401).json({ message: "Create your login first." });
  const result = await completeSalonClaim(link, userId);
  return result.ok ? res.json({ ok: true, storeId: result.storeId }) : res.status(result.status).json({ message: result.message });
});

export default router;

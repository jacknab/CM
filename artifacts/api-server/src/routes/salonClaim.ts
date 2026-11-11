/**
 * The claim page's server side (certxa.com/claim/<token>, booking pages/ClaimSalon.tsx; lib/salonClaim.ts):
 *   GET  /api/salon-claim/:token           the salon, its masked phone, and how far the claim has got
 *   POST /api/salon-claim/:token/call      calls the salon's listed number and reads out a 6-digit code
 *   POST /api/salon-claim/:token/verify    { code } proves the salon is theirs
 *   POST /api/salon-claim/:token/complete  moves the prepared account to the signed-in Certxa Salon login
 * Claiming online at the salon (owner, 2026-11-11; booking pages/ClaimAtSalon.tsx, certxa.com/claim/salon/<slug>):
 *   GET  /api/salon-claim/salon/:slug       the salon's name, address and listed phone, and whether it can be claimed
 *   POST /api/salon-claim/salon/:slug/here  { latitude, longitude, accuracy } → a claim link's token when at the salon
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { callClaimCode, checkClaimCode, claimLinkAtSalon, completeSalonClaim, loadClaimLink, maskPhone, preparedSalonBySlug } from "../lib/salonClaim";

const router = Router();
const hereLimiter = rateLimit({ windowMs: 10 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { message: "Too many tries. Wait a few minutes and try again." } });

/** "(520) 326-7627": the salon's listed number, as on its page. */
const prettyPhone = (raw: string | null) => {
  const d = String(raw ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
};

router.get("/api/salon-claim/salon/:slug", async (req: Request, res: Response) => {
  const salon = await preparedSalonBySlug(String(req.params.slug ?? "")).catch(() => null);
  if (!salon) return res.status(404).json({ state: "invalid", message: "We couldn't find this salon's page." });
  res.setHeader("Cache-Control", "no-store");
  return res.json({ state: salon.state, salon: { name: salon.name, address: salon.address, phone: prettyPhone(salon.phone) } });
});

router.post("/api/salon-claim/salon/:slug/here", hereLimiter, async (req: Request, res: Response) => {
  const latitude = Number(req.body?.latitude), longitude = Number(req.body?.longitude), accuracy = Number(req.body?.accuracy);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return res.status(400).json({ message: "We didn't get your location. Please try again." });
  }
  const result = await claimLinkAtSalon(String(req.params.slug ?? ""), { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : 0 });
  return result.ok ? res.json({ token: result.token }) : res.status(result.status).json({ message: result.message, code: result.code });
});

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

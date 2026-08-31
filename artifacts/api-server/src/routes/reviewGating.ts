/**
 * Public review-gating API — powers the SMS review-request flow.
 *
 * A customer taps a one-time link (POST /api/reviews/gate/validate to load
 * it, POST /api/reviews/gate/submit to record their response). Great / Just
 * OK redirect out to the store's real Google/Yelp page; Bad stays on Certxa
 * and is stored privately instead — mirrors the review-gating pattern from
 * the standalone `/opt/review` app.
 *
 * Review content itself is stored in the existing `reviews` table (the same
 * one the pre-existing /api/reviews/form/:appointmentId + /api/reviews/submit
 * flow uses) — only the token layer in front of it is new, replacing a raw
 * appointment id in the URL with a secure, one-time, expiring link.
 *
 * Fully public / unauthenticated — see the exemptions for
 * "/reviews/gate/validate" and "/reviews/gate/submit" in routes.ts.
 */

import { Router, Request, Response, NextFunction } from "express";
import { db, pool } from "../db";
import { reviews } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getReviewToken, resolveExternalReviewUrl, markReviewTokenUsed } from "../lib/reviewLinks";

const router = Router();

const TIER_RATING: Record<string, number> = { great: 5, ok: 3, bad: 1 };
const TIER_LABEL: Record<string, string> = { great: "Great", ok: "Just OK", bad: "Bad" };

const SITE_ORIGIN = (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");

// ── Direct Google-review redirect (no rating funnel / no gating) ───────────
//   GET /review/:token  — the per-customer link sent in the review-request SMS
//   GET /r/:slug        — the salon's permanent, shareable review link
//                         (front-desk QR code, Instagram bio, receipts, …)
//
// Both send the visitor straight to the store's real Google review page.
// Everyone gets the same public path — no "rate us privately first" step —
// which is what Google's review policies and the FTC require. The token still
// exists purely for attribution (which appointment / customer the click came
// from); it no longer changes where the visitor lands.

async function redirectToGoogleReview(res: Response, storeId: number, fallbackSlug?: string | null): Promise<void> {
  const url = await resolveExternalReviewUrl(storeId);
  if (url) { res.redirect(302, url); return; }
  // No Google destination configured yet — land somewhere useful, not an error.
  res.redirect(302, fallbackSlug ? `${SITE_ORIGIN}/${encodeURIComponent(fallbackSlug)}` : `${SITE_ORIGIN}/`);
}

router.get("/review/:token", async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params.token || "");
  // Legacy numeric links (/review/:appointmentId → SPA ReviewSubmit page).
  if (/^\d+$/.test(token)) return next();
  try {
    const row = await getReviewToken(token);
    if (!row) { res.redirect(302, `${SITE_ORIGIN}/`); return; }
    if (!row.usedAt) await markReviewTokenUsed(row.id).catch(() => {});
    await redirectToGoogleReview(res, row.storeId, null);
  } catch (e: any) {
    console.error("[ReviewRedirect] /review/:token error:", e?.message ?? e);
    res.redirect(302, `${SITE_ORIGIN}/`);
  }
});

router.get("/r/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!slug) { res.redirect(302, `${SITE_ORIGIN}/`); return; }
  try {
    const { rows } = await pool.query(
      `SELECT id, booking_slug FROM locations WHERE lower(booking_slug) = $1 LIMIT 1`,
      [slug],
    );
    if (!rows[0]) { res.redirect(302, `${SITE_ORIGIN}/`); return; }
    await redirectToGoogleReview(res, rows[0].id, rows[0].booking_slug);
  } catch (e: any) {
    console.error("[ReviewRedirect] /r/:slug error:", e?.message ?? e);
    res.redirect(302, `${SITE_ORIGIN}/`);
  }
});

router.post("/api/reviews/gate/validate", async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) return res.json({ valid: false, error: "Token required" });

  try {
    const row = await getReviewToken(token);
    if (!row) return res.json({ valid: false, error: "Invalid review link" });
    if (row.usedAt) return res.json({ valid: false, error: "This review link has already been used" });
    if (row.expiresAt < new Date()) return res.json({ valid: false, error: "This review link has expired" });

    return res.json({
      valid: true,
      storeId: row.storeId,
      appointmentId: row.appointmentId,
      storeName: row.storeName,
    });
  } catch (e: any) {
    console.error("[ReviewGating] validate error:", e?.message ?? e);
    return res.status(500).json({ valid: false, error: "Server error" });
  }
});

router.post("/api/reviews/gate/submit", async (req: Request, res: Response) => {
  const { token, tier, comment, photoUrl, rating } = req.body as {
    token?: string;
    tier?: string;
    comment?: string;
    photoUrl?: string;
    rating?: number; // 1-5, only used for tier "bad" (its own star picker on the feedback page)
  };

  if (!token || !tier) return res.status(400).json({ ok: false, error: "token and tier are required" });
  if (!(tier in TIER_RATING)) return res.status(400).json({ ok: false, error: "Invalid tier" });

  try {
    const row = await getReviewToken(token);
    if (!row) return res.status(404).json({ ok: false, error: "Invalid review link" });
    if (row.usedAt) return res.status(409).json({ ok: false, error: "This review link has already been used" });
    if (row.expiresAt < new Date()) return res.status(410).json({ ok: false, error: "This review link has expired" });

    if (tier === "bad") {
      const wordCount = (comment ?? "").trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 4) {
        return res.status(400).json({ ok: false, error: "Please enter at least 4 words for your review" });
      }
    }

    // Great/OK never collect a written comment on this flow — they redirect
    // straight out to the public review site, same as the source pattern.
    // Bad has its own 1-5 star picker on the feedback page.
    const isBad = tier === "bad";
    const badRating = Number.isInteger(rating) && rating! >= 1 && rating! <= 5 ? rating! : TIER_RATING.bad;

    await db.insert(reviews).values({
      storeId: row.storeId,
      customerId: row.customerId,
      appointmentId: row.appointmentId,
      staffId: null,
      rating: isBad ? badRating : TIER_RATING[tier],
      comment: isBad ? comment!.trim() : TIER_LABEL[tier],
      customerName: row.customerName,
      serviceName: null,
      staffName: null,
      photoUrl: isBad ? (photoUrl || null) : null,
      // Bad reviews never auto-publish to the salon's own public testimonial
      // widget — that's the whole point of the gate. Owners can still see
      // and manually flip isPublic later via the existing /api/reviews/:id.
      isPublic: !isBad,
      isFeatured: false,
    });

    await markReviewTokenUsed(row.id);

    if (!isBad) {
      const externalReviewUrl = await resolveExternalReviewUrl(row.storeId);
      if (externalReviewUrl) return res.json({ ok: true, redirectUrl: externalReviewUrl });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("[ReviewGating] submit error:", e?.message ?? e);
    return res.status(500).json({ ok: false, error: "Failed to submit review" });
  }
});

export default router;

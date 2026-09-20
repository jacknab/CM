/**
 * Public review link API — powers the SMS/email review-request flow, and
 * branches per store between two engines:
 *
 *   - Store has a Google review destination (resolveExternalReviewUrl):
 *     GET /review/:token 302-redirects straight to Google. Every visitor
 *     gets the same public path, no "rate us privately first" step — what
 *     Google's review policies and the FTC require.
 *   - Store has none (the common case for salons without a connected Google
 *     Business Profile): falls through to the SPA, which renders Certxa's
 *     own native review form at this same URL, backed by
 *     POST /api/reviews/gate/validate + /api/reviews/gate/submit below.
 *     Same direct-to-public principle — every rating (1-5) is always
 *     published (isPublic: true), no sentiment-based filtering. An earlier
 *     version of this endpoint implemented a great/ok/bad tri-state funnel
 *     that silently hid "bad" reviews from public view; that design was
 *     deliberately replaced, not extended.
 *
 * Review content itself is stored in the existing `reviews` table (the same
 * one the pre-existing /api/reviews/form/:appointmentId + /api/reviews/submit
 * flow uses) — the token layer just replaces a raw appointment id in the URL
 * with a secure, one-time, expiring link.
 *
 * Fully public / unauthenticated — see the exemptions for
 * "/reviews/gate/validate" and "/reviews/gate/submit" in routes.ts.
 */

import { Router, Request, Response, NextFunction } from "express";
import { db, pool } from "../db";
import { reviews, appointments, services, staff } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getReviewToken, resolveExternalReviewUrl, markReviewTokenUsed } from "../lib/reviewLinks";

const router = Router();

const SITE_ORIGIN = (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");

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
    const externalUrl = await resolveExternalReviewUrl(row.storeId);
    if (externalUrl) {
      if (!row.usedAt) await markReviewTokenUsed(row.id).catch(() => {});
      res.redirect(302, externalUrl);
      return;
    }
    // No Google/external destination — this store's default review engine
    // is Certxa's own native, direct-to-public form. Don't mark the token
    // used here; the visitor hasn't submitted anything yet (marked used on
    // actual submission, in /api/reviews/gate/submit below). Fall through to
    // the SPA, which renders the native review form at this same URL.
    return next();
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
    // No token/appointment context on this standing link (QR code, bio link)
    // — unlike /review/:token, there's no specific appointment to attach a
    // native review to, and the native review form requires one. Left as the
    // original store-page fallback rather than building appointment-less
    // review submission, which is a separate, unscoped capability.
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

    // Same appointment context GET /api/reviews/form/:appointmentId already
    // returns, so the native review form can show "How was your {service}
    // with {staff} on {date}?" — joined here since a token only carries
    // storeId/appointmentId, not the fuller appointment details.
    let serviceName: string | null = null, staffName: string | null = null, date: Date | null = null;
    if (row.appointmentId) {
      const [apt] = await db
        .select({ date: appointments.date, serviceName: services.name, staffName: staff.name })
        .from(appointments)
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(eq(appointments.id, row.appointmentId));
      if (apt) { serviceName = apt.serviceName; staffName = apt.staffName; date = apt.date; }
    }

    return res.json({
      valid: true,
      storeId: row.storeId,
      appointmentId: row.appointmentId,
      storeName: row.storeName,
      customerName: row.customerName,
      serviceName,
      staffName,
      date,
    });
  } catch (e: any) {
    console.error("[ReviewGating] validate error:", e?.message ?? e);
    return res.status(500).json({ valid: false, error: "Server error" });
  }
});

// Certxa's own native, direct-to-public review form for salons without a
// Google review destination — see GET /review/:token above for the branch
// that lands a visitor here. Every rating (1-5) is treated identically and
// always published (isPublic: true) — no sentiment-based gating/suppression.
// This intentionally replaced an earlier great/ok/bad tri-state design that
// silently hid "bad" reviews from public view; that pattern is not used here.
router.post("/api/reviews/gate/submit", async (req: Request, res: Response) => {
  const { token, rating, comment, photoUrl } = req.body as {
    token?: string;
    rating?: number;
    comment?: string;
    photoUrl?: string;
  };

  if (!token) return res.status(400).json({ ok: false, error: "token is required" });
  if (!Number.isInteger(rating) || rating! < 1 || rating! > 5) {
    return res.status(400).json({ ok: false, error: "rating must be an integer 1-5" });
  }

  try {
    const row = await getReviewToken(token);
    if (!row) return res.status(404).json({ ok: false, error: "Invalid review link" });
    if (row.usedAt) return res.status(409).json({ ok: false, error: "This review link has already been used" });
    if (row.expiresAt < new Date()) return res.status(410).json({ ok: false, error: "This review link has expired" });

    // Same service/staff lookup as /api/reviews/submit's appointmentId-based
    // flow, and the same context /api/reviews/gate/validate already fetches
    // for the form itself — captured here too so it's stored with the review
    // and can be shown alongside it wherever reviews are displayed.
    let staffId: number | null = null, serviceName: string | null = null, staffName: string | null = null;
    if (row.appointmentId) {
      const [apt] = await db
        .select({ staffId: appointments.staffId, serviceName: services.name, staffName: staff.name })
        .from(appointments)
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(eq(appointments.id, row.appointmentId));
      if (apt) { staffId = apt.staffId; serviceName = apt.serviceName; staffName = apt.staffName; }
    }

    await db.insert(reviews).values({
      storeId: row.storeId,
      customerId: row.customerId,
      appointmentId: row.appointmentId,
      staffId,
      rating: rating!,
      comment: comment?.trim() || null,
      // Locked to the token's own record, same as the appointmentId-based
      // /api/reviews/submit flow — never taken from the request body, so a
      // reviewer can't submit under a fabricated name.
      customerName: row.customerName,
      serviceName,
      staffName,
      photoUrl: photoUrl || null,
      isPublic: true,
      isFeatured: false,
    });

    await markReviewTokenUsed(row.id);

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("[ReviewGating] submit error:", e?.message ?? e);
    return res.status(500).json({ ok: false, error: "Failed to submit review" });
  }
});

export default router;

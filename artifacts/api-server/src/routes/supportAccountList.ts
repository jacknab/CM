/**
 * routes/supportAccountList.ts — the account lists behind the support sidebar's Accounts menu
 *
 *   GET /api/support/accounts?status=all|active|trial|suspended     (support agent session)
 *
 * The lists, and why an account can appear in more than one:
 *   all         every account
 *   active      account status is Active (not suspended). Says nothing about billing, so an account
 *               on a free trial is Active too.
 *   trial       the owner is on a free trial, whatever the account status
 *   suspended   account status is Suspended
 *
 * Rows have the same shape as GET /api/support/search, so the same row rendering works for both.
 * Read-only.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../db";
import { requireSupportAuth } from "../lib/supportAuth";

const router = Router();

const LIMIT = 500;

const FILTERS: Record<string, string> = {
  all: "TRUE",
  active: "COALESCE(l.account_status, 'Active') = 'Active'",
  trial: "(u.subscription_status = 'trial' OR s.status IN ('trial', 'trialing'))",
  suspended: "l.account_status = 'Suspended'",
};

router.get("/api/support/accounts", requireSupportAuth, async (req: Request, res: Response) => {
  const status = String(req.query.status ?? "all").toLowerCase();
  const filter = FILTERS[status];
  if (!filter) return res.status(400).json({ error: "Unknown status" });
  try {
    // An account can have more than one subscriptions row over time: take the latest, so each
    // account is listed once.
    const rows = await pool.query(
      `SELECT l.id, l.name AS business_name, l.phone, l.email AS business_email,
              l.booking_slug, l.account_status, l.city, l.state, l.category,
              u.email AS owner_email, u.first_name, u.last_name,
              u.subscription_status, u.trial_ends_at, u.created_at AS signup_date,
              s.plan_code, bp.name AS plan_name, bp.price_cents
         FROM locations l
         LEFT JOIN users u ON u.id = l.user_id
         LEFT JOIN LATERAL (
           SELECT plan_code, status FROM subscriptions WHERE store_number = l.id ORDER BY id DESC LIMIT 1
         ) s ON true
         LEFT JOIN billing_plans bp ON bp.code = s.plan_code
        WHERE ${filter}
        ORDER BY l.id DESC
        LIMIT ${LIMIT}`,
    );
    res.json(rows.rows.map((r) => ({
      id: r.id, businessName: r.business_name, phone: r.phone, businessEmail: r.business_email,
      bookingSlug: r.booking_slug, accountStatus: r.account_status ?? "Active", city: r.city, state: r.state,
      category: r.category, ownerEmail: r.owner_email, ownerName: [r.first_name, r.last_name].filter(Boolean).join(" "),
      subscriptionStatus: r.subscription_status, planName: r.plan_name, priceCents: r.price_cents,
      signupDate: r.signup_date, trialEndsAt: r.trial_ends_at,
    })));
  } catch (err) {
    console.error("[support/accounts]", (err as Error)?.message);
    res.status(500).json({ error: "Failed to load accounts" });
  }
});

export default router;

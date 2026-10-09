/**
 * routes/signupProgress.ts — where each signup is in onboarding, for the support team
 *
 * The onboarding conversation used to remember its steps only in the owner's browser, so the
 * server could not tell a signup that stopped at "business hours" from one that never started,
 * and an owner who never finished had no store and so could not be found in Support 360 at all.
 *
 * Owner app (signed-in owner session):
 *   PUT  /api/onboarding/progress               the step the owner is on, sent as they move
 *
 * Support 360 (support agent session):
 *   GET  /api/support/accounts/:id/onboarding   one account: signup progress, the essentials
 *                                               (hours, services, staff, website) and setup tasks
 *   GET  /api/support/signups                   signups that have not finished, newest first
 *
 * Everything here is read-only apart from the owner's own progress row. Unlike GET
 * /api/setup/progress, the support view never writes "complete" rows as a side effect of looking.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../db";
import { requireSupportAuth } from "../lib/supportAuth";
import { FLOW_DEFINITIONS } from "./setup";

const router = Router();

const MAX_STEPS = 80;
const STEP_ID = /^[a-z0-9_]{1,64}$/;

// ── Owner app ────────────────────────────────────────────────────────────────

router.put("/api/onboarding/progress", async (req: Request, res: Response) => {
  const userId = (req.session as any)?.userId as string | undefined;
  if (!userId) return res.status(401).json({ message: "Not authenticated" });

  const b = req.body ?? {};
  const flow = b.flow === "classic" ? "classic" : "chat";
  const currentStepId = typeof b.currentStepId === "string" && STEP_ID.test(b.currentStepId) ? b.currentStepId : "";
  const completedStepIds: string[] = Array.isArray(b.completedStepIds)
    ? b.completedStepIds.filter((s: unknown) => typeof s === "string" && STEP_ID.test(s)).slice(0, MAX_STEPS)
    : [];
  const pct = Math.max(0, Math.min(100, Math.round(Number(b.progressPct) || 0)));
  const completed = b.completed === true;

  try {
    const values = [userId, flow, currentStepId, JSON.stringify(completedStepIds), completed ? 100 : pct, completed];
    // Once a signup has finished, later step reports (a second tab, a stale browser) do not reopen it.
    const updated = await pool.query(
      `UPDATE signup_progress SET
         flow               = $2::text,
         current_step_id    = $3::text,
         completed_step_ids = $4::jsonb,
         progress_pct       = $5::int,
         last_activity_at   = now(),
         completed_at       = CASE WHEN $6::boolean THEN now() END
       WHERE user_id = $1 AND completed_at IS NULL`,
      values,
    );
    if (updated.rowCount === 0) {
      // First report for this owner. An owner who already has a store and no row signed up before
      // steps were tracked: opening the onboarding page again must not make them look unfinished.
      await pool.query(
        `INSERT INTO signup_progress (user_id, flow, current_step_id, completed_step_ids, progress_pct, completed_at)
         SELECT $1::text, $2::text, $3::text, $4::jsonb, $5::int, CASE WHEN $6::boolean THEN now() END
          WHERE $6::boolean OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = $1 AND u.onboarding_completed = true)
         ON CONFLICT (user_id) DO NOTHING`,
        values,
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[signup-progress] save failed:", (err as Error)?.message);
    res.status(500).json({ message: "Could not save progress" });
  }
});

// ── Support 360 ──────────────────────────────────────────────────────────────

function signupOf(row: any) {
  return {
    flow: row.flow ?? null,
    currentStepId: row.current_step_id ?? null,
    completedStepIds: Array.isArray(row.completed_step_ids) ? row.completed_step_ids : [],
    progressPct: row.progress_pct ?? null,
    startedAt: row.started_at ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

router.get("/api/support/accounts/:id/onboarding", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(storeId)) return res.status(400).json({ error: "Invalid account id" });
  try {
    const account = await pool.query(
      `SELECT l.name, u.id AS user_id, u.created_at AS signed_up_at, COALESCE(u.onboarding_completed, false) AS store_created,
              sp.flow, sp.current_step_id, sp.completed_step_ids, sp.progress_pct, sp.started_at, sp.last_activity_at, sp.completed_at,
              (sp.user_id IS NOT NULL) AS tracked,
              (SELECT count(*)::int FROM business_hours bh WHERE bh.store_id = l.id) AS hours_rows,
              (SELECT count(*)::int FROM business_hours bh WHERE bh.store_id = l.id AND NOT bh.is_closed) AS open_days,
              (SELECT count(*)::int FROM services s WHERE s.store_id = l.id AND s.is_active = true) AS services,
              (SELECT count(*)::int FROM staff st WHERE st.store_id = l.id AND st.status = 'active') AS staff,
              EXISTS (SELECT 1 FROM wb_websites w WHERE w.storeid = l.id::text AND w.published = true) AS website_published
         FROM locations l
         LEFT JOIN users u ON u.id = l.user_id
         LEFT JOIN signup_progress sp ON sp.user_id = u.id
        WHERE l.id = $1`,
      [storeId],
    );
    const a = account.rows[0];
    if (!a) return res.status(404).json({ error: "Account not found" });

    const saved = await pool.query(
      `SELECT flow_key, status, completed_at FROM onboarding_progress WHERE store_id = $1`,
      [storeId],
    );
    const savedByKey = new Map<string, { status: string; completedAt: string | null }>();
    for (const r of saved.rows) savedByKey.set(r.flow_key, { status: r.status, completedAt: r.completed_at ?? null });

    // The same signals the owner's own checklist uses to tick a task that was done outside it.
    const detected: Record<string, boolean> = {
      business_setup: !!a.name && a.hours_rows > 0,
      services_menu: a.services > 0,
      team_members: a.staff > 0,
      website_setup: a.website_published === true,
    };

    res.json({
      signup: {
        signedUpAt: a.signed_up_at ?? null,
        storeCreated: a.store_created === true,
        tracked: a.tracked === true,
        ...signupOf(a),
      },
      essentials: {
        hoursSet: a.open_days > 0,
        openDays: a.open_days,
        services: a.services,
        staff: a.staff,
        websitePublished: a.website_published === true,
      },
      flows: FLOW_DEFINITIONS.map((def) => {
        const s = savedByKey.get(def.key);
        return {
          key: def.key,
          title: def.title,
          category: def.category,
          status: s?.status ?? (detected[def.key] ? "complete" : "not_started"),
          completedAt: s?.completedAt ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[support/onboarding]", (err as Error)?.message);
    res.status(500).json({ error: "Failed to load onboarding" });
  }
});

router.get("/api/support/signups", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    // Owners with no store yet, plus owners whose store exists but who never reached the end of
    // onboarding. Accounts from before progress was tracked are only listed when they have no store,
    // because for those there is nothing to say they did not finish.
    const accounts = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.created_at AS signed_up_at,
              (u.google_id IS NOT NULL) AS google_signup, u.subscription_status, u.trial_ends_at,
              l.id AS store_id, l.name AS store_name,
              sp.flow, sp.current_step_id, sp.completed_step_ids, sp.progress_pct, sp.started_at, sp.last_activity_at, sp.completed_at,
              (SELECT max(ae.created_at) FROM auth_events ae WHERE ae.user_id = u.id AND ae.event_type IN ('login', 'google_oauth', 'magic_link')) AS last_login_at
         FROM users u
         LEFT JOIN signup_progress sp ON sp.user_id = u.id
         LEFT JOIN LATERAL (SELECT id, name FROM locations WHERE user_id = u.id ORDER BY id LIMIT 1) l ON true
        WHERE COALESCE(u.role, 'owner') IN ('owner', 'admin')
          AND u.staff_id IS NULL
          AND u.is_admin = false
          AND u.account_type IS DISTINCT FROM 'tester'
          AND (l.id IS NULL OR (sp.user_id IS NOT NULL AND sp.completed_at IS NULL))
        ORDER BY u.created_at DESC
        LIMIT 300`,
    );

    // People who asked for a verification code and never went on to create the account.
    const codeOnly = await pool.query(
      `SELECT lower(o.email) AS email, max(o.phone) AS phone, max(o.created_at) AS requested_at,
              bool_or(o.used_at IS NOT NULL) AS code_used
         FROM owner_phone_otps o
        WHERE o.email IS NOT NULL AND o.email <> ''
          AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(o.email))
        GROUP BY lower(o.email)
        ORDER BY max(o.created_at) DESC
        LIMIT 100`,
    );

    res.json({
      accounts: accounts.rows.map((r) => ({
        userId: r.id,
        email: r.email,
        name: [r.first_name, r.last_name].filter(Boolean).join(" "),
        phone: r.phone ?? null,
        signedUpAt: r.signed_up_at,
        googleSignup: r.google_signup === true,
        subscriptionStatus: r.subscription_status ?? null,
        trialEndsAt: r.trial_ends_at ?? null,
        lastLoginAt: r.last_login_at ?? null,
        storeId: r.store_id ?? null,
        storeName: r.store_name ?? null,
        tracked: r.flow != null,
        ...signupOf(r),
      })),
      codeOnly: codeOnly.rows.map((r) => ({
        email: r.email,
        phone: r.phone ?? null,
        requestedAt: r.requested_at,
        codeUsed: r.code_used === true,
      })),
    });
  } catch (err) {
    console.error("[support/signups]", (err as Error)?.message);
    res.status(500).json({ error: "Failed to load signups" });
  }
});

export default router;

/**
 * /api/setup — Onboarding progress API
 *
 * Tracks which onboarding flows each store has completed.
 * All routes require isAuthenticated (mounted with that middleware).
 */
import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveSessionStoreId } from "../lib/sessionStore";

const BLOOM_TEMPLATE_NAME = "Nail Salon — Bloom";
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$|^[a-z0-9]{2,63}$/;
const RESERVED_SLUGS = new Set([
  "www","api","admin","app","mail","smtp","ftp","ns1","ns2",
  "dev","staging","production","support","help","blog","status",
  "static","assets","cdn","media","img","images",
]);

function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "salon";
}

async function isSlugAvailable(slug: string, storeId: number): Promise<boolean> {
  const [wbConflict, locConflict] = await Promise.all([
    pool.query(`SELECT id FROM wb_websites WHERE slug = $1 LIMIT 1`, [slug]),
    pool.query(`SELECT id FROM locations WHERE booking_slug = $1 AND id != $2 LIMIT 1`, [slug, storeId]),
  ]);
  return wbConflict.rows.length === 0 && locConflict.rows.length === 0;
}

const router = Router();

// ── Flow registry (source of truth) ─────────────────────────────────────────
// Adding a new Certxa feature's onboarding = add one entry here + build the flow page.

export const FLOW_DEFINITIONS = [
  {
    key: "business_setup",
    title: "Set up your business",
    description:
      "Add your salon name, location, hours, and booking URL so clients can find and book you.",
    category: "required",
    estimatedMinutes: 5,
    sortOrder: 1,
  },
  {
    key: "services_menu",
    title: "Build your services menu",
    description:
      "Create service categories, add pricing and duration, then assign services to your staff.",
    category: "required",
    estimatedMinutes: 10,
    sortOrder: 2,
  },
  {
    key: "team_members",
    title: "Add your team",
    description:
      "Add staff members, set their working hours, assign which services they perform, and send invites.",
    category: "recommended",
    estimatedMinutes: 10,
    sortOrder: 3,
  },
  {
    key: "booking_calendar",
    title: "Configure booking & calendar",
    description:
      "Set appointment slot intervals, buffer time, advance booking window, and cancellation policy.",
    category: "recommended",
    estimatedMinutes: 5,
    sortOrder: 4,
  },
  {
    key: "website_setup",
    title: "Launch your free website",
    description:
      "Claim your free Certxa subdomain (e.g. luxenails.certxa.com). Your salon website goes live in seconds — no code needed.",
    category: "recommended",
    estimatedMinutes: 2,
    sortOrder: 5,
  },
  {
    key: "pos_payments",
    title: "Set up POS & payments",
    description:
      "Connect Stripe to accept cards, configure your tax rate, tips presets, and optional terminal reader.",
    category: "recommended",
    estimatedMinutes: 10,
    sortOrder: 6,
  },
  {
    key: "commission_payroll",
    title: "Configure commission & payroll",
    description:
      "Choose how staff get paid — hourly, commission %, flat rate, or booth rental — and set deductions.",
    category: "optional",
    estimatedMinutes: 10,
    sortOrder: 7,
  },
  {
    key: "marketing_growth",
    title: "Marketing & growth",
    description:
      "Connect Google Business Profile, enable client reminders, and set up automated reviews.",
    category: "optional",
    estimatedMinutes: 15,
    sortOrder: 8,
  },
  {
    key: "ai_receptionist",
    title: "AI receptionist",
    description:
      "Set up your 24/7 AI phone agent that books, reschedules, and answers questions automatically.",
    category: "optional",
    estimatedMinutes: 10,
    sortOrder: 8,
  },
] as const;

type FlowKey = (typeof FLOW_DEFINITIONS)[number]["key"];

// ── GET /api/setup/progress ──────────────────────────────────────────────────
// Returns all flows with their status for the current store.
// Auto-detects business_setup completion for stores that used the old /onboarding flow.

router.get("/progress", async (req, res): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Fetch saved progress rows
  const progressRows = await db.execute(
    sql`SELECT flow_key, status, started_at, completed_at, skipped_at, state
        FROM onboarding_progress
        WHERE store_id = ${storeId}`
  );

  const progressMap = new Map<string, { status: string; completedAt: string | null; state: Record<string, unknown> }>();
  for (const row of progressRows.rows as any[]) {
    progressMap.set(row.flow_key, {
      status: row.status,
      completedAt: row.completed_at ?? null,
      state: row.state ?? {},
    });
  }

  // ── Auto-detect business_setup completion ───────────────────────────────────
  // If the store went through the old /onboarding wizard but has no progress row,
  // check whether they already have a name + business hours set.
  if (!progressMap.has("business_setup")) {
    const storeCheck = await db.execute(
      sql`SELECT l.name, COUNT(bh.id) AS hour_count
          FROM locations l
          LEFT JOIN business_hours bh ON bh.store_id = l.id
          WHERE l.id = ${storeId}
          GROUP BY l.name`
    );
    const row = storeCheck.rows[0] as any;
    if (row?.name && Number(row.hour_count) > 0) {
      // Auto-create as complete (fire-and-forget, best-effort)
      await db
        .execute(
          sql`INSERT INTO onboarding_progress (store_id, flow_key, status, completed_at, updated_at)
              VALUES (${storeId}, 'business_setup', 'complete', NOW(), NOW())
              ON CONFLICT (store_id, flow_key) DO NOTHING`
        )
        .catch(() => {});
      progressMap.set("business_setup", { status: "complete", completedAt: new Date().toISOString(), state: {} });
    }
  }

  // ── Auto-detect services_menu completion ────────────────────────────────────
  if (!progressMap.has("services_menu")) {
    const svcCheck = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM services WHERE store_id = ${storeId} AND is_active = true`
    );
    const cnt = Number((svcCheck.rows[0] as any)?.cnt ?? 0);
    if (cnt > 0) {
      await db
        .execute(
          sql`INSERT INTO onboarding_progress (store_id, flow_key, status, completed_at, updated_at)
              VALUES (${storeId}, 'services_menu', 'complete', NOW(), NOW())
              ON CONFLICT (store_id, flow_key) DO NOTHING`
        )
        .catch(() => {});
      progressMap.set("services_menu", { status: "complete", completedAt: new Date().toISOString(), state: {} });
    }
  }

  // ── Auto-detect team_members completion ─────────────────────────────────────
  if (!progressMap.has("team_members")) {
    const staffCheck = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM staff WHERE store_id = ${storeId} AND status = 'active'`
    );
    const cnt = Number((staffCheck.rows[0] as any)?.cnt ?? 0);
    if (cnt > 0) {
      await db
        .execute(
          sql`INSERT INTO onboarding_progress (store_id, flow_key, status, completed_at, updated_at)
              VALUES (${storeId}, 'team_members', 'complete', NOW(), NOW())
              ON CONFLICT (store_id, flow_key) DO NOTHING`
        )
        .catch(() => {});
      progressMap.set("team_members", { status: "complete", completedAt: new Date().toISOString(), state: {} });
    }
  }

  // ── Auto-detect website_setup completion ────────────────────────────────────
  if (!progressMap.has("website_setup")) {
    const wbCheck = await pool.query(
      `SELECT w.id FROM wb_websites w
       JOIN wb_templates t ON t.id = w.template_id
       WHERE w.storeid = $1 AND t.name = $2 AND t.category = 'nail_salon' AND w.published = true
       LIMIT 1`,
      [String(storeId), BLOOM_TEMPLATE_NAME]
    );
    if (wbCheck.rows.length > 0) {
      await db
        .execute(
          sql`INSERT INTO onboarding_progress (store_id, flow_key, status, completed_at, updated_at)
              VALUES (${storeId}, 'website_setup', 'complete', NOW(), NOW())
              ON CONFLICT (store_id, flow_key) DO NOTHING`
        )
        .catch(() => {});
      progressMap.set("website_setup", { status: "complete", completedAt: new Date().toISOString(), state: {} });
    }
  }

  // Check if the checklist card has been dismissed
  const dismissedRow = progressMap.get("__checklist__");
  const dismissed = dismissedRow?.status === "dismissed";

  // Build the response
  const flows = FLOW_DEFINITIONS.map((def) => {
    const saved = progressMap.get(def.key);
    return {
      ...def,
      status: saved?.status ?? "not_started",
      completedAt: saved?.completedAt ?? null,
      state: saved?.state ?? {},
    };
  });

  res.json({ flows, dismissed });
});

// ── PATCH /api/setup/progress/:flowKey ──────────────────────────────────────
// Update status for a single flow.

router.patch("/progress/:flowKey", async (req, res): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { flowKey } = req.params;
  const { status, state } = req.body as { status: string; state?: Record<string, unknown> };

  const VALID_KEYS = FLOW_DEFINITIONS.map((f) => f.key) as string[];
  if (!VALID_KEYS.includes(flowKey)) {
    res.status(400).json({ error: "Unknown flow key" });
    return;
  }

  const VALID_STATUSES = ["not_started", "in_progress", "complete", "skipped"];
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const hasState = state !== undefined && state !== null && typeof state === "object" && !Array.isArray(state);
  const stateJson = JSON.stringify(hasState ? state : {});
  await db.execute(
    sql`INSERT INTO onboarding_progress (store_id, flow_key, status, state, started_at, completed_at, skipped_at, updated_at)
        VALUES (
          ${storeId}, ${flowKey}, ${status}, ${stateJson}::jsonb,
          CASE WHEN ${status} = 'in_progress' THEN NOW() ELSE NULL END,
          CASE WHEN ${status} = 'complete'    THEN NOW() ELSE NULL END,
          CASE WHEN ${status} = 'skipped'     THEN NOW() ELSE NULL END,
          NOW()
        )
        ON CONFLICT (store_id, flow_key) DO UPDATE SET
          status       = EXCLUDED.status,
          started_at   = CASE WHEN onboarding_progress.started_at IS NULL AND EXCLUDED.status = 'in_progress' THEN NOW() ELSE onboarding_progress.started_at END,
          completed_at = CASE WHEN EXCLUDED.status = 'complete' THEN NOW() ELSE onboarding_progress.completed_at END,
          skipped_at   = CASE WHEN EXCLUDED.status = 'skipped'  THEN NOW() ELSE onboarding_progress.skipped_at END,
           state        = CASE WHEN ${hasState} THEN EXCLUDED.state ELSE onboarding_progress.state END,
          updated_at   = NOW()`
  );

  res.json({ success: true });
});

// ── GET /api/setup/website-info ──────────────────────────────────────────────
// Returns the store name (for slug pre-fill) and any existing Bloom website slug.

router.get("/website-info", async (req, res): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const storeRow = await pool.query(
    `SELECT name, booking_slug FROM locations WHERE id = $1 LIMIT 1`, [storeId]
  );
  const storeName: string = storeRow.rows[0]?.name ?? "";
  const bookingSlug: string | null = storeRow.rows[0]?.booking_slug ?? null;

  const wbRow = await pool.query(
    `SELECT w.slug FROM wb_websites w
     JOIN wb_templates t ON t.id = w.template_id
     WHERE w.storeid = $1 AND t.name = $2 AND t.category = 'nail_salon'
     LIMIT 1`,
    [String(storeId), BLOOM_TEMPLATE_NAME]
  );
  const existingSlug: string | null = wbRow.rows[0]?.slug ?? bookingSlug ?? null;

  // Suggest a slug from the store name
  const base = storeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "salon";
  const suggestedSlug = base.length >= 3 ? base : `salon-${base}`;

  res.json({ storeName, existingSlug, suggestedSlug });
});

// ── POST /api/setup/website-launch ───────────────────────────────────────────
// Creates (or updates) the Bloom website for this store, marks flow complete.

router.post("/website-launch", async (req, res): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { slug, templatePreference } = req.body as { slug: string; templatePreference?: string };
  if (!slug || typeof slug !== "string") {
    res.status(400).json({ error: "slug is required" });
    return;
  }
  const clean = slug.trim().toLowerCase();

  // Validate format
  if (!SLUG_PATTERN.test(clean)) {
    res.status(400).json({ error: "Invalid slug: use 2–63 lowercase letters, numbers, or hyphens (no leading/trailing hyphens)." });
    return;
  }
  if (RESERVED_SLUGS.has(clean)) {
    res.status(400).json({ error: "That subdomain is reserved. Please choose another." });
    return;
  }

  // Check availability (allow the current store's own slug)
  const [wbConflict, locConflict] = await Promise.all([
    pool.query(`SELECT storeid FROM wb_websites WHERE slug = $1 LIMIT 1`, [clean]),
    pool.query(`SELECT id FROM locations WHERE booking_slug = $1 AND id != $2 LIMIT 1`, [clean, storeId]),
  ]);
  if (wbConflict.rows.length > 0 && wbConflict.rows[0].storeid !== String(storeId)) {
    res.status(409).json({ error: "That subdomain is already taken. Please choose another." });
    return;
  }
  if (locConflict.rows.length > 0) {
    res.status(409).json({ error: "That subdomain is already used by another salon's booking page." });
    return;
  }

  // Resolve template — prefer the user's chosen style, fall back to Bloom
  const preferredName = templatePreference === "aria"
    ? "nail-salon-aria"
    : BLOOM_TEMPLATE_NAME;

  let tplRow = await pool.query(
    `SELECT id FROM wb_templates WHERE name = $1 LIMIT 1`,
    [preferredName]
  );
  // Fall back to Bloom if the preferred template isn't seeded yet
  if (tplRow.rows.length === 0 && preferredName !== BLOOM_TEMPLATE_NAME) {
    tplRow = await pool.query(
      `SELECT id FROM wb_templates WHERE name = $1 AND category = 'nail_salon' LIMIT 1`,
      [BLOOM_TEMPLATE_NAME]
    );
  }
  if (tplRow.rows.length === 0) {
    res.status(500).json({ error: "Website template is not yet available. Please try again in a moment." });
    return;
  }
  const templateId: number = tplRow.rows[0].id;

  // Get store name
  const storeRow = await pool.query(`SELECT name FROM locations WHERE id = $1 LIMIT 1`, [storeId]);
  const storeName: string = storeRow.rows[0]?.name ?? "My Salon";

  // Keep the website row, booking slug, and onboarding state in sync. A
  // partial launch must not leave a published site without its booking slug
  // (or vice versa).
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingRow = await client.query(
      `SELECT id FROM wb_websites WHERE storeid = $1 AND template_id = $2 LIMIT 1`,
      [String(storeId), templateId]
    );

    if (existingRow.rows.length > 0) {
      await client.query(
        `UPDATE wb_websites
         SET name = $1, slug = $2, published = true,
             published_at = COALESCE(published_at, NOW()), updated_at = NOW()
         WHERE id = $3`,
        [storeName, clean, existingRow.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO wb_websites (name, slug, storeid, template_id, content, published, published_at)
         VALUES ($1, $2, $3, $4, '{}', true, NOW())`,
        [storeName, clean, String(storeId), templateId]
      );
    }

    await client.query(`UPDATE locations SET booking_slug = $1 WHERE id = $2`, [clean, storeId]);
    await client.query(
      `INSERT INTO onboarding_progress (store_id, flow_key, status, completed_at, updated_at)
       VALUES ($1, 'website_setup', 'complete', NOW(), NOW())
       ON CONFLICT (store_id, flow_key) DO UPDATE SET
         status = 'complete', completed_at = NOW(), updated_at = NOW()`,
      [storeId]
    );

    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    // Preserve the friendly availability error if a concurrent request won
    // the unique slug race after the preflight check.
    if (err?.code === "23505") {
      res.status(409).json({ error: "That subdomain is already taken. Please choose another." });
      return;
    }
    throw err;
  } finally {
    client.release();
  }

  res.json({
    ok: true,
    slug: clean,
    websiteUrl: `https://${clean}.certxa.com`,
  });
});

// ── POST /api/setup/dismiss ──────────────────────────────────────────────────
// Dismiss the dashboard checklist card.

router.post("/dismiss", async (req, res): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  await db.execute(
    sql`INSERT INTO onboarding_progress (store_id, flow_key, status, updated_at)
        VALUES (${storeId}, '__checklist__', 'dismissed', NOW())
        ON CONFLICT (store_id, flow_key) DO UPDATE SET
          status = 'dismissed', updated_at = NOW()`
  );

  res.json({ success: true });
});

export default router;

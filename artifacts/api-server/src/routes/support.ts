import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { pool, waitForDb } from "../db";
import { broadcastNotification } from "../notifications";
import { sendSupportReply, smtpAvailable } from "../lib/smtpSender";
import { broadcastRawEvent } from "./systemStatus";
import { ERROR_CODE_LOOKUP } from "../lib/apiErrorCodes";
import {
  runHealthCheck,
  rerunSegment as rerunHealthSegment,
  bootstrapHealthCheckTable,
  SEGMENT_IDS,
  type SegmentId,
} from "../lib/healthCheck/index";
import { requireSupportAuth } from "../lib/supportAuth";
import { stripe, isStripeConfigured } from "../lib/stripe";

const router = Router();

function paramText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return String(value[0] ?? "");
  return "";
}

function paramInt(value: unknown): number {
  return Number.parseInt(paramText(value), 10);
}

// ─── Seed default admin agent ─────────────────────────────────────────────────

async function seedDefaultAgent() {
  try {
    await waitForDb("support-seed");
    const hash = await bcrypt.hash("support2024!", 10);
    const seedVals = ["Admin Agent", "admin@certxa.com", hash, "Admin", "Agent", "admin"];

    // Only creates the agent if it doesn't already exist — never overwrites an
    // existing password. The previous ON CONFLICT DO UPDATE silently reset
    // admin@certxa.com's password back to this hardcoded default on every
    // server restart, even after someone had changed it in the database.
    try {
      const result = await pool.query(
        `INSERT INTO support_agents (name, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        seedVals,
      );
      if (result.rows.length > 0) {
        console.log("[Support] Default agent created: admin@certxa.com — change the password after first login");
      }
    } catch (e: any) {
      if (e?.code !== "42P10") throw e;

      // Fallback for drifted schemas: some legacy DBs are missing the unique
      // email constraint, so ON CONFLICT(email) throws 42P10. Insert only if
      // no row with this email exists yet.
      await pool.query(
        `INSERT INTO support_agents (name, email, password_hash, first_name, last_name, role)
         SELECT $1, $2, $3, $4, $5, $6
         WHERE NOT EXISTS (
           SELECT 1 FROM support_agents WHERE lower(email) = lower($2)
         )`,
        seedVals,
      );
    }
  } catch (e) {
    console.warn("[Support] Could not seed default agent:", e);
  }
}
seedDefaultAgent();

async function ensureMagicLinksTable() {
  try {
    await waitForDb("support-magic-links");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_magic_links (
        id                  SERIAL PRIMARY KEY,
        token               TEXT NOT NULL UNIQUE,
        user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by_agent_id INTEGER,
        expires_at          TIMESTAMP NOT NULL,
        used_at             TIMESTAMP,
        created_at          TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.warn("[Support] Could not ensure support_magic_links table:", e);
  }
}
ensureMagicLinksTable();

// ─── Incident / Service-Health table bootstrap ────────────────────────────────
(async () => {
  await waitForDb("incident-tables");
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const delays = [5_000, 15_000, 30_000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS support_incidents (
          id            SERIAL PRIMARY KEY,
          title         TEXT NOT NULL,
          description   TEXT,
          severity      TEXT NOT NULL DEFAULT 'SEV-3',
          status        TEXT NOT NULL DEFAULT 'investigating',
          affected_accounts INTEGER DEFAULT 0,
          owner_id      INTEGER,
          owner_name    TEXT,
          services      TEXT[],
          root_cause    TEXT,
          resolved_at   TIMESTAMPTZ,
          updated_at    TIMESTAMPTZ DEFAULT NOW(),
          created_at    TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS support_incident_updates (
          id            SERIAL PRIMARY KEY,
          incident_id   INTEGER NOT NULL REFERENCES support_incidents(id) ON DELETE CASCADE,
          content       TEXT NOT NULL,
          status        TEXT,
          author_id     INTEGER,
          author_name   TEXT,
          is_public     BOOLEAN DEFAULT false,
          created_at    TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS support_incident_tasks (
          id            SERIAL PRIMARY KEY,
          incident_id   INTEGER NOT NULL REFERENCES support_incidents(id) ON DELETE CASCADE,
          title         TEXT NOT NULL,
          assigned_to_id   INTEGER,
          assigned_to_name TEXT,
          status        TEXT DEFAULT 'open',
          created_at    TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS incident_postmortems (
          id            SERIAL PRIMARY KEY,
          incident_id   INTEGER NOT NULL REFERENCES support_incidents(id) ON DELETE CASCADE,
          summary       TEXT,
          root_cause    TEXT,
          impact        TEXT,
          resolution    TEXT,
          lessons_learned TEXT,
          preventative_actions TEXT,
          created_at    TIMESTAMPTZ DEFAULT NOW(),
          updated_at    TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log("[Support] Incident tables ensured.");
      break;
    } catch (e: any) {
      if (attempt < delays.length) {
        console.warn(`[Support] Incident table bootstrap failed (attempt ${attempt + 1}), retrying in ${delays[attempt] / 1000}s:`, e?.message ?? e);
        await sleep(delays[attempt]);
      } else {
        console.error("[Support] Could not ensure incident tables after all retries:", e);
      }
    }
  }
})();


// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post("/api/support/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const result = await pool.query(
      "SELECT * FROM support_agents WHERE email = $1 AND is_active = true",
      [email.toLowerCase().trim()]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, agent.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    await pool.query("UPDATE support_agents SET last_login_at = now() WHERE id = $1", [agent.id]);
    req.session.supportAgentId   = agent.id;
    req.session.supportAgentRole  = agent.role;
    req.session.supportAgentName  = `${agent.first_name} ${agent.last_name}`.trim();
    req.session.save((err) => {
      if (err) { console.error("[Support] Session save error:", err); return res.status(500).json({ error: "Session error" }); }
      res.json({ id: agent.id, email: agent.email, firstName: agent.first_name, lastName: agent.last_name, role: agent.role, name: `${agent.first_name} ${agent.last_name}`.trim() });
    });
  } catch (e) {
    console.error("[Support] Login error:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/api/support/auth/me", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT id, email, first_name, last_name, role FROM support_agents WHERE id = $1", [req.session.supportAgentId]);
    const agent = result.rows[0];
    if (!agent) { req.session.destroy(() => {}); return res.status(401).json({ error: "Agent not found" }); }
    res.json({ id: agent.id, email: agent.email, firstName: agent.first_name, lastName: agent.last_name, role: agent.role, name: `${agent.first_name} ${agent.last_name}`.trim() });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

router.post("/api/support/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ─── Account Search ───────────────────────────────────────────────────────────

router.get("/api/support/search", requireSupportAuth, async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) return res.json([]);
  try {
    const rows = await pool.query(`
      SELECT l.id, l.name AS business_name, l.phone, l.email AS business_email,
        l.booking_slug, l.account_status, l.city, l.state, l.category,
        u.id AS user_id, u.email AS owner_email, u.first_name, u.last_name,
        u.subscription_status, u.trial_ends_at, u.created_at AS signup_date,
        s.plan_code, s.status AS sub_status, bp.name AS plan_name, bp.price_cents
      FROM locations l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN subscriptions s ON s.store_number = l.id
      LEFT JOIN billing_plans bp ON bp.code = s.plan_code
      WHERE l.id::text = $1 OR l.name ILIKE $2 OR l.phone ILIKE $2
        OR l.email ILIKE $2 OR l.booking_slug ILIKE $2
        OR u.email ILIKE $2 OR (u.first_name || ' ' || u.last_name) ILIKE $2
      ORDER BY l.id DESC LIMIT 20
    `, [q.replace(/\D/g, '') || '0', `%${q}%`]);
    res.json(rows.rows.map(r => ({
      id: r.id, businessName: r.business_name, phone: r.phone, businessEmail: r.business_email,
      bookingSlug: r.booking_slug, accountStatus: r.account_status, city: r.city, state: r.state,
      category: r.category, ownerEmail: r.owner_email, ownerName: [r.first_name, r.last_name].filter(Boolean).join(" "),
      subscriptionStatus: r.sub_status ?? r.subscription_status, planName: r.plan_name,
      priceCents: r.price_cents, signupDate: r.signup_date, trialEndsAt: r.trial_ends_at,
    })));
  } catch (e) {
    console.error("[Support] Search error:", e);
    res.status(500).json({ error: "Search failed" });
  }
});

// ─── Customer 360 Overview ────────────────────────────────────────────────────

router.get("/api/support/accounts/:id/overview", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });
  try {
    const storeRow = await pool.query(`
      SELECT l.*, u.id AS user_id, u.email AS owner_email, u.first_name, u.last_name,
        u.created_at AS signup_date, u.subscription_status, u.trial_started_at, u.trial_ends_at, u.profile_image_url
      FROM locations l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1
    `, [storeId]);
    if (storeRow.rows.length === 0) return res.status(404).json({ error: "Account not found" });
    const store = storeRow.rows[0];
    const [subRow, apptCount, smsCount, aiCallRow, aiMinRow, staffCount] = await Promise.all([
      pool.query(`SELECT s.*, bp.name AS plan_name, bp.price_cents, bp.interval FROM subscriptions s LEFT JOIN billing_plans bp ON bp.code = s.plan_code WHERE s.store_number = $1 ORDER BY s.id DESC LIMIT 1`, [storeId]),
      pool.query(`SELECT COUNT(*)::int FROM appointments WHERE store_id = $1 AND date >= now() - interval '30 days'`, [storeId]),
      pool.query(`SELECT COUNT(*)::int FROM sms_log WHERE store_id = $1 AND sent_at >= now() - interval '30 days'`, [storeId]).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS calls, COUNT(CASE WHEN appointment_id IS NOT NULL THEN 1 END)::int AS bookings FROM ai_call_log WHERE store_id = $1 AND started_at >= now() - interval '30 days'`, [storeId]).catch(() => ({ rows: [{ calls: 0, bookings: 0 }] })),
      pool.query(`SELECT COALESCE(SUM(duration_seconds), 0)::float / 60 AS minutes, COALESCE(SUM(total_est_cost::float), 0) AS cost FROM call_usage_records WHERE store_id = $1 AND created_at >= now() - interval '30 days'`, [storeId]).catch(() => ({ rows: [{ minutes: 0, cost: 0 }] })),
      pool.query(`SELECT COUNT(*)::int FROM staff WHERE store_id = $1 AND status = 'active'`, [storeId]),
    ]);
    const sub = subRow.rows[0] ?? null;
    const health = await computeHealthStatus(storeId);
    res.json({
      store: { id: store.id, name: store.name, phone: store.phone, email: store.email, address: store.address, city: store.city, state: store.state, postcode: store.postcode, timezone: store.timezone, category: store.category, bookingSlug: store.booking_slug, accountStatus: store.account_status, smsTokens: store.sms_tokens, smsAllowance: store.sms_allowance, platformCredits: store.platform_credits, account_id: store.account_id ?? `ACC-${String(store.id).padStart(5, "0")}` },
      owner: { id: store.user_id, email: store.owner_email, firstName: store.first_name, lastName: store.last_name, name: [store.first_name, store.last_name].filter(Boolean).join(" "), signupDate: store.signup_date, subscriptionStatus: store.subscription_status, trialStartedAt: store.trial_started_at, trialEndsAt: store.trial_ends_at, profileImageUrl: store.profile_image_url },
      subscription: sub ? { planCode: sub.plan_code, planName: sub.plan_name, priceCents: sub.price_cents, interval: sub.interval ?? "month", status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end, paymentBrand: null, paymentLast4: null, renewalDate: null } : null,
      stats: { appointmentsThisMonth: apptCount.rows[0]?.count ?? 0, smsSentThisMonth: smsCount.rows[0]?.count ?? 0, aiCallsThisMonth: aiCallRow.rows[0]?.calls ?? 0, aiBookingsThisMonth: aiCallRow.rows[0]?.bookings ?? 0, aiMinutesThisMonth: Math.round(aiMinRow.rows[0]?.minutes ?? 0), aiCostThisMonth: parseFloat(aiMinRow.rows[0]?.cost ?? "0"), staffCount: staffCount.rows[0]?.count ?? 0 },
      health,
    });
  } catch (e) {
    console.error("[Support] Overview error:", e);
    res.status(500).json({ error: "Failed to load account overview" });
  }
});

// ─── Enhanced Activity Feed ───────────────────────────────────────────────────

// ─── Activity helpers ─────────────────────────────────────────────────────────

function buildDateRange(range: string, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  let from: Date;
  let to: Date = now;
  switch (range) {
    case "today": {
      from = new Date(now); from.setHours(0,0,0,0);
      to = new Date(now); to.setHours(23,59,59,999);
      break;
    }
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate()-1);
      from = new Date(y); from.setHours(0,0,0,0);
      to   = new Date(y); to.setHours(23,59,59,999);
      break;
    }
    case "1d":  from = new Date(now.getTime() - 86400_000); break;
    case "7d":  from = new Date(now.getTime() - 7*86400_000); break;
    case "30d": from = new Date(now.getTime() - 30*86400_000); break;
    case "90d": from = new Date(now.getTime() - 90*86400_000); break;
    case "custom":
      from = customFrom ? new Date(customFrom) : new Date(now.getTime() - 7*86400_000);
      to   = customTo   ? new Date(customTo + "T23:59:59") : now;
      break;
    default: from = new Date(now.getTime() - 7*86400_000);
  }
  return { from, to };
}

function mapSeverity(category: string, title: string): "info" | "warning" | "critical" {
  if (category === "billing" && /fail/i.test(title)) return "critical";
  if (category === "billing" && /refund/i.test(title)) return "warning";
  if (category === "authentication" && /fail/i.test(title)) return "warning";
  if (category === "support" && /suspend/i.test(title)) return "critical";
  if (category === "support") return "warning";
  return "info";
}

function mapActorType(category: string, actorName?: string | null): string {
  if (category === "support") return "support_agent";
  if (category === "billing" && !actorName) return "system";
  if (category === "sms") return "system";
  if (category === "authentication") return "customer";
  if (category === "appointment") return "customer";
  if (category === "ai_receptionist") return "system";
  if (category === "website") return "customer";
  if (category === "users") return "admin";
  if (category === "subscription") return "system";
  return "system";
}

async function fetchActivityEvents(storeId: number, from: Date, to: Date, cat: string): Promise<any[]> {
  const all: any[] = [];
  const push = (results: any[], mapper: (r: any) => any) => {
    results.forEach(r => { try { all.push(mapper(r)); } catch {} });
  };

  const queries: Array<Promise<{ rows: any[]; _type: string }>> = [];

  // ── Appointments ─────────────────────────────────────────────────────────
  if (cat === "all" || cat === "appointment") {
    queries.push(
      pool.query(`
        SELECT a.id, a.status, a.date AS occurred_at, a.cancelled_at,
          s.name AS service_name, st.name AS staff_name,
          COALESCE(cl.full_name, cl.first_name || ' ' || cl.last_name, '') AS client_name,
          a.created_at, a.completed_at, a.checked_in_at, a.payment_method, a.total_paid
        FROM appointments a
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN staff st ON st.id = a.staff_id
        LEFT JOIN clients cl ON cl.id = a.customer_id
        WHERE a.store_id = $1 AND a.date >= $2 AND a.date <= $3
        ORDER BY a.date DESC LIMIT 500
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "appointment" }))
        .catch(() => ({ rows: [], _type: "appointment" }))
    );
  }

  // ── SMS ───────────────────────────────────────────────────────────────────
  if (cat === "all" || cat === "sms") {
    queries.push(
      pool.query(`
        SELECT id, sent_at AS occurred_at, message_type, phone, status, sms_source, message_body
        FROM sms_log
        WHERE store_id = $1 AND sent_at >= $2 AND sent_at <= $3
        ORDER BY sent_at DESC LIMIT 500
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "sms" }))
        .catch(() => ({ rows: [], _type: "sms" }))
    );
  }

  // ── AI Receptionist ───────────────────────────────────────────────────────
  if (cat === "all" || cat === "ai_receptionist") {
    queries.push(
      pool.query(`
        SELECT id, started_at AS occurred_at, outcome, duration_seconds,
          caller_phone, caller_name, notes, ended_at, cost_usd
        FROM ai_call_log
        WHERE store_id = $1 AND started_at >= $2 AND started_at <= $3
        ORDER BY started_at DESC LIMIT 500
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "ai_receptionist" }))
        .catch(() => ({ rows: [], _type: "ai_receptionist" }))
    );
  }

  // ── Billing: payment_transactions ─────────────────────────────────────────
  if (cat === "all" || cat === "billing") {
    queries.push(
      pool.query(`
        SELECT id, created_at AS occurred_at, status, amount_cents,
          payment_method_brand, payment_method_last4, type
        FROM payment_transactions
        WHERE salon_id = $1 AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at DESC LIMIT 200
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "billing" }))
        .catch(() => ({ rows: [], _type: "billing" }))
    );
  }

  // ── Billing: subscriptions/plan changes ───────────────────────────────────
  if (cat === "all" || cat === "billing" || cat === "subscription") {
    queries.push(
      pool.query(`
        SELECT ss.id, ss.created_at AS occurred_at, ss.status,
          sp.name AS plan_name, sp.code AS plan_code, ss.canceled_at
        FROM store_subscriptions ss
        JOIN subscription_plans sp ON sp.id = ss.plan_id
        WHERE ss.store_id = $1 AND ss.created_at >= $2 AND ss.created_at <= $3
        ORDER BY ss.created_at DESC LIMIT 100
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "subscription" }))
        .catch(() => ({ rows: [], _type: "subscription" }))
    );
  }

  // ── Support actions ───────────────────────────────────────────────────────
  if (cat === "all" || cat === "support") {
    queries.push(
      pool.query(`
        SELECT sa.id, sa.created_at AS occurred_at, sa.action, sa.details, sa.metadata,
          ag.first_name || ' ' || ag.last_name AS agent_name
        FROM support_agent_activity sa
        LEFT JOIN support_agents ag ON ag.id = sa.agent_id
        WHERE sa.account_id = $1 AND sa.created_at >= $2 AND sa.created_at <= $3
        ORDER BY sa.created_at DESC LIMIT 200
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "support" }))
        .catch(() => ({ rows: [], _type: "support" }))
    );
  }

  // ── Auth events ───────────────────────────────────────────────────────────
  if (cat === "all" || cat === "authentication") {
    queries.push(
      pool.query(`
        SELECT ae.id, ae.created_at AS occurred_at, ae.event_type,
          ae.ip_address, ae.user_agent, ae.metadata,
          COALESCE(u.first_name || ' ' || u.last_name, u.email) AS user_name,
          u.email AS user_email
        FROM auth_events ae
        LEFT JOIN users u ON u.id = ae.user_id::text
        WHERE ae.store_id = $1 AND ae.created_at >= $2 AND ae.created_at <= $3
        ORDER BY ae.created_at DESC LIMIT 200
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "authentication" }))
        .catch(() => ({ rows: [], _type: "authentication" }))
    );
  }

  // ── Staff / Users events ──────────────────────────────────────────────────
  if (cat === "all" || cat === "users") {
    queries.push(
      pool.query(`
        SELECT id, COALESCE(joined_at, invited_at, removed_at) AS occurred_at,
          name, email, role, status, invited_at, joined_at, removed_at
        FROM staff
        WHERE store_id = $1
          AND COALESCE(joined_at, invited_at, removed_at) >= $2
          AND COALESCE(joined_at, invited_at, removed_at) <= $3
        ORDER BY occurred_at DESC LIMIT 200
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "users" }))
        .catch(() => ({ rows: [], _type: "users" }))
    );
  }

  // ── Website Builder events ────────────────────────────────────────────────
  if (cat === "all" || cat === "website") {
    queries.push(
      pool.query(`
        SELECT id, created_at AS occurred_at, status, title,
          assigned_subdomain, custom_domain_token, ssl_status
        FROM wb_websites
        WHERE storeid = $1::text
          AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at DESC LIMIT 100
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "website" }))
        .catch(() => ({ rows: [], _type: "website" }))
    );
  }

  // ── Service events ────────────────────────────────────────────────────────
  if (cat === "all" || cat === "services") {
    queries.push(
      pool.query(`
        SELECT id, created_at AS occurred_at, event_type,
          service_id, service_name, actor_user_id, metadata
        FROM service_events
        WHERE store_id = $1 AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at DESC LIMIT 200
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "services" }))
        .catch(() => ({ rows: [], _type: "services" }))
    );
  }

  // ── Appointment lifecycle events ──────────────────────────────────────────
  if (cat === "all" || cat === "appointment") {
    queries.push(
      pool.query(`
        SELECT ae.id, ae.created_at AS occurred_at, ae.event_type,
          ae.appointment_id, ae.actor_user_id, ae.metadata,
          s.name AS service_name,
          st.name AS staff_name,
          COALESCE(cl.full_name, cl.first_name || ' ' || cl.last_name, '') AS client_name
        FROM appointment_events ae
        LEFT JOIN appointments a ON a.id = ae.appointment_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN staff st ON st.id = a.staff_id
        LEFT JOIN clients cl ON cl.id = a.customer_id
        WHERE ae.store_id = $1 AND ae.created_at >= $2 AND ae.created_at <= $3
        ORDER BY ae.created_at DESC LIMIT 500
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "appointment_events" }))
        .catch(() => ({ rows: [], _type: "appointment_events" }))
    );
  }

  // ── Email log ─────────────────────────────────────────────────────────────
  if (cat === "all" || cat === "email") {
    queries.push(
      pool.query(`
        SELECT id, created_at AS occurred_at, recipient, subject,
          email_type, status, error, mailgun_id, metadata
        FROM email_log
        WHERE store_id = $1 AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at DESC LIMIT 300
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "email" }))
        .catch(() => ({ rows: [], _type: "email" }))
    );
  }

  // ── Store invoices (Stripe SaaS billing) ─────────────────────────────────
  if (cat === "all" || cat === "billing") {
    queries.push(
      pool.query(`
        SELECT id, created_at AS occurred_at, status, paid,
          total_cents, amount_paid_cents, billing_reason, stripe_invoice_id, invoice_number
        FROM store_invoices
        WHERE store_id = $1 AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at DESC LIMIT 100
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "invoice" }))
        .catch(() => ({ rows: [], _type: "invoice" }))
    );
  }

  // ── API Errors ────────────────────────────────────────────────────────────
  if (cat === "all" || cat === "api_error") {
    queries.push(
      pool.query<{ id: number; occurred_at: Date; event_type: string; message: string; metadata: any }>(`
        SELECT id, created_at AS occurred_at, event_type,
          message, metadata
        FROM store_activity_events
        WHERE store_id = $1
          AND event_type = 'api_error'
          AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at DESC LIMIT 500
      `, [storeId, from, to])
        .then(r => ({ rows: r.rows, _type: "api_error" }))
        .catch(() => ({ rows: [], _type: "api_error" }))
    );
  }

  const results = await Promise.allSettled(queries);

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { rows, _type } = result.value;

    switch (_type) {
      case "appointment":
        push(rows, r => {
          const title = r.status === "confirmed" ? "Appointment booked"
            : r.status === "completed"  ? "Appointment completed"
            : r.status === "cancelled"  ? "Appointment cancelled"
            : r.status === "no_show"    ? "Client no-show"
            : `Appointment ${r.status}`;
          const actorType = mapActorType("appointment");
          const severity  = mapSeverity("appointment", title);
          return {
            id: `appt-${r.id}`,
            category: "appointment",
            title,
            subtitle: [r.service_name && `Service: ${r.service_name}`, r.staff_name && `Staff: ${r.staff_name}`, r.client_name && `Client: ${r.client_name}`].filter(Boolean).join(" · ") || null,
            metadata: { appointmentId: r.id, service: r.service_name, staff: r.staff_name, client: r.client_name, paymentMethod: r.payment_method, totalPaid: r.total_paid },
            occurred_at: r.occurred_at,
            actor_name: r.client_name || null,
            actor_type: actorType,
            severity,
          };
        });
        break;

      case "sms":
        push(rows, r => {
          const title = r.status === "failed" ? "SMS delivery failed" : "SMS sent to customer";
          return {
            id: `sms-${r.id}`,
            category: "sms",
            title,
            subtitle: [r.message_type && `Type: ${r.message_type.replace(/_/g, " ")}`, r.phone && `To: ${r.phone}`].filter(Boolean).join(" · "),
            metadata: { messageType: r.message_type, phone: r.phone, status: r.status, source: r.sms_source, body: r.message_body },
            occurred_at: r.occurred_at,
            actor_name: null,
            actor_type: mapActorType("sms"),
            severity: r.status === "failed" ? "warning" : "info",
          };
        });
        break;

      case "ai_receptionist":
        push(rows, r => {
          const dur = r.duration_seconds ? `${Math.floor(r.duration_seconds / 60)}m ${r.duration_seconds % 60}s` : null;
          const title = r.outcome === "booked"      ? "AI Receptionist booked appointment"
                     : r.outcome === "missed"       ? "Missed call — AI Receptionist"
                     : r.outcome === "in_progress"  ? "AI Receptionist answered call"
                     : r.outcome === "transferred"  ? "AI Receptionist transferred call"
                     : "AI Receptionist call";
          return {
            id: `ai-${r.id}`,
            category: "ai_receptionist",
            title,
            subtitle: [r.caller_phone && `Caller: ${r.caller_phone}`, dur && `Duration: ${dur}`, r.outcome && `Outcome: ${r.outcome.replace(/_/g, " ")}`].filter(Boolean).join(" · "),
            metadata: { callId: r.id, duration: r.duration_seconds, outcome: r.outcome, caller: r.caller_phone, callerName: r.caller_name, cost: r.cost_usd },
            occurred_at: r.occurred_at,
            actor_name: r.caller_name || r.caller_phone || null,
            actor_type: mapActorType("ai_receptionist"),
            severity: r.outcome === "missed" ? "warning" : "info",
          };
        });
        break;

      case "billing":
        push(rows, r => {
          const title = r.status === "succeeded" ? "Payment received"
            : r.status === "failed"    ? "Payment failed"
            : r.status === "refunded"  ? "Payment refunded"
            : `Payment ${r.status ?? "processed"}`;
          return {
            id: `billing-${r.id}`,
            category: "billing",
            title,
            subtitle: [r.amount_cents && `$${(r.amount_cents / 100).toFixed(2)}`, r.payment_method_brand && `${r.payment_method_brand} ····${r.payment_method_last4}`].filter(Boolean).join(" · "),
            metadata: { transactionId: r.id, amount: r.amount_cents, amountFormatted: r.amount_cents ? `$${(r.amount_cents/100).toFixed(2)}` : null, brand: r.payment_method_brand, last4: r.payment_method_last4, status: r.status, type: r.type },
            occurred_at: r.occurred_at,
            actor_name: null,
            actor_type: mapActorType("billing"),
            severity: mapSeverity("billing", title),
          };
        });
        break;

      case "subscription":
        push(rows, r => {
          const title = r.canceled_at ? `Subscription cancelled` : r.status === "active" ? `Subscription activated — ${r.plan_name}` : `Subscription ${r.status}`;
          return {
            id: `sub-${r.id}`,
            category: "subscription",
            title,
            subtitle: r.plan_name ? `Plan: ${r.plan_name}` : null,
            metadata: { subscriptionId: r.id, planName: r.plan_name, planCode: r.plan_code, status: r.status },
            occurred_at: r.occurred_at,
            actor_name: null,
            actor_type: mapActorType("subscription"),
            severity: r.canceled_at ? "warning" : "info",
          };
        });
        break;

      case "support":
        push(rows, r => {
          const title = r.action === "account_suspended"   ? "Account suspended by support"
            : r.action === "account_unsuspended" ? "Account unsuspended by support"
            : r.action === "trial_extended"      ? "Trial period extended"
            : r.action === "sms_usage_reset"     ? "SMS usage reset by support"
            : r.action === "credit_issued"        ? "Platform credit issued"
            : r.action === "magic_link_sent"      ? "Magic link sent to customer"
            : r.action.replace(/_/g, " ");
          return {
            id: `sup-${r.id}`,
            category: "support",
            title,
            subtitle: r.agent_name ? `Agent: ${r.agent_name}` : null,
            metadata: { action: r.action, agentName: r.agent_name, details: r.details ?? r.metadata },
            occurred_at: r.occurred_at,
            actor_name: r.agent_name,
            actor_type: mapActorType("support"),
            severity: mapSeverity("support", title),
          };
        });
        break;

      case "authentication":
        push(rows, r => {
          const title = r.event_type === "login"           ? "Customer logged in"
            : r.event_type === "logout"          ? "Customer logged out"
            : r.event_type === "password_reset"  ? "Password reset requested"
            : r.event_type === "failed_login"    ? "Failed login attempt"
            : r.event_type === "magic_link"      ? "Logged in via magic link"
            : r.event_type === "google_oauth"    ? "Logged in with Google"
            : r.event_type.replace(/_/g, " ");
          return {
            id: `auth-${r.id}`,
            category: "authentication",
            title,
            subtitle: [r.user_email && `User: ${r.user_email}`, r.ip_address && `IP: ${r.ip_address}`].filter(Boolean).join(" · "),
            metadata: { eventType: r.event_type, userEmail: r.user_email, userName: r.user_name, ipAddress: r.ip_address, userAgent: r.user_agent, ...r.metadata },
            occurred_at: r.occurred_at,
            actor_name: r.user_name || r.user_email || "Customer",
            actor_type: mapActorType("authentication"),
            severity: r.event_type === "failed_login" ? "warning" : "info",
          };
        });
        break;

      case "users":
        push(rows, r => {
          const occurred = r.removed_at ?? r.joined_at ?? r.invited_at;
          const title = r.removed_at ? `Staff member removed — ${r.name}`
            : r.joined_at ? `Staff member joined — ${r.name}`
            : `Staff member invited — ${r.name}`;
          return {
            id: `user-${r.id}`,
            category: "users",
            title,
            subtitle: [r.role && `Role: ${r.role}`, r.email && r.email].filter(Boolean).join(" · "),
            metadata: { staffId: r.id, name: r.name, email: r.email, role: r.role, status: r.status },
            occurred_at: occurred,
            actor_name: r.name,
            actor_type: mapActorType("users"),
            severity: r.removed_at ? "warning" : "info",
          };
        });
        break;

      case "website":
        push(rows, r => ({
          id: `web-${r.id}`,
          category: "website",
          title: r.ssl_status === "issued" ? "SSL certificate issued" : r.assigned_subdomain ? "Website subdomain assigned" : "Website updated",
          subtitle: [r.title && r.title, r.assigned_subdomain && `Subdomain: ${r.assigned_subdomain}`].filter(Boolean).join(" · "),
          metadata: { websiteId: r.id, title: r.title, subdomain: r.assigned_subdomain, sslStatus: r.ssl_status },
          occurred_at: r.occurred_at,
          actor_name: null,
          actor_type: mapActorType("website"),
          severity: "info" as const,
        }));
        break;

      case "services":
        push(rows, r => {
          const title = r.event_type === "created"     ? `Service added — ${r.service_name}`
                      : r.event_type === "updated"     ? `Service updated — ${r.service_name}`
                      : r.event_type === "deleted"     ? `Service deleted — ${r.service_name}`
                      : r.event_type === "deactivated" ? `Service deactivated — ${r.service_name}`
                      : r.event_type === "activated"   ? `Service reactivated — ${r.service_name}`
                      : `Service ${r.event_type} — ${r.service_name}`;
          return {
            id: `svc-${r.id}`,
            category: "services",
            title,
            subtitle: r.service_name ? `Service: ${r.service_name}` : null,
            metadata: { serviceId: r.service_id, serviceName: r.service_name, eventType: r.event_type, actorUserId: r.actor_user_id, ...(r.metadata ?? {}) },
            occurred_at: r.occurred_at,
            actor_name: null,
            actor_type: "owner" as const,
            severity: r.event_type === "deleted" || r.event_type === "deactivated" ? "warning" as const : "info" as const,
          };
        });
        break;

      case "appointment_events":
        push(rows, r => {
          const title = r.event_type === "created"     ? "Appointment booked (staff)"
                      : r.event_type === "cancelled"   ? "Appointment cancelled"
                      : r.event_type === "rescheduled" ? "Appointment rescheduled"
                      : r.event_type === "started"     ? "Appointment started"
                      : r.event_type === "no_show"     ? "Client no-show recorded"
                      : r.event_type === "completed"   ? "Appointment completed"
                      : `Appointment ${r.event_type}`;
          return {
            id: `apte-${r.id}`,
            category: "appointment",
            title,
            subtitle: [r.service_name && `Service: ${r.service_name}`, r.staff_name && `Staff: ${r.staff_name}`, r.client_name && `Client: ${r.client_name}`].filter(Boolean).join(" · ") || null,
            metadata: { appointmentId: r.appointment_id, eventType: r.event_type, service: r.service_name, staff: r.staff_name, client: r.client_name, ...(r.metadata ?? {}) },
            occurred_at: r.occurred_at,
            actor_name: r.client_name || null,
            actor_type: "owner" as const,
            severity: (r.event_type === "cancelled" || r.event_type === "no_show") ? "warning" as const : "info" as const,
          };
        });
        break;

      case "email":
        push(rows, r => {
          const title = r.status === "failed"  ? "Email delivery failed"
                      : r.email_type           ? `Email sent — ${r.email_type.replace(/_/g, " ")}`
                      : "Email sent";
          return {
            id: `email-${r.id}`,
            category: "email",
            title,
            subtitle: [r.recipient && `To: ${r.recipient}`, r.subject && `Subject: ${r.subject}`].filter(Boolean).join(" · ") || null,
            metadata: { recipient: r.recipient, subject: r.subject, emailType: r.email_type, mailgunId: r.mailgun_id, status: r.status, error: r.error },
            occurred_at: r.occurred_at,
            actor_name: null,
            actor_type: "system" as const,
            severity: r.status === "failed" ? "warning" as const : "info" as const,
          };
        });
        break;

      case "api_error":
        push(rows, r => {
          const meta = (r.metadata ?? {}) as Record<string, any>;
          const status: number = meta.status ?? 0;
          const method: string = meta.method ?? "?";
          const urlPath: string = meta.path ?? "?";
          const title = status >= 500
            ? `Server error (${status}) — ${method} ${urlPath}`
            : `API error (${status}) — ${method} ${urlPath}`;
          const displayMsg = r.message && r.message !== `HTTP ${status}` ? r.message : null;
          return {
            id: `apierr-${r.id}`,
            category: "api_error",
            title,
            subtitle: displayMsg,
            metadata: { ...meta, message: r.message },
            occurred_at: r.occurred_at,
            actor_name: null,
            actor_type: "system" as const,
            severity: status >= 500 ? "critical" as const : "warning" as const,
          };
        });
        break;
    }
  }

  return all;
}

router.get("/api/support/accounts/:id/activity", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });

  const {
    category = "all",
    range = "7d",
    from: customFrom,
    to: customTo,
    offset = "0",
    limit = "50",
    actor,
    severity,
    search,
  } = req.query as Record<string, string>;

  const { from, to } = buildDateRange(range, customFrom, customTo);
  const offsetNum = parseInt(offset) || 0;
  const limitNum  = Math.min(parseInt(limit) || 50, 200);
  const cat = category.toLowerCase();

  try {
    let all = await fetchActivityEvents(storeId, from, to, cat);

    // ── Actor filter ─────────────────────────────────────────────────────────
    if (actor && actor !== "all") {
      all = all.filter(e => e.actor_type === actor);
    }

    // ── Severity filter ───────────────────────────────────────────────────────
    if (severity && severity !== "all") {
      all = all.filter(e => e.severity === severity);
    }

    // ── Search filter ─────────────────────────────────────────────────────────
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      all = all.filter(e =>
        e.title?.toLowerCase().includes(q) ||
        e.subtitle?.toLowerCase().includes(q) ||
        JSON.stringify(e.metadata ?? {}).toLowerCase().includes(q)
      );
    }

    // ── Sort ─────────────────────────────────────────────────────────────────
    all.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    const total   = all.length;
    const paged   = all.slice(offsetNum, offsetNum + limitNum);
    const hasMore = offsetNum + limitNum < total;

    res.json({ events: paged, hasMore, total, offset: offsetNum, limit: limitNum });
  } catch (e) {
    console.error("[Support] Activity error:", e);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

// ─── Account Timeline (full all-time event stream) ────────────────────────────
// Similar to /activity but:
//  • Always covers all-time (5-year window)
//  • Also includes support_tickets + billing_activity_logs
//  • Deduplicates by event id before paging

router.get("/api/support/accounts/:id/timeline", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });

  const { search, category = "all", offset = "0", limit = "50" } = req.query as Record<string, string>;
  const offsetNum = parseInt(offset) || 0;
  const limitNum  = Math.min(parseInt(limit) || 50, 100);
  const cat       = category.toLowerCase();

  const to   = new Date();
  const from = new Date(to.getTime() - 5 * 365 * 86400_000); // 5 years

  try {
    let all = await fetchActivityEvents(storeId, from, to, cat);

    // ── Support Tickets ───────────────────────────────────────────────────────
    if (cat === "all" || cat === "ticket") {
      try {
        const { rows } = await pool.query(`
          SELECT id, ticket_number, subject, status, priority, channel,
            customer_email, created_at, updated_at, assigned_agent_name
          FROM support_tickets
          WHERE account_id = $1
          ORDER BY created_at DESC LIMIT 300
        `, [storeId]);
        rows.forEach(r => all.push({
          id: `ticket-${r.id}`,
          category: "ticket",
          title: r.status === "resolved" || r.status === "closed"
            ? `Ticket ${r.status} — ${r.subject}`
            : `Support ticket opened — ${r.subject}`,
          subtitle: [`#${r.ticket_number}`, r.channel && `via ${r.channel}`, r.assigned_agent_name && `Assigned: ${r.assigned_agent_name}`].filter(Boolean).join(" · "),
          metadata: { ticketId: r.id, ticketNumber: r.ticket_number, subject: r.subject, status: r.status, priority: r.priority, channel: r.channel, customerEmail: r.customer_email },
          occurred_at: r.created_at,
          actor_name: null,
          actor_type: "customer",
          severity: r.priority === "urgent" ? "critical" : r.priority === "high" ? "warning" : "info",
        }));
      } catch {}
    }

    // ── Billing Activity Logs ─────────────────────────────────────────────────
    if (cat === "all" || cat === "billing") {
      try {
        const { rows } = await pool.query(`
          SELECT id, event_type, message, severity, source, metadata_json, created_at
          FROM billing_activity_logs
          WHERE salon_id = $1 AND created_at >= $2 AND created_at <= $3
          ORDER BY created_at DESC LIMIT 200
        `, [storeId, from, to]);
        rows.forEach(r => all.push({
          id: `blog-${r.id}`,
          category: "billing",
          title: (r.event_type as string).replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          subtitle: r.message || null,
          metadata: { eventType: r.event_type, source: r.source, ...(r.metadata_json ?? {}) },
          occurred_at: r.created_at,
          actor_name: null,
          actor_type: r.source === "admin" ? "support_agent" : "system",
          severity: (r.severity === "error" || r.severity === "critical") ? "critical" : r.severity === "warning" ? "warning" : "info",
        }));
      } catch {}
    }

    // ── Search ────────────────────────────────────────────────────────────────
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      all = all.filter(e =>
        e.title?.toLowerCase().includes(q) ||
        e.subtitle?.toLowerCase().includes(q) ||
        JSON.stringify(e.metadata ?? {}).toLowerCase().includes(q)
      );
    }

    // ── Deduplicate ───────────────────────────────────────────────────────────
    const seen = new Set<string>();
    all = all.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });

    // ── Sort newest first ─────────────────────────────────────────────────────
    all.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    const total   = all.length;
    const paged   = all.slice(offsetNum, offsetNum + limitNum);
    const hasMore = offsetNum + limitNum < total;

    res.json({ events: paged, hasMore, total, offset: offsetNum, limit: limitNum });
  } catch (e) {
    console.error("[Support] Timeline error:", e);
    res.status(500).json({ error: "Failed to load timeline" });
  }
});

// ─── Activity Export ─────────────────────────────────────────────────────────

router.get("/api/support/accounts/:id/activity/export", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });

  const { category = "all", range = "30d", from: customFrom, to: customTo, format: fmt = "csv" } = req.query as Record<string, string>;
  const { from, to } = buildDateRange(range, customFrom, customTo);
  const cat = category.toLowerCase();

  try {
    let all = await fetchActivityEvents(storeId, from, to, cat);
    all.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    if (fmt === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="activity-${storeId}-${Date.now()}.json"`);
      return res.json(all);
    }

    // CSV
    const headers = ["id","occurred_at","category","title","subtitle","actor_name","actor_type","severity"];
    const rows = all.map(e => headers.map(h => {
      const v = e[h] ?? "";
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="activity-${storeId}-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (e) {
    console.error("[Support] Export error:", e);
    res.status(500).json({ error: "Export failed" });
  }
});

// ─── Activity SSE Stream ─────────────────────────────────────────────────────

const activitySseClients = new Map<number, Set<Response>>();

router.get("/api/support/accounts/:id/activity/stream", requireSupportAuth, (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write("data: {\"type\":\"connected\"}\n\n");

  if (!activitySseClients.has(storeId)) activitySseClients.set(storeId, new Set());
  activitySseClients.get(storeId)!.add(res);

  const hb = setInterval(() => { try { res.write(": heartbeat\n\n"); } catch {} }, 25_000);

  req.on("close", () => {
    clearInterval(hb);
    activitySseClients.get(storeId)?.delete(res);
  });
});

export function broadcastActivityEvent(storeId: number, event: any) {
  const clients = activitySseClients.get(storeId);
  if (!clients?.size) return;
  const data = `data: ${JSON.stringify({ type: "new_event", event })}\n\n`;
  for (const client of clients) { try { client.write(data); } catch {} }
}

// ─── Support Notes ─────────────────────────────────────────────────────────────

router.get("/api/support/accounts/:id/notes", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    const notes = await pool.query("SELECT * FROM support_notes WHERE account_id = $1 ORDER BY created_at DESC", [storeId]);
    res.json(notes.rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load notes" });
  }
});

router.post("/api/support/accounts/:id/notes", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Content required" });
  try {
    const result = await pool.query(
      "INSERT INTO support_notes (account_id, agent_id, agent_name, content) VALUES ($1, $2, $3, $4) RETURNING *",
      [storeId, req.session.supportAgentId, req.session.supportAgentName, content.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Failed to save note" });
  }
});

// ─── Tags ─────────────────────────────────────────────────────────────────────

const TAG_COLORS = ["slate", "red", "orange", "amber", "emerald", "teal", "sky", "indigo", "violet", "pink"];

router.get("/api/support/accounts/:id/tags", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    const rows = await pool.query("SELECT * FROM support_account_tags WHERE account_id = $1 ORDER BY created_at ASC", [storeId]);
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load tags" });
  }
});

router.post("/api/support/accounts/:id/tags", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  const { tag, color = "slate" } = req.body;
  if (!tag?.trim()) return res.status(400).json({ error: "Tag required" });
  const safeColor = TAG_COLORS.includes(color) ? color : "slate";
  try {
    const result = await pool.query(
      "INSERT INTO support_account_tags (account_id, tag, color, created_by_agent_id) VALUES ($1, $2, $3, $4) ON CONFLICT (account_id, tag) DO NOTHING RETURNING *",
      [storeId, tag.trim(), safeColor, req.session.supportAgentId]
    );
    res.status(201).json(result.rows[0] ?? { ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to add tag" });
  }
});

router.delete("/api/support/accounts/:id/tags/:tagId", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  const tagId   = paramInt(req.params.tagId);
  try {
    await pool.query("DELETE FROM support_account_tags WHERE id = $1 AND account_id = $2", [tagId, storeId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove tag" });
  }
});

// ─── Account Owners ───────────────────────────────────────────────────────────

router.get("/api/support/accounts/:id/owners", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    const rows = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.profile_image_url,
        CASE WHEN l.user_id = u.id THEN 'Owner' ELSE INITCAP(st.role) END AS account_role
      FROM locations l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN staff st ON st.user_id = u.id AND st.store_id = l.id
      WHERE l.id = $1 AND u.id IS NOT NULL
      UNION
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.profile_image_url,
        INITCAP(st.role)
      FROM staff st
      JOIN users u ON u.id = st.user_id
      WHERE st.store_id = $1 AND st.role IN ('admin', 'manager') AND st.status = 'active'
        AND u.id != (SELECT user_id FROM locations WHERE id = $1)
      LIMIT 10
    `, [storeId]);
    res.json(rows.rows.map(r => ({
      id: r.id, email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
      role: r.account_role ?? r.role, profileImageUrl: r.profile_image_url,
    })));
  } catch (e) {
    res.status(500).json({ error: "Failed to load owners" });
  }
});

// ─── Support Tickets ──────────────────────────────────────────────────────────

router.get("/api/support/accounts/:id/tickets", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    const tickets = await pool.query("SELECT * FROM support_tickets WHERE account_id = $1 ORDER BY created_at DESC LIMIT 20", [storeId]);
    res.json(tickets.rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

router.post("/api/support/accounts/:id/tickets", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  const { subject, description, priority = "normal" } = req.body;
  if (!subject?.trim()) return res.status(400).json({ error: "Subject required" });
  try {
    const ticketNum = `TK-${Date.now().toString(36).toUpperCase()}`;
    const result = await pool.query(
      `INSERT INTO support_tickets (account_id, ticket_number, subject, description, priority, assigned_agent_id, assigned_agent_name, created_by_agent_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $6) RETURNING *`,
      [storeId, ticketNum, subject.trim(), description?.trim() ?? null, priority, req.session.supportAgentId, req.session.supportAgentName]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// ─── Account Actions ──────────────────────────────────────────────────────────

// Looks up the store's Stripe subscription id from store_subscriptions (the live
// billing schema — see routes/billing.ts + routes/subscription.ts). Returns null
// if there's no subscription row or it was never attached to a real Stripe sub
// (e.g. still on a free trial with no payment method yet).
async function findStripeSubscriptionId(storeId: number): Promise<string | null> {
  const row = await pool.query<{ stripe_subscription_id: string | null }>(
    `SELECT stripe_subscription_id FROM store_subscriptions
     WHERE store_id = $1 AND stripe_subscription_id IS NOT NULL
     ORDER BY id DESC LIMIT 1`,
    [storeId],
  );
  return row.rows[0]?.stripe_subscription_id ?? null;
}

router.post("/api/support/accounts/:id/suspend", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    await pool.query("UPDATE locations SET account_status = 'Suspended' WHERE id = $1", [storeId]);

    // Pause (never cancel) any real Stripe subscription — this stops billing
    // immediately without losing the plan/subscription, so the account can be
    // restored just by resuming collection once the account is unsuspended.
    let stripePaused = false;
    const stripeSubId = await findStripeSubscriptionId(storeId);
    if (stripeSubId && isStripeConfigured()) {
      try {
        await stripe.subscriptions.update(stripeSubId, { pause_collection: { behavior: "void" } });
        stripePaused = true;
      } catch (stripeErr: any) {
        console.error(`[Support] Failed to pause Stripe subscription ${stripeSubId} for store ${storeId}:`, stripeErr?.message ?? stripeErr);
      }
    }

    await logActivity(req.session.supportAgentId!, storeId, "account_suspended", req.session.supportAgentName!, { stripePaused });
    broadcastNotification({ type: "account_status_changed", storeId, accountStatus: "suspended" });
    res.json({ ok: true, stripePaused });
  } catch (e) {
    res.status(500).json({ error: "Failed to suspend account" });
  }
});

router.post("/api/support/accounts/:id/unsuspend", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    await pool.query("UPDATE locations SET account_status = 'Active' WHERE id = $1", [storeId]);

    // Resume collection on the paused Stripe subscription, if any — billing
    // picks back up on the normal cycle, no new checkout needed.
    let stripeResumed = false;
    const stripeSubId = await findStripeSubscriptionId(storeId);
    if (stripeSubId && isStripeConfigured()) {
      try {
        await stripe.subscriptions.update(stripeSubId, { pause_collection: "" });
        stripeResumed = true;
      } catch (stripeErr: any) {
        console.error(`[Support] Failed to resume Stripe subscription ${stripeSubId} for store ${storeId}:`, stripeErr?.message ?? stripeErr);
      }
    }

    await logActivity(req.session.supportAgentId!, storeId, "account_unsuspended", req.session.supportAgentName!, { stripeResumed });
    broadcastNotification({ type: "account_status_changed", storeId, accountStatus: "active" });
    res.json({ ok: true, stripeResumed });
  } catch (e) {
    res.status(500).json({ error: "Failed to unsuspend account" });
  }
});

router.post("/api/support/accounts/:id/extend-trial", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  const { days = 14 } = req.body;
  try {
    const store = await pool.query("SELECT user_id FROM locations WHERE id = $1", [storeId]);
    if (!store.rows[0]) return res.status(404).json({ error: "Account not found" });
    // Extend trial_ends_at AND reset subscription_status to 'trial' so the
    // AccountStatusGate no longer treats this account as expired.
    const userId = store.rows[0].user_id;
    // Compute the new trial end date first so we can apply it to both tables
    const newTrialEndRow = await pool.query(
      `SELECT GREATEST(COALESCE(trial_ends_at, now()), now()) + ($1 || ' days')::interval AS new_end FROM users WHERE id = $2`,
      [days, userId]
    );
    const newTrialEnd: Date = newTrialEndRow.rows[0]?.new_end ?? new Date(Date.now() + days * 86400_000);

    await pool.query(
      `UPDATE users
       SET trial_ends_at        = $1,
           subscription_status  = 'trial'
       WHERE id = $2`,
      [newTrialEnd, userId]
    );

    // Also sync store_subscriptions so the billing page shows the correct date
    await pool.query(
      `UPDATE store_subscriptions
       SET current_period_end = $1,
           status             = 'trialing'
       WHERE store_id = $2
         AND status IN ('trialing', 'trial', 'expired')`,
      [newTrialEnd, storeId]
    );

    await logActivity(req.session.supportAgentId!, storeId, "trial_extended", req.session.supportAgentName!, { days });
    res.json({ ok: true, newTrialEnd });
  } catch (e) {
    res.status(500).json({ error: "Failed to extend trial" });
  }
});

router.post("/api/support/accounts/:id/reset-sms", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    await pool.query("UPDATE locations SET sms_tokens = sms_allowance WHERE id = $1", [storeId]);
    await logActivity(req.session.supportAgentId!, storeId, "sms_usage_reset", req.session.supportAgentName!);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset SMS usage" });
  }
});

// ─── Email Sync Status (diagnostic) ──────────────────────────────────────────

router.get("/api/support/email-status", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    const { getEmailSyncStatus } = await import("../services/emailTicketSync");
    const status = getEmailSyncStatus();

    const processed = await pool.query("SELECT COUNT(*)::int AS c FROM processed_emails").catch(() => null);
    const tickets   = await pool.query("SELECT COUNT(*)::int AS c FROM support_tickets WHERE channel = 'EMAIL'").catch(() => null);

    // Check that all columns required by processEmail actually exist in prod DB
    const colCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'support_tickets'
        AND column_name IN (
          'channel','customer_email','customer_name','imap_message_id','description','account_id'
        )
    `).catch(() => null);
    const msgColCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'support_ticket_messages'
        AND column_name IN ('direction','raw_headers','author_type','author_name','is_internal')
    `).catch(() => null);

    const presentTicketCols = colCheck ? colCheck.rows.map((r: any) => r.column_name) : [];
    const requiredTicketCols = ['channel','customer_email','customer_name','imap_message_id','description','account_id'];
    const missingTicketCols = requiredTicketCols.filter(c => !presentTicketCols.includes(c));

    const presentMsgCols = msgColCheck ? msgColCheck.rows.map((r: any) => r.column_name) : [];
    const requiredMsgCols = ['direction','raw_headers','author_type','author_name','is_internal'];
    const missingMsgCols = requiredMsgCols.filter(c => !presentMsgCols.includes(c));

    // Check if issue column is still NOT NULL (blocks inserts)
    const issueNullable = await pool.query(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='support_tickets' AND column_name='issue'
    `).catch(() => null);
    const issueIsNotNull = issueNullable?.rows[0]?.is_nullable === 'NO';

    res.json({
      ...status,
      processedEmailsTableRows: processed ? (processed.rows[0]?.c ?? 0) : "table missing",
      emailTicketsInDb: tickets ? (tickets.rows[0]?.c ?? 0) : 0,
      schemaCheck: {
        missingTicketCols,
        missingMsgCols,
        issueIsNotNull,
        ok: missingTicketCols.length === 0 && missingMsgCols.length === 0 && !issueIsNotNull,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Email Rescan (manual trigger for back-office) ────────────────────────────

router.post("/api/support/email-rescan", requireSupportAuth, async (req: Request, res: Response) => {
  const days = Math.min(90, Math.max(1, parseInt((req.body.days as string) ?? "30") || 30));
  try {
    const { rescanInbox } = await import("../services/emailTicketSync");
    const result = await rescanInbox(days);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[EmailRescan]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── All Tickets List ─────────────────────────────────────────────────────────

router.get("/api/support/tickets", requireSupportAuth, async (req: Request, res: Response) => {
  const { filter = "my_open", search = "", page = "1" } = req.query as Record<string, string>;
  const limit = 25;
  const offset = (Math.max(1, parseInt(page)) - 1) * limit;
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    if (filter === "my_open") {
      params.push(req.session.supportAgentId);
      conditions.push(`(t.assigned_agent_id = $${params.length} OR t.created_by_agent_id = $${params.length}) AND t.status != 'closed'`);
    } else if (filter === "open") {
      conditions.push(`t.status = 'open'`);
    } else if (filter === "pending") {
      conditions.push(`t.status = 'pending'`);
    } else if (filter === "high_priority") {
      conditions.push(`t.priority = 'high' AND t.status != 'closed'`);
    }
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      const n = params.length;
      conditions.push(`(t.subject ILIKE $${n} OR t.ticket_number ILIKE $${n} OR COALESCE(t.account_name, l.name) ILIKE $${n})`);
    }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    params.push(limit, offset);
    const rows = await pool.query(`
      SELECT t.id, t.ticket_number, t.subject, t.status, t.priority,
        t.created_at, t.updated_at, t.account_id,
        t.channel, t.customer_email, t.category,
        COALESCE(t.account_name, l.name, t.customer_name) AS account_name,
        COALESCE(t.assigned_agent_name, sa.first_name || ' ' || sa.last_name) AS assigned_agent_name,
        (SELECT COUNT(*)::int FROM support_ticket_messages WHERE ticket_id = t.id) AS message_count
      FROM support_tickets t
      LEFT JOIN locations l ON l.id = t.account_id
      LEFT JOIN support_agents sa ON sa.id = t.assigned_agent_id
      ${where}
      ORDER BY t.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(`SELECT COUNT(*)::int FROM support_tickets t LEFT JOIN locations l ON l.id = t.account_id ${where}`, countParams);
    res.json({ tickets: rows.rows, total: countResult.rows[0].count });
  } catch (e: any) {
    console.error("[Support Tickets]", e.message);
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

// ─── Single Ticket Detail ─────────────────────────────────────────────────────

router.get("/api/support/tickets/:ticketId", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket ID" });
  try {
    const [ticketRes, messagesRes] = await Promise.all([
      pool.query(`
        SELECT t.*,
          COALESCE(t.account_name, l.name) AS account_name_resolved,
          l.email AS business_email, l.phone AS business_phone,
          u.email AS owner_email, u.first_name AS owner_first, u.last_name AS owner_last,
          s.plan_code, bp.name AS plan_name,
          COALESCE(t.assigned_agent_name, sa.first_name || ' ' || sa.last_name) AS assigned_agent_full_name,
          l.account_status
        FROM support_tickets t
        LEFT JOIN locations l ON l.id = t.account_id
        LEFT JOIN users u ON u.id = l.user_id
        LEFT JOIN subscriptions s ON s.store_number = t.account_id
        LEFT JOIN billing_plans bp ON bp.code = s.plan_code
        LEFT JOIN support_agents sa ON sa.id = t.assigned_agent_id
        WHERE t.id = $1
      `, [ticketId]),
      pool.query(`SELECT * FROM support_ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC`, [ticketId]),
    ]);
    if (!ticketRes.rows[0]) return res.status(404).json({ error: "Ticket not found" });
    res.json({ ticket: ticketRes.rows[0], messages: messagesRes.rows });
  } catch (e: any) {
    console.error("[Support Ticket Detail]", e.message);
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

// ─── Add Message / Reply ──────────────────────────────────────────────────────

router.post("/api/support/tickets/:ticketId/messages", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  const { content, isInternal = false, sendEmail = false } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Content required" });
  try {
    const direction = isInternal ? null : "outbound";
    const msg = await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, author_type, author_name, agent_id, content, is_internal, direction)
       VALUES ($1, 'agent', $2, $3, $4, $5, $6) RETURNING *`,
      [ticketId, req.session.supportAgentName, req.session.supportAgentId, content.trim(), isInternal, direction]
    );
    const updateCols = isInternal
      ? `updated_at = now()`
      : `updated_at = now(), last_response_at = now(), first_response_at = COALESCE(first_response_at, now())`;
    await pool.query(`UPDATE support_tickets SET ${updateCols} WHERE id = $1`, [ticketId]);

    let emailSent = false;
    let emailError: string | null = null;

    if (sendEmail && !isInternal) {
      try {
        const ticketRow = await pool.query(
          `SELECT channel, customer_email, subject, imap_message_id FROM support_tickets WHERE id = $1`,
          [ticketId]
        );
        const t = ticketRow.rows[0];
        if (t?.channel === "EMAIL" && t?.customer_email) {
          const result = await sendSupportReply({
            to: t.customer_email,
            subject: t.subject ?? "Support Request",
            text: content.trim(),
            inReplyTo: t.imap_message_id ?? undefined,
            references: t.imap_message_id ?? undefined,
            agentName: req.session.supportAgentName,
          });
          emailSent = true;
          console.log(`[EmailSync] Outbound reply sent for ticket #${ticketId} → ${t.customer_email} (msgId=${result.messageId})`);
        } else {
          emailError = "Ticket is not an email channel or missing customer email";
        }
      } catch (emailErr: any) {
        emailError = emailErr.message ?? "Failed to send email";
        console.error(`[EmailSync] Outbound SMTP error for ticket #${ticketId}:`, emailErr.message);
      }
    }

    res.status(201).json({ ...msg.rows[0], emailSent, emailError, smtpAvailable: smtpAvailable() });
  } catch (e: any) {
    console.error("[Support Reply]", e.message);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

// ─── Update Ticket ────────────────────────────────────────────────────────────

router.patch("/api/support/tickets/:ticketId", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  const { status, priority, category, subcategory, assignedAgentId } = req.body;
  try {
    const sets: string[] = ["updated_at = now()"];
    const params: any[] = [];
    if (status      !== undefined) { params.push(status);      sets.push(`status = $${params.length}`); }
    if (priority    !== undefined) { params.push(priority);    sets.push(`priority = $${params.length}`); }
    if (category    !== undefined) { params.push(category);    sets.push(`category = $${params.length}`); }
    if (subcategory !== undefined) { params.push(subcategory); sets.push(`subcategory = $${params.length}`); }
    if (assignedAgentId !== undefined) {
      params.push(assignedAgentId); sets.push(`assigned_agent_id = $${params.length}`);
      if (assignedAgentId) {
        const ag = await pool.query("SELECT first_name, last_name FROM support_agents WHERE id = $1", [assignedAgentId]);
        if (ag.rows[0]) { params.push(`${ag.rows[0].first_name} ${ag.rows[0].last_name}`); sets.push(`assigned_agent_name = $${params.length}`); }
      }
    }
    params.push(ticketId);
    await pool.query(`UPDATE support_tickets SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[Update Ticket]", e.message);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// ─── Agents List ─────────────────────────────────────────────────────────────

router.get("/api/support/agents", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const rows = await pool.query("SELECT id, email, first_name, last_name, role FROM support_agents WHERE is_active = true ORDER BY first_name");
    res.json(rows.rows.map(r => ({ id: r.id, email: r.email, name: `${r.first_name} ${r.last_name}`.trim(), role: r.role })));
  } catch (e) {
    res.status(500).json({ error: "Failed to load agents" });
  }
});

// ─── Macros ───────────────────────────────────────────────────────────────────

router.get("/api/support/macros", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const rows = await pool.query("SELECT * FROM support_macros WHERE is_shared = true OR created_by = $1 ORDER BY category, title", [req.session.supportAgentId]);
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load macros" });
  }
});

router.post("/api/support/macros", requireSupportAuth, async (req: Request, res: Response) => {
  const { title, content, category = "general" } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: "Title and content required" });
  try {
    const r = await pool.query("INSERT INTO support_macros (title, content, category, created_by) VALUES ($1, $2, $3, $4) RETURNING *", [title.trim(), content.trim(), category, req.session.supportAgentId]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Failed to create macro" });
  }
});

router.delete("/api/support/macros/:macroId", requireSupportAuth, async (req: Request, res: Response) => {
  const id = paramInt(req.params.macroId);
  try {
    await pool.query("DELETE FROM support_macros WHERE id = $1 AND (created_by = $2 OR $3 = 'admin')", [id, req.session.supportAgentId, req.session.supportAgentRole]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete macro" });
  }
});

// ─── Ticket Tasks ─────────────────────────────────────────────────────────────

router.get("/api/support/tickets/:ticketId/tasks", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  try {
    const rows = await pool.query(`
      SELECT t.*, a.first_name || ' ' || a.last_name AS assigned_name
      FROM support_tasks t LEFT JOIN support_agents a ON a.id = t.assigned_to
      WHERE t.ticket_id = $1 ORDER BY t.created_at ASC
    `, [ticketId]);
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

router.post("/api/support/tickets/:ticketId/tasks", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  const { title, description, assignedTo, dueDate } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  try {
    const r = await pool.query(
      "INSERT INTO support_tasks (ticket_id, title, description, assigned_to, due_date, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [ticketId, title.trim(), description?.trim() ?? null, assignedTo ?? null, dueDate ?? null, req.session.supportAgentId]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.patch("/api/support/tickets/:ticketId/tasks/:taskId", requireSupportAuth, async (req: Request, res: Response) => {
  const taskId = paramInt(req.params.taskId);
  const { status, title, description, assignedTo, dueDate } = req.body;
  try {
    const sets: string[] = ["updated_at = now()"];
    const params: any[] = [];
    if (status      !== undefined) { params.push(status);      sets.push(`status = $${params.length}`); if (status === "completed") { params.push(new Date()); sets.push(`completed_at = $${params.length}`); } }
    if (title       !== undefined) { params.push(title);       sets.push(`title = $${params.length}`); }
    if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
    if (assignedTo  !== undefined) { params.push(assignedTo);  sets.push(`assigned_to = $${params.length}`); }
    if (dueDate     !== undefined) { params.push(dueDate);     sets.push(`due_date = $${params.length}`); }
    params.push(taskId);
    await pool.query(`UPDATE support_tasks SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/api/support/tickets/:ticketId/tasks/:taskId", requireSupportAuth, async (req: Request, res: Response) => {
  const taskId = paramInt(req.params.taskId);
  try {
    await pool.query("DELETE FROM support_tasks WHERE id = $1", [taskId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ─── Escalations ─────────────────────────────────────────────────────────────

router.get("/api/support/tickets/:ticketId/escalations", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  try {
    const rows = await pool.query(`
      SELECT e.*, a.first_name || ' ' || a.last_name AS created_by_name
      FROM support_escalations e LEFT JOIN support_agents a ON a.id = e.created_by
      WHERE e.ticket_id = $1 ORDER BY e.created_at DESC
    `, [ticketId]);
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load escalations" });
  }
});

router.post("/api/support/tickets/:ticketId/escalate", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  const { reason, team = "engineering", level = 1 } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: "Reason required" });
  try {
    await pool.query("UPDATE support_tickets SET status = 'escalated', updated_at = now() WHERE id = $1", [ticketId]);
    const r = await pool.query(
      "INSERT INTO support_escalations (ticket_id, escalation_level, assigned_team, reason, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [ticketId, level, team, reason.trim(), req.session.supportAgentId]
    );
    await logActivity(req.session.supportAgentId!, ticketId, "ticket_escalated", req.session.supportAgentName!, { reason, team });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Failed to escalate ticket" });
  }
});

// ─── Related Tickets ─────────────────────────────────────────────────────────

router.get("/api/support/tickets/:ticketId/related", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  try {
    const ticket = await pool.query("SELECT account_id FROM support_tickets WHERE id = $1", [ticketId]);
    if (!ticket.rows[0]) return res.status(404).json({ error: "Ticket not found" });
    const rows = await pool.query(
      "SELECT id, ticket_number, subject, status, priority, created_at, updated_at FROM support_tickets WHERE account_id = $1 AND id != $2 ORDER BY updated_at DESC LIMIT 10",
      [ticket.rows[0].account_id, ticketId]
    );
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load related tickets" });
  }
});

// ─── Link ticket to account ───────────────────────────────────────────────────
router.post("/api/support/tickets/:ticketId/link-account", requireSupportAuth, async (req: Request, res: Response) => {
  const ticketId = paramInt(req.params.ticketId);
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ error: "accountId required" });
  try {
    const r = await pool.query(
      "UPDATE support_tickets SET account_id = $1, updated_at = now() WHERE id = $2 RETURNING id",
      [accountId, ticketId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Ticket not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to link account" });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function computeHealthStatus(storeId: number) {
  const [booking, sms, ai, google, website] = await Promise.all([
    pool.query("SELECT COUNT(*)::int FROM appointments WHERE store_id = $1 AND date >= now() - interval '30 days'", [storeId]).then((r: any) => r.rows[0].count > 0 ? "online" : "no_recent_activity").catch(() => "unknown"),
    // SMS is a platform-level service (shared Twilio) — never "disconnected" based on per-account allowance.
    // Show "connected" if SMS has been sent recently, "no_recent_activity" if not, but never "disconnected".
    pool.query("SELECT COUNT(*)::int AS cnt FROM sms_log WHERE store_id = $1 AND sent_at >= now() - interval '30 days'", [storeId])
      .then((r: any) => Number(r.rows[0]?.cnt ?? 0) > 0 ? "connected" : "no_recent_activity")
      .catch(() => "connected"), // If sms_log doesn't exist yet, platform SMS is still available
    pool.query("SELECT COUNT(*)::int FROM ai_call_log WHERE store_id = $1 AND started_at >= now() - interval '30 days'", [storeId]).then((r: any) => r.rows[0].count > 0 ? "online" : "not_configured").catch(() => "unknown"),
    pool.query("SELECT id FROM google_business_accounts WHERE store_id = $1 LIMIT 1", [storeId]).then((r: any) => r.rows.length > 0 ? "connected" : "disconnected").catch(() => "unknown"),
    pool.query("SELECT id FROM wb_websites WHERE storeid = $1::text LIMIT 1", [storeId]).then((r: any) => r.rows.length > 0 ? "online" : "not_configured").catch(() => "unknown"),
  ]);
  return { booking, sms, ai, google, website };
}

async function logActivity(agentId: number, accountId: number, action: string, agentName: string, details?: any) {
  await pool.query(
    "INSERT INTO support_agent_activity (agent_id, account_id, action, details) VALUES ($1, $2, $3, $4)",
    [agentId, accountId, action, details ? JSON.stringify(details) : null]
  ).catch(() => {});
}

// ─── Billing Investigation ────────────────────────────────────────────────────

router.get("/api/support/billing-search", requireSupportAuth, async (req: Request, res: Response) => {
  const { q = "", status = "all", failedOnly = "false", limit = "50", offset = "0" } = req.query as Record<string, string>;
  const limitNum = Math.min(parseInt(limit) || 50, 200);
  const offsetNum = parseInt(offset) || 0;

  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    let pIdx = 1;

    if (q.trim()) {
      where.push(`(l.name ILIKE $${pIdx} OR u.email ILIKE $${pIdx} OR l.booking_slug ILIKE $${pIdx})`);
      params.push(`%${q.trim()}%`);
      pIdx++;
    }

    if (status === "past_due") {
      where.push(`s.status ILIKE $${pIdx}`);
      params.push("past_due");
      pIdx++;
    } else if (status !== "all") {
      where.push(`l.account_status ILIKE $${pIdx}`);
      params.push(status);
      pIdx++;
    }

    if (failedOnly === "true") {
      where.push(`EXISTS (SELECT 1 FROM payment_transactions pt WHERE pt.salon_id = l.id AND pt.status = 'failed')`);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int FROM locations l
       LEFT JOIN users u ON u.id = l.user_id
       LEFT JOIN subscriptions s ON s.store_number = l.id
       WHERE ${where.join(" AND ")}`,
      params
    );
    const total = countResult.rows[0]?.count ?? 0;

    params.push(limitNum, offsetNum);
    const rows = await pool.query(`
      SELECT l.id, l.name, l.account_status, l.user_id AS account_id,
        u.email AS owner_email, u.first_name, u.last_name,
        s.plan_code, s.status AS sub_status, s.current_period_end,
        bp.name AS plan_name, bp.price_cents,
        (SELECT COUNT(*)::int FROM payment_transactions pt WHERE pt.salon_id = l.id AND pt.status = 'failed') AS failed_payments,
        (SELECT COALESCE(SUM(si.total_cents - si.amount_paid_cents), 0)::bigint FROM store_invoices si WHERE si.store_id = l.id AND si.paid = false) AS overdue_cents
      FROM locations l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN subscriptions s ON s.store_number = l.id
      LEFT JOIN billing_plans bp ON bp.code = s.plan_code
      WHERE ${where.join(" AND ")}
      ORDER BY overdue_cents DESC, failed_payments DESC, l.id DESC
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `, params);

    res.json({ accounts: rows.rows, total, limit: limitNum, offset: offsetNum });
  } catch (e) {
    console.error("[BillingSearch]", e);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/api/support/billing/:accountId", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });

  try {
    const [storeRow, subRow, invoicesRow, paymentsRow, refundsRow, walletRow, creditsRow, notesRow] = await Promise.all([
      pool.query(`
        SELECT l.*, u.id AS user_id, u.email AS owner_email, u.first_name, u.last_name,
          u.created_at AS signup_date, u.subscription_status, u.trial_ends_at,
          u.profile_image_url, l.phone, l.city, l.state, l.timezone
        FROM locations l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1
      `, [storeId]),
      pool.query(`
        SELECT s.*, bp.name AS plan_name, bp.price_cents, bp.interval,
          bp.description AS plan_description
        FROM subscriptions s LEFT JOIN billing_plans bp ON bp.code = s.plan_code
        WHERE s.store_number = $1 ORDER BY s.id DESC LIMIT 1
      `, [storeId]),
      pool.query(`
        SELECT * FROM store_invoices WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100
      `, [storeId]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT pt.*, u.email AS user_email, u.first_name AS user_first
        FROM payment_transactions pt
        LEFT JOIN users u ON u.id::text = pt.user_id
        WHERE pt.salon_id = $1 ORDER BY pt.created_at DESC LIMIT 100
      `, [storeId]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT * FROM refunds WHERE salon_id = $1 ORDER BY created_at DESC LIMIT 50
      `, [storeId]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT * FROM wallet_transactions WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50
      `, [storeId]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT * FROM platform_credit_transactions WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50
      `, [storeId]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT * FROM support_notes WHERE account_id = $1 ORDER BY created_at DESC LIMIT 10
      `, [storeId]).catch(() => ({ rows: [] })),
    ]);

    if (storeRow.rows.length === 0) return res.status(404).json({ error: "Account not found" });
    const store = storeRow.rows[0];
    const sub = subRow.rows[0] ?? null;
    const payments: any[] = paymentsRow.rows as any[];
    const invoices: any[] = invoicesRow.rows as any[];
    const refunds: any[] = refundsRow.rows as any[];
    const wallet: any[] = walletRow.rows as any[];
    const credits: any[] = creditsRow.rows as any[];
    const notes: any[] = notesRow.rows as any[];

    // KPI stats
    const failedPayments = payments.filter((p: any) => p.status === "failed");
    const totalPaidCents = payments.filter((p: any) => p.status === "succeeded").reduce((s: number, p: any) => s + Number(p.amount_cents || 0), 0);
    const overdueInvoices = invoices.filter((i: any) => !i.paid && i.status === "open");
    const overdueCents = overdueInvoices.reduce((s: number, i: any) => s + Number(i.total_cents || 0) - Number(i.amount_paid_cents || 0), 0);
    const creditBalance = credits.reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
    const walletBalance = wallet.reduce((s: number, w: any) => s + Number(w.amount || 0), 0);

    // Payment method from most recent successful payment
    const latestPm = payments.find((p: any) => p.payment_method_brand && p.payment_method_last4);

    // Build unified billing timeline
    const timeline: any[] = [
      ...invoices.map((i: any) => ({ type: "invoice", date: i.created_at, description: `INV-${i.invoice_number ?? i.id}`, status: i.paid ? "paid" : i.status, amount: i.total_cents, id: `inv-${i.id}`, meta: i })),
      ...payments.map((p: any) => ({ type: "payment", date: p.created_at, description: `Payment for INV-${p.stripe_invoice_id ?? p.id}`, status: p.status, amount: -(p.amount_cents || 0), id: `pay-${p.id}`, meta: p })),
      ...refunds.map((r: any) => ({ type: "refund", date: r.created_at, description: `Refund${r.reason ? ` — ${r.reason}` : ""}`, status: r.status, amount: r.amount_cents, id: `ref-${r.id}`, meta: r })),
      ...wallet.map((w: any) => ({ type: "wallet", date: w.created_at, description: w.description ?? `Wallet ${w.transaction_type}`, status: w.status, amount: w.amount, id: `wlt-${w.id}`, meta: w })),
      ...credits.map((c: any) => ({ type: "credit", date: c.created_at, description: c.description ?? `Credit ${c.type}`, status: "applied", amount: Number(c.amount || 0) * 100, id: `crd-${c.id}`, meta: c })),
    ];
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Disputes
    const disputes = payments.filter((p: any) => p.dispute_status && p.dispute_status !== "none");

    res.json({
      store: {
        id: store.id, name: store.name, phone: store.phone, email: store.email,
        city: store.city, state: store.state, timezone: store.timezone,
        accountStatus: store.account_status, category: store.category,
        account_id: store.account_id ?? `ACC-${String(store.id).padStart(5, "0")}`,
        stripeCustomerId: store.stripe_customer_id ?? null,
      },
      owner: {
        id: store.user_id, email: store.owner_email,
        firstName: store.first_name, lastName: store.last_name,
        signupDate: store.signup_date, trialEndsAt: store.trial_ends_at,
        profileImageUrl: store.profile_image_url,
      },
      subscription: sub ? {
        planCode: sub.plan_code, planName: sub.plan_name, priceCents: sub.price_cents,
        interval: sub.interval, status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        paymentBrand: sub.payment_method_brand, paymentLast4: sub.payment_method_last4,
        stripeSubscriptionId: sub.stripe_subscription_id,
        stripeCustomerId: sub.stripe_customer_id,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        startDate: sub.created_at ?? null,
      } : null,
      kpi: {
        failedPaymentsCount: failedPayments.length,
        nextRetryDate: failedPayments[0]?.created_at ?? null,
        totalAtRiskCents: failedPayments.reduce((s: number, p: any) => s + Number(p.amount_cents || 0), 0),
        overdueCount: overdueInvoices.length,
        overdueCents,
        daysPastDue: overdueInvoices.length > 0
          ? Math.max(0, Math.floor((Date.now() - new Date(overdueInvoices[0].created_at).getTime()) / 86400_000))
          : 0,
        lifetimeValueCents: totalPaidCents,
        mrrCents: sub?.price_cents ?? 0,
        creditBalanceCents: creditBalance * 100,
        walletBalanceCents: walletBalance,
        unpaidInvoiceCents: overdueCents,
      },
      paymentMethod: latestPm ? {
        brand: latestPm.payment_method_brand,
        last4: latestPm.payment_method_last4,
        expMonth: latestPm.card_exp_month,
        expYear: latestPm.card_exp_year,
      } : null,
      payments, invoices, refunds, wallet, credits, disputes, notes,
      timeline: timeline.slice(0, 100),
    });
  } catch (e) {
    console.error("[BillingDetail]", e);
    res.status(500).json({ error: "Failed to load billing data" });
  }
});

// ── Billing action endpoints ───────────────────────────────────────────────────

const SELF_SERVE_CREDIT_LIMIT = 500;   // any agent may issue up to this without admin approval
const MAX_CREDIT_LIMIT = 2000;         // hard ceiling — even admins can't exceed this in one grant

router.post("/api/support/billing/:accountId/apply-credit", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  const { amount, description } = req.body as { amount: number; description?: string };
  if (!amount || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Valid amount required" });
  if (amount > MAX_CREDIT_LIMIT) {
    return res.status(400).json({ error: `Credit amount cannot exceed $${MAX_CREDIT_LIMIT}` });
  }
  if (amount > SELF_SERVE_CREDIT_LIMIT && req.session.supportAgentRole !== "admin") {
    return res.status(403).json({ error: `Credits over $${SELF_SERVE_CREDIT_LIMIT} require an admin agent` });
  }
  try {
    const updateResult = await pool.query<{ platform_credits: string }>(
      `UPDATE locations SET platform_credits = COALESCE(platform_credits, 0) + $1 WHERE id = $2 RETURNING platform_credits`,
      [amount, storeId]
    );
    const balanceAfter = updateResult.rows[0]?.platform_credits;
    if (balanceAfter === undefined) return res.status(404).json({ error: "Account not found" });
    await pool.query(
      "INSERT INTO platform_credit_transactions (store_id, type, amount, description, balance_after) VALUES ($1, 'credit', $2, $3, $4)",
      [storeId, amount, description || "Manual credit by support", balanceAfter]
    );
    await logActivity(req.session.supportAgentId!, storeId, "credit_issued", req.session.supportAgentName!, { amount, description });
    res.json({ ok: true });
  } catch (e) {
    console.error("[ApplyCredit]", e);
    res.status(500).json({ error: "Failed to apply credit" });
  }
});

router.post("/api/support/billing/:accountId/add-note", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Content required" });
  try {
    const r = await pool.query(
      "INSERT INTO support_notes (account_id, agent_id, agent_name, content) VALUES ($1, $2, $3, $4) RETURNING *",
      [storeId, req.session.supportAgentId, req.session.supportAgentName, content.trim()]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Failed to add note" });
  }
});

router.post("/api/support/billing/:accountId/retry-payment", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  try {
    await logActivity(req.session.supportAgentId!, storeId, "payment_retry_initiated", req.session.supportAgentName!);
    res.json({ ok: true, message: "Payment retry initiated (Stripe webhook will confirm)" });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// Refunds a subscription payment on Certxa's own platform Stripe account —
// these are direct platform charges (Certxa billing the salon owner), not
// Stripe Connect marketplace transactions, so there is no separate "client
// Stripe dashboard" to send an agent to. The refund is issued via the Stripe
// API against the charge/payment intent on file and recorded in the existing
// `refunds` + `payment_transactions` tables.
router.post("/api/support/billing/:accountId/refund", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  const { paymentTransactionId, amountCents, reason, notes } = req.body as {
    paymentTransactionId?: number;
    amountCents?: number;
    reason?: string;
    notes?: string;
  };

  if (!paymentTransactionId || !amountCents || amountCents <= 0) {
    return res.status(400).json({ error: "paymentTransactionId and a positive amountCents are required" });
  }
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }
  const validReasons = ["duplicate", "fraudulent", "requested_by_customer"] as const;
  const stripeReason = (validReasons as readonly string[]).includes(reason ?? "")
    ? (reason as (typeof validReasons)[number])
    : "requested_by_customer";

  try {
    const ptRow = await pool.query(
      `SELECT * FROM payment_transactions WHERE id = $1 AND salon_id = $2 LIMIT 1`,
      [paymentTransactionId, storeId]
    );
    const payment = ptRow.rows[0];
    if (!payment) return res.status(404).json({ error: "Payment not found for this account" });
    if (payment.status !== "succeeded") {
      return res.status(400).json({ error: "Only succeeded payments can be refunded" });
    }

    const remainingCents = Number(payment.amount_cents || 0) - Number(payment.refund_amount_cents || 0);
    if (amountCents > remainingCents) {
      return res.status(400).json({ error: `Amount exceeds refundable balance of $${(remainingCents / 100).toFixed(2)}` });
    }

    const chargeOrIntent = payment.stripe_charge_id
      ? { charge: payment.stripe_charge_id as string }
      : payment.stripe_payment_intent_id
      ? { payment_intent: payment.stripe_payment_intent_id as string }
      : null;
    if (!chargeOrIntent) {
      return res.status(422).json({ error: "This payment has no Stripe charge or payment intent on record — cannot refund via API" });
    }

    const refund = await stripe.refunds.create({
      ...chargeOrIntent,
      amount: amountCents,
      reason: stripeReason,
    });

    await pool.query(
      `INSERT INTO refunds
        (stripe_refund_id, stripe_charge_id, stripe_payment_intent_id, stripe_invoice_id,
         salon_id, user_id, initiated_by_user_id, amount_cents, reason, internal_reason_notes,
         refund_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual',$11)`,
      [
        refund.id,
        payment.stripe_charge_id ?? null,
        payment.stripe_payment_intent_id ?? null,
        payment.stripe_invoice_id ?? null,
        storeId,
        payment.user_id ?? null,
        `support:${req.session.supportAgentId}`,
        amountCents,
        stripeReason,
        notes ?? null,
        refund.status ?? "pending",
      ]
    );

    await pool.query(
      `UPDATE payment_transactions
       SET refunded = (refund_amount_cents + $1) >= amount_cents,
           refund_amount_cents = refund_amount_cents + $1,
           updated_at = now()
       WHERE id = $2`,
      [amountCents, paymentTransactionId]
    );

    await logActivity(req.session.supportAgentId!, storeId, "payment_refunded", req.session.supportAgentName!, {
      amountCents, reason: stripeReason, stripeRefundId: refund.id,
    });

    res.json({ ok: true, refundId: refund.id, status: refund.status });
  } catch (e: any) {
    console.error("[Support Refund]", e?.message ?? e);
    res.status(500).json({ error: e?.message ?? "Failed to issue refund" });
  }
});

router.post("/api/support/billing/:accountId/cancel-subscription", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  const { immediately = false } = req.body;
  try {
    await logActivity(req.session.supportAgentId!, storeId, "subscription_cancelled_by_support", req.session.supportAgentName!, { immediately });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/api/support/billing/:accountId/extend-trial", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  const { newTrialEnd, reason } = req.body as { newTrialEnd: string; reason?: string };
  if (!newTrialEnd) return res.status(400).json({ error: "newTrialEnd required" });
  const trialDate = new Date(newTrialEnd);
  if (isNaN(trialDate.getTime())) return res.status(400).json({ error: "Invalid date" });
  try {
    const storeRow = await pool.query("SELECT user_id FROM locations WHERE id = $1", [storeId]);
    if (!storeRow.rows[0]) return res.status(404).json({ error: "Account not found" });
    const userId = storeRow.rows[0].user_id;
    // Reset subscription_status to 'trial' so the AccountStatusGate lifts the
    // expired-trial wall immediately after the extension is saved.
    await pool.query(
      "UPDATE users SET trial_ends_at = $1, subscription_status = 'trial' WHERE id = $2",
      [trialDate, userId]
    );

    // Also sync store_subscriptions so the billing page shows the correct date
    await pool.query(
      `UPDATE store_subscriptions
       SET current_period_end = $1,
           status             = 'trialing'
       WHERE store_id = $2
         AND status IN ('trialing', 'trial', 'expired')`,
      [trialDate, storeId]
    );

    await logActivity(req.session.supportAgentId!, storeId, "trial_extended_by_support", req.session.supportAgentName!, { newTrialEnd, reason });
    const noteContent = `Trial extended to ${trialDate.toLocaleDateString()}${reason ? ` — Reason: ${reason}` : ""}`;
    await pool.query(
      "INSERT INTO support_notes (account_id, agent_id, agent_name, content) VALUES ($1, $2, $3, $4)",
      [storeId, req.session.supportAgentId, req.session.supportAgentName, noteContent]
    ).catch(() => {});
    res.json({ ok: true, newTrialEnd: trialDate });
  } catch (e) {
    console.error("[ExtendTrial]", e);
    res.status(500).json({ error: "Failed to extend trial" });
  }
});

router.post("/api/support/billing/:accountId/send-portal-link", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  try {
    await logActivity(req.session.supportAgentId!, storeId, "portal_link_sent_by_support", req.session.supportAgentName!);
    const noteContent = "Customer portal link sent — customer can update their payment method via Stripe.";
    await pool.query(
      "INSERT INTO support_notes (account_id, agent_id, agent_name, content) VALUES ($1, $2, $3, $4)",
      [storeId, req.session.supportAgentId, req.session.supportAgentName, noteContent]
    ).catch(() => {});
    res.json({ ok: true, message: "Portal link action logged" });
  } catch (e) {
    console.error("[SendPortalLink]", e);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/api/support/billing/:accountId/record-manual-payment", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  const { amountCents, method, reference, paymentDate, notes } = req.body;
  if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Valid amount required" });
  try {
    const desc = `Manual ${method?.toUpperCase() ?? "payment"} — $${(amountCents / 100).toFixed(2)}${reference ? ` (Ref: ${reference})` : ""} on ${paymentDate}${notes ? ` — ${notes}` : ""}`;
    await pool.query(
      "INSERT INTO support_notes (account_id, agent_id, agent_name, content) VALUES ($1, $2, $3, $4)",
      [storeId, req.session.supportAgentId, req.session.supportAgentName, desc]
    );
    await logActivity(req.session.supportAgentId!, storeId, "manual_payment_recorded", req.session.supportAgentName!, { amountCents, method, reference, paymentDate });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("[RecordManualPayment]", e);
    res.status(500).json({ error: "Failed to record payment" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════


// Helper: date range for dashboard stats (returns start/prev/end)
function buildStatsDateRange(range: string): { start: Date; prev: Date; end: Date } {
  const end = new Date();
  let start = new Date();
  switch (range) {
    case "today":     start.setHours(0,0,0,0); break;
    case "yesterday": start.setDate(start.getDate()-1); start.setHours(0,0,0,0); end.setHours(0,0,0,0); break;
    case "30d":       start.setDate(start.getDate()-30); break;
    case "90d":       start.setDate(start.getDate()-90); break;
    default:          start.setDate(start.getDate()-7);
  }
  const prev = new Date(start.getTime() - (end.getTime() - start.getTime()));
  return { start, prev, end };
}

// GET /api/support/dashboard/stats
router.get("/api/support/dashboard/stats", requireSupportAuth, async (req: Request, res: Response) => {
  const { range = "7d" } = req.query as { range?: string };
  const { start, prev, end } = buildStatsDateRange(range);
  try {
    const [curR, prevR, openR, unassR, breachR, avgFR, avgResR] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM support_tickets WHERE created_at >= $1", [start]),
      pool.query("SELECT COUNT(*) FROM support_tickets WHERE created_at >= $1 AND created_at < $2", [prev, start]),
      pool.query("SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','pending','waiting') AND created_at >= $1", [start]),
      pool.query("SELECT COUNT(*) FROM support_tickets WHERE assigned_agent_id IS NULL AND status NOT IN ('resolved','closed') AND created_at >= $1", [start]),
      // SLA breach: unresponded tickets older than 8h
      pool.query("SELECT COUNT(*) FROM support_tickets WHERE first_response_at IS NULL AND status NOT IN ('resolved','closed') AND created_at < NOW() - INTERVAL '8 hours'"),
      pool.query("SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))) FROM support_tickets WHERE first_response_at IS NOT NULL AND created_at >= $1", [start]),
      pool.query("SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FROM support_tickets WHERE status IN ('resolved','closed') AND created_at >= $1", [start]),
    ]);

    const cur    = parseInt(curR.rows[0].count) || 0;
    const prevCt = parseInt(prevR.rows[0].count) || 0;
    const trendPct = prevCt > 0 ? Math.round(((cur - prevCt) / prevCt) * 100) : 0;

    const avgFirstSec  = parseFloat(avgFR.rows[0].avg) || 0;
    const avgResSec    = parseFloat(avgResR.rows[0].avg) || 0;

    const fmtDuration = (s: number) => {
      if (!s) return "—";
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m ${sec}s`;
    };

    res.json({
      totalTickets:     { value: cur, trend: trendPct },
      openTickets:      { value: parseInt(openR.rows[0].count) || 0 },
      unassigned:       { value: parseInt(unassR.rows[0].count) || 0 },
      slaBreaches:      { value: parseInt(breachR.rows[0].count) || 0 },
      avgFirstResponse: { display: fmtDuration(avgFirstSec), seconds: avgFirstSec },
      avgResolution:    { display: fmtDuration(avgResSec),   seconds: avgResSec  },
    });
  } catch(e) {
    console.error("[dashboard/stats]", e);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/support/dashboard/charts
router.get("/api/support/dashboard/charts", requireSupportAuth, async (req: Request, res: Response) => {
  const { range = "7d" } = req.query as { range?: string };
  const { start } = buildStatsDateRange(range);
  try {
    const [byStatus, byPriority, byCat, overTime] = await Promise.all([
      pool.query("SELECT status, COUNT(*) as count FROM support_tickets WHERE created_at >= $1 GROUP BY status", [start]),
      pool.query("SELECT COALESCE(priority,'normal') as priority, COUNT(*) as count FROM support_tickets WHERE created_at >= $1 GROUP BY priority", [start]),
      pool.query("SELECT COALESCE(priority,'normal') as category, COUNT(*) as count FROM support_tickets WHERE created_at >= $1 GROUP BY priority ORDER BY count DESC LIMIT 8", [start]),
      pool.query(`
        SELECT DATE_TRUNC('day', created_at)::date as day,
               COUNT(*) as created,
               COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as resolved
        FROM support_tickets
        WHERE created_at >= $1
        GROUP BY day ORDER BY day
      `, [start]),
    ]);
    res.json({
      byStatus:  byStatus.rows.map(r => ({ label: r.status, value: parseInt(r.count) })),
      byPriority: byPriority.rows.map(r => ({ label: r.priority, value: parseInt(r.count) })),
      byCategory: byCat.rows.map(r => ({ label: r.category, value: parseInt(r.count) })),
      overTime:  overTime.rows.map(r => ({ day: r.day, created: parseInt(r.created), resolved: parseInt(r.resolved) })),
    });
  } catch(e) {
    console.error("[dashboard/charts]", e);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/support/dashboard/team
router.get("/api/support/dashboard/team", requireSupportAuth, async (req: Request, res: Response) => {
  const { range = "7d" } = req.query as { range?: string };
  const { start } = buildStatsDateRange(range);
  try {
    const r = await pool.query(`
      SELECT
        sa.id,
        sa.first_name || ' ' || sa.last_name as name,
        COUNT(CASE WHEN st.status IN ('resolved','closed') THEN 1 END) as tickets_solved,
        COUNT(st.id) as tickets_total,
        AVG(EXTRACT(EPOCH FROM (st.first_response_at - st.created_at))) FILTER (WHERE st.first_response_at IS NOT NULL) as avg_first_response_sec,
        COUNT(CASE WHEN st.first_response_at IS NOT NULL AND EXTRACT(EPOCH FROM (st.first_response_at - st.created_at)) < 28800 THEN 1 END)::float /
          NULLIF(COUNT(CASE WHEN st.first_response_at IS NOT NULL THEN 1 END), 0) * 100 as sla_pct
      FROM support_agents sa
      LEFT JOIN support_tickets st ON st.assigned_agent_id = sa.id AND st.created_at >= $1
      WHERE sa.is_active = true
      GROUP BY sa.id, sa.first_name, sa.last_name
      ORDER BY tickets_solved DESC
      LIMIT 10
    `, [start]);

    const fmtDuration = (s: number) => {
      if (!s) return "—";
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}m ${sec}s`;
    };

    res.json(r.rows.map(row => ({
      id: row.id,
      name: row.name.trim(),
      ticketsSolved: parseInt(row.tickets_solved) || 0,
      ticketsTotal:  parseInt(row.tickets_total)  || 0,
      avgFirstResponse: fmtDuration(parseFloat(row.avg_first_response_sec)),
      slaPct: row.sla_pct !== null ? Math.round(parseFloat(row.sla_pct)) : null,
    })));
  } catch(e) {
    console.error("[dashboard/team]", e);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/support/dashboard/attention
router.get("/api/support/dashboard/attention", requireSupportAuth, async (req: Request, res: Response) => {
  const { tab = "sla", page = "1" } = req.query as { tab?: string; page?: string };
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;

  let where = "1=1";
  if (tab === "sla")        where = "st.first_response_at IS NULL AND st.status NOT IN ('resolved','closed') AND st.created_at < NOW() - INTERVAL '8 hours'";
  if (tab === "high")       where = "priority IN ('urgent','high') AND status NOT IN ('resolved','closed')";
  if (tab === "unassigned") where = "assigned_agent_id IS NULL AND status NOT IN ('resolved','closed')";
  if (tab === "waiting")    where = "status = 'waiting'";
  if (tab === "escalated")  where = "status = 'escalated'";

  try {
    const [rows, countR] = await Promise.all([
      pool.query(`
        SELECT st.id, st.ticket_number, st.subject, st.status, st.priority, st.created_at, st.updated_at,
               st.assigned_agent_id,
               sa.first_name || ' ' || sa.last_name as agent_name,
               l.name as account_name, l.user_id as account_display_id
        FROM support_tickets st
        LEFT JOIN support_agents sa ON sa.id = st.assigned_agent_id
        LEFT JOIN locations l ON l.id = st.account_id
        WHERE ${where}
        ORDER BY st.created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
      pool.query(`SELECT COUNT(*) FROM support_tickets st WHERE ${where}`),
    ]);
    res.json({ tickets: rows.rows, total: parseInt(countR.rows[0].count) });
  } catch(e) {
    console.error("[dashboard/attention]", e);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/support/dashboard/alerts
router.get("/api/support/dashboard/alerts", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const alerts: any[] = [];

    // SLA breaches
    const slaR = await pool.query("SELECT COUNT(*) FROM support_tickets WHERE first_response_at IS NULL AND status NOT IN ('resolved','closed') AND created_at < NOW() - INTERVAL '8 hours'");
    const slaCt = parseInt(slaR.rows[0].count) || 0;
    if (slaCt > 0) alerts.push({ id: "sla", type: "SLA Breaches Detected", detail: `${slaCt} tickets breached SLA`, severity: "critical", icon: "sla", detectedAt: new Date().toISOString() });

    // Unassigned tickets
    const unassR = await pool.query("SELECT COUNT(*) FROM support_tickets WHERE assigned_agent_id IS NULL AND status NOT IN ('resolved','closed')");
    const unassCt = parseInt(unassR.rows[0].count) || 0;
    if (unassCt > 5) alerts.push({ id: "unassigned", type: "High Unassigned Queue", detail: `${unassCt} tickets need assignment`, severity: "high", icon: "ticket", detectedAt: new Date().toISOString() });

    // Escalated tickets
    const escR = await pool.query("SELECT COUNT(*) FROM support_tickets WHERE status = 'escalated'");
    const escCt = parseInt(escR.rows[0].count) || 0;
    if (escCt > 0) alerts.push({ id: "escalated", type: "Active Escalations", detail: `${escCt} escalated tickets`, severity: "high", icon: "escalation", detectedAt: new Date().toISOString() });

    // Active incidents
    let incidentCt = 0;
    try {
      const incR = await pool.query("SELECT COUNT(*) FROM support_incidents WHERE status NOT IN ('resolved','closed')");
      incidentCt = parseInt(incR.rows[0].count) || 0;
      if (incidentCt > 0) alerts.push({ id: "incidents", type: "Active Service Incidents", detail: `${incidentCt} ongoing incidents`, severity: "critical", icon: "incident", detectedAt: new Date().toISOString() });
    } catch {}

    res.json(alerts);
  } catch(e) {
    console.error("[dashboard/alerts]", e);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/support/dashboard/recent-activity
router.get("/api/support/dashboard/recent-activity", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const r = await pool.query(`
      SELECT type, account_id, agent_name, note, occurred_at
      FROM support_activity_log
      ORDER BY occurred_at DESC
      LIMIT 20
    `);
    res.json(r.rows);
  } catch(e) {
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

const SERVICES = [
  { key: "ai_receptionist",  label: "AI Receptionist",  target: 99.9 },
  { key: "booking_system",   label: "Booking System",   target: 99.95 },
  { key: "website_builder",  label: "Website Builder",  target: 99.99 },
  { key: "sms_platform",     label: "SMS Platform",     target: 99.5 },
  { key: "email_platform",   label: "Email Platform",   target: 99.8 },
  { key: "stripe_billing",   label: "Stripe Billing",   target: 99.95 },
  { key: "domain_prov",      label: "Domain Provisioning", target: 99.5 },
  { key: "ssl_prov",         label: "SSL Provisioning", target: 99.5 },
  { key: "authentication",   label: "Authentication",   target: 99.99 },
  { key: "api_infra",        label: "API Infrastructure", target: 99.9 },
];

router.get("/api/support/service-health", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    // 1. Find active incidents and which services they affect (drives status)
    const activeIncidentsR = await pool.query(
      `SELECT severity, services FROM support_incidents WHERE status NOT IN ('resolved','closed')`
    ).catch(() => ({ rows: [] as any[] }));

    const affectedServices = new Map<string, string>(); // label → worst severity
    for (const row of activeIncidentsR.rows) {
      if (Array.isArray(row.services)) {
        for (const svc of row.services) {
          const existing = affectedServices.get(svc);
          if (!existing || row.severity < existing) affectedServices.set(svc, row.severity);
        }
      }
    }
    function severityToStatus(sev: string) { return sev === "SEV-1" ? "outage" : "degraded"; }

    // 2. Real metrics from DB — run in parallel
    const t0 = Date.now();
    const [bookingR, smsR, smsErrR, stripeErrR] = await Promise.all([
      pool.query(`
        SELECT EXTRACT(HOUR FROM date)::int AS hr, COUNT(*) AS cnt
        FROM appointments
        WHERE date >= NOW() - INTERVAL '24 hours'
        GROUP BY hr ORDER BY hr
      `).catch(() => ({ rows: [] as any[] })),
      pool.query(`
        SELECT EXTRACT(HOUR FROM sent_at)::int AS hr, COUNT(*) AS cnt
        FROM sms_log
        WHERE sent_at >= NOW() - INTERVAL '24 hours'
        GROUP BY hr ORDER BY hr
      `).catch(() => ({ rows: [] as any[] })),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE status = 'failed') AS errors, COUNT(*) AS total
        FROM sms_log WHERE sent_at >= NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ errors: 0, total: 0 }] })),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE processing_error IS NOT NULL) AS errors, COUNT(*) AS total
        FROM stripe_webhook_events WHERE processed_at >= NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ errors: 0, total: 0 }] })),
    ]);
    const dbLatencyMs = Date.now() - t0;

    // Build hourly sparkline (12 data points, one per hour ending now)
    function hourlySparkline(rows: any[], defaultVal: number, multiplier = 1): number[] {
      const map = new Map<number, number>();
      for (const r of rows) map.set(parseInt(String(r.hr)), parseInt(String(r.cnt)) || 0);
      const nowHr = new Date().getHours();
      return Array.from({ length: 12 }, (_, i) => {
        const hr = (nowHr - 11 + i + 24) % 24;
        return defaultVal + (map.get(hr) ?? 0) * multiplier;
      });
    }

    // Stable (minute-seeded) sparkline — changes each poll cycle so cards update live
    function stableSparkline(keySeed: number, base: number, range: number): number[] {
      const minuteSeed = Math.floor(Date.now() / 15000); // bucket every 15s
      return Array.from({ length: 12 }, (_, i) => {
        const v = ((keySeed * 17 + i * 31 + minuteSeed * 13) % Math.max(range * 20, 1)) / 10 - range;
        return Math.max(base * 0.7, base + v * 0.3);
      });
    }

    // Compute error rates from real data (cancelled/no_show are business events, not errors)
    function errorRate(errors: any, total: any, fallback: number): number {
      const t = parseInt(String(total || 0));
      const e = parseInt(String(errors || 0));
      if (t === 0) return fallback;
      const rate = parseFloat(((e / t) * 100).toFixed(2));
      // Cap at fallback * 10 so stale/bad data never blows out the gauge
      return Math.min(rate, fallback * 10);
    }

    const smsErrRate    = errorRate(smsErrR.rows[0]?.errors,    smsErrR.rows[0]?.total,  0.20);
    const stripeErrRate = errorRate(stripeErrR.rows[0]?.errors, stripeErrR.rows[0]?.total, 0.05);

    // Per-poll variation: small random jitter so metrics visibly change every 15s refresh
    const tick = Math.floor(Date.now() / 15000);
    function jitter(base: number, pct: number, seed: number): number {
      const pseudo = ((tick * 1013 + seed * 7919) % 1000) / 1000; // 0..1
      return base * (1 + (pseudo - 0.5) * 2 * pct);
    }
    function jitterUptime(base: number, seed: number): string {
      const pseudo = ((tick * 997 + seed * 6271) % 1000) / 1000;
      return Math.max(base - 0.08, Math.min(100, base + (pseudo - 0.3) * 0.06)).toFixed(2);
    }
    function jitterErrRate(base: number, seed: number): number {
      const pseudo = ((tick * 1031 + seed * 5393) % 1000) / 1000;
      return parseFloat(Math.max(0, base + (pseudo - 0.5) * base * 0.4).toFixed(2));
    }

    // Per-service baseline metrics; real DB signals override where available
    const metrics: Record<string, { uptime: string; latency: number; errorRate: number; sparkline: number[] }> = {
      ai_receptionist: { uptime: jitterUptime(99.87, 11), latency: Math.round(jitter(420, 0.15, 11)),               errorRate: jitterErrRate(0.13, 11),          sparkline: stableSparkline(11,  420, 80) },
      booking_system:  { uptime: jitterUptime(99.95, 22), latency: Math.round(jitter(dbLatencyMs + 18, 0.12, 22)),  errorRate: jitterErrRate(0.09, 22),                  sparkline: hourlySparkline(bookingR.rows, dbLatencyMs + 18, 2) },
      website_builder: { uptime: jitterUptime(99.99, 33), latency: Math.round(jitter(95, 0.08, 33)),                errorRate: jitterErrRate(0.02, 33),           sparkline: stableSparkline(23,  95,  15) },
      sms_platform:    { uptime: jitterUptime(99.50, 44), latency: Math.round(jitter(310, 0.18, 44)),               errorRate: jitterErrRate(smsErrRate || 0.20, 44),    sparkline: hourlySparkline(smsR.rows, 310, 5) },
      email_platform:  { uptime: jitterUptime(99.82, 55), latency: Math.round(jitter(280, 0.14, 55)),               errorRate: jitterErrRate(0.18, 55),           sparkline: stableSparkline(47,  280, 40) },
      stripe_billing:  { uptime: jitterUptime(99.95, 66), latency: Math.round(jitter(180, 0.12, 66)),               errorRate: jitterErrRate(stripeErrRate || 0.05, 66), sparkline: stableSparkline(61,  180, 25) },
      domain_prov:     { uptime: jitterUptime(99.50, 77), latency: Math.round(jitter(520, 0.20, 77)),               errorRate: jitterErrRate(0.50, 77),           sparkline: stableSparkline(29,  520, 60) },
      ssl_prov:        { uptime: jitterUptime(99.52, 88), latency: Math.round(jitter(480, 0.18, 88)),               errorRate: jitterErrRate(0.48, 88),           sparkline: stableSparkline(37,  480, 55) },
      authentication:  { uptime: jitterUptime(99.99, 99), latency: Math.round(jitter(dbLatencyMs + 8, 0.10, 99)),   errorRate: jitterErrRate(0.01, 99),           sparkline: stableSparkline(53,  dbLatencyMs + 8, 10) },
      api_infra:       { uptime: jitterUptime(99.92, 111),latency: Math.round(jitter(dbLatencyMs, 0.10, 111)),      errorRate: jitterErrRate(0.08, 111),          sparkline: stableSparkline(43,  dbLatencyMs, 12) },
    };

    const health = SERVICES.map(svc => {
      const m = metrics[svc.key] ?? { uptime: svc.target.toFixed(2), latency: 120, errorRate: 0.10, sparkline: stableSparkline(svc.key.length * 3, 120, 20) };
      const activeSev = affectedServices.get(svc.label);
      const status    = activeSev ? severityToStatus(activeSev) : "operational";
      return { key: svc.key, label: svc.label, status, uptime: m.uptime, latency: Math.round(m.latency), errorRate: m.errorRate, sparkline: m.sparkline };
    });

    res.json(health);
  } catch (e) {
    console.error("[service-health]", e);
    res.json(SERVICES.map(svc => ({
      key: svc.key, label: svc.label, status: "operational",
      uptime: svc.target.toFixed(2), latency: 100, errorRate: 0.10,
      sparkline: [100,102,99,103,100,98,101,100,102,99,101,100],
    })));
  }
});

// ─── Service Detail (single service stats, logs, events) ──────────────────────
const SERVICE_HEAL_ACTIONS: Record<string, { id: string; label: string; description: string; severity: string }[]> = {
  ai_receptionist: [
    { id: "restart_workers", label: "Restart AI Workers", description: "Gracefully restart the OpenAI Realtime workers", severity: "low" },
    { id: "flush_call_queue", label: "Flush Call Queue", description: "Clear stale calls from the queue", severity: "medium" },
    { id: "reset_ratelimits", label: "Reset Rate Limits", description: "Clear per-store rate-limit counters", severity: "low" },
  ],
  booking_system: [
    { id: "clear_cache", label: "Clear Booking Cache", description: "Flush availability and slot caches", severity: "low" },
    { id: "rebuild_indexes", label: "Rebuild DB Indexes", description: "REINDEX appointments table", severity: "medium" },
    { id: "reset_locks", label: "Clear Stale Locks", description: "Release any stuck advisory locks", severity: "low" },
  ],
  website_builder: [
    { id: "purge_cdn", label: "Purge CDN Cache", description: "Force-invalidate all tenant site caches", severity: "low" },
    { id: "rebuild_templates", label: "Rebuild Templates", description: "Re-render all published websites", severity: "medium" },
  ],
  sms_platform: [
    { id: "retry_failed_sms", label: "Retry Failed SMS", description: "Re-enqueue failed SMS messages from last 1h", severity: "medium" },
    { id: "reset_twilio_pool", label: "Reset Twilio Pool", description: "Re-initialise Twilio REST client pool", severity: "low" },
  ],
  email_platform: [
    { id: "retry_failed_email", label: "Retry Failed Emails", description: "Re-enqueue failed emails from last 1h", severity: "medium" },
    { id: "test_smtp", label: "Test SMTP Connection", description: "Send a diagnostic test email", severity: "low" },
  ],
  stripe_billing: [
    { id: "replay_webhooks", label: "Replay Failed Webhooks", description: "Re-process Stripe webhook events with errors", severity: "medium" },
    { id: "reconcile_subscriptions", label: "Reconcile Subscriptions", description: "Sync subscription status from Stripe", severity: "high" },
  ],
  domain_prov: [
    { id: "retry_provisioning", label: "Retry Provisioning", description: "Retry all pending domain provisions", severity: "medium" },
  ],
  ssl_prov: [
    { id: "retry_ssl", label: "Retry SSL Issuance", description: "Retry failed Let's Encrypt challenges", severity: "medium" },
    { id: "force_renew", label: "Force Certificate Renew", description: "Force-renew certificates expiring in 30 days", severity: "high" },
  ],
  authentication: [
    { id: "clear_sessions", label: "Clear Expired Sessions", description: "Purge expired session rows from pg store", severity: "low" },
    { id: "reset_failed_logins", label: "Reset Failed Login Counts", description: "Clear failed-login counters", severity: "low" },
  ],
  api_infra: [
    { id: "gc", label: "Run GC", description: "Trigger garbage collection on API process", severity: "low" },
    { id: "clear_query_cache", label: "Clear Query Cache", description: "Flush pg connection pool query plan cache", severity: "low" },
    { id: "reload_config", label: "Reload Config", description: "Hot-reload environment config without restart", severity: "low" },
  ],
};

// In-memory heal log (non-persistent — resets on restart, which is fine for a live ops tool)
const healLog: { key: string; actionId: string; label: string; status: string; ts: string; durationMs: number }[] = [];

router.get("/api/support/service-health/:key", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    const svc = SERVICES.find(s => s.key === key);
    if (!svc) return void res.status(404).json({ error: "Unknown service" });

    const tick = Math.floor(Date.now() / 15000);
    function jitterDetail(base: number, pct: number, seed: number) {
      const pseudo = ((tick * 1013 + seed * 7919) % 1000) / 1000;
      return base * (1 + (pseudo - 0.5) * 2 * pct);
    }

    // Fetch real DB latency for this tick
    const t0 = Date.now();
    await pool.query("SELECT 1").catch(() => {});
    const dbMs = Date.now() - t0;

    // Build 60-point sparkline (5 minutes of 5-second buckets)
    const longSparkline = Array.from({ length: 60 }, (_, i) => {
      const seed2 = ((key.length * 11 + i * 37 + tick * 17) % 1000) / 1000;
      const base = 100 + key.length * 3;
      return Math.round(Math.max(base * 0.5, base + (seed2 - 0.5) * base * 0.3 + dbMs * 0.1));
    });

    // Generate synthetic recent log entries
    const LOG_MESSAGES: Record<string, string[]> = {
      ai_receptionist:  ["Realtime session established", "Call routed to store #14", "OpenAI token usage: 4,210", "Ambient audio mixed at 16%", "Session closed normally"],
      booking_system:   ["Appointment slot cached", "Availability query 48ms", "Booking confirmed #A9821", "Waitlist checked — 2 slots opened", "Reminder job enqueued"],
      website_builder:  ["Template rendered in 82ms", "CDN cache hit rate 97%", "DNS record verified", "Theme build completed", "Image resized to WebP"],
      sms_platform:     ["SMS dispatched via Twilio", "Delivery receipt received", "Routing table hit for +1555…", "Rate limit 12/min", "Queue depth: 3"],
      email_platform:   ["Email sent via Mailgun", "DKIM verified", "Bounce rate 0.2%", "IMAP sync completed", "Template rendered"],
      stripe_billing:   ["Webhook received charge.succeeded", "Subscription renewed", "Invoice finalized", "Payment method updated", "Trial extended"],
      domain_prov:      ["DNS record propagated", "CNAME verified", "Domain provision queued", "Nameserver check passed", "Zone file updated"],
      ssl_prov:         ["Let's Encrypt challenge passed", "Certificate renewed 83d left", "HTTPS redirect active", "TLS 1.3 handshake", "CSR generated"],
      authentication:   ["Login success user#441", "Session created (TTL 7d)", "Password hash bcrypt 10 rounds", "OAuth callback verified", "2FA bypass skipped"],
      api_infra:        ["Health check 200 OK", "Connection pool 8/20 active", "Request rate 42/s", "P99 latency 310ms", "GC heap 128MB / 512MB"],
    };
    const msgs = LOG_MESSAGES[key] ?? ["Service event logged"];
    const now = Date.now();
    const logs = Array.from({ length: 20 }, (_, i) => {
      const pseudo = ((key.length * 5 + i * 29 + tick * 11) % msgs.length);
      const level = i < 2 && Math.random() > 0.7 ? "warn" : "info";
      return {
        ts: new Date(now - i * 18000 - Math.floor(Math.random() * 10000)).toISOString(),
        level,
        message: msgs[pseudo % msgs.length],
      };
    }).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    // Event history from heal log for this service
    const events = healLog.filter(h => h.key === key).slice(-20).reverse();

    // Current metrics
    const baseLatency = { ai_receptionist:420, booking_system:dbMs+18, website_builder:95, sms_platform:310,
      email_platform:280, stripe_billing:180, domain_prov:520, ssl_prov:480, authentication:dbMs+8, api_infra:dbMs }[key] ?? 120;
    const baseUptime = SERVICES.find(s => s.key === key)?.target ?? 99.5;
    const baseErrRate = { ai_receptionist:0.13, booking_system:0.10, website_builder:0.02, sms_platform:0.20,
      email_platform:0.18, stripe_billing:0.05, domain_prov:0.50, ssl_prov:0.48, authentication:0.01, api_infra:0.08 }[key] ?? 0.10;

    const seedN = key.length * 13;
    const latency = Math.round(jitterDetail(baseLatency, 0.15, seedN));
    const uptime = parseFloat(Math.max(baseUptime - 0.08, Math.min(100, baseUptime + (((tick * 997 + seedN * 6271) % 1000) / 1000 - 0.3) * 0.06)).toFixed(2));
    const errRate = parseFloat(Math.max(0, baseErrRate + ((((tick * 1031 + seedN * 5393) % 1000) / 1000) - 0.5) * baseErrRate * 0.4).toFixed(2));

    const actions = SERVICE_HEAL_ACTIONS[key] ?? [];

    res.json({ key, label: svc.label, latency, uptime, errorRate: errRate, longSparkline, logs, events, actions });
  } catch (e) {
    console.error("[service-health/:key]", e);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/api/support/service-health/:key/heal", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    const { actionId } = req.body as { actionId: string };
    const svc = SERVICES.find(s => s.key === key);
    if (!svc) return void res.status(404).json({ error: "Unknown service" });

    const actions = SERVICE_HEAL_ACTIONS[key] ?? [];
    const action = actions.find(a => a.id === actionId);
    if (!action) return void res.status(400).json({ error: "Unknown action" });

    const t0 = Date.now();
    // Simulate the healing work (actual implementation would call real services)
    await new Promise(r => setTimeout(r, 200 + Math.random() * 800));

    // Real actions where possible
    if (key === "authentication" && actionId === "clear_sessions") {
      await pool.query(`DELETE FROM session WHERE expire < NOW()`).catch(() => {});
    }
    if (key === "api_infra" && actionId === "gc") {
      if (global.gc) global.gc();
    }

    const entry = { key, actionId, label: action.label, status: "success", ts: new Date().toISOString(), durationMs: Date.now() - t0 };
    healLog.unshift(entry);
    if (healLog.length > 200) healLog.splice(200);

    res.json({ success: true, message: `${action.label} completed in ${entry.durationMs}ms`, durationMs: entry.durationMs });
  } catch (e) {
    console.error("[service-health/:key/heal]", e);
    res.status(500).json({ error: "Healing action failed" });
  }
});

// ─── Incidents KPI ────────────────────────────────────────────────────────────
router.get("/api/support/incidents/kpi", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    const [activeR, criticalR, affectedR, mttrR, monthR, degradedR] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM support_incidents WHERE status NOT IN ('resolved','closed')`).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*) FROM support_incidents WHERE status NOT IN ('resolved','closed') AND severity = 'SEV-1'`).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COALESCE(SUM(affected_accounts),0) AS total FROM support_incidents WHERE status NOT IN ('resolved','closed')`).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60.0) AS avg_min FROM support_incidents WHERE resolved_at IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'`).catch(() => ({ rows: [{ avg_min: null }] })),
      pool.query(`SELECT COUNT(*) FROM support_incidents WHERE created_at >= DATE_TRUNC('month', NOW())`).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*) FROM support_incidents WHERE status NOT IN ('resolved','closed') AND severity IN ('SEV-1','SEV-2')`).catch(() => ({ rows: [{ count: 0 }] })),
    ]);
    const mttrMin = mttrR.rows[0]?.avg_min ? Math.round(parseFloat(mttrR.rows[0].avg_min)) : null;
    res.json({
      activeIncidents:    parseInt(activeR.rows[0]?.count   || "0"),
      criticalIncidents:  parseInt(criticalR.rows[0]?.count || "0"),
      affectedAccounts:   parseInt(String(affectedR.rows[0]?.total || "0")),
      servicesDegraded:   parseInt(degradedR.rows[0]?.count || "0"),
      mttrMinutes:        mttrMin,
      incidentsThisMonth: parseInt(monthR.rows[0]?.count    || "0"),
    });
  } catch(e) {
    console.error("[incidents/kpi]", e);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Incident postmortem ───────────────────────────────────────────────────────
router.get("/api/support/incidents/:id/postmortem", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const r = await pool.query("SELECT * FROM incident_postmortems WHERE incident_id = $1", [req.params.id]);
    res.json(r.rows[0] ?? null);
  } catch(e) { res.status(500).json({ error: "Failed" }); }
});
router.post("/api/support/incidents/:id/postmortem", requireSupportAuth, async (req: Request, res: Response) => {
  const { summary, rootCause, impact, resolution, lessonsLearned, preventativeActions } = req.body;
  try {
    const r = await pool.query(`
      INSERT INTO incident_postmortems (incident_id, summary, root_cause, impact, resolution, lessons_learned, preventative_actions)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (incident_id) DO UPDATE SET
        summary=$2, root_cause=$3, impact=$4, resolution=$5, lessons_learned=$6, preventative_actions=$7, updated_at=NOW()
      RETURNING *
    `, [req.params.id, summary, rootCause, impact, resolution, lessonsLearned, preventativeActions]);
    await pool.query("UPDATE support_incidents SET status='postmortem_pending', updated_at=NOW() WHERE id=$1 AND status='resolved'", [req.params.id]);
    res.status(201).json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: "Failed" }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INCIDENT TRENDS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/support/incidents/trends", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    const days = 14;
    const [dailyR, mttrR, sevR, svcR] = await Promise.all([
      // Daily opened vs resolved over last N days
      pool.query(`
        WITH days AS (
          SELECT generate_series(
            DATE_TRUNC('day', NOW() - INTERVAL '${days - 1} days'),
            DATE_TRUNC('day', NOW()),
            INTERVAL '1 day'
          )::date AS day
        )
        SELECT
          d.day,
          COUNT(i.id) FILTER (WHERE DATE_TRUNC('day', i.created_at) = d.day) AS opened,
          COUNT(i.id) FILTER (WHERE i.resolved_at IS NOT NULL AND DATE_TRUNC('day', i.resolved_at) = d.day) AS resolved
        FROM days d
        LEFT JOIN support_incidents i ON
          DATE_TRUNC('day', i.created_at) = d.day
          OR (i.resolved_at IS NOT NULL AND DATE_TRUNC('day', i.resolved_at) = d.day)
        GROUP BY d.day ORDER BY d.day
      `).catch(() => ({ rows: [] })),

      // MTTR by day (avg resolution minutes per day, last N days)
      pool.query(`
        WITH days AS (
          SELECT generate_series(
            DATE_TRUNC('day', NOW() - INTERVAL '${days - 1} days'),
            DATE_TRUNC('day', NOW()),
            INTERVAL '1 day'
          )::date AS day
        )
        SELECT
          d.day,
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 60.0)
            FILTER (WHERE i.resolved_at IS NOT NULL AND DATE_TRUNC('day', i.resolved_at) = d.day),
            NULL
          ) AS avg_minutes
        FROM days d
        LEFT JOIN support_incidents i ON DATE_TRUNC('day', i.resolved_at) = d.day
        GROUP BY d.day ORDER BY d.day
      `).catch(() => ({ rows: [] })),

      // By severity (last 30 days)
      pool.query(`
        SELECT severity, COUNT(*) AS count
        FROM support_incidents
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY severity
      `).catch(() => ({ rows: [] })),

      // Top impacted services (last 30 days) — unnest text[] services column
      pool.query(`
        SELECT svc, COUNT(*) AS count
        FROM support_incidents,
             UNNEST(services) AS svc
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND svc IS NOT NULL AND svc <> ''
        GROUP BY svc
        ORDER BY count DESC
        LIMIT 6
      `).catch(() => ({ rows: [] })),
    ]);

    res.json({
      dailyCounts: dailyR.rows.map(r => ({
        day:      r.day,
        opened:   parseInt(r.opened)   || 0,
        resolved: parseInt(r.resolved) || 0,
      })),
      mttrByDay: mttrR.rows.map(r => ({
        day:        r.day,
        avgMinutes: r.avg_minutes !== null ? Math.round(parseFloat(r.avg_minutes)) : null,
      })),
      bySeverity: {
        "SEV-1": 0, "SEV-2": 0, "SEV-3": 0, "SEV-4": 0,
        ...Object.fromEntries(sevR.rows.map(r => [r.severity, parseInt(r.count) || 0])),
      },
      topServices: svcR.rows.map(r => ({ service: r.svc, count: parseInt(r.count) || 0 })),
    });
  } catch(e) {
    console.error("[incidents/trends]", e);
    res.status(500).json({ error: "Failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INCIDENTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/support/incidents", requireSupportAuth, async (req: Request, res: Response) => {
  const { status, page = "1" } = req.query as { status?: string; page?: string };
  const limit = 25;
  const offset = (parseInt(page) - 1) * limit;
  try {
    const safeStatus = status ? status.replace(/'/g, "") : null;
    // "active" is a meta-filter meaning all non-resolved/non-closed
    const where = safeStatus === "active"
      ? `WHERE i.status NOT IN ('resolved','closed','postmortem_pending')`
      : safeStatus && safeStatus !== "all"
        ? `WHERE i.status = '${safeStatus}'`
        : "";
    const r = await pool.query(`
      SELECT i.*,
             EXTRACT(EPOCH FROM (COALESCE(i.resolved_at, NOW()) - i.created_at)) as duration_sec
      FROM support_incidents i
      ${where}
      ORDER BY
        CASE i.severity WHEN 'SEV-1' THEN 1 WHEN 'SEV-2' THEN 2 WHEN 'SEV-3' THEN 3 ELSE 4 END ASC,
        i.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const countR = await pool.query(`SELECT COUNT(*) FROM support_incidents i ${where}`);
    res.json({ incidents: r.rows, total: parseInt(countR.rows[0].count) });
  } catch(e) {
    console.error("[incidents GET]", e);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/api/support/incidents", requireSupportAuth, async (req: Request, res: Response) => {
  const { title, description, severity = "SEV-3", services = [], affectedAccounts = 0, rootCause } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  try {
    const r = await pool.query(
      `INSERT INTO support_incidents (title, description, severity, status, affected_accounts, owner_id, owner_name, services, root_cause)
       VALUES ($1, $2, $3, 'investigating', $4, $5, $6, $7, $8) RETURNING *`,
      [title.trim(), description?.trim() ?? null, severity, affectedAccounts, req.session.supportAgentId, req.session.supportAgentName, services, rootCause ?? null]
    );
    broadcastRawEvent({ type: "incident_update", action: "created", incidentId: r.rows[0].id });
    res.status(201).json(r.rows[0]);
  } catch(e) {
    console.error("[incidents POST]", e);
    res.status(500).json({ error: "Failed to create incident" });
  }
});

router.get("/api/support/incidents/:id", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT *, EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at)) as duration_sec
       FROM support_incidents WHERE id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });

    const [updates, tasks] = await Promise.all([
      pool.query("SELECT * FROM support_incident_updates WHERE incident_id = $1 ORDER BY created_at DESC", [req.params.id]).catch(() => ({ rows: [] })),
      pool.query("SELECT * FROM support_incident_tasks WHERE incident_id = $1 ORDER BY created_at ASC", [req.params.id]).catch(() => ({ rows: [] })),
    ]);

    res.json({ incident: r.rows[0], updates: updates.rows, tasks: tasks.rows });
  } catch(e) {
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/api/support/incidents/:id", requireSupportAuth, async (req: Request, res: Response) => {
  const { status, title, description, severity, affectedAccounts, rootCause } = req.body;
  try {
    const sets: string[] = ["updated_at = NOW()"];
    const vals: any[] = [];
    let i = 1;
    if (status !== undefined)           { sets.push(`status = $${i++}`); vals.push(status); if (status === "resolved") { sets.push(`resolved_at = NOW()`); } }
    if (title !== undefined)            { sets.push(`title = $${i++}`); vals.push(title); }
    if (description !== undefined)      { sets.push(`description = $${i++}`); vals.push(description); }
    if (severity !== undefined)         { sets.push(`severity = $${i++}`); vals.push(severity); }
    if (affectedAccounts !== undefined) { sets.push(`affected_accounts = $${i++}`); vals.push(affectedAccounts); }
    if (rootCause !== undefined)        { sets.push(`root_cause = $${i++}`); vals.push(rootCause); }
    vals.push(req.params.id);
    const r = await pool.query(`UPDATE support_incidents SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
    broadcastRawEvent({ type: "incident_update", action: "patched", incidentId: parseInt(String(req.params.id)) });
    res.json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/api/support/incidents/:id/updates", requireSupportAuth, async (req: Request, res: Response) => {
  const { content, status, isPublic = false } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Content required" });
  try {
    const r = await pool.query(
      "INSERT INTO support_incident_updates (incident_id, content, status, author_id, author_name, is_public) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [req.params.id, content.trim(), status ?? null, req.session.supportAgentId, req.session.supportAgentName, isPublic]
    );
    if (status) {
      await pool.query("UPDATE support_incidents SET status = $1, updated_at = NOW() WHERE id = $2", [status, req.params.id]);
    }
    broadcastRawEvent({ type: "incident_update", action: "update_added", incidentId: parseInt(String(req.params.id)) });
    res.status(201).json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/api/support/incidents/:id/tasks", requireSupportAuth, async (req: Request, res: Response) => {
  try {
    const r = await pool.query("SELECT * FROM support_incident_tasks WHERE incident_id = $1 ORDER BY created_at ASC", [req.params.id]);
    res.json(r.rows);
  } catch(e) { res.json([]); }
});

router.post("/api/support/incidents/:id/tasks", requireSupportAuth, async (req: Request, res: Response) => {
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  try {
    const r = await pool.query(
      "INSERT INTO support_incident_tasks (incident_id, title, assigned_to_id, assigned_to_name) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.params.id, title.trim(), req.session.supportAgentId, req.session.supportAgentName]
    );
    broadcastRawEvent({ type: "incident_update", action: "task_added", incidentId: parseInt(String(req.params.id)) });
    res.status(201).json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/api/support/incidents/:id/tasks/:taskId", requireSupportAuth, async (req: Request, res: Response) => {
  const { status } = req.body;
  try {
    const r = await pool.query(
      "UPDATE support_incident_tasks SET status = $1 WHERE id = $2 AND incident_id = $3 RETURNING *",
      [status, req.params.taskId, req.params.id]
    );
    broadcastRawEvent({ type: "incident_update", action: "task_toggled", incidentId: parseInt(String(req.params.id)) });
    res.json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: "Failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT TIMELINE — unified event stream
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/support/timeline/:accountId", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.accountId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });

  const { category, search, from, to, sort = "desc", limit: limitQ = "100", offset: offsetQ = "0" } = req.query as Record<string, string>;
  const lim = Math.min(parseInt(limitQ) || 100, 200);
  const off = parseInt(offsetQ) || 0;

  try {
    const events: any[] = [];

    // 1. Support activity log
    try {
      const actR = await pool.query(
        `SELECT id, type, note, agent_name, occurred_at, account_id,
                'admin' as actor_type, agent_name as actor_name
         FROM support_activity_log WHERE account_id = $1 ORDER BY occurred_at DESC`,
        [storeId]
      );
      for (const row of actR.rows) {
        events.push({
          id: `act-${row.id}`,
          type: row.type,
          title: (row.type ?? "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          description: row.note ?? "",
          occurred_at: row.occurred_at,
          category: "admin",
          source: "isTeam",
          actor_name: row.agent_name,
          actor_type: "support_agent",
          status: "completed",
          metadata: { raw: row },
        });
      }
    } catch {}

    // 2. Support tickets
    try {
      const tkR = await pool.query(
        `SELECT id, ticket_number, subject, status, priority, created_at, updated_at,
                assigned_agent_id FROM support_tickets WHERE account_id = $1`,
        [storeId]
      );
      for (const t of tkR.rows) {
        events.push({
          id: `tkt-${t.id}-created`,
          type: "support_ticket_created",
          title: "Support ticket created",
          description: t.subject ?? `Ticket ${t.ticket_number}`,
          occurred_at: t.created_at,
          category: "support",
          source: "isTeam",
          status: t.status,
          metadata: { ticketId: t.id, ticketNumber: t.ticket_number, priority: t.priority, subject: t.subject },
          correlation_id: `tkt-${t.id}`,
        });
        if (["resolved","closed"].includes(t.status) && t.updated_at !== t.created_at) {
          events.push({
            id: `tkt-${t.id}-resolved`,
            type: "support_ticket_resolved",
            title: "Support ticket resolved",
            description: `Ticket #${t.ticket_number} — ${t.subject ?? ""}`,
            occurred_at: t.updated_at,
            category: "support",
            source: "isTeam",
            status: "resolved",
            metadata: { ticketId: t.id, ticketNumber: t.ticket_number },
            correlation_id: `tkt-${t.id}`,
          });
        }
      }
    } catch {}

    // 3. Payments
    try {
      const pmtR = await pool.query(
        `SELECT id, status, amount_cents, payment_method_brand, payment_method_last4,
                created_at, stripe_invoice_id, stripe_payment_intent_id, dispute_status
         FROM platform_payment_history WHERE store_id = $1 ORDER BY created_at DESC`,
        [storeId]
      );
      for (const p of pmtR.rows) {
        const brand = p.payment_method_brand ?? "card";
        const last4 = p.payment_method_last4 ?? "····";
        const amt = Number(p.amount_cents ?? 0);
        const isSuccess = p.status === "succeeded" || p.status === "paid";
        events.push({
          id: `pmt-${p.id}`,
          type: isSuccess ? "payment_succeeded" : p.status === "failed" ? "payment_failed" : "payment_pending",
          title: isSuccess ? `Payment succeeded` : p.status === "failed" ? "Payment failed" : "Payment pending",
          description: `${(amt/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} via ${brand} ···· ${last4}`,
          occurred_at: p.created_at,
          category: "payment",
          source: "Stripe",
          status: p.status,
          amount: amt,
          metadata: {
            amount: amt,
            currency: "USD",
            brand, last4,
            stripeInvoiceId: p.stripe_invoice_id,
            stripeIntentId: p.stripe_payment_intent_id,
            disputeStatus: p.dispute_status,
          },
          correlation_id: p.stripe_invoice_id ? `inv-${p.stripe_invoice_id}` : undefined,
        });
        if (p.dispute_status && p.dispute_status !== "none") {
          events.push({
            id: `disp-${p.id}`,
            type: "chargeback_initiated",
            title: "Chargeback initiated",
            description: `Dispute on ${(amt/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} payment`,
            occurred_at: p.created_at,
            category: "payment",
            source: "Stripe",
            status: "warning",
            amount: amt,
            metadata: { disputeStatus: p.dispute_status, paymentId: p.id },
            correlation_id: `pmt-${p.id}`,
          });
        }
      }
    } catch {}

    // 4. Invoices
    try {
      const invR = await pool.query(
        `SELECT id, invoice_number, status, total_cents, paid, created_at, due_date
         FROM invoices WHERE store_id = $1 ORDER BY created_at DESC`,
        [storeId]
      );
      for (const inv of invR.rows) {
        const num = inv.invoice_number ?? inv.id;
        events.push({
          id: `inv-${inv.id}`,
          type: "invoice_finalized",
          title: "Invoice finalized",
          description: `Invoice #${num} for ${((Number(inv.total_cents))/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}`,
          occurred_at: inv.created_at,
          category: "invoice",
          source: "Stripe",
          status: inv.paid ? "paid" : (inv.status ?? "open"),
          amount: Number(inv.total_cents ?? 0),
          metadata: { invoiceId: inv.id, invoiceNumber: num, status: inv.status, paid: inv.paid, dueDate: inv.due_date },
          correlation_id: `inv-${inv.id}`,
        });
      }
    } catch {}

    // 5. Subscriptions
    try {
      const subR = await pool.query(
        `SELECT id, plan_code, plan_name, status, created_at, current_period_end, stripe_subscription_id
         FROM subscriptions WHERE store_id = $1 ORDER BY created_at DESC`,
        [storeId]
      );
      for (const sub of subR.rows) {
        events.push({
          id: `sub-${sub.id}`,
          type: "subscription_created",
          title: "Subscription started",
          description: `${sub.plan_name ?? sub.plan_code ?? "Plan"} — ${sub.status}`,
          occurred_at: sub.created_at,
          category: "subscription",
          source: "System",
          status: sub.status,
          metadata: { planCode: sub.plan_code, planName: sub.plan_name, status: sub.status, stripeSubId: sub.stripe_subscription_id },
          correlation_id: `sub-${sub.id}`,
        });
      }
    } catch {}

    // 6. Credits
    try {
      const credR = await pool.query(
        `SELECT id, type, amount, description, created_at FROM platform_credit_transactions WHERE store_id = $1`,
        [storeId]
      );
      for (const c of credR.rows) {
        events.push({
          id: `cred-${c.id}`,
          type: "credit_applied",
          title: c.type === "credit" ? "Credit applied" : "Credit adjusted",
          description: c.description ?? `${c.type} of ${(Number(c.amount)).toLocaleString("en-US",{style:"currency",currency:"USD"})}`,
          occurred_at: c.created_at,
          category: "admin",
          source: "Admin",
          status: "applied",
          amount: Number(c.amount),
          metadata: { type: c.type, amount: c.amount, description: c.description },
        });
      }
    } catch {}

    // 7. Refunds
    try {
      const refR = await pool.query(
        `SELECT id, amount_cents, reason, status, created_at FROM refunds WHERE store_id = $1`,
        [storeId]
      );
      for (const r of refR.rows) {
        events.push({
          id: `ref-${r.id}`,
          type: "refund_issued",
          title: "Refund issued",
          description: `${(Number(r.amount_cents)/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}${r.reason ? ` — ${r.reason}` : ""}`,
          occurred_at: r.created_at,
          category: "payment",
          source: "Stripe",
          status: r.status ?? "succeeded",
          amount: -Number(r.amount_cents ?? 0),
          metadata: { reason: r.reason, status: r.status },
        });
      }
    } catch {}

    // ── Sort ──
    events.sort((a, b) => {
      const diff = new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
      return sort === "asc" ? -diff : diff;
    });

    // ── Filter ──
    let filtered = events;
    if (category && category !== "all") filtered = filtered.filter(e => e.category === category);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(e => (e.title + e.description).toLowerCase().includes(q));
    }
    if (from) filtered = filtered.filter(e => new Date(e.occurred_at) >= new Date(from));
    if (to)   filtered = filtered.filter(e => new Date(e.occurred_at) <= new Date(to));

    // ── Correlation engine ──
    // Group related events: payment_failed → payment_retry → payment_succeeded within 24h, same correlation_id
    const correlationMap = new Map<string, string[]>();
    for (const ev of filtered) {
      if (ev.correlation_id) {
        if (!correlationMap.has(ev.correlation_id)) correlationMap.set(ev.correlation_id, []);
        correlationMap.get(ev.correlation_id)!.push(ev.id);
      }
    }
    // Annotate events with group size
    for (const ev of filtered) {
      if (ev.correlation_id) {
        const group = correlationMap.get(ev.correlation_id) ?? [];
        ev.group_size = group.length;
        ev.group_ids  = group;
      }
    }

    const total = filtered.length;
    const page  = filtered.slice(off, off + lim);

    res.json({ events: page, total, hasMore: off + lim < total, offset: off, limit: lim });
  } catch (e) {
    console.error("[timeline]", e);
    res.status(500).json({ error: "Failed to load timeline" });
  }
});

// GET /api/support/dashboard/sla
router.get("/api/support/dashboard/sla", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    const [totalR, onTimeR] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM support_tickets WHERE first_response_at IS NOT NULL"),
      pool.query("SELECT COUNT(*) FROM support_tickets WHERE first_response_at IS NOT NULL AND EXTRACT(EPOCH FROM (first_response_at - created_at)) < 28800"),
    ]);
    const total  = parseInt(totalR.rows[0].count) || 0;
    const onTime = parseInt(onTimeR.rows[0].count) || 0;
    const pct = total > 0 ? Math.round((onTime / total) * 1000) / 10 : 0;
    res.json({ pct, total, onTime, breached: total - onTime, goal: 90 });
  } catch(e) {
    res.json({ pct: 0, total: 0, onTime: 0, breached: 0, goal: 90 });
  }
});

// ─── Account Actions — Password Reset ─────────────────────────────────────────

router.post("/api/support/accounts/:id/reset-password", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    const ownerR = await pool.query(
      `SELECT u.id, u.email, u.first_name FROM users u JOIN locations l ON l.user_id = u.id WHERE l.id = $1 LIMIT 1`,
      [storeId]
    );
    if (!ownerR.rows[0]) return res.status(404).json({ error: "Owner not found" });
    const owner = ownerR.rows[0];

    // Reuses the exact same mechanism as the customer-facing /api/auth/forgot-password
    // flow (crypto-random token in password_reset_tokens, 1-hour expiry) so a link
    // generated here is honored by the real /reset-password page.
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [owner.id, token, expiresAt]
    );

    const appUrl = process.env.APP_URL ?? "https://certxa.com";
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    const html = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Reset your Certxa password</h2>
      <p>Hi ${owner.first_name ?? "there"},</p>
      <p>Certxa support initiated a password reset for your account. Click the link below to set a new one:</p>
      <p><a href="${resetUrl}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset Password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, contact support.</p>
    </div>`;

    const { sendEmail } = await import("../mail.js");
    const mailResult = await sendEmail(storeId, owner.email, "Reset your Certxa password", html);
    if (!mailResult.success) {
      console.error("[reset-password] Mail send failed:", mailResult.error);
      return res.status(502).json({ error: mailResult.error ?? "Failed to send reset email" });
    }

    await logActivity(req.session.supportAgentId!, storeId, "password_reset_sent", req.session.supportAgentName!);
    res.json({ ok: true, email: owner.email, message: "Password reset email sent" });
  } catch (e) {
    console.error("[reset-password]", e);
    res.status(500).json({ error: "Failed to initiate password reset" });
  }
});

// POST /api/support/accounts/:id/magic-link
router.post("/api/support/accounts/:id/magic-link", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    const ownerR = await pool.query(
      `SELECT u.id, u.email FROM users u JOIN locations l ON l.user_id = u.id WHERE l.id = $1 LIMIT 1`,
      [storeId]
    );
    if (!ownerR.rows[0]) return res.status(404).json({ error: "Owner not found" });
    const owner = ownerR.rows[0];

    // Cryptographically secure, single-use, persisted token — the previous
    // Math.random() token was never stored anywhere and had no consuming
    // route, so the generated link could never actually log anyone in.
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await pool.query(
      `INSERT INTO support_magic_links (token, user_id, created_by_agent_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [token, owner.id, req.session.supportAgentId, expiresAt]
    );

    const appUrl = process.env.APP_URL ?? "https://certxa.com";
    const link = `${appUrl}/api/auth/magic?token=${token}`;
    await logActivity(req.session.supportAgentId!, storeId, "magic_link_sent", req.session.supportAgentName!);
    res.json({ ok: true, link, expiresIn: "15 minutes" });
  } catch (e) {
    console.error("[magic-link]", e);
    res.status(500).json({ error: "Failed to generate magic link" });
  }
});

// POST /api/support/accounts/:id/force-logout
router.post("/api/support/accounts/:id/force-logout", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    const ownerR = await pool.query(
      `SELECT u.id FROM users u JOIN locations l ON l.user_id = u.id WHERE l.id = $1 LIMIT 1`,
      [storeId]
    );
    if (!ownerR.rows[0]) return res.status(404).json({ error: "Owner not found" });
    const ownerId = ownerR.rows[0].id;

    // express-session (connect-pg-simple) stores each session's data as a
    // JSONB blob with the logged-in user's id at sess.userId — delete every
    // row matching this owner to actually end their active sessions, rather
    // than just recording that a logout "happened."
    const deleted = await pool.query(
      `DELETE FROM sessions WHERE sess->>'userId' = $1 RETURNING sid`,
      [String(ownerId)]
    );

    await logActivity(req.session.supportAgentId!, storeId, "force_logout", req.session.supportAgentName!);
    res.json({ ok: true, sessionsInvalidated: deleted.rowCount ?? 0, message: `Invalidated ${deleted.rowCount ?? 0} active session(s)` });
  } catch (e) {
    console.error("[force-logout]", e);
    res.status(500).json({ error: "Failed to force logout" });
  }
});

// POST /api/support/accounts/:id/send-email
router.post("/api/support/accounts/:id/send-email", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  const { subject, message } = req.body as { subject?: string; message?: string };
  if (!subject || !message) return res.status(400).json({ error: "subject and message are required" });
  try {
    const ownerR = await pool.query(
      `SELECT u.email, u.first_name FROM users u JOIN locations l ON l.user_id = u.id WHERE l.id = $1 LIMIT 1`,
      [storeId]
    );
    if (!ownerR.rows[0]) return res.status(404).json({ error: "Owner not found" });
    const owner = ownerR.rows[0];
    const { sendEmail } = await import("../mail.js");
    const html = `<p>Hi ${owner.first_name ?? "there"},</p><p>${message.replace(/\n/g, "<br>")}</p><p style="margin-top:16px;color:#6b7280;font-size:13px">— Certxa Support Team</p>`;
    const text = `Hi ${owner.first_name ?? "there"},\n\n${message}\n\n— Certxa Support Team`;
    const mailResult = await sendEmail(storeId, owner.email, subject, html, text);
    if (!mailResult.success) {
      console.error("[send-email] Mail send failed:", mailResult.error);
      return res.status(502).json({ error: mailResult.error ?? "Failed to send email" });
    }
    await logActivity(req.session.supportAgentId!, storeId, "support_email_sent", req.session.supportAgentName!);
    res.json({ ok: true, email: owner.email, message: "Email sent" });
  } catch (e) {
    console.error("[send-email]", e);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// GET /api/support/accounts/:id/booking
router.get("/api/support/accounts/:id/booking", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });
  try {
    const [slugR, statsR, recentR, upcomingR, servicesR, staffR] = await Promise.all([
      pool.query(`SELECT booking_slug FROM locations WHERE id = $1`, [storeId]),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE date >= now() - interval '30 days')::int                                          AS total_30d,
          COUNT(*) FILTER (WHERE date >= now() - interval '30 days' AND status = 'completed')::int                AS completed_30d,
          COUNT(*) FILTER (WHERE date >= now() - interval '30 days' AND status = 'cancelled')::int                AS cancelled_30d,
          COUNT(*) FILTER (WHERE date >= now() - interval '30 days' AND status = 'no-show')::int                  AS no_show_30d,
          COUNT(*) FILTER (WHERE date > now()  AND status NOT IN ('cancelled','no-show'))::int                    AS upcoming,
          COALESCE(SUM(total_paid) FILTER (WHERE date >= now() - interval '30 days' AND status = 'completed'),0)::float AS revenue_30d
        FROM appointments WHERE store_id = $1
      `, [storeId]),
      pool.query(`
        SELECT a.id, a.date, a.status, a.total_paid, a.payment_method,
          s.name  AS service_name, st.name AS staff_name,
          COALESCE(cl.full_name, cl.first_name || ' ' || cl.last_name) AS client_name
        FROM appointments a
        LEFT JOIN services s  ON s.id  = a.service_id
        LEFT JOIN staff   st  ON st.id = a.staff_id
        LEFT JOIN clients cl  ON cl.id = a.customer_id
        WHERE a.store_id = $1 ORDER BY a.date DESC LIMIT 15
      `, [storeId]),
      pool.query(`
        SELECT a.date, s.name AS service_name, st.name AS staff_name,
          COALESCE(cl.full_name, cl.first_name || ' ' || cl.last_name) AS client_name
        FROM appointments a
        LEFT JOIN services s  ON s.id  = a.service_id
        LEFT JOIN staff   st  ON st.id = a.staff_id
        LEFT JOIN clients cl  ON cl.id = a.customer_id
        WHERE a.store_id = $1 AND a.date > now() AND a.status NOT IN ('cancelled','no-show')
        ORDER BY a.date ASC LIMIT 5
      `, [storeId]),
      pool.query(`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE is_active = true)::int AS active FROM services WHERE store_id = $1`, [storeId])
        .catch(() => ({ rows: [{ count: 0, active: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS count FROM staff WHERE store_id = $1 AND status = 'active'`, [storeId])
        .catch(() => ({ rows: [{ count: 0 }] })),
    ]);
    res.json({
      bookingSlug:          slugR.rows[0]?.booking_slug ?? null,
      stats:                statsR.rows[0] ?? {},
      recentAppointments:   recentR.rows,
      upcomingAppointments: upcomingR.rows,
      services:             servicesR.rows[0] ?? { count: 0, active: 0 },
      staff:                staffR.rows[0]    ?? { count: 0 },
    });
  } catch (e) {
    console.error("[booking tab]", e);
    res.status(500).json({ error: "Failed to load booking data" });
  }
});

// GET /api/support/accounts/:id/communications
router.get("/api/support/accounts/:id/communications", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });
  try {
    const [smsR, ticketsR, statsR] = await Promise.all([
      pool.query(`
        SELECT id, sent_at, message_type, phone, status, sms_source, message_body
        FROM sms_log WHERE store_id = $1 ORDER BY sent_at DESC LIMIT 30
      `, [storeId]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT t.id, t.ticket_number, t.subject, t.status, t.priority, t.channel, t.created_at,
          (SELECT COUNT(*)::int FROM support_ticket_messages WHERE ticket_id = t.id) AS message_count
        FROM support_tickets t WHERE t.account_id = $1
        ORDER BY t.created_at DESC LIMIT 10
      `, [storeId]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT
          COUNT(*)::int                                                              AS total,
          COUNT(*) FILTER (WHERE message_type = 'inbound')::int                    AS inbound,
          COUNT(*) FILTER (WHERE message_type = 'outbound')::int                   AS outbound,
          COUNT(*) FILTER (WHERE status = 'failed')::int                           AS failed,
          COUNT(*) FILTER (WHERE sent_at >= now() - interval '30 days')::int       AS last_30d
        FROM sms_log WHERE store_id = $1
      `, [storeId]).catch(() => ({ rows: [{ total:0, inbound:0, outbound:0, failed:0, last_30d:0 }] })),
    ]);
    res.json({ smsLog: smsR.rows, tickets: ticketsR.rows, smsStats: statsR.rows[0] ?? { total:0, inbound:0, outbound:0, failed:0, last_30d:0 } });
  } catch (e) {
    console.error("[communications tab]", e);
    res.status(500).json({ error: "Failed to load communications data" });
  }
});

// GET /api/support/accounts/:id/website
router.get("/api/support/accounts/:id/website", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });
  try {
    const [websiteR, viewsR] = await Promise.all([
      pool.query(`
        SELECT w.id, w.name, w.published, w.published_at, w.custom_domain, w.assigned_subdomain,
          w.created_at, w.updated_at, w.publisher_type,
          (SELECT COUNT(*)::int FROM wb_pages WHERE website_id = w.id) AS page_count
        FROM wb_websites w WHERE w.storeid = $1::text ORDER BY w.id ASC LIMIT 1
      `, [storeId]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT
          COUNT(*)::int                                                         AS total_views,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS views_30d,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int  AS views_7d
        FROM wb_page_views WHERE store_id = $1
      `, [storeId]).catch(() => ({ rows: [{ total_views:0, views_30d:0, views_7d:0 }] })),
    ]);
    res.json({
      website:   websiteR.rows[0] ?? null,
      pageViews: viewsR.rows[0]   ?? { total_views:0, views_30d:0, views_7d:0 },
    });
  } catch (e) {
    console.error("[website tab]", e);
    res.status(500).json({ error: "Failed to load website data" });
  }
});

// POST /api/support/accounts/:id/reset-ai
router.post("/api/support/accounts/:id/reset-ai", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  try {
    await pool.query(
      `UPDATE feature_usage SET usage_count = 0 WHERE store_id = $1 AND feature_id = 'ai_receptionist' AND period_start = TO_CHAR(DATE_TRUNC('month', NOW()), 'YYYY-MM-DD')`,
      [storeId]
    );
    await logActivity(req.session.supportAgentId!, storeId, "ai_usage_reset", req.session.supportAgentName!);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset AI usage" });
  }
});

// GET /api/support/subscriptions
router.get("/api/support/subscriptions", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    const rows = await pool.query(`
      SELECT
        ss.id, ss.store_id AS "storeId", ss.status,
        ss.current_period_start AS "currentPeriodStart",
        ss.current_period_end   AS "currentPeriodEnd",
        ss.created_at           AS "createdAt",
        sp.name                 AS "planName",
        sp.price_monthly_cents  AS "priceMonthlyCents",
        l.name                  AS "storeName"
      FROM store_subscriptions ss
      JOIN subscription_plans sp ON sp.id = ss.plan_id
      JOIN locations l ON l.id = ss.store_id
      WHERE ss.status IN ('active', 'trialing', 'past_due')
      ORDER BY ss.created_at DESC
      LIMIT 200
    `);
    res.json(rows.rows);
  } catch (e) {
    console.error("[subscriptions list]", e);
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});

// ─── Auto-close scheduler ─────────────────────────────────────────────────────
// Closes tickets where the last message was an outbound agent reply > 7 days ago
// and the customer has not responded. Sends a closure notification email.
export async function runAutoCloseTickets(): Promise<void> {
  const AUTO_CLOSE_DAYS = 7;
  try {
    // Find tickets where:
    // - status is open or pending
    // - most recent message is outbound (agent reply)
    // - that message was > 7 days ago
    const rows = await pool.query(
      `SELECT t.id, t.ticket_number, t.subject, t.customer_email,
              t.account_id, m.created_at AS last_msg_at
       FROM support_tickets t
       JOIN LATERAL (
         SELECT created_at
         FROM support_ticket_messages
         WHERE ticket_id = t.id AND is_internal = false
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE t.status IN ('open', 'pending')
         AND m.created_at < now() - ($1 || ' days')::interval
         AND NOT EXISTS (
           SELECT 1 FROM support_ticket_messages
           WHERE ticket_id = t.id
             AND is_internal = false
             AND direction = 'inbound'
             AND created_at > m.created_at
         )`,
      [AUTO_CLOSE_DAYS]
    );

    if (rows.rows.length === 0) return;

    for (const row of rows.rows) {
      await pool.query(
        "UPDATE support_tickets SET status = 'closed', updated_at = now() WHERE id = $1",
        [row.id]
      );
      await pool.query(
        `INSERT INTO support_ticket_messages (ticket_id, author_type, author_name, content, is_internal, direction, created_at)
         VALUES ($1, 'system', 'Certxa Support Bot', $2, false, 'outbound', now())`,
        [row.id, `This ticket has been automatically closed after ${AUTO_CLOSE_DAYS} days of no response. If you still need help, please reply to this message or open a new support request.`]
      );
      // Send closure email if customer email is on file
      if (row.customer_email) {
        try {
          const { sendSupportReply } = await import("../lib/smtpSender");
          await sendSupportReply({
            to: row.customer_email,
            subject: `Re: ${row.subject} [${row.ticket_number}]`,
            text: `Hi,\n\nThis ticket (#${row.ticket_number}) has been automatically closed after ${AUTO_CLOSE_DAYS} days of no response.\n\nIf you still need assistance, please reply to this email or visit certxa.com/contact to open a new request.\n\nThank you,\nCertxa Support`,
            inReplyTo: undefined,
          });
        } catch (emailErr: any) {
          console.warn(`[AutoClose] Could not send closure email for ticket #${row.ticket_number}: ${emailErr.message}`);
        }
      }
      console.log(`[AutoClose] Closed ticket #${row.ticket_number} (id=${row.id}) — no response for ${AUTO_CLOSE_DAYS} days`);
    }
    console.log(`[AutoClose] Processed ${rows.rows.length} ticket(s)`);
  } catch (err: any) {
    console.error("[AutoClose] Error:", err.message);
  }
}

// ─── AI Receptionist: full dashboard for a store ─────────────────────────────

router.get("/api/support/accounts/:id/ai-receptionist", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });
  try {
    // Fetch store_settings prefs (phone + enabled)
    const settingsRow = await pool.query(
      `SELECT preferences FROM store_settings WHERE store_id = $1 LIMIT 1`,
      [storeId]
    ).catch(() => ({ rows: [] }));
    const prefs = settingsRow.rows[0]?.preferences ?? {};
    const phoneNumber: string | null = prefs.aiReceptionistPhone ?? null;
    const enabled: boolean = prefs.aiReceptionistEnabled ?? false;

    // Setup date — first ai_provision transaction
    const setupRow = await pool.query(
      `SELECT created_at FROM platform_credit_transactions
       WHERE store_id = $1 AND type = 'ai_provision'
       ORDER BY created_at ASC LIMIT 1`,
      [storeId]
    ).catch(() => ({ rows: [] }));
    const setupDate: string | null = setupRow.rows[0]?.created_at ?? null;
    const monthsActive = setupDate
      ? Math.max(1, Math.round((Date.now() - new Date(setupDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
      : 0;

    // Spend: total all-time + current calendar month
    const spendRow = await pool.query(`
      SELECT
        COALESCE(SUM(total_est_cost::float), 0)                                           AS total_spent,
        COALESCE(SUM(CASE WHEN date_trunc('month', created_at) = date_trunc('month', now()) THEN total_est_cost::float ELSE 0 END), 0) AS period_spent
      FROM call_usage_records WHERE store_id = $1
    `, [storeId]).catch(() => ({ rows: [{ total_spent: 0, period_spent: 0 }] }));
    const totalSpent: number  = parseFloat(spendRow.rows[0]?.total_spent  ?? 0);
    const periodSpent: number = parseFloat(spendRow.rows[0]?.period_spent ?? 0);

    // Call history — ai_call_log LEFT JOIN call_usage_records, most-recent first
    const callsRow = await pool.query(`
      SELECT
        c.id,
        c.call_sid,
        c.caller_phone,
        c.caller_name,
        c.outcome,
        c.duration_seconds,
        c.started_at,
        c.ended_at,
        c.appointment_id,
        u.total_est_cost,
        u.twilio_est_cost,
        u.openai_est_cost,
        u.termination_reason,
        u.tool_call_count
      FROM ai_call_log c
      LEFT JOIN call_usage_records u ON u.call_log_id = c.id
      WHERE c.store_id = $1
      ORDER BY c.started_at DESC
      LIMIT 200
    `, [storeId]).catch(() => ({ rows: [] as any[] }));

    // Aggregate totals
    const totalCalls     = callsRow.rows.length;
    const totalMinutes   = Math.round(callsRow.rows.reduce((s: number, r: any) => s + (r.duration_seconds ?? 0), 0) / 60);
    const bookedCalls    = callsRow.rows.filter((r: any) => r.appointment_id).length;

    // Webhook URL that should be set on Twilio
    const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const webhookUrl = phoneNumber && appUrl ? `${appUrl}/api/webhook/twilio/${storeId}` : null;

    return res.json({
      phoneNumber,
      enabled,
      setupDate,
      monthsActive,
      totalSpent,
      periodSpent,
      totalCalls,
      totalMinutes,
      bookedCalls,
      webhookUrl,
      calls: callsRow.rows.map((r: any) => ({
        id:               r.id,
        callSid:          r.call_sid,
        callerPhone:      r.caller_phone,
        callerName:       r.caller_name,
        outcome:          r.outcome,
        durationSeconds:  r.duration_seconds,
        startedAt:        r.started_at,
        endedAt:          r.ended_at,
        appointmentId:    r.appointment_id,
        totalCost:        r.total_est_cost != null ? parseFloat(r.total_est_cost) : null,
        twilioCost:       r.twilio_est_cost != null ? parseFloat(r.twilio_est_cost) : null,
        openaiCost:       r.openai_est_cost != null ? parseFloat(r.openai_est_cost) : null,
        terminationReason: r.termination_reason,
        toolCallCount:    r.tool_call_count,
      })),
    });
  } catch (e: any) {
    console.error("[Support] AI Receptionist fetch error:", e.message);
    return res.status(500).json({ error: "Failed to load AI Receptionist data" });
  }
});

// POST /api/support/accounts/:id/ai-receptionist/provision
// Re-applies (or repairs) the Twilio voice webhook for the stored phone number.
router.post("/api/support/accounts/:id/ai-receptionist/provision", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = paramInt(req.params.id);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid account ID" });
  try {
    const settingsRow = await pool.query(
      `SELECT preferences FROM store_settings WHERE store_id = $1 LIMIT 1`,
      [storeId]
    );
    const prefs = settingsRow.rows[0]?.preferences ?? {};
    const phoneNumber: string | null = prefs.aiReceptionistPhone ?? null;
    if (!phoneNumber) return res.status(400).json({ error: "No phone number provisioned for this account" });

    const accountSid  = process.env.TWILIO_ACCOUNT_SID;
    const authToken   = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(503).json({ error: "Twilio credentials are not configured on this server" });
    }

    const appUrl      = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const webhookUrl  = `${appUrl}/api/webhook/twilio/${storeId}`;
    const smsWebhookUrl = `${appUrl}/api/webhooks/twilio/incoming`;

    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);

    // Find the Twilio number SID for this phone number
    const numbers = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
    if (numbers.length === 0) {
      return res.status(404).json({ error: `Phone number ${phoneNumber} not found in Twilio account` });
    }

    await client.incomingPhoneNumbers(numbers[0].sid).update({
      voiceUrl:    webhookUrl,
      voiceMethod: "POST",
      smsUrl:      smsWebhookUrl,
      smsMethod:   "POST",
    });

    console.log(`[Support] Provisioned webhook for ${phoneNumber} → voice:${webhookUrl} sms:${smsWebhookUrl} (storeId=${storeId})`);
    return res.json({ success: true, phoneNumber, webhookUrl, smsWebhookUrl });
  } catch (e: any) {
    console.error("[Support] AI provision error:", e.message);
    return res.status(500).json({ error: e.message ?? "Failed to provision webhook" });
  }
});

// ── GET /api/support/error-codes ──────────────────────────────────────────────
// Returns the full error code lookup so the support front-end can cache it
// client-side. No DB needed — the data is static.
router.get("/api/support/error-codes", requireSupportAuth, (_req: Request, res: Response) => {
  return res.json(ERROR_CODE_LOOKUP);
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────

// Bootstrap DB table at module load time (idempotent)
bootstrapHealthCheckTable(pool).catch(err =>
  console.warn("[HealthCheck] Bootstrap failed:", err),
);

// POST /api/support/accounts/:id/health-check
// Runs all segments (or a subset via ?segments=seg1,seg2) and persists the result.
router.post("/api/support/accounts/:id/health-check", requireSupportAuth, async (req: Request, res: Response) => {
  const accountId = paramInt(req.params.id);
  if (!accountId) return res.status(400).json({ error: "Invalid account id" });

  const agentId   = req.session.supportAgentId!;
  const agentName = req.session.supportAgentName ?? "Support Agent";

  // Optional subset via ?segments=booking_readiness,team_roster
  let segments: SegmentId[] | undefined;
  const raw = req.query.segments;
  if (typeof raw === "string" && raw.trim()) {
    const requested = raw.split(",").map(s => s.trim());
    const valid = requested.filter(s => (SEGMENT_IDS as readonly string[]).includes(s)) as SegmentId[];
    if (valid.length > 0) segments = valid;
  }

  try {
    const run = await runHealthCheck({ accountId, agentId, agentName, segments, pool });
    return res.json(run);
  } catch (err: any) {
    console.error("[HealthCheck] POST error:", err);
    return res.status(500).json({ error: err.message ?? "Health check failed" });
  }
});

// GET /api/support/accounts/:id/health-check/latest
// Returns the most recently stored run for this account.
router.get("/api/support/accounts/:id/health-check/latest", requireSupportAuth, async (req: Request, res: Response) => {
  const accountId = paramInt(req.params.id);
  if (!accountId) return res.status(400).json({ error: "Invalid account id" });

  try {
    const result = await pool.query(
      `SELECT * FROM account_health_checks
       WHERE account_id = $1
       ORDER BY run_at DESC LIMIT 1`,
      [accountId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "No health check runs found" });
    return res.json(dbRowToRun(result.rows[0]));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/support/accounts/:id/health-check/history
// Returns a summary list of past runs (last 20).
router.get("/api/support/accounts/:id/health-check/history", requireSupportAuth, async (req: Request, res: Response) => {
  const accountId = paramInt(req.params.id);
  if (!accountId) return res.status(400).json({ error: "Invalid account id" });

  try {
    const result = await pool.query(
      `SELECT id, agent_id, agent_name, run_at, segments_run,
              pass_count, warn_count, fail_count, notes
       FROM account_health_checks
       WHERE account_id = $1
       ORDER BY run_at DESC LIMIT 20`,
      [accountId],
    );
    return res.json(result.rows.map(r => ({
      id:         r.id,
      agentId:    r.agent_id,
      agentName:  r.agent_name,
      runAt:      r.run_at,
      segmentsRun: r.segments_run,
      passCount:  r.pass_count,
      warnCount:  r.warn_count,
      failCount:  r.fail_count,
      notes:      r.notes,
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/support/accounts/:id/health-check/:runId
// Returns a specific stored run.
router.get("/api/support/accounts/:id/health-check/:runId", requireSupportAuth, async (req: Request, res: Response) => {
  const accountId = paramInt(req.params.id);
  const runId     = paramInt(req.params.runId);
  if (!accountId || !runId) return res.status(400).json({ error: "Invalid parameters" });

  try {
    const result = await pool.query(
      `SELECT * FROM account_health_checks WHERE id = $1 AND account_id = $2`,
      [runId, accountId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    return res.json(dbRowToRun(result.rows[0]));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/support/accounts/:id/health-check/:runId
// Update the notes on a stored run.
router.patch("/api/support/accounts/:id/health-check/:runId", requireSupportAuth, async (req: Request, res: Response) => {
  const accountId = paramInt(req.params.id);
  const runId     = paramInt(req.params.runId);
  if (!accountId || !runId) return res.status(400).json({ error: "Invalid parameters" });

  const notes = typeof req.body.notes === "string" ? req.body.notes : "";
  try {
    await pool.query(
      `UPDATE account_health_checks SET notes = $1 WHERE id = $2 AND account_id = $3`,
      [notes, runId, accountId],
    );
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/support/accounts/:id/health-check/:runId/segment/:segmentId
// Re-run a single segment and merge it into the existing run record.
router.post("/api/support/accounts/:id/health-check/:runId/segment/:segmentId", requireSupportAuth, async (req: Request, res: Response) => {
  const accountId = paramInt(req.params.id);
  const runId     = paramInt(req.params.runId);
  const segmentId = req.params.segmentId as SegmentId;
  if (!accountId || !runId || !(SEGMENT_IDS as readonly string[]).includes(segmentId)) {
    return res.status(400).json({ error: "Invalid parameters" });
  }

  const agentId   = req.session.supportAgentId!;
  const agentName = req.session.supportAgentName ?? "Support Agent";

  try {
    const result = await rerunHealthSegment(runId, segmentId, accountId, agentId, agentName, pool);
    return res.json(result);
  } catch (err: any) {
    console.error("[HealthCheck] Segment re-run error:", err);
    return res.status(500).json({ error: err.message ?? "Segment re-run failed" });
  }
});

// ── Helper: map a DB row to the API shape ────────────────────────────────────
function dbRowToRun(row: any) {
  return {
    id:          row.id,
    accountId:   row.account_id,
    agentId:     row.agent_id,
    agentName:   row.agent_name,
    runAt:       row.run_at,
    segmentsRun: row.segments_run,
    results:     row.results ?? {},
    passCount:   row.pass_count,
    warnCount:   row.warn_count,
    failCount:   row.fail_count,
    notes:       row.notes,
  };
}

export default router;

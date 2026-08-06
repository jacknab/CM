/**
 * routes/commissionReserves.ts — Salon Owner Balance Management
 *
 * Prevents salon owners from withdrawing funds needed for pending contractor
 * commission payouts by reserving those amounts against the Stripe balance.
 *
 * Endpoints (all under /api/salon):
 *   GET  /api/salon/balance              — stripe balance - pending commissions
 *   POST /api/salon/request-payout       — validate + create Stripe payout for owner
 *   GET  /api/salon/pending-commissions  — pending commissions grouped by contractor
 *   POST /api/commissions/record         — record a new commission after service completion
 *
 * Admin endpoints (under /api/admin/commission-reserves):
 *   GET  /api/admin/commission-reserves/summary  — platform-wide reserve health
 */

import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { getPaymentAccount, getConnectedAccountBalance } from "../lib/stripeConnect";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { z } from "zod";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Verify caller is an owner or admin of their store. Returns userId or null. */
async function requireOwner(req: Request, res: Response): Promise<string | null> {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const role = rows[0]?.role;
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "Only store owners may access balance data" });
    return null;
  }
  return userId;
}

/** Next Friday from today (payout schedule default). */
function nextFriday(from: Date = new Date()): string {
  const d = new Date(from);
  const dow = d.getDay(); // 0=Sun,5=Fri
  const daysUntilFriday = (5 - dow + 7) % 7 || 7; // at least 1 day out
  d.setDate(d.getDate() + daysUntilFriday);
  return d.toISOString().slice(0, 10);
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── GET /api/salon/balance ────────────────────────────────────────────────────
// Returns: stripe_balance, pending_commissions, available_balance

router.get("/salon/balance", async (req: Request, res: Response) => {
  if (!await requireOwner(req, res)) return;

  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ error: "No store found for this session" });

  const account = await getPaymentAccount(storeId);
  if (!account || account.status === "disconnected") {
    return res.status(400).json({ error: "Store has no connected Stripe account" });
  }

  // Fetch Stripe balance
  let stripeAvailableCents = 0;
  let stripePendingCents   = 0;
  let currency             = account.currency ?? "usd";
  let fetchedAt            = new Date().toISOString();

  try {
    const balance = await getConnectedAccountBalance(account.providerAccountId);
    // Sum available amounts (usually one currency, but handle multi)
    stripeAvailableCents = balance.available.reduce((s, b) => s + b.amount, 0);
    stripePendingCents   = balance.pending.reduce((s, b) => s + b.amount, 0);
    if (balance.available[0]?.currency) currency = balance.available[0].currency;
    fetchedAt = balance.fetchedAt;
  } catch (err: any) {
    console.error("[commissionReserves/balance] Stripe fetch error:", err?.message);
    // Fall through with 0 balances — still show commission data
  }

  // Fetch total pending commissions from DB
  const { rows: pendingRows } = await pool.query<{ total: string; next_payout: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::TEXT AS total,
            MIN(scheduled_payout_date)::TEXT  AS next_payout
     FROM contractor_commissions
     WHERE store_id = $1 AND status = 'pending'`,
    [storeId]
  );

  const pendingCommissionsCents = parseInt(pendingRows[0]?.total ?? "0", 10);
  const nextPayoutDate          = pendingRows[0]?.next_payout ?? null;
  const availableCents          = stripeAvailableCents - pendingCommissionsCents;

  // Warn if commissions exceed available balance
  const isInsufficient = availableCents < 0;

  return res.json({
    stripe_balance:        stripeAvailableCents,
    stripe_pending:        stripePendingCents,
    pending_commissions:   pendingCommissionsCents,
    available_balance:     availableCents,
    currency,
    fetched_at:            fetchedAt,
    next_payout_date:      nextPayoutDate,
    is_insufficient:       isInsufficient,
    // Human-readable for quick display
    formatted: {
      stripe_balance:      formatCents(stripeAvailableCents),
      stripe_pending:      formatCents(stripePendingCents),
      pending_commissions: formatCents(pendingCommissionsCents),
      available_balance:   formatCents(Math.max(0, availableCents)),
    },
  });
});

// ─── GET /api/salon/pending-commissions ──────────────────────────────────────
// Returns pending commissions grouped by contractor with scheduled payout dates

router.get("/salon/pending-commissions", async (req: Request, res: Response) => {
  if (!await requireOwner(req, res)) return;

  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ error: "No store found for this session" });

  const { rows } = await pool.query(
    `SELECT
       c.id                     AS contractor_id,
       COALESCE(s.first_name || ' ' || s.last_name, 'Unknown')  AS contractor_name,
       cc.scheduled_payout_date,
       COUNT(cc.id)::INT        AS commission_count,
       SUM(cc.amount)::INT      AS total_cents,
       MIN(cc.earned_date)      AS earliest_earned,
       MAX(cc.earned_date)      AS latest_earned
     FROM contractor_commissions cc
     JOIN contractors c ON cc.contractor_id = c.id
     LEFT JOIN staff s ON c.staff_id = s.id
     WHERE cc.store_id = $1 AND cc.status = 'pending'
     GROUP BY c.id, s.first_name, s.last_name, cc.scheduled_payout_date
     ORDER BY cc.scheduled_payout_date ASC, total_cents DESC`,
    [storeId]
  );

  const grouped: Record<string, {
    contractor_id: number;
    contractor_name: string;
    payouts: Array<{
      scheduled_payout_date: string;
      commission_count: number;
      total_cents: number;
      formatted_amount: string;
    }>;
    total_cents: number;
  }> = {};

  for (const row of rows) {
    const key = String(row.contractor_id);
    if (!grouped[key]) {
      grouped[key] = {
        contractor_id:   row.contractor_id,
        contractor_name: row.contractor_name,
        payouts:         [],
        total_cents:     0,
      };
    }
    const cents = parseInt(row.total_cents, 10);
    grouped[key].payouts.push({
      scheduled_payout_date: row.scheduled_payout_date,
      commission_count:      row.commission_count,
      total_cents:           cents,
      formatted_amount:      formatCents(cents),
    });
    grouped[key].total_cents += cents;
  }

  return res.json({
    contractors: Object.values(grouped).map(g => ({
      ...g,
      formatted_total: formatCents(g.total_cents),
    })),
    total_pending_cents: rows.reduce((s, r) => s + parseInt(r.total_cents, 10), 0),
  });
});

// ─── POST /api/salon/request-payout ───────────────────────────────────────────
// Validate amount against available balance, then create Stripe payout for owner

const requestPayoutSchema = z.object({
  amount_cents: z.number().int().positive("Amount must be a positive number of cents"),
  destination:  z.string().optional(), // Stripe bank account ID; omit to use default
});

router.post("/salon/request-payout", async (req: Request, res: Response) => {
  if (!await requireOwner(req, res)) return;

  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ error: "No store found for this session" });

  const parse = requestPayoutSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0]?.message ?? "Invalid request" });
  }
  const { amount_cents, destination } = parse.data;

  const account = await getPaymentAccount(storeId);
  if (!account || account.status === "disconnected") {
    return res.status(400).json({ error: "Store has no connected Stripe account" });
  }
  if (!account.payoutsEnabled) {
    return res.status(400).json({ error: "Payouts are not yet enabled on your Stripe account" });
  }

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured on this platform" });
  }

  // ── Re-fetch balance + pending commissions atomically ──────────────────────
  let stripeAvailableCents = 0;
  try {
    const balance = await getConnectedAccountBalance(account.providerAccountId);
    stripeAvailableCents = balance.available.reduce((s, b) => s + b.amount, 0);
  } catch (err: any) {
    return res.status(502).json({ error: "Failed to fetch Stripe balance. Please try again." });
  }

  const { rows: pendingRows } = await pool.query<{ total: string; next_payout: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::TEXT AS total,
            MIN(scheduled_payout_date)::TEXT  AS next_payout
     FROM contractor_commissions
     WHERE store_id = $1 AND status = 'pending'`,
    [storeId]
  );
  const pendingCommissionsCents = parseInt(pendingRows[0]?.total ?? "0", 10);
  const availableCents          = stripeAvailableCents - pendingCommissionsCents;

  if (amount_cents > availableCents) {
    const nextPayout = pendingRows[0]?.next_payout;
    const reservedMsg = nextPayout
      ? ` You have ${formatCents(pendingCommissionsCents)} reserved for contractor commissions scheduled for ${nextPayout}.`
      : ` You have ${formatCents(pendingCommissionsCents)} reserved for pending contractor commissions.`;
    return res.status(400).json({
      error: `Insufficient available balance. You have ${formatCents(availableCents)} available.${reservedMsg}`,
      available_balance:   availableCents,
      pending_commissions: pendingCommissionsCents,
      requested:           amount_cents,
    });
  }

  // ── Create Stripe payout on connected account ──────────────────────────────
  try {
    const stripe = getStripe();
    const payoutParams: any = {
      amount:   amount_cents,
      currency: account.currency ?? "usd",
      metadata: {
        store_id:   String(storeId),
        initiated_by: "owner_dashboard",
      },
    };
    if (destination) payoutParams.destination = destination;

    const payout = await (stripe as any).payouts.create(payoutParams, {
      stripeAccount: account.providerAccountId,
    });

    console.log(`[commissionReserves] Owner payout created: ${payout.id} ${formatCents(amount_cents)} → store ${storeId}`);

    return res.json({
      success:       true,
      payout_id:     payout.id,
      amount_cents,
      status:        payout.status,
      arrival_date:  payout.arrival_date,
    });
  } catch (err: any) {
    console.error("[commissionReserves/request-payout] Stripe error:", err?.message);
    return res.status(400).json({ error: err?.message ?? "Stripe payout failed" });
  }
});

// ─── POST /api/commissions/record ─────────────────────────────────────────────
// Record a new pending commission when a service is completed

const recordCommissionSchema = z.object({
  contractor_id:   z.number().int().positive(),
  appointment_id:  z.number().int().positive().optional(),
  service_id:      z.number().int().positive().optional(),
  amount:          z.number().int().positive("Amount must be a positive integer (cents)"),
  earned_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "earned_date must be YYYY-MM-DD"),
});

router.post("/commissions/record", async (req: Request, res: Response) => {
  if (!await requireOwner(req, res)) return;

  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ error: "No store found for this session" });

  const parse = recordCommissionSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0]?.message ?? "Invalid request" });
  }

  const { contractor_id, appointment_id, service_id, amount, earned_date } = parse.data;

  // Verify contractor belongs to this store
  const { rows: contractorRows } = await pool.query(
    `SELECT id FROM contractors WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [contractor_id, storeId]
  );
  if (!contractorRows.length) {
    return res.status(404).json({ error: "Contractor not found" });
  }

  // Determine next payout date (default: next Friday)
  const scheduledPayoutDate = nextFriday(new Date(earned_date));

  try {
    const { rows } = await pool.query(
      `INSERT INTO contractor_commissions
         (store_id, contractor_id, appointment_id, service_id, amount, status,
          earned_date, scheduled_payout_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW(), NOW())
       ON CONFLICT (appointment_id, contractor_id) WHERE appointment_id IS NOT NULL
       DO UPDATE SET
         amount               = EXCLUDED.amount,
         service_id           = EXCLUDED.service_id,
         scheduled_payout_date = EXCLUDED.scheduled_payout_date,
         updated_at           = NOW()
       RETURNING *`,
      [storeId, contractor_id, appointment_id ?? null, service_id ?? null,
       amount, earned_date, scheduledPayoutDate]
    );

    return res.status(201).json({
      commission:          rows[0],
      scheduled_payout_date: scheduledPayoutDate,
    });
  } catch (err: any) {
    console.error("[commissionReserves/record]", err?.message);
    return res.status(500).json({ error: "Failed to record commission" });
  }
});

// ─── Admin: GET /api/admin/commission-reserves/summary ────────────────────────
// Platform-wide view: salons with low balance, failed payouts, success rate

router.get("/admin/commission-reserves/summary", async (req: Request, res: Response) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  const { rows: adminRows } = await pool.query(
    `SELECT is_admin FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  if (!adminRows[0]?.is_admin) {
    return res.status(403).json({ error: "Platform admin access required" });
  }

  const { rows: storeRows } = await pool.query(
    `SELECT
       cc.store_id,
       l.name                          AS store_name,
       COUNT(cc.id) FILTER (WHERE cc.status = 'pending')::INT    AS pending_count,
       COALESCE(SUM(cc.amount) FILTER (WHERE cc.status = 'pending'), 0)::INT AS pending_cents,
       COUNT(cc.id) FILTER (WHERE cc.status = 'paid')::INT       AS paid_count,
       COUNT(cc.id) FILTER (WHERE cc.status = 'failed')::INT     AS failed_count,
       MIN(cc.scheduled_payout_date) FILTER (WHERE cc.status = 'pending') AS next_payout
     FROM contractor_commissions cc
     JOIN locations l ON cc.store_id = l.id
     GROUP BY cc.store_id, l.name
     ORDER BY pending_cents DESC`,
  );

  const total = storeRows.reduce(
    (acc, r) => ({
      pending_cents:  acc.pending_cents + r.pending_cents,
      pending_count:  acc.pending_count + r.pending_count,
      paid_count:     acc.paid_count    + r.paid_count,
      failed_count:   acc.failed_count  + r.failed_count,
    }),
    { pending_cents: 0, pending_count: 0, paid_count: 0, failed_count: 0 }
  );

  const successRate = (total.paid_count + total.failed_count) > 0
    ? ((total.paid_count / (total.paid_count + total.failed_count)) * 100).toFixed(1)
    : "N/A";

  return res.json({
    stores: storeRows.map(r => ({
      ...r,
      formatted_pending: formatCents(r.pending_cents),
    })),
    totals: {
      ...total,
      formatted_pending: formatCents(total.pending_cents),
      success_rate: successRate,
    },
  });
});

export default router;

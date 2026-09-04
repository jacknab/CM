/**
 * routes/stripeConnect.ts — Stripe Connect & Terminal API
 *
 * Completely isolated from Certxa SaaS billing (routes/billing.ts).
 *
 * Endpoints:
 *   GET  /api/payments/stripe/connect           — get OAuth URL
 *   GET  /api/payments/stripe/callback          — OAuth callback (public)
 *   GET  /api/payments/stripe/status            — account status
 *   POST /api/payments/stripe/disconnect        — disconnect account
 *   POST /api/payments/stripe/sync              — re-sync account from Stripe
 *   POST /api/payments/terminal/connection-token    — Stripe Terminal SDK token
 *   POST /api/payments/terminal/create-payment-intent
 *   POST /api/payments/terminal/capture-payment-intent
 *   POST /api/payments/terminal/cancel-payment-intent
 *   POST /api/stripe/connect-webhook            — Connect webhook events
 *   GET  /api/payments/stripe/express-settings  — store Express contractor payout settings
 *   PUT  /api/payments/stripe/express-settings  — save Express settings
 *   GET  /api/payments/stripe/instant-transfer-failures — recent failed instant transfers
 */

import { Router, type Request, type Response } from "express";
import {
  buildConnectOAuthUrl,
  exchangeOAuthCode,
  syncAccountFromStripe,
  deauthorizeAccount,
  removePaymentAccount,
  getPaymentAccount,
  getConnectedAccountBalance,
  createTerminalConnectionToken,
  createTerminalPaymentIntent,
  captureTerminalPaymentIntent,
  cancelTerminalPaymentIntent,
  isConnectConfigured,
} from "../lib/stripeConnect";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { db, pool } from "../db";
import { contractors, appointments, contractorInstantTransfers, storePaymentAccounts, clients, services } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logActivityEvent } from "../lib/activityFeed";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { snapshotCompletionFields } from "../lib/commissionSnapshot";
import { recordCommissionAccrual } from "../lib/commissionAccrual";

const router = Router();

// ─── Permission guard ─────────────────────────────────────────────────────────

async function requireOwnerOrAdmin(req: Request, res: Response): Promise<number | null> {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const result = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const role = result.rows[0]?.role;
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "Only store owners and admins can manage payment settings" });
    return null;
  }
  return userId;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getReturnBaseUrl(req: Request): string {
  return process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
}

// ─── GET /api/payments/stripe/connect ────────────────────────────────────────

router.get("/stripe/connect", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  if (!isConnectConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured on this platform" });
  }

  if (!process.env.STRIPE_CONNECT_CLIENT_ID) {
    return res.status(503).json({ error: "STRIPE_CONNECT_CLIENT_ID is not configured" });
  }

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found for this session" });

    const baseUrl = getReturnBaseUrl(req);
    const callbackUrl = `${baseUrl}/api/payments/stripe/callback`;
    const oauthUrl = buildConnectOAuthUrl(storeId, callbackUrl);

    return res.json({ url: oauthUrl });
  } catch (err: any) {
    console.error("[stripeConnect/connect]", err?.message);
    return res.status(500).json({ error: "Failed to generate Connect URL" });
  }
});

// ─── GET /api/payments/stripe/callback (public — OAuth redirect target) ──────

router.get("/stripe/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  const baseUrl = getReturnBaseUrl(req);
  const settingsUrl = `${baseUrl}/manage/payment-settings`;

  if (error) {
    console.warn("[stripeConnect/callback] OAuth error:", error);
    return res.redirect(`${settingsUrl}?connect_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${settingsUrl}?connect_error=missing_params`);
  }

  let storeId: number;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    storeId = Number(decoded.storeId);
    if (!storeId) throw new Error("invalid storeId in state");
  } catch {
    return res.redirect(`${settingsUrl}?connect_error=invalid_state`);
  }

  try {
    const { stripeAccountId } = await exchangeOAuthCode(code);
    await syncAccountFromStripe(storeId, stripeAccountId);
    console.log(`[stripeConnect] Connected account ${stripeAccountId} → storeId=${storeId}`);
    return res.redirect(`${settingsUrl}?connect_success=1`);
  } catch (err: any) {
    console.error("[stripeConnect/callback] Exchange failed:", err?.message);
    return res.redirect(`${settingsUrl}?connect_error=${encodeURIComponent(err?.message ?? "oauth_failed")}`);
  }
});

// ─── GET /api/payments/stripe/status ─────────────────────────────────────────

router.get("/stripe/status", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.json({
        connected: false,
        // Return publishable key even when not connected — needed to initialise
        // the embedded Connect provider before the account is linked.
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
      });
    }

    return res.json({
      connected:         true,
      providerAccountId: account.providerAccountId,
      status:            account.status,
      chargesEnabled:    account.chargesEnabled,
      payoutsEnabled:    account.payoutsEnabled,
      detailsSubmitted:  account.detailsSubmitted,
      displayName:       account.displayName,
      email:             account.email,
      country:           account.country,
      currency:          account.currency,
      lastSyncAt:        account.updatedAt,
      publishableKey:    process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    });
  } catch (err: any) {
    console.error("[stripeConnect/status]", err?.message);
    return res.status(500).json({ error: "Failed to fetch payment status" });
  }
});

// ─── POST /api/payments/stripe/account-session ────────────────────────────────
// Creates a short-lived Account Session secret for Stripe's embedded Connect
// components (ConnectAccountOnboarding, ConnectAccountManagement, etc.).
// Sessions expire after 60 minutes; @stripe/connect-js re-calls this endpoint
// automatically ~5 minutes before expiry — no client-side timer needed.
//
// Rate limiting note: each call creates one AccountSession on Stripe's API.
// Session refresh is handled by connect-js automatically so external callers
// should never need to call this more than once per page load.

router.post("/stripe/account-session", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe is not configured on this platform" });
  }

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({
        error: "No connected Stripe account. Complete the Connect flow first.",
      });
    }

    const stripe = getStripe();
    const session = await stripe.accountSessions.create({
      account: account.providerAccountId,
      components: {
        account_onboarding: { enabled: true },
        account_management: { enabled: true },
        notification_banner: { enabled: true },
        payments: {
          enabled: true,
          features: {
            refund_management:  true,
            dispute_management: true,
            capture_payments:   true,
          } as any,
        },
        payouts: {
          enabled: true,
          features: {
            instant_payouts:      true,
            standard_payouts:     true,
            edit_payout_schedule: true,
          } as any,
        },
        balances: { enabled: true } as any,
      },
    });

    console.log(
      `[stripeConnect/account-session] Created session for storeId=${storeId} ` +
      `account=${account.providerAccountId}`
    );

    return res.json({ clientSecret: session.client_secret });
  } catch (err: any) {
    console.error("[stripeConnect/account-session]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to create account session" });
  }
});

// ─── GET /api/payments/stripe/balance ────────────────────────────────────────

router.get("/stripe/balance", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "No connected Stripe account" });
    }
    if (!account.chargesEnabled) {
      return res.status(400).json({ error: "Stripe account not yet enabled for charges" });
    }

    const balance = await getConnectedAccountBalance(account.providerAccountId);
    return res.json(balance);
  } catch (err: any) {
    console.error("[stripeConnect/balance]", err?.message);
    return res.status(500).json({ error: "Failed to fetch balance" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  Payments & Payouts dashboard (Phase A) — read models over Certxa data
//  + minimal live Stripe (balance / next payout). Every route is guarded by
//  requireOwnerOrAdmin + resolveSessionStoreId, so a store can only ever see
//  its own data.
// ════════════════════════════════════════════════════════════════════════════

/** Parse the comma-separated `method:amount` tender string on an appointment. */
function parseTenders(paymentMethod: string | null | undefined, fallbackTotal: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!paymentMethod) { out["other"] = fallbackTotal; return out; }
  const parts = String(paymentMethod).split(",");
  let matched = false;
  for (const part of parts) {
    const [rawMethod, amtStr] = part.split(":");
    const method = (rawMethod || "").trim().toLowerCase();
    if (!method) continue;
    const amt = amtStr != null && amtStr !== "" ? Number(amtStr) : NaN;
    out[method] = (out[method] || 0) + (Number.isFinite(amt) ? amt : 0);
    matched = true;
  }
  if (!matched) { out[String(paymentMethod).trim().toLowerCase() || "other"] = fallbackTotal; }
  // If the tender amounts don't cover the total (e.g. label with no amount),
  // attribute the shortfall to the first method.
  const summed = Object.values(out).reduce((a, b) => a + b, 0);
  if (summed < fallbackTotal - 0.005) {
    const first = Object.keys(out)[0] ?? "other";
    out[first] = (out[first] || 0) + (fallbackTotal - summed);
  }
  return out;
}

/** Salon-local date-key math for period ranges. Returns UTC boundary Dates. */
async function resolvePeriod(storeId: number, period: string, fromISO?: string, toISO?: string) {
  const { getStoreTimezone, salonDayBoundaries, toSalonDateKey } = await import("../lib/timezone");
  const { subDays, startOfWeek, startOfMonth, subMonths, endOfMonth, format } = await import("date-fns");
  const tz = await getStoreTimezone(storeId);
  const todayKey = toSalonDateKey(new Date(), tz);
  const todayLocal = new Date(`${todayKey}T12:00:00`); // noon-anchored, DST-safe

  let startKey: string, endKey: string, label: string;
  switch (period) {
    case "yesterday": {
      const d = subDays(todayLocal, 1);
      startKey = endKey = format(d, "yyyy-MM-dd"); label = "Yesterday"; break;
    }
    case "week": {
      startKey = format(startOfWeek(todayLocal, { weekStartsOn: 1 }), "yyyy-MM-dd");
      endKey = todayKey; label = "This week"; break;
    }
    case "month": {
      startKey = format(startOfMonth(todayLocal), "yyyy-MM-dd");
      endKey = todayKey; label = "This month"; break;
    }
    case "lastmonth": {
      const lm = subMonths(todayLocal, 1);
      startKey = format(startOfMonth(lm), "yyyy-MM-dd");
      endKey = format(endOfMonth(lm), "yyyy-MM-dd"); label = "Last month"; break;
    }
    case "custom": {
      startKey = (fromISO || todayKey).slice(0, 10);
      endKey = (toISO || todayKey).slice(0, 10); label = "Custom"; break;
    }
    case "today":
    default:
      startKey = endKey = todayKey; label = "Today"; break;
  }
  const { dayStart } = salonDayBoundaries(startKey, tz);
  const { dayEnd } = salonDayBoundaries(endKey, tz);
  return { tz, from: dayStart, to: dayEnd, label, startKey, endKey };
}

/** Completed, paid appointments in [from,to], attributed by completedAt (fallback date). */
async function paidAppointmentsInRange(storeId: number, from: Date, to: Date) {
  const { storage } = await import("../storage");
  // Widen the fetch a little so completedAt (payment time) that spills past the
  // appointment's scheduled date is still captured, then filter precisely.
  const fetchFrom = new Date(from.getTime() - 3 * 24 * 3600 * 1000);
  const fetchTo = new Date(to.getTime() + 1 * 24 * 3600 * 1000);
  const appts = await storage.getAppointments({ storeId, from: fetchFrom, to: fetchTo });
  return (appts as any[]).filter((a) => {
    if (a.status !== "completed") return false;
    const paid = Number(a.totalPaid) || 0;
    if (paid <= 0) return false;
    const when = a.completedAt ? new Date(a.completedAt) : new Date(a.date);
    return when >= from && when <= to;
  });
}

// ─── GET /api/payments/overview ─────────────────────────────────────────────
router.get("/overview", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const period = String(req.query.period || "month");
    const cur = await resolvePeriod(storeId, period, String(req.query.from || ""), String(req.query.to || ""));

    // Buckets for the summary cards (today / week / month + prior-period compare).
    const [today, yesterday, week, month] = await Promise.all([
      resolvePeriod(storeId, "today"),
      resolvePeriod(storeId, "yesterday"),
      resolvePeriod(storeId, "week"),
      resolvePeriod(storeId, "month"),
    ]);
    const prevWeek = { from: new Date(week.from.getTime() - 7 * 864e5), to: new Date(week.from.getTime() - 1) };
    const lastMonth = await resolvePeriod(storeId, "lastmonth");

    const sum = (rows: any[]) => rows.reduce((t, a) => t + (Number(a.totalPaid) || 0), 0);
    const [todayRows, yRows, weekRows, prevWeekRows, monthRows, lastMonthRows, curRows] = await Promise.all([
      paidAppointmentsInRange(storeId, today.from, today.to),
      paidAppointmentsInRange(storeId, yesterday.from, yesterday.to),
      paidAppointmentsInRange(storeId, week.from, week.to),
      paidAppointmentsInRange(storeId, prevWeek.from, prevWeek.to),
      paidAppointmentsInRange(storeId, month.from, month.to),
      paidAppointmentsInRange(storeId, lastMonth.from, lastMonth.to),
      paidAppointmentsInRange(storeId, cur.from, cur.to),
    ]);

    const pct = (now: number, prev: number): number | null =>
      prev > 0 ? Math.round(((now - prev) / prev) * 1000) / 10 : null;

    const todaySales = sum(todayRows), weekSales = sum(weekRows), monthSales = sum(monthRows);

    // Refunds for the selected period, from the local audit trail.
    const refundRows = await pool.query<{ amount_cents: string }>(
      `SELECT amount_cents FROM payment_refunds
        WHERE store_id = $1 AND status <> 'canceled' AND created_at BETWEEN $2 AND $3`,
      [storeId, cur.from.toISOString(), cur.to.toISOString()],
    ).catch(() => ({ rows: [] as { amount_cents: string }[] }));
    const refundsTotal = refundRows.rows.reduce((t, r) => t + (Number(r.amount_cents) || 0), 0) / 100;

    // Live Stripe: pending payout + next payout date (best-effort, non-fatal).
    let pendingPayout: number | null = null;
    let nextPayout: { amount: number; arrivalDate: string | null } | null = null;
    const feesAvailable = false;
    const account = await getPaymentAccount(storeId);
    if (account && account.status !== "disconnected" && account.payoutsEnabled) {
      try {
        const stripe = getStripe();
        const bal = await stripe.balance.retrieve({}, { stripeAccount: account.providerAccountId });
        pendingPayout = bal.pending.reduce((t, b) => t + b.amount, 0) / 100;
        const pl = await stripe.payouts.list(
          { limit: 1, status: "pending" },
          { stripeAccount: account.providerAccountId },
        );
        const next = pl.data[0];
        if (next) {
          nextPayout = {
            amount: next.amount / 100,
            arrivalDate: next.arrival_date ? new Date(next.arrival_date * 1000).toISOString() : null,
          };
        }
      } catch (e: any) {
        console.warn("[payments/overview] stripe payout lookup failed:", e?.message);
      }
    }

    const gross = sum(curRows);
    return res.json({
      currency: account?.currency || "usd",
      cards: {
        today:  { amount: todaySales, comparePct: pct(todaySales, sum(yRows)), compareLabel: "vs yesterday" },
        week:   { amount: weekSales,  comparePct: pct(weekSales, sum(prevWeekRows)), compareLabel: "vs last week" },
        month:  { amount: monthSales, comparePct: pct(monthSales, sum(lastMonthRows)), compareLabel: "vs last month" },
        pendingPayout: { amount: pendingPayout, nextPayout },
      },
      salesOverview: {
        period: cur.label,
        from: cur.from.toISOString(),
        to: cur.to.toISOString(),
        transactionCount: curRows.length,
        gross,
        refunds: refundsTotal,
        fees: null,            // Phase B: derived from Stripe balance transactions
        feesAvailable,
        net: Math.round((gross - refundsTotal) * 100) / 100,
      },
    });
  } catch (err: any) {
    console.error("[payments/overview]", err?.message);
    return res.status(500).json({ error: "Failed to load payments overview" });
  }
});

// ─── GET /api/payments/transactions ────────────────────────────────────────
router.get("/transactions", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const period = String(req.query.period || "month");
    const { tz, from, to } = await resolvePeriod(storeId, period, String(req.query.from || ""), String(req.query.to || ""));
    const { formatInSalonTime } = await import("../lib/timezone");

    const search = String(req.query.search || "").trim().toLowerCase();
    const methodFilter = String(req.query.method || "").trim().toLowerCase();
    const staffFilter = req.query.staffId ? Number(req.query.staffId) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    let rows = await paidAppointmentsInRange(storeId, from, to);

    rows = rows.filter((a: any) => {
      if (staffFilter && a.staffId !== staffFilter) return false;
      if (methodFilter) {
        const tenders = Object.keys(parseTenders(a.paymentMethod, Number(a.totalPaid) || 0));
        if (!tenders.some((m) => m.includes(methodFilter))) return false;
      }
      if (search) {
        const hay = [
          a.customer?.fullName, a.customer?.name, (a as any).customerName,
          a.service?.name, a.staff?.name, String(a.id), a.stripePaymentIntentId,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    rows.sort((a: any, b: any) => {
      const ta = new Date(a.completedAt || a.date).getTime();
      const tb = new Date(b.completedAt || b.date).getTime();
      return tb - ta;
    });

    const total = rows.length;
    const page = rows.slice(offset, offset + limit).map((a: any) => {
      const totalPaid = Number(a.totalPaid) || 0;
      const tenders = parseTenders(a.paymentMethod, totalPaid);
      const methods = Object.keys(tenders);
      const paidAt = new Date(a.completedAt || a.date);
      return {
        id: a.id,
        customer: a.customer?.fullName || a.customer?.name || (a as any).customerName || "Walk-In",
        service: a.service?.name || "Service",
        staff: a.staff?.name || null,
        paidAt: paidAt.toISOString(),
        paidAtLabel: formatInSalonTime(paidAt, tz, "MMM d · h:mm a"),
        method: methods.length === 1 ? methods[0] : "split",
        methods,
        amount: totalPaid,
        tip: Number(a.tipAmount) || 0,
        discount: Number(a.discountAmount) || 0,
        status: "paid",
        stripePaymentIntentId: a.stripePaymentIntentId || null,
      };
    });

    return res.json({ items: page, total, offset, limit, hasMore: offset + limit < total });
  } catch (err: any) {
    console.error("[payments/transactions]", err?.message);
    return res.status(500).json({ error: "Failed to load transactions" });
  }
});

// ─── POST /api/payments/stripe/sync ──────────────────────────────────────────

router.post("/stripe/sync", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "No connected Stripe account found" });
    }

    const updated = await syncAccountFromStripe(storeId, account.providerAccountId);
    return res.json({
      connected:        true,
      chargesEnabled:   updated.charges_enabled,
      payoutsEnabled:   updated.payouts_enabled,
      detailsSubmitted: updated.details_submitted,
    });
  } catch (err: any) {
    console.error("[stripeConnect/sync]", err?.message);
    return res.status(500).json({ error: "Failed to sync account" });
  }
});

// ─── POST /api/payments/stripe/disconnect ────────────────────────────────────

router.post("/stripe/disconnect", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.json({ success: true, message: "No active connection to disconnect" });
    }

    await deauthorizeAccount(account.providerAccountId);
    await removePaymentAccount(storeId);

    console.log(`[stripeConnect] Disconnected account ${account.providerAccountId} from storeId=${storeId}`);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[stripeConnect/disconnect]", err?.message);
    return res.status(500).json({ error: "Failed to disconnect account" });
  }
});

// ─── GET  /api/payments/stripe/express-settings ──────────────────────────────
// Returns the store-level Stripe Express contractor payout settings.

router.get("/stripe/express-settings", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.json({
        contractorExpressEnabled: false,
        contractorPayoutMode: "manual",
        stripeConnected: false,
      });
    }

    return res.json({
      contractorExpressEnabled: account.contractorExpressEnabled ?? false,
      contractorPayoutMode:     account.contractorPayoutMode     ?? "manual",
      stripeConnected:          true,
    });
  } catch (err: any) {
    console.error("[stripeConnect/express-settings GET]", err?.message);
    return res.status(500).json({ error: "Failed to fetch express settings" });
  }
});

// ─── PUT  /api/payments/stripe/express-settings ──────────────────────────────
// Saves the store-level Stripe Express contractor payout settings.

router.put("/stripe/express-settings", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const { contractorExpressEnabled, contractorPayoutMode } = req.body as {
      contractorExpressEnabled?: boolean;
      contractorPayoutMode?: string;
    };

    if (contractorPayoutMode !== undefined && !["manual", "instant"].includes(contractorPayoutMode)) {
      return res.status(400).json({ error: "contractorPayoutMode must be 'manual' or 'instant'" });
    }

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "Connect a Stripe account before enabling Stripe Express payouts" });
    }

    const updates: Partial<typeof storePaymentAccounts.$inferInsert> = { updatedAt: new Date() };
    if (contractorExpressEnabled !== undefined) updates.contractorExpressEnabled = contractorExpressEnabled;
    if (contractorPayoutMode     !== undefined) updates.contractorPayoutMode     = contractorPayoutMode;

    await db.update(storePaymentAccounts)
      .set(updates)
      .where(eq(storePaymentAccounts.storeId, storeId));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[stripeConnect/express-settings PUT]", err?.message);
    return res.status(500).json({ error: "Failed to save express settings" });
  }
});

// ─── GET /api/payments/stripe/instant-transfer-failures ──────────────────────
// Returns recent failed instant contractor transfers for the store (last 30 days,
// up to 10), enriched with the contractor's name.

router.get("/stripe/instant-transfer-failures", async (req: Request, res: Response) => {
  if (!await requireOwnerOrAdmin(req, res)) return;

  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const rows = await db
      .select({
        id:            contractorInstantTransfers.id,
        contractorId:  contractorInstantTransfers.contractorId,
        firstName:     contractors.firstName,
        lastName:      contractors.lastName,
        amountCents:   contractorInstantTransfers.amountCents,
        failureReason: contractorInstantTransfers.failureReason,
        appointmentId: contractorInstantTransfers.appointmentId,
        createdAt:     contractorInstantTransfers.createdAt,
      })
      .from(contractorInstantTransfers)
      .leftJoin(contractors, eq(contractors.id, contractorInstantTransfers.contractorId))
      .where(
        and(
          eq(contractorInstantTransfers.storeId, storeId),
          eq(contractorInstantTransfers.status, "failed"),
          sql`${contractorInstantTransfers.createdAt} >= NOW() - INTERVAL '30 days'`
        )
      )
      .orderBy(desc(contractorInstantTransfers.createdAt))
      .limit(10);

    return res.json({ failures: rows });
  } catch (err: any) {
    console.error("[stripeConnect/instant-transfer-failures]", err?.message);
    return res.status(500).json({ error: "Failed to fetch transfer failures" });
  }
});

// ─── GET /api/payments/terminal/location ─────────────────────────────────────
// Returns a Stripe Terminal location ID for this store, creating one if needed.
// Used by the native Android POS app when connecting a Bluetooth or Tap-to-Pay reader.

router.get("/terminal/location", async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "Store has no connected Stripe account" });
    }

    const stripe = getStripe();

    // Look for an existing location tagged with this storeId
    const { data: existing } = await stripe.terminal.locations.list(
      { limit: 100 },
      { stripeAccount: account.providerAccountId }
    );
    const found = existing.find(l => l.metadata?.certxa_store_id === String(storeId));
    if (found) return res.json({ locationId: found.id });

    // Fetch store info for the address
    const storeRow = await pool.query<{ name: string; address: string | null; city: string | null; state: string | null; postcode: string | null }>(
      `SELECT name, address, city, state, postcode FROM locations WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    const store = storeRow.rows[0];
    if (!store) return res.status(404).json({ error: "Store not found" });

    const location = await stripe.terminal.locations.create(
      {
        display_name: `${store.name} — POS`,
        address: {
          line1:       store.address   || "123 Main St",
          city:        store.city      || "Unknown",
          state:       store.state     || "CA",
          postal_code: store.postcode  || "00000",
          country:     "US",
        },
        metadata: { certxa_store_id: String(storeId) },
      },
      { stripeAccount: account.providerAccountId }
    );
    return res.json({ locationId: location.id });
  } catch (err: any) {
    console.error("[terminal/location]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to get terminal location" });
  }
});

// ─── POST /api/payments/terminal/connection-token ────────────────────────────

router.post("/terminal/connection-token", async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "Store has no connected Stripe account" });
    }

    const secret = await createTerminalConnectionToken(account.providerAccountId);
    return res.json({ secret });
  } catch (err: any) {
    console.error("[terminal/connection-token]", err?.message);
    return res.status(500).json({ error: "Failed to create connection token" });
  }
});

// ─── POST /api/payments/terminal/create-payment-intent ───────────────────────

router.post("/terminal/create-payment-intent", async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const { amountCents, currency = "usd", appointmentId, clientName } = req.body;

    if (!amountCents || isNaN(Number(amountCents)) || Number(amountCents) <= 0) {
      return res.status(400).json({ error: "amountCents must be a positive number" });
    }

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "Store has no connected Stripe account" });
    }
    if (!account.chargesEnabled) {
      return res.status(400).json({ error: "Stripe account not yet enabled for charges" });
    }

    const metadata: Record<string, string> = {
      store_id: String(storeId),
      source:   "certxa_pos",
    };
    if (appointmentId) metadata.appointment_id = String(appointmentId);
    if (clientName)    metadata.client_name    = String(clientName);

    const pi = await createTerminalPaymentIntent(
      account.providerAccountId,
      Number(amountCents),
      currency,
      metadata
    );

    return res.json({
      clientSecret:      pi.client_secret,
      paymentIntentId:   pi.id,
      amount:            pi.amount,
      currency:          pi.currency,
    });
  } catch (err: any) {
    console.error("[terminal/create-payment-intent]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to create payment intent" });
  }
});

// ─── Instant contractor payout (Uber-like) ───────────────────────────────────
// Fires immediately after a Terminal payment is captured. Transfers the
// contractor's commission from the platform Stripe balance to their Express
// account. Totally fire-and-forget — never blocks the capture response.

async function fireInstantContractorTransfer(
  storeId: number,
  pi: { id: string; amount: number; currency: string; metadata?: Record<string, string> | null }
): Promise<void> {
  if (!isStripeConfigured()) return;

  // Check store-level Stripe Express setting — if disabled or payout mode is
  // 'manual', instant contractor transfers are not fired from this store.
  const salonPaymentAccount = await getPaymentAccount(storeId);
  if (
    !salonPaymentAccount?.contractorExpressEnabled ||
    (salonPaymentAccount.contractorPayoutMode ?? "manual") !== "instant"
  ) return;

  const metaApptId = pi.metadata?.appointment_id;
  if (!metaApptId) return;

  const apptId = parseInt(metaApptId, 10);
  if (isNaN(apptId)) return;

  // Appointment → staffId
  const [appt] = await db
    .select({ staffId: appointments.staffId })
    .from(appointments)
    .where(eq(appointments.id, apptId));
  if (!appt?.staffId) return;

  // Idempotency guard — bail early if we already processed this PaymentIntent.
  // Prevents double-pay on retries, webhook replays, or concurrent capture calls.
  const [existing] = await db
    .select({ id: contractorInstantTransfers.id })
    .from(contractorInstantTransfers)
    .where(eq(contractorInstantTransfers.paymentIntentId, pi.id));
  if (existing) return;

  // staffId → contractor with verified Express account, scoped to THIS store
  const [contractor] = await db
    .select()
    .from(contractors)
    .where(and(eq(contractors.staffId, appt.staffId), eq(contractors.storeId, storeId)));

  if (
    !contractor?.stripeAccountId ||
    contractor.onboardingStatus !== "complete" ||
    !contractor.bankVerified
  ) return;

  // Only fire for contractors configured for instant payouts.
  // ACH contractors are paid via batch payout runs — never both paths.
  if (contractor.payoutMethod !== "instant") return;

  const commissionRate = parseFloat(String(contractor.commissionRate ?? "0"));
  if (!commissionRate || commissionRate <= 0) return;

  const commissionCents = Math.floor(pi.amount * commissionRate / 100);
  if (commissionCents < 50) return; // Stripe minimum transfer = $0.50

  // salonPaymentAccount already loaded above for the Express gate check.
  // Reuse it here instead of issuing a second DB round-trip.
  if (!salonPaymentAccount.providerAccountId) return; // Salon hasn't connected Stripe
  const salonAccount = salonPaymentAccount;

  let stripeTransferId: string | null = null;
  let status: "succeeded" | "failed" = "succeeded";
  let failureReason: string | null = null;

  try {
    const stripe = getStripe();
    // Transfer FROM salon's connected Standard account TO contractor's Express account.
    // stripeAccount makes the API call on behalf of the salon.
    const transfer = await stripe.transfers.create(
      {
        amount:      commissionCents,
        currency:    pi.currency || "usd",
        destination: contractor.stripeAccountId,
        metadata: {
          appointment_id:    metaApptId,
          contractor_id:     String(contractor.id),
          store_id:          String(storeId),
          payment_intent_id: pi.id,
          source:            "certxa_instant_payout",
        },
      },
      {
        stripeAccount:  salonAccount.providerAccountId,
        idempotencyKey: `instant-${pi.id}-contractor-${contractor.id}`,
      }
    );
    stripeTransferId = transfer.id;
    console.log(
      `[instant-transfer] Sent ${(commissionCents / 100).toFixed(2)} → contractor ${contractor.id} (${transfer.id})`
    );
  } catch (err: any) {
    status = "failed";
    failureReason = err?.message ?? "Transfer failed";
    console.error("[instant-transfer] Stripe error:", failureReason);
  }

  // Record regardless of success/failure for full audit trail
  await db.insert(contractorInstantTransfers).values({
    contractorId:       contractor.id,
    storeId,
    appointmentId:      apptId,
    paymentIntentId:    pi.id,
    stripeTransferId,
    amountCents:        commissionCents,
    commissionRate:     String(commissionRate),
    serviceAmountCents: pi.amount,
    status,
    failureReason,
  });
}

// ─── Commission Reserve (background, batch-mode contractors only) ─────────────
// When a payment is captured, record a pending commission so the salon's
// available balance reflects the reservation immediately. Instant-mode
// contractors are excluded — they're paid at capture via fireInstantContractorTransfer.

async function recordCommissionReserve(
  storeId: number,
  paymentIntentId: string,
  appointmentId: number,
  amountCents: number,
): Promise<void> {
  try {
    // Appointment → staffId
    const [appt] = await db
      .select({ staffId: appointments.staffId })
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    if (!appt?.staffId) return;

    // staffId → contractor (scoped to this store)
    const [contractor] = await db
      .select()
      .from(contractors)
      .where(and(eq(contractors.staffId, appt.staffId), eq(contractors.storeId, storeId)));
    if (!contractor) return;

    // Skip instant contractors — their commission is transferred immediately at capture
    if (contractor.payoutMethod === "instant") return;

    const commissionRate = parseFloat(String(contractor.commissionRate ?? "0"));
    if (!commissionRate || commissionRate <= 0) return;

    const commissionCents = Math.floor(amountCents * commissionRate / 100);
    if (commissionCents <= 0) return;

    // Next Friday as default payout date
    const today = new Date();
    const dow   = today.getDay();
    const daysUntilFriday = (5 - dow + 7) % 7 || 7;
    const scheduledDate = new Date(today.getTime() + daysUntilFriday * 86_400_000);
    const scheduled = scheduledDate.toISOString().slice(0, 10);
    const earned    = today.toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO contractor_commissions
         (store_id, contractor_id, appointment_id, amount, status,
          earned_date, scheduled_payout_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW(), NOW())
       ON CONFLICT (appointment_id, contractor_id) WHERE appointment_id IS NOT NULL
       DO NOTHING`,
      [storeId, contractor.id, appointmentId, commissionCents, earned, scheduled]
    );
    console.log(
      `[commission-reserve] Recorded $${(commissionCents / 100).toFixed(2)} ` +
      `pending for contractor ${contractor.id} (appt ${appointmentId}), payout ${scheduled}`
    );
  } catch (err: any) {
    console.error("[commission-reserve] Error:", err?.message);
  }
}

// ─── POST /api/payments/terminal/capture-payment-intent ──────────────────────

router.post("/terminal/capture-payment-intent", async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const { paymentIntentId, method } = req.body;
    if (!paymentIntentId) return res.status(400).json({ error: "paymentIntentId is required" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "Store has no connected Stripe account" });
    }

    const pi = await captureTerminalPaymentIntent(account.providerAccountId, paymentIntentId);

    // ── Record payment to appointment DB immediately on successful capture ──
    // This is the authoritative recording path for Terminal (M2 / Tap to Pay)
    // payments.  The client-side __certxaFinalizeAppointment call is a
    // belt-and-suspenders update that may also run later — the second write is
    // idempotent so double-recording is safe.
    const metaApptId = pi.metadata?.appointment_id;
    if (metaApptId) {
      const apptId = parseInt(metaApptId, 10);
      if (!isNaN(apptId)) {
        const totalPaid = (pi.amount / 100).toFixed(2);
        const paymentMethod = (method as string) || "card";
        try {
          // Freeze service price + commission rate on first completion (no-op
          // if the follow-up client PATCH already recorded it).
          const snap = await snapshotCompletionFields(apptId);
          const [completedApt] = await db.update(appointments).set({
            status:        "completed",
            paymentMethod,
            totalPaid,
            completedAt:   new Date(),
            ...(snap.servicePrice   !== undefined ? { servicePrice:   snap.servicePrice }   : {}),
            ...(snap.commissionRate !== undefined ? { commissionRate: snap.commissionRate } : {}),
          }).where(eq(appointments.id, apptId)).returning();
          console.log(`[terminal/capture] Appointment ${apptId} marked completed — ${totalPaid} via ${paymentMethod}`);
          if (completedApt) void recordCommissionAccrual(completedApt).catch(() => {});

          // ── Log activity events immediately so the dashboard updates ──────────
          // Fire-and-forget: a logging failure must never block the payment response.
          void (async () => {
            try {
              // Fetch customer + service names for the activity message
              const [apt] = await db
                .select({
                  customerId: appointments.customerId,
                  serviceId:  appointments.serviceId,
                })
                .from(appointments)
                .where(eq(appointments.id, apptId))
                .limit(1);

              let customerName = "A client";
              let serviceName  = "service";

              if (apt?.customerId) {
                const [c] = await db.select({ fullName: clients.fullName })
                  .from(clients).where(eq(clients.id, apt.customerId)).limit(1);
                if (c?.fullName) customerName = c.fullName;
              }
              if (apt?.serviceId) {
                const [s] = await db.select({ name: services.name })
                  .from(services).where(eq(services.id, apt.serviceId)).limit(1);
                if (s?.name) serviceName = s.name;
              }

              const amountNum = parseFloat(totalPaid);

              // "A client completed Acrylic Full Set" — matches web POS event shape
              await logActivityEvent({
                storeId,
                eventType: "service_completed",
                message:   `${customerName} completed ${serviceName}`,
                amount:    amountNum,
              });

              // "$80.25 payment processed" — shows up in Recent Activity amount column
              await logActivityEvent({
                storeId,
                eventType: "payment",
                message:   `${amountNum.toFixed(2)} payment processed`,
                amount:    amountNum,
              });
            } catch (logErr: any) {
              console.error("[terminal/capture] Activity log error:", logErr?.message);
            }
          })();
        } catch (dbErr: any) {
          // Log but don't fail the response — the payment was captured in Stripe.
          // The client-side finalize will attempt the DB update as a fallback.
          console.error(`[terminal/capture] DB update failed for appointment ${apptId}:`, dbErr?.message);
        }
      }
    }

    // Instant contractor payout — fire-and-forget so it never delays the response
    fireInstantContractorTransfer(storeId, pi).catch(err =>
      console.error("[instant-transfer] Unhandled background error:", err?.message)
    );

    // Commission reserve — fire-and-forget: records a pending commission in
    // contractor_commissions so the salon balance reflects the reservation.
    // Only fires for batch/ACH contractors (instant-mode are paid immediately above).
    const captureApptId = metaApptId ? parseInt(metaApptId, 10) : null;
    if (captureApptId && !isNaN(captureApptId)) {
      recordCommissionReserve(storeId, pi.id, captureApptId, pi.amount).catch(err =>
        console.error("[commission-reserve] Unhandled background error:", err?.message)
      );
    }

    return res.json({
      success:          true,
      paymentIntentId:  pi.id,
      status:           pi.status,
      amount:           pi.amount,
    });
  } catch (err: any) {
    console.error("[terminal/capture]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to capture payment" });
  }
});

// ─── POST /api/payments/terminal/reader/register ─────────────────────────────
// One-time step to link a physical M2 reader to this store's Terminal Location,
// using the registration code printed on/with the reader (~24 h validity).
// body: { registrationCode: string; label?: string }

router.post("/terminal/reader/register", async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const { registrationCode, label } = req.body ?? {};
    if (!registrationCode || typeof registrationCode !== "string") {
      return res.status(400).json({ error: "registrationCode is required" });
    }

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "Store has no connected Stripe account" });
    }

    // Reuse the same location-fetch logic as the GET /terminal/location route:
    // look for an existing location tagged with this storeId, create one if missing.
    const stripe = getStripe();
    const { data: existing } = await stripe.terminal.locations.list(
      { limit: 100 },
      { stripeAccount: account.providerAccountId }
    );
    let location = existing.find(l => l.metadata?.certxa_store_id === String(storeId));

    if (!location) {
      const storeRow = await pool.query<{ name: string; address: string | null; city: string | null; state: string | null; postcode: string | null }>(
        `SELECT name, address, city, state, postcode FROM locations WHERE id = $1 LIMIT 1`,
        [storeId]
      );
      const store = storeRow.rows[0];
      if (!store) return res.status(404).json({ error: "Store not found" });

      location = await stripe.terminal.locations.create(
        {
          display_name: `${store.name} — POS`,
          address: {
            line1:       store.address   || "123 Main St",
            city:        store.city      || "Unknown",
            state:       store.state     || "CA",
            postal_code: store.postcode  || "00000",
            country:     "US",
          },
          metadata: { certxa_store_id: String(storeId) },
        },
        { stripeAccount: account.providerAccountId }
      );
    }

    const reader = await stripe.terminal.readers.create(
      {
        registration_code: registrationCode,
        location: location.id,
        ...(label ? { label } : {}),
      },
      { stripeAccount: account.providerAccountId }
    );

    return res.json({
      readerId:     reader.id,
      label:        reader.label,
      serialNumber: reader.serial_number,
    });
  } catch (err: any) {
    console.error("[terminal/reader/register]", err?.message);
    // Stripe returns clear messages for expired/already-used codes — surface them.
    return res.status(400).json({ error: err?.message ?? "Failed to register reader" });
  }
});

// ─── GET /api/payments/terminal/reader/list ───────────────────────────────────
// Lists readers already registered to this store's Terminal Location.

router.get("/terminal/reader/list", async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "Store has no connected Stripe account" });
    }

    const stripe = getStripe();
    const { data: locations } = await stripe.terminal.locations.list(
      { limit: 100 },
      { stripeAccount: account.providerAccountId }
    );
    const location = locations.find(l => l.metadata?.certxa_store_id === String(storeId));
    if (!location) return res.json({ readers: [] });

    const { data: readers } = await stripe.terminal.readers.list(
      { location: location.id, limit: 20 },
      { stripeAccount: account.providerAccountId }
    );

    return res.json({
      readers: readers.map(r => ({
        id:           r.id,
        label:        r.label,
        serialNumber: (r as any).serial_number,
        status:       r.status,
        deviceType:   r.device_type,
      })),
    });
  } catch (err: any) {
    console.error("[terminal/reader/list]", err?.message);
    return res.status(500).json({ error: "Failed to list readers" });
  }
});

// ─── POST /api/payments/terminal/cancel-payment-intent ───────────────────────

router.post("/terminal/cancel-payment-intent", async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(400).json({ error: "No store found" });

    const { paymentIntentId } = req.body;
    if (!paymentIntentId) return res.status(400).json({ error: "paymentIntentId is required" });

    const account = await getPaymentAccount(storeId);
    if (!account || account.status === "disconnected") {
      return res.status(400).json({ error: "No connected account" });
    }

    await cancelTerminalPaymentIntent(account.providerAccountId, paymentIntentId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[terminal/cancel]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to cancel payment intent" });
  }
});

export default router;

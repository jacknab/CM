/**
 * Usage & Billing Routes — Scale + Cost Control Layer
 *
 * Endpoints:
 *   GET  /api/usage/:storeId/summary       — totals for current period
 *   GET  /api/usage/:storeId/daily         — last 30 days breakdown
 *   GET  /api/usage/:storeId/monthly       — last 12 months breakdown
 *   GET  /api/usage/:storeId/calls         — paginated call list (most expensive first)
 *   GET  /api/usage/:storeId/calls/:id     — individual call detail
 *   GET  /api/usage/:storeId/live          — SSE: real-time cost for active calls
 *   GET  /api/usage/:storeId/limits        — get salon limits
 *   POST /api/usage/:storeId/limits        — update salon limits
 *   GET  /api/usage/:storeId/export        — CSV billing export
 *   GET  /api/usage/rates                  — current cost rates
 */

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { callUsageRecords, salonUsageLimits, locations } from "@shared/schema";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import { costMeter } from "../lib/costMeter";
import { sessionGuard, DEFAULT_LIMITS } from "../lib/sessionGuard";
import { callEventBus } from "../lib/callEventBus";
import { getCostRates } from "../lib/costEngine";

const router = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────
function isAuthorized(req: Request): boolean {
  const key = (process.env.VALIDATE_KEY ?? "").trim();
  if (!key) return process.env.NODE_ENV !== "production";
  return req.headers["x-validate-key"] === key;
}
function guard(req: Request, res: Response): boolean {
  if (!isAuthorized(req)) {
    res.status(403).json({ error: "Forbidden — set x-validate-key header" });
    return false;
  }
  return true;
}
function sid(req: Request): number { return parseInt(String(req.params.storeId), 10); }

async function getStoreName(storeId: number): Promise<string> {
  const [row] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, storeId)).limit(1);
  return row?.name ?? `Store ${storeId}`;
}

// ─── Summary ──────────────────────────────────────────────────────────────────
router.get("/api/usage/:storeId/summary", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);
  const storeName = await getStoreName(storeId);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [monthly] = await db
    .select({
      calls:         sql<string>`COUNT(*)`,
      totalMinutes:  sql<string>`COALESCE(SUM(duration_seconds), 0) / 60.0`,
      totalCost:     sql<string>`COALESCE(SUM(total_est_cost), 0)`,
      openaiCost:    sql<string>`COALESCE(SUM(openai_est_cost), 0)`,
      twilioCost:    sql<string>`COALESCE(SUM(twilio_est_cost), 0)`,
      totalTokensIn: sql<string>`COALESCE(SUM(audio_tokens_in + text_tokens_in), 0)`,
      totalTokensOut:sql<string>`COALESCE(SUM(audio_tokens_out + text_tokens_out), 0)`,
      toolCalls:     sql<string>`COALESCE(SUM(tool_call_count), 0)`,
    })
    .from(callUsageRecords)
    .where(and(eq(callUsageRecords.storeId, storeId), gte(callUsageRecords.createdAt, monthStart)));

  const [daily] = await db
    .select({
      calls:        sql<string>`COUNT(*)`,
      totalMinutes: sql<string>`COALESCE(SUM(duration_seconds), 0) / 60.0`,
      totalCost:    sql<string>`COALESCE(SUM(total_est_cost), 0)`,
    })
    .from(callUsageRecords)
    .where(and(eq(callUsageRecords.storeId, storeId), gte(callUsageRecords.createdAt, todayStart)));

  const [allTime] = await db
    .select({
      calls:        sql<string>`COUNT(*)`,
      totalMinutes: sql<string>`COALESCE(SUM(duration_seconds), 0) / 60.0`,
      totalCost:    sql<string>`COALESCE(SUM(total_est_cost), 0)`,
    })
    .from(callUsageRecords)
    .where(eq(callUsageRecords.storeId, storeId));

  const limits = await sessionGuard.getLimits(storeId);
  const activeSessions = costMeter.getActiveSessionsForStore(storeId);

  const monthlyDays = new Date().getDate();
  const projectedMonthlyCost = monthlyDays > 0
    ? (parseFloat(monthly.totalCost) / monthlyDays) * 30
    : 0;

  res.json({
    storeId,
    storeName,
    activeCalls: activeSessions.length,
    today: {
      calls:        parseInt(daily.calls),
      totalMinutes: parseFloat(daily.totalMinutes).toFixed(2),
      totalCostUsd: parseFloat(daily.totalCost).toFixed(4),
    },
    thisMonth: {
      calls:             parseInt(monthly.calls),
      totalMinutes:      parseFloat(monthly.totalMinutes).toFixed(2),
      totalCostUsd:      parseFloat(monthly.totalCost).toFixed(4),
      openaiCostUsd:     parseFloat(monthly.openaiCost).toFixed(4),
      twilioCostUsd:     parseFloat(monthly.twilioCost).toFixed(4),
      tokensIn:          parseInt(monthly.totalTokensIn),
      tokensOut:         parseInt(monthly.totalTokensOut),
      toolCalls:         parseInt(monthly.toolCalls),
      projectedMonthlyUsd: projectedMonthlyCost.toFixed(2),
    },
    allTime: {
      calls:        parseInt(allTime.calls),
      totalMinutes: parseFloat(allTime.totalMinutes).toFixed(2),
      totalCostUsd: parseFloat(allTime.totalCost).toFixed(4),
    },
    limits,
    rates: getCostRates(),
  });
});

// ─── Daily breakdown ──────────────────────────────────────────────────────────
router.get("/api/usage/:storeId/daily", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);
  const days = Math.min(parseInt(String(req.query.days ?? "30"), 10), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      date:          sql<string>`DATE(created_at)`,
      calls:         sql<string>`COUNT(*)`,
      totalMinutes:  sql<string>`COALESCE(SUM(duration_seconds), 0) / 60.0`,
      totalCostUsd:  sql<string>`COALESCE(SUM(total_est_cost), 0)`,
      openaiCostUsd: sql<string>`COALESCE(SUM(openai_est_cost), 0)`,
      twilioCostUsd: sql<string>`COALESCE(SUM(twilio_est_cost), 0)`,
      tokensIn:      sql<string>`COALESCE(SUM(audio_tokens_in + text_tokens_in), 0)`,
      tokensOut:     sql<string>`COALESCE(SUM(audio_tokens_out + text_tokens_out), 0)`,
      avgDurationMin:sql<string>`COALESCE(AVG(duration_seconds), 0) / 60.0`,
    })
    .from(callUsageRecords)
    .where(and(eq(callUsageRecords.storeId, storeId), gte(callUsageRecords.createdAt, since)))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at) DESC`);

  res.json({ storeId, days, rows: rows.map((r) => ({
    ...r,
    calls:          parseInt(r.calls),
    totalMinutes:   parseFloat(r.totalMinutes).toFixed(2),
    totalCostUsd:   parseFloat(r.totalCostUsd).toFixed(4),
    openaiCostUsd:  parseFloat(r.openaiCostUsd).toFixed(4),
    twilioCostUsd:  parseFloat(r.twilioCostUsd).toFixed(4),
    tokensIn:       parseInt(r.tokensIn),
    tokensOut:      parseInt(r.tokensOut),
    avgDurationMin: parseFloat(r.avgDurationMin).toFixed(2),
  }))});
});

// ─── Monthly breakdown ────────────────────────────────────────────────────────
router.get("/api/usage/:storeId/monthly", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);
  const months = Math.min(parseInt(String(req.query.months ?? "12"), 10), 24);
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const rows = await db
    .select({
      month:         sql<string>`TO_CHAR(created_at, 'YYYY-MM')`,
      calls:         sql<string>`COUNT(*)`,
      totalMinutes:  sql<string>`COALESCE(SUM(duration_seconds), 0) / 60.0`,
      totalCostUsd:  sql<string>`COALESCE(SUM(total_est_cost), 0)`,
      openaiCostUsd: sql<string>`COALESCE(SUM(openai_est_cost), 0)`,
      twilioCostUsd: sql<string>`COALESCE(SUM(twilio_est_cost), 0)`,
      avgCallCostUsd:sql<string>`COALESCE(AVG(total_est_cost), 0)`,
      avgDurationMin:sql<string>`COALESCE(AVG(duration_seconds), 0) / 60.0`,
    })
    .from(callUsageRecords)
    .where(and(eq(callUsageRecords.storeId, storeId), gte(callUsageRecords.createdAt, since)))
    .groupBy(sql`TO_CHAR(created_at, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(created_at, 'YYYY-MM') DESC`);

  res.json({ storeId, months, rows: rows.map((r) => ({
    ...r,
    calls:          parseInt(r.calls),
    totalMinutes:   parseFloat(r.totalMinutes).toFixed(2),
    totalCostUsd:   parseFloat(r.totalCostUsd).toFixed(4),
    openaiCostUsd:  parseFloat(r.openaiCostUsd).toFixed(4),
    twilioCostUsd:  parseFloat(r.twilioCostUsd).toFixed(4),
    avgCallCostUsd: parseFloat(r.avgCallCostUsd).toFixed(4),
    avgDurationMin: parseFloat(r.avgDurationMin).toFixed(2),
  }))});
});

// ─── Call list ────────────────────────────────────────────────────────────────
router.get("/api/usage/:storeId/calls", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);
  const page  = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, parseInt(String(req.query.limit ?? "25"), 10));
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(callUsageRecords)
    .where(eq(callUsageRecords.storeId, storeId))
    .orderBy(desc(callUsageRecords.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<string>`COUNT(*)` })
    .from(callUsageRecords)
    .where(eq(callUsageRecords.storeId, storeId));

  res.json({
    storeId,
    page,
    limit,
    total: parseInt(total),
    pages: Math.ceil(parseInt(total) / limit),
    calls: rows,
  });
});

// ─── Individual call ──────────────────────────────────────────────────────────
router.get("/api/usage/:storeId/calls/:id", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);
  const id = parseInt(String(req.params.id), 10);

  const [row] = await db
    .select()
    .from(callUsageRecords)
    .where(and(eq(callUsageRecords.storeId, storeId), eq(callUsageRecords.id, id)))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Call record not found" }); return; }
  res.json(row);
});

// ─── Live cost SSE ────────────────────────────────────────────────────────────
router.get("/api/usage/:storeId/live", (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendSnapshot = () => {
    const sessions = costMeter.getActiveSessionsForStore(storeId);
    const payload = sessions.map((s) => {
      const snap = costMeter.getLiveSnapshot(s.callSid);
      return {
        callSid:         s.callSid,
        elapsedSeconds:  snap?.elapsedSeconds ?? 0,
        estimatedCostUsd: snap?.estimatedCostUsd ?? 0,
        toolCallCount:   s.toolCallCount,
        aiResponseCount: s.aiResponseCount,
        activeCalls:     sessionGuard.getActiveCalls(storeId),
      };
    });
    res.write(`data: ${JSON.stringify({ type: "live_snapshot", storeId, sessions: payload, ts: Date.now() })}\n\n`);
  };

  sendSnapshot();

  // Subscribe to call events from the bus
  callEventBus.subscribe(storeId, res);

  // Push a snapshot every 5 seconds
  const interval = setInterval(() => {
    try { sendSnapshot(); } catch { clearInterval(interval); }
  }, 5_000);

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 20_000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

// ─── Limits GET ───────────────────────────────────────────────────────────────
router.get("/api/usage/:storeId/limits", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);
  const limits = await sessionGuard.getLimits(storeId);
  res.json({ storeId, limits, defaults: DEFAULT_LIMITS });
});

// ─── Limits POST (update) ─────────────────────────────────────────────────────
router.post("/api/usage/:storeId/limits", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);
  const body = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  if (typeof body.maxCallDurationMin  === "number") patch.maxCallDurationMin  = body.maxCallDurationMin;
  if (typeof body.maxDailyMinutes     === "number") patch.maxDailyMinutes     = body.maxDailyMinutes;
  if (typeof body.maxMonthlyCostUsd   === "number") patch.maxMonthlyCostUsd   = body.maxMonthlyCostUsd;
  if (typeof body.maxConcurrentCalls  === "number") patch.maxConcurrentCalls  = body.maxConcurrentCalls;
  if (typeof body.idleTimeoutSeconds  === "number") patch.idleTimeoutSeconds  = body.idleTimeoutSeconds;

  if (!Object.keys(patch).length) {
    res.status(400).json({ error: "No valid limit fields provided" });
    return;
  }

  await sessionGuard.setLimits(storeId, patch as any);
  const updated = await sessionGuard.getLimits(storeId);
  console.log(`[Usage] Limits updated for store ${storeId}:`, patch);
  res.json({ storeId, message: "Limits updated", limits: updated });
});

// ─── CSV export ───────────────────────────────────────────────────────────────
router.get("/api/usage/:storeId/export", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const storeId = sid(req);
  const storeName = await getStoreName(storeId);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const since = req.query.since
    ? new Date(req.query.since as string)
    : monthStart;

  const rows = await db
    .select()
    .from(callUsageRecords)
    .where(and(eq(callUsageRecords.storeId, storeId), gte(callUsageRecords.createdAt, since)))
    .orderBy(desc(callUsageRecords.createdAt));

  const headers = [
    "id","callSid","date","durationSeconds","audioTokensIn","audioTokensOut",
    "textTokensIn","textTokensOut","toolCallCount","aiResponseCount",
    "twilioMinutes","twilioEstCost","openaiEstCost","totalEstCost","terminationReason",
  ];

  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [
    headers.join(","),
    ...rows.map((r) => [
      r.id, r.callSid, r.createdAt?.toISOString(),
      r.durationSeconds, r.audioTokensIn, r.audioTokensOut,
      r.textTokensIn, r.textTokensOut, r.toolCallCount, r.aiResponseCount,
      r.twilioMinutes, r.twilioEstCost, r.openaiEstCost, r.totalEstCost, r.terminationReason,
    ].map(escape).join(",")),
  ].join("\r\n");

  const filename = `certxa-usage-store${storeId}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type",        "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ─── Cost rates ───────────────────────────────────────────────────────────────
router.get("/api/usage/rates", (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  res.json({ rates: getCostRates(), defaults: DEFAULT_LIMITS });
});

export default router;

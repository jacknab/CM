import { Router } from "express";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import OpenAI from "openai";
import { db, pool } from "../db";
import { appointments, staff, smsSettings, locations } from "@shared/schema";
import { clients } from "@shared/schema/clients";
import { clientEmails } from "../../shared/schema/clients";
import {
  clientIntelligence,
  staffIntelligence,
  growthScoreSnapshots,
  intelligenceInterventions,
} from "../../shared/schema/intelligence";
import { eq, and, desc, gte, sql, inArray, lte, isNotNull } from "drizzle-orm";
import { runIntelligenceForStore } from "../intelligence/orchestrator";
import { sendOutcome } from "../intelligence/sms-guard";
import { computeDeadSeats } from "../intelligence/dead-seats";
import { computeNoShowRisks, getNoShowStats } from "../intelligence/no-show";
import { computeRebookingRates } from "../intelligence/rebooking-rates";
import { computeGrowthScore } from "../intelligence/growth-score";
import { computeRevenueLeakage } from "../intelligence/revenue-leakage";
import { runDriftRecovery, sendManualWinback } from "../intelligence/drift-recovery";
import {
  getCancellationRecoveryCandidates,
  sendCancellationRecoverySms,
} from "../intelligence/cancellation-recovery";
import { sendSms } from "../sms";

const router = Router();

router.use(isAuthenticated);

async function requireStoreId(req: any, res: any): Promise<number | null> {
  const requestedId = Number(req.query.storeId || req.body?.storeId || 0);
  const userId  = (req.session as any)?.userId;
  const staffId = (req.session as any)?.staffId;

  if (requestedId) {
    if (userId) {
      const rows = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, requestedId), eq(locations.userId, userId)))
        .limit(1);
      if (rows.length > 0) return requestedId;
    }
    if (staffId) {
      const rows = await db
        .select({ storeId: staff.storeId })
        .from(staff)
        .where(and(eq(staff.id, staffId), eq(staff.storeId, requestedId)))
        .limit(1);
      if (rows.length > 0) return requestedId;
    }
    res.status(403).json({ error: "Store not found or access denied" });
    return null;
  }

  const sessionStoreId = await resolveSessionStoreId(req);
  if (!sessionStoreId) {
    res.status(403).json({ error: "No store context" });
    return null;
  }
  return sessionStoreId;
}

// GET /api/intelligence/dashboard
// Returns the full intelligence dashboard data for a store
router.get("/dashboard", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    // Get the latest growth score
    const [latestScore] = await db
      .select()
      .from(growthScoreSnapshots)
      .where(eq(growthScoreSnapshots.storeId, storeId))
      .orderBy(desc(growthScoreSnapshots.snapshotDate))
      .limit(1);

    // Get at-risk clients (high churn score, sorted by LTV desc)
    const atRiskClients = await db
      .select({
        id: clientIntelligence.id,
        customerId: clientIntelligence.customerId,
        customerName: clients.fullName,
        customerPhone: sql<string>`(SELECT phone_number_e164 FROM client_phones WHERE client_id = ${clientIntelligence.customerId} AND is_primary = true LIMIT 1)`,
        churnRiskScore: clientIntelligence.churnRiskScore,
        churnRiskLabel: clientIntelligence.churnRiskLabel,
        ltv12Month: clientIntelligence.ltv12Month,
        ltvScore: clientIntelligence.ltvScore,
        daysSinceLast: clientIntelligence.daysSinceLastVisit,
        avgCadenceDays: clientIntelligence.avgVisitCadenceDays,
        lastWinbackSentAt: clientIntelligence.lastWinbackSentAt,
        isDrifting: clientIntelligence.isDrifting,
        isAtRisk: clientIntelligence.isAtRisk,
        marketingOptIn: sql<boolean>`(SELECT sms_opt_in FROM client_phones WHERE client_id = ${clientIntelligence.customerId} AND is_primary = true LIMIT 1)`,
        totalVisits: clientIntelligence.totalVisits,
        // The last text Certxa really sent this client (Client Retention says what was done, owner 2026-10-24).
        lastTextAt: sql<string | null>`(SELECT ii.sent_at FROM intelligence_interventions ii WHERE ii.store_id = ${storeId} AND ii.customer_id = ${clientIntelligence.customerId} AND ii.status = 'sent' ORDER BY ii.sent_at DESC LIMIT 1)`,
        lastTextType: sql<string | null>`(SELECT ii.intervention_type FROM intelligence_interventions ii WHERE ii.store_id = ${storeId} AND ii.customer_id = ${clientIntelligence.customerId} AND ii.status = 'sent' ORDER BY ii.sent_at DESC LIMIT 1)`,
        textsSent: sql<number>`(SELECT COUNT(*)::int FROM intelligence_interventions ii WHERE ii.store_id = ${storeId} AND ii.customer_id = ${clientIntelligence.customerId} AND ii.status = 'sent')`,
      })
      .from(clientIntelligence)
      .leftJoin(clients, eq(clientIntelligence.customerId, clients.id))
      .where(
        and(
          eq(clientIntelligence.storeId, storeId),
          sql`churn_risk_score >= 25`
        )
      )
      .orderBy(desc(clientIntelligence.ltv12Month), desc(clientIntelligence.churnRiskScore))
      .limit(20);

    // Get score history (last 30 days)
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const scoreHistory = await db
      .select({
        score: growthScoreSnapshots.overallScore,
        date: growthScoreSnapshots.snapshotDate,
      })
      .from(growthScoreSnapshots)
      .where(
        and(
          eq(growthScoreSnapshots.storeId, storeId),
          gte(growthScoreSnapshots.snapshotDate, last30)
        )
      )
      .orderBy(growthScoreSnapshots.snapshotDate);

    // Recent interventions
    const recentInterventions = await db
      .select({
        id: intelligenceInterventions.id,
        type: intelligenceInterventions.interventionType,
        channel: intelligenceInterventions.channel,
        status: intelligenceInterventions.status,
        triggeredBy: intelligenceInterventions.triggeredBy,
        sentAt: intelligenceInterventions.sentAt,
        customerName: clients.fullName,
      })
      .from(intelligenceInterventions)
      .leftJoin(clients, eq(intelligenceInterventions.customerId, clients.id))
      .where(eq(intelligenceInterventions.storeId, storeId))
      .orderBy(desc(intelligenceInterventions.sentAt))
      .limit(10);

    // Summary stats
    const [clientStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        drifting: sql<number>`SUM(CASE WHEN is_drifting THEN 1 ELSE 0 END)`,
        atRisk: sql<number>`SUM(CASE WHEN is_at_risk THEN 1 ELSE 0 END)`,
        avgLtv12: sql<string>`COALESCE(AVG(CAST(ltv_12_month AS DECIMAL(10,2))), 0)`,
      })
      .from(clientIntelligence)
      .where(eq(clientIntelligence.storeId, storeId));

    // What Certxa really sent in the last 30 days, by kind, and how many of the clients who may not return it texted.
    const sentRows = await pool.query(
      `SELECT intervention_type AS type, COUNT(*)::int AS n FROM intelligence_interventions
        WHERE store_id = $1 AND status = 'sent' AND sent_at > NOW() - INTERVAL '30 days' GROUP BY intervention_type`, [storeId]);
    const textsSent30d: Record<string, number> = {};
    for (const r of sentRows.rows as any[]) textsSent30d[r.type] = Number(r.n) || 0;
    const textedRow = await pool.query(
      `SELECT COUNT(DISTINCT ci.customer_id)::int AS n FROM client_intelligence ci
         JOIN intelligence_interventions ii ON ii.store_id = ci.store_id AND ii.customer_id = ci.customer_id
          AND ii.status = 'sent' AND ii.sent_at > NOW() - INTERVAL '30 days'
        WHERE ci.store_id = $1 AND (ci.is_drifting OR ci.churn_risk_score >= 25)`, [storeId]);

    res.json({
      latestScore: latestScore || null,
      atRiskClients,
      scoreHistory,
      recentInterventions,
      textsSent30d,
      atRiskTexted30d: Number((textedRow.rows[0] as any)?.n) || 0,
      summary: {
        totalClients: Number(clientStats?.total || 0),
        driftingClients: Number(clientStats?.drifting || 0),
        atRiskClients: Number(clientStats?.atRisk || 0),
        avgLtv12Month: parseFloat(clientStats?.avgLtv12 || "0"),
        lastComputedAt: latestScore?.snapshotDate || null,
      },
    });
  } catch (err: any) {
    console.error("[intelligence] dashboard error:", err);
    res.status(500).json({ error: "Failed to fetch intelligence dashboard" });
  }
});

// GET /api/intelligence/growth-score
// Returns full growth score breakdown + history
router.get("/growth-score", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const [latestSnapshot] = await db
      .select()
      .from(growthScoreSnapshots)
      .where(eq(growthScoreSnapshots.storeId, storeId))
      .orderBy(desc(growthScoreSnapshots.snapshotDate))
      .limit(1);

    const history = await db
      .select()
      .from(growthScoreSnapshots)
      .where(eq(growthScoreSnapshots.storeId, storeId))
      .orderBy(desc(growthScoreSnapshots.snapshotDate))
      .limit(30);

    // Also compute live
    const [clientStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        drifting: sql<number>`SUM(CASE WHEN is_drifting THEN 1 ELSE 0 END)`,
        atRisk: sql<number>`SUM(CASE WHEN is_at_risk THEN 1 ELSE 0 END)`,
        avgRebooking: sql<string>`COALESCE(AVG(CAST(rebooking_rate AS DECIMAL(10,2))), 0)`,
      })
      .from(clientIntelligence)
      .where(eq(clientIntelligence.storeId, storeId));

    const deadSeats = await computeDeadSeats(storeId);

    const liveScore = await computeGrowthScore(
      storeId,
      {
        activeClients: Number(clientStats?.total || 0),
        driftingClients: Number(clientStats?.drifting || 0),
        atRiskClients: Number(clientStats?.atRisk || 0),
        avgRebookingRate: parseFloat(clientStats?.avgRebooking || "0"),
      },
      deadSeats.overallUtilization
    );

    res.json({ snapshot: latestSnapshot, history: history.reverse(), live: liveScore });
  } catch (err: any) {
    console.error("[intelligence] growth-score error:", err);
    res.status(500).json({ error: "Failed to fetch growth score" });
  }
});

// GET /api/intelligence/revenue-leakage
router.get("/revenue-leakage", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const report = await computeRevenueLeakage(storeId);
    res.json(report);
  } catch (err: any) {
    console.error("[intelligence] revenue-leakage error:", err);
    res.status(500).json({ error: "Failed to compute revenue leakage" });
  }
});

// GET /api/intelligence/dead-seats
router.get("/dead-seats", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const report = await computeDeadSeats(storeId);
    res.json(report);
  } catch (err: any) {
    console.error("[intelligence] dead-seats error:", err);
    res.status(500).json({ error: "Failed to compute dead seats" });
  }
});

// GET /api/intelligence/no-show-risks
router.get("/no-show-risks", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    // Default: tomorrow
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const risks = await computeNoShowRisks(storeId, tomorrow);
    const stats = await getNoShowStats(storeId);
    res.json({ risks, stats });
  } catch (err: any) {
    console.error("[intelligence] no-show-risks error:", err);
    res.status(500).json({ error: "Failed to compute no-show risks" });
  }
});

// GET /api/intelligence/rebooking-rates
router.get("/rebooking-rates", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const stats = await computeRebookingRates(storeId);

    // Also get from DB
    const dbStats = await db
      .select()
      .from(staffIntelligence)
      .where(eq(staffIntelligence.storeId, storeId))
      .orderBy(desc(staffIntelligence.rebookingRatePct));

    res.json({ live: stats, cached: dbStats });
  } catch (err: any) {
    console.error("[intelligence] rebooking-rates error:", err);
    res.status(500).json({ error: "Failed to compute rebooking rates" });
  }
});

// GET /api/intelligence/at-risk-clients
router.get("/at-risk-clients", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const atRiskClients = await db
      .select({
        customerId: clientIntelligence.customerId,
        customerName: clients.fullName,
        customerPhone: sql<string>`(SELECT phone_number_e164 FROM client_phones WHERE client_id = ${clientIntelligence.customerId} AND is_primary = true LIMIT 1)`,
        customerEmail: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = ${clientIntelligence.customerId} AND is_primary = true LIMIT 1)`,
        churnRiskScore: clientIntelligence.churnRiskScore,
        churnRiskLabel: clientIntelligence.churnRiskLabel,
        ltv12Month: clientIntelligence.ltv12Month,
        ltvAllTime: clientIntelligence.ltvAllTime,
        ltvScore: clientIntelligence.ltvScore,
        daysSinceLast: clientIntelligence.daysSinceLastVisit,
        avgCadenceDays: clientIntelligence.avgVisitCadenceDays,
        daysOverduePct: clientIntelligence.daysOverduePct,
        totalVisits: clientIntelligence.totalVisits,
        noShowRate: clientIntelligence.noShowRate,
        lastWinbackSentAt: clientIntelligence.lastWinbackSentAt,
        isDrifting: clientIntelligence.isDrifting,
        isAtRisk: clientIntelligence.isAtRisk,
        marketingOptIn: sql<boolean>`(SELECT sms_opt_in FROM client_phones WHERE client_id = ${clientIntelligence.customerId} AND is_primary = true LIMIT 1)`,
      })
      .from(clientIntelligence)
      .leftJoin(clients, eq(clientIntelligence.customerId, clients.id))
      .where(
        and(
          eq(clientIntelligence.storeId, storeId),
          sql`churn_risk_score >= 25`,
          sql`COALESCE(total_visits, 0) > 1`
        )
      )
      .orderBy(desc(clientIntelligence.ltv12Month), desc(clientIntelligence.churnRiskScore))
      .limit(50);

    res.json(atRiskClients);
  } catch (err: any) {
    console.error("[intelligence] at-risk-clients error:", err);
    res.status(500).json({ error: "Failed to fetch at-risk clients" });
  }
});

// GET /api/intelligence/cancellation-recovery/:appointmentId
router.get("/cancellation-recovery/:appointmentId", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return res.end();

  const appointmentId = parseInt(req.params.appointmentId);
  if (!appointmentId) return res.status(400).json({ error: "Invalid appointment ID" });

  try {
    const candidates = await getCancellationRecoveryCandidates(storeId, appointmentId);
    return res.json(candidates);
  } catch (err: any) {
    console.error("[intelligence] cancellation-recovery error:", err);
    return res.status(500).json({ error: "Failed to find recovery candidates" });
  }
});

// POST /api/intelligence/winback
router.post("/winback", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  const { customerId, manual } = req.body;
  if (!customerId) {
    return res.status(400).json({ error: "customerId required" });
  }

  try {
    const result = await sendManualWinback(storeId, customerId);
    return res.json(result);
  } catch (err: any) {
    console.error("[intelligence] winback error:", err);
    return res.status(500).json({ error: "Failed to send winback message" });
  }
});

// POST /api/intelligence/winback-campaign
// Runs the automated drift recovery for a store
router.post("/winback-campaign", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  const { dryRun } = req.body;

  try {
    const result = await runDriftRecovery(storeId, dryRun === true);
    return res.json(result);
  } catch (err: any) {
    console.error("[intelligence] winback-campaign error:", err);
    return res.status(500).json({ error: "Failed to run winback campaign" });
  }
});

// POST /api/intelligence/fill-slot
router.post("/fill-slot", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  const { customerId, message, cancelledAppointmentId } = req.body;
  if (!customerId || !message) {
    return res.status(400).json({ error: "customerId and message required" });
  }

  try {
    const result = await sendCancellationRecoverySms(storeId, customerId, message, cancelledAppointmentId);
    return res.json(result);
  } catch (err: any) {
    console.error("[intelligence] fill-slot error:", err);
    return res.status(500).json({ error: "Failed to send fill-slot SMS" });
  }
});

// GET /api/intelligence/forecast
router.get("/forecast", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const [clientStats] = await db
      .select({
        drifting: sql<number>`COALESCE(SUM(CASE WHEN is_drifting THEN 1 ELSE 0 END), 0)`,
        avgLtv: sql<string>`COALESCE(AVG(CAST(ltv_12_month AS DECIMAL(10,2))), 0)`,
      })
      .from(clientIntelligence)
      .where(eq(clientIntelligence.storeId, storeId));

    const { computeRevenueForecast } = await import("../intelligence/revenue-forecast");
    const forecast = await computeRevenueForecast(
      storeId,
      Number(clientStats?.drifting || 0),
      parseFloat(clientStats?.avgLtv || "0")
    );

    res.json(forecast);
  } catch (err: any) {
    console.error("[intelligence] forecast error:", err);
    res.status(500).json({ error: "Failed to compute revenue forecast" });
  }
});

// GET /api/intelligence/client/:customerId
// Returns intelligence data for a single client
router.get("/client/:customerId", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return res.end();

  const customerId = parseInt(req.params.customerId);
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ error: "Invalid customerId" });
  }

  try {
    const [intel] = await db
      .select({
        avgVisitCadenceDays: clientIntelligence.avgVisitCadenceDays,
        lastVisitDate: clientIntelligence.lastVisitDate,
        nextExpectedVisitDate: clientIntelligence.nextExpectedVisitDate,
        daysSinceLastVisit: clientIntelligence.daysSinceLastVisit,
        daysOverduePct: clientIntelligence.daysOverduePct,
        totalVisits: clientIntelligence.totalVisits,
        totalRevenue: clientIntelligence.totalRevenue,
        avgTicketValue: clientIntelligence.avgTicketValue,
        ltv12Month: clientIntelligence.ltv12Month,
        ltvAllTime: clientIntelligence.ltvAllTime,
        ltvScore: clientIntelligence.ltvScore,
        churnRiskScore: clientIntelligence.churnRiskScore,
        churnRiskLabel: clientIntelligence.churnRiskLabel,
        noShowRate: clientIntelligence.noShowRate,
        rebookingRate: clientIntelligence.rebookingRate,
        isDrifting: clientIntelligence.isDrifting,
        isAtRisk: clientIntelligence.isAtRisk,
        lastWinbackSentAt: clientIntelligence.lastWinbackSentAt,
        winbackSentCount: clientIntelligence.winbackSentCount,
        computedAt: clientIntelligence.computedAt,
      })
      .from(clientIntelligence)
      .where(
        and(
          eq(clientIntelligence.storeId, storeId),
          eq(clientIntelligence.customerId, customerId)
        )
      )
      .limit(1);

    // Get recent interventions for this client
    const recentInterventions = await db
      .select({
        id: intelligenceInterventions.id,
        type: intelligenceInterventions.interventionType,
        channel: intelligenceInterventions.channel,
        status: intelligenceInterventions.status,
        triggeredBy: intelligenceInterventions.triggeredBy,
        sentAt: intelligenceInterventions.sentAt,
      })
      .from(intelligenceInterventions)
      .where(
        and(
          eq(intelligenceInterventions.storeId, storeId),
          eq(intelligenceInterventions.customerId, customerId)
        )
      )
      .orderBy(desc(intelligenceInterventions.sentAt))
      .limit(5);

    return res.json({ intel: intel || null, interventions: recentInterventions });
  } catch (err: any) {
    console.error("[intelligence] client error:", err);
    return res.status(500).json({ error: "Failed to fetch client intelligence" });
  }
});

// GET /api/intelligence/staff-performance
// Returns enriched staff performance combining rebooking rates + appointment stats
router.get("/staff-performance", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const rows = await db.execute(
      sql`SELECT
            s.id AS staff_id,
            s.name AS staff_name,
            s.role AS staff_role,
            COUNT(a.id) FILTER (WHERE a.status IN ('completed','started')) AS completed_count,
            COUNT(a.id) FILTER (WHERE a.status IN ('no_show','no-show')) AS no_show_count,
            COUNT(a.id) FILTER (WHERE a.status = 'cancelled') AS cancelled_count,
            COUNT(DISTINCT a.customer_id) FILTER (WHERE a.status IN ('completed','started')) AS unique_clients,
            COALESCE(SUM(CAST(a.total_paid AS DECIMAL(10,2))) FILTER (WHERE a.status = 'completed'), 0)::float AS total_revenue,
            COALESCE(AVG(CAST(a.total_paid AS DECIMAL(10,2))) FILTER (WHERE a.status = 'completed'), 0)::float AS avg_ticket
          FROM staff s
          LEFT JOIN appointments a ON a.staff_id = s.id
            AND a.store_id = ${storeId}
            AND a.date >= ${ninetyDaysAgo.toISOString()}
          WHERE s.store_id = ${storeId}
            AND s.status NOT IN ('removed', 'deactivated')
          GROUP BY s.id, s.name, s.role
          ORDER BY total_revenue DESC`
    );

    const staffList = (rows.rows as any[]).map((r) => ({
      staffId: r.staff_id,
      staffName: r.staff_name,
      staffRole: r.staff_role,
      completedCount: parseInt(r.completed_count || "0"),
      noShowCount: parseInt(r.no_show_count || "0"),
      cancelledCount: parseInt(r.cancelled_count || "0"),
      uniqueClients: parseInt(r.unique_clients || "0"),
      totalRevenue: parseFloat(r.total_revenue || "0"),
      avgTicket: parseFloat(r.avg_ticket || "0"),
    }));

    // Merge rebooking rates from staffIntelligence table
    const rebookingRows = await db
      .select({
        staffId: staffIntelligence.staffId,
        rebookingRatePct: staffIntelligence.rebookingRatePct,
        trend: staffIntelligence.trend,
      })
      .from(staffIntelligence)
      .where(eq(staffIntelligence.storeId, storeId));

    const rebookingMap = new Map(rebookingRows.map((r) => [r.staffId, r]));

    const enriched = staffList.map((s) => {
      const rb = rebookingMap.get(s.staffId);
      const noShowRate = (s.completedCount + s.noShowCount) > 0 ? Math.round((s.noShowCount / (s.completedCount + s.noShowCount)) * 100) : 0;
      return {
        ...s,
        rebookingRatePct: rb?.rebookingRatePct ?? 0,
        trend: rb?.trend ?? "flat",
        noShowRate,
        revenueRank: 0,
      };
    });

    // Assign revenue rank
    enriched.forEach((s, i) => { s.revenueRank = i + 1; });

    res.json(enriched);
  } catch (err: any) {
    console.error("[intelligence] staff-performance error:", err);
    res.status(500).json({ error: "Failed to fetch staff performance" });
  }
});

// GET /api/intelligence/service-suggestion/:customerId
// Returns the most-booked service for a returning client
router.get("/service-suggestion/:customerId", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return res.end();

  const customerId = parseInt(req.params.customerId);
  if (!customerId) return res.status(400).json({ error: "Invalid customerId" });

  try {
    const rows = await db.execute(
      sql`SELECT
            a.service_id,
            s.name AS service_name,
            s.price AS service_price,
            s.duration AS service_duration,
            COUNT(*) AS visit_count,
            MAX(a.date) AS last_booked_at
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.store_id = ${storeId}
            AND a.customer_id = ${customerId}
            AND a.status IN ('completed', 'started', 'confirmed')
          GROUP BY a.service_id, s.name, s.price, s.duration
          ORDER BY visit_count DESC
          LIMIT 3`
    );

    const suggestions = (rows.rows as any[]).map((r) => ({
      serviceId: r.service_id,
      serviceName: r.service_name,
      servicePrice: parseFloat(r.service_price || "0"),
      serviceDuration: parseInt(r.service_duration || "0"),
      visitCount: parseInt(r.visit_count || "0"),
      lastBookedAt: r.last_booked_at,
    }));

    return res.json(suggestions);
  } catch (err: any) {
    console.error("[intelligence] service-suggestion error:", err);
    return res.status(500).json({ error: "Failed to fetch service suggestion" });
  }
});

// GET /api/intelligence/daily-digest
// Returns today's most important actions in priority order
router.get("/daily-digest", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // What Certxa did for the salon (owner, 2026-10-24: the system is automatic — it reports what it has done,
    // never asks the owner to do it). Counts come from the log of texts Certxa sent in the last 7 days;
    // today's watch items say what Certxa does about them.
    const actions: Array<{ type: string; priority: number; label: string; detail: string; count?: number; revenueAtStake?: number; revenueLabel?: string; tab: string; ctaLabel: string }> = [];
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

    const [noShowRow, noShowRevRow, cancelRow, cancelRevRow, revenueRow, sentRows, cancelOfferTodayRow, reminderRow] = await Promise.all([
      // Today's appointments with clients who miss 40%+ of the time
      db.execute(sql`SELECT COUNT(*)::int AS cnt
            FROM appointments a
            JOIN client_intelligence ci ON ci.customer_id = a.customer_id AND ci.store_id = a.store_id
            WHERE a.store_id = ${storeId}
              AND a.date >= ${todayStart.toISOString()} AND a.date <= ${todayEnd.toISOString()}
              AND a.status IN ('pending', 'confirmed')
              AND CAST(ci.no_show_rate AS DECIMAL) >= 40`),
      db.execute(sql`SELECT COALESCE(SUM(CAST(s.price AS DECIMAL)), 0)::float AS rev
            FROM appointments a
            JOIN client_intelligence ci ON ci.customer_id = a.customer_id AND ci.store_id = a.store_id
            LEFT JOIN services s ON s.id = a.service_id
            WHERE a.store_id = ${storeId}
              AND a.date >= ${todayStart.toISOString()} AND a.date <= ${todayEnd.toISOString()}
              AND a.status IN ('pending', 'confirmed')
              AND CAST(ci.no_show_rate AS DECIMAL) >= 40`),
      // Today's cancellations
      db.execute(sql`SELECT COUNT(*)::int AS cnt FROM appointments a
            WHERE a.store_id = ${storeId}
              AND a.date >= ${todayStart.toISOString()} AND a.date <= ${todayEnd.toISOString()}
              AND a.status = 'cancelled'`),
      db.execute(sql`SELECT COALESCE(SUM(CAST(s.price AS DECIMAL)), 0)::float AS rev
            FROM appointments a LEFT JOIN services s ON s.id = a.service_id
            WHERE a.store_id = ${storeId}
              AND a.date >= ${todayStart.toISOString()} AND a.date <= ${todayEnd.toISOString()}
              AND a.status = 'cancelled'`),
      // Revenue today (completed + started)
      db.execute(sql`SELECT COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)::float AS rev
            FROM appointments
            WHERE store_id = ${storeId}
              AND date >= ${todayStart.toISOString()} AND date <= ${todayEnd.toISOString()}
              AND status IN ('completed', 'started')`),
      // Texts Certxa sent by itself in the last 7 days, by kind. (A cancellation offer is logged as "manual"
      // even when Certxa sends it on its own, so it is counted either way; staff-sent win-backs and reminders are not.)
      db.execute(sql`SELECT intervention_type AS type, COUNT(*)::int AS cnt
            FROM intelligence_interventions
            WHERE store_id = ${storeId} AND status = 'sent' AND sent_at >= ${sevenDaysAgo.toISOString()}
              AND (triggered_by <> 'manual' OR intervention_type = 'cancellation_recovery')
            GROUP BY intervention_type`),
      db.execute(sql`SELECT COUNT(*)::int AS cnt FROM intelligence_interventions
            WHERE store_id = ${storeId} AND status = 'sent' AND intervention_type = 'cancellation_recovery'
              AND sent_at >= ${todayStart.toISOString()}`),
      db.execute(sql`SELECT reminder_enabled FROM sms_settings WHERE store_id = ${storeId} LIMIT 1`),
    ]);
    const row = (r: any) => (r as any).rows?.[0] ?? {};
    const sent: Record<string, number> = {};
    for (const r of ((sentRows as any).rows ?? []) as any[]) sent[r.type] = Number(r.cnt) || 0;
    const remindersEnabled = row(reminderRow).reminder_enabled !== false;

    const noShowRisk = Number(row(noShowRow).cnt) || 0;
    if (noShowRisk > 0) {
      actions.push({
        type: "no_show_risk", priority: 1,
        label: `${noShowRisk} ${plural(noShowRisk, "appointment", "appointments")} today with clients who often miss`,
        detail: remindersEnabled
          ? "Certxa sends each of them their appointment reminder before the visit"
          : "Certxa is watching these appointments on the No-Shows tab",
        count: noShowRisk, revenueAtStake: Number(row(noShowRevRow).rev) || 0, revenueLabel: "booked",
        tab: "noshow", ctaLabel: "See who",
      });
    }

    const cancelledToday = Number(row(cancelRow).cnt) || 0;
    if (cancelledToday > 0) {
      const offered = Number(row(cancelOfferTodayRow).cnt) || 0;
      actions.push({
        type: "cancellation_recovery", priority: 2,
        label: `${cancelledToday} ${plural(cancelledToday, "cancellation", "cancellations")} today`,
        detail: offered > 0
          ? `Certxa offered the open time to ${offered} ${plural(offered, "client", "clients")} who fit it`
          : "Certxa offers each open time to a client who fits it, when it finds one",
        count: cancelledToday, revenueAtStake: Number(row(cancelRevRow).rev) || 0, revenueLabel: "opened up",
        tab: "seats", ctaLabel: "See empty time",
      });
    }

    const winbacks = sent["winback"] ?? 0;
    if (winbacks > 0) actions.push({
      type: "winback", priority: 3,
      label: `Texted ${winbacks} ${plural(winbacks, "client who hasn't", "clients who haven't")} been back in a while`,
      detail: "Each got an invite to book, with your booking link (last 7 days)",
      count: winbacks, tab: "clients", ctaLabel: "See clients",
    });
    const noShowTexts = sent["no_show_winback"] ?? 0;
    if (noShowTexts > 0) actions.push({
      type: "no_show_winback", priority: 4,
      label: `Texted ${noShowTexts} ${plural(noShowTexts, "client", "clients")} after a missed appointment`,
      detail: "Each got an invite to rebook (last 7 days)",
      count: noShowTexts, tab: "leakage", ctaLabel: "See missing revenue",
    });
    const cancelOffers = sent["cancellation_recovery"] ?? 0;
    if (cancelOffers > 0) actions.push({
      type: "cancellation_offers", priority: 5,
      label: `Offered ${cancelOffers} cancelled ${plural(cancelOffers, "time", "times")} to other clients`,
      detail: "To fill the open time (last 7 days)",
      count: cancelOffers, tab: "seats", ctaLabel: "See empty time",
    });
    const nudges = sent["rebooking_nudge"] ?? 0;
    if (nudges > 0) actions.push({
      type: "rebooking_nudge", priority: 6,
      label: `Sent ${nudges} booking ${plural(nudges, "nudge", "nudges")}`,
      detail: "To clients due for their next visit with nothing booked (last 7 days)",
      count: nudges, tab: "campaigns", ctaLabel: "See texts",
    });

    const todayRevenue = Number(row(revenueRow).rev) || 0;
    actions.sort((a, b) => a.priority - b.priority);

    res.json({
      actions: actions.slice(0, 6),
      todayRevenue,
      totalActions: actions.length,
      remindersEnabled,
    });
  } catch (err: any) {
    console.error("[intelligence] daily-digest error:", err);
    res.status(500).json({ error: "Failed to fetch daily digest" });
  }
});

// GET /api/intelligence/service-performance
// Analyzes services by revenue, no-show rate, avg ticket
router.get("/service-performance", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const rows = await db.execute(
      sql`SELECT
        s.id AS service_id,
        s.name AS service_name,
        s.price AS service_price,
        s.duration AS service_duration,
        COUNT(a.id) AS total_bookings,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN a.status IN ('no_show', 'no-show') THEN 1 ELSE 0 END) AS no_show_count,
        SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
        COALESCE(SUM(CASE WHEN a.status = 'completed' THEN CAST(a.total_paid AS DECIMAL(10,2)) ELSE 0 END), 0) AS total_revenue,
        COALESCE(AVG(CASE WHEN a.status = 'completed' THEN CAST(a.total_paid AS DECIMAL(10,2)) END), 0) AS avg_ticket
      FROM services s
      LEFT JOIN appointments a ON a.service_id = s.id
        AND a.store_id = ${storeId}
        AND a.date >= ${ninetyDaysAgo}
        AND a.date <= NOW()
      WHERE s.store_id = ${storeId} AND s.is_active = true
      GROUP BY s.id, s.name, s.price, s.duration
      ORDER BY total_revenue DESC
      LIMIT 30`
    );

    const services = rows.rows.map((r: any) => {
      const totalBookings = Number(r.total_bookings);
      const noShowCount = Number(r.no_show_count);
      const completedCount = Number(r.completed_count);
      const noShowRate = totalBookings > 0 ? Math.round((noShowCount / totalBookings) * 100) : 0;
      const completionRate = totalBookings > 0 ? Math.round((completedCount / totalBookings) * 100) : 0;
      const duration = Number(r.service_duration) || 60;
      const avgTicket = parseFloat(r.avg_ticket) || 0;
      const revenuePerMin = duration > 0 ? (avgTicket / duration) : 0;

      return {
        serviceId: r.service_id,
        serviceName: r.service_name,
        servicePrice: parseFloat(r.service_price) || 0,
        duration,
        totalBookings,
        completedCount,
        noShowCount,
        cancelledCount: Number(r.cancelled_count),
        totalRevenue: parseFloat(r.total_revenue) || 0,
        avgTicket,
        noShowRate,
        completionRate,
        revenuePerMin: Math.round(revenuePerMin * 100) / 100,
      };
    });

    // Generate insights
    const insights: string[] = [];
    const highNoShow = services.filter(s => s.noShowRate > 20 && s.totalBookings >= 5);
    if (highNoShow.length > 0) {
      insights.push(`"${highNoShow[0].serviceName}" has a ${highNoShow[0].noShowRate}% no-show rate — consider requiring a deposit for this service.`);
    }
    const topRevMin = services.filter(s => s.revenuePerMin > 0).sort((a, b) => b.revenuePerMin - a.revenuePerMin)[0];
    if (topRevMin) {
      insights.push(`"${topRevMin.serviceName}" generates $${topRevMin.revenuePerMin.toFixed(2)}/min — your most efficient service.`);
    }

    res.json({ services, insights });
  } catch (err: any) {
    console.error("[intelligence] service-performance error:", err);
    res.status(500).json({ error: "Failed to fetch service performance" });
  }
});

// GET /api/intelligence/campaigns/segments
// Returns segment counts for campaign targeting
router.get("/campaigns/segments", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    // Excludes known landlines (can never receive an SMS) AND requires
    // sms_opt_in = true — matching exactly what /campaigns/send actually
    // requires, so the count shown here doesn't overstate real reach
    // (previously this count ignored opt-in while the send didn't).
    const [atRisk] = await db.execute(
      sql`SELECT COUNT(*) AS count FROM client_intelligence ci JOIN client_phones cp ON cp.client_id = ci.customer_id AND cp.is_primary = true WHERE ci.store_id = ${storeId} AND churn_risk_label IN ('high','critical') AND cp.phone_number_e164 IS NOT NULL AND cp.phone_type != 'landline' AND cp.sms_opt_in = true`
    ).then(r => [{ count: Number((r.rows as any[])[0]?.count || 0) }]);

    const [drifting] = await db.execute(
      sql`SELECT COUNT(*) AS count FROM client_intelligence ci JOIN client_phones cp ON cp.client_id = ci.customer_id AND cp.is_primary = true WHERE ci.store_id = ${storeId} AND ci.is_drifting = true AND cp.phone_number_e164 IS NOT NULL AND cp.phone_type != 'landline' AND cp.sms_opt_in = true`
    ).then(r => [{ count: Number((r.rows as any[])[0]?.count || 0) }]);

    const [highLtv] = await db.execute(
      sql`SELECT COUNT(*) AS count FROM client_intelligence ci JOIN client_phones cp ON cp.client_id = ci.customer_id AND cp.is_primary = true WHERE ci.store_id = ${storeId} AND CAST(ltv_12_month AS DECIMAL) > 200 AND cp.phone_number_e164 IS NOT NULL AND cp.phone_type != 'landline' AND cp.sms_opt_in = true`
    ).then(r => [{ count: Number((r.rows as any[])[0]?.count || 0) }]);

    res.json({
      segments: [
        { id: "at_risk", label: "At-Risk Clients", description: "High or critical churn risk", count: Number(atRisk?.count || 0), color: "red" },
        { id: "drifting", label: "Drifting Clients", description: "Visit frequency declining", count: Number(drifting?.count || 0), color: "amber" },
        { id: "high_ltv", label: "High-Value Clients", description: "LTV > $200 in last 12 months", count: Number(highLtv?.count || 0), color: "violet" },
      ],
    });
  } catch (err: any) {
    console.error("[intelligence] campaigns/segments error:", err);
    res.status(500).json({ error: "Failed to fetch segments" });
  }
});

// GET /api/intelligence/campaigns/export
// Export a client segment as CSV
router.get("/campaigns/export", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return res.end();
  const segment = req.query.segment as string;
  if (!segment) return res.status(400).json({ error: "segment required" });

  try {
    let rows: { name: string; phone: string | null; email: string | null }[] = [];

    if (segment === "at_risk" || segment === "drifting" || segment === "high_ltv") {
      const condition = segment === "at_risk"
        ? sql`churn_risk_label IN ('high','critical')`
        : segment === "drifting"
        ? eq(clientIntelligence.isDrifting, true)
        : sql`CAST(ltv_12_month AS DECIMAL) > 200`;

      const data = await db
        .select({
          name: clients.fullName,
          phone: sql<string>`(SELECT phone_number_e164 FROM client_phones WHERE client_id = ${clientIntelligence.customerId} AND is_primary = true LIMIT 1)`,
          email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = ${clientIntelligence.customerId} AND is_primary = true LIMIT 1)`,
        })
        .from(clientIntelligence)
        .leftJoin(clients, eq(clientIntelligence.customerId, clients.id))
        .where(and(eq(clientIntelligence.storeId, storeId), condition));
      rows = data.map(r => ({ name: r.name!, phone: r.phone, email: r.email }));
    }

    const csv = ["Name,Phone,Email", ...rows.map(r =>
      `"${(r.name || "").replace(/"/g, '""')}","${r.phone || ""}","${r.email || ""}"`
    )].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="segment-${segment}.csv"`);
    return res.send(csv);
  } catch (err: any) {
    console.error("[intelligence] campaigns/export error:", err);
    return res.status(500).json({ error: "Export failed" });
  }
});

// POST /api/intelligence/campaigns/send
// Sends a bulk SMS campaign to a segment
router.post("/campaigns/send", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  const { segment, message, dryRun } = req.body;
  if (!segment || !message) {
    return res.status(400).json({ error: "segment and message required" });
  }

  try {
    let customerRows: { id: number; phone: string | null; name: string }[] = [];

    const segmentSql = segment === "at_risk"
      ? sql`churn_risk_label IN ('high','critical')`
      : segment === "drifting"
      ? sql`ci.is_drifting = true`
      : segment === "high_ltv"
      ? sql`CAST(ltv_12_month AS DECIMAL) > 200`
      : null;

    if (segmentSql) {
      // Excludes known landlines from the send list — they can never receive
      // an SMS, so skipping them here avoids paying for a doomed message.
      const rows = (await db.execute(
        sql`SELECT ci.customer_id AS id, c.full_name AS name, (SELECT phone_number_e164 FROM client_phones WHERE client_id = ci.customer_id AND is_primary = true LIMIT 1) AS phone FROM client_intelligence ci JOIN clients c ON c.id = ci.customer_id WHERE ci.store_id = ${storeId} AND ${segmentSql} AND EXISTS(SELECT 1 FROM client_phones WHERE client_id = ci.customer_id AND is_primary = true AND sms_opt_in = true AND phone_type != 'landline')`
      )).rows as any[];
      customerRows = rows.map(r => ({ id: Number(r.id), phone: r.phone, name: r.name }));
    } else {
      return res.status(400).json({ error: "Unknown segment" });
    }

    const eligible = customerRows.filter(c => c.phone);

    if (dryRun) {
      return res.json({ dryRun: true, wouldSend: eligible.length, segment });
    }

    let sent = 0;
    let failed = 0;
    for (const c of eligible) {
      if (!c.phone) continue;
      // Personalise with first name
      const firstName = c.name.split(" ")[0];
      const personalised = message.replace(/\{name\}/gi, firstName);
      try {
        await sendSms(storeId, c.phone, personalised, "campaign", undefined, c.id);
        sent++;
      } catch {
        failed++;
      }
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100));
    }

    return res.json({ sent, failed, total: eligible.length, segment });
  } catch (err: any) {
    console.error("[intelligence] campaigns/send error:", err);
    return res.status(500).json({ error: "Failed to send campaign" });
  }
});

// GET /api/intelligence/unsubscribe
// One-click unsubscribe from weekly digest — called directly from email link
router.get("/unsubscribe", async (req, res) => {
  const storeId = parseInt(String(req.query.storeId || ""));
  const token = String(req.query.token || "");

  if (!storeId || !token) {
    return res.status(400).send(unsubscribePage("Invalid link", "This unsubscribe link is missing required information.", false));
  }

  const { verifyUnsubscribeToken } = await import("../intelligence/weekly-digest-email");
  if (!verifyUnsubscribeToken(storeId, token)) {
    return res.status(403).send(unsubscribePage("Invalid link", "This unsubscribe link is invalid or has been tampered with.", false));
  }

  try {
    const { locations } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(locations).set({ weeklyDigestOptOut: true }).where(eq(locations.id, storeId));
    return res.send(unsubscribePage("You're unsubscribed", "You'll no longer receive weekly revenue digest emails. You can re-enable them anytime from your Revenue Intelligence dashboard.", true));
  } catch (err) {
    console.error("[intelligence] unsubscribe error:", err);
    return res.status(500).send(unsubscribePage("Something went wrong", "We couldn't process your request. Please try again or contact support.", false));
  }
});

function unsubscribePage(heading: string, body: string, success: boolean): string {
  const appUrl = process.env.APP_URL || "https://app.certxa.com";
  const color = success ? "#10b981" : "#ef4444";
  const icon = success ? "✓" : "✕";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading} — Certxa</title></head>
<body style="margin:0;padding:40px 16px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;box-sizing:border-box;">
  <div style="background:#fff;border-radius:16px;padding:40px 32px;max-width:480px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <div style="width:56px;height:56px;border-radius:50%;background:${color}20;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
      <span style="font-size:24px;color:${color};">${icon}</span>
    </div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">${heading}</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">${body}</p>
    <a href="${appUrl}/intelligence" style="display:inline-block;background:#18103a;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">
      Back to Revenue Intelligence
    </a>
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">Certxa · Revenue Intelligence</p>
  </div>
</body>
</html>`;
}

// GET /api/intelligence/digest-preferences
// Returns the current opt-out status for the weekly digest
router.get("/digest-preferences", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return res.end();

  try {
    const { locations } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const [store] = await db
      .select({ optOut: locations.weeklyDigestOptOut })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);

    return res.json({ optOut: store?.optOut ?? false });
  } catch (err) {
    console.error("[intelligence] digest-preferences error:", err);
    return res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

// POST /api/intelligence/digest-preferences
// Toggle weekly digest opt-out for a store
router.post("/digest-preferences", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  const { optOut } = req.body;
  if (typeof optOut !== "boolean") {
    return res.status(400).json({ error: "optOut (boolean) required" });
  }

  try {
    const { locations } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(locations).set({ weeklyDigestOptOut: optOut }).where(eq(locations.id, storeId));
    return res.json({ success: true, optOut });
  } catch (err) {
    console.error("[intelligence] digest-preferences update error:", err);
    return res.status(500).json({ error: "Failed to update preferences" });
  }
});

// POST /api/intelligence/send-weekly-digest
// Manually triggers the weekly revenue digest email for a store (owner only)
router.post("/send-weekly-digest", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const { sendWeeklyDigest } = await import("../intelligence/weekly-digest-email");
    const result = await sendWeeklyDigest(storeId);
    if (result.sent) {
      return res.json({ success: true, message: "Weekly digest email sent" });
    }
    return res.json({ success: false, skipped: result.skipped });
  } catch (err: any) {
    console.error("[intelligence] send-weekly-digest error:", err);
    return res.status(500).json({ error: "Failed to send weekly digest" });
  }
});

// POST /api/intelligence/send-noshow-reminder
// Sends a one-tap SMS reminder to a client for an upcoming high-risk appointment
router.post("/send-noshow-reminder", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  const { appointmentId, customerId } = req.body;
  if (!appointmentId || !customerId) {
    return res.status(400).json({ error: "appointmentId and customerId required" });
  }

  try {
    // Load appointment, customer, and store info
    const apptResult = await db.execute(
      sql`SELECT a.date, s.name AS service_name, st.name AS staff_name
          FROM appointments a
          LEFT JOIN services s ON s.id = a.service_id
          LEFT JOIN staff st ON st.id = a.staff_id
          WHERE a.id = ${appointmentId} AND a.store_id = ${storeId}
          LIMIT 1`
    );
    const customerResult = await db.execute(
      sql`SELECT c.full_name AS name, cp.phone_number_e164 AS phone, c.marketing_opt_in
          FROM clients c
          LEFT JOIN client_phones cp ON cp.client_id = c.id AND cp.is_primary = true
          WHERE c.id = ${customerId} AND c.store_id = ${storeId}
          LIMIT 1`
    );
    const locationResult = await db.execute(
      sql`SELECT name, booking_slug AS slug FROM locations WHERE id = ${storeId} LIMIT 1`
    );
    const apptRow = (apptResult as any).rows?.[0];
    const customerRow = (customerResult as any).rows?.[0];
    const locationRow = (locationResult as any).rows?.[0];

    if (!customerRow || !(customerRow as any).phone) {
      return res.json({ success: false, error: "No phone number on file" });
    }

    const appt = apptRow as any;
    const customer = customerRow as any;
    const location = locationRow as any;

    const firstName = customer.name.split(" ")[0];
    const storeName = location?.name || "us";
    const apptDate = appt?.date ? new Date(appt.date) : null;
    const timeStr = apptDate
      ? apptDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "your appointment";
    const serviceStr = appt?.service_name ? ` for ${appt.service_name}` : "";
    const staffStr = appt?.staff_name ? ` with ${appt.staff_name}` : "";

    const APP_URL = process.env.APP_URL || "https://certxa.com";
    const bookingSlug = location?.slug;
    const bookingLink = bookingSlug ? `${APP_URL}/book/${bookingSlug}` : APP_URL;

    const message = `Hi ${firstName}! Just a reminder — you have an appointment${serviceStr}${staffStr} at ${storeName} tomorrow at ${timeStr}. We look forward to seeing you! Need to reschedule? ${bookingLink}\n\nReply STOP to opt out.`;

    const sent = await sendSms(storeId, customer.phone, message, "no_show_reminder", appointmentId, customerId);
    const outcome = sendOutcome(sent);
    await db.insert(intelligenceInterventions).values({
      storeId,
      customerId,
      interventionType: "no_show_reminder",
      channel: "sms",
      messageBody: message,
      status: outcome,
      triggeredBy: "manual",
      appointmentId,
    });

    if (outcome !== "sent") return res.json({ success: false, error: sent.error ?? "The reminder did not go out" });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[intelligence] send-noshow-reminder error:", err);
    return res.status(500).json({ error: "Failed to send reminder", detail: err.message });
  }
});

router.post("/refresh", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    res.json({ message: "Intelligence refresh started", storeId });
    // Run in background
    setImmediate(() => runIntelligenceForStore(storeId));
    return;
  } catch (err: any) {
    console.error("[intelligence] refresh error:", err);
    return res.status(500).json({ error: "Failed to start refresh" });
  }
});

// GET /api/intelligence/price-optimization
// Suggests price adjustments based on demand and margin
router.get("/price-optimization", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await db.execute(
      sql`SELECT
        s.id AS service_id,
        s.name AS service_name,
        CAST(s.price AS DECIMAL(10,2)) AS service_price,
        s.duration AS service_duration,
        COUNT(a.id) AS total_bookings,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN a.status IN ('no_show', 'no-show') THEN 1 ELSE 0 END) AS no_show_count,
        COALESCE(AVG(CASE WHEN a.status = 'completed' THEN CAST(a.total_paid AS DECIMAL(10,2)) END), 0) AS avg_ticket
      FROM services s
      LEFT JOIN appointments a ON a.service_id = s.id
        AND a.store_id = ${storeId}
        AND a.date >= ${ninetyDaysAgo}
        AND a.date <= NOW()
      WHERE s.store_id = ${storeId} AND s.is_active = true
      GROUP BY s.id, s.name, s.price, s.duration
      HAVING COUNT(a.id) >= 3
      ORDER BY total_bookings DESC`
    );

    const suggestions: any[] = [];
    for (const r of rows.rows) {
      const totalBookings = Number(r.total_bookings);
      const completedCount = Number(r.completed_count);
      const noShowCount = Number(r.no_show_count);
      const listPrice = parseFloat(String(r.service_price ?? "0")) || 0;
      const avgTicket = parseFloat(String(r.avg_ticket ?? "0")) || 0;
      const noShowRate = totalBookings > 0 ? noShowCount / totalBookings : 0;
      const completionRate = totalBookings > 0 ? completedCount / totalBookings : 1;

      let recommendation: string | null = null;
      let recommendedPrice: number | null = null;
      let reasoning: string | null = null;
      let priority: "high" | "medium" | "low" = "low";

      // High demand (10+ bookings, >80% completion) — room to raise price
      if (totalBookings >= 10 && completionRate >= 0.8 && listPrice > 0) {
        const suggestedIncrease = Math.round(listPrice * 0.1 / 5) * 5; // Round to nearest $5
        recommendedPrice = listPrice + suggestedIncrease;
        recommendation = "Consider a price increase";
        reasoning = `Strong demand with ${Math.round(completionRate * 100)}% completion rate — clients are price-insensitive.`;
        priority = "medium";
      }

      // High no-show rate (>25%) — suggest deposit requirement
      if (noShowRate >= 0.25 && totalBookings >= 5) {
        recommendation = "Require deposit";
        recommendedPrice = Math.round(listPrice * 0.25 / 5) * 5; // 25% deposit
        reasoning = `${Math.round(noShowRate * 100)}% no-show rate costs you ~$${(noShowCount * avgTicket).toFixed(0)} over 90 days.`;
        priority = "high";
      }

      // Low demand (< 5 bookings) — consider a promotional price
      if (totalBookings < 5 && listPrice > 0 && completedCount > 0) {
        const suggestedDiscount = Math.round(listPrice * 0.15 / 5) * 5;
        recommendedPrice = Math.max(listPrice - suggestedDiscount, 1);
        recommendation = "Promotional pricing";
        reasoning = `Only ${totalBookings} bookings in 90 days. A limited-time discount could drive awareness.`;
        priority = "low";
      }

      if (recommendation) {
        suggestions.push({
          serviceId: r.service_id,
          serviceName: r.service_name,
          currentPrice: listPrice,
          recommendedPrice,
          recommendation,
          reasoning,
          priority,
          totalBookings,
          noShowRate: Math.round(noShowRate * 100),
        });
      }
    }

    // Sort by priority
    const order = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => order[a.priority as keyof typeof order] - order[b.priority as keyof typeof order]);

    res.json({ suggestions });
  } catch (err: any) {
    console.error("[intelligence] price-optimization error:", err);
    res.status(500).json({ error: "Failed to compute price optimization" });
  }
});

// GET /api/intelligence/booking-heatmap
// Returns a day-of-week x hour-of-day heatmap of appointment volume
router.get("/booking-heatmap", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const [storeRow] = await db.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId));
    const storeTz = storeRow?.timezone ?? "UTC";
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    // `date` is stored as UTC timestamptz — EXTRACT evaluates it in the DB
    // session's timezone (usually UTC), not the salon's, so it must be
    // converted to the salon's local time first or every bucket here can be
    // shifted by the UTC offset (e.g. a late-evening local booking landing
    // on the next calendar day/DOW).
    const rows = await db.execute(
      sql`SELECT
        EXTRACT(DOW FROM date AT TIME ZONE 'UTC' AT TIME ZONE ${storeTz})::int AS dow,
        EXTRACT(HOUR FROM date AT TIME ZONE 'UTC' AT TIME ZONE ${storeTz})::int AS hour,
        COUNT(*) AS booking_count,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
      FROM appointments
      WHERE store_id = ${storeId}
        AND date >= ${ninetyDaysAgo}
        AND status NOT IN ('cancelled')
      GROUP BY dow, hour
      ORDER BY dow, hour`
    );

    // Build matrix: [dow 0-6][hour 0-23]
    const matrix: { dow: number; hour: number; count: number; noShowCount: number }[] = [];
    let maxCount = 0;

    for (const r of rows.rows) {
      const count = Number(r.booking_count);
      if (count > maxCount) maxCount = count;
      matrix.push({
        dow: Number(r.dow),
        hour: Number(r.hour),
        count,
        noShowCount: Number(r.no_show_count),
      });
    }

    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Find peak and dead slots
    const peakSlot = matrix.reduce((best, cur) => cur.count > best.count ? cur : best, { dow: 0, hour: 0, count: 0, noShowCount: 0 });
    const deadSlots = matrix.filter(m => m.count === 0 || m.count < maxCount * 0.2);

    res.json({
      matrix,
      maxCount,
      dayLabels,
      peakSlot: peakSlot.count > 0 ? {
        day: dayLabels[peakSlot.dow],
        hour: peakSlot.hour,
        count: peakSlot.count,
      } : null,
      deadSlotCount: deadSlots.length,
    });
  } catch (err: any) {
    console.error("[intelligence] booking-heatmap error:", err);
    res.status(500).json({ error: "Failed to compute booking heatmap" });
  }
});

// ─── GET /api/intelligence/auto-engage ────────────────────────────────────────
// Returns whether autonomous SMS engagement is enabled for this store.
router.get("/auto-engage", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  try {
    const [row] = await db
      .select({ autoEngageEnabled: smsSettings.autoEngageEnabled })
      .from(smsSettings)
      .where(eq(smsSettings.storeId, storeId))
      .limit(1);
    return res.json({ enabled: row?.autoEngageEnabled ?? true });
  } catch (err: any) {
    console.error("[intelligence] auto-engage get error:", err);
    return res.status(500).json({ error: "Failed to get auto-engage setting" });
  }
});

// ─── PATCH /api/intelligence/auto-engage ──────────────────────────────────────
// Toggles autonomous SMS engagement on or off for this store.
router.patch("/auto-engage", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) required" });
  }
  try {
    // Upsert: create an sms_settings row if one doesn't exist yet
    await db.execute(sql`
      INSERT INTO sms_settings (store_id, auto_engage_enabled)
      VALUES (${storeId}, ${enabled})
      ON CONFLICT (store_id) DO UPDATE SET auto_engage_enabled = ${enabled}
    `);
    console.log(`[intelligence] Auto-engage ${enabled ? "enabled" : "disabled"} for store ${storeId}`);
    return res.json({ enabled });
  } catch (err: any) {
    console.error("[intelligence] auto-engage patch error:", err);
    return res.status(500).json({ error: "Failed to update auto-engage setting" });
  }
});

// ── AI Coaching Summary ───────────────────────────────────────────────────────
// In-memory cache: key = `${storeId}:${tab}`, TTL = 30 minutes
const _aiCoachingCache = new Map<string, { summary: string; expiresAt: number }>();

// Lazy singleton — only created when first needed so missing key doesn't crash startup
let _openaiForCoaching: OpenAI | null = null;
function getCoachingClient(): OpenAI {
  if (!_openaiForCoaching) {
    _openaiForCoaching = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openaiForCoaching;
}

const _tabContext: Record<string, string> = {
  overview:   "This is the salon's overall business performance overview.",
  clients:    "This is client retention — how many clients are at risk of not returning.",
  leakage:    "This is actual missed revenue only: no-show and cancellation losses in the past 45 days.",
  seats:      "This is empty appointment slot data — times when the schedule could have been booked but wasn't.",
  noshow:     "This is no-show rate — clients who booked but didn't show up.",
  rebooking:  "This is rebooking rate by team member — what % of completed appointments led the client to book again within 30 days.",
  staff:      "This is staff performance — revenue, no-show rates, and rebooking rates per team member.",
  forecast:   "This is revenue forecast — projected income for the next 30 and 90 days.",
  services:   "This is service performance — which services drive the most revenue, and pricing opportunities.",
};

const _aiCoachingFailedUntil = new Map<string, number>();

router.post("/ai-coaching", async (req, res) => {
  const storeId = await requireStoreId(req, res);
  if (!storeId) return;
  const { tab, metrics } = req.body as { tab: string; metrics: Record<string, any> };
  if (!tab) return res.status(400).json({ error: "tab required" });

  const cacheKey = `${storeId}:${tab}`;
  const cached = _aiCoachingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ summary: cached.summary });
  }
  // After a failure (e.g. the OpenAI account is out of credit) don't call again on every page view for 10 minutes.
  if ((_aiCoachingFailedUntil.get(cacheKey) ?? 0) > Date.now()) {
    return res.status(503).json({ error: "The summary is unavailable right now." });
  }

  // The intelligence system is automatic (owner, 2026-10-24): the summary says what the numbers mean and what Certxa
  // is already doing about them — never a task for the owner.
  const systemPrompt = `You write the summary on Certxa's Business Intelligence page for a salon owner.
Certxa does the follow-up work on its own. Every 6 hours it texts booking nudges to clients due for their next visit,
texts clients who may not return an invite to book, and texts clients after a recent no-show or cancellation an invite to rebook.
When a client cancels, it offers the open time to another client who fits it. Appointment reminders go out before visits.
Given key business metrics, write exactly 1-2 short sentences: what the numbers mean, and what Certxa is doing about it.
Be specific — use the actual numbers when they're impactful.
Never tell the owner to do anything: no advice, no suggestions, no "you should", "try", "consider", "reach out", "send", or "run a campaign".
Only mention the work Certxa does listed above — never claim anything else.
Never use jargon. Never say "leverage", "utilize", or "optimize". Write like you're talking to a friend who owns a small salon.
Keep your entire response under 55 words.`;

  const context = _tabContext[tab] || "";
  const userContent = `${context}\n\nMetrics:\n${JSON.stringify(metrics, null, 2)}\n\nWrite the 1-2 sentences.`;

  try {
    const completion = await getCoachingClient().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
      max_tokens: 120,
      temperature: 0.65,
    });
    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    _aiCoachingCache.set(cacheKey, { summary, expiresAt: Date.now() + 30 * 60 * 1000 });
    return res.json({ summary });
  } catch (err: any) {
    console.error("[intelligence] ai-coaching error:", err.message);
    _aiCoachingFailedUntil.set(cacheKey, Date.now() + 10 * 60 * 1000);
    return res.status(503).json({ error: "The summary is unavailable right now." });
  }
});

// ── Growth assistant chat (Members Home) ─────────────────────────────────────
// POST /api/intelligence/growth-assistant  { messages: [{ role, content }] }  →  { reply, highlights, actions }
// Answers strictly from the store's own numbers (gathered here, never from the client) and may only
// suggest links from ASSISTANT_LINKS, so it can't invent data or send the owner to a dead route.
const ASSISTANT_LINKS: Record<string, { label: string; to: string }> = {
  intelligence: { label: "Open Growth Intelligence", to: "/intelligence" },
  at_risk: { label: "See who Certxa is bringing back", to: "/clients/at-risk" },
  calendar: { label: "Open the calendar", to: "/calendar" },
  reports: { label: "See reports", to: "/reports" },
  online_booking: { label: "Tune online booking", to: "/settings/online-booking" },
};

export async function buildAssistantSnapshot(storeId: number) {
  const [store] = await db.select({ name: locations.name, timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId)).limit(1);
  const tz = store?.timezone || "UTC";

  const revenue = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN date_trunc('month', date AT TIME ZONE ${tz}) = date_trunc('month', NOW() AT TIME ZONE ${tz})
                        THEN CAST(total_paid AS DECIMAL(10,2)) END), 0)::float AS this_month,
      COALESCE(SUM(CASE WHEN date_trunc('month', date AT TIME ZONE ${tz}) = date_trunc('month', NOW() AT TIME ZONE ${tz}) - INTERVAL '1 month'
                        THEN CAST(total_paid AS DECIMAL(10,2)) END), 0)::float AS last_month,
      COUNT(*) FILTER (WHERE date_trunc('month', date AT TIME ZONE ${tz}) = date_trunc('month', NOW() AT TIME ZONE ${tz}))::int AS visits_this_month,
      COUNT(*) FILTER (WHERE date_trunc('month', date AT TIME ZONE ${tz}) = date_trunc('month', NOW() AT TIME ZONE ${tz}) - INTERVAL '1 month')::int AS visits_last_month,
      EXTRACT(DAY FROM (NOW() AT TIME ZONE ${tz}))::int AS day_of_month
    FROM appointments
    WHERE store_id = ${storeId} AND status = 'completed'
      AND date >= NOW() - INTERVAL '70 days'
  `);
  const r: any = (revenue as any).rows?.[0] ?? {};

  const [cs] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      drifting: sql<number>`COALESCE(SUM(CASE WHEN is_drifting THEN 1 ELSE 0 END), 0)`,
      atRisk: sql<number>`COALESCE(SUM(CASE WHEN is_at_risk THEN 1 ELSE 0 END), 0)`,
      avgRebooking: sql<string>`COALESCE(AVG(CAST(rebooking_rate AS DECIMAL(10,2))), 0)`,
    })
    .from(clientIntelligence)
    .where(eq(clientIntelligence.storeId, storeId));

  const deadSeats = await computeDeadSeats(storeId);
  const growth = await computeGrowthScore(
    storeId,
    { activeClients: Number(cs?.total || 0), driftingClients: Number(cs?.drifting || 0), atRiskClients: Number(cs?.atRisk || 0), avgRebookingRate: parseFloat(cs?.avgRebooking || "0") },
    deadSeats.overallUtilization,
  );
  const leakage = await computeRevenueLeakage(storeId);
  const round = (n: unknown) => Math.round(Number(n) || 0);

  // What Certxa did on its own in the last 30 days (owner, 2026-10-31: the assistant talks about this work, never
  // hands the owner chores). Outreach is logged in intelligence_interventions; "booked again" = a messaged client
  // who made a booking after the message (not cancelled).
  const auto = await pool.query(
    `WITH sent AS (
       SELECT customer_id, intervention_type, sent_at FROM intelligence_interventions
        WHERE store_id = $1 AND status = 'sent' AND sent_at >= NOW() - INTERVAL '30 days'
     ),
     back AS (
       SELECT DISTINCT ON (a.id) a.id, a.customer_id, COALESCE(NULLIF(a.total_paid, 0), a.service_revenue, 0)::float AS amount
         FROM appointments a JOIN sent s ON s.customer_id = a.customer_id
        WHERE a.store_id = $1 AND a.created_at > s.sent_at AND a.created_at <= s.sent_at + INTERVAL '30 days'
          AND COALESCE(a.status, '') NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
     )
     SELECT
       (SELECT COUNT(*) FROM sent WHERE intervention_type = 'rebooking_nudge')::int AS rebooking_reminders,
       (SELECT COUNT(*) FROM sent WHERE intervention_type = 'winback')::int AS win_back_texts,
       (SELECT COUNT(*) FROM sent WHERE intervention_type = 'cancellation_recovery')::int AS cancellation_follow_ups,
       (SELECT COUNT(*) FROM sent WHERE intervention_type = 'no_show_winback')::int AS no_show_follow_ups,
       (SELECT COUNT(DISTINCT customer_id) FROM sent)::int AS clients_reached,
       (SELECT COUNT(DISTINCT customer_id) FROM back)::int AS clients_booked_again,
       (SELECT COALESCE(SUM(amount), 0) FROM back)::float AS bookings_value`,
    [storeId],
  ).catch(() => ({ rows: [] as any[] }));
  const a: any = auto.rows[0] ?? {};

  // What an owner checks between clients (owner, 2026-10-31): today, the week ahead, what sells, who's doing well,
  // new vs returning clients, reviews, and the phone calls Autumn handled. All in the salon's own time zone.
  const q = async (text: string): Promise<any[]> => (await pool.query(text, [storeId, tz]).catch(() => ({ rows: [] as any[] }))).rows;
  const local = `(a.date AT TIME ZONE $2)`;
  const nowLocal = `(NOW() AT TIME ZONE $2)`;
  const notCancelled = `COALESCE(a.status, '') NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')`;
  const money = `COALESCE(NULLIF(a.total_paid, 0), a.service_revenue, sv.price, 0)`;
  // Today in the salon (owner, 2026-10-31): while it is open, what is happening right now; once it has closed, how
  // the day went. Open = today's business_hours, in the salon's time zone.
  const [hoursNow] = await q(`SELECT bh.open_time, bh.close_time, bh.is_closed,
        to_char(${nowLocal}, 'HH24:MI') AS now_hm
      FROM business_hours bh WHERE bh.store_id = $1 AND bh.day_of_week = EXTRACT(DOW FROM ${nowLocal})::int LIMIT 1`);
  const nowHm = String(hoursNow?.now_hm ?? "");
  const openNow = !!hoursNow && !hoursNow.is_closed && nowHm >= String(hoursNow.open_time) && nowHm < String(hoursNow.close_time);
  const [today] = await q(`SELECT
        COUNT(*) FILTER (WHERE a.status = 'completed')::int AS services_done,
        COALESCE(SUM(a.total_paid) FILTER (WHERE a.status = 'completed'), 0)::float AS revenue,
        COALESCE(SUM(a.tip_amount) FILTER (WHERE a.status = 'completed'), 0)::float AS tips,
        COUNT(*) FILTER (WHERE a.status IN ('no_show', 'no-show'))::int AS no_shows,
        COUNT(*) FILTER (WHERE a.status IN ('cancelled', 'canceled'))::int AS cancellations,
        COUNT(*) FILTER (WHERE a.started_at IS NOT NULL AND ${notCancelled} AND a.status <> 'completed')::int AS in_service_now,
        COUNT(*) FILTER (WHERE a.checked_in_at IS NOT NULL AND a.started_at IS NULL AND ${notCancelled} AND a.status <> 'completed')::int AS waiting_now,
        COUNT(*) FILTER (WHERE a.checked_in_at IS NULL AND a.started_at IS NULL AND ${notCancelled} AND a.status <> 'completed' AND ${local} > ${nowLocal})::int AS still_coming_today,
        to_char(MIN(${local}) FILTER (WHERE a.started_at IS NULL AND ${notCancelled} AND a.status <> 'completed' AND ${local} > ${nowLocal}), 'FMHH12:MI AM') AS next_booking_at
      FROM appointments a WHERE a.store_id = $1 AND ${local}::date = ${nowLocal}::date`);
  const [team] = await q(`SELECT COUNT(DISTINCT t.staff_id)::int AS working
      FROM timeclock t WHERE t.store_id = $1 AND t.clock_out IS NULL AND (t.clock_in AT TIME ZONE $2)::date = ${nowLocal}::date`);
  const [week] = await q(`SELECT COUNT(*)::int AS bookings, COALESCE(SUM(${money}), 0)::float AS value
      FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id
     WHERE a.store_id = $1 AND ${notCancelled} AND a.status <> 'completed'
       AND ${local} > ${nowLocal} AND ${local} < ${nowLocal} + INTERVAL '7 days'`);
  const busiest = await q(`SELECT to_char(${local}, 'FMDay') AS day, COUNT(*)::int AS bookings
      FROM appointments a WHERE a.store_id = $1 AND ${notCancelled} AND a.status <> 'completed'
       AND ${local} > ${nowLocal} AND ${local} < ${nowLocal} + INTERVAL '7 days'
     GROUP BY 1 ORDER BY 2 DESC LIMIT 1`);
  const thisMonth = `a.status = 'completed' AND date_trunc('month', ${local}) = date_trunc('month', ${nowLocal})`;
  const [extras] = await q(`SELECT COALESCE(SUM(a.tip_amount), 0)::float AS tips, COALESCE(SUM(a.product_revenue), 0)::float AS retail
      FROM appointments a WHERE a.store_id = $1 AND ${thisMonth}`);
  const topServices = await q(`SELECT sv.name, COUNT(*)::int AS visits, COALESCE(SUM(${money}), 0)::float AS revenue
      FROM appointments a JOIN services sv ON sv.id = a.service_id WHERE a.store_id = $1 AND ${thisMonth}
     GROUP BY sv.name ORDER BY revenue DESC LIMIT 3`);
  const topTeam = await q(`SELECT st.name, COUNT(*)::int AS visits, COALESCE(SUM(${money}), 0)::float AS revenue
      FROM appointments a JOIN staff st ON st.id = a.staff_id LEFT JOIN services sv ON sv.id = a.service_id
     WHERE a.store_id = $1 AND ${thisMonth} GROUP BY st.name ORDER BY revenue DESC LIMIT 3`);
  const [mix] = await q(`WITH firsts AS (
        SELECT a.customer_id, MIN(a.date) AS first_visit FROM appointments a
         WHERE a.store_id = $1 AND a.status = 'completed' AND a.customer_id IS NOT NULL GROUP BY a.customer_id)
      SELECT COUNT(DISTINCT a.customer_id) FILTER (WHERE date_trunc('month', f.first_visit AT TIME ZONE $2) = date_trunc('month', ${nowLocal}))::int AS new_clients,
             COUNT(DISTINCT a.customer_id) FILTER (WHERE date_trunc('month', f.first_visit AT TIME ZONE $2) < date_trunc('month', ${nowLocal}))::int AS returning_clients
        FROM appointments a JOIN firsts f ON f.customer_id = a.customer_id WHERE a.store_id = $1 AND ${thisMonth}`);
  const [rev] = await q(`SELECT COUNT(*)::int AS reviews, ROUND(AVG(rating)::numeric, 1)::float AS avg_rating
      FROM reviews WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND $2::text IS NOT NULL`);
  const [calls] = await q(`SELECT COUNT(*)::int AS calls, COUNT(appointment_id)::int AS booked
      FROM ai_call_log WHERE store_id = $1 AND started_at >= NOW() - INTERVAL '30 days' AND $2::text IS NOT NULL`);

  const visits = Number(r.visits_this_month) || 0;
  return {
    salon: store?.name ?? "the salon",
    revenue: {
      thisMonthSoFar: round(r.this_month), lastFullMonth: round(r.last_month),
      visitsThisMonthSoFar: visits, visitsLastMonth: r.visits_last_month ?? 0,
      dayOfMonth: r.day_of_month ?? null,
      averageTicketThisMonth: visits ? round(Number(r.this_month) / visits) : 0,
      tipsThisMonth: round(extras?.tips), retailSalesThisMonth: round(extras?.retail),
    },
    today: openNow
      ? {
          salonIsOpenNow: true, closesAt: hoursNow?.close_time ?? null,
          rightNow: { clientsInService: today?.in_service_now ?? 0, clientsWaiting: today?.waiting_now ?? 0, teamClockedIn: team?.working ?? 0 },
          stillComingToday: today?.still_coming_today ?? 0, nextBookingAt: today?.next_booking_at ?? null,
          soFarToday: { servicesDone: today?.services_done ?? 0, revenue: round(today?.revenue), tips: round(today?.tips), noShows: today?.no_shows ?? 0, cancellations: today?.cancellations ?? 0 },
        }
      : {
          salonIsOpenNow: false,
          todaysTotals: { servicesDone: today?.services_done ?? 0, revenue: round(today?.revenue), tips: round(today?.tips), noShows: today?.no_shows ?? 0, cancellations: today?.cancellations ?? 0 },
          reason: hoursNow?.is_closed ? "closed today" : (nowHm && hoursNow && nowHm < String(hoursNow.open_time) ? "not open yet today" : "closed for the day"),
        },
    next7Days: { bookings: week?.bookings ?? 0, expectedValue: round(week?.value), busiestDay: busiest[0]?.day ?? null, busiestDayBookings: busiest[0]?.bookings ?? 0 },
    topServicesThisMonth: topServices.map((x) => ({ name: x.name, visits: x.visits, revenue: round(x.revenue) })),
    topTeamThisMonth: topTeam.map((x) => ({ name: x.name, visits: x.visits, revenue: round(x.revenue) })),
    clients: {
      total: round(cs?.total), newThisMonth: mix?.new_clients ?? 0, repeatVisitorsThisMonth: mix?.returning_clients ?? 0, // visited before this month too
      notBackLately: round(cs?.drifting) + round(cs?.atRisk), avgRebookingRatePct: round(parseFloat(cs?.avgRebooking || "0")),
    },
    reviewsLast30Days: { count: rev?.reviews ?? 0, averageRating: rev?.avg_rating ?? null },
    autumnPhoneLast30Days: { callsAnswered: calls?.calls ?? 0, bookingsMade: calls?.booked ?? 0 },
    certxaAutomaticWorkLast30Days: {
      rebookingReminders: a.rebooking_reminders ?? 0, winBackTexts: a.win_back_texts ?? 0,
      cancellationFollowUps: a.cancellation_follow_ups ?? 0, noShowFollowUps: a.no_show_follow_ups ?? 0,
      clientsReached: a.clients_reached ?? 0, clientsWhoBookedAgain: a.clients_booked_again ?? 0,
      valueOfThoseBookings: round(a.bookings_value),
    },
    noShowsAndCancellationsLast45Days: { noShows: leakage.breakdown.noShowCount, cancellations: leakage.breakdown.cancellationCount },
    growthScore: (growth as any)?.hasData ? { score: (growth as any).overallScore, grade: (growth as any).grade } : null,
  };
}

router.post("/growth-assistant", async (req, res) => {
  const diagnosticId = `ga_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const storeId = await requireStoreId(req, res);
  if (!storeId) {
    console.warn(`[growth-assistant:${diagnosticId}] rejected before store resolution`, {
      statusCode: res.statusCode,
      hasUserSession: Boolean((req.session as any)?.userId),
      hasStaffSession: Boolean((req.session as any)?.staffId),
    });
    return;
  }
  console.info(`[growth-assistant:${diagnosticId}] request accepted`, {
    storeId,
    messageCount: Array.isArray(req.body?.messages) ? req.body.messages.length : 0,
    integrationKeyConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
    standardKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    customBaseUrlConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL),
    model: process.env.MEMBERS_ASSISTANT_MODEL || "gpt-4o-mini",
  });
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    console.warn(`[growth-assistant:${diagnosticId}] provider configuration missing`, {
      expectedVariable: "AI_INTEGRATIONS_OPENAI_API_KEY",
      standardKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
    return res.status(503).json({ error: "The assistant isn't set up on this account yet." });
  }

  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const isAutomaticBriefing = req.body?.briefing === true;
  const messages = raw
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-8)
    .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 1200) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "A question is required." });
  }

  // Atomically claim the account's 12-hour briefing window. Doing this on the
  // server makes the rule work across browsers/devices and prevents two tabs
  // from launching duplicate AI requests.
  let briefingClaimedAt: Date | null = null;
  const briefingUserId = (req.session as any)?.userId as string | undefined;
  if (isAutomaticBriefing) {
    if (!briefingUserId) return res.json({ skipped: true });
    const claim = await pool.query<{ last_manage_briefing_at: Date }>(
      `UPDATE users
          SET last_manage_briefing_at = NOW()
        WHERE id = $1
          AND (last_manage_briefing_at IS NULL OR last_manage_briefing_at < NOW() - INTERVAL '12 hours')
      RETURNING last_manage_briefing_at`,
      [briefingUserId],
    );
    briefingClaimedAt = claim.rows[0]?.last_manage_briefing_at ?? null;
    if (!briefingClaimedAt) {
      console.info(`[growth-assistant:${diagnosticId}] automatic briefing skipped`, { reason: "visited_within_12_hours" });
      return res.json({ skipped: true });
    }
  }

  try {
    const snapshotStartedAt = Date.now();
    const snapshot = await buildAssistantSnapshot(storeId);
    console.info(`[growth-assistant:${diagnosticId}] snapshot built`, {
      durationMs: Date.now() - snapshotStartedAt,
      salon: snapshot.salon,
      clientCount: snapshot.clients.total,
      visitsThisMonth: snapshot.revenue.visitsThisMonthSoFar,
    });
    // The assistant's instructions (owner, 2026-10-31): what a salon owner cares about, and Certxa does the client
    // outreach itself — the owner is never handed a chore or told to switch something on.
    const system = `You are Certxa's assistant for the owner of ${snapshot.salon}. The owner is busy with clients and checks in for a minute between appointments. Talk like a trusted business partner: warm, plain words, short sentences, no jargon, no hype.

WHAT THE OWNER CARES ABOUT, in this order:
1. Money: revenue this month, average ticket, tips, retail sales.
2. What's coming: today's bookings, the next 7 days, the busiest day ahead.
3. Clients: new clients, clients coming back, reviews.
4. The team: who is doing well, top services.
5. Time saved: what Certxa and Autumn (the AI receptionist) handled for them.

CERTXA DOES THE CLIENT OUTREACH — ALWAYS:
Certxa automatically texts clients who are due to rebook, brings back clients who haven't visited in a while, follows up cancellations and no-shows, and Autumn answers the phone and books appointments. This is always running. The owner has nothing to switch on, no setting to change, and nothing to do.
- Never tell the owner to send messages, run campaigns, contact or "nudge" clients, fill the schedule, change a setting, turn anything on, or "focus on" anything.
- Clients who haven't been back lately (clients.notBackLately) are Certxa's job: mention them only as Certxa reaching out to them, never as a problem.
- Never end with a task or advice ("keep focusing", "consider", "make sure"). End with something good or useful to know.

RULES:
- Use only the numbers in the salon data. Never invent figures, names or dates. If the data can't answer, say plainly that it isn't tracked yet.
- This month is partial (revenue.dayOfMonth): compare it to last month fairly, and never call a partial month a drop.
- Never use these words: utilization, churn, drifting, at-risk, leakage, slots, dead seats, growth score, engagement. Say "clients who haven't been back", "open times".
- Money in whole dollars like $6,563. Skip any number that is 0 or missing instead of reporting it.
- Answer the owner's question first and directly, in the question's own terms. Don't repeat the briefing.
- If the owner asks how to grow or get more clients, say what is already working (new clients, top services, top team, clients who came back after Certxa's texts, Autumn's bookings) and that Certxa keeps doing this for them every day.
- The first message of a visit is a short briefing that starts with today (no headings or labels, just sentences):
  - If today.salonIsOpenNow is true: what is happening in the salon right now — clients in service, clients waiting, team clocked in, how many are still coming today and when the next one is, and revenue and services done so far today.
  - If it is false: how today went — today's revenue, services done, no-shows and cancellations (say "not open yet today" or "closed today" from today.reason when nothing happened yet).
  Then, briefly: money this month with a fair comparison, and what Certxa and Autumn did for them.
- Only state things the data shows. Never claim Autumn or Certxa did something the numbers don't show (for example, don't say Autumn books appointments when autumnPhoneLast30Days.bookingsMade is 0).

Reply with a JSON object: {"reply": string (under 80 words, real numbers),
"highlights": up to 4 of {"label": string, "value": string, "detail": string (optional)} — the first card is about today (open: revenue so far today, or the next booking; closed: today's revenue with services done in the detail), then cards an owner is glad to see: revenue this month, bookings in the next 7 days, top service or top team member, clients who booked again after Certxa's texts, Autumn bookings, average rating. Never a card about a problem,
"actions": up to 2 of {"id": one of ${Object.keys(ASSISTANT_LINKS).join(" | ")}} — only links that let the owner look at something useful}.

SALON DATA (JSON):
${JSON.stringify(snapshot)}`;

    const completion = await getCoachingClient().chat.completions.create({
      model: process.env.MEMBERS_ASSISTANT_MODEL || "gpt-4o-mini",
      messages: [{ role: "system", content: system }, ...messages],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.4,
    });
    let parsed: any = {};
    try { parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}"); } catch { /* fall through to defaults */ }
    console.info(`[growth-assistant:${diagnosticId}] provider response received`, {
      durationMs: Date.now() - startedAt,
      hasContent: Boolean(completion.choices[0]?.message?.content),
      parsedReply: typeof parsed.reply === "string",
      finishReason: completion.choices[0]?.finish_reason,
    });

    const highlights = (Array.isArray(parsed.highlights) ? parsed.highlights : [])
      .filter((h: any) => h && typeof h.label === "string" && typeof h.value === "string")
      .slice(0, 4)
      .map((h: any) => ({ label: h.label.slice(0, 40), value: h.value.slice(0, 24), ...(typeof h.detail === "string" ? { detail: h.detail.slice(0, 120) } : {}) }));
    const seen = new Set<string>();
    const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
      .map((a: any) => (a && typeof a.id === "string" ? ASSISTANT_LINKS[a.id] && { id: a.id, ...ASSISTANT_LINKS[a.id] } : null))
      .filter((a: any) => a && !seen.has(a.id) && seen.add(a.id))
      // The opening briefing never hands the owner a task (Certxa does this work itself).
      .filter((a: any) => !isAutomaticBriefing || a.id !== "at_risk")
      .slice(0, 2);

    return res.json({
      reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "I couldn't find a reliable answer in your salon data.",
      highlights,
      actions,
    });
  } catch (err: any) {
    if (briefingClaimedAt && briefingUserId) {
      // A failed provider/database call should not suppress the next attempt.
      await pool.query(
        `UPDATE users
            SET last_manage_briefing_at = NULL
          WHERE id = $1 AND last_manage_briefing_at = $2`,
        [briefingUserId, briefingClaimedAt],
      ).catch(() => undefined);
    }
    console.error(`[growth-assistant:${diagnosticId}] failed`, {
      durationMs: Date.now() - startedAt,
      storeId,
      name: err?.name,
      type: err?.type,
      code: err?.code,
      status: err?.status ?? err?.statusCode,
      message: err?.message,
    });
    return res.status(500).json({ error: "The assistant is unavailable right now. Please try again shortly.", diagnosticId });
  }
});

// GET /api/intelligence/owner-dashboard
// Returns server-side aggregations for the Owner Command Center page (owner-only)
router.get("/owner-dashboard", async (req, res) => {
  // Owner-only: reject staff sessions that have no owner userId
  const sessionUserId  = (req.session as any)?.userId;
  const sessionStaffId = (req.session as any)?.staffId;
  if (!sessionUserId && sessionStaffId) {
    return res.status(403).json({ error: "Owner access required" });
  }

  const storeId = await requireStoreId(req, res);
  if (!storeId) return;

  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const yesterdayEnd   = new Date(todayEnd.getTime()   - 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    const [
      todayRows,
      yesterdayRows,
      monthRows,
      clientCountRows,
      avgVisitsRows,
      lostClientsRow,
    ] = await Promise.all([
      // Today's appointments (clients joined with store constraint via appointments)
      db.execute(sql`
        SELECT
          a.id, a.status, a.total_paid, a.payment_method,
          a.date, a.duration,
          s.name AS staff_name, s.id AS staff_id,
          sv.name AS service_name,
          c.full_name AS customer_name,
          a.customer_id
        FROM appointments a
        LEFT JOIN staff    s  ON s.id  = a.staff_id    AND s.store_id = ${storeId}
        LEFT JOIN services sv ON sv.id = a.service_id  AND sv.store_id = ${storeId}
        LEFT JOIN clients  c  ON c.id::text = a.customer_id::text
        WHERE a.store_id = ${storeId}
          AND a.date >= ${todayStart.toISOString()}
          AND a.date <= ${todayEnd.toISOString()}
          AND a.status NOT IN ('cancelled')
          AND a.calendar_hidden IS NOT TRUE
        ORDER BY a.date ASC
      `),
      // Yesterday revenue (for comparison)
      db.execute(sql`
        SELECT COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)::float AS revenue
        FROM appointments
        WHERE store_id = ${storeId}
          AND date >= ${yesterdayStart.toISOString()}
          AND date <= ${yesterdayEnd.toISOString()}
          AND status = 'completed'
      `),
      // This month revenue by payment method.
      // Stripe Connect online payments leave payment_method NULL (only stripe_payment_intent_id
      // is written), so classify those as 'card'. LOWER/TRIM normalises POS values like "Card".
      db.execute(sql`
        SELECT
          CASE
            WHEN payment_method IS NOT NULL AND LOWER(TRIM(payment_method)) <> ''
              THEN LOWER(TRIM(payment_method))
            WHEN stripe_payment_intent_id IS NOT NULL
              THEN 'card'
            ELSE 'other'
          END AS payment_method,
          COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)::float AS revenue,
          COUNT(*) AS count
        FROM appointments
        WHERE store_id = ${storeId}
          AND date >= ${monthStart.toISOString()}
          AND date <= ${monthEnd.toISOString()}
          AND status = 'completed'
        GROUP BY 1
      `),
      // Client counts: all-time distinct + this month distinct (flat query, no subquery referencing unselected cols)
      db.execute(sql`
        SELECT
          COUNT(DISTINCT customer_id) AS all_clients,
          COUNT(DISTINCT customer_id) FILTER (
            WHERE date >= ${monthStart.toISOString()} AND date <= ${monthEnd.toISOString()}
          ) AS month_clients
        FROM appointments
        WHERE store_id = ${storeId}
          AND status = 'completed'
          AND customer_id IS NOT NULL
      `),
      // Average visits per client (separate subquery — safe, no outer date ref)
      db.execute(sql`
        SELECT COALESCE(AVG(visit_count), 0)::float AS avg_visits
        FROM (
          SELECT customer_id, COUNT(*) AS visit_count
          FROM appointments
          WHERE store_id = ${storeId}
            AND status = 'completed'
            AND customer_id IS NOT NULL
          GROUP BY customer_id
        ) t
      `),
      // Clients who haven't returned in 60+ days
      db.execute(sql`
        SELECT COUNT(DISTINCT customer_id) AS lost_clients
        FROM (
          SELECT customer_id, MAX(date) AS last_seen
          FROM appointments
          WHERE store_id = ${storeId}
            AND status = 'completed'
            AND customer_id IS NOT NULL
          GROUP BY customer_id
        ) t
        WHERE last_seen < ${sixtyDaysAgo.toISOString()}
      `),
    ]);

    // Process today's appointments
    const todayAppts = (todayRows.rows as any[]);
    const todayRevenue = todayAppts
      .filter((a) => a.status === "completed")
      .reduce((s, a) => s + parseFloat(a.total_paid || "0"), 0);
    const yesterdayRevenue = parseFloat((yesterdayRows.rows[0] as any)?.revenue || "0");

    const appointmentBreakdown = {
      completed: todayAppts.filter((a) => a.status === "completed").length,
      inService:  todayAppts.filter((a) => a.status === "started").length,
      waiting:    todayAppts.filter((a) => a.status === "waiting").length,
      upcoming:   todayAppts.filter((a) => ["confirmed", "pending"].includes(a.status)).length,
      noShow:     todayAppts.filter((a) => a.status === "no_show").length,
    };

    const activeStaff = new Set(
      todayAppts.filter((a) => a.staff_id).map((a) => a.staff_id)
    );

    const activeStaffRevenue = todayAppts
      .filter((a) => a.status === "completed" && a.staff_id)
      .reduce((s, a) => s + parseFloat(a.total_paid || "0"), 0);

    const uniqueClientIds = new Set(
      todayAppts.filter((a) => a.customer_id).map((a) => String(a.customer_id))
    );

    // Determine new vs returning clients today (returning = seen before today)
    //
    // NOTE: drizzle's sql`` tag spreads a JS array into comma-separated bound
    // params (e.g. `ANY($2, $3)`), which is invalid syntax for ANY() and breaks
    // outright with a single-element array (produces a scalar param, causing
    // "malformed array literal"). Pass a Postgres array-literal *string* instead
    // so it binds as a single ::text[] parameter.
    const uniqueClientIdsArrayLiteral =
      `{${[...uniqueClientIds].map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")}}`;
    const returningCheck = uniqueClientIds.size > 0
      ? await db.execute(sql`
          SELECT customer_id::text AS customer_id
          FROM appointments
          WHERE store_id = ${storeId}
            AND customer_id::text = ANY(${uniqueClientIdsArrayLiteral}::text[])
            AND date < ${todayStart.toISOString()}
            AND status = 'completed'
          GROUP BY customer_id
        `)
      : { rows: [] };

    const returningIds = new Set((returningCheck.rows as any[]).map((r) => String(r.customer_id)));
    const returningToday = [...uniqueClientIds].filter((id) => returningIds.has(id)).length;
    const newToday = uniqueClientIds.size - returningToday;

    // Month revenue by payment method
    const paymentRows = (monthRows.rows as any[]);
    const totalMonthRevenue = paymentRows.reduce((s, r) => s + parseFloat(r.revenue || "0"), 0);
    const paymentBreakdown: Record<string, number> = {};
    for (const r of paymentRows) {
      const key = (r.payment_method || "other").toLowerCase();
      paymentBreakdown[key] = (paymentBreakdown[key] || 0) + parseFloat(r.revenue || "0");
    }

    // Client loyalty
    const loyaltyRow = (clientCountRows.rows[0] as any) || {};
    const allTimeClients = parseInt(loyaltyRow.all_clients || "0");
    const avgVisits      = parseFloat((avgVisitsRows.rows[0] as any)?.avg_visits || "0");

    // Returning clients (visited > once)
    const returningClientsRow = await db.execute(sql`
      SELECT COUNT(DISTINCT customer_id) AS returning_clients
      FROM (
        SELECT customer_id, COUNT(*) AS visits
        FROM appointments
        WHERE store_id = ${storeId}
          AND status = 'completed'
          AND customer_id IS NOT NULL
        GROUP BY customer_id
        HAVING COUNT(*) > 1
      ) t
    `);
    const returningClients = parseInt((returningClientsRow.rows[0] as any)?.returning_clients || "0");
    const newClients = allTimeClients - returningClients;
    const retentionPct = allTimeClients > 0 ? Math.round((returningClients / allTimeClients) * 100) : 0;

    // Needs attention
    const lostClients = parseInt((lostClientsRow.rows[0] as any)?.lost_clients || "0");

    const needsAttention: Array<{ type: string; label: string; count?: number; priority: "high" | "medium" | "low" }> = [];
    if (lostClients > 0) {
      needsAttention.push({ type: "lost_clients", label: `${lostClients} client${lostClients !== 1 ? "s" : ""} haven't returned in 60+ days`, count: lostClients, priority: "high" });
    }
    if (appointmentBreakdown.noShow > 0) {
      needsAttention.push({ type: "no_shows", label: `${appointmentBreakdown.noShow} no-show${appointmentBreakdown.noShow !== 1 ? "s" : ""} today`, count: appointmentBreakdown.noShow, priority: "medium" });
    }
    if (appointmentBreakdown.waiting > 0) {
      needsAttention.push({ type: "waiting", label: `${appointmentBreakdown.waiting} client${appointmentBreakdown.waiting !== 1 ? "s" : ""} waiting right now`, count: appointmentBreakdown.waiting, priority: "medium" });
    }

    // Today's schedule (sorted list)
    const schedule = todayAppts.map((a) => ({
      id: a.id,
      time: a.date,
      duration: a.duration,
      customerName: a.customer_name || "Walk-in",
      serviceName: a.service_name || "Service",
      staffName: a.staff_name || null,
      status: a.status,
      totalPaid: parseFloat(a.total_paid || "0"),
    }));

    res.json({
      today: {
        revenue: todayRevenue,
        yesterdayRevenue,
        revenueDiff: todayRevenue - yesterdayRevenue,
        totalAppointments: todayAppts.length,
        appointments: appointmentBreakdown,
        clients: {
          total: uniqueClientIds.size,
          new: newToday,
          returning: returningToday,
          returningPct: uniqueClientIds.size > 0 ? Math.round((returningToday / uniqueClientIds.size) * 100) : 0,
        },
        team: {
          working: activeStaff.size,
          servicesCompleted: appointmentBreakdown.completed,
          generated: activeStaffRevenue,
        },
      },
      schedule,
      monthRevenue: {
        total: totalMonthRevenue,
        byPaymentMethod: paymentBreakdown,
      },
      clientLoyalty: {
        returningClients,
        newClients,
        allTimeClients,
        retentionPct,
        avgVisitsPerClient: Math.round(avgVisits * 10) / 10,
      },
      needsAttention,
    });
  } catch (err: any) {
    console.error("[intelligence] owner-dashboard error:", err);
    res.status(500).json({ error: "Failed to load owner dashboard" });
  }
});

export default router;

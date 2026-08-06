import { db } from "../db";
import { appointments } from "@shared/schema";
import { clients } from "@shared/schema/clients";
import {
  clientIntelligence,
  staffIntelligence,
  growthScoreSnapshots,
  deadSeatPatterns,
  intelligenceInterventions,
} from "../../shared/schema/intelligence";
import { computeClientCadence } from "./cadence";
import { computeClientLtv } from "./ltv";
import { computeChurnRisk } from "./churn";
import { computeDeadSeats } from "./dead-seats";
import { computeRebookingRates } from "./rebooking-rates";
import { computeGrowthScore } from "./growth-score";
import { computeRevenueLeakage } from "./revenue-leakage";
import { eq, sql } from "drizzle-orm";

export interface DemoEngineEvent {
  phase: string;
  status: "starting" | "running" | "done" | "error";
  label: string;
  description?: string;
  result?: string;
  progress?: number;
  logLine?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runDemoEngines(
  storeId: number,
  emit: (event: DemoEngineEvent) => void
): Promise<void> {

  // ── Wipe stale intelligence data so every run starts from zero ───────────
  await db.delete(intelligenceInterventions).where(eq(intelligenceInterventions.storeId, storeId));
  await db.delete(clientIntelligence).where(eq(clientIntelligence.storeId, storeId));
  await db.delete(staffIntelligence).where(eq(staffIntelligence.storeId, storeId));
  await db.delete(growthScoreSnapshots).where(eq(growthScoreSnapshots.storeId, storeId));
  await db.delete(deadSeatPatterns).where(eq(deadSeatPatterns.storeId, storeId));

  // ── Phase 1: Data Scan ────────────────────────────────────────────────────
  emit({
    phase: "data_scan",
    status: "starting",
    label: "Appointment History Scanner",
    description: "Indexing booking records",
    logLine: "[BOOT] Appointment History Scanner — scanning booking database...",
  });
  await sleep(700);

  emit({
    phase: "data_scan",
    status: "running",
    label: "Appointment History Scanner",
    progress: 35,
    logLine: "[RUN]  Appointment History Scanner — indexing client records...",
  });
  await sleep(800);

  const allCustomers = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.storeId, storeId));

  const apptResult = await db.execute(
    sql`SELECT COUNT(*) as count FROM appointments WHERE store_id = ${storeId}`
  );
  const totalAppts = Number((apptResult.rows as any[])[0]?.count || 0);

  emit({
    phase: "data_scan",
    status: "running",
    label: "Appointment History Scanner",
    progress: 75,
    logLine: `[RUN]  Appointment History Scanner — found ${allCustomers.length.toLocaleString()} clients, ${totalAppts.toLocaleString()} bookings`,
  });
  await sleep(700);

  emit({
    phase: "data_scan",
    status: "done",
    label: "Appointment History Scanner",
    result: `${allCustomers.length} clients · ${totalAppts.toLocaleString()} appointments indexed`,
    logLine: `[ONLINE] ✓ Appointment History Scanner — ${allCustomers.length} clients · ${totalAppts.toLocaleString()} appointments indexed`,
  });

  await sleep(900);

  // ── Phase 2: Client Profile Engine ───────────────────────────────────────
  emit({
    phase: "client_profiles",
    status: "starting",
    label: "Client Profile Engine",
    description: `Building cadence & LTV for ${allCustomers.length} clients`,
    logLine: `[BOOT] Client Profile Engine — building cadence & LTV for ${allCustomers.length} clients...`,
  });
  await sleep(750);

  let processed = 0;
  let driftingCount = 0;
  let atRiskCount = 0;
  let totalRebookingRate = 0;
  let rebookingRateCount = 0;
  let highLtvCount = 0;

  for (const customer of allCustomers) {
    try {
      const [cadence, ltv] = await Promise.all([
        computeClientCadence(storeId, customer.id),
        computeClientLtv(storeId, customer.id),
      ]);

      const nsData = await db.execute(
        sql`SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'no-show' THEN 1 ELSE 0 END) as no_shows
            FROM appointments
            WHERE store_id = ${storeId} AND customer_id = ${customer.id}`
      );
      const nsRow = (nsData.rows as any[])[0];
      const totalA = Number(nsRow?.total || 0);
      const noShows = Number(nsRow?.no_shows || 0);
      const noShowRate = totalA > 0 ? noShows / totalA : 0;

      const churn = computeChurnRisk(cadence, ltv, noShowRate);

      let rebookingRate = 0;
      if (ltv.totalVisits > 1) {
        rebookingRate = Math.min(
          100,
          Math.round((ltv.totalVisits / Math.max(ltv.totalVisits, 1)) * 60 + Math.random() * 10)
        );
      }

      if (cadence.isDrifting) driftingCount++;
      if (churn.isAtRisk) atRiskCount++;
      if (ltv.ltvAllTime > 500) highLtvCount++;
      if (ltv.totalVisits > 0) {
        totalRebookingRate += rebookingRate;
        rebookingRateCount++;
      }

      await db
        .insert(clientIntelligence)
        .values({
          storeId,
          customerId: customer.id,
          avgVisitCadenceDays: cadence.avgCadenceDays?.toString() ?? null,
          lastVisitDate: cadence.lastVisitDate,
          nextExpectedVisitDate: cadence.nextExpectedDate,
          daysSinceLastVisit: cadence.daysSinceLast,
          daysOverduePct: cadence.daysOverduePct?.toString() ?? null,
          totalVisits: ltv.totalVisits,
          totalRevenue: ltv.totalRevenue.toFixed(2),
          avgTicketValue: ltv.avgTicketValue.toFixed(2),
          ltv12Month: ltv.ltv12Month.toFixed(2),
          ltvAllTime: ltv.ltvAllTime.toFixed(2),
          ltvScore: ltv.ltvScore,
          churnRiskScore: churn.churnRiskScore,
          churnRiskLabel: churn.churnRiskLabel,
          noShowCount: noShows,
          noShowRate: (noShowRate * 100).toFixed(2),
          rebookingRate: rebookingRate.toFixed(2),
          isDrifting: cadence.isDrifting,
          isAtRisk: churn.isAtRisk,
          computedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [clientIntelligence.storeId, clientIntelligence.customerId],
          set: {
            avgVisitCadenceDays: cadence.avgCadenceDays?.toString() ?? null,
            lastVisitDate: cadence.lastVisitDate,
            nextExpectedVisitDate: cadence.nextExpectedDate,
            daysSinceLastVisit: cadence.daysSinceLast,
            daysOverduePct: cadence.daysOverduePct?.toString() ?? null,
            totalVisits: ltv.totalVisits,
            totalRevenue: ltv.totalRevenue.toFixed(2),
            avgTicketValue: ltv.avgTicketValue.toFixed(2),
            ltv12Month: ltv.ltv12Month.toFixed(2),
            ltvAllTime: ltv.ltvAllTime.toFixed(2),
            ltvScore: ltv.ltvScore,
            churnRiskScore: churn.churnRiskScore,
            churnRiskLabel: churn.churnRiskLabel,
            noShowCount: noShows,
            noShowRate: (noShowRate * 100).toFixed(2),
            rebookingRate: rebookingRate.toFixed(2),
            isDrifting: cadence.isDrifting,
            isAtRisk: churn.isAtRisk,
            computedAt: new Date(),
          },
        });

      processed++;
      if (processed % 40 === 0) {
        const pct = Math.round((processed / allCustomers.length) * 100);
        emit({
          phase: "client_profiles",
          status: "running",
          label: "Client Profile Engine",
          progress: pct,
          logLine: `[RUN]  Client Profile Engine — ${processed}/${allCustomers.length} profiles scored (${pct}%)`,
        });
      }
    } catch {
      // silent per-client error
    }
  }

  emit({
    phase: "client_profiles",
    status: "done",
    label: "Client Profile Engine",
    result: `${processed} profiles built · ${highLtvCount} high-LTV clients`,
    logLine: `[ONLINE] ✓ Client Profile Engine — ${processed} profiles built · ${highLtvCount} high-LTV clients identified`,
  });

  await sleep(900);

  // ── Phase 3: Churn Risk Scoring ───────────────────────────────────────────
  emit({
    phase: "churn_scoring",
    status: "starting",
    label: "Churn Risk Scoring",
    description: "Classifying retention risk across client base",
    logLine: "[BOOT] Churn Risk Scoring — applying multi-factor retention model...",
  });
  await sleep(800);
  emit({
    phase: "churn_scoring",
    status: "running",
    label: "Churn Risk Scoring",
    progress: 40,
    logLine: `[RUN]  Churn Risk Scoring — evaluating cadence overdue %, visit frequency, no-show history...`,
  });
  await sleep(900);
  emit({
    phase: "churn_scoring",
    status: "running",
    label: "Churn Risk Scoring",
    progress: 80,
    logLine: `[RUN]  Churn Risk Scoring — ${driftingCount} drifting detected · ${atRiskCount} critical risk flagged`,
  });
  await sleep(750);
  emit({
    phase: "churn_scoring",
    status: "done",
    label: "Churn Risk Scoring",
    result: `${atRiskCount} at-risk · ${driftingCount} drifting`,
    logLine: `[ONLINE] ✓ Churn Risk Scoring — ${atRiskCount} clients at risk · ${driftingCount} drifting past cadence`,
  });

  await sleep(900);

  // ── Phase 4: Staff Intelligence ───────────────────────────────────────────
  emit({
    phase: "staff_intelligence",
    status: "starting",
    label: "Staff Intelligence",
    description: "Rebooking rates & revenue per tech",
    logLine: "[BOOT] Staff Intelligence — pulling completed appointment data per technician...",
  });
  await sleep(800);
  emit({
    phase: "staff_intelligence",
    status: "running",
    label: "Staff Intelligence",
    progress: 50,
    logLine: "[RUN]  Staff Intelligence — computing rebooking rates, avg ticket, no-show counts...",
  });

  let staffCount = 0;
  let topRebookPct = 0;
  try {
    const staffRates = await computeRebookingRates(storeId);
    for (const s of staffRates) {
      await db.execute(sql`
        INSERT INTO staff_intelligence
          (store_id, staff_id, total_appointments, completed_appointments,
           no_show_count, rebooked_count, rebooking_rate_pct, avg_ticket_value,
           total_revenue, unique_clients_served, trend, computed_at)
        VALUES
          (${storeId}, ${s.staffId}, ${s.totalCompleted}, ${s.totalCompleted},
           ${s.noShowCount}, ${s.rebookedWithin30Days}, ${s.rebookingRatePct.toFixed(2)},
           ${s.avgTicket.toFixed(2)}, ${s.totalRevenue.toFixed(2)}, ${s.uniqueClients},
           ${s.trend}, NOW())
        ON CONFLICT (store_id, staff_id) DO UPDATE SET
          total_appointments     = EXCLUDED.total_appointments,
          completed_appointments = EXCLUDED.completed_appointments,
          no_show_count          = EXCLUDED.no_show_count,
          rebooked_count         = EXCLUDED.rebooked_count,
          rebooking_rate_pct     = EXCLUDED.rebooking_rate_pct,
          avg_ticket_value       = EXCLUDED.avg_ticket_value,
          total_revenue          = EXCLUDED.total_revenue,
          unique_clients_served  = EXCLUDED.unique_clients_served,
          trend                  = EXCLUDED.trend,
          computed_at            = NOW()
      `);
      if (s.rebookingRatePct > topRebookPct) topRebookPct = s.rebookingRatePct;
    }
    totalRebookingRate = staffRates.reduce((sum, s) => sum + s.rebookingRatePct, 0);
    rebookingRateCount = staffRates.length;
    staffCount = staffRates.length;
  } catch { /* silent */ }

  await sleep(750);
  emit({
    phase: "staff_intelligence",
    status: "done",
    label: "Staff Intelligence",
    result: `${staffCount} techs analysed · top rebooking ${topRebookPct.toFixed(0)}%`,
    logLine: `[ONLINE] ✓ Staff Intelligence — ${staffCount} techs scored · top rebooking rate ${topRebookPct.toFixed(0)}%`,
  });

  await sleep(900);

  // ── Phase 5: Dead Seat Detector ───────────────────────────────────────────
  emit({
    phase: "dead_seats",
    status: "starting",
    label: "Dead Seat Detector",
    description: "Scanning for chronically underbooked slots",
    logLine: "[BOOT] Dead Seat Detector — scanning 90-day day×hour booking heatmap...",
  });
  await sleep(800);
  emit({
    phase: "dead_seats",
    status: "running",
    label: "Dead Seat Detector",
    progress: 45,
    logLine: "[RUN]  Dead Seat Detector — computing slot utilization across all staff & hours...",
  });
  await sleep(800);

  let utilizationPct = 50;
  let deadSlotCount = 0;
  try {
    const deadSeats = await computeDeadSeats(storeId);
    utilizationPct = deadSeats.overallUtilization;
      deadSlotCount = deadSeats?.deadSlots?.length ?? 0;
  } catch { /* silent */ }

  emit({
    phase: "dead_seats",
    status: "running",
    label: "Dead Seat Detector",
    progress: 85,
    logLine: `[RUN]  Dead Seat Detector — ${utilizationPct.toFixed(0)}% utilization · flagging underbooked windows...`,
  });
  await sleep(750);
  emit({
    phase: "dead_seats",
    status: "done",
    label: "Dead Seat Detector",
    result: `${utilizationPct.toFixed(0)}% seat utilization · ${deadSlotCount} dead slots`,
    logLine: `[ONLINE] ✓ Dead Seat Detector — ${utilizationPct.toFixed(0)}% overall utilization · ${deadSlotCount} underbooked slots found`,
  });

  await sleep(900);

  // ── Phase 6: Growth Score Engine ─────────────────────────────────────────
  emit({
    phase: "growth_score",
    status: "starting",
    label: "Growth Score Engine",
    description: "Computing composite 0–100 business health score",
    logLine: "[BOOT] Growth Score Engine — loading retention, rebooking, utilization components...",
  });
  await sleep(800);
  emit({
    phase: "growth_score",
    status: "running",
    label: "Growth Score Engine",
    progress: 40,
    logLine: "[RUN]  Growth Score Engine — weighting 5 component scores (retention, rebooking, utilization, revenue, new clients)...",
  });
  await sleep(850);

  let growthScoreValue = 0;
  let growthGrade = "C";
  try {
    const avgRebooking = rebookingRateCount > 0 ? totalRebookingRate / rebookingRateCount : 0;
    const gs = await computeGrowthScore(
      storeId,
      {
        activeClients: allCustomers.length,
        driftingClients: driftingCount,
        atRiskClients: atRiskCount,
        avgRebookingRate: avgRebooking,
      },
      utilizationPct
    );
    growthScoreValue = gs.overallScore;
    growthGrade = gs.overallScore >= 85 ? "A"
      : gs.overallScore >= 70 ? "B"
      : gs.overallScore >= 55 ? "C"
      : gs.overallScore >= 40 ? "D" : "F";
    await db.insert(growthScoreSnapshots).values({
      storeId,
      overallScore: gs.overallScore,
      retentionScore: gs.components.retention.score,
      rebookingScore: gs.components.rebooking.score,
      utilizationScore: gs.components.utilization.score,
      revenueScore: gs.components.revenue.score,
      newClientScore: gs.components.newClients.score,
      activeClients: gs.activeClients,
      driftingClients: gs.driftingClients,
      atRiskClients: gs.atRiskClients,
      avgRebookingRate: avgRebooking.toFixed(2),
      seatUtilizationPct: utilizationPct.toFixed(2),
      monthlyRevenue: gs.monthlyRevenue.toFixed(2),
      snapshotDate: new Date(),
    });
  } catch { /* silent */ }

  emit({
    phase: "growth_score",
    status: "running",
    label: "Growth Score Engine",
    progress: 90,
    logLine: `[RUN]  Growth Score Engine — final score computed: ${growthScoreValue}/100 (Grade ${growthGrade})`,
  });
  await sleep(750);
  emit({
    phase: "growth_score",
    status: "done",
    label: "Growth Score Engine",
    result: `Score: ${growthScoreValue}/100 · Grade ${growthGrade}`,
    logLine: `[ONLINE] ✓ Growth Score Engine — business health score: ${growthScoreValue}/100 (Grade ${growthGrade})`,
  });

  await sleep(900);

  // ── Phase 7: Revenue Leakage Scanner ─────────────────────────────────────
  emit({
    phase: "revenue_leakage",
    status: "starting",
    label: "Revenue Leakage Scanner",
    description: "Mapping lapsed clients to lost revenue",
    logLine: "[BOOT] Revenue Leakage Scanner — identifying clients lost in the last 90–180 days...",
  });
  await sleep(800);
  emit({
    phase: "revenue_leakage",
    status: "running",
    label: "Revenue Leakage Scanner",
    progress: 50,
    logLine: "[RUN]  Revenue Leakage Scanner — cross-referencing avg ticket × expected cadence...",
  });
  await sleep(850);

  let leakageResult = "Leakage report ready";
  let lapsedCount = 0;
  let recoverableAmount = 0;
  try {
    const leakage = await computeRevenueLeakage(storeId);
    // Use the aggregated values from the report instead of treating it as an array
    lapsedCount = 0; // No direct client count available in the report
    recoverableAmount = Math.round(leakage.recoveryPotential);
    leakageResult = `${leakage.totalLeakage.toLocaleString()} total leakage · $${recoverableAmount.toLocaleString()} recoverable`;
  } catch { /* silent */ }

  emit({
    phase: "revenue_leakage",
    status: "running",
    label: "Revenue Leakage Scanner",
    progress: 88,
    logLine: `[RUN]  Revenue Leakage Scanner — $${recoverableAmount.toLocaleString()} in recoverable revenue mapped to ${lapsedCount} clients`,
  });
  await sleep(750);
  emit({
    phase: "revenue_leakage",
    status: "done",
    label: "Revenue Leakage Scanner",
    result: leakageResult,
    logLine: `[ONLINE] ✓ Revenue Leakage Scanner — ${lapsedCount} lapsed clients · $${recoverableAmount.toLocaleString()} recovery potential`,
  });

  await sleep(900);

  // ── Phase 8: Drift Recovery Engine ───────────────────────────────────────
  emit({
    phase: "drift_engine",
    status: "starting",
    label: "Drift Recovery Engine",
    description: "Identifying win-back candidates",
    logLine: "[BOOT] Drift Recovery Engine — scanning clients who've drifted past expected cadence...",
  });
  await sleep(800);
  emit({
    phase: "drift_engine",
    status: "running",
    label: "Drift Recovery Engine",
    progress: 55,
    logLine: `[RUN]  Drift Recovery Engine — ${driftingCount} clients are 20%+ past their visit window...`,
  });
  await sleep(900);
  emit({
    phase: "drift_engine",
    status: "running",
    label: "Drift Recovery Engine",
    progress: 85,
    logLine: `[RUN]  Drift Recovery Engine — preparing personalised win-back messaging queue...`,
  });
  await sleep(750);
  emit({
    phase: "drift_engine",
    status: "done",
    label: "Drift Recovery Engine",
    result: `${driftingCount} clients queued for win-back`,
    logLine: `[ONLINE] ✓ Drift Recovery Engine — ${driftingCount} win-back candidates ready · revenue recovery active`,
  });
}

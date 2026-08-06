import { db } from "../db";
import { appointments, smsSettings, locations } from "@shared/schema";
import { clientIntelligence, staffIntelligence, growthScoreSnapshots, deadSeatPatterns, intelligenceInterventions } from "../../shared/schema/intelligence";
import { computeClientCadence } from "./cadence";
import { computeClientLtv } from "./ltv";
import { computeChurnRisk } from "./churn";
import { computeDeadSeats } from "./dead-seats";
import { computeRebookingRates } from "./rebooking-rates";
import { computeGrowthScore } from "./growth-score";
import { runDriftRecovery } from "./drift-recovery";
import { sendSms } from "../sms";
import { eq, and, sql, gte, lte, isNotNull, inArray } from "drizzle-orm";

export async function runIntelligenceForStore(storeId: number): Promise<void> {
  try {
    console.log(`[intelligence] Running intelligence engine for store ${storeId}`);

    // 1. Get all clients for this store
    const allCustomers = await db.execute(
      sql`SELECT id FROM clients WHERE store_id = ${storeId} AND archived_at IS NULL`
    ).then(r => (r.rows as any[]).map(row => ({ id: Number(row.id) })));

    if (allCustomers.length === 0) {
      console.log(`[intelligence] No customers found for store ${storeId}, skipping`);
      return;
    }

    let driftingCount = 0;
    let atRiskCount = 0;
    let totalRebookingRate = 0;
    let rebookingRateCount = 0;

    // 2. Compute per-client intelligence
    for (const customer of allCustomers) {
      try {
        const [cadence, ltv] = await Promise.all([
          computeClientCadence(storeId, customer.id),
          computeClientLtv(storeId, customer.id),
        ]);

        // Get no-show rate for this customer
        const nsData = await db.execute(
          sql`SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('no_show', 'no-show') THEN 1 ELSE 0 END) as no_shows
          FROM appointments
          WHERE store_id = ${storeId} AND customer_id = ${customer.id}`
        );
        const nsResult = (nsData.rows as any[])[0];
        const totalAppts = Number(nsResult?.total || 0);
        const noShows = Number(nsResult?.no_shows || 0);
        const noShowRate = totalAppts > 0 ? noShows / totalAppts : 0;
        const noShowCount = noShows;

        const churn = computeChurnRisk(cadence, ltv, noShowRate);

        // Rebooking rate for this customer — deterministic estimate based on cadence adherence
        let rebookingRate = 0;
        if (ltv.totalVisits >= 2) {
          if (cadence.avgCadenceDays !== null) {
            // Has an established cadence = consistently returns — score based on overdue %
            const overduePct = cadence.daysOverduePct ?? 0;
            rebookingRate = Math.max(10, Math.min(95, 80 - Math.max(0, overduePct * 0.4)));
          } else {
            // Multiple visits but no clear cadence yet — moderate estimate
            rebookingRate = 45;
          }
        } else if (ltv.totalVisits === 1) {
          // Only one visit on record — low rebooking probability
          rebookingRate = 20;
        }

        if (cadence.isDrifting) driftingCount++;
        if (churn.isAtRisk) atRiskCount++;
        if (ltv.totalVisits > 0) {
          totalRebookingRate += rebookingRate;
          rebookingRateCount++;
        }

        // Upsert client intelligence record
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
            noShowCount,
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
              noShowCount,
              noShowRate: (noShowRate * 100).toFixed(2),
              rebookingRate: rebookingRate.toFixed(2),
              isDrifting: cadence.isDrifting,
              isAtRisk: churn.isAtRisk,
              computedAt: new Date(),
            },
          });
      } catch (err) {
        console.error(`[intelligence] Error processing customer ${customer.id}:`, err);
      }
    }

    // 3. Compute staff intelligence (rebooking rates)
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
      }

      totalRebookingRate = staffRates.reduce((sum, s) => sum + s.rebookingRatePct, 0);
      rebookingRateCount = staffRates.length;
    } catch (err) {
      console.error(`[intelligence] Error computing staff intelligence:`, err);
    }

    // 4. Compute dead seats
    let utilizationPct = 50;
    try {
      const deadSeats = await computeDeadSeats(storeId);
      utilizationPct = deadSeats.overallUtilization;
    } catch (err) {
      console.error(`[intelligence] Error computing dead seats:`, err);
    }

    // 5. Compute and store growth score snapshot
    try {
      const avgRebooking = rebookingRateCount > 0 ? totalRebookingRate / rebookingRateCount : 0;

      const growthScore = await computeGrowthScore(storeId, {
        activeClients: allCustomers.length,
        driftingClients: driftingCount,
        atRiskClients: atRiskCount,
        avgRebookingRate: avgRebooking,
      }, utilizationPct);

      await db.insert(growthScoreSnapshots).values({
        storeId,
        overallScore: growthScore.overallScore,
        retentionScore: growthScore.components.retention.score,
        rebookingScore: growthScore.components.rebooking.score,
        utilizationScore: growthScore.components.utilization.score,
        revenueScore: growthScore.components.revenue.score,
        newClientScore: growthScore.components.newClients.score,
        activeClients: growthScore.activeClients,
        driftingClients: growthScore.driftingClients,
        atRiskClients: growthScore.atRiskClients,
        avgRebookingRate: avgRebooking.toFixed(2),
        seatUtilizationPct: utilizationPct.toFixed(2),
        monthlyRevenue: growthScore.monthlyRevenue.toFixed(2),
        snapshotDate: new Date(),
      });
    } catch (err) {
      console.error(`[intelligence] Error computing growth score:`, err);
    }

    console.log(`[intelligence] Completed for store ${storeId}: ${allCustomers.length} clients, ${driftingCount} drifting, ${atRiskCount} at risk`);
  } catch (err) {
    console.error(`[intelligence] Fatal error for store ${storeId}:`, err);
  }
}

async function runRebookingNudges(storeId: number): Promise<void> {
  try {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const APP_URL = process.env.APP_URL || "https://certxa.com";

    const locationData = await db.execute(
      sql`SELECT name, booking_slug AS slug FROM locations WHERE id = ${storeId} LIMIT 1`
    );
    const locationRow = (locationData.rows as any[])[0];
    const storeName = locationRow?.name || "us";
    const bookingSlug = locationRow?.slug || null;
    const bookingLink = bookingSlug ? `${APP_URL}/book/${bookingSlug}` : APP_URL;

    // Find clients whose next expected visit is in 3-7 days and haven't received a nudge in 14 days
    const dueClients = await db
      .select({
        customerId: clientIntelligence.customerId,
        avgCadenceDays: clientIntelligence.avgVisitCadenceDays,
        nextExpectedVisitDate: clientIntelligence.nextExpectedVisitDate,
      })
      .from(clientIntelligence)
      .where(
        and(
          eq(clientIntelligence.storeId, storeId),
          isNotNull(clientIntelligence.nextExpectedVisitDate),
          sql`next_expected_visit_date >= ${in3Days.toISOString()}`,
          sql`next_expected_visit_date <= ${in7Days.toISOString()}`
        )
      )
      .limit(30);

    for (const client of dueClients) {
      try {
        // Check if already received a nudge recently
        const recentNudge = await db
          .select({ id: intelligenceInterventions.id })
          .from(intelligenceInterventions)
          .where(
            and(
              eq(intelligenceInterventions.storeId, storeId),
              eq(intelligenceInterventions.customerId, client.customerId),
              eq(intelligenceInterventions.interventionType, "rebooking_nudge"),
              sql`sent_at >= ${fourteenDaysAgo.toISOString()}`
            )
          )
          .limit(1);

        if (recentNudge.length > 0) continue;

        // Check if they already have an upcoming appointment
        const upcoming = await db
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.storeId, storeId),
              eq(appointments.customerId, client.customerId),
              inArray(appointments.status, ["confirmed", "pending"]),
              sql`date >= ${now.toISOString()}`
            )
          )
          .limit(1);

        if (upcoming.length > 0) continue;

        const [customer] = (await db.execute(
          sql`SELECT full_name AS name, (SELECT phone_number_e164 FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1) AS phone, (SELECT sms_opt_in FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1) AS marketing_opt_in FROM clients WHERE id = ${client.customerId} LIMIT 1`
        )).rows as any[];

        if (!customer?.phone || !customer.marketing_opt_in) continue;

        const firstName = String(customer.name || "").split(" ")[0] || "there";
        const message = `Hi ${firstName}! It's almost time for your next visit at ${storeName}. Ready to book? ${bookingLink}\n\nReply STOP to opt out.`;

        await sendSms(storeId, customer.phone, message, "rebooking_nudge", undefined, client.customerId);

        await db.insert(intelligenceInterventions).values({
          storeId,
          customerId: client.customerId,
          interventionType: "rebooking_nudge",
          channel: "sms",
          messageBody: message,
          status: "sent",
          triggeredBy: "auto",
        });

        console.log(`[intelligence] Rebooking nudge sent to customer ${client.customerId}`);
      } catch (err) {
        console.error(`[intelligence] Rebooking nudge error for customer ${client.customerId}:`, err);
      }
    }
  } catch (err) {
    console.error(`[intelligence] Rebooking nudges error for store ${storeId}:`, err);
  }
}

/**
 * Automatically sends win-back SMS to clients who no-showed or cancelled in the
 * last 7 days, have opted in to marketing, have a phone number, and haven't
 * received any automated message in the last 30 days.
 * Rate-limited to 50 per store per run. Runs silently — errors never crash the orchestrator.
 */
async function runAutoLeakageRecovery(storeId: number): Promise<void> {
  try {
    const locationData = await db.execute(
      sql`SELECT name, booking_slug AS slug FROM locations WHERE id = ${storeId} LIMIT 1`
    );
    const locationRow = (locationData.rows as any[])[0];
    const storeName = locationRow?.name || "us";
    const bookingSlug = locationRow?.slug || null;
    const APP_URL = process.env.APP_URL || "https://certxa.com";
    const bookingLink = bookingSlug ? `${APP_URL}/book/${bookingSlug}` : APP_URL;

    const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Find customers who no-showed or cancelled recently
    const leakageAppts = await db.execute(sql`
      SELECT DISTINCT a.customer_id
      FROM appointments a
      JOIN clients c ON c.id = a.customer_id
      JOIN client_phones cp ON cp.client_id = c.id AND cp.is_primary = true AND cp.sms_opt_in = true
      WHERE a.store_id = ${storeId}
        AND a.status IN ('no_show', 'no-show', 'cancelled')
        AND a.date >= ${sevenDaysAgo.toISOString()}
        AND c.archived_at IS NULL
        AND a.customer_id NOT IN (
          SELECT customer_id FROM intelligence_interventions
          WHERE store_id = ${storeId}
            AND sent_at >= ${thirtyDaysAgo.toISOString()}
        )
      LIMIT 50
    `);

    const customerIds = (leakageAppts.rows as any[]).map((r) => r.customer_id as number);
    if (customerIds.length === 0) return;

    for (const customerId of customerIds) {
      try {
        const [customer] = (await db.execute(
          sql`SELECT full_name AS name, (SELECT phone_number_e164 FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1) AS phone FROM clients WHERE id = ${customerId} LIMIT 1`
        )).rows as any[];

        if (!customer?.phone) continue;

        const firstName = String(customer.name || "").split(" ")[0] || "there";
        const message = `Hi ${firstName}! We missed you at ${storeName}. We'd love to have you back — book your next visit here: ${bookingLink}\n\nReply STOP to opt out.`;

        await sendSms(storeId, customer.phone, message, "winback", undefined, customerId);

        await db.insert(intelligenceInterventions).values({
          storeId,
          customerId,
          interventionType: "winback",
          channel: "sms",
          messageBody: message,
          status: "sent",
          triggeredBy: "auto",
        });

        // Update last winback timestamp in client intelligence if the record exists
        await db
          .update(clientIntelligence)
          .set({ lastWinbackSentAt: new Date(), winbackSentCount: sql`COALESCE(winback_sent_count, 0) + 1` })
          .where(and(eq(clientIntelligence.storeId, storeId), eq(clientIntelligence.customerId, customerId)));

        console.log(`[intelligence] Auto leakage win-back sent to customer ${customerId}`);
      } catch (err) {
        console.error(`[intelligence] Auto leakage win-back error for customer ${customerId}:`, err);
      }
    }

    console.log(`[intelligence] Auto leakage recovery complete for store ${storeId}: ${customerIds.length} contacted`);
  } catch (err) {
    console.error(`[intelligence] Auto leakage recovery error for store ${storeId}:`, err);
  }
}

async function hasSmsCredits(storeId: number): Promise<boolean> {
  try {
    const SMS_WALLET_MIN = 0.02;
    const [row] = await db
      .select({ smsAllowance: locations.smsAllowance, platformCredits: locations.platformCredits })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);
    if (!row) return false;
    const hasAllowance = (row.smsAllowance ?? 0) > 0;
    const hasWallet    = parseFloat(row.platformCredits ?? "0") >= SMS_WALLET_MIN;
    return hasAllowance || hasWallet;
  } catch {
    return true; // fail open — never silently block on a DB error
  }
}

async function isAutoEngageEnabled(storeId: number): Promise<boolean> {
  try {
    const [row] = await db
      .select({ autoEngageEnabled: smsSettings.autoEngageEnabled })
      .from(smsSettings)
      .where(eq(smsSettings.storeId, storeId))
      .limit(1);
    // If no row exists, default to true (no settings row = not configured yet)
    return row?.autoEngageEnabled ?? true;
  } catch {
    return true; // fail open — never silently block sends on a DB error
  }
}

export async function runIntelligenceForAllStores(): Promise<void> {
  try {
    const stores = await db.execute(sql`SELECT DISTINCT id FROM locations`);
    const storeIds = (stores.rows as any[]).map((r) => r.id as number);
    console.log(`[intelligence] Running for ${storeIds.length} stores`);
    for (const storeId of storeIds) {
      await runIntelligenceForStore(storeId);

      // Automated outreach — only runs when the owner has Autonomous Mode enabled
      const autoEngaged = await isAutoEngageEnabled(storeId);
      if (!autoEngaged) {
        console.log(`[intelligence] Autonomous Mode OFF for store ${storeId} — skipping auto SMS sends`);
        continue;
      }

      // Guard: skip all auto-SMS if the store has zero SMS credits in both buckets
      const creditsAvailable = await hasSmsCredits(storeId);
      if (!creditsAvailable) {
        console.log(`[intelligence] Store ${storeId} has no SMS credits (allowance + purchased = 0) — skipping auto sends`);
        continue;
      }

      // Runs every 6 hours, all rate-limited
      await runRebookingNudges(storeId);
      await runDriftRecovery(storeId).catch((err) =>
        console.error(`[intelligence] Drift recovery error for store ${storeId}:`, err)
      );
      await runAutoLeakageRecovery(storeId);
    }
  } catch (err) {
    console.error(`[intelligence] Fatal error running all stores:`, err);
  }
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function startIntelligenceScheduler(): void {
  if (schedulerInterval) return;
  // Run once at startup (with a delay to not block boot)
  setTimeout(() => runIntelligenceForAllStores(), 15000);
  // Then run every 6 hours
  schedulerInterval = setInterval(() => runIntelligenceForAllStores(), 6 * 60 * 60 * 1000);
  console.log("[intelligence] Scheduler started (runs every 6 hours)");
}

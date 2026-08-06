import { createHmac } from "crypto";
import { db } from "../db";
import { sendEmail } from "../mail";
import { users, locations } from "@shared/schema";
import { clientIntelligence, growthScoreSnapshots } from "@shared/schema/intelligence";
import { eq, sql, desc } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

function getSecret(): string {
  return process.env.SESSION_SECRET || "fallback-secret-change-me";
}

export function generateUnsubscribeToken(storeId: number): string {
  return createHmac("sha256", getSecret())
    .update(`digest-unsub:${storeId}`)
    .digest("hex");
}

export function verifyUnsubscribeToken(storeId: number, token: string): boolean {
  const expected = generateUnsubscribeToken(storeId);
  return token === expected;
}

// Track which stores already received a digest this week (key: `${storeId}-${isoWeek}`)
const sentThisWeek = new Set<string>();

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isMondayMorning(): boolean {
  // Use UTC — the digest scheduler runs on the server (always UTC on Replit/cloud).
  // "i" token: 1=Mon…7=Sun.
  const now = new Date();
  const dow = parseInt(formatInTimeZone(now, "UTC", "i"), 10); // 1=Mon
  const h   = parseInt(formatInTimeZone(now, "UTC", "H"), 10);
  return dow === 1 && h === 9;
}

function gradeColor(grade: string): string {
  const map: Record<string, string> = {
    A: "#10b981", B: "#3b82f6", C: "#f59e0b", D: "#f97316", F: "#ef4444",
  };
  return map[grade] || "#6366f1";
}

  function churnColor(label: string): string {
  const map: Record<string, string> = {
    critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#10b981",
  };
  return map[label] || "#6b7280";
}

export async function sendWeeklyDigest(storeId: number): Promise<{ sent: boolean; skipped?: string }> {
  // Derive a letter grade from a numeric score (A‑F) matching the original schema logic
  function computeGrade(score: number): string {
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    if (score >= 40) return "D";
    return "F";
  }

  const weekKey = `${storeId}-${isoWeekKey(new Date())}`;
  if (sentThisWeek.has(weekKey)) {
    return { sent: false, skipped: "already sent this week" };
  }

  // Load store + owner email + opt-out status
  const [store] = await db
    .select({
      id: locations.id,
      name: locations.name,
      timezone: locations.timezone,
      ownerEmail: users.email,
      ownerFirstName: users.firstName,
      optOut: locations.weeklyDigestOptOut,
    })
    .from(locations)
    .leftJoin(users, eq(users.id, locations.userId))
    .where(eq(locations.id, storeId))
    .limit(1);

  if (!store?.ownerEmail) {
    return { sent: false, skipped: "no owner email" };
  }

  if (store.optOut) {
    return { sent: false, skipped: "owner opted out of weekly digest" };
  }

  const appUrl = process.env.APP_URL || "https://app.certxa.com";
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Fetch all intelligence data in parallel
  const [
    growthScoreRows,
    revenueThisWeekResult,
    revenueLastWeekResult,
    appointmentsThisWeekResult,
    atRiskClients,
    noShowUpcomingResult,
    driftingHighLtvResult,
    deadSeatsResult,
  ] = await Promise.all([
    // Growth score — latest snapshot
  // Fetch the latest growth score snapshot. The schema provides overallScore and snapshotDate.
  // We compute a grade locally based on the score.
  db
    .select({ score: growthScoreSnapshots.overallScore, date: growthScoreSnapshots.snapshotDate })
    .from(growthScoreSnapshots)
    .where(eq(growthScoreSnapshots.storeId, storeId))
    .orderBy(desc(growthScoreSnapshots.snapshotDate))
    .limit(1),

    // Revenue this week
    db.execute(
      sql`SELECT COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)::float AS rev
          FROM appointments
          WHERE store_id = ${storeId}
            AND date >= ${weekStart.toISOString()}
            AND status IN ('completed', 'started')`
    ),

    // Revenue last week (for comparison)
    db.execute(
      sql`SELECT COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0)::float AS rev
          FROM appointments
          WHERE store_id = ${storeId}
            AND date >= ${twoWeeksAgo.toISOString()}
            AND date < ${weekStart.toISOString()}
            AND status IN ('completed', 'started')`
    ),

    // Appointments this week
    db.execute(
      sql`SELECT COUNT(*)::int AS cnt
          FROM appointments
          WHERE store_id = ${storeId}
            AND date >= ${weekStart.toISOString()}
            AND status NOT IN ('cancelled')`
    ),

    // Top at-risk clients (churn high/critical, sorted by LTV desc)
    db.execute(
      sql`SELECT ci.customer_id, c.full_name AS name, ci.churn_risk_label, ci.churn_risk_score,
                 ci.ltv_12_month, ci.avg_ticket_value
          FROM client_intelligence ci
          LEFT JOIN clients c ON c.id = ci.customer_id
          WHERE ci.store_id = ${storeId}
            AND ci.churn_risk_label IN ('high', 'critical')
          ORDER BY ci.ltv_12_month::numeric DESC NULLS LAST
          LIMIT 4`
    ),

    // Upcoming no-show risks (next 7 days)
    db.execute(
      sql`SELECT COUNT(*)::int AS cnt
          FROM appointments a
          JOIN client_intelligence ci ON ci.customer_id = a.customer_id AND ci.store_id = a.store_id
          WHERE a.store_id = ${storeId}
            AND a.date >= ${now.toISOString()}
            AND a.date <= ${in7Days.toISOString()}
            AND a.status IN ('pending', 'confirmed')
            AND CAST(ci.no_show_rate AS DECIMAL) >= 40`
    ),

    // Drifting high-LTV clients (winback targets)
    db.execute(
      sql`SELECT COUNT(*)::int AS cnt,
                 COALESCE(SUM(ci.ltv_12_month::numeric), 0)::float AS total_ltv
          FROM client_intelligence ci
          WHERE ci.store_id = ${storeId}
            AND ci.is_drifting = true
            AND ci.ltv_12_month::numeric >= 200`
    ),

    // Dead seats this week
    db.execute(
      sql`SELECT COUNT(*)::int AS cnt,
                 COALESCE(SUM(dsp.estimated_lost_revenue::numeric), 0)::float AS lost_rev
          FROM dead_seat_patterns dsp
          WHERE dsp.store_id = ${storeId}`
    ),
  ]);

  // Parse results
  const growthScore = (growthScoreRows[0] ?? null) as any;
  const revenueThisWeek = parseFloat(((revenueThisWeekResult as any).rows[0] as any)?.rev || "0");
  const revenueLastWeek = parseFloat(((revenueLastWeekResult as any).rows[0] as any)?.rev || "0");
  const revChange = revenueLastWeek > 0
    ? Math.round(((revenueThisWeek - revenueLastWeek) / revenueLastWeek) * 100)
    : null;
  const appointmentsThisWeek = parseInt(((appointmentsThisWeekResult as any).rows[0] as any)?.cnt || "0");
  const noShowCount = parseInt(((noShowUpcomingResult as any).rows[0] as any)?.cnt || "0");
  const driftingCount = parseInt(((driftingHighLtvResult as any).rows[0] as any)?.cnt || "0");
  const driftingLtv = parseFloat(((driftingHighLtvResult as any).rows[0] as any)?.total_ltv || "0");
  const deadSeatsCount = parseInt(((deadSeatsResult as any).rows[0] as any)?.cnt || "0");
  const deadSeatsLostRev = parseFloat(((deadSeatsResult as any).rows[0] as any)?.lost_rev || "0");

  const ownerName = store.ownerFirstName || "there";
  const storeName = store.name;
  const weekLabel = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Build at-risk client rows
  const riskRows = ((atRiskClients as any).rows as any[]).map((c) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="font-weight:600;color:#111827;">${c.name || "Unknown"}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
        <span style="background:${churnColor(c.churn_risk_label)};color:#fff;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;text-transform:capitalize;">${c.churn_risk_label}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;font-size:13px;">
        $${parseFloat(c.ltv_12_month || "0").toFixed(0)}/yr
      </td>
    </tr>`).join("");

  const scoreColor = growthScore ? gradeColor(computeGrade(growthScore.score)) : "#6366f1";
  const revChangeHtml = revChange !== null
    ? `<span style="color:${revChange >= 0 ? "#10b981" : "#ef4444"};font-weight:700;">
        ${revChange >= 0 ? "▲" : "▼"} ${Math.abs(revChange)}% vs last week
       </span>`
    : `<span style="color:#9ca3af;">First week of data</span>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#18103a;border-radius:16px 16px 0 0;padding:28px 32px;">
        <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Revenue Intelligence</p>
        <h1 style="margin:0;font-size:22px;color:#fff;font-weight:700;">Your weekly digest, ${ownerName}</h1>
        <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.5);">Week ending ${weekLabel} · ${storeName}</p>
      </td></tr>

      <!-- Score + Revenue row -->
      <tr><td style="background:#fff;padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <!-- Growth Score -->
            <td width="50%" style="padding:24px 20px 24px 32px;border-bottom:1px solid #f3f4f6;border-right:1px solid #f3f4f6;vertical-align:top;">
              <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">Business Health</p>
              ${growthScore
                 ? `<p style="margin:0;font-size:42px;font-weight:800;color:${scoreColor};line-height:1;">${computeGrade(growthScore.score)}</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${growthScore.score}/100 growth score</p>`
                : `<p style="margin:0;font-size:28px;font-weight:800;color:#d1d5db;">—</p>
                   <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Not yet computed</p>`
              }
            </td>
            <!-- Revenue -->
            <td width="50%" style="padding:24px 32px 24px 20px;border-bottom:1px solid #f3f4f6;vertical-align:top;">
              <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">Revenue this week</p>
              <p style="margin:0;font-size:36px;font-weight:800;color:#111827;line-height:1;">$${revenueThisWeek.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
              <p style="margin:4px 0 0;font-size:13px;">${revChangeHtml}</p>
              <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">${appointmentsThisWeek} appointment${appointmentsThisWeek !== 1 ? "s" : ""} completed</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Action items -->
      <tr><td style="background:#fff;padding:24px 32px 0;">
        <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">This week's priorities</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #f3f4f6;">
          ${noShowCount > 0 ? `
          <tr>
            <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;background:#fef2f2;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:20px;width:32px;">⚠️</td>
                <td style="padding-left:12px;">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b;">${noShowCount} high-risk appointment${noShowCount > 1 ? "s" : ""} next 7 days</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#ef4444;">Send confirmations to reduce no-shows</p>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <a href="${appUrl}/intelligence?tab=noshow" style="font-size:12px;color:#dc2626;font-weight:600;text-decoration:none;">Review →</a>
                </td>
              </tr></table>
            </td>
          </tr>` : ""}
          ${driftingCount > 0 ? `
          <tr>
            <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;background:#faf5ff;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:20px;width:32px;">💜</td>
                <td style="padding-left:12px;">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#6b21a8;">${driftingCount} high-value client${driftingCount > 1 ? "s" : ""} drifting — $${driftingLtv.toFixed(0)} at stake</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#7c3aed;">Top spenders whose visit frequency is slipping</p>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <a href="${appUrl}/intelligence?tab=clients" style="font-size:12px;color:#7c3aed;font-weight:600;text-decoration:none;">Win back →</a>
                </td>
              </tr></table>
            </td>
          </tr>` : ""}
          ${deadSeatsCount > 0 ? `
          <tr>
            <td style="padding:14px 16px;background:#fffbeb;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:20px;width:32px;">🪑</td>
                <td style="padding-left:12px;">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;">${deadSeatsCount} chronically empty time slot${deadSeatsCount > 1 ? "s" : ""}${deadSeatsLostRev > 0 ? ` — $${deadSeatsLostRev.toFixed(0)} potential` : ""}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#d97706;">Recurring gaps in your schedule with fill potential</p>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <a href="${appUrl}/intelligence?tab=seats" style="font-size:12px;color:#d97706;font-weight:600;text-decoration:none;">Fill seats →</a>
                </td>
              </tr></table>
            </td>
          </tr>` : ""}
          ${noShowCount === 0 && driftingCount === 0 && deadSeatsCount === 0 ? `
          <tr>
            <td style="padding:16px;background:#f0fdf4;text-align:center;">
              <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">✅ All revenue signals look healthy this week!</p>
            </td>
          </tr>` : ""}
        </table>
      </td></tr>

      <!-- At-risk client table -->
  ${( (atRiskClients as any).rows?.length ?? 0) > 0 ? `
      <tr><td style="background:#fff;padding:24px 32px 0;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">At-risk clients</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:12px;overflow:hidden;">
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Client</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Risk</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">12-mo LTV</th>
          </tr>
          ${riskRows}
        </table>
        <p style="margin:8px 0 0;text-align:right;">
          <a href="${appUrl}/intelligence?tab=clients" style="font-size:12px;color:#7c3aed;font-weight:600;text-decoration:none;">View all at-risk clients →</a>
        </p>
      </td></tr>` : ""}

      <!-- CTA -->
      <tr><td style="background:#fff;padding:28px 32px;text-align:center;border-radius:0 0 16px 16px;">
        <a href="${appUrl}/intelligence"
           style="display:inline-block;background:#18103a;color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">
          Open Revenue Intelligence →
        </a>
        <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
          You're receiving this because you own a store on Certxa.<br>
          This digest is sent every Monday at 9am. ·
          <a href="${appUrl}/api/intelligence/unsubscribe?storeId=${storeId}&token=${generateUnsubscribeToken(storeId)}"
             style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const subject = `${storeName} · Weekly revenue digest — ${weekLabel}`;

  const result = await sendEmail(storeId, store.ownerEmail, subject, html);

  if (result.success) {
    sentThisWeek.add(weekKey);
    console.log(`[WeeklyDigest] Sent to ${store.ownerEmail} for store ${storeId} (${storeName})`);
    return { sent: true };
  }

  console.warn(`[WeeklyDigest] Failed for store ${storeId}: ${result.error}`);
  return { sent: false, skipped: result.error };
}

async function runWeeklyDigestForAllStores(): Promise<void> {
  const allStores = await db
    .select({ id: locations.id })
    .from(locations);

  let sent = 0;
  for (const store of allStores) {
    try {
      const result = await sendWeeklyDigest(store.id);
      if (result.sent) sent++;
    } catch (err) {
      console.error(`[WeeklyDigest] Error for store ${store.id}:`, err);
    }
  }

  if (sent > 0) {
    console.log(`[WeeklyDigest] Sent ${sent} digest email(s)`);
  }
}

let weeklyDigestIntervalId: ReturnType<typeof setInterval> | null = null;

export function startWeeklyDigestScheduler(): void {
  if (weeklyDigestIntervalId) return;

  console.log("[WeeklyDigest] Scheduler started (runs every Monday at 9am, checks hourly)");

  weeklyDigestIntervalId = setInterval(async () => {
    if (!isMondayMorning()) return;
    try {
      await runWeeklyDigestForAllStores();
    } catch (err) {
      console.error("[WeeklyDigest] Scheduler error:", err);
    }
  }, 60 * 60 * 1000);

  // Run immediately on startup if it's Monday 9am
  if (isMondayMorning()) {
    setTimeout(() => runWeeklyDigestForAllStores().catch(console.error), 20_000);
  }
}

export function stopWeeklyDigestScheduler(): void {
  if (weeklyDigestIntervalId) {
    clearInterval(weeklyDigestIntervalId);
    weeklyDigestIntervalId = null;
  }
}

import { createHmac } from "crypto";
import { brandedEmail, emailButton, emailCallout, emailDetails, emailNote, emailText, escapeEmailHtml, EMAIL_COLORS } from "../lib/emailLayout";
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

  // The shared Certxa layout (lib/emailLayout.ts); every value from the database is escaped.
  const esc = escapeEmailHtml;
  const C = EMAIL_COLORS;
  const riskList = ((atRiskClients as any).rows as any[]) ?? [];
  const riskRows = riskList.map((c) => `
    <tr>
      <td style="padding:11px 16px;border-bottom:1px solid ${C.line};font-size:14px;font-weight:600;color:${C.ink};">${esc(c.name || "Unknown")}</td>
      <td style="padding:11px 16px;border-bottom:1px solid ${C.line};font-size:13px;color:${C.muted};text-transform:capitalize;">${esc(c.churn_risk_label)}</td>
      <td align="right" style="padding:11px 16px;border-bottom:1px solid ${C.line};font-size:13px;color:${C.muted};">$${parseFloat(c.ltv_12_month || "0").toFixed(0)}/yr</td>
    </tr>`).join("");

  const revenueLine = revChange !== null
    ? `${revChange >= 0 ? "Up" : "Down"} ${Math.abs(revChange)}% vs last week`
    : "First week of data";

  const actions: string[] = [];
  if (noShowCount > 0) actions.push(emailCallout(
    `<strong>${noShowCount} high-risk appointment${noShowCount > 1 ? "s" : ""} in the next 7 days.</strong><br>Clients who often miss. If they do, Certxa texts them to rebook. <a href="${appUrl}/intelligence?tab=noshow" style="color:${C.brand};text-decoration:none;font-weight:600;">Review</a>`,
    "danger"));
  if (driftingCount > 0) actions.push(emailCallout(
    `<strong>${driftingCount} high-value client${driftingCount > 1 ? "s" : ""} drifting, $${driftingLtv.toFixed(0)} at stake.</strong><br>Top spenders visiting less often. Certxa texts them an invite to book. <a href="${appUrl}/intelligence?tab=clients" style="color:${C.brand};text-decoration:none;font-weight:600;">See clients</a>`,
    "brand"));
  if (deadSeatsCount > 0) actions.push(emailCallout(
    `<strong>${deadSeatsCount} regularly empty time slot${deadSeatsCount > 1 ? "s" : ""}${deadSeatsLostRev > 0 ? `, $${deadSeatsLostRev.toFixed(0)} potential` : ""}.</strong><br>Recurring gaps. Certxa sends booking nudges to clients who are due. <a href="${appUrl}/intelligence?tab=seats" style="color:${C.brand};text-decoration:none;font-weight:600;">See empty time</a>`,
    "warning"));
  if (!actions.length) actions.push(emailCallout("All revenue signals look healthy this week.", "success"));

  const sectionLabel = (t: string) => `<p style="margin:8px 0 12px;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${C.muted};">${t}</p>`;

  const html = brandedEmail({
    heading: `Your weekly digest, ${ownerName}`,
    preheader: `Week ending ${weekLabel} · ${storeName}`,
    body: [
      emailText(`Week ending ${esc(weekLabel)} &middot; ${esc(storeName)}`, { muted: true, size: 14 }),
      emailDetails([
        ["Revenue this week", `$${revenueThisWeek.toLocaleString("en-US", { maximumFractionDigits: 0 })}`],
        ["Compared with last week", esc(revenueLine)],
        ["Appointments completed", String(appointmentsThisWeek)],
        ["Business health", growthScore ? `${computeGrade(growthScore.score)} &middot; ${growthScore.score}/100` : "Not yet computed"],
      ]),
      sectionLabel("What Certxa is handling for you"),
      actions.join(""),
      riskList.length ? sectionLabel("At-risk clients") + `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border:1px solid ${C.line};border-radius:14px;border-collapse:separate;">
          <tr>
            <td style="padding:9px 16px;border-bottom:1px solid ${C.line};font-size:11px;font-weight:600;color:${C.muted};text-transform:uppercase;">Client</td>
            <td style="padding:9px 16px;border-bottom:1px solid ${C.line};font-size:11px;font-weight:600;color:${C.muted};text-transform:uppercase;">Risk</td>
            <td align="right" style="padding:9px 16px;border-bottom:1px solid ${C.line};font-size:11px;font-weight:600;color:${C.muted};text-transform:uppercase;">12-mo value</td>
          </tr>
          ${riskRows}
        </table>
        ${emailNote(`<a href="${appUrl}/intelligence?tab=clients" style="color:${C.brand};text-decoration:none;font-weight:600;">View all at-risk clients</a>`)}` : "",
      emailButton("Open Revenue Intelligence", `${appUrl}/intelligence`),
      emailNote("You're receiving this because you own a store on Certxa. This digest is sent every Monday at 9am."),
    ].join(""),
    unsubscribeUrl: `${appUrl}/api/intelligence/unsubscribe?storeId=${storeId}&token=${generateUnsubscribeToken(storeId)}`,
    unsubscribeLabel: "Unsubscribe from the weekly digest",
  });

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

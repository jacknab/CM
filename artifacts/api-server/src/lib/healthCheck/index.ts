import type { Pool } from "pg";
import type { SegmentId, SegmentResult } from "./types";
import { SEGMENT_IDS, pass, warn, rollup } from "./types";
import { bookingReadiness }  from "./segments/bookingReadiness";
import { teamRoster }        from "./segments/teamRoster";
import { servicesCatalog }   from "./segments/servicesCatalog";
import { featuresSettings }  from "./segments/featuresSettings";
import { commissionPayroll }  from "./segments/commissionPayroll";
import { smsCommunications }  from "./segments/smsCommunications";
import { paymentsBilling }   from "./segments/paymentsBilling";
import { aiReceptionist }    from "./segments/aiReceptionist";
import { onlinePresence }    from "./segments/onlinePresence";
import { kioskWaitlist }     from "./segments/kioskWaitlist";
import { frontDesk }         from "./segments/frontDesk";

export type { SegmentId, SegmentResult, CheckResult } from "./types";
export { SEGMENT_IDS } from "./types";

// ── Segment runner registry ───────────────────────────────────────────────────

const RUNNERS: Record<SegmentId, (id: number, pool: Pool) => Promise<SegmentResult>> = {
  booking_readiness:  bookingReadiness,
  team_roster:        teamRoster,
  services_catalog:   servicesCatalog,
  features_settings:  featuresSettings,
  commission_payroll: commissionPayroll,
  sms_communications: smsCommunications,
  payments_billing:   paymentsBilling,
  ai_receptionist:    aiReceptionist,
  online_presence:    onlinePresence,
  kiosk_waitlist:     kioskWaitlist,
  front_desk:         frontDesk,
};

// ── Certxa Pro app accounts (owner, 2026-11-04) ──────────────────────────────
// An account made in the app (users.account_type 'certxa_pro') is one person with one calendar: no team, payroll,
// front desk, kiosk, AI receptionist, Google profile or Website Builder (its website is the booking site), and its texts
// come from text credits, not the allowance/wallet. Only what the app has is checked, so support sees no warnings that
// don't apply to it.
const PRO_SKIP_SEGMENTS: SegmentId[] = ["team_roster", "commission_payroll", "ai_receptionist", "kiosk_waitlist", "front_desk"];
const PRO_SKIP_CHECKS: Partial<Record<SegmentId, string[]>> = {
  booking_readiness: ["staff_service_assignments"],
  services_catalog: ["service_staff_coverage"],
  features_settings: ["pos", "loyalty", "grace_period"],
  sms_communications: ["credits_balance", "sms_balance"],
  payments_billing: ["platform_credits"],
  online_presence: ["website", "gbp"],
};

async function isProAccount(accountId: number, pool: Pool): Promise<boolean> {
  const r = await pool.query(`SELECT u.account_type FROM locations l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`, [accountId]);
  return r.rows[0]?.account_type === "certxa_pro";
}

/** A segment's result as it applies to a Certxa Pro app account. */
async function forProApp(result: SegmentResult, accountId: number, pool: Pool): Promise<SegmentResult> {
  const skip = new Set(PRO_SKIP_CHECKS[result.segmentId as SegmentId] ?? []);
  let checks = result.checks.filter((c) => !skip.has(c.id));
  if (result.segmentId === "booking_readiness") {
    // One person: with no hours of their own they are booked during the business hours.
    checks = checks.map((c) => c.id === "staff_availability" && c.status !== "pass"
      ? pass("staff_availability", "Staff availability configured", "Booked during the business hours (the app has one calendar).") : c);
  }
  if (result.segmentId === "sms_communications") {
    // Texts to clients are paid from text credits; Plus makes notification texts free (lib/soloSmsCredits.ts).
    const r = await pool.query(`SELECT sms_credits, sms_plus FROM locations WHERE id = $1`, [accountId]);
    const credits = Number(r.rows[0]?.sms_credits ?? 0);
    checks.push(r.rows[0]?.sms_plus
      ? pass("text_credits", "Text credits", `Plus: notification texts are free. ${credits} credits for other texts.`)
      : credits > 0
        ? pass("text_credits", "Text credits", `${credits} text credits.`)
        : warn("text_credits", "Text credits", "No text credits left — texts to clients (reminders, confirmations) won't be sent.", "App → More → Credit balance"));
  }
  return { ...result, checks, status: rollup(checks) };
}

async function runSegment(segId: SegmentId, accountId: number, pool: Pool, pro: boolean): Promise<SegmentResult> {
  const runner = RUNNERS[segId];
  if (!runner) throw new Error(`Unknown segment: ${segId}`);
  const result = await runner(accountId, pool);
  return pro ? forProApp(result, accountId, pool) : result;
}

export interface HealthCheckRunOptions {
  accountId: number;
  agentId: number;
  agentName: string;
  segments?: SegmentId[];   // if omitted, run all
  pool: Pool;
}

export interface HealthCheckRun {
  id?: number;
  accountId: number;
  agentId: number;
  agentName: string;
  runAt: string;
  segmentsRun: SegmentId[];
  results: Record<string, SegmentResult>;
  passCount: number;
  warnCount: number;
  failCount: number;
  notes?: string | null;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runHealthCheck(opts: HealthCheckRunOptions): Promise<HealthCheckRun> {
  const { accountId, agentId, agentName, pool } = opts;
  const pro = await isProAccount(accountId, pool);
  const segments = ((opts.segments && opts.segments.length > 0) ? opts.segments : [...SEGMENT_IDS])
    .filter((segId) => !(pro && PRO_SKIP_SEGMENTS.includes(segId)));

  // Run all requested segments in parallel
  const resultArray = await Promise.all(
    segments.map(segId => {
      if (!RUNNERS[segId]) throw new Error(`Unknown segment: ${segId}`);
      return runSegment(segId, accountId, pool, pro).catch(err => {
        console.error(`[HealthCheck] Segment ${segId} failed:`, err);
        return {
          segmentId: segId,
          label: segId,
          status: "fail" as const,
          runAt: new Date().toISOString(),
          checks: [{
            id: "runner_error",
            label: "Segment runner error",
            status: "fail" as const,
            detail: `Internal error: ${err?.message ?? String(err)}`,
          }],
        };
      });
    })
  );

  // Build results map
  const results: Record<string, SegmentResult> = {};
  for (const r of resultArray) results[r.segmentId] = r;

  // Tally counts from individual checks
  let passCount = 0, warnCount = 0, failCount = 0;
  for (const seg of resultArray) {
    for (const c of seg.checks) {
      if (c.status === "pass") passCount++;
      else if (c.status === "warn") warnCount++;
      else failCount++;
    }
  }

  // Persist to DB
  let runId: number | undefined;
  try {
    const insertRes = await pool.query(
      `INSERT INTO account_health_checks
         (account_id, agent_id, agent_name, segments_run, results, pass_count, warn_count, fail_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [accountId, agentId, agentName, segments, JSON.stringify(results), passCount, warnCount, failCount],
    );
    runId = insertRes.rows[0]?.id;
  } catch (err) {
    console.error("[HealthCheck] Failed to persist run:", err);
  }

  return {
    id: runId,
    accountId,
    agentId,
    agentName,
    runAt: new Date().toISOString(),
    segmentsRun: segments,
    results,
    passCount,
    warnCount,
    failCount,
  };
}

// ── Merge a single re-run segment into an existing stored run ─────────────────

export async function rerunSegment(
  runId: number,
  segmentId: SegmentId,
  accountId: number,
  agentId: number,
  agentName: string,
  pool: Pool,
): Promise<SegmentResult> {
  const runner = RUNNERS[segmentId];
  if (!runner) throw new Error(`Unknown segment: ${segmentId}`);

  const freshResult = await runSegment(segmentId, accountId, pool, await isProAccount(accountId, pool));

  // Fetch existing run
  const existing = await pool.query(
    `SELECT results, pass_count, warn_count, fail_count FROM account_health_checks WHERE id = $1`,
    [runId],
  );
  if (existing.rows.length === 0) throw new Error("Run not found");

  const existingResults: Record<string, SegmentResult> = existing.rows[0].results ?? {};
  const oldSeg = existingResults[segmentId];

  // Subtract old check counts
  let pc = Number(existing.rows[0].pass_count);
  let wc = Number(existing.rows[0].warn_count);
  let fc = Number(existing.rows[0].fail_count);
  if (oldSeg) {
    for (const c of oldSeg.checks) {
      if (c.status === "pass") pc--;
      else if (c.status === "warn") wc--;
      else fc--;
    }
  }

  // Add new check counts
  for (const c of freshResult.checks) {
    if (c.status === "pass") pc++;
    else if (c.status === "warn") wc++;
    else fc++;
  }

  existingResults[segmentId] = freshResult;

  await pool.query(
    `UPDATE account_health_checks
     SET results = $1, pass_count = $2, warn_count = $3, fail_count = $4,
         agent_id = $5, agent_name = $6
     WHERE id = $7`,
    [JSON.stringify(existingResults), Math.max(0, pc), Math.max(0, wc), Math.max(0, fc), agentId, agentName, runId],
  );

  return freshResult;
}

// account_health_checks is created by
// migrations/0194_owner_phone_otps_and_health_checks_tables.sql.

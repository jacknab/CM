import type { Pool } from "pg";
import type { SegmentId, SegmentResult } from "./types";
import { SEGMENT_IDS } from "./types";
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
};

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
  const segments = (opts.segments && opts.segments.length > 0) ? opts.segments : [...SEGMENT_IDS];

  // Run all requested segments in parallel
  const resultArray = await Promise.all(
    segments.map(segId => {
      const runner = RUNNERS[segId];
      if (!runner) throw new Error(`Unknown segment: ${segId}`);
      return runner(accountId, pool).catch(err => {
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

  const freshResult = await runner(accountId, pool);

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

// ── Bootstrap: ensure the DB table exists at startup ─────────────────────────
export async function bootstrapHealthCheckTable(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS account_health_checks (
        id            SERIAL PRIMARY KEY,
        account_id    INTEGER NOT NULL,
        agent_id      INTEGER NOT NULL DEFAULT 1,
        agent_name    TEXT    NOT NULL DEFAULT 'System',
        run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        segments_run  TEXT[]  NOT NULL DEFAULT '{}',
        results       JSONB   NOT NULL DEFAULT '{}',
        pass_count    INTEGER NOT NULL DEFAULT 0,
        warn_count    INTEGER NOT NULL DEFAULT 0,
        fail_count    INTEGER NOT NULL DEFAULT 0,
        notes         TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ahc_account_run
        ON account_health_checks (account_id, run_at DESC);
    `);
    console.log("[HealthCheck] Table ready");
  } catch (err) {
    console.warn("[HealthCheck] Table bootstrap warning:", err);
  }
}

/**
 * Fixing broken offline setups (owner, 2026-11-02; phase 3). A problem the health rules found (offlineHealthRules.ts)
 * names its fix. Some the server does itself (choosing the hub again); the rest are commands for one tablet, delivered
 * over the live connection and again with the tablet's next health report, carried out there and reported back.
 * Every fix is a row in offline_fixes (the audit trail).
 *
 * Safety: no fix ever deletes work a tablet hasn't sent. The same fix goes to the same tablet at most 3 times an hour;
 * one that failed 3 times in a day is left for a person ("needs a person" in the support center).
 */
import { pool } from "../db";
import { broadcastNotification } from "../notifications";
import { mutateStorePreferences } from "./storePreferences";
import type { HealthProblem, HealthVerdict } from "./offlineHealthRules";

/** Fixes a tablet carries out (booking lib/deviceCommands.ts; the app's own ones from phase 4). */
export const DEVICE_COMMANDS = new Set(["refresh_hub", "retry_unsent", "resync_mirror", "reload_page", "reopen_database", "restart_app", "apply_update", "test_printer"]);
/** Fixes the server does itself. */
export const SERVER_FIXES = new Set(["elect_hub"]);

export interface FixRequest { command: string; deviceId?: string | null; problem?: string | null; createdBy: string }
export type FixOutcome = { ok: true; id: number; status: string } | { ok: false; reason: string };

/** Choose the hub again: the host the server had is let go, and the tablets' next minute check-ins elect one. */
async function electHub(storeId: number): Promise<string> {
  await mutateStorePreferences(storeId, (current: any) => {
    if (!current.localHub) return null;
    const { hostRegisterId: _h, address: _a, ...rest } = current.localHub;
    return { ...current, localHub: rest };
  });
  broadcastNotification({ type: "settings_changed", storeId, scope: "/api/nail/hub" } as any);
  return "The hub was let go; the front desk tablets choose it again within a minute (the Main station first).";
}

export async function requestFix(storeId: number, f: FixRequest): Promise<FixOutcome> {
  if (SERVER_FIXES.has(f.command)) {
    try {
      const detail = f.command === "elect_hub" ? await electHub(storeId) : "Done";
      const r = await pool.query(
        `INSERT INTO offline_fixes (store_id, command, problem, status, detail, created_by, finished_at) VALUES ($1, $2, $3, 'done', $4, $5, now()) RETURNING id`,
        [storeId, f.command, f.problem ?? null, detail, f.createdBy],
      );
      return { ok: true, id: Number(r.rows[0].id), status: "done" };
    } catch (err) {
      await pool.query(`INSERT INTO offline_fixes (store_id, command, problem, status, detail, created_by, finished_at) VALUES ($1, $2, $3, 'failed', $4, $5, now())`,
        [storeId, f.command, f.problem ?? null, String((err as Error)?.message ?? err).slice(0, 300), f.createdBy]).catch(() => {});
      return { ok: false, reason: (err as Error)?.message ?? "The fix failed" };
    }
  }
  if (!DEVICE_COMMANDS.has(f.command)) return { ok: false, reason: "Unknown fix" };
  if (!f.deviceId) return { ok: false, reason: "This fix is for one tablet: choose which" };
  const open = await pool.query(
    `SELECT id FROM offline_fixes WHERE store_id = $1 AND device_id = $2 AND command = $3 AND status IN ('pending', 'sent') LIMIT 1`,
    [storeId, f.deviceId, f.command],
  );
  if (open.rows[0]) return { ok: true, id: Number(open.rows[0].id), status: "pending" };
  const lastHour = await pool.query(
    `SELECT COUNT(*)::int AS n FROM offline_fixes WHERE store_id = $1 AND device_id = $2 AND command = $3 AND created_at > now() - interval '1 hour'`,
    [storeId, f.deviceId, f.command],
  );
  if (Number(lastHour.rows[0]?.n) >= 3) return { ok: false, reason: "Already tried 3 times in the last hour" };
  const r = await pool.query(
    `INSERT INTO offline_fixes (store_id, device_id, command, problem, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [storeId, f.deviceId, f.command, f.problem ?? null, f.createdBy],
  );
  const id = Number(r.rows[0].id);
  // Straight to the tablet if it is connected; otherwise it gets it with its next health report.
  broadcastNotification({ type: "device_command", storeId, deviceId: f.deviceId, id, command: f.command } as any);
  return { ok: true, id, status: "pending" };
}

/** The commands waiting for this tablet (given with its health report). One not answered in 10 minutes is sent again;
 *  one a day old is given up. */
export async function commandsFor(storeId: number, deviceId: string): Promise<{ id: number; command: string }[]> {
  await pool.query(`UPDATE offline_fixes SET status = 'expired', finished_at = now() WHERE store_id = $1 AND device_id = $2
                      AND status IN ('pending', 'sent') AND created_at < now() - interval '1 day'`, [storeId, deviceId]);
  const r = await pool.query(
    `UPDATE offline_fixes SET status = 'sent', sent_at = now()
      WHERE store_id = $1 AND device_id = $2 AND (status = 'pending' OR (status = 'sent' AND sent_at < now() - interval '10 minutes'))
      RETURNING id, command`,
    [storeId, deviceId],
  );
  return r.rows.map((x: any) => ({ id: Number(x.id), command: x.command }));
}

/** What the tablet said about a command it carried out. */
export async function recordFixResult(storeId: number, deviceId: string, id: number, ok: boolean, detail: string | null): Promise<boolean> {
  const r = await pool.query(
    `UPDATE offline_fixes SET status = $5, detail = $4, finished_at = now()
      WHERE id = $1 AND store_id = $2 AND device_id = $3 AND status IN ('pending', 'sent') RETURNING id`,
    [id, storeId, deviceId, detail?.slice(0, 300) ?? null, ok ? "done" : "failed"],
  );
  return !!r.rows[0];
}

/**
 * Self-healing (the 5-minute job): every problem with a fix gets it, unless that fix already failed 3 times on that
 * tablet today — then the problem is marked for a person instead. Returns the problems with that mark. `apply` false:
 * only the marks (the support center's live view never starts a fix by itself).
 */
export async function autoHeal(storeId: number, verdict: HealthVerdict, apply = true): Promise<(HealthProblem & { needsPerson?: boolean })[]> {
  const out: (HealthProblem & { needsPerson?: boolean })[] = [];
  const done = new Set<string>();
  for (const p of verdict.problems) {
    if (!p.fix) { out.push(p); continue; }
    const key = `${p.fix}:${p.deviceId ?? ""}`;
    const failed = await pool.query(
      `SELECT COUNT(*)::int AS n FROM offline_fixes WHERE store_id = $1 AND command = $2 AND COALESCE(device_id, '') = $3
          AND status IN ('failed', 'expired') AND created_at > now() - interval '1 day'`,
      [storeId, p.fix, p.deviceId ?? ""],
    );
    if (Number(failed.rows[0]?.n) >= 3) { out.push({ ...p, needsPerson: true }); continue; }
    if (apply && !done.has(key)) {
      done.add(key);
      // A server fix is not repeated within 15 minutes (the tablets need a moment to act on it).
      const recentServerFix = SERVER_FIXES.has(p.fix)
        ? (await pool.query(`SELECT 1 FROM offline_fixes WHERE store_id = $1 AND command = $2 AND created_at > now() - interval '15 minutes' LIMIT 1`, [storeId, p.fix])).rows[0]
        : null;
      if (!recentServerFix) await requestFix(storeId, { command: p.fix, deviceId: p.deviceId ?? null, problem: p.code, createdBy: "auto" }).catch(() => null);
    }
    out.push(p);
  }
  return out;
}

/** The salon's fix history, newest first (support). */
export async function recentFixes(storeId: number, limit = 20) {
  const r = await pool.query(
    `SELECT id, device_id, command, problem, status, detail, created_by, created_at, finished_at FROM offline_fixes
      WHERE store_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [storeId, limit],
  );
  return r.rows.map((x: any) => ({
    id: Number(x.id), deviceId: x.device_id, command: x.command, problem: x.problem, status: x.status, detail: x.detail,
    createdBy: x.created_by, createdAt: x.created_at, finishedAt: x.finished_at,
  }));
}

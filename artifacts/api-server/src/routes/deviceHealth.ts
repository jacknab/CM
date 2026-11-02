/**
 * Offline-mode health reports from the salon's tablets (owner, 2026-11-02; phase 1). The page on every POS tablet and
 * customer screen (booking lib/deviceHealth.ts) sends what it knows about its offline setup every 2 minutes while
 * online, plus the reports it kept while offline. Stored per tablet (device_health) and as history (device_health_log),
 * shown on /isTeam/accounts/:id › Devices.
 *
 *   POST /api/devices/health  { deviceId, reports: [report, …] }   signed-in tablets; a paired customer screen sends
 *                                                                    its salon's `slug` and its screen id instead.
 */
import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { getClientIp } from "../lib/salonNetworkGuard";
import { deviceAuthorizedFor } from "../lib/kioskAccess";
import { requireSupportAuth } from "../lib/supportAuth";
import { evaluateOfflineHealth, validRegisterId, type HealthInput, type HealthVerdict } from "../lib/offlineHealthRules";
import { autoHeal, commandsFor, recentFixes, recordFixResult, requestFix } from "../lib/offlineFixes";

const router = Router();
const ID_RE = /^[A-Za-z0-9_.:-]{8,200}$/;
/** One report per tablet per 30 s at most (it sends every 2 minutes; this only stops a runaway page). */
const lastReport = new Map<string, number>();

async function storeFor(req: Request, deviceId: string): Promise<number | null> {
  const fromSession = await resolveSessionStoreId(req).catch(() => null);
  if (fromSession) return fromSession;
  // A customer screen or kiosk with no sign-in: accepted with the salon's device code (kiosk) or as a screen
  // paired with this salon.
  const slug = typeof req.body?.slug === "string" ? req.body.slug.slice(0, 120) : "";
  if (!slug) return null;
  const store = (await pool.query(`SELECT id FROM locations WHERE booking_slug = $1 LIMIT 1`, [slug])).rows[0];
  if (!store) return null;
  const storeId = Number(store.id);
  if (await deviceAuthorizedFor(req, storeId).catch(() => null)) return storeId;
  const paired = await pool.query(`SELECT 1 FROM frontdesk_screens WHERE store_id = $1 AND screen_id = $2 LIMIT 1`, [storeId, deviceId]);
  return paired.rows[0] ? storeId : null;
}

router.post("/api/devices/health", async (req: Request, res: Response) => {
  try {
    const deviceId = String(req.body?.deviceId ?? "");
    if (!ID_RE.test(deviceId)) return res.status(400).json({ message: "deviceId is required" });
    const storeId = await storeFor(req, deviceId);
    if (!storeId) return res.status(403).json({ message: "Not a tablet of a salon" });
    const key = `${storeId}:${deviceId}`;
    const now = Date.now();
    if (now - (lastReport.get(key) ?? 0) < 30_000) return res.json({ ok: true, skipped: true, commands: [] });
    lastReport.set(key, now);

    const reports = (Array.isArray(req.body?.reports) ? req.body.reports : [])
      .filter((r: any) => r && typeof r === "object" && !Number.isNaN(Date.parse(r.at)))
      .slice(-60);
    if (!reports.length) return res.status(400).json({ message: "No report" });
    const size = JSON.stringify(reports).length;
    if (size > 400_000) return res.status(413).json({ message: "Report too large" });

    const latest = reports[reports.length - 1];
    const text = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);
    const registerId = validRegisterId(latest.registerId);
    await pool.query(
      `INSERT INTO device_health (store_id, device_id, role, page, register_id, app_build, report, reported_at, received_at, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)
       ON CONFLICT (store_id, device_id) DO UPDATE SET role = EXCLUDED.role, page = EXCLUDED.page, register_id = EXCLUDED.register_id,
         app_build = EXCLUDED.app_build, report = EXCLUDED.report, reported_at = EXCLUDED.reported_at, received_at = now(), ip = EXCLUDED.ip`,
      [storeId, deviceId, text(latest.role, 20), text(latest.page, 60), registerId, text(latest.appBuild, 80), latest, new Date(latest.at), getClientIp(req)],
    );
    // History: every report sent (the ones kept while offline say so).
    const values: unknown[] = [];
    const rows = reports.map((r: any, i: number) => {
      values.push(storeId, deviceId, r, new Date(r.at), r.offline === true);
      const b = i * 5;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
    });
    await pool.query(`INSERT INTO device_health_log (store_id, device_id, report, reported_at, offline) VALUES ${rows.join(", ")}`, values);
    // Now and then: history older than 30 days goes.
    if (Math.random() < 0.01) void pool.query(`DELETE FROM device_health_log WHERE reported_at < now() - interval '30 days'`).catch(() => {});
    // Fixes waiting for this tablet (phase 3) go back with the answer.
    return res.json({ ok: true, commands: await commandsFor(storeId, deviceId).catch(() => []) });
  } catch (err) {
    console.error("[devices/health]", (err as Error)?.message);
    return res.status(500).json({ message: "Could not save the health report" });
  }
});

// A tablet carried out a fix (phase 3; booking lib/deviceCommands.ts) and says how it went.
router.post("/api/devices/command-result", async (req: Request, res: Response) => {
  try {
    const deviceId = String(req.body?.deviceId ?? "");
    const id = Number(req.body?.id);
    if (!ID_RE.test(deviceId) || !Number.isSafeInteger(id)) return res.status(400).json({ message: "deviceId and id are required" });
    const storeId = await storeFor(req, deviceId);
    if (!storeId) return res.status(403).json({ message: "Not a tablet of a salon" });
    const detail = typeof req.body?.detail === "string" ? req.body.detail : null;
    return res.json({ ok: await recordFixResult(storeId, deviceId, id, req.body?.ok === true, detail) });
  } catch (err) {
    console.error("[devices/command-result]", (err as Error)?.message);
    return res.status(500).json({ message: "Could not save the result" });
  }
});

// ── Phase 2: the salon's score and problems (lib/offlineHealthRules.ts) ─────────────────────────────────────────

/** What the rules need about one salon. */
export async function gatherHealthInput(storeId: number): Promise<HealthInput> {
  const [devices, stations, claims, prefs, declined] = await Promise.all([
    pool.query(`SELECT device_id, role, register_id, received_at, report FROM device_health
                 WHERE store_id = $1 AND received_at > now() - interval '7 days'`, [storeId]),
    pool.query(`SELECT id, name, is_default, is_active, cash_drawer_id FROM registers WHERE store_id = $1`, [storeId]),
    pool.query(`SELECT register_id, device_id, claimed_at FROM register_claims WHERE store_id = $1`, [storeId]),
    pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [storeId]),
    pool.query(`SELECT COUNT(*)::int AS n FROM offline_card_payments WHERE store_id = $1 AND status = 'declined'`, [storeId]).catch(() => ({ rows: [{ n: 0 }] })),
  ]);
  let hub: HealthInput["hub"] = null;
  try {
    const p = prefs.rows[0]?.preferences;
    const parsed = typeof p === "string" ? JSON.parse(p) : p;
    if (parsed?.localHub) hub = { hostRegisterId: parsed.localHub.hostRegisterId ?? null, address: parsed.localHub.address ?? null };
  } catch { /* no hub chosen */ }
  return {
    now: Date.now(),
    devices: devices.rows.map((d: any) => ({
      deviceId: d.device_id,
      role: d.role,
      registerId: validRegisterId(d.register_id) ?? validRegisterId(d.report?.registerId),
      receivedAt: new Date(d.received_at).toISOString(),
      report: d.report,
    })),
    stations: stations.rows.map((r: any) => ({ id: Number(r.id), name: r.name, isDefault: !!r.is_default, isActive: !!r.is_active, drawerId: r.cash_drawer_id ?? null })),
    claims: claims.rows.map((c: any) => ({ registerId: Number(c.register_id), deviceId: c.device_id, claimedAt: new Date(c.claimed_at).toISOString() })),
    hub,
    declinedOfflineCards: Number(declined.rows[0]?.n ?? 0),
  };
}

/** Score one salon now and keep the result. `heal`: also start the fixes (the 5-minute job). */
export async function checkStoreHealth(storeId: number, heal = false): Promise<HealthVerdict> {
  const evaluated = evaluateOfflineHealth(await gatherHealthInput(storeId));
  const verdict: HealthVerdict = { ...evaluated, problems: await autoHeal(storeId, evaluated, heal) };
  await pool.query(
    `INSERT INTO offline_health_status (store_id, score, problems, devices, checked_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (store_id) DO UPDATE SET score = EXCLUDED.score, problems = EXCLUDED.problems, devices = EXCLUDED.devices, checked_at = now()`,
    [storeId, verdict.score, JSON.stringify(verdict.problems), verdict.devices],
  );
  return verdict;
}

/**
 * Every 5 minutes, every salon whose tablets reported this week is scored again. One API worker does it (a Postgres
 * advisory lock), however many are running.
 */
let jobStarted = false;
export function startOfflineHealthJob(): void {
  if (jobStarted) return;
  jobStarted = true;
  const run = async () => {
    const client = await pool.connect().catch(() => null);
    if (!client) return;
    try {
      const lock = await client.query(`SELECT pg_try_advisory_lock(hashtext('offline_health_job')) AS ok`);
      if (!lock.rows[0]?.ok) return;
      try {
        const stores = await client.query(`SELECT DISTINCT store_id FROM device_health WHERE received_at > now() - interval '7 days'`);
        for (const row of stores.rows) {
          await checkStoreHealth(Number(row.store_id), true).catch((e) => console.warn("[offline-health] store", row.store_id, e?.message));
        }
      } finally {
        await client.query(`SELECT pg_advisory_unlock(hashtext('offline_health_job'))`).catch(() => {});
      }
    } catch (e: any) {
      console.warn("[offline-health] job:", e?.message);
    } finally {
      client.release();
    }
  };
  setTimeout(() => void run(), 60_000);
  setInterval(() => void run(), 5 * 60_000);
}

// The support center's list: every salon with tablets reporting, worst first.
router.get("/api/support/offline-health", requireSupportAuth, async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT h.store_id, l.name, l.booking_slug, h.score, h.problems, h.devices, h.checked_at,
              (SELECT MAX(received_at) FROM device_health d WHERE d.store_id = h.store_id) AS last_report_at
         FROM offline_health_status h JOIN locations l ON l.id = h.store_id
        ORDER BY h.score ASC NULLS FIRST, h.checked_at DESC LIMIT 500`,
    );
    return res.json({ salons: r.rows.map((x: any) => ({
      storeId: Number(x.store_id), name: x.name, slug: x.booking_slug, score: x.score, problems: x.problems ?? [],
      devices: Number(x.devices ?? 0), checkedAt: x.checked_at, lastReportAt: x.last_report_at,
    })) });
  } catch (err) {
    console.error("[support/offline-health]", (err as Error)?.message);
    return res.status(500).json({ error: "Could not load offline health" });
  }
});

// One salon, worked out now (the account's Devices tab).
router.get("/api/support/accounts/:id/offline-health", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = Number(req.params.id);
  if (!Number.isSafeInteger(storeId)) return res.status(400).json({ error: "Invalid account ID" });
  try {
    return res.json({ ...(await checkStoreHealth(storeId)), fixes: await recentFixes(storeId) });
  } catch (err) {
    console.error("[support/offline-health one]", (err as Error)?.message);
    return res.status(500).json({ error: "Could not work out offline health" });
  }
});

// Support's Run fix: start one fix now (the same as the automatic one, logged under the support login).
router.post("/api/support/accounts/:id/offline-fix", requireSupportAuth, async (req: Request, res: Response) => {
  const storeId = Number(req.params.id);
  if (!Number.isSafeInteger(storeId)) return res.status(400).json({ error: "Invalid account ID" });
  try {
    const who = req.session.supportAgentName ?? `agent ${req.session.supportAgentId ?? "?"}`;
    const outcome = await requestFix(storeId, {
      command: String(req.body?.command ?? ""), deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : null,
      problem: typeof req.body?.problem === "string" ? req.body.problem.slice(0, 60) : null, createdBy: `support:${String(who).slice(0, 80)}`,
    });
    return outcome.ok ? res.json(outcome) : res.status(409).json({ error: outcome.reason });
  } catch (err) {
    console.error("[support/offline-fix]", (err as Error)?.message);
    return res.status(500).json({ error: "Could not start the fix" });
  }
});

export default router;

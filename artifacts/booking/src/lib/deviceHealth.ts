/**
 * The tablet's offline-mode health, reported to the server (owner, 2026-11-02; phase 1 of the offline health work).
 * Every 2 minutes this page looks at its offline setup — the offline database (which storage, can it write, what it
 * holds and has not sent), its copy of the salon, the hub link, its clock — and sends it (routes/deviceHealth.ts).
 * With no internet the reports are kept on the tablet (the last 60) and sent once it is back, so support can see what
 * happened during an outage. Shown on /isTeam/accounts/:id › Devices.
 */
import { getStationDeviceId } from "@/lib/stationDevice";
import { localHub } from "@/lib/local-hub";
import { syncEngine } from "@/lib/sync-engine";
import { nailOffline, offlineStorage } from "@/lib/nail-offline";
import { salonMirrorStatus } from "@/lib/salon-mirror";
import { salonTimeZone } from "@/lib/salonClock";
import { kioskFetch } from "@/lib/kioskDevice";
import { runDeviceCommands, setCommandContext } from "@/lib/deviceCommands";
import { appDoesDeviceFixes, askApp } from "@/lib/nativeDevice";

export interface HealthContext {
  /** "pos" | "station": a front desk tablet; "screen": a customer screen; "kiosk": the check-in kiosk. */
  role: "pos" | "station" | "screen" | "kiosk";
  storeId: number | null;
  registerId?: number | null;
  /** A customer screen with no sign-in proves its salon with this (and its paired screen id). */
  slug?: string | null;
  /** This tablet keeps an offline queue of its own (the front desk); a customer screen doesn't. */
  usesOfflineQueue: boolean;
}

const EVERY_MS = 2 * 60_000;
const KEPT_KEY = "certxa.health.kept";
const KEEP = 60;

async function collect(ctx: HealthContext): Promise<Record<string, unknown>> {
  const offline = syncEngine.isOffline();
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    offline,
    role: ctx.role,
    page: typeof window !== "undefined" ? `/${window.location.pathname.split("/")[1] ?? ""}` : null,
    registerId: ctx.registerId ?? null,
    appBuild: (window as unknown as { CERTXA_APP_BUILD?: string }).CERTXA_APP_BUILD ?? null,
    inApp: !!(window as unknown as { CERTXA_NATIVE_APP?: boolean }).CERTXA_NATIVE_APP,
  };

  // The offline database: which storage, does it work, what it holds and has not sent.
  const storage = offlineStorage();
  const db: Record<string, unknown> = { storage: storage.kind, storageError: storage.error };
  try {
    db.test = await nailOffline.selfTest();
    if (ctx.usesOfflineQueue && ctx.storeId != null) {
      const [records, ops] = await Promise.all([nailOffline.localRecords(ctx.storeId), nailOffline.ops(ctx.storeId)]);
      const open = ops.filter((o) => o.state !== "done");
      db.records = records.length;
      db.unsent = open.filter((o) => o.state !== "attention").length;
      db.refused = open.filter((o) => o.state === "attention").length;
      db.oldestUnsentAt = open.reduce<string | null>((min, o) => (!min || o.createdAt < min ? o.createdAt : min), null);
      db.lastSentAt = await nailOffline.lastSyncAt(ctx.storeId).catch(() => null);
    }
  } catch (err) {
    db.error = String((err as Error)?.message ?? err).slice(0, 200);
  }
  report.db = db;
  // After the test the storage choice is known (it is made on first use).
  (report.db as Record<string, unknown>).storage = offlineStorage().kind;

  // The salon's copy on this tablet (the Certxa app's database only). Only the front desk stations (/nail, /barber)
  // keep one: the customer screen and the kiosk never do, and reporting their empty one read "Never synced".
  if (ctx.storeId != null && (ctx.role === "pos" || ctx.role === "station")) {
    try {
      const m = await salonMirrorStatus(ctx.storeId);
      report.mirror = m ? {
        complete: m.complete, syncedAt: m.syncedAt,
        tables: Object.keys(m.rows).length, rows: Object.values(m.rows).reduce((a, b) => a + (Number(b) || 0), 0),
      } : null;
    } catch (err) {
      report.mirror = { error: String((err as Error)?.message ?? err).slice(0, 200) };
    }
  }

  // The hub link.
  try { report.hub = localHub.snapshot(); } catch { report.hub = null; }

  // The clock: the tablet's own time zone against the salon's.
  let deviceTz: string | null = null;
  try { deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { /* unknown */ }
  report.clock = { deviceTz, salonTz: salonTimeZone() ?? null };

  // What the Certxa app says about itself: its update, SQLite's own check of the database file, its printer.
  if (appDoesDeviceFixes()) {
    const r = await askApp<{ info?: Record<string, unknown> }>("DEVICE_INFO", {}, 10_000);
    report.app = r.ok ? r.info ?? null : { error: r.detail ?? "No answer" };
  }
  return report;
}

function readKept(): Record<string, unknown>[] {
  try { const raw = localStorage.getItem(KEPT_KEY); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list : []; }
  catch { return []; }
}
function writeKept(list: Record<string, unknown>[]): void {
  try { localStorage.setItem(KEPT_KEY, JSON.stringify(list.slice(-KEEP))); } catch { /* storage full: the latest still goes when online */ }
}

async function send(ctx: HealthContext, reports: Record<string, unknown>[]): Promise<boolean> {
  try {
    const init: RequestInit = {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getStationDeviceId(), reports, ...(ctx.slug ? { slug: ctx.slug } : {}) }),
    };
    // A kiosk / customer screen sends the salon's device code with it (kioskDevice.ts).
    const res = ctx.slug ? await kioskFetch(ctx.slug, "/api/devices/health", init) : await fetch("/api/devices/health", init);
    if (!res.ok) return false;
    // Fixes the server wants this tablet to carry out (lib/deviceCommands.ts).
    const answer = await res.json().catch(() => null);
    if (Array.isArray(answer?.commands) && answer.commands.length) void runDeviceCommands(answer.commands, ctx);
    return true;
  } catch {
    return false;
  }
}

/** Start reporting this tablet's health. Returns the function that stops it. */
export function startDeviceHealth(ctx: HealthContext): () => void {
  setCommandContext(ctx);
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const report = await collect(ctx);
      if (syncEngine.isOffline()) { writeKept([...readKept(), report]); return; }
      const kept = readKept();
      if (await send(ctx, [...kept, report])) writeKept([]);
      else writeKept([...kept, { ...report, offline: true }]);
    } finally {
      busy = false;
    }
  };
  const first = setTimeout(() => void tick(), 15_000);
  const timer = setInterval(() => void tick(), EVERY_MS);
  return () => { stopped = true; clearTimeout(first); clearInterval(timer); setCommandContext(null); };
}

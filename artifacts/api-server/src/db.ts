import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const SLOW_QUERY_THRESHOLD_MS = 200;
const STATEMENT_TIMEOUT_MS    = 30_000;

// Env-overridable so a memory/CPU-constrained host can be tuned without a code
// change. `DB_POOL_MAX` shrinks each worker's footprint (2 cluster workers ×
// max = the real ceiling, shared with every other app on the same Postgres);
// `DB_CONNECT_TIMEOUT_MS` gives connection acquisition more slack when the box
// is thrashing right after a reboot/deploy (the "[db:slow] ~5000ms — SELECT 1"
// timeouts seen in the logs were acquisition hitting the old 5 s ceiling, not
// Postgres running out of connections).
const POOL_MAX           = Number(process.env.DB_POOL_MAX) || 20;
const CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS) || 8_000;
// Client-side per-query deadline. Without this a query whose response never
// comes back — event loop starved by co-tenant CPU load, or a dead socket —
// hangs forever and never releases its pool client. After POOL_MAX such stuck
// queries the whole worker stops serving and only a manual `pm2 restart` fixes
// it (the "page says Offline until I restart certxa-api" symptom). With it, the
// query rejects, the client is recycled, and the worker self-heals once CPU
// frees up. Set > statement_timeout (30 s) so a legitimately long query is
// killed by Postgres with a proper error first; this is the wedge backstop.
const QUERY_TIMEOUT_MS   = Number(process.env.DB_QUERY_TIMEOUT_MS) || 45_000;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // ── Pool sizing ────────────────────────────────────────────────────────────
  // Keep this ≤ the DB's max_connections limit (Replit PG default: 100).
  // 20 app connections leaves headroom for admin tools and background workers.
  max: POOL_MAX,
  // min: 0 — lazy pool: no eager connections at startup. This eliminates the
  // "Connection terminated due to connection timeout" warnings on VPS restart
  // where Postgres may not be fully accepting connections the instant the pool
  // object is created. waitForDb() gates all DDL/bootstrap on the first
  // successful SELECT 1, so there's no risk of hitting a cold pool mid-startup.
  min: 0,

  // ── Timeouts ───────────────────────────────────────────────────────────────
  // How long a client waits to be acquired from the pool before erroring.
  // On a contended host the TCP + auth handshake to local Postgres can exceed
  // the old 5 s; 8 s tolerates that while still failing fast enough to shed
  // load rather than pile up. `waitForDb()` still gates startup.
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  // Client-side per-query deadline (see QUERY_TIMEOUT_MS above). The single
  // most important knob for surviving a CPU-starvation event without a manual
  // restart: a wedged query rejects and frees its pool client instead of
  // holding it forever.
  query_timeout: QUERY_TIMEOUT_MS,
  // How long an idle connection stays alive before being closed.
  idleTimeoutMillis: 30_000,
  // Detect dead sockets after a PostgreSQL/proxy restart instead of reusing
  // them indefinitely.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // How long a query is allowed to run before being forcibly killed.
  // Protects against runaway queries degrading the whole pool.
  statement_timeout: STATEMENT_TIMEOUT_MS,
  // Identify this app in pg_stat_activity for easier monitoring.
  application_name: "certxa-salonos",
});

// ── Slow-query instrumentation ─────────────────────────────────────────────
// Wraps every pg.query call and emits a warning when a query exceeds the
// threshold. Adds zero overhead in the happy path (fast queries).
const originalQuery = pool.query.bind(pool) as typeof pool.query;
(pool as any).query = function (...args: Parameters<typeof originalQuery>) {
  const start = Date.now();
  const promise = (originalQuery as any)(...args);
  promise
    .then(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= SLOW_QUERY_THRESHOLD_MS) {
        const text =
          typeof args[0] === "string"
            ? args[0].slice(0, 120)
            : (args[0] as any)?.text?.slice(0, 120) ?? "<unknown>";
        console.warn(`[db:slow] ${elapsed}ms — ${text}`);
      }
    })
    .catch(() => {});
  return promise;
};

// ── Pool error handling ────────────────────────────────────────────────────
// Prevents uncaught exceptions from idle connection drops (e.g. DB restarts).
pool.on("error", (err) => {
  console.error("[db:pool] Unexpected idle client error:", err.message);
});

pool.on("connect", () => {
  // Log when pool creates a new physical connection (useful for diagnosing leaks)
  if (process.env.NODE_ENV === "development") {
    console.debug("[db:pool] New connection established");
  }
});

export const db = drizzle(pool, { schema });

// ── Health-check helper ────────────────────────────────────────────────────
// Used by /api/health and startup checks.
export async function dbHealthCheck(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// ── DB readiness gate ──────────────────────────────────────────────────────
// Call this at the top of any bootstrap that runs DDL at startup.
// Retries SELECT 1 with exponential backoff until the pool responds or the
// deadline (60 s) is reached. Prevents "connection terminated" crashes on
// VPS deployments where the DB proxy takes a few seconds to accept connections.
export async function waitForDb(label = "bootstrap"): Promise<void> {
  const deadline = Date.now() + 60_000;
  let delay = 1_000;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      await pool.query("SELECT 1");
      if (attempt > 0) console.log(`[db:ready] ${label} — pool ready after ${attempt + 1} attempt(s)`);
      return;
    } catch (err: any) {
      attempt++;
      const remaining = Math.round((deadline - Date.now()) / 1000);
      console.warn(`[db:ready] ${label} — pool not ready (attempt ${attempt}, ${remaining}s left): ${err?.message ?? err}`);
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 10_000);
    }
  }
  console.error(`[db:ready] ${label} — giving up after 60 s; bootstrap may fail`);
}

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Keep the shared pool bounded and resilient to a database restart.  This pool
// is used by sessions and several routers, so an unbounded/default pool can
// otherwise exhaust PostgreSQL connections or leave dead sockets around.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  min: 0,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 30_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: "certxa-salonos",
});

// Idle clients can be terminated by PostgreSQL, a proxy, or a network flap.
// pg removes the bad client; logging this event prevents it from becoming an
// uncaught process-level error while keeping the pool available for retries.
pool.on("error", (err) => {
  console.error("[db:pool] Unexpected idle client error:", err.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";

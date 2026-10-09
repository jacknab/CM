/**
 * One turn decision at a time per salon.
 *
 * "Who is next" followed by "lock them" is two steps; without this, two walk-ins at the same instant
 * (two tablets, or two API workers under PM2 cluster mode) both read the same leader and both get
 * that technician. The lock is a Postgres advisory lock, so it holds across processes.
 *
 * It is re-entrant within one request: code that already holds a salon's lock can call other turn
 * code that asks for it again (ticket creation → turn assignment) without waiting on itself.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "../db";

const TURN_LOCK_NAMESPACE = 918_273;
const held = new AsyncLocalStorage<Set<number>>();
/**
 * Within this process, requests for the same salon wait here first, WITHOUT a database connection.
 * Only the one at the head of the line takes a connection to hold the advisory lock, so a burst of
 * check-ins can never tie up the pool with connections that are all just waiting on each other.
 */
const inProcess = new Map<number, Promise<unknown>>();

export async function withTurnLock<T>(storeId: number, fn: () => Promise<T>): Promise<T> {
  const mine = held.getStore();
  if (mine?.has(storeId)) return fn();

  const before = inProcess.get(storeId) ?? Promise.resolve();
  let release!: () => void;
  const mineDone = new Promise<void>((resolve) => { release = resolve; });
  const tail = before.then(() => mineDone);
  inProcess.set(storeId, tail);
  await before.catch(() => {});
  try {
    const conn = await pool.connect();
    try {
      await conn.query(`SELECT pg_advisory_lock($1, $2)`, [TURN_LOCK_NAMESPACE, storeId]);
      try {
        return await held.run(new Set([...(mine ?? []), storeId]), fn);
      } finally {
        await conn.query(`SELECT pg_advisory_unlock($1, $2)`, [TURN_LOCK_NAMESPACE, storeId]);
      }
    } finally {
      conn.release();
    }
  } finally {
    release();
    if (inProcess.get(storeId) === tail) inProcess.delete(storeId);
  }
}

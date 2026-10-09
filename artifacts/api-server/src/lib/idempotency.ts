/**
 * Durable idempotency for requests that carry an `X-Idempotency-Key` header.
 *
 * A device that was offline replays its queued work when it reconnects, and it cannot always know whether
 * an earlier try reached the server (the reply may have been lost, the app killed, the server restarted).
 * So each queued operation carries a key that never changes, and the first successful answer is stored
 * against (salon, key) in the database. Any later request with the same key gets that answer back and
 * nothing is done twice. A failed request stores nothing, so it can simply be tried again.
 *
 * Requests without the header are untouched.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createHash } from "node:crypto";
import { pool } from "../db";

export type Reservation =
  | { kind: "new" }
  | { kind: "done"; status: number; body: unknown }
  /** `entityId`: the record this request had already created when it was interrupted (see `markCreated`). */
  | { kind: "in_progress"; ageMs: number; entityId?: number | null }
  /** The key was used before for a request that said something different. */
  | { kind: "mismatch" };

/** The same request always gives the same fingerprint, whatever order its fields were written in. */
export function requestFingerprint(body: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as any)[k])]))
    : v;
  return createHash("sha256").update(JSON.stringify(stable(body ?? null))).digest("hex");
}

export interface IdempotencyStore {
  /** `hash`: the request's fingerprint. A key seen before with a different one is a `mismatch`. */
  reserve(storeId: number, key: string, scope: string, hash?: string): Promise<Reservation>;
  complete(storeId: number, key: string, status: number, body: unknown): Promise<void>;
  release(storeId: number, key: string): Promise<void>;
  /** Claim a reservation whose request evidently died (see STALE_MS). */
  takeOver(storeId: number, key: string): Promise<void>;
}

/** A request still "in progress" after this long did not finish (the process died mid-request). */
export const STALE_MS = 60_000;
/** Stored answers are kept this long — far beyond any plausible offline stretch. */
const KEEP_DAYS = 30;

export const pgIdempotencyStore: IdempotencyStore = {
  async reserve(storeId, key, scope, hash) {
    // One statement decides who owns the key: of two identical requests arriving together, exactly one inserts.
    const inserted = await pool.query(
      `INSERT INTO idempotency_keys (store_id, key, scope, state, request_hash) VALUES ($1, $2, $3, 'in_progress', $4)
       ON CONFLICT (store_id, key) DO NOTHING RETURNING key`,
      [storeId, key, scope, hash ?? null],
    );
    if (inserted.rows.length) return { kind: "new" };
    const { rows } = await pool.query(
      `SELECT state, status, response, request_hash, entity_id, EXTRACT(EPOCH FROM (now() - created_at)) * 1000 AS age_ms
         FROM idempotency_keys WHERE store_id = $1 AND key = $2`,
      [storeId, key],
    );
    const row = rows[0];
    // Released between the two statements: treat as free and reserve again.
    if (!row) return this.reserve(storeId, key, scope, hash);
    // Rows written before fingerprints existed have none: they are not held to it.
    if (hash && row.request_hash && row.request_hash !== hash) return { kind: "mismatch" };
    if (row.state === "done") return { kind: "done", status: Number(row.status) || 200, body: row.response };
    return { kind: "in_progress", ageMs: Number(row.age_ms), entityId: row.entity_id ?? null };
  },
  async complete(storeId, key, status, body) {
    await pool.query(
      `UPDATE idempotency_keys SET state = 'done', status = $3, response = $4::jsonb WHERE store_id = $1 AND key = $2`,
      [storeId, key, status, JSON.stringify(body ?? null)],
    );
  },
  async release(storeId, key) {
    await pool.query(`DELETE FROM idempotency_keys WHERE store_id = $1 AND key = $2 AND state = 'in_progress'`, [storeId, key]);
  },
  async takeOver(storeId, key) {
    await pool.query(`UPDATE idempotency_keys SET created_at = now() WHERE store_id = $1 AND key = $2 AND state = 'in_progress'`, [storeId, key]);
  },
};

/** Old answers are cleared once a day. */
export function startIdempotencyCleanup(): void {
  const sweep = () => pool.query(`DELETE FROM idempotency_keys WHERE created_at < now() - ($1 || ' days')::interval`, [String(KEEP_DAYS)]).catch(() => {});
  setInterval(sweep, 24 * 60 * 60 * 1000).unref?.();
}

const validKey = (raw: unknown): string | null => {
  const key = typeof raw === "string" ? raw.trim() : "";
  return key.length >= 8 && key.length <= 128 ? key : null;
};

/**
 * Express middleware. `resolveStoreId` says which salon the signed-in request belongs to; a key only ever
 * matches within that salon. The stored answer is written BEFORE the reply is sent, so a reply the device
 * never received is still on record.
 */
export function idempotent(
  scope: string,
  resolveStoreId: (req: Request) => Promise<number | null | undefined>,
  store: IdempotencyStore = pgIdempotencyStore,
  /** Build the answer for a request that was interrupted after it had already created its record. */
  recover?: (entityId: number, storeId: number) => Promise<{ status: number; body: unknown } | null>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = validKey(req.get("x-idempotency-key"));
    if (!key) return next();
    let storeId: number | null | undefined;
    try {
      storeId = await resolveStoreId(req);
    } catch {
      storeId = null;
    }
    // Not signed in to a salon: the route itself refuses; nothing to remember.
    if (!storeId) return next();

    let reservation: Reservation;
    try {
      reservation = await store.reserve(storeId, key, scope, requestFingerprint(req.body));
    } catch (err: any) {
      console.error(`[idempotency] ${scope}: could not reserve the key:`, err?.message);
      // Refuse rather than risk doing the work twice; the device keeps the operation and tries again.
      return res.status(503).json({ code: "IDEMPOTENCY_UNAVAILABLE", message: "Please try again in a moment." });
    }

    if (reservation.kind === "done") {
      const body = reservation.body && typeof reservation.body === "object" && !Array.isArray(reservation.body)
        ? { ...(reservation.body as Record<string, unknown>), alreadyProcessed: true }
        : reservation.body;
      return res.status(reservation.status).json(body);
    }
    // The same key with different contents is a different request wearing a used key: never answer it with
    // the first one's result, and never run it.
    if (reservation.kind === "mismatch") {
      return res.status(422).json({ code: "IDEMPOTENCY_KEY_REUSED", message: "This request does not match the one first sent with the same key." });
    }
    if (reservation.kind === "in_progress") {
      if (reservation.ageMs < STALE_MS) {
        return res.status(409).json({ code: "REQUEST_IN_PROGRESS", message: "This request is still being processed. Try again shortly." });
      }
      // It died part-way. If it had already created its record, answer from that record — do not create another.
      if (reservation.entityId != null && recover) {
        const answer = await recover(reservation.entityId, storeId).catch(() => null);
        if (answer) {
          await store.complete(storeId, key, answer.status, answer.body).catch(() => {});
          const body = answer.body && typeof answer.body === "object" && !Array.isArray(answer.body) ? { ...(answer.body as Record<string, unknown>), alreadyProcessed: true } : answer.body;
          return res.status(answer.status).json(body);
        }
      }
      await store.takeOver(storeId, key).catch(() => {});
    }

    const sid = storeId;
    let settled = false;
    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (settled) return sendJson(body);
      settled = true;
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const record = ok ? store.complete(sid, key, res.statusCode, body) : store.release(sid, key);
      void record.catch((err: any) => console.error(`[idempotency] ${scope}: could not record the answer:`, err?.message)).finally(() => sendJson(body));
      return res;
    }) as Response["json"];
    // A reply sent some other way (or a dropped connection) leaves no answer: free the key.
    res.on("close", () => { if (!settled) { settled = true; void store.release(sid, key).catch(() => {}); } });
    next();
  };
}

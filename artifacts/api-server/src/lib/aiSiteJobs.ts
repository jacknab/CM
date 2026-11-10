/**
 * Background jobs for the AI Website Builder (owner, 2026-11-09). An AI step can take longer than the web server's
 * 60-second limit, so the request starts a job and returns at once; the app checks the job until it is done.
 * A job that fails gives its credits back. A job left "running" by a server restart is closed as failed (and refunded)
 * the next time anyone looks at it after STALE_MS.
 */
import { pool } from "../db";
import { refundAiCredits } from "./aiCredits";
import { AiAnswerError, AiUnavailableError } from "./aiProvider";

const STALE_MS = 15 * 60_000;

export type AiJob = { id: number; kind: string; status: "running" | "done" | "failed"; result: any; error: string | null; createdAt: string };

const rowToJob = (r: any): AiJob => ({ id: Number(r.id), kind: r.kind, status: r.status, result: r.result, error: r.error, createdAt: r.created_at });

/** A job already started with this charge key (a retried request), if any. */
export async function jobByKey(storeId: number, chargeKey: string): Promise<AiJob | null> {
  const r = (await pool.query(`SELECT * FROM ai_site_jobs WHERE store_id = $1 AND charge_key = $2 ORDER BY id DESC LIMIT 1`, [storeId, chargeKey])).rows[0];
  return r ? rowToJob(r) : null;
}

export async function startJob(storeId: number, kind: string, chargeKey: string | null, work: () => Promise<unknown>): Promise<number> {
  const id = Number((await pool.query(`INSERT INTO ai_site_jobs (store_id, kind, charge_key) VALUES ($1, $2, $3) RETURNING id`, [storeId, kind, chargeKey])).rows[0].id);
  setImmediate(async () => {
    try {
      const result = await work();
      await pool.query(`UPDATE ai_site_jobs SET status = 'done', result = $2, finished_at = now() WHERE id = $1`, [id, JSON.stringify(result ?? null)]);
    } catch (err: any) {
      const message = err instanceof AiUnavailableError || err instanceof AiAnswerError ? err.message : "Something went wrong.";
      console.error(`[ai-site] job ${id} (${kind})`, err?.message ?? err);
      if (chargeKey) await refundAiCredits(storeId, chargeKey).catch((e) => console.error("[ai-site] refund", e?.message));
      await pool.query(`UPDATE ai_site_jobs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [id, `${message} Your credits were not used.`]).catch(() => {});
    }
  });
  return id;
}

export async function getJob(storeId: number, id: number): Promise<AiJob | null> {
  const r = (await pool.query(`SELECT * FROM ai_site_jobs WHERE id = $1 AND store_id = $2`, [id, storeId])).rows[0];
  if (!r) return null;
  if (r.status === "running" && Date.now() - new Date(r.created_at).getTime() > STALE_MS) {
    if (r.charge_key) await refundAiCredits(storeId, r.charge_key).catch(() => {});
    const closed = (await pool.query(`UPDATE ai_site_jobs SET status = 'failed', error = 'This took too long and was stopped. Your credits were not used.', finished_at = now()
      WHERE id = $1 AND status = 'running' RETURNING *`, [id])).rows[0];
    return rowToJob(closed ?? r);
  }
  return rowToJob(r);
}

/** The newest job still running for this business (so the app can pick it up again after being closed). */
export async function runningJob(storeId: number): Promise<AiJob | null> {
  const r = (await pool.query(`SELECT * FROM ai_site_jobs WHERE store_id = $1 AND status = 'running' ORDER BY id DESC LIMIT 1`, [storeId])).rows[0];
  return r ? getJob(storeId, Number(r.id)) : null;
}

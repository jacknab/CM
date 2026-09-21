/**
 * Persistent tech state timers for the Techs page.
 *
 * Every technician is always in one state — available (free, in the turn order), busy (with a client), break, or off
 * (not clocked in). The moment they ENTERED that state is stored on the staff row (`availability_since`), so the
 * "free for 00:12:31" timer is the same on every POS station and never restarts from zero because a screen was
 * closed, reloaded or the server restarted. The state is re-checked whenever the turn queue changes (clock in/out,
 * check-in, ticket start/finish, break on/off …) — see broadcastTurnEligibilityChanged in routes.ts.
 */
import { pool } from "../db";

export type TechState = "available" | "busy" | "break" | "off";

/** The Techs page's four states, from the turn-queue flags. */
export function techStateOf(t: { clockedIn?: boolean; paused?: boolean; currentStatus?: string }): TechState {
  if (t.clockedIn === false) return "off";
  if (t.paused || t.currentStatus === "on_break") return "break";
  if (t.currentStatus === "busy") return "busy";
  return "available";
}

export interface AvailabilityDecision {
  state: TechState;
  since: Date;
}

/**
 * What to store for one tech. Entering a new state starts the timer NOW. A tech with nothing stored yet (first run after
 * this feature shipped) is seeded from `seedSince` — when we can work out when they really got here — so timers already
 * running don't jump back to zero. Returns null when nothing changes.
 */
export function decideAvailability(args: {
  prevState: string | null;
  prevSince: Date | null;
  state: TechState;
  now: Date;
  seedSince?: Date | null;
}): AvailabilityDecision | null {
  const { prevState, prevSince, state, now, seedSince } = args;
  if (prevState == null || prevSince == null) {
    const seed = seedSince && seedSince.getTime() <= now.getTime() ? seedSince : now;
    return { state, since: seed };
  }
  if (prevState !== state) return { state, since: now };
  return null;
}

export interface EligibilityLike {
  technicians: { id: number; clockedIn?: boolean; paused?: boolean; currentStatus?: string }[];
}

const running = new Map<number, Promise<void>>();
const rerun = new Set<number>();

async function syncOnce(storeId: number, getEligibility: (storeId: number, serviceId: null) => Promise<EligibilityLike>): Promise<void> {
  const elig = await getEligibility(storeId, null);
  const { rows: stored } = await pool.query(
    `SELECT s.id, s.availability_state, s.availability_since, l.timezone
       FROM staff s JOIN locations l ON l.id = s.store_id WHERE s.store_id = $1`,
    [storeId],
  );
  const byId = new Map<number, any>(stored.map((r: any) => [Number(r.id), r]));
  const now = new Date();

  for (const t of elig.technicians) {
    const row = byId.get(Number(t.id));
    if (!row) continue;
    const state = techStateOf(t);
    let seedSince: Date | null = null;
    if (row.availability_state == null) {
      // Seed from what the database already knows: when they clocked in / last finished a client / started the current one.
      if (state === "available") {
        const { rows } = await pool.query(
          `SELECT GREATEST(
                    (SELECT MAX(clock_in) FROM timeclock WHERE staff_id = $1 AND clock_out IS NULL
                        AND work_date = to_char(NOW() AT TIME ZONE $2, 'YYYY-MM-DD')),
                    (SELECT MAX(completed_at) FROM appointments WHERE staff_id = $1 AND status = 'completed'
                        AND completed_at > NOW() - INTERVAL '18 hours')
                  ) AS since`,
          [t.id, row.timezone || "UTC"],
        );
        seedSince = rows[0]?.since ? new Date(rows[0].since) : null;
      } else if (state === "busy") {
        const { rows } = await pool.query(
          `SELECT MAX(started_at) AS since FROM appointments WHERE staff_id = $1 AND status = 'started'`, [t.id]);
        seedSince = rows[0]?.since ? new Date(rows[0].since) : null;
      }
    }
    const decision = decideAvailability({
      prevState: row.availability_state ?? null,
      prevSince: row.availability_since ? new Date(row.availability_since) : null,
      state, now, seedSince,
    });
    if (decision) {
      await pool.query(`UPDATE staff SET availability_state = $1, availability_since = $2 WHERE id = $3`, [decision.state, decision.since, t.id]);
    }
  }
}

/**
 * Bring every tech's stored state in line with the turn queue. Runs one store at a time (a burst of turn events costs one
 * extra pass, never a pile-up). Resolves once the store's timers are up to date.
 */
export function syncTechAvailability(storeId: number, getEligibility: (storeId: number, serviceId: null) => Promise<EligibilityLike>): Promise<void> {
  const inFlight = running.get(storeId);
  if (inFlight) {
    rerun.add(storeId);
    return inFlight;
  }
  const p = (async () => {
    try {
      do {
        rerun.delete(storeId);
        await syncOnce(storeId, getEligibility);
      } while (rerun.has(storeId));
    } finally {
      running.delete(storeId);
    }
  })();
  running.set(storeId, p);
  return p;
}

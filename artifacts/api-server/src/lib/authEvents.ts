/**
 * Auth Event Logger
 *
 * Fire-and-forget helper to record authentication events (login, logout,
 * failed login, register, password reset, OAuth) into the auth_events table.
 * Never throws — a logging failure must never block the underlying auth action.
 */
import type { Request } from "express";
import { pool } from "../db";

export type AuthEventType =
  | "login"
  | "failed_login"
  | "logout"
  | "register"
  | "forgot_password"
  | "password_reset"
  | "google_oauth"
  | "magic_link";

/**
 * Resolve the primary store_id for a user (for activity feed keying).
 * Returns null if the user has no store yet (e.g. brand-new signup before onboarding).
 */
async function resolveStoreIdForUser(userId: string): Promise<number | null> {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM locations WHERE user_id = $1 ORDER BY id LIMIT 1`,
      [userId]
    );
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract the best available client IP from an Express request.
 * Handles Replit's reverse proxy (x-forwarded-for header).
 */
function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim() || null;
  }
  return (req as any).ip || (req as any).socket?.remoteAddress || null;
}

/**
 * Log an authentication event. Fire-and-forget — never blocks the caller.
 *
 * @param userId   The owner's user id (from users.id). Pass null for unknown
 *                 users (e.g. failed login with unrecognised email).
 * @param eventType  One of the AuthEventType values.
 * @param req      The Express request (used to extract IP + User-Agent).
 * @param metadata Optional extra context (e.g. { email } for failed logins).
 */
export function logAuthEvent(
  userId: string | null,
  eventType: AuthEventType,
  req: Request,
  metadata?: Record<string, unknown>
): void {
  void (async () => {
    try {
      const storeId = userId ? await resolveStoreIdForUser(userId) : null;
      const ip = getClientIp(req);
      const ua = (req.headers["user-agent"] as string | undefined) ?? null;
      await pool.query(
        `INSERT INTO auth_events (user_id, store_id, event_type, ip_address, user_agent, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId ?? "unknown",
          storeId,
          eventType,
          ip,
          ua,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );
    } catch (err) {
      console.error("[authEvents] Failed to log event:", (err as Error)?.message);
    }
  })();
}

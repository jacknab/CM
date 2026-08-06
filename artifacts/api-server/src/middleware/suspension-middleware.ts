import { Request, Response, NextFunction } from "express";
import { pool } from "../db";

/**
 * Resolves the store id for the current session.
 * Supports both owner sessions (userId → locations) and
 * staff sessions (staffId → staff → store_id).
 */
async function resolveStoreIdFromSession(req: Request): Promise<number | null> {
  const userId = (req.session as any)?.userId;
  if (userId) {
    const result = await pool.query<{ id: number }>(
      `SELECT id FROM locations WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return result.rows[0]?.id ?? null;
  }

  const staffId = (req.session as any)?.staffId;
  if (staffId) {
    const result = await pool.query<{ store_id: number }>(
      `SELECT store_id FROM staff WHERE id = $1 LIMIT 1`,
      [staffId]
    );
    return result.rows[0]?.store_id ?? null;
  }

  return null;
}

/**
 * requireNotSuspended
 * -------------------
 * Blocks suspended accounts from accessing payroll, reports, and analytics
 * API endpoints. Returns 402 with a structured JSON error so the frontend
 * can show the correct "subscribe to continue" message.
 *
 * Fail-open: if the session has no store context or a DB error occurs the
 * request passes through and the normal auth/ownership checks handle it.
 *
 * locked accounts are intentionally NOT handled here — the locked flow is
 * a full UI lockout managed by AccountStatusGate and the billing routes.
 */
export const requireNotSuspended = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const storeId = await resolveStoreIdFromSession(req);
    if (!storeId) {
      // No store context in session — let downstream auth handle it.
      next();
      return;
    }

    const result = await pool.query<{ account_status: string }>(
      `SELECT account_status FROM locations WHERE id = $1 LIMIT 1`,
      [storeId]
    );

    const status = (result.rows[0]?.account_status ?? "active").toLowerCase();

    if (status === "suspended") {
      res.status(402).json({
        error: "Account suspended",
        code: "ACCOUNT_SUSPENDED",
        message:
          "Your account's free trial has ended. Subscribe to a Certxa plan to access this feature.",
      });
      return;
    }

    next();
  } catch (err) {
    // Fail open — never block a request due to a status-check error.
    console.error("[requireNotSuspended] DB error:", err);
    next();
  }
};

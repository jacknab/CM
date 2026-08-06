import { Request, Response, NextFunction } from "express";
import { TrialService } from "../services/trial-service";
import { pool } from "../db";

/**
 * Resolves the owner userId for the current session.
 * - Owner sessions: userId is already on the session.
 * - Staff sessions: look up store_id from staff, then user_id from locations.
 * Returns null if unresolvable.
 */
async function resolveOwnerUserId(req: Request): Promise<string | null> {
  const userId = (req.session as any)?.userId;
  if (userId) return userId as string;

  const staffId = (req.session as any)?.staffId;
  if (staffId) {
    const result = await pool.query<{ user_id: string }>(
      `SELECT l.user_id
       FROM staff s
       JOIN locations l ON l.id = s.store_id
       WHERE s.id = $1
       LIMIT 1`,
      [staffId]
    );
    return result.rows[0]?.user_id ?? null;
  }

  return null;
}

/**
 * Middleware to check trial status and restrict booking actions for expired trials.
 * Works for both owner sessions (userId) and staff sessions (staffId → store owner).
 */
export const requireActiveTrial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ownerUserId = await resolveOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const canBook = await TrialService.canPerformBookingActions(ownerUserId);

    if (!canBook) {
      return res.status(403).json({
        message: "Your free trial has ended. Upgrade your account to continue accepting bookings.",
        code: "TRIAL_EXPIRED",
      });
    }

    return next();
  } catch (error) {
    console.error("Trial middleware error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Middleware to add trial status to request object.
 */
export const addTrialStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ownerUserId = await resolveOwnerUserId(req);
    if (ownerUserId) {
      const trialStatus = await TrialService.getTrialStatus(ownerUserId);
      (req as any).trialStatus = trialStatus;
    }
    next();
  } catch (error) {
    console.error("Trial status middleware error:", error);
    next();
  }
};

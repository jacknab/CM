import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    supportAgentId?: number;
    supportAgentRole?: string;
    supportAgentName?: string;
  }
}

/**
 * Gates every /api/support/* and /api/support/live-chat/* route.
 *
 * Fails closed by default: with no env vars set at all (the actual state of
 * every deployment today, including production), a request with no support
 * session is rejected. The dev convenience auto-login only engages when the
 * operator explicitly opts in with BOTH a non-production NODE_ENV and
 * SUPPORT_DEV_BYPASS=true — so a missing/misconfigured env var can never
 * silently grant admin access, which is what happened previously (the old
 * bypass activated unless a variable was explicitly set to disable it).
 */
export function requireSupportAuth(req: Request, res: Response, next: NextFunction) {
  const devBypassEnabled =
    process.env.NODE_ENV !== "production" && process.env.SUPPORT_DEV_BYPASS === "true";

  if (devBypassEnabled && !req.session.supportAgentId) {
    req.session.supportAgentId = 1;
    req.session.supportAgentRole = "admin";
    req.session.supportAgentName = "Admin Agent";
  }

  if (!req.session.supportAgentId) {
    return res.status(401).json({ error: "Unauthorized — support login required" });
  }
  next();
}

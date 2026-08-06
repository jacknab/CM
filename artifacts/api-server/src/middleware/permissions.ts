import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { staff } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  computePermissions,
  hasPermission,
  normalizeRole,
  type Permission,
  type Role,
} from "@shared/permissions";

export interface AuthContext {
  userId?: string;
  staffId?: number;
  role: Role;
  permissions: Set<Permission>;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Resolves the current session into an AuthContext (role + permission set)
 * and attaches it to req.auth. Skips silently if there is no session — the
 * existing /api auth gate handles 401s for unauthenticated requests.
 */
export const attachAuthContext: RequestHandler = async (req, _res, next) => {
  const sessionUserId = (req.session as any)?.userId as string | undefined;
  const sessionStaffId = (req.session as any)?.staffId as number | undefined;

  try {
    if (sessionUserId) {
      const [user] = await db.select().from(users).where(eq(users.id, sessionUserId));
      if (user) {
        const role = normalizeRole(user.role);
        req.auth = {
          userId: user.id,
          staffId: user.staffId ?? undefined,
          role,
          permissions: computePermissions(role, user.permissions ?? null),
        };
      }
    } else if (sessionStaffId) {
      // Staff-table login — pseudo-user with the "staff" role; overrides live on staff.permissions.
      const [staffMember] = await db.select().from(staff).where(eq(staff.id, sessionStaffId));
      if (staffMember) {
        req.auth = {
          staffId: staffMember.id,
          role: "staff",
          permissions: computePermissions("staff", staffMember.permissions ?? null),
        };
      }
    }
  } catch (err) {
    console.error("[permissions] Failed to resolve auth context:", err);
  }

  next();
};

/** Route guard factory: rejects with 403 if the user lacks the required permission. */
export function requirePermission(perm: Permission): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!hasPermission(req.auth.permissions, perm)) {
      return res.status(403).json({ message: "Forbidden", missing: perm });
    }
    return next();
  };
}

/**
 * Returns a staff-id filter to apply to a query when the user can only see
 * their own data. Returns undefined when the user can see everything (or has
 * no staffId to scope to).
 */
export function ownStaffScope(req: Request): number | undefined {
  const auth = req.auth;
  if (!auth) return undefined;
  if (hasPermission(auth.permissions, "appointments.viewAll" as Permission)) {
    return undefined; // unrestricted
  }
  if (hasPermission(auth.permissions, "appointments.viewOwn" as Permission) && auth.staffId) {
    return auth.staffId;
  }
  return undefined;
}

export function can(req: Request, perm: Permission): boolean {
  return !!req.auth && hasPermission(req.auth.permissions, perm);
}

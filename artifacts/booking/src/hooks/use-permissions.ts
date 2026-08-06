import { useAuth } from "./use-auth";
import {
  computePermissions,
  normalizeRole,
  type Permission,
} from "@shared/permissions";

interface AuthUserWithPermissions {
  role?: string | null;
  permissions?: string[] | Record<string, boolean> | null;
}

export function usePermissions() {
  const { user } = useAuth();
  const u = user as AuthUserWithPermissions | null | undefined;

  const role = normalizeRole(u?.role);

  const overrides =
    u?.permissions && !Array.isArray(u.permissions)
      ? (u.permissions as Record<string, boolean>)
      : null;

  const permSet = computePermissions(role, overrides);

  const can = (perm: Permission | string): boolean => permSet.has(perm as Permission);
  const canAny = (...perms: (Permission | string)[]): boolean =>
    perms.some((p) => permSet.has(p as Permission));
  const canAll = (...perms: (Permission | string)[]): boolean =>
    perms.every((p) => permSet.has(p as Permission));

  return {
    role,
    permissions: permSet,
    isOwner: role === "owner",
    isManager: role === "manager",
    isStaff: role === "staff",
    can,
    canAny,
    canAll,
  };
}

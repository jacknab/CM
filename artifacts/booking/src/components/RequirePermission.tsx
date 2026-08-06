import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@shared/permissions";

interface Props {
  permission: Permission | string;
  children: ReactNode;
  redirectTo?: string;
}

/** Page-level guard: redirects to /dashboard (or `redirectTo`) if the user lacks the permission. */
export function RequirePermission({ permission, children, redirectTo = "/dashboard" }: Props) {
  const { user, isLoading } = useAuth();
  const { can } = usePermissions();

  if (isLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!can(permission)) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}

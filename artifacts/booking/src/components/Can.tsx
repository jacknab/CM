import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import type { Permission } from "@shared/permissions";

interface CanProps {
  permission?: Permission | string;
  anyOf?: (Permission | string)[];
  allOf?: (Permission | string)[];
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally renders children based on the current user's permissions.
 *
 *   <Can permission={PERMISSIONS.BILLING_MANAGE}>...</Can>
 *   <Can anyOf={[P.REPORTS_VIEW, P.REPORTS_FINANCIAL]}>...</Can>
 */
export function Can({ permission, anyOf, allOf, fallback = null, children }: CanProps) {
  const { can, canAny, canAll } = usePermissions();

  let allowed = true;
  if (permission && !can(permission)) allowed = false;
  if (anyOf && anyOf.length > 0 && !canAny(...anyOf)) allowed = false;
  if (allOf && allOf.length > 0 && !canAll(...allOf)) allowed = false;

  return <>{allowed ? children : fallback}</>;
}

import { Navigate } from "react-router-dom";
import { useFeatureFlags, type FeatureFlags } from "@/hooks/use-features";

interface FeatureGuardProps {
  feature: keyof Pick<FeatureFlags, "pos" | "waitlist" | "timeclock" | "rewardPoints" | "turnSystem">;
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * Redirects to `redirectTo` (default: /overview) when a feature flag is disabled.
 * Wrap any route element that should only be accessible when the feature is on.
 */
export function FeatureGuard({
  feature,
  children,
  redirectTo = "/overview",
}: FeatureGuardProps) {
  const flags = useFeatureFlags();
  if (!flags[feature]) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}

/**
 * use-subscription-features.ts
 *
 * React hooks for querying the plan-based feature access system.
 * These replace any hardcoded plan checks in the frontend.
 *
 * Usage:
 *   const { hasFeature, getLimit } = useSubscriptionFeatures();
 *   if (!hasFeature("advanced_reporting")) return <UpgradePrompt />;
 */

import { useQuery } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureConfig {
  enabled: boolean;
  limit: number | null;
}

export interface SubscriptionFeaturesResult {
  planCode: string | null;
  features: Record<string, FeatureConfig>;
}

// ─── Core hook ────────────────────────────────────────────────────────────────

/**
 * Fetches the full feature access map for the selected store.
 * Returns stable helpers for checking individual features.
 */
export function useSubscriptionFeatures() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  const query = useQuery<SubscriptionFeaturesResult>({
    queryKey: ["/api/plans/my-features", storeId],
    queryFn: async () => {
      if (!storeId) throw new Error("No store selected");
      const res = await fetch(`/api/plans/my-features?storeId=${storeId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load feature access");
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 60_000,
    retry: 1,
  });

  const data = query.data;

  /**
   * Returns true if the feature is enabled on the store's current plan.
   * Defaults to true when data hasn't loaded yet (fail-open during loading).
   */
  function hasFeature(featureId: string): boolean {
    if (!data) return true; // optimistic while loading
    return data.features[featureId]?.enabled ?? false;
  }

  /**
   * Returns the hard limit for a feature, or null if unlimited.
   * Returns null when data hasn't loaded yet.
   */
  function getLimit(featureId: string): number | null {
    if (!data) return null;
    return data.features[featureId]?.limit ?? null;
  }

  /**
   * Returns the raw feature config object for a feature id.
   */
  function getFeature(featureId: string): FeatureConfig | null {
    if (!data) return null;
    return data.features[featureId] ?? null;
  }

  return {
    isLoading: query.isLoading,
    planCode:  data?.planCode ?? null,
    features:  data?.features ?? {},
    hasFeature,
    getLimit,
    getFeature,
  };
}

// ─── Single-feature hook ──────────────────────────────────────────────────────

/**
 * Lightweight hook to gate a single feature.
 *
 * @example
 *   const { enabled, limit } = useFeatureGate("advanced_reporting");
 *   if (!enabled) return <UpgradePrompt feature="advanced_reporting" />;
 */
export function useFeatureGate(featureId: string) {
  const { hasFeature, getLimit, getFeature, isLoading, planCode } = useSubscriptionFeatures();
  return {
    enabled:   hasFeature(featureId),
    limit:     getLimit(featureId),
    feature:   getFeature(featureId),
    isLoading,
    planCode,
  };
}

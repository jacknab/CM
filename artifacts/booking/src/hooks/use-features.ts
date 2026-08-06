import { useQuery } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";

export type FeatureFlags = {
  turnSystem:         boolean;
  timeclock:          boolean;
  waitlist:           boolean;
  pos:                boolean;
  rewardPoints:       boolean;
  autoClockOutFloor:  string;
  kioskEnabled:       boolean;
  staffPortalEnabled: boolean;
};

const DEFAULT_FLAGS: FeatureFlags = {
  turnSystem:         true,
  timeclock:          true,
  waitlist:           true,
  pos:                true,
  rewardPoints:       true,
  autoClockOutFloor:  "01:00",
  kioskEnabled:       true,
  staffPortalEnabled: true,
};

/** Turn System is exclusive to nail-salon business types. */
export function isNailSalonBiz(businessType?: string | null): boolean {
  return /nail/i.test(businessType ?? "");
}

export function useFeatureFlags(): FeatureFlags {
  const { selectedStore } = useSelectedStore();
  const nailSalon = isNailSalonBiz(selectedStore?.category);

  const { data } = useQuery<FeatureFlags>({
    queryKey: ["/api/settings/features", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) throw new Error("No store");
      const res = await fetch(
        `/api/settings/features?storeId=${selectedStore.id}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load feature flags");
      return res.json();
    },
    enabled: !!selectedStore?.id,
    staleTime: 30_000,
  });

  const flags = data ?? DEFAULT_FLAGS;

  return {
    ...flags,
    // Turn System is only available for nail salons regardless of the saved setting
    turnSystem: nailSalon ? flags.turnSystem : false,
  };
}

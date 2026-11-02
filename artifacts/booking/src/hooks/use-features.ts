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
  /** Online booking, the calendar, booking settings and Autumn (Advanced Features › Booking System). */
  bookingSystem:      boolean;
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
  bookingSystem:      true,
};

/** A nail-salon business type. */
export function isNailSalonBiz(businessType?: string | null): boolean {
  return /nail/i.test(businessType ?? "");
}

/** The Turn System is for nail salons and barbershops (barbershops added 2026-11-02). */
export function turnSystemAllowed(businessType?: string | null): boolean {
  return isNailSalonBiz(businessType) || /barber/i.test(businessType ?? "");
}

export function useFeatureFlags(): FeatureFlags {
  const { selectedStore } = useSelectedStore();
  const turnsAllowed = turnSystemAllowed(selectedStore?.category);

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
    // Turn System is only available for nail salons and barbershops, whatever the saved setting
    turnSystem: turnsAllowed ? flags.turnSystem : false,
  };
}

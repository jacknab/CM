import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSelectedStore } from "@/hooks/use-store";
import type { CalendarSettings } from "@shared/schema";

export function useCalendarSettings() {
  const { selectedStore } = useSelectedStore();
  return useQuery<CalendarSettings | null>({
    queryKey: [`/api/calendar-settings?storeId=${selectedStore?.id}`],
    enabled: !!selectedStore?.id,
    queryFn: async () => {
      if (!selectedStore?.id) return null;
      const res = await fetch(`/api/calendar-settings?storeId=${selectedStore.id}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateCalendarSettings() {
  const { selectedStore } = useSelectedStore();
  return useMutation({
    mutationFn: async (data: Partial<CalendarSettings>) => {
      const res = await apiRequest("PUT", "/api/calendar-settings", {
        ...data,
        storeId: selectedStore?.id,
      });
      return res.json();
    },
    onSuccess: (updatedSettings) => {
      // Prefer storeId from the server response over the closure value — the
      // closure captures selectedStore at mutation-creation time and may be
      // undefined if the store context hadn't resolved yet, which would write
      // to the wrong cache key (?storeId=undefined).
      const resolvedStoreId = updatedSettings?.storeId ?? selectedStore?.id;
      if (!resolvedStoreId) return; // no valid key — skip rather than pollute cache
      queryClient.setQueryData(
        [`/api/calendar-settings?storeId=${resolvedStoreId}`],
        updatedSettings,
      );
    },
  });
}

export const DEFAULT_CALENDAR_SETTINGS = {
  startOfWeek: "monday" as string,
  timeSlotInterval: 15,
  nonWorkingHoursDisplay: 1,
  allowBookingOutsideHours: true,
  autoCompleteAppointments: true,
  autoMarkNoShows: false,
  showPrices: true,
  walkInsEnabled: true,
  language: "en",
};

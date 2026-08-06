import { useQuery } from "@tanstack/react-query";

export function useAvailableTime(appointmentId: number | null | undefined) {
  return useQuery<{ availableMinutes: number }>({
    queryKey: ["/api/appointments", appointmentId, "available-time"],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/${appointmentId}/available-time`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch available time");
      return res.json();
    },
    enabled: !!appointmentId,
    staleTime: 30 * 1000,
  });
}

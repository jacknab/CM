import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AppointmentWithDetails } from "@shared/schema";

export function useBooking(confirmationNumber?: string, slug?: string) {
  return useQuery<AppointmentWithDetails[]>({
    queryKey: ["booking", confirmationNumber, slug],
    queryFn: async () => {
      if (!confirmationNumber) return [];
      const params = new URLSearchParams();
      if (slug) params.set("slug", slug);
      const url = params.toString()
        ? `/api/appointments/confirmation/${confirmationNumber}?${params.toString()}`
        : `/api/appointments/confirmation/${confirmationNumber}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to fetch booking");
      }
      return res.json();
    },
    enabled: !!confirmationNumber,
  });
}

type CancelBookingInput = {
  confirmationNumber: string;
  appointmentId: number;
  slug?: string;
};

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ confirmationNumber, appointmentId, slug }: CancelBookingInput) => {
      const params = new URLSearchParams();
      if (slug) params.set("slug", slug);
      const url = params.toString()
        ? `/api/appointments/confirmation/${confirmationNumber}/cancel?${params.toString()}`
        : `/api/appointments/confirmation/${confirmationNumber}/cancel`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to cancel booking");
      }

      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["booking", variables.confirmationNumber, variables.slug] });
    },
  });
}

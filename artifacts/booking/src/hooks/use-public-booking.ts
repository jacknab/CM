import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AppointmentWithDetails } from "@shared/schema";

export type BookingStorePolicy = {
  allowOnlineCancellation: boolean;
  cancellationHoursCutoff: number;
  cancellationPolicyText: string;
};

export type BookingLookupResult = {
  appointments: AppointmentWithDetails[];
  storePolicy: BookingStorePolicy;
};

const DEFAULT_POLICY: BookingStorePolicy = {
  allowOnlineCancellation: true,
  cancellationHoursCutoff: 24,
  cancellationPolicyText: "",
};

export function useBooking(confirmationNumber?: string, slug?: string) {
  return useQuery<BookingLookupResult>({
    queryKey: ["booking", confirmationNumber, slug],
    queryFn: async () => {
      if (!confirmationNumber) return { appointments: [], storePolicy: DEFAULT_POLICY };
      const params = new URLSearchParams();
      if (slug) params.set("slug", slug);
      const url = params.toString()
        ? `/api/appointments/confirmation/${confirmationNumber}?${params.toString()}`
        : `/api/appointments/confirmation/${confirmationNumber}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return { appointments: [], storePolicy: DEFAULT_POLICY };
        throw new Error("Failed to fetch booking");
      }
      const body = await res.json();
      // The endpoint used to return a bare array; tolerate both shapes.
      if (Array.isArray(body)) return { appointments: body, storePolicy: DEFAULT_POLICY };
      return {
        appointments: body.appointments ?? [],
        storePolicy: { ...DEFAULT_POLICY, ...(body.storePolicy ?? {}) },
      };
    },
    enabled: !!confirmationNumber,
  });
}

/**
 * Just the cancellation-policy bits of GET /api/public/booking-payment-policy/:slug —
 * for themes that don't already fetch the full payment policy.
 */
export function useCancellationPolicy(slug?: string) {
  return useQuery<{ required: boolean; text: string }>({
    queryKey: ["cancellation-policy", slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/booking-payment-policy/${slug}`);
      if (!res.ok) return { required: false, text: "" };
      const d = await res.json().catch(() => ({}));
      return { required: !!d.cancellationPolicyRequired, text: String(d.cancellationPolicyText ?? "") };
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

type CancelBookingInput = {
  confirmationNumber: string;
  appointmentId: number;
  slug?: string;
};

export type CancelBookingError = Error & {
  status?: number;
  cutoffHours?: number;
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

      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const err = new Error(body?.message || "Failed to cancel booking") as CancelBookingError;
        err.status = res.status;
        if (typeof body?.cutoffHours === "number") err.cutoffHours = body.cutoffHours;
        throw err;
      }
      // body may carry { cancellationFeeCharged, cancellationFeeError }
      return body;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["booking", variables.confirmationNumber, variables.slug] });
    },
  });
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useAppointmentSSE(storeId: number | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!storeId) return;

    let es: EventSource;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      es = new EventSource(`/api/appointments/sse?storeId=${storeId}`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            appointmentId: number;
            storeId: number;
            status: string;
            source: "manual" | "auto";
          };
          if (data.storeId === storeId) {
            queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
            // The nail POS board + tech cards ride the same status changes (a kiosk check-in, an auto no-show).
            queryClient.invalidateQueries({ queryKey: ["/api/nail/board"] });
            queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] });
            if (data.source === "auto") {
              console.log(
                `[sse] Auto no-show for appt ${data.appointmentId} → invalidating calendar`
              );
            }
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        if (!destroyed) {
          retryTimer = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [storeId, queryClient]);
}

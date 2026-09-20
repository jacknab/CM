import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BOARD_KEY } from "./nailApi";

/**
 * Live link to the server for the nail screen: same /ws/notifications socket the
 * calendar uses, so the board follows bookings, turn changes, kiosk check-ins and
 * salon-settings edits made on any other device. `refreshAll` is the settings-sync
 * refetch (see use-settings-sync). Returns whether the socket is currently open.
 */
export function useNailRealtime(opts: {
  storeId: number | undefined;
  registerId: number;
  refreshAll: () => void;
  /** Digits the customer typed on the paired /frontdesk tablet. */
  onFrontdeskPhone?: (digits: string) => void;
}): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Latest callbacks without reconnecting the socket every render.
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    const storeId = opts.storeId;
    if (!storeId) return;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let seenOpen = false;

    const invalidateTickets = () => {
      queryClient.invalidateQueries({ queryKey: BOARD_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    };

    const connect = () => {
      if (destroyed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${storeId}&registerId=${opts.registerId}`);
      ws.onopen = () => {
        setConnected(true);
        // A reconnect may have missed events while offline.
        if (seenOpen) { invalidateTickets(); cb.current.refreshAll(); }
        seenOpen = true;
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "booking_created":
            case "booking_updated":
            case "booking_deleted":
            case "turn_eligibility_changed":
            case "kiosk_checkin_created":
              invalidateTickets();
              queryClient.invalidateQueries({ queryKey: ["/api/kiosk/walkins/today"] });
              break;
            case "settings_changed":
              cb.current.refreshAll();
              break;
            case "kiosk_checkout_phone_result":
              if (typeof data.phone === "string") {
                const digits = data.phone.replace(/\D/g, "").slice(-10);
                if (digits.length === 10) cb.current.onFrontdeskPhone?.(digits);
              }
              break;
          }
        } catch { /* ignore malformed frames */ }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        setConnected(false);
        if (!destroyed) timer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      destroyed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.storeId, opts.registerId, queryClient]);

  return connected;
}

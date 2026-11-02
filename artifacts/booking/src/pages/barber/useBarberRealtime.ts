import { useEffect, useRef, useState } from "react";
import { refreshOfflineManagerPin } from "@/lib/managerPin";
import { onDeviceCommandMessage } from "@/lib/deviceCommands";
import { forRegister, localHub } from "@/lib/local-hub";
import { useQueryClient } from "@tanstack/react-query";
import { boardKey } from "./barberApi";

/**
 * Live link to the server for the nail screen: same /ws/notifications socket the
 * calendar uses, so the board follows bookings, turn changes, kiosk check-ins and
 * salon-settings edits made on any other device. `refreshAll` is the settings-sync
 * refetch (see use-settings-sync). Returns whether the socket is currently open.
 */
export function useBarberRealtime(opts: {
  storeId: number | undefined;
  registerId: number;
  refreshAll: () => void;
  /** Digits the customer typed on the paired /frontdesk tablet. */
  onFrontdeskPhone?: (digits: string) => void;
  /** A print job the server pushed (the kiosk's check-in ticket) — print it if a printer is connected. */
  onPrintJob?: (job: any) => void;
  /** A client who was waiting has just been given a technician (the ticket's id). */
  onTicketAssigned?: (appointmentId: number) => void;
  /** The client is (or has stopped) typing their number on the paired /frontdesk tablet's check-in screen. */
  onFrontdeskTyping?: (typing: boolean) => void;
  /** Customer-screen checkout events (tip picked, card result) for the checkout open on this station. */
  onCheckoutEvent?: (msg: { type: string; [k: string]: unknown }) => void;
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
      queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    };

    // One handler for a message from the server's socket or from the salon's local hub.
    const onData = (data: any) => {
      try {
          switch (data.type) {
            case "booking_created":
            case "booking_updated":
            case "booking_deleted":
            case "turn_eligibility_changed":
            case "kiosk_checkin_created":
            // Online bookings, cancellations and payments made anywhere move the glance numbers too.
            case "new_booking":
            case "appointment_cancelled":
            case "appointment_rescheduled":
            case "payment_received":
              invalidateTickets();
              queryClient.invalidateQueries({ queryKey: ["/api/kiosk/walkins/today"] });
              break;
            case "nail_ticket_assigned":
              invalidateTickets();
              if (Number.isFinite(Number(data.appointmentId))) cb.current.onTicketAssigned?.(Number(data.appointmentId));
              break;
            case "settings_changed":
              cb.current.refreshAll();
              break;
            // The manager PIN was changed (on any device): this tablet's offline copy follows.
            case "manager_pin_changed":
              void refreshOfflineManagerPin(storeId);
              break;
            // A fix the server wants this tablet to carry out (lib/deviceCommands.ts; offline health, phase 3).
            case "device_command":
              onDeviceCommandMessage(data);
              break;
            case "kiosk_checkin_typing":
              cb.current.onFrontdeskTyping?.(data.typing === true);
              break;
            case "kiosk_print_job":
              cb.current.onPrintJob?.(data);
              break;
            case "kiosk_checkout_tip_selected":
            case "kiosk_checkout_sync_request":
            case "kiosk_checkout_redeem_reward":
            case "kiosk_checkout_payment_result":
            case "kiosk_checkout_receipt_choice":
              cb.current.onCheckoutEvent?.(data);
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
    const offHub = localHub.onMessage((message) => { if (forRegister(message, opts.registerId)) onData(message); });

    const connect = () => {
      if (destroyed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const sock = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${storeId}&registerId=${opts.registerId}`);
      ws = sock;
      // Heartbeat: a socket can stay "open" after the Wi-Fi drops or changes while nothing gets through. This
      // screen then believed it was live, polled only every 5 minutes and missed check-ins until a reload (store 2,
      // 2026-11-01). The server answers every ping; nothing heard for 50 s → replace the socket (onopen refetches).
      let lastHeard = Date.now();
      const heartbeat = setInterval(() => {
        if (sock.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastHeard > 50_000) {
          // Closing a dead socket can wait a long time for an answer that never comes: let it go and start afresh.
          clearInterval(heartbeat);
          sock.onclose = null;
          try { sock.close(); } catch { /* already gone */ }
          setConnected(false);
          if (!destroyed) connect();
          return;
        }
        try { sock.send(JSON.stringify({ type: "ping", ts: Date.now() })); } catch { /* onclose reconnects */ }
      }, 20_000);
      sock.onopen = () => {
        lastHeard = Date.now();
        setConnected(true);
        // The manager PIN for offline use, fresh on every (re)connect — a change made while this tablet was away is picked up.
        void refreshOfflineManagerPin(storeId);
        // A reconnect may have missed events while offline.
        if (seenOpen) { invalidateTickets(); cb.current.refreshAll(); }
        seenOpen = true;
      };
      sock.onmessage = (event) => {
        lastHeard = Date.now();
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }
        onData(data);
      };
      sock.onerror = () => sock.close();
      sock.onclose = () => {
        clearInterval(heartbeat);
        if (ws !== sock) return;
        setConnected(false);
        if (!destroyed) timer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      destroyed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
      offHub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.storeId, opts.registerId, queryClient]);

  return connected;
}

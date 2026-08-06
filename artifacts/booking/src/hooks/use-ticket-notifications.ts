import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type NotifPermission = "default" | "granted" | "denied" | "unsupported";

interface TicketAlert {
  id: number;
  priority: string;
  issue: string;
  name: string | null;
  businessName: string | null;
  phone: string | null;
  createdAt: string;
}

interface UseTicketNotificationsReturn {
  permission: NotifPermission;
  latestAlert: TicketAlert | null;
  requestPermission: () => Promise<void>;
  clearAlert: () => void;
}

export function useTicketNotifications(): UseTicketNotificationsReturn {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const [latestAlert, setLatestAlert] = useState<TicketAlert | null>(null);

  const [permission, setPermission] = useState<NotifPermission>(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission as NotifPermission;
  });

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result as NotifPermission);
  }, []);

  const clearAlert = useCallback(() => setLatestAlert(null), []);

  useEffect(() => {
    const es = new EventSource("/api/admin/support-agent/live-events", {
      withCredentials: true,
    });
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as {
          event: string;
          ticket: TicketAlert;
        };
        if (payload.event !== "ticket.created") return;

        const ticket = payload.ticket;
        setLatestAlert(ticket);

        qc.invalidateQueries({ queryKey: ["support-tickets"] });
        qc.invalidateQueries({ queryKey: ["support-analytics"] });

        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          const title =
            ticket.priority === "urgent"
              ? "🚨 Urgent support ticket created"
              : "⚠️ High-priority support ticket created";

          const body = [
            ticket.businessName || ticket.name || "Unknown business",
            ticket.issue.slice(0, 120),
          ]
            .filter(Boolean)
            .join(" · ");

          new Notification(title, {
            body,
            icon: "/favicon.ico",
            tag: `ticket-${ticket.id}`,
            requireInteraction: ticket.priority === "urgent",
          });
        }
      } catch {
        /* ignore malformed events */
      }
    };

    es.onerror = () => {
      setTimeout(() => {
        es.close();
      }, 1000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [qc]);

  return { permission, latestAlert, requestPermission, clearAlert };
}

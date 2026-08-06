import { useEffect, useRef, useState, useCallback } from "react";
import { useSelectedStore } from "@/hooks/use-store";

export type AppNotification = {
  id: string;
  ts: number;
  type: "payment_received" | "appointment_cancelled" | "appointment_rescheduled" | "support_reply";
  customerName: string;
  serviceName?: string;
  staffName?: string;
  time?: string;
  amount?: number;
  staffId?: number;
  appointmentDate?: string;
  read: boolean;
};

const VALID_NOTIFICATION_TYPES: AppNotification["type"][] = [
  "payment_received",
  "appointment_cancelled",
  "appointment_rescheduled",
  "support_reply",
];

const MAX_STORED = 50;
const BASE_RETRY_MS = 4_000;
const MAX_RETRY_MS  = 60_000;

function storageKey(storeId: number) {
  return `certxa_notifications_${storeId}`;
}

function loadStored(storeId: number): AppNotification[] {
  try {
    const raw = localStorage.getItem(storageKey(storeId));
    const parsed: AppNotification[] = raw ? JSON.parse(raw) : [];
    return parsed.filter(n => VALID_NOTIFICATION_TYPES.includes(n.type));
  } catch {
    return [];
  }
}

function persist(storeId: number, items: AppNotification[]) {
  try {
    localStorage.setItem(storageKey(storeId), JSON.stringify(items.slice(0, MAX_STORED)));
  } catch {}
}

function isTodayDate(dateStr?: string): boolean {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
}

export interface UseNotificationsOptions {
  /** When set, only same-day cancelled/rescheduled notifications for this staff member are kept */
  staffPortalFilter?: { staffId: number };
}

export function useNotifications(options?: UseNotificationsOptions) {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const staffPortalFilter = options?.staffPortalFilter;

  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    storeId ? loadStored(storeId) : []
  );

  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay     = useRef<number>(BASE_RETRY_MS);

  const connect = useCallback(() => {
    if (!storeId) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws/notifications?storeId=${storeId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelay.current = BASE_RETRY_MS;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "turn_eligibility_changed") {
          window.dispatchEvent(new CustomEvent("turn-eligibility-changed", { detail: data }));
          return;
        }
        if (data.type === "queue_updated") {
          window.dispatchEvent(new CustomEvent("queue-updated", { detail: data }));
          return;
        }
        if (data.type === "job_status_updated") {
          window.dispatchEvent(new CustomEvent("job-status-updated", { detail: data }));
          return;
        }
        if (data.type === "ai_call_updated") {
          window.dispatchEvent(new CustomEvent("ai-call-updated", { detail: data }));
          return;
        }
        if (["booking_created", "booking_updated", "booking_deleted", "staff_assigned"].includes(data.type)) {
          window.dispatchEvent(new CustomEvent("sync-event", { detail: data }));
          return;
        }

        // Drop any event type that doesn't map to a meaningful notification
        if (!VALID_NOTIFICATION_TYPES.includes(data.type)) return;

        // Staff portal mode: accept cancellations/reschedules for this staff member
        // so important changes always light up the bell indicator.
        if (staffPortalFilter) {
          const isRelevantType =
            data.type === "appointment_cancelled" || data.type === "appointment_rescheduled";
          const isMyAppointment = data.staffId === staffPortalFilter.staffId;
          if (!isRelevantType || !isMyAppointment) return;
        }

        const notification: AppNotification = {
          id: data.id || `${Date.now()}`,
          ts: data.ts || Date.now(),
          type: data.type,
          customerName: data.customerName,
          serviceName: data.serviceName,
          staffName: data.staffName,
          time: data.time,
          amount: data.amount,
          staffId: data.staffId,
          appointmentDate: data.appointmentDate,
          read: false,
        };

        setNotifications((prev) => {
          const next = [notification, ...prev].slice(0, MAX_STORED);
          persist(storeId, next);
          return next;
        });
      } catch {}
    };

    ws.onclose = () => {
      const delay = retryDelay.current;
      retryDelay.current = Math.min(delay * 2, MAX_RETRY_MS);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    retryDelay.current = BASE_RETRY_MS;
    setNotifications(loadStored(storeId));
    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [storeId, connect]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      if (storeId) persist(storeId, next);
      return next;
    });
  }, [storeId]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    if (storeId) persist(storeId, []);
  }, [storeId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllRead, clearAll };
}

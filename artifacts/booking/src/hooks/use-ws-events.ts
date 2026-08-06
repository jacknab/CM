import { useState, useEffect, useRef, useCallback } from "react";
import { enterpriseSyncEngine, type WsEvent } from "@/lib/enterprise-sync-engine";

export function useWsEvents(
  handler?: (event: WsEvent) => void
): WsEvent | null {
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return enterpriseSyncEngine.onWsEvent((event) => {
      setLastEvent(event);
      handlerRef.current?.(event);
    });
  }, []);

  return lastEvent;
}

export function useWsEventsByType<T extends WsEvent["type"]>(
  types: T[],
  handler: (event: WsEvent & { type: T }) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return enterpriseSyncEngine.onWsEvent((event) => {
      if (types.includes(event.type as T)) {
        handlerRef.current(event as WsEvent & { type: T });
      }
    });
  }, [types.join(",")]);
}

export function useBookingEvents(onEvent: (event: WsEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    return enterpriseSyncEngine.onWsEvent((event) => {
      if (
        event.type === "booking_created" ||
        event.type === "booking_updated" ||
        event.type === "booking_deleted" ||
        event.type === "staff_assigned" ||
        event.type === "new_booking"
      ) {
        handlerRef.current(event);
      }
    });
  }, []);
}

/**
 * useDashboardWs
 *
 * Connects to /ws/dashboard?storeId=X and returns live dashboard snapshots.
 * Reconnects automatically with exponential backoff on disconnect.
 * Sends a ping every 25 s to keep the socket alive through proxies.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardData } from "@/lib/dashboardTypes";

export type { DashboardData };

interface UseDashboardWsResult {
  data: DashboardData | null;
  connected: boolean;
  lastUpdated: Date | null;
  isError: boolean;
}

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export function useDashboardWs(
  storeId: number | undefined,
): UseDashboardWsResult {
  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isError, setIsError] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  const clearHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const connect = useCallback(() => {
    if (!storeId || !mountedRef.current) return;

    // Tear down any existing socket
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    clearHeartbeat();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const ws = new WebSocket(
      `${protocol}//${host}/ws/dashboard?storeId=${storeId}`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setIsError(false);
      retryCountRef.current = 0;

      // Heartbeat keeps the socket alive through Replit's proxy
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (evt) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.type === "dashboard_snapshot" && msg.data) {
          setData(msg.data as DashboardData);
          setLastUpdated(new Date());
          setIsError(false);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setIsError(true);
    };

    ws.onclose = (evt) => {
      if (!mountedRef.current) return;
      setConnected(false);
      clearHeartbeat();
      wsRef.current = null;

      // 4003 = owner-access denied — don't retry
      if (evt.code === 4003) return;

      const backoff = Math.min(
        BASE_BACKOFF_MS * Math.pow(1.5, retryCountRef.current),
        MAX_BACKOFF_MS,
      );
      retryCountRef.current += 1;
      retryRef.current = setTimeout(connect, backoff);
    };
  }, [storeId]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearHeartbeat();
      if (retryRef.current) clearTimeout(retryRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { data, connected, lastUpdated, isError };
}

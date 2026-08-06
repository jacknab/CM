import type { WebSocketServer } from "ws";

interface WssStats {
  status: "not_initialized" | "ok";
  activeSessions: number;
  totalAccepted: number;
  peakConcurrent: number;
  lastErrorAt: string | null;
  lastError: string | null;
  initializedAt: string | null;
}

let _wss: WebSocketServer | null = null;
let _totalAccepted = 0;
let _peakConcurrent = 0;
let _lastError: string | null = null;
let _lastErrorAt: string | null = null;
let _initializedAt: string | null = null;

export function registerWss(wss: WebSocketServer): void {
  _wss = wss;
  _initializedAt = new Date().toISOString();
}

export function trackWssConnection(): void {
  _totalAccepted++;
  const current = _wss?.clients.size ?? 0;
  if (current > _peakConcurrent) _peakConcurrent = current;
}

export function trackWssError(message: string): void {
  _lastError = message;
  _lastErrorAt = new Date().toISOString();
}

export function getWssHealth(): WssStats {
  if (!_wss) {
    return {
      status: "not_initialized",
      activeSessions: 0,
      totalAccepted: _totalAccepted,
      peakConcurrent: _peakConcurrent,
      lastError: _lastError,
      lastErrorAt: _lastErrorAt,
      initializedAt: _initializedAt,
    };
  }
  return {
    status: "ok",
    activeSessions: _wss.clients.size,
    totalAccepted: _totalAccepted,
    peakConcurrent: _peakConcurrent,
    lastError: _lastError,
    lastErrorAt: _lastErrorAt,
    initializedAt: _initializedAt,
  };
}

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { keepSocketAlive } from "./ws-keepalive";

// Just enough of a browser WebSocket: event listeners, readyState, send and close.
class FakeSocket extends EventTarget {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  closed = false;
  onclose: ((e: Event) => void) | null = null;
  send(s: string) { this.sent.push(s); }
  close() { this.closed = true; } // a dead connection: the close event never comes
  hear() { this.dispatchEvent(new Event("message")); }
}

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as any).WebSocket = FakeSocket;
  (globalThis as any).CloseEvent = class extends Event {};
});
afterEach(() => { vi.useRealTimers(); });

describe("keeping a notifications socket honest", () => {
  test("pings every 20 s while the server answers, and leaves the socket alone", () => {
    const sock = new FakeSocket();
    keepSocketAlive(sock as unknown as WebSocket);
    for (let i = 0; i < 6; i++) { vi.advanceTimersByTime(20_000); sock.hear(); }
    expect(sock.sent.filter((s) => JSON.parse(s).type === "ping")).toHaveLength(6);
    expect(sock.closed).toBe(false);
  });

  test("a socket silent for 50 s is closed and its reconnect runs at once, only once", () => {
    const sock = new FakeSocket();
    const reconnect = vi.fn();
    sock.onclose = reconnect;
    keepSocketAlive(sock as unknown as WebSocket);
    vi.advanceTimersByTime(60_000);
    expect(sock.closed).toBe(true);
    expect(reconnect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});

/**
 * Real-time Owner Dashboard WebSocket server
 * Path: /ws/dashboard?storeId=X
 *
 * On connect  → serve Redis-cached snapshot (or freshly computed one)
 * On mutation → routes.ts calls triggerDashboardBroadcast(storeId) which
 *               debounces 1 500 ms, recomputes, pushes to all open sockets
 *               for that store, and refreshes the Redis cache.
 *
 * Auth: rejects staff-only sessions (no userId).
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { pool } from "../db";
import { getSessionMiddleware } from "../auth";
import { isOriginAllowed } from "../lib/originValidator";
import {
  computeDashboard,
  getDashboardCache,
  setDashboardCache,
  invalidateDashboardCache,
} from "../lib/dashboardCache";
import { publishCrossProcess, subscribeCrossProcess, isCrossProcessBusAvailable } from "../lib/wsBroadcastBus";

const CROSS_PROCESS_CHANNEL = "ws:dashboard-invalidate";

/**
 * Apply an Express-style middleware to an HTTP upgrade request.
 * Upgrade requests bypass app.use(), so session (and any other middleware)
 * must be run manually before we can access req.session.
 *
 * fakeRes covers the full surface that express-session + on-headers uses:
 *   • setHeader / getHeader / removeHeader — for Set-Cookie
 *   • writeHead / end — patched by on-headers to intercept response flush
 *   • on / once / emit / removeListener — EventEmitter surface (no-ops for WS)
 * None of these will ever be called in anger because the WS upgrade response
 * is handled by the ws library, not Express — we only need session to READ
 * the cookie and populate req.session, not to write anything back.
 */
function applyMiddleware(
  middleware: (req: any, res: any, next: (err?: any) => void) => void,
  req: any,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fakeRes: Record<string, any> = {
      getHeader:      () => undefined,
      setHeader:      () => fakeRes,
      removeHeader:   () => fakeRes,
      writeHead:      () => fakeRes,
      end:            () => fakeRes,
      // EventEmitter stubs — express-session / on-headers may register finish listeners
      on:             () => fakeRes,
      once:           () => fakeRes,
      emit:           () => false,
      removeListener: () => fakeRes,
    };
    middleware(req, fakeRes, (err?: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Per-store connected clients
const storeClients = new Map<number, Set<WebSocket>>();

// Per-store debounce timers (coalesces rapid sequential mutations)
const debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();

const DEBOUNCE_MS = 1_500;

export function setupDashboardWS(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0] ?? "";
    if (pathname !== "/ws/dashboard") return; // let other listeners handle their paths

    // ── Origin validation ────────────────────────────────────────────────────
    // Browsers always send an Origin header on WebSocket upgrades.  Validating
    // it before accepting the connection prevents cross-site WebSocket hijacking:
    // a malicious page cannot steal dashboard data even if the victim's browser
    // automatically attaches a valid session cookie to the upgrade request.
    const origin     = req.headers.origin as string | undefined;
    const hostHeader = String(req.headers["x-forwarded-host"] || req.headers.host || "");

    if (!isOriginAllowed(origin, hostHeader)) {
      console.warn(`[dashboardWS] Rejected upgrade from disallowed origin: ${origin ?? "(none)"}`);
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    // Populate req.session before the connection handler checks auth.
    // Upgrade requests bypass Express middleware, so we must run the
    // session middleware manually here.
    applyMiddleware(getSessionMiddleware(), req)
      .then(() => {
        wss.handleUpgrade(req, socket as any, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      })
      .catch((err) => {
        console.error("[dashboardWS] session middleware error on upgrade:", err);
        socket.destroy();
      });
  });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const storeId = Number(url.searchParams.get("storeId"));

    if (!storeId || isNaN(storeId)) {
      ws.close(1008, "storeId required");
      return;
    }

    // Owner-only auth: require an authenticated userId AND ownership of the storeId
    const session = (req as any).session as Record<string, any> | undefined;
    const userId: string | undefined = session?.userId;

    if (!userId) {
      ws.close(4003, "Authentication required");
      return;
    }

    // Verify the authenticated user actually owns the requested store
    try {
      const owned = await pool.query<{ id: number }>(
        `SELECT id FROM locations WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [storeId, userId],
      );
      if (!owned.rows[0]?.id) {
        ws.close(4003, "Forbidden — store not owned by session user");
        return;
      }
    } catch {
      ws.close(1011, "Server error during authorization");
      return;
    }

    // Register
    if (!storeClients.has(storeId)) storeClients.set(storeId, new Set());
    storeClients.get(storeId)!.add(ws);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        }
      } catch {}
    });

    // 30-second periodic push — keeps timeclock counts and other non-appointment
    // data (e.g. clocked-in staff) fresh without requiring a mutation trigger.
    const periodicTimer = setInterval(async () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        void invalidateDashboardCache(storeId);
        const data = await computeDashboard(storeId);
        void setDashboardCache(storeId, data);
        ws.send(JSON.stringify({ type: "dashboard_snapshot", data }));
      } catch (err) {
        console.error("[dashboardWS] periodic push error:", err);
      }
    }, 30_000);

    ws.on("close", () => {
      clearInterval(periodicTimer);
      storeClients.get(storeId)?.delete(ws);
      if (storeClients.get(storeId)?.size === 0) storeClients.delete(storeId);
    });

    ws.on("error", () => {
      clearInterval(periodicTimer);
      storeClients.get(storeId)?.delete(ws);
    });

    // Serve snapshot immediately — Redis hit is fast, miss falls back to DB
    try {
      let cached = await getDashboardCache(storeId);
      if (!cached) {
        cached = await computeDashboard(storeId);
        void setDashboardCache(storeId, cached);
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "dashboard_snapshot", data: cached }));
      }
    } catch (err) {
      console.error("[dashboardWS] initial snapshot error:", err);
    }
  });
}

// The worker that handles the HTTP mutation triggering this is not
// necessarily the worker any given store's dashboard WebSocket landed on in
// PM2 cluster mode — each worker only knows about its own storeClients Set.
// So the actual recompute-and-push (gated on "does THIS worker have anyone
// watching") happens per-worker, driven by a cross-process signal rather
// than a local-only check.
function scheduleLocalBroadcast(storeId: number): void {
  const clients = storeClients.get(storeId);
  if (!clients || clients.size === 0) return;

  const existing = debounceTimers.get(storeId);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    storeId,
    setTimeout(async () => {
      debounceTimers.delete(storeId);
      try {
        const data = await computeDashboard(storeId);
        void setDashboardCache(storeId, data);
        const payload = JSON.stringify({ type: "dashboard_snapshot", data });
        const current = storeClients.get(storeId);
        if (!current) return;
        for (const ws of Array.from(current)) {
          if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        }
        console.log(
          `[dashboardWS] Broadcast sent to ${current.size} client(s) for store ${storeId}`,
        );
      } catch (err) {
        console.error("[dashboardWS] broadcast error:", err);
      }
    }, DEBOUNCE_MS),
  );
}

subscribeCrossProcess(CROSS_PROCESS_CHANNEL, (msg: { storeId: number }) => {
  scheduleLocalBroadcast(msg.storeId);
});

/**
 * Called from routes.ts after any appointment mutation.
 * Debounced per store so a burst of rapid saves (e.g. bulk status update)
 * triggers only one recompute + broadcast cycle.
 */
export function triggerDashboardBroadcast(storeId: number | undefined): void {
  if (!storeId) return;

  // Always invalidate so the next connection gets fresh data
  void invalidateDashboardCache(storeId);

  if (isCrossProcessBusAvailable()) {
    publishCrossProcess(CROSS_PROCESS_CHANNEL, { storeId });
  } else {
    scheduleLocalBroadcast(storeId);
  }
}

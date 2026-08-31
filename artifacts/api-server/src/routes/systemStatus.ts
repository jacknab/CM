import { Router } from "express";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { getRedisClient } from "../lib/redis";
import { resolvePhpPort } from "../php-proxy";
import dns from "dns";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { publishCrossProcess, subscribeCrossProcess, isCrossProcessBusAvailable } from "../lib/wsBroadcastBus";

const RAW_EVENT_CHANNEL = "ws:admin-status-raw";

export type ServiceStatus = "ok" | "warning" | "error" | "unconfigured";

export interface ServiceCheckResult {
  service: string;
  category: string;
  status: ServiceStatus;
  latency?: number;
  detail: string;
}

export interface ServiceCheckResultWithHistory extends ServiceCheckResult {
  history: Array<{ status: ServiceStatus; latency?: number; checkedAt: string }>;
  uptimePct: number;
}

export interface StatusPayload {
  checkedAt: string;
  serverUptime: number;
  summary: { ok: number; warning: number; error: number; unconfigured: number; total: number };
  services: ServiceCheckResultWithHistory[];
}

// ─── Server uptime ────────────────────────────────────────────────────────────
const SERVER_START = Date.now();
export function getServerUptimeSeconds(): number {
  return Math.floor((Date.now() - SERVER_START) / 1000);
}

// ─── History ring buffer ──────────────────────────────────────────────────────
const HISTORY_MAX = 60;
const serviceHistory = new Map<string, Array<{ status: ServiceStatus; latency?: number; checkedAt: string }>>();

function pushHistory(serviceName: string, status: ServiceStatus, latency?: number, checkedAt = new Date().toISOString()) {
  if (!serviceHistory.has(serviceName)) serviceHistory.set(serviceName, []);
  const arr = serviceHistory.get(serviceName)!;
  arr.push({ status, latency, checkedAt });
  if (arr.length > HISTORY_MAX) arr.splice(0, arr.length - HISTORY_MAX);
}

function getHistory(serviceName: string) {
  return serviceHistory.get(serviceName) ?? [];
}

function calcUptimePct(serviceName: string): number {
  const h = getHistory(serviceName);
  if (!h.length) return 100;
  const ok = h.filter((e) => e.status === "ok").length;
  return Math.round((ok / h.length) * 1000) / 10;
}

// ─── Individual service checks ────────────────────────────────────────────────

async function checkApiServer(): Promise<ServiceCheckResult> {
  return { service: "API Server", category: "Infrastructure", status: "ok", detail: "Express API responding" };
}

async function checkDatabase(): Promise<ServiceCheckResult> {
  const t = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { service: "Database", category: "Infrastructure", status: "ok", latency: Date.now() - t, detail: "PostgreSQL responding" };
  } catch (err: any) {
    return { service: "Database", category: "Infrastructure", status: "error", latency: Date.now() - t, detail: err?.message ?? "Connection failed" };
  }
}

async function checkRedis(): Promise<ServiceCheckResult> {
  const t = Date.now();
  const redisUrl = (process.env.REDIS_URL ?? "").trim();
  const redisHost = (process.env.REDIS_HOST ?? "").trim();
  const client = getRedisClient();
  if (!client) {
    if (!redisUrl && !redisHost) {
      return { service: "Redis", category: "Infrastructure", status: "unconfigured", detail: "REDIS_URL not set — availability cache disabled" };
    }
    return { service: "Redis", category: "Infrastructure", status: "error", detail: "Redis configured but client failed to initialise" };
  }
  try {
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PING timeout")), 3000)),
    ]);
    if (pong === "PONG") return { service: "Redis", category: "Infrastructure", status: "ok", latency: Date.now() - t, detail: "PONG received" };
    return { service: "Redis", category: "Infrastructure", status: "warning", latency: Date.now() - t, detail: `Unexpected response: ${pong}` };
  } catch (err: any) {
    return { service: "Redis", category: "Infrastructure", status: "error", latency: Date.now() - t, detail: err?.message ?? "PING failed" };
  }
}

async function checkPhpServer(): Promise<ServiceCheckResult> {
  const phpPort = resolvePhpPort();
  const t = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const resp = await fetch(`http://127.0.0.1:${phpPort}/`, { signal: ctrl.signal });
    clearTimeout(tid);
    return { service: "PHP Server", category: "Infrastructure", status: "ok", latency: Date.now() - t, detail: `PHP-CLI alive on port ${phpPort} (HTTP ${resp.status})` };
  } catch (err: any) {
    if (err?.name === "AbortError") return { service: "PHP Server", category: "Infrastructure", status: "error", latency: Date.now() - t, detail: `Port ${phpPort} timed out` };
    return { service: "PHP Server", category: "Infrastructure", status: "error", latency: Date.now() - t, detail: `Port ${phpPort} unreachable — ${err?.message}` };
  }
}

async function checkBookingApp(): Promise<ServiceCheckResult> {
  const appUrl = (process.env.APP_URL ?? "").trim();
  if (!appUrl) return { service: "Booking App", category: "Platform", status: "warning", detail: "APP_URL not set — cannot probe externally" };
  const t = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(`${appUrl}/`, { signal: ctrl.signal });
    clearTimeout(tid);
    const latency = Date.now() - t;
    if (resp.ok || resp.status === 304) return { service: "Booking App", category: "Platform", status: latency > 500 ? "warning" : "ok", latency, detail: `Frontend reachable at ${appUrl}` };
    return { service: "Booking App", category: "Platform", status: "warning", latency, detail: `HTTP ${resp.status} at ${appUrl}` };
  } catch (err: any) {
    return { service: "Booking App", category: "Platform", status: "error", latency: Date.now() - t, detail: err?.message ?? "Unreachable" };
  }
}

async function checkWebsiteHosting(): Promise<ServiceCheckResult> {
  const t = Date.now();
  try {
    const result = await db.execute(sql`SELECT COUNT(*) AS cnt FROM wb_websites WHERE published = true`);
    const count = Number((result.rows[0] as any)?.cnt ?? 0);
    return { service: "Website Hosting", category: "Platform", status: "ok", latency: Date.now() - t, detail: `${count} live website${count !== 1 ? "s" : ""} published` };
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    const lower = msg.toLowerCase();
    if (lower.includes("relation") && lower.includes("does not exist")) {
      return {
        service: "Website Hosting",
        category: "Platform",
        status: "warning",
        latency: Date.now() - t,
        detail: "Website table not found (wb_websites) — check migrations",
      };
    }
    return { service: "Website Hosting", category: "Platform", status: "error", latency: Date.now() - t, detail: msg || "Query failed" };
  }
}

async function checkStripe(): Promise<ServiceCheckResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { service: "Stripe", category: "Payments", status: "unconfigured", detail: "STRIPE_SECRET_KEY not set" };
  const t = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${key}` }, signal: ctrl.signal });
    clearTimeout(tid);
    const latency = Date.now() - t;
    if (resp.ok) return { service: "Stripe", category: "Payments", status: "ok", latency, detail: "API key valid — balance endpoint reachable" };
    const body = await resp.json() as any;
    return { service: "Stripe", category: "Payments", status: "error", latency, detail: body?.error?.message ?? `HTTP ${resp.status}` };
  } catch (err: any) {
    return { service: "Stripe", category: "Payments", status: "error", latency: Date.now() - t, detail: err?.message ?? "Request failed" };
  }
}

async function checkMailgun(): Promise<ServiceCheckResult> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (!apiKey || !domain) {
    const missing = [!apiKey && "MAILGUN_API_KEY", !domain && "MAILGUN_DOMAIN"].filter(Boolean).join(", ");
    return { service: "Mailgun (Email)", category: "Messaging", status: "unconfigured", detail: `Missing: ${missing}` };
  }
  const t = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(`https://api.mailgun.net/v3/domains/${domain}`, {
      headers: { Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}` },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const latency = Date.now() - t;
    if (resp.ok) return { service: "Mailgun (Email)", category: "Messaging", status: "ok", latency, detail: `Domain ${domain} active` };
    if (resp.status === 404) return { service: "Mailgun (Email)", category: "Messaging", status: "error", latency, detail: `Domain "${domain}" not found` };
    return { service: "Mailgun (Email)", category: "Messaging", status: "error", latency, detail: `HTTP ${resp.status}` };
  } catch (err: any) {
    return { service: "Mailgun (Email)", category: "Messaging", status: "error", latency: Date.now() - t, detail: err?.message ?? "Request failed" };
  }
}

async function checkTwilio(): Promise<ServiceCheckResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    const missing = [!sid && "TWILIO_ACCOUNT_SID", !token && "TWILIO_AUTH_TOKEN"].filter(Boolean).join(", ");
    return { service: "Twilio (SMS)", category: "Messaging", status: "unconfigured", detail: `Missing: ${missing}` };
  }
  const t = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const latency = Date.now() - t;
    if (resp.ok) {
      const body = await resp.json() as any;
      return { service: "Twilio (SMS)", category: "Messaging", status: "ok", latency, detail: `Account "${body.friendly_name ?? sid}" active` };
    }
    return { service: "Twilio (SMS)", category: "Messaging", status: "error", latency, detail: `HTTP ${resp.status}` };
  } catch (err: any) {
    return { service: "Twilio (SMS)", category: "Messaging", status: "error", latency: Date.now() - t, detail: err?.message ?? "Request failed" };
  }
}

async function checkOpenAI(): Promise<ServiceCheckResult> {
  const key = (process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "").trim();
  if (!key) return { service: "OpenAI", category: "AI", status: "unconfigured", detail: "OPENAI_API_KEY not set — AI features unavailable" };
  if (!key.startsWith("sk-") || key.length < 20) return { service: "OpenAI", category: "AI", status: "warning", detail: "Key configured but format looks unusual" };
  return { service: "OpenAI", category: "AI", status: "ok", detail: "Key configured (format valid)" };
}

async function checkDns(): Promise<ServiceCheckResult> {
  const hostname = "certxa.com";
  const t = Date.now();
  try {
    const addresses = await dns.promises.resolve(hostname, "A");
    return { service: "DNS (certxa.com)", category: "Network", status: "ok", latency: Date.now() - t, detail: `Resolves to ${addresses[0]}${addresses.length > 1 ? ` (+${addresses.length - 1} more)` : ""}` };
  } catch (err: any) {
    return { service: "DNS (certxa.com)", category: "Network", status: "error", latency: Date.now() - t, detail: err?.message ?? "DNS lookup failed" };
  }
}

// ─── Run all checks ───────────────────────────────────────────────────────────

async function runAllChecks(): Promise<StatusPayload> {
  const checkedAt = new Date().toISOString();
  const settled = await Promise.allSettled([
    checkApiServer(),
    checkDatabase(),
    checkRedis(),
    checkPhpServer(),
    checkBookingApp(),
    checkWebsiteHosting(),
    checkStripe(),
    checkMailgun(),
    checkTwilio(),
    checkOpenAI(),
    checkDns(),
  ]);

  const raw: ServiceCheckResult[] = settled.map((c, i) =>
    c.status === "fulfilled"
      ? c.value
      : { service: `Service ${i + 1}`, category: "Unknown", status: "error" as ServiceStatus, detail: (c.reason as any)?.message ?? "Unexpected error" }
  );

  raw.forEach((r) => pushHistory(r.service, r.status, r.latency, checkedAt));

  const services: ServiceCheckResultWithHistory[] = raw.map((r) => ({
    ...r,
    history: getHistory(r.service),
    uptimePct: calcUptimePct(r.service),
  }));

  const summary = {
    ok: services.filter((s) => s.status === "ok").length,
    warning: services.filter((s) => s.status === "warning").length,
    error: services.filter((s) => s.status === "error").length,
    unconfigured: services.filter((s) => s.status === "unconfigured").length,
    total: services.length,
  };

  return { checkedAt, serverUptime: getServerUptimeSeconds(), summary, services };
}

// ─── WebSocket stream ─────────────────────────────────────────────────────────

const WS_PATH = "/ws/admin-status";
const WS_INTERVAL_MS = 30_000;

let latestPayload: StatusPayload | null = null;
let broadcastFn: ((payload: StatusPayload) => void) | null = null;
let rawBroadcastFn: ((data: object) => void) | null = null;

/**
 * Push any JSON event to all connected /ws/admin-status clients.
 * Used by support routes to push incident_update events in real-time.
 *
 * The triggering HTTP request (e.g. an admin action in routes/support.ts) may
 * land on a different PM2 worker than the one holding the admin's WebSocket
 * connection, so this relays through Redis rather than only pushing to
 * whichever local clients this process happens to know about.
 */
export function broadcastRawEvent(data: object): void {
  if (isCrossProcessBusAvailable()) {
    publishCrossProcess(RAW_EVENT_CHANNEL, data);
  } else {
    rawBroadcastFn?.(data);
  }
}

/** Call once from index.ts after the HTTP server is created. */
export function setupStatusStream(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0] ?? "";
    if (pathname === WS_PATH) {
      wss.handleUpgrade(req, socket as any, head, (ws) => wss.emit("connection", ws, req));
    }
  });

  broadcastFn = (payload: StatusPayload) => {
    const msg = JSON.stringify({ type: "status_update", ...payload });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(msg); } catch {}
      }
    });
  };

  rawBroadcastFn = (data: object) => {
    const msg = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(msg); } catch {}
      }
    });
  };

  subscribeCrossProcess(RAW_EVENT_CHANNEL, (data: object) => {
    rawBroadcastFn?.(data);
  });

  wss.on("connection", (ws) => {
    if (latestPayload) {
      try { ws.send(JSON.stringify({ type: "status_update", ...latestPayload })); } catch {}
    }
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      } catch {}
    });
  });

  const tick = async () => {
    try {
      const payload = await runAllChecks();
      latestPayload = payload;
      broadcastFn?.(payload);
    } catch (err: any) {
      console.error("[StatusStream] check error:", err.message);
    }
  };

  // Initial check on startup, then every 30s
  void tick();
  setInterval(tick, WS_INTERVAL_MS);

  console.log(`[StatusStream] WebSocket stream ready at ${WS_PATH} (interval=${WS_INTERVAL_MS / 1000}s)`);
}

// ─── HTTP endpoint (initial load / fallback) ──────────────────────────────────

const router = Router();

router.get("/admin/system-status", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  } catch {
    res.status(500).json({ error: "Failed to verify admin" }); return;
  }

  if (latestPayload) {
    res.json({ ...latestPayload, serverUptime: getServerUptimeSeconds() });
    return;
  }

  const payload = await runAllChecks();
  latestPayload = payload;
  res.json(payload);
});

export default router;

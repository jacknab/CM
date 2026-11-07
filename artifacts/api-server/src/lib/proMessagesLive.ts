/**
 * Website messages, live (owner, 2026-11-07; plans/pro-messages.md): an instant messenger while the pro has the
 * Certxa Pro app open. One WebSocket address, /ws/pro-messages, two kinds of connection:
 *   - the pro's app (?as=pro, "Authorization: Bearer <app token>"): new client messages and typing, for every
 *     conversation of the business. The app keeps it open only while it is on screen, so "connected" = online.
 *   - a client's conversation page (?as=client&link=<the code in their link>): the pro's answers and typing, and
 *     whether the pro is online.
 * Typing is only relayed, never stored. The server runs as several processes, so events go through the cross-process
 * bus (lib/wsBroadcastBus.ts) and online / page-open are short-lived Redis keys every process can read:
 *   pm:online:<storeId>   the pro has the app open           → their messages chime in the app, not by push
 *   pm:viewer:<threadId>  the client has the page open       → the pro's answer isn't e-mailed
 */
import type { Server } from "http";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { pool } from "../db";
import { getRedisClient } from "./redis";
import { verifySoloToken } from "./soloAuth";
import { publishCrossProcess, subscribeCrossProcess } from "./wsBroadcastBus";

const CHANNEL = "pro-messages";
const TTL_S = 45;          // a key outlives one missed heartbeat
const HEARTBEAT_MS = 20_000;

type Sock = WebSocket & { pm?: { kind: "pro"; storeId: number } | { kind: "client"; storeId: number; threadId: number } };
const pros = new Map<number, Set<Sock>>();      // storeId → app connections in this process
const viewers = new Map<number, Set<Sock>>();   // threadId → client pages in this process

type LiveMessage = { id: number; sender: "client" | "pro"; body: string; createdAt: string };
type BusEvent =
  | { type: "message"; storeId: number; threadId: number; message: LiveMessage; clientName?: string; subject?: string }
  | { type: "typing"; storeId: number; threadId: number; from: "client" | "pro"; on: boolean }
  | { type: "presence"; storeId: number; online: boolean }
  | { type: "read"; storeId: number; threadId: number };

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const send = (ws: WebSocket, data: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const add = <K>(map: Map<K, Set<Sock>>, key: K, ws: Sock) => { let s = map.get(key); if (!s) map.set(key, (s = new Set())); s.add(ws); };
const remove = <K>(map: Map<K, Set<Sock>>, key: K, ws: Sock) => { const s = map.get(key); if (!s) return 0; s.delete(ws); if (!s.size) map.delete(key); return s.size; };

// ── Who is online / has the page open (any process) ───────────────────────────────────────────────────

async function setKey(key: string) { try { await getRedisClient()?.set(key, "1", "EX", TTL_S); } catch { /* Redis down: the push / e-mail still happen */ } }
async function delKey(key: string) { try { await getRedisClient()?.del(key); } catch { /* expires anyway */ } }
async function hasKey(key: string) { try { return (await getRedisClient()?.exists(key)) === 1; } catch { return false; } }

/** The pro has the Certxa Pro app open right now. */
export const proOnline = (storeId: number) => hasKey(`pm:online:${storeId}`);
/** The client is looking at the conversation page right now. */
export const clientViewing = (threadId: number) => hasKey(`pm:viewer:${threadId}`);

// This process keeps its keys alive while it holds the connections.
setInterval(() => {
  for (const storeId of pros.keys()) void setKey(`pm:online:${storeId}`);
  for (const threadId of viewers.keys()) void setKey(`pm:viewer:${threadId}`);
}, HEARTBEAT_MS).unref();

// ── Events from the routes (routes/proMessages.ts) ────────────────────────────────────────────────────

export function liveMessage(e: { storeId: number; threadId: number; message: LiveMessage; clientName?: string; subject?: string }) {
  publishCrossProcess(CHANNEL, { type: "message", ...e } satisfies BusEvent);
}
export function liveRead(storeId: number, threadId: number) {
  publishCrossProcess(CHANNEL, { type: "read", storeId, threadId } satisfies BusEvent);
}

subscribeCrossProcess(CHANNEL, (e: BusEvent) => {
  if (e.type === "presence") {
    // "Away" from a process whose last app connection closed, while this one still holds one: online after all.
    if (!e.online && pros.has(e.storeId)) {
      void setKey(`pm:online:${e.storeId}`).then(() => publishCrossProcess(CHANNEL, { type: "presence", storeId: e.storeId, online: true } satisfies BusEvent));
      return;
    }
    // Every client page of that business learns the pro came or went.
    for (const set of viewers.values()) for (const ws of set) if (ws.pm?.storeId === e.storeId) send(ws, { type: "presence", online: e.online });
    return;
  }
  // The pro's app hears everything about its business; a client page only its own conversation, and never itself.
  const toPro = e.type === "read" || e.type === "message" ? e.type === "read" || e.message.sender === "client" : e.from === "client";
  if (toPro) for (const ws of pros.get(e.storeId) ?? []) send(ws, e);
  if (e.type === "message" && e.message.sender === "pro") for (const ws of viewers.get(e.threadId) ?? []) send(ws, { type: "message", message: e.message });
  if (e.type === "typing" && e.from === "pro") for (const ws of viewers.get(e.threadId) ?? []) send(ws, { type: "typing", on: e.on });
});

// ── Connections ───────────────────────────────────────────────────────────────────────────────────────

/** Pages on Certxa's own addresses only (certxa.com, <slug>.certxa.com); the app sends no Origin. */
function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const h = new URL(origin).hostname;
    return h === "certxa.com" || h.endsWith(".certxa.com") || h === "localhost" || h === "127.0.0.1";
  } catch { return false; }
}

async function proStore(auth: string | undefined): Promise<number | null> {
  const payload = auth?.startsWith("Bearer ") ? verifySoloToken(auth.slice(7)) : null;
  if (!payload?.userId) return null;
  const r = await pool.query(`SELECT id FROM locations WHERE user_id = $1 ORDER BY id LIMIT 1`, [payload.userId]);
  return r.rows[0]?.id ?? null;
}

async function clientThread(link: string | null): Promise<{ storeId: number; threadId: number } | null> {
  if (!link || !/^[A-Za-z0-9_-]{20,64}$/.test(link)) return null;
  const r = await pool.query(`SELECT t.id, t.store_id FROM pro_message_links l JOIN pro_message_threads t ON t.id = l.thread_id WHERE l.token_hash = $1`, [hash(link)]);
  return r.rows[0] ? { storeId: r.rows[0].store_id, threadId: r.rows[0].id } : null;
}

export function setupProMessagesWS(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

  httpServer.on("upgrade", (req, socket, head) => {
    if ((req.url ?? "").split("?")[0] !== "/ws/pro-messages") return;
    if (!originAllowed(req.headers.origin as string | undefined)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket as any, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", async (raw, req) => {
    const ws = raw as Sock;
    const url = new URL(req.url || "", "http://localhost");
    try {
      if (url.searchParams.get("as") === "pro") {
        const storeId = await proStore(req.headers.authorization);
        if (!storeId) { ws.close(4003, "Sign in again"); return; }
        ws.pm = { kind: "pro", storeId };
        const first = !pros.has(storeId);
        add(pros, storeId, ws);
        await setKey(`pm:online:${storeId}`);
        if (first) publishCrossProcess(CHANNEL, { type: "presence", storeId, online: true } satisfies BusEvent);
        send(ws, { type: "ready" });
      } else {
        const t = await clientThread(url.searchParams.get("link"));
        if (!t) { ws.close(4004, "Conversation not found"); return; }
        ws.pm = { kind: "client", ...t };
        add(viewers, t.threadId, ws);
        await setKey(`pm:viewer:${t.threadId}`);
        send(ws, { type: "presence", online: await proOnline(t.storeId) });
      }
    } catch (err: any) {
      console.error("[pro-messages-ws] connect", err?.message ?? err);
      ws.close(1011, "Try again");
      return;
    }

    ws.on("message", (data) => {
      // The only thing either side sends: typing on / off for a conversation.
      let m: any; try { m = JSON.parse(String(data)); } catch { return; }
      if (m?.type !== "typing" || !ws.pm) return;
      const on = m.on === true;
      if (ws.pm.kind === "client") publishCrossProcess(CHANNEL, { type: "typing", storeId: ws.pm.storeId, threadId: ws.pm.threadId, from: "client", on } satisfies BusEvent);
      else {
        const threadId = Number(m.threadId);
        if (!Number.isInteger(threadId) || threadId <= 0) return;
        const storeId = ws.pm.storeId;
        // Only a conversation of the pro's own business.
        void pool.query(`SELECT 1 FROM pro_message_threads WHERE id = $1 AND store_id = $2`, [threadId, storeId]).then((r) => {
          if (r.rows[0]) publishCrossProcess(CHANNEL, { type: "typing", storeId, threadId, from: "pro", on } satisfies BusEvent);
        }).catch(() => {});
      }
    });

    ws.on("close", () => {
      const pm = ws.pm;
      if (!pm) return;
      if (pm.kind === "pro") {
        if (remove(pros, pm.storeId, ws) === 0) {
          // The last app connection here closed: let the key go, and let every page know. Another process still
          // holding one sets the key again on its next heartbeat and is seen online again.
          void delKey(`pm:online:${pm.storeId}`).then(() => publishCrossProcess(CHANNEL, { type: "presence", storeId: pm.storeId, online: false } satisfies BusEvent));
        }
      } else {
        if (remove(viewers, pm.threadId, ws) === 0) void delKey(`pm:viewer:${pm.threadId}`);
        publishCrossProcess(CHANNEL, { type: "typing", storeId: pm.storeId, threadId: pm.threadId, from: "client", on: false } satisfies BusEvent);
      }
    });
  });
}

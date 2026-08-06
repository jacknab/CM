/**
 * Live Chat — real-time visitor↔agent chat system with smart routing
 *
 * REST (visitor, no auth):
 *   POST   /api/live-chat/start              — start a chat session (keyword auto-routes dept)
 *   GET    /api/live-chat/:chatId/status      — poll status / queue position
 *   GET    /api/live-chat/departments         — list departments
 *   POST   /api/live-chat/:chatId/rate        — rate chat after close
 *
 * REST (agent, requireSupportAuth):
 *   GET    /api/support/live-chat/ws-token
 *   GET    /api/support/live-chat/queue       — dept-filtered queue for this agent
 *   GET    /api/support/live-chat/active      — dept-filtered active for this agent
 *   GET    /api/support/live-chat/history
 *   GET    /api/support/live-chat/:id/messages
 *   POST   /api/support/live-chat/:id/assign
 *   POST   /api/support/live-chat/:id/transfer  — owner/admin only
 *   POST   /api/support/live-chat/:id/close     — owner/admin only
 *   GET    /api/support/live-chat/departments
 *   POST   /api/support/live-chat/departments
 *   DELETE /api/support/live-chat/departments/:id
 *   PATCH  /api/support/live-chat/departments/:id/keywords
 *   GET    /api/support/live-chat/agent-departments
 *   POST   /api/support/live-chat/agent-departments
 *   DELETE /api/support/live-chat/agent-departments/:agentId/:departmentId
 *   GET    /api/support/live-chat/canned
 *   POST   /api/support/live-chat/canned
 *   DELETE /api/support/live-chat/canned/:id
 *   GET    /api/support/live-chat/stats
 *   PATCH  /api/support/live-chat/status
 *   GET    /api/support/live-chat/online-agents
 *   GET    /api/support/live-chat/all-agents   — all agents (for assignment UI)
 *
 * WebSocket  /ws/live-chat
 *   visitor: ?role=visitor&chatId=<uuid>
 *   agent:   ?role=agent&token=<short-lived-uuid>
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { pool } from "../db";
import crypto from "crypto";

export const liveChatRouter = Router();

// ─── Auth middleware ───────────────────────────────────────────────────────────
function requireSupportAuth(req: Request, res: Response, next: NextFunction) {
  if (!process.env.SUPPORT_REQUIRE_AUTH && !req.session.supportAgentId) {
    req.session.supportAgentId   = 1;
    req.session.supportAgentRole = "admin";
    req.session.supportAgentName = "Admin Agent";
  }
  if (!req.session.supportAgentId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ─── In-memory state ──────────────────────────────────────────────────────────
const wsTokens      = new Map<string, { agentId: number; name: string; role: string; expires: number }>();
const visitorSockets = new Map<string, WebSocket>();
const agentSockets   = new Map<number, WebSocket>();
const agentStatus    = new Map<number, "online" | "away" | "busy">();

setInterval(() => {
  const now = Date.now();
  for (const [tok, v] of wsTokens) if (v.expires < now) wsTokens.delete(tok);
}, 60_000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendJson(ws: WebSocket, obj: object) {
  try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); } catch {}
}

export function broadcastToAgents(obj: object, excludeAgentId?: number) {
  for (const [id, ws] of agentSockets.entries()) {
    if (excludeAgentId !== undefined && id === excludeAgentId) continue;
    sendJson(ws, obj);
  }
}

function sendToVisitor(chatId: string, obj: object) {
  const ws = visitorSockets.get(chatId);
  if (ws) sendJson(ws, obj);
}

/**
 * Returns the set of agent IDs that should be notified for a given dept.
 * Rule:
 *   - Agents with NO dept assignments are "generalists" — they see everything.
 *   - Agents WITH dept assignments only see chats in their assigned depts.
 *   - If deptId is null/undefined → notify all connected agents.
 */
async function getRelevantAgentIds(deptId: number | null | undefined): Promise<number[]> {
  const connected = Array.from(agentSockets.keys());
  if (!connected.length) return [];

  // All agents that have ANY dept assignment
  const allAssignedRes = await pool.query<{ agent_id: number }>(
    `SELECT DISTINCT agent_id FROM live_chat_agent_departments`
  );
  const assignedToSomeDept = new Set(allAssignedRes.rows.map(r => r.agent_id));

  // Generalists: connected agents with no dept assignments
  const generalists = connected.filter(id => !assignedToSomeDept.has(id));

  if (!deptId) {
    // No dept → everyone
    return connected;
  }

  // Agents assigned to this specific dept
  const deptAgentsRes = await pool.query<{ agent_id: number }>(
    `SELECT agent_id FROM live_chat_agent_departments WHERE department_id=$1`, [deptId]
  );
  const deptAgentIds = deptAgentsRes.rows.map(r => r.agent_id);

  return [...new Set([...deptAgentIds, ...generalists])];
}

/** Broadcast to agents relevant to a specific dept. Falls back to all if no assignments. */
async function broadcastToDeptAgents(deptId: number | null | undefined, obj: object) {
  try {
    const ids = await getRelevantAgentIds(deptId);
    for (const id of ids) {
      const ws = agentSockets.get(id);
      if (ws) sendJson(ws, obj);
    }
  } catch {
    // On error fall back to broadcast all
    broadcastToAgents(obj);
  }
}

function getAgentStatusList() {
  return Array.from(agentStatus.entries()).map(([agentId, status]) => ({ agentId, status }));
}

async function getQueuePosition(chatId: string, departmentId?: number | null): Promise<number> {
  const q = departmentId
    ? `SELECT COUNT(*)::int AS cnt FROM live_chats
       WHERE status = 'queued' AND department_id = $1 AND started_at < (SELECT started_at FROM live_chats WHERE id = $2)`
    : `SELECT COUNT(*)::int AS cnt FROM live_chats
       WHERE status = 'queued' AND started_at < (SELECT started_at FROM live_chats WHERE id = $1)`;
  const args = departmentId ? [departmentId, chatId] : [chatId];
  const r = await pool.query(q, args);
  return (r.rows[0]?.cnt ?? 0) + 1;
}

async function getEstimatedWaitMin(): Promise<number | null> {
  const r = await pool.query<{ avg_wait: string | null }>(`
    SELECT ROUND(AVG(EXTRACT(EPOCH FROM (accepted_at - started_at))/60)
      FILTER (WHERE accepted_at IS NOT NULL AND started_at > NOW() - INTERVAL '4h'))::int AS avg_wait
    FROM live_chats
  `);
  const val = r.rows[0]?.avg_wait;
  return val != null ? Number(val) : null;
}

/**
 * Auto-route a chat to a department by matching keywords in the subject.
 * Returns the resolved department ID or null.
 */
async function autoRouteDept(subject: string): Promise<{ deptId: number; deptName: string } | null> {
  if (!subject?.trim()) return null;
  const depts = await pool.query<{ id: number; name: string; routing_keywords: string | null }>(
    `SELECT id, name, routing_keywords FROM live_chat_departments
     WHERE is_active = true AND routing_keywords IS NOT NULL AND routing_keywords != ''
     ORDER BY id`
  );
  const subjectLower = subject.toLowerCase();
  for (const dept of depts.rows) {
    const keywords = (dept.routing_keywords ?? "")
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
    if (keywords.some(k => subjectLower.includes(k))) {
      return { deptId: dept.id, deptName: dept.name };
    }
  }
  return null;
}

/** Push the queue to each agent individually, filtered to their depts. */
async function pushQueueUpdateToAgents() {
  // All assigned agent→dept relationships
  const assignmentsRes = await pool.query<{ agent_id: number; department_id: number }>(
    `SELECT agent_id, department_id FROM live_chat_agent_departments`
  );
  const agentDepts = new Map<number, Set<number>>();
  for (const r of assignmentsRes.rows) {
    if (!agentDepts.has(r.agent_id)) agentDepts.set(r.agent_id, new Set());
    agentDepts.get(r.agent_id)!.add(r.department_id);
  }

  const allChatsRes = await pool.query(`
    SELECT c.id, c.visitor_name, c.visitor_email, c.subject, c.started_at,
           c.department_id, d.name AS department_name, c.page_url
    FROM live_chats c
    LEFT JOIN live_chat_departments d ON d.id = c.department_id
    WHERE c.status = 'queued'
    ORDER BY c.started_at ASC
  `);
  const allQueue = allChatsRes.rows;

  for (const [agId, ws] of agentSockets) {
    const myDepts = agentDepts.get(agId);
    let visibleQueue: typeof allQueue;
    if (!myDepts || myDepts.size === 0) {
      // Generalist — sees all
      visibleQueue = allQueue;
    } else {
      // Only chats in my depts or with no dept
      visibleQueue = allQueue.filter(c => !c.department_id || myDepts.has(c.department_id));
    }
    sendJson(ws, { type: "queue_update", queue: visibleQueue });
  }
}

async function persistMessage(
  chatId: string, senderType: string, senderId: number | null,
  senderName: string, content: string
) {
  const r = await pool.query(
    `INSERT INTO live_chat_messages (chat_id, sender_type, sender_id, sender_name, content)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
    [chatId, senderType, senderId, senderName, content]
  );
  return r.rows[0];
}

// ─── Visitor REST ─────────────────────────────────────────────────────────────

/**
 * GET /api/live-chat/me — read logged-in session and return user info + their primary store.
 * Used by the chat widget to pre-fill name/email and attach account_id.
 * Public endpoint — returns 200 with null fields if no session.
 */
liveChatRouter.get("/api/live-chat/me", async (req, res) => {
  const userId = (req.session as any)?.userId as string | undefined;
  if (!userId) return res.json({ loggedIn: false });
  try {
    const userRes = await pool.query<{
      first_name: string; last_name: string; email: string;
    }>(
      `SELECT first_name, last_name, email FROM users WHERE id=$1 LIMIT 1`, [userId]
    );
    if (!userRes.rows[0]) return res.json({ loggedIn: false });
    const u = userRes.rows[0];

    const storeRes = await pool.query<{
      id: number; name: string; city: string | null; state: string | null;
      plan_name: string | null; account_status: string | null;
    }>(
      `SELECT l.id, l.name, l.city, l.state, l.account_status,
              sp.name AS plan_name
       FROM locations l
       LEFT JOIN store_subscriptions ss ON ss.store_id = l.id
       LEFT JOIN subscriptions sp ON sp.id = ss.plan_id
       WHERE l.user_id=$1
       ORDER BY l.id ASC LIMIT 1`,
      [userId]
    );
    const store = storeRes.rows[0] ?? null;

    return res.json({
      loggedIn: true,
      name:    [u.first_name, u.last_name].filter(Boolean).join(" "),
      email:   u.email,
      accountId: store ? String(store.id) : null,
      storeName: store?.name ?? null,
      city:      store?.city ?? null,
      state:     store?.state ?? null,
      planName:  store?.plan_name ?? null,
      accountStatus: store?.account_status ?? null,
    });
  } catch (e: any) {
    console.error("[live-chat] /me error:", e?.message);
    return res.json({ loggedIn: false });
  }
});

liveChatRouter.get("/api/live-chat/departments", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, description FROM live_chat_departments WHERE is_active = true ORDER BY id`
    );
    return res.json({ departments: r.rows });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.post("/api/live-chat/start", async (req, res) => {
  const { visitorName, visitorEmail, departmentId, subject, pageUrl, accountId } = req.body as Record<string, string>;
  const visitorToken = crypto.randomUUID();

  try {
    // Resolve department: use visitor-chosen dept first, then keyword auto-routing
    let resolvedDeptId: number | null = departmentId ? Number(departmentId) : null;
    let routedBy = "manual";

    if (!resolvedDeptId && subject) {
      const autoRouted = await autoRouteDept(subject);
      if (autoRouted) {
        resolvedDeptId = autoRouted.deptId;
        routedBy = "keyword";
      }
    }
    if (!resolvedDeptId) routedBy = "default";

    const r = await pool.query(
      `INSERT INTO live_chats (visitor_name, visitor_email, visitor_token, department_id, subject, page_url, routed_by, account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [visitorName || "Anonymous", visitorEmail || null, visitorToken,
       resolvedDeptId, subject || null, pageUrl || null, routedBy, accountId || null]
    );
    const chatId = r.rows[0].id;

    await persistMessage(chatId, "system", null, "system",
      routedBy === "keyword"
        ? `Chat started by ${visitorName || "visitor"} — auto-routed by subject keywords`
        : `Chat started by ${visitorName || "visitor"}`
    );

    const pos = await getQueuePosition(chatId, resolvedDeptId);
    const estWait = await getEstimatedWaitMin();

    // Notify only relevant agents for this dept
    await broadcastToDeptAgents(resolvedDeptId, {
      type: "new_chat", chatId,
      visitorName: visitorName || "Anonymous",
      subject: subject || null,
      departmentId: resolvedDeptId,
      routedBy,
    });
    await pushQueueUpdateToAgents();

    return res.json({ chatId, visitorToken, queuePosition: pos, estimatedWaitMin: estWait });
  } catch (e: any) {
    console.error("[live-chat] start error:", e?.message);
    return res.status(500).json({ error: "Failed to start chat" });
  }
});

liveChatRouter.get("/api/live-chat/:chatId/status", async (req, res) => {
  const { chatId } = req.params;
  try {
    const r = await pool.query(
      `SELECT c.id, c.status, c.visitor_name, c.accepted_at,
              sa.first_name || ' ' || sa.last_name AS agent_name,
              d.name AS department_name
       FROM live_chats c
       LEFT JOIN support_agents sa ON sa.id = c.agent_id
       LEFT JOIN live_chat_departments d ON d.id = c.department_id
       WHERE c.id = $1`,
      [chatId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    const chat = r.rows[0];
    let queuePosition: number | null = null;
    let estimatedWaitMin: number | null = null;
    if (chat.status === "queued") {
      queuePosition = await getQueuePosition(chatId);
      estimatedWaitMin = await getEstimatedWaitMin();
    }
    return res.json({ ...chat, queuePosition, estimatedWaitMin });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.post("/api/live-chat/:chatId/rate", async (req, res) => {
  const { chatId } = req.params;
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating 1–5 required" });
  try {
    await pool.query(
      `UPDATE live_chats SET rating=$1, rating_comment=$2 WHERE id=$3 AND status='closed'`,
      [Number(rating), comment || null, chatId]
    );
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

// ─── Agent REST ───────────────────────────────────────────────────────────────

liveChatRouter.get("/api/support/live-chat/ws-token", requireSupportAuth, (req, res) => {
  const agentId = req.session.supportAgentId!;
  const name    = req.session.supportAgentName ?? "Agent";
  const role    = req.session.supportAgentRole ?? "agent";
  const token   = crypto.randomUUID();
  wsTokens.set(token, { agentId, name, role, expires: Date.now() + 60_000 });
  return res.json({ token });
});

/** Queue endpoint — filtered to the requesting agent's assigned departments. */
liveChatRouter.get("/api/support/live-chat/queue", requireSupportAuth, async (req, res) => {
  const agentId = req.session.supportAgentId!;
  try {
    const myDeptsRes = await pool.query<{ department_id: number }>(
      `SELECT department_id FROM live_chat_agent_departments WHERE agent_id=$1`, [agentId]
    );
    const myDepts = myDeptsRes.rows.map(r => r.department_id);

    let query: string;
    let params: any[];
    if (myDepts.length === 0) {
      // Generalist: see all queued
      query = `
        SELECT c.id, c.visitor_name, c.visitor_email, c.subject, c.started_at,
               c.department_id, d.name AS department_name, c.page_url, c.routed_by
        FROM live_chats c
        LEFT JOIN live_chat_departments d ON d.id = c.department_id
        WHERE c.status = 'queued'
        ORDER BY c.started_at ASC`;
      params = [];
    } else {
      // Specialist: only their depts + unrouted (no dept)
      query = `
        SELECT c.id, c.visitor_name, c.visitor_email, c.subject, c.started_at,
               c.department_id, d.name AS department_name, c.page_url, c.routed_by
        FROM live_chats c
        LEFT JOIN live_chat_departments d ON d.id = c.department_id
        WHERE c.status = 'queued'
          AND (c.department_id IS NULL OR c.department_id = ANY($1))
        ORDER BY c.started_at ASC`;
      params = [myDepts];
    }

    const r = await pool.query(query, params);
    return res.json({ queue: r.rows });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/** Active chats — filtered to the requesting agent's assigned departments. */
liveChatRouter.get("/api/support/live-chat/active", requireSupportAuth, async (req, res) => {
  const agentId = req.session.supportAgentId!;
  try {
    const myDeptsRes = await pool.query<{ department_id: number }>(
      `SELECT department_id FROM live_chat_agent_departments WHERE agent_id=$1`, [agentId]
    );
    const myDepts = myDeptsRes.rows.map(r => r.department_id);

    let query: string;
    let params: any[];
    if (myDepts.length === 0) {
      query = `
        SELECT c.id, c.visitor_name, c.visitor_email, c.subject, c.started_at, c.accepted_at,
               sa.first_name || ' ' || sa.last_name AS agent_name, c.agent_id,
               c.department_id, d.name AS department_name, c.page_url
        FROM live_chats c
        LEFT JOIN support_agents sa ON sa.id = c.agent_id
        LEFT JOIN live_chat_departments d ON d.id = c.department_id
        WHERE c.status = 'active'
        ORDER BY c.accepted_at DESC`;
      params = [];
    } else {
      query = `
        SELECT c.id, c.visitor_name, c.visitor_email, c.subject, c.started_at, c.accepted_at,
               sa.first_name || ' ' || sa.last_name AS agent_name, c.agent_id,
               c.department_id, d.name AS department_name, c.page_url
        FROM live_chats c
        LEFT JOIN support_agents sa ON sa.id = c.agent_id
        LEFT JOIN live_chat_departments d ON d.id = c.department_id
        WHERE c.status = 'active'
          AND (c.department_id IS NULL OR c.department_id = ANY($1))
        ORDER BY c.accepted_at DESC`;
      params = [myDepts];
    }

    const r = await pool.query(query, params);
    return res.json({ active: r.rows });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.get("/api/support/live-chat/history", requireSupportAuth, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.id, c.visitor_name, c.visitor_email, c.subject, c.status,
             c.started_at, c.closed_at, c.rating,
             sa.first_name || ' ' || sa.last_name AS agent_name,
             d.name AS department_name
      FROM live_chats c
      LEFT JOIN support_agents sa ON sa.id = c.agent_id
      LEFT JOIN live_chat_departments d ON d.id = c.department_id
      WHERE c.status IN ('closed','missed')
      ORDER BY c.closed_at DESC NULLS LAST
      LIMIT 100
    `);
    return res.json({ history: r.rows });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.get("/api/support/live-chat/:chatId/messages", requireSupportAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, sender_type, sender_name, content, created_at
       FROM live_chat_messages WHERE chat_id=$1 ORDER BY created_at ASC`,
      [req.params.chatId]
    );
    return res.json({ messages: r.rows });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/** Account info — returns linked account/store info for a chat (agent only). */
liveChatRouter.get("/api/support/live-chat/:chatId/account", requireSupportAuth, async (req, res) => {
  const { chatId } = req.params;
  try {
    const chatRes = await pool.query<{ account_id: string | null }>(
      `SELECT account_id FROM live_chats WHERE id=$1`, [chatId]
    );
    const accountId = chatRes.rows[0]?.account_id;
    if (!accountId) return res.json({ account: null });

    const storeRes = await pool.query<{
      id: number; name: string; city: string | null; state: string | null;
      email: string | null; phone: string | null; account_status: string | null;
      plan_name: string | null; user_email: string | null;
      user_first: string | null; user_last: string | null;
    }>(
      `SELECT l.id, l.name, l.city, l.state, l.email, l.phone, l.account_status,
              sp.name AS plan_name,
              u.email AS user_email, u.first_name AS user_first, u.last_name AS user_last
       FROM locations l
       LEFT JOIN store_subscriptions ss ON ss.store_id = l.id
       LEFT JOIN subscriptions sp ON sp.id = ss.plan_id
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.id=$1 LIMIT 1`,
      [Number(accountId)]
    );
    const s = storeRes.rows[0];
    if (!s) return res.json({ account: null });

    return res.json({
      account: {
        id:            s.id,
        storeName:     s.name,
        city:          s.city,
        state:         s.state,
        email:         s.email,
        phone:         s.phone,
        accountStatus: s.account_status,
        planName:      s.plan_name,
        ownerEmail:    s.user_email,
        ownerName:     [s.user_first, s.user_last].filter(Boolean).join(" ") || null,
      },
    });
  } catch (e: any) {
    console.error("[live-chat] account fetch error:", e?.message);
    return res.status(500).json({ error: "Failed" });
  }
});

liveChatRouter.post("/api/support/live-chat/:chatId/assign", requireSupportAuth, async (req, res) => {
  const agentId   = req.session.supportAgentId!;
  const agentName = req.session.supportAgentName ?? "Agent";
  const chatId = String(req.params.chatId);
  try {
    const r = await pool.query(
      `UPDATE live_chats SET status='active', agent_id=$1, accepted_at=NOW()
       WHERE id=$2 AND status='queued' RETURNING id, department_id`,
      [agentId, chatId]
    );
    if (!r.rowCount) return res.status(409).json({ error: "Chat no longer available" });
    const deptId = r.rows[0]?.department_id;
    await persistMessage(chatId, "system", null, "system", `${agentName} joined the chat`);
    sendToVisitor(chatId, { type: "assigned", agentName });
    await pushQueueUpdateToAgents();
    broadcastToAgents({ type: "chat_assigned", chatId, agentId, agentName, departmentId: deptId });
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/** Transfer — only the assigned agent or an admin can transfer. */
liveChatRouter.post("/api/support/live-chat/:chatId/transfer", requireSupportAuth, async (req, res) => {
  const agentId   = req.session.supportAgentId!;
  const agentName = req.session.supportAgentName ?? "Agent";
  const agentRole = req.session.supportAgentRole ?? "agent";
  const chatId = String(req.params.chatId);
  const { departmentId, targetAgentId } = req.body;

  try {
    // Ownership check: must be assigned agent or admin
    const chatRow = await pool.query<{ agent_id: number | null }>(
      `SELECT agent_id FROM live_chats WHERE id=$1`, [chatId]
    );
    const ownerId = chatRow.rows[0]?.agent_id;
    if (ownerId !== agentId && agentRole !== "admin") {
      return res.status(403).json({ error: "Only the assigned agent can transfer this chat" });
    }

    if (targetAgentId) {
      await pool.query(`UPDATE live_chats SET agent_id=$1 WHERE id=$2`, [targetAgentId, chatId]);
      const agRow = await pool.query(
        `SELECT first_name || ' ' || last_name AS name FROM support_agents WHERE id=$1`, [targetAgentId]
      );
      const targetName = agRow.rows[0]?.name ?? "another agent";
      await persistMessage(chatId, "system", null, "system", `Chat transferred to ${targetName} by ${agentName}`);
      sendToVisitor(chatId, { type: "transferred", agentName: targetName });
      broadcastToAgents({ type: "chat_transferred", chatId, targetAgentId });
    } else if (departmentId) {
      const deptRow = await pool.query(`SELECT name FROM live_chat_departments WHERE id=$1`, [departmentId]);
      const deptName = deptRow.rows[0]?.name ?? "another department";
      await pool.query(
        `UPDATE live_chats SET status='queued', agent_id=NULL, department_id=$1 WHERE id=$2`,
        [departmentId, chatId]
      );
      await persistMessage(chatId, "system", null, "system", `Chat transferred to ${deptName} by ${agentName}`);
      sendToVisitor(chatId, { type: "transferred", departmentName: deptName });
      await pushQueueUpdateToAgents();
      broadcastToAgents({ type: "chat_requeued", chatId, departmentId });
    } else {
      return res.status(400).json({ error: "departmentId or targetAgentId required" });
    }
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/** Close — only the assigned agent or an admin can close. */
liveChatRouter.post("/api/support/live-chat/:chatId/close", requireSupportAuth, async (req, res) => {
  const agentId   = req.session.supportAgentId!;
  const agentName = req.session.supportAgentName ?? "Agent";
  const agentRole = req.session.supportAgentRole ?? "agent";
  const chatId = String(req.params.chatId);

  try {
    const chatRow = await pool.query<{ agent_id: number | null }>(
      `SELECT agent_id FROM live_chats WHERE id=$1`, [chatId]
    );
    const ownerId = chatRow.rows[0]?.agent_id;
    if (ownerId !== agentId && agentRole !== "admin") {
      return res.status(403).json({ error: "Only the assigned agent can close this chat" });
    }

    await pool.query(`UPDATE live_chats SET status='closed', closed_at=NOW() WHERE id=$1`, [chatId]);
    await persistMessage(chatId, "system", null, "system", `Chat closed by ${agentName}`);
    sendToVisitor(chatId, { type: "closed", closedBy: "agent" });
    broadcastToAgents({ type: "chat_closed", chatId });
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

// ─── Departments CRUD ─────────────────────────────────────────────────────────

liveChatRouter.get("/api/support/live-chat/departments", requireSupportAuth, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM live_chat_departments ORDER BY id`);
    return res.json({ departments: r.rows });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.post("/api/support/live-chat/departments", requireSupportAuth, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const r = await pool.query(
      `INSERT INTO live_chat_departments (name, description) VALUES ($1,$2) RETURNING *`,
      [name, description || null]
    );
    return res.status(201).json({ department: r.rows[0] });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.delete("/api/support/live-chat/departments/:id", requireSupportAuth, async (req, res) => {
  try {
    await pool.query(`UPDATE live_chat_departments SET is_active=false WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/** Update routing keywords for a department. */
liveChatRouter.patch("/api/support/live-chat/departments/:id/keywords", requireSupportAuth, async (req, res) => {
  const { keywords } = req.body;
  if (typeof keywords !== "string") return res.status(400).json({ error: "keywords string required" });
  try {
    await pool.query(
      `UPDATE live_chat_departments SET routing_keywords=$1 WHERE id=$2`,
      [keywords.trim() || null, req.params.id]
    );
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

// ─── Agent-Department assignments ─────────────────────────────────────────────

liveChatRouter.get("/api/support/live-chat/agent-departments", requireSupportAuth, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT lad.agent_id, lad.department_id,
             sa.first_name || ' ' || sa.last_name AS agent_name,
             d.name AS department_name
      FROM live_chat_agent_departments lad
      JOIN support_agents sa ON sa.id = lad.agent_id
      JOIN live_chat_departments d ON d.id = lad.department_id
      ORDER BY d.id, sa.first_name
    `);
    return res.json({ assignments: r.rows });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.post("/api/support/live-chat/agent-departments", requireSupportAuth, async (req, res) => {
  const { agentId, departmentId } = req.body;
  if (!agentId || !departmentId) return res.status(400).json({ error: "agentId and departmentId required" });
  try {
    await pool.query(
      `INSERT INTO live_chat_agent_departments (agent_id, department_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [Number(agentId), Number(departmentId)]
    );
    return res.status(201).json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.delete("/api/support/live-chat/agent-departments/:agentId/:departmentId", requireSupportAuth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM live_chat_agent_departments WHERE agent_id=$1 AND department_id=$2`,
      [Number(req.params.agentId), Number(req.params.departmentId)]
    );
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

// ─── Canned responses ─────────────────────────────────────────────────────────

liveChatRouter.get("/api/support/live-chat/canned", requireSupportAuth, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM live_chat_canned ORDER BY shortcut`);
    return res.json({ canned: r.rows });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.post("/api/support/live-chat/canned", requireSupportAuth, async (req, res) => {
  const { shortcut, title, content } = req.body;
  if (!shortcut || !title || !content) return res.status(400).json({ error: "shortcut, title, content required" });
  try {
    const r = await pool.query(
      `INSERT INTO live_chat_canned (shortcut, title, content) VALUES ($1,$2,$3)
       ON CONFLICT (shortcut) DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content
       RETURNING *`,
      [shortcut, title, content]
    );
    return res.status(201).json({ canned: r.rows[0] });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

liveChatRouter.delete("/api/support/live-chat/canned/:id", requireSupportAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM live_chat_canned WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

// ─── Stats ────────────────────────────────────────────────────────────────────

liveChatRouter.get("/api/support/live-chat/stats", requireSupportAuth, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')                       AS queued,
        COUNT(*) FILTER (WHERE status = 'active')                       AS active,
        COUNT(*) FILTER (WHERE status = 'closed'  AND closed_at > NOW() - INTERVAL '24h') AS closed_today,
        COUNT(*) FILTER (WHERE status = 'missed'  AND started_at > NOW() - INTERVAL '24h') AS missed_today,
        ROUND(AVG(EXTRACT(EPOCH FROM (accepted_at - started_at))/60)
          FILTER (WHERE accepted_at IS NOT NULL AND started_at > NOW() - INTERVAL '24h'))::int AS avg_wait_min,
        ROUND(AVG(rating) FILTER (WHERE rating IS NOT NULL AND closed_at > NOW() - INTERVAL '7d'), 1) AS avg_rating_7d
      FROM live_chats
    `);
    return res.json(r.rows[0] ?? {});
  } catch { return res.status(500).json({ error: "Failed" }); }
});

// ─── Online agents ────────────────────────────────────────────────────────────

liveChatRouter.get("/api/support/live-chat/online-agents", requireSupportAuth, async (_req, res) => {
  try {
    const ids = Array.from(agentSockets.keys());
    if (!ids.length) return res.json({ agents: [] });
    const r = await pool.query(
      `SELECT id, first_name || ' ' || last_name AS name, role FROM support_agents WHERE id = ANY($1)`,
      [ids]
    );
    const agents = r.rows.map(a => ({ ...a, status: agentStatus.get(a.id) ?? "online" }));
    return res.json({ agents });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/** All agents (for assignment UI — includes offline agents). */
liveChatRouter.get("/api/support/live-chat/all-agents", requireSupportAuth, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, first_name || ' ' || last_name AS name, role FROM support_agents ORDER BY first_name`
    );
    const agents = r.rows.map(a => ({
      ...a,
      online: agentSockets.has(a.id),
      status: agentStatus.get(a.id) ?? "offline",
    }));
    return res.json({ agents });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

// ─── Public availability endpoint (no auth required) ─────────────────────────
liveChatRouter.get("/api/live-chat/availability", (req, res) => {
  const statuses = Array.from(agentStatus.values());
  const onlineCount = statuses.filter(s => s === "online").length;
  const available = onlineCount > 0;
  return res.json({ available, onlineCount, totalAgents: agentStatus.size });
});

// ─── Agent availability ───────────────────────────────────────────────────────

liveChatRouter.patch("/api/support/live-chat/status", requireSupportAuth, (req, res) => {
  const agentId = req.session.supportAgentId!;
  const { status } = req.body;
  if (!["online", "away", "busy"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  agentStatus.set(agentId, status);
  broadcastToAgents({ type: "agent_status_change", agentId, status });
  return res.json({ success: true });
});

// ─── WebSocket server ─────────────────────────────────────────────────────────
export function setupLiveChatWS(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  // Send WS protocol-level ping frames every 20 s to all connected clients.
  // This keeps Nginx / Replit's mTLS proxy from silently killing idle connections
  // (proxy_read_timeout is typically 60 s; 20 s gives comfortable headroom).
  const keepAlive = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, 20_000);

  wss.on("close", () => clearInterval(keepAlive));

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0] ?? "";
    if (pathname === "/ws/live-chat") {
      wss.handleUpgrade(req, socket as any, head, (ws) => wss.emit("connection", ws, req));
    }
  });

  wss.on("connection", (ws: WebSocket, req: any) => {
    const params = new URLSearchParams(req.url?.split("?")[1] ?? "");
    const role   = params.get("role");

    // ── Visitor connection ──────────────────────────────────────────────────
    if (role === "visitor") {
      const chatId = params.get("chatId");
      if (!chatId) { ws.close(4001, "chatId required"); return; }
      visitorSockets.set(chatId, ws);

      pool.query(
        `SELECT c.status, sa.first_name || ' ' || sa.last_name AS agent_name, c.department_id
         FROM live_chats c LEFT JOIN support_agents sa ON sa.id = c.agent_id WHERE c.id = $1`,
        [chatId]
      ).then(async (r) => {
        const chat = r.rows[0];
        if (!chat) { ws.close(4004, "Chat not found"); return; }
        if (chat.status === "queued") {
          const pos = await getQueuePosition(chatId, chat.department_id);
          const estWait = await getEstimatedWaitMin();
          sendJson(ws, { type: "queue_position", position: pos, estimatedWaitMin: estWait });
        } else if (chat.status === "active") {
          sendJson(ws, { type: "assigned", agentName: chat.agent_name });
        } else if (chat.status === "closed") {
          sendJson(ws, { type: "closed", closedBy: "system" });
        }
      }).catch(() => {});

      ws.on("message", async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "message" && msg.content?.trim()) {
            const r = await pool.query(
              `SELECT visitor_name, agent_id FROM live_chats WHERE id=$1`, [chatId]
            );
            const chat = r.rows[0];
            if (!chat) return;
            const row = await persistMessage(chatId, "visitor", null, chat.visitor_name ?? "Visitor", msg.content.trim());
            if (chat.agent_id) {
              const agentWs = agentSockets.get(chat.agent_id);
              if (agentWs) {
                sendJson(agentWs, {
                  type: "visitor_message", chatId,
                  content: msg.content.trim(),
                  visitorName: chat.visitor_name ?? "Visitor",
                  timestamp: row?.created_at,
                });
              }
            }
            // Broadcast to all other agents watching (read-only observers).
            // Exclude the assigned agent — they already received visitor_message directly above.
            broadcastToAgents(
              { type: "visitor_message_broadcast", chatId, content: msg.content.trim(), visitorName: chat.visitor_name },
              chat.agent_id ?? undefined,
            );
          } else if (msg.type === "typing") {
            const r = await pool.query(`SELECT agent_id FROM live_chats WHERE id=$1`, [chatId]);
            const agId = r.rows[0]?.agent_id;
            if (agId) { const aw = agentSockets.get(agId); if (aw) sendJson(aw, { type: "visitor_typing", chatId }); }
          } else if (msg.type === "typing_stop") {
            const r = await pool.query(`SELECT agent_id FROM live_chats WHERE id=$1`, [chatId]);
            const agId = r.rows[0]?.agent_id;
            if (agId) { const aw = agentSockets.get(agId); if (aw) sendJson(aw, { type: "visitor_typing_stop", chatId }); }
          } else if (msg.type === "ping") {
            sendJson(ws, { type: "pong" });
          }
        } catch {}
      });

      ws.on("close", () => {
        visitorSockets.delete(chatId);
        setTimeout(async () => {
          if (!visitorSockets.has(chatId)) {
            const r = await pool.query(
              `UPDATE live_chats SET status = CASE status WHEN 'queued' THEN 'missed' ELSE status END
               WHERE id=$1 AND status = 'queued' RETURNING status`, [chatId]
            );
            if (r.rowCount) {
              await pushQueueUpdateToAgents();
            }
          }
        }, 30_000);
      });

    // ── Agent connection ────────────────────────────────────────────────────
    } else if (role === "agent") {
      const token = params.get("token");
      const tokenData = token ? wsTokens.get(token) : undefined;

      if (!tokenData || tokenData.expires < Date.now()) {
        if (!process.env.SUPPORT_REQUIRE_AUTH) {
          const devAgentId = 1;
          agentSockets.set(devAgentId, ws);
          agentStatus.set(devAgentId, "online");
          sendJson(ws, { type: "authenticated", agentId: devAgentId, name: "Admin Agent", role: "admin", agentStatuses: getAgentStatusList() });
          attachAgentHandlers(ws, devAgentId, "Admin Agent", "admin");
        } else {
          ws.close(4003, "Invalid or expired token");
        }
        return;
      }

      const { agentId, name, role: agRole } = tokenData;
      wsTokens.delete(token!);
      agentSockets.set(agentId, ws);
      agentStatus.set(agentId, "online");
      sendJson(ws, { type: "authenticated", agentId, name, role: agRole, agentStatuses: getAgentStatusList() });
      broadcastToAgents({ type: "agent_online", agentId, name });
      attachAgentHandlers(ws, agentId, name, agRole);
    } else {
      ws.close(4000, "role param required");
    }
  });

  function attachAgentHandlers(ws: WebSocket, agentId: number, agentName: string, agentRole: string) {
    pushQueueUpdateToAgents();

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "ping") {
          sendJson(ws, { type: "pong", ts: Date.now() });

        } else if (msg.type === "message" && msg.chatId && msg.content?.trim() && !msg.content.trim().startsWith("/")) {
          const row = await persistMessage(msg.chatId, "agent", agentId, agentName, msg.content.trim());
          sendToVisitor(msg.chatId, { type: "message", content: msg.content.trim(), agentName, timestamp: row?.created_at });
          // Send confirmation only to sender (includes message id so frontend can replace the optimistic copy)
          sendJson(ws, { type: "message_sent", chatId: msg.chatId, messageId: row?.id, content: msg.content.trim(), timestamp: row?.created_at });
          // Broadcast to OTHER agents only — sender already has the message via message_sent
          broadcastToAgents({ type: "agent_message_broadcast", chatId: msg.chatId, agentId, agentName, content: msg.content.trim(), timestamp: row?.created_at }, agentId);

        } else if (msg.type === "note" && msg.chatId && msg.content?.trim()) {
          const row = await persistMessage(msg.chatId, "note", agentId, agentName, msg.content.trim());
          sendJson(ws, { type: "note_saved", chatId: msg.chatId, content: msg.content.trim(), timestamp: row?.created_at });
          broadcastToAgents({ type: "note_broadcast", chatId: msg.chatId, agentId, agentName, content: msg.content.trim(), timestamp: row?.created_at });

        } else if (msg.type === "typing" && msg.chatId) {
          sendToVisitor(msg.chatId, { type: "typing" });

        } else if (msg.type === "typing_stop" && msg.chatId) {
          sendToVisitor(msg.chatId, { type: "typing_stop" });

        } else if (msg.type === "status_change") {
          const newStatus = msg.status as "online" | "away" | "busy";
          if (["online", "away", "busy"].includes(newStatus)) {
            agentStatus.set(agentId, newStatus);
            broadcastToAgents({ type: "agent_status_change", agentId, status: newStatus });
          }

        } else if (msg.type === "assign" && msg.chatId) {
          // Exclusive assignment: first agent to update status='queued'→'active' wins
          const r = await pool.query(
            `UPDATE live_chats SET status='active', agent_id=$1, accepted_at=NOW()
             WHERE id=$2 AND status='queued' RETURNING id, department_id`,
            [agentId, msg.chatId]
          );
          if (r.rowCount) {
            await persistMessage(msg.chatId, "system", null, "system", `${agentName} joined the chat`);
            sendToVisitor(msg.chatId, { type: "assigned", agentName });
            await pushQueueUpdateToAgents();
            broadcastToAgents({ type: "chat_assigned", chatId: msg.chatId, agentId, agentName });
            sendJson(ws, { type: "assign_ok", chatId: msg.chatId });
          } else {
            sendJson(ws, { type: "assign_fail", chatId: msg.chatId, reason: "Already taken by another agent" });
          }

        } else if (msg.type === "close" && msg.chatId) {
          // Ownership check: only assigned agent or admin can close
          const chatRow = await pool.query<{ agent_id: number | null }>(
            `SELECT agent_id FROM live_chats WHERE id=$1`, [msg.chatId]
          );
          const ownerId = chatRow.rows[0]?.agent_id;
          if (ownerId !== agentId && agentRole !== "admin") {
            sendJson(ws, { type: "error", message: "Only the assigned agent can close this chat" });
            return;
          }
          await pool.query(`UPDATE live_chats SET status='closed', closed_at=NOW() WHERE id=$1`, [msg.chatId]);
          await persistMessage(msg.chatId, "system", null, "system", `Chat closed by ${agentName}`);
          sendToVisitor(msg.chatId, { type: "closed", closedBy: "agent" });
          broadcastToAgents({ type: "chat_closed", chatId: msg.chatId });
          sendJson(ws, { type: "close_ok", chatId: msg.chatId });
        }
      } catch (e) {
        console.error("[live-chat] agent WS error:", e);
      }
    });

    ws.on("close", () => {
      agentSockets.delete(agentId);
      agentStatus.delete(agentId);
      broadcastToAgents({ type: "agent_offline", agentId });
    });
  }

  console.log("[LiveChat] WebSocket server ready at /ws/live-chat");
}

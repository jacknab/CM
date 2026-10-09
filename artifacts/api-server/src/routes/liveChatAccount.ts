/**
 * routes/liveChatAccount.ts — which customer account a live chat belongs to
 *
 *   GET  /api/support/chat-accounts/:chatId          the account for a chat, and how it was matched
 *   POST /api/support/chat-accounts/:chatId/link     { accountId }  an agent attaches the account
 *
 * A chat arrives with an account only when the visitor was signed in to Certxa when they opened it
 * (live_chats.account_id, set by the chat widget). For everyone else this looks the visitor's email
 * up against owner and business emails, and an agent can attach the account by hand.
 *
 *   matchedBy "linked"   the chat carries the account (signed-in visitor, or an agent linked it)
 *   matchedBy "email"    exactly one account uses the email the visitor typed. That email is not
 *                        verified — anyone can type one — so the agent is told it is only a match.
 *
 * This replaces GET /api/support/live-chat/:chatId/account in routes/liveChat.ts, whose query
 * selects subscriptions.name, a column that does not exist, so it has always answered 500 and the
 * chat screen never showed an account.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../db";
import { requireSupportAuth } from "../lib/supportAuth";

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadAccount(storeId: number) {
  const r = await pool.query(
    `SELECT l.id, l.name, l.city, l.state, l.email, l.phone, l.account_status,
            bp.name AS plan_name, u.subscription_status,
            u.email AS user_email, u.first_name, u.last_name
       FROM locations l
       LEFT JOIN users u ON u.id = l.user_id
       LEFT JOIN LATERAL (
         SELECT plan_code FROM subscriptions WHERE store_number = l.id ORDER BY id DESC LIMIT 1
       ) s ON true
       LEFT JOIN billing_plans bp ON bp.code = s.plan_code
      WHERE l.id = $1
      LIMIT 1`,
    [storeId],
  );
  const s = r.rows[0];
  if (!s) return null;
  return {
    id: s.id,
    storeName: s.name,
    city: s.city,
    state: s.state,
    email: s.email,
    phone: s.phone,
    accountStatus: s.account_status ? String(s.account_status).toLowerCase() : null,
    planName: s.plan_name ?? (s.subscription_status === "trial" ? "Free trial" : null),
    ownerEmail: s.user_email,
    ownerName: [s.first_name, s.last_name].filter(Boolean).join(" ") || null,
  };
}

router.get("/api/support/chat-accounts/:chatId", requireSupportAuth, async (req: Request, res: Response) => {
  const chatId = String(req.params.chatId);
  if (!UUID.test(chatId)) return res.status(400).json({ error: "Invalid chat id" });
  try {
    const chat = await pool.query(`SELECT account_id, visitor_email FROM live_chats WHERE id = $1`, [chatId]);
    const row = chat.rows[0];
    if (!row) return res.status(404).json({ error: "Chat not found" });

    const linkedId = Number.parseInt(String(row.account_id ?? ""), 10);
    if (Number.isFinite(linkedId)) {
      const account = await loadAccount(linkedId);
      if (account) return res.json({ account, matchedBy: "linked" });
    }

    const email = String(row.visitor_email ?? "").trim().toLowerCase();
    if (email) {
      // Only when the email points at one account: with two the agent has to choose.
      const match = await pool.query(
        `SELECT l.id FROM locations l LEFT JOIN users u ON u.id = l.user_id
          WHERE lower(u.email) = $1 OR lower(l.email) = $1
          ORDER BY l.id LIMIT 2`,
        [email],
      );
      if (match.rows.length === 1) {
        const account = await loadAccount(match.rows[0].id);
        if (account) return res.json({ account, matchedBy: "email" });
      }
    }
    res.json({ account: null, matchedBy: null });
  } catch (err) {
    console.error("[live-chat/account]", (err as Error)?.message);
    res.status(500).json({ error: "Failed to load the account" });
  }
});

router.post("/api/support/chat-accounts/:chatId/link", requireSupportAuth, async (req: Request, res: Response) => {
  const chatId = String(req.params.chatId);
  const accountId = Number.parseInt(String(req.body?.accountId ?? ""), 10);
  if (!UUID.test(chatId)) return res.status(400).json({ error: "Invalid chat id" });
  if (!Number.isFinite(accountId)) return res.status(400).json({ error: "Invalid account id" });
  try {
    const store = await pool.query(`SELECT id FROM locations WHERE id = $1`, [accountId]);
    if (!store.rows.length) return res.status(404).json({ error: "Account not found" });
    const updated = await pool.query(`UPDATE live_chats SET account_id = $2 WHERE id = $1 RETURNING id`, [chatId, String(accountId)]);
    if (!updated.rows.length) return res.status(404).json({ error: "Chat not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[live-chat/link-account]", (err as Error)?.message);
    res.status(500).json({ error: "Failed to link the account" });
  }
});

export default router;

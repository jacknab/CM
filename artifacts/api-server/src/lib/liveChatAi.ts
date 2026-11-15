/**
 * Tom and Marel answer the certxa.com live chat (owner, 2026-11-15). Every chat goes to one of them at once: Tom for
 * Sales and for visitors who aren't signed in, Marel (Account Services) for everything else and for signed-in owners.
 * Tom hands account questions to Marel in the same chat. Any isTeam agent can take a chat over; from then on the AI
 * stays quiet. A visitor who asks for a person gets one when someone is Online, otherwise a ticket.
 *
 * Their knowledge, rules and tools are the phone agents' (routes/salesAgent.ts buildChatAgentSetup); Marel's account
 * tools are the same functions with the same limits (lib/marilAccountSupport.ts). One model call per visitor message,
 * with tool rounds, over the chat so far. What the AI holds between messages (the verified owner, a pending code, the
 * lead) is in live_chats.ai_state (migration 0369).
 */
import { pool } from "../db";
import { buildChatAgentSetup } from "../routes/salesAgent";
import {
  accountDetails, accountHealth, accountSummary, applyCredit, extendTrial, findAccounts, hashCode, ownerByStoreId,
  refundCharge, retryPayment, sendBillingLink, sendPasswordReset, sendReceipt, sendVerificationCode, type VerifiedOwner,
} from "./marilAccountSupport";

const LOG = "[live-chat-ai]";
const MODEL = () => process.env.LIVE_CHAT_AI_MODEL || process.env.SALES_AGENT_BACKEND_MODEL || process.env.AI_RECEPTIONIST_BACKEND_MODEL || "gpt-5.6-luna";
/** Messages of the chat the model reads (newest). */
const HISTORY = 40;
/** Tool rounds in one reply. */
const MAX_ROUNDS = 6;
/** Replies in one chat; after that a person takes it (or a ticket). */
const MAX_REPLIES = Number(process.env.LIVE_CHAT_AI_MAX_REPLIES || 60);
/** Replies a day across all chats, so a flood can't run up the OpenAI bill. */
const DAILY_REPLIES = Number(process.env.LIVE_CHAT_AI_DAILY_REPLIES || 1500);
const FALLBACK = "Sorry, I couldn't answer that just now. Please try again in a moment, or e-mail support@certxa.com.";

export type AiAgent = "tom" | "marel";
type AiState = {
  owner?: VerifiedOwner | null;
  pending?: { hash: string; owner: VerifiedOwner; tries: number } | null;
  codesSent?: number;
  tomNote?: string | null;
  leadId?: number | null;
  replies?: number;
};

/** What the chat server does for the AI (routes/liveChat.ts): kept there, so the sockets and queue stay in one place. */
export type ChatIo = {
  say: (chatId: string, agentId: number, name: string, content: string) => Promise<void>;
  typing: (chatId: string, on: boolean) => void;
  handTo: (chatId: string, agentId: number, name: string) => Promise<void>;
  toPerson: (chatId: string, reason: string) => Promise<boolean>;
  openTicket: (chatId: string, subject: string, description: string, accountId: number | null) => Promise<string>;
  humansOnline: () => Promise<boolean>;
};

let ids: { tom: number; marel: number } | null = null;
/** Tom's and Marel's support_agents rows (migrations 0369 and 0341). */
export async function aiAgentIds(): Promise<{ tom: number; marel: number }> {
  if (ids) return ids;
  const { rows } = await pool.query<{ id: number; email: string }>(
    `SELECT id, email FROM support_agents WHERE email IN ('tom.ai@certxa.invalid', 'maril.ai@certxa.invalid')`,
  );
  const tom = rows.find((r) => r.email === "tom.ai@certxa.invalid")?.id;
  const marel = rows.find((r) => r.email === "maril.ai@certxa.invalid")?.id;
  if (!tom || !marel) throw new Error("Tom's or Marel's support agent record is missing (migrations 0341, 0369)");
  ids = { tom: Number(tom), marel: Number(marel) };
  return ids;
}

export async function aiAgentOf(agentId: number | null | undefined): Promise<AiAgent | null> {
  if (!agentId) return null;
  const a = await aiAgentIds().catch(() => null);
  return a?.tom === agentId ? "tom" : a?.marel === agentId ? "marel" : null;
}

/** The name the visitor sees. */
export const aiName = (agent: AiAgent) => (agent === "tom" ? "Tom" : "Marel");

/** Who takes a new chat: the Sales topic, or no topic chosen by a visitor who isn't signed in, goes to Tom; any other topic the visitor chose, or a signed-in owner, to Marel. */
export async function pickAiAgent(departmentId: number | null, signedIn: boolean): Promise<{ agent: AiAgent; agentId: number }> {
  const a = await aiAgentIds();
  let dept = "";
  if (departmentId) {
    const r = await pool.query<{ name: string }>(`SELECT name FROM live_chat_departments WHERE id = $1`, [departmentId]);
    dept = String(r.rows[0]?.name ?? "").toLowerCase();
  }
  const agent: AiAgent = dept.includes("sales") ? "tom" : dept || signedIn ? "marel" : "tom";
  return { agent, agentId: a[agent] };
}

async function loadState(chatId: string): Promise<AiState> {
  const r = await pool.query<{ ai_state: AiState }>(`SELECT ai_state FROM live_chats WHERE id::text = $1`, [chatId]);
  return r.rows[0]?.ai_state ?? {};
}
async function saveState(chatId: string, state: AiState): Promise<void> {
  await pool.query(`UPDATE live_chats SET ai_state = $2::jsonb WHERE id::text = $1`, [chatId, JSON.stringify(state)]);
}

async function overDailyLimit(): Promise<boolean> {
  const a = await aiAgentIds();
  const r = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM live_chat_messages WHERE sender_type = 'agent' AND sender_id = ANY($1::int[]) AND created_at > now() - interval '1 day'`,
    [[a.tom, a.marel]],
  );
  return r.rows[0].n >= DAILY_REPLIES;
}

// One reply at a time per chat; a message that arrives meanwhile is answered right after.
const running = new Map<string, boolean>();

/** Answer the visitor (the chat's opening question, or their latest messages). */
export function runAiTurn(chatId: string, io: ChatIo): void {
  if (running.has(chatId)) { running.set(chatId, true); return; }
  running.set(chatId, false);
  void (async () => {
    try {
      do {
        running.set(chatId, false);
        await reply(chatId, io);
      } while (running.get(chatId));
    } catch (err) {
      console.error(`${LOG} chat=${chatId}:`, (err as Error)?.message ?? err);
    } finally {
      running.delete(chatId);
    }
  })();
}

async function reply(chatId: string, io: ChatIo): Promise<void> {
  const c = await pool.query(
    `SELECT id::text, status, agent_id, subject, visitor_name, visitor_email, account_id FROM live_chats WHERE id::text = $1`, [chatId],
  );
  const chat = c.rows[0];
  if (!chat || chat.status !== "active") return;
  const agent = await aiAgentOf(chat.agent_id);
  if (!agent) return; // a person has the chat now
  const state = await loadState(chatId);
  const name = aiName(agent);

  if ((state.replies ?? 0) >= MAX_REPLIES || await overDailyLimit()) {
    const handed = await io.toPerson(chatId, "The AI reply limit was reached").catch(() => false);
    if (!handed) {
      const ticket = await io.openTicket(chatId, chat.subject || "Live chat", "The chat reached the AI reply limit; please follow up.", state.owner?.storeId ?? null).catch(() => null);
      await io.say(chatId, chat.agent_id, name, ticket
        ? `I've passed this to the Certxa team (ticket ${ticket}); they'll reply by e-mail.`
        : "I've passed this to the Certxa team; please e-mail support@certxa.com if you don't hear back.");
    }
    return;
  }

  // A signed-in owner talking to Marel is verified by their sign-in.
  if (agent === "marel" && !state.owner && chat.account_id) {
    state.owner = await ownerByStoreId(Number(chat.account_id)).catch(() => null);
  }

  const m = await pool.query<{ sender_type: string; sender_name: string | null; content: string; attachment_url: string | null }>(
    `SELECT sender_type, sender_name, content, attachment_url FROM (
       SELECT sender_type, sender_name, content, attachment_url, created_at FROM live_chat_messages
        WHERE chat_id::text = $1 AND sender_type IN ('visitor', 'agent') ORDER BY created_at DESC LIMIT $2
     ) t ORDER BY created_at ASC`,
    [chatId, HISTORY],
  );
  const input: any[] = [];
  if (chat.subject) input.push({ role: "user", content: `[What the visitor wrote when starting the chat] ${chat.subject}` });
  for (const row of m.rows) {
    const text = row.attachment_url ? "(sent a photo)" : row.content;
    if (row.sender_type === "visitor") input.push({ role: "user", content: text });
    else input.push({ role: "assistant", content: row.sender_name && row.sender_name !== name ? `[${row.sender_name}] ${text}` : text });
  }
  if (input.length === 0 || input[input.length - 1].role !== "user") return; // nothing new from the visitor
  const visitorLine = `The visitor's name: ${chat.visitor_name || "not given"}. Their e-mail: ${chat.visitor_email || "not given"}.`;

  const humansOnline = await io.humansOnline().catch(() => false);
  const setup = await buildChatAgentSetup(agent, {
    owner: state.owner ?? null, transferred: !!state.tomNote, humansOnline,
    tomNote: state.tomNote ? { reason: state.tomNote, callerSaid: [] } : null,
  });

  io.typing(chatId, true);
  let text = "";
  let handed: "marel" | "person" | null = null;
  let personReason = "";
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is missing");
    for (let round = 0; round < MAX_ROUNDS && !text; round++) {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL(), instructions: `${setup.instructions}\n\n${visitorLine}`, input, tools: setup.tools, tool_choice: "auto" }),
        signal: AbortSignal.timeout(60_000),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${String(data?.error?.message ?? "").slice(0, 200)}`);
      const output: any[] = Array.isArray(data?.output) ? data.output : [];
      const calls = output.filter((x) => x.type === "function_call");
      if (!calls.length) {
        // The answer: the last message's text parts only (not reasoning, not earlier items).
        const msg = [...output].reverse().find((x) => x.type === "message");
        text = String((msg?.content ?? []).filter((p: any) => p.type === "output_text").map((p: any) => p.text ?? "").join("")).trim();
        break;
      }
      for (const item of output) if (item.type !== "message") input.push(item);
      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch {}
        const out = await runTool(agent, call.name, args, { chatId, chat, state, io });
        if (out.handed) handed = out.handed;
        if (out.handed === "person") personReason = String(args.reason ?? "");
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(out.result).slice(0, 12000) });
      }
      if (handed === "marel") break;
    }
  } catch (err) {
    console.error(`${LOG} chat=${chatId} agent=${agent}:`, (err as Error)?.message ?? err);
    if (!text && !handed) text = FALLBACK;
  } finally {
    io.typing(chatId, false);
  }

  state.replies = (state.replies ?? 0) + 1;
  await saveState(chatId, state);
  // Still theirs? A person may have taken the chat while the model was thinking.
  const now = await pool.query(`SELECT agent_id, status FROM live_chats WHERE id::text = $1`, [chatId]);
  const stillOurs = now.rows[0]?.status === "active" && now.rows[0]?.agent_id === chat.agent_id;
  if (handed === "marel") { runAiTurn(chatId, io); return; } // Marel answers; Tom says nothing more
  if (text && stillOurs) await io.say(chatId, chat.agent_id, name, text.slice(0, 4000));
  // A person was asked for: after the AI's "a teammate is joining", the chat goes to the queue for them.
  if (handed === "person" && stillOurs && !(await io.toPerson(chatId, personReason).catch(() => false))) {
    const ticket = await io.openTicket(chatId, chat.subject || "Live chat", `The visitor asked for a person. ${personReason}`, state.owner?.storeId ?? null).catch(() => null);
    await io.say(chatId, chat.agent_id, name, ticket
      ? `Everyone just stepped away, so I've opened ticket ${ticket}; the team will reply by e-mail.`
      : "Everyone just stepped away; please e-mail support@certxa.com and the team will reply.");
  }
}

type ToolCtx = { chatId: string; chat: any; state: AiState; io: ChatIo };
const needOwner = { success: false, message: "Verify the visitor first (find_account, send_verification_code, check_verification_code)." };

async function runTool(agent: AiAgent, name: string, args: any, x: ToolCtx): Promise<{ result: Record<string, unknown>; handed?: "marel" | "person" }> {
  const { chatId, chat, state, io } = x;
  const owner = state.owner ?? null;
  try {
    switch (name) {
      // ── Tom ──
      case "save_lead": return { result: await saveLead(chatId, state, args, chat) };
      case "transfer_to_account_services": {
        if (agent !== "tom") return { result: { success: false, message: "Only Tom transfers." } };
        const a = await aiAgentIds();
        state.tomNote = String(args.reason ?? "").slice(0, 300) || null;
        await saveState(chatId, state);
        await io.handTo(chatId, a.marel, "Marel");
        return { result: { success: true, message: "Marel has the chat now and will answer next. Say nothing more." }, handed: "marel" };
      }
      case "open_manager_ticket":
      case "open_ticket": {
        const subject = String(args.subject ?? (name === "open_manager_ticket" ? "Manager follow-up requested in live chat" : "Live chat request")).slice(0, 200);
        const description = [String(args.description ?? "").trim(), args.email ? `E-mail: ${String(args.email).trim()}` : ""].filter(Boolean).join("\n");
        const number = await io.openTicket(chatId, subject, description, owner?.storeId ?? null);
        return { result: { success: true, ticket: number, message: `Ticket ${number} is open; the team follows up by e-mail.` } };
      }
      case "ask_for_person": {
        if (!(await io.humansOnline())) return { result: { success: false, message: "Nobody is on chat after all. Offer a ticket instead." } };
        return { result: { success: true, message: "A teammate will join after your message. Tell the visitor so in one short line." }, handed: "person" };
      }
      // ── Marel (lib/marilAccountSupport.ts, as on the phone) ──
      case "find_account": {
        const matches = await findAccounts({ email: args.email, businessName: args.businessName, phone: args.phone });
        return { result: { success: true, matches } };
      }
      case "send_verification_code": {
        if ((state.codesSent ?? 0) >= 3) return { result: { success: false, message: "Three codes were already sent in this chat. Offer a ticket instead." } };
        const r = await sendVerificationCode(String(args.accountRef ?? ""));
        if (!r.ok) return { result: { success: false, message: r.message } };
        state.codesSent = (state.codesSent ?? 0) + 1;
        state.pending = { hash: r.codeHash, owner: r.owner, tries: 0 };
        await saveState(chatId, state);
        return { result: { success: true, message: `Code texted to the mobile ${r.sentTo}. Ask them to type it here.` } };
      }
      case "check_verification_code": {
        const p = state.pending;
        if (!p) return { result: { success: false, message: "No code has been sent yet." } };
        if (p.tries >= 3) return { result: { success: false, message: "No tries left for this code. Send a new one, or offer a ticket." } };
        p.tries += 1;
        if (hashCode(String(args.code ?? "")) !== p.hash) { await saveState(chatId, state); return { result: { success: false, verified: false, message: "That code doesn't match. Ask them to check it." } }; }
        state.owner = p.owner;
        state.pending = null;
        await saveState(chatId, state);
        await pool.query(`UPDATE live_chats SET account_id = $2 WHERE id::text = $1 AND account_id IS NULL`, [chatId, String(p.owner.storeId)]).catch(() => {});
        return { result: { success: true, verified: true, message: `Verified: the owner of ${p.owner.businessName}. You can use the account tools now.` } };
      }
      case "get_account_summary": return { result: owner ? { success: true, account: await accountSummary(owner) } : needOwner };
      case "get_account_details": return { result: owner ? { success: true, details: await accountDetails(owner) } : needOwner };
      case "get_account_health": return { result: owner ? { success: true, health: await accountHealth(owner) } : needOwner };
      case "send_billing_link": return { result: owner ? { success: true, message: await sendBillingLink(owner) } : needOwner };
      case "send_password_reset": return { result: owner ? { success: true, message: await sendPasswordReset(owner) } : needOwner };
      case "send_receipt": return { result: owner ? { success: true, message: await sendReceipt(owner, Number(args.chargeRef) || undefined) } : needOwner };
      case "retry_payment": return { result: owner ? { success: true, message: await retryPayment(owner) } : needOwner };
      case "extend_trial": return { result: owner ? { success: true, message: await extendTrial(owner, Number(args.days), String(args.reason ?? "")) } : needOwner };
      case "apply_credit": return { result: owner ? { success: true, message: await applyCredit(owner, Number(args.amount), String(args.reason ?? "")) } : needOwner };
      case "refund_charge": return {
        result: owner ? { success: true, message: await refundCharge(owner, Number(args.chargeRef), args.amount == null ? null : Number(args.amount), String(args.reason ?? "")) } : needOwner,
      };
      default: return { result: { success: false, message: `${name} isn't available in chat.` } };
    }
  } catch (err) {
    console.error(`${LOG} tool ${name} chat=${chatId}:`, (err as Error)?.message ?? err);
    return { result: { success: false, message: "That didn't work. Don't say it was done; offer a ticket if it matters." } };
  }
}

const LEAD_COLUMNS: Record<string, string> = {
  name: "name", businessName: "business_name", businessType: "business_type", teamSize: "team_size", city: "city",
  email: "email", phone: "phone", currentSoftware: "current_software", interestedPlan: "interested_plan", notes: "notes",
};

/** Tom's lead from a chat, in the same Sales Leads list as phone leads (source "chat"). */
async function saveLead(chatId: string, state: AiState, args: any, chat: any): Promise<Record<string, unknown>> {
  const values: Record<string, string> = {};
  for (const [k, col] of Object.entries(LEAD_COLUMNS)) {
    const v = typeof args[k] === "string" ? args[k].trim().slice(0, 500) : "";
    if (v) values[col] = v;
  }
  if (!values.name && chat.visitor_name && chat.visitor_name !== "Anonymous") values.name = chat.visitor_name;
  if (!values.email && chat.visitor_email) values.email = chat.visitor_email;
  const extra = Object.fromEntries(Object.entries(args).filter(([k]) => !(k in LEAD_COLUMNS)));
  const profile = { chat: { chatId, ...extra } };
  if (state.leadId) {
    const cols = Object.keys(values);
    await pool.query(
      `UPDATE sales_leads SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}${cols.length ? "," : ""}
              profile_data = profile_data || $${cols.length + 2}::jsonb, updated_at = now() WHERE id = $1`,
      [state.leadId, ...cols.map((c) => values[c]), JSON.stringify(profile)],
    );
    return { success: true, message: "Lead updated." };
  }
  const cols = Object.keys(values);
  const r = await pool.query<{ id: number }>(
    `INSERT INTO sales_leads (${[...cols, "source", "status", "profile_data"].join(", ")})
     VALUES (${[...cols.map((_, i) => `$${i + 1}`), "'chat'", "'new'", `$${cols.length + 1}::jsonb`].join(", ")}) RETURNING id`,
    [...cols.map((c) => values[c]), JSON.stringify(profile)],
  );
  state.leadId = r.rows[0].id;
  await saveState(chatId, state);
  return { success: true, message: "Lead saved." };
}

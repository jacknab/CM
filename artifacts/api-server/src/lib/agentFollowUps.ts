/**
 * Marel's follow-up text (owner, 2026-11-11): when she has done something on a call — sent a reset e-mail, retried a
 * payment, extended a trial — she can offer to text the caller a little later to check it worked. Only after the caller
 * says yes on the call; one per call, at most two a day to a number; sent from Certxa's number by a one-minute job.
 */
import { pool } from "../db";
import { sendTwilioSms } from "../sms";

const MAREL_LINE = "(602) 560-9931";

/** The text, built here (the AI only names what to check on). */
export function followUpBody(firstName: string | null, checkingOn: string): string {
  const what = checkingOn.replace(/https?:\/\/\S+/gi, "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().replace(/[\s?.!]+$/, "").slice(0, 110);
  return `Hi${firstName ? ` ${firstName.trim().split(/\s+/)[0].slice(0, 30)}` : ""}, it's Marel from Certxa Account Services. Just checking in: ${what}? `
    + `If anything still isn't working, call us at ${MAREL_LINE}.`;
}

export async function scheduleFollowUp(o: { callSid: string | null; phoneE164: string | null; storeId: number | null; firstName: string | null; checkingOn: string; minutes: number }): Promise<string> {
  if (!o.callSid || !o.phoneE164) return "There's no number to text on this call.";
  if (o.checkingOn.trim().length < 5) return "Say what the text should check on.";
  const minutes = Math.max(10, Math.min(60, Math.round(Number(o.minutes) || 20)));
  const today = await pool.query(`SELECT count(*)::int AS n FROM agent_follow_ups WHERE phone_e164 = $1 AND created_at > now() - interval '24 hours'`, [o.phoneE164]);
  if ((today.rows[0]?.n ?? 0) >= 2) return "This number already has follow-up texts coming today; don't schedule another.";
  const r = await pool.query(
    `INSERT INTO agent_follow_ups (call_sid, phone_e164, store_id, body, send_at) VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)
     ON CONFLICT (call_sid) DO NOTHING RETURNING id`,
    [o.callSid, o.phoneE164, o.storeId, followUpBody(o.firstName, o.checkingOn), String(minutes)]);
  return r.rows.length ? `Follow-up text set for about ${minutes} minutes from now.` : "A follow-up text is already set for this call.";
}

/** Send what is due. Each row is taken by one worker only. */
export async function sendDueFollowUps(): Promise<void> {
  const due = await pool.query<{ id: number; phone_e164: string; body: string }>(
    `UPDATE agent_follow_ups SET status = 'sending'
      WHERE id IN (SELECT id FROM agent_follow_ups WHERE status = 'pending' AND send_at <= now() ORDER BY send_at LIMIT 20 FOR UPDATE SKIP LOCKED)
      RETURNING id, phone_e164, body`);
  for (const f of due.rows) {
    const sent = await sendTwilioSms(f.phone_e164, f.body).catch((e: any) => ({ success: false, error: e?.message ?? "send failed" }));
    await pool.query(`UPDATE agent_follow_ups SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN now() END, error = $3 WHERE id = $1`,
      [f.id, sent.success ? "sent" : "failed", sent.success ? null : String((sent as any).error ?? "").slice(0, 300)]);
  }
}

export function startAgentFollowUps(): void {
  setInterval(() => { void sendDueFollowUps().catch((e) => console.error("[follow-ups] run failed:", e?.message ?? e)); }, 60_000);
}

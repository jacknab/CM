/**
 * App announcements (owner, 2026-11-04): a short message an admin schedules in /isAdmin › App Announcements. At its
 * date and time it goes as a push notification to every phone signed in to the Certxa Pro app (owner_push_devices,
 * registered by the app after sign-in). A phone that has never signed in has no push token, so it can't be reached.
 *   GET    /api/admin/app-announcements        the list, and how many phones would get one now
 *   POST   /api/admin/app-announcements        { title, body, sendAt }
 *   DELETE /api/admin/app-announcements/:id    cancel one that hasn't gone yet
 * A run every minute sends what is due; each announcement is claimed (scheduled → sending) before it is sent, so it
 * goes once even with several server workers.
 */
import { pool } from "../db";
import { PUSH_CHANNEL, PUSH_SOUND } from "./ownerPush";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const TITLE_MAX = 60;
export const BODY_MAX = 180;

export class AnnouncementError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type Row = { id: number; title: string; body: string; send_at: Date; status: string; sent_count: number | null; created_at: Date; sent_at: Date | null };
const toJson = (r: Row) => ({ id: r.id, title: r.title, body: r.body, sendAt: r.send_at, status: r.status, sentCount: r.sent_count, createdAt: r.created_at, sentAt: r.sent_at });

export async function listAnnouncements() {
  const [rows, devices] = await Promise.all([
    pool.query<Row>(`SELECT * FROM app_announcements ORDER BY send_at DESC LIMIT 200`),
    pool.query<{ n: number }>(`SELECT COUNT(DISTINCT token)::int AS n FROM owner_push_devices`),
  ]);
  return { announcements: rows.rows.map(toJson), devices: devices.rows[0]?.n ?? 0 };
}

export async function createAnnouncement(input: { title?: unknown; body?: unknown; sendAt?: unknown }, createdBy: string | null) {
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const sendAt = new Date(String(input.sendAt ?? ""));
  if (!title || title.length > TITLE_MAX) throw new AnnouncementError(`Enter a title of up to ${TITLE_MAX} characters.`);
  if (!body || body.length > BODY_MAX) throw new AnnouncementError(`Enter a message of up to ${BODY_MAX} characters.`);
  if (Number.isNaN(sendAt.getTime())) throw new AnnouncementError("Choose a date and time.");
  if (sendAt.getTime() < Date.now() - 5 * 60_000) throw new AnnouncementError("That date and time has passed.");
  const r = await pool.query<Row>(
    `INSERT INTO app_announcements (title, body, send_at, created_by) VALUES ($1, $2, $3, $4) RETURNING *`, [title, body, sendAt, createdBy]);
  return toJson(r.rows[0]);
}

export async function cancelAnnouncement(id: number) {
  const r = await pool.query<Row>(`UPDATE app_announcements SET status = 'canceled' WHERE id = $1 AND status = 'scheduled' RETURNING *`, [id]);
  if (!r.rows[0]) throw new AnnouncementError("Only an announcement that hasn't been sent can be cancelled.", 409);
  return toJson(r.rows[0]);
}

/** Send one announcement to every signed-in phone. Returns how many phones Expo accepted it for. */
async function sendToAllDevices(a: { id: number; title: string; body: string }): Promise<number> {
  const devices = await pool.query<{ token: string }>(`SELECT DISTINCT token FROM owner_push_devices`);
  let sent = 0;
  for (let i = 0; i < devices.rows.length; i += 100) {
    const part = devices.rows.slice(i, i + 100).map((d) => ({
      to: d.token, title: a.title, body: a.body, sound: PUSH_SOUND, channelId: PUSH_CHANNEL, priority: "high", data: { type: "announcement", id: a.id },
    }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(part), signal: AbortSignal.timeout(15_000),
    });
    const json: any = await res.json().catch(() => null);
    const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
    sent += tickets.filter((t) => t?.status === "ok").length;
    const dead = part.filter((_, n) => tickets[n]?.status === "error" && tickets[n]?.details?.error === "DeviceNotRegistered").map((m) => m.to);
    if (dead.length) await pool.query(`DELETE FROM owner_push_devices WHERE token = ANY($1::text[])`, [dead]);
  }
  return sent;
}

export async function sendDueAnnouncements(): Promise<void> {
  const due = await pool.query<Row>(
    `UPDATE app_announcements SET status = 'sending' WHERE id IN (
       SELECT id FROM app_announcements WHERE status = 'scheduled' AND send_at <= now() ORDER BY send_at LIMIT 5 FOR UPDATE SKIP LOCKED
     ) RETURNING *`);
  for (const a of due.rows) {
    try {
      const sent = await sendToAllDevices(a);
      await pool.query(`UPDATE app_announcements SET status = 'sent', sent_count = $2, sent_at = now() WHERE id = $1`, [a.id, sent]);
      console.log(`[app-announcements] #${a.id} sent to ${sent} phones`);
    } catch (e: any) {
      await pool.query(`UPDATE app_announcements SET status = 'failed', sent_at = now() WHERE id = $1`, [a.id]);
      console.error(`[app-announcements] #${a.id} failed:`, e?.message);
    }
  }
}

export function startAppAnnouncements(): void {
  setInterval(() => { void sendDueAnnouncements().catch((e) => console.error("[app-announcements] run failed:", e?.message)); }, 60_000);
}

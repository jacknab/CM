/**
 * Push notifications to the business owner's phone (the Certxa Pro app).
 *
 * The app registers its Expo push token with POST /api/solo/push-token (routes/solo-mobile.ts),
 * which stores it in owner_push_devices (migration 0225). When a CLIENT, or the AI receptionist
 * acting for a client, books, cancels or reschedules, the route that handled it calls
 * pushBookingEvent(). Things the owner does themselves never notify.
 *
 * Delivery goes through Expo's push service, which forwards to Apple / Google. Every failure is
 * swallowed: a push must never break the booking that triggered it.
 */
import { pool } from "../db";

export type OwnerPushKind =
  | "booked_online" | "booked_ai"
  | "cancelled_client" | "cancelled_ai"
  | "rescheduled_client" | "rescheduled_ai";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Bundled in the app (assets/sounds/soft_chime.wav) — a short, quiet two-note chime. */
export const PUSH_SOUND = "soft_chime.wav";
export const PUSH_CHANNEL = "bookings";
/** Bundled in the app (assets/sounds/alarm.wav): the house-call alarm. */
export const ALARM_SOUND = "alarm.wav";
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,80}\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export function whenLabel(date: Date, timeZone: string): string {
  try {
    return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
  } catch {
    return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
}

export function buildBookingPush(kind: OwnerPushKind, info: { client: string; service: string | null; when: string }): { title: string; body: string } {
  const what = info.service ? `${info.client} · ${info.service}` : info.client;
  const via = kind.endsWith("_ai") ? " (AI receptionist)" : "";
  if (kind.startsWith("booked")) return { title: `New booking${via}`, body: `${what}\n${info.when}` };
  if (kind.startsWith("cancelled")) return { title: `Booking cancelled${via}`, body: `${what}\nWas ${info.when}` };
  return { title: `Booking moved${via}`, body: `${what}\nNow ${info.when}` };
}

export async function pushBookingEvent(storeId: number, appointmentId: number, kind: OwnerPushKind): Promise<void> {
  try {
    if (!Number.isInteger(storeId) || !Number.isInteger(appointmentId)) return;
    const devices = await pool.query<{ token: string }>(`SELECT token FROM owner_push_devices WHERE store_id = $1`, [storeId]);
    if (devices.rows.length === 0) return;

    const found = await pool.query(
      `SELECT a.date, COALESCE(c.full_name, a.customer_name) AS client, s.name AS service, l.timezone
         FROM appointments a
         LEFT JOIN clients c ON c.id = a.customer_id
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN locations l ON l.id = a.store_id
        WHERE a.id = $1 AND a.store_id = $2`,
      [appointmentId, storeId],
    );
    const row = found.rows[0];
    if (!row) return;
    const text = buildBookingPush(kind, {
      client: String(row.client || "A client"),
      service: row.service ? String(row.service) : null,
      when: row.date ? whenLabel(new Date(row.date), String(row.timezone || "UTC")) : "",
    });

    const messages = devices.rows.map((d) => ({
      to: d.token, title: text.title, body: text.body, sound: PUSH_SOUND, channelId: PUSH_CHANNEL, priority: "high",
      data: { type: kind, appointmentId },
    }));
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(10_000),
      });
      const json: any = await res.json().catch(() => null);
      const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
      // A phone that uninstalled the app, or switched notifications off for good, is forgotten.
      const dead = batch.filter((_, n) => tickets[n]?.status === "error" && tickets[n]?.details?.error === "DeviceNotRegistered").map((m) => m.to);
      if (dead.length) await pool.query(`DELETE FROM owner_push_devices WHERE token = ANY($1::text[])`, [dead]);
      const failed = tickets.filter((t) => t?.status === "error").length;
      console.log(`[owner-push] store=${storeId} appointment=${appointmentId} ${kind}: sent=${batch.length - failed} failed=${failed}`);
    }
  } catch (err: any) {
    console.warn("[owner-push] not sent:", err?.message ?? err);
  }
}


/**
 * Any other message for the owner's phone (Certxa Pro app), e.g. a booking request waiting for an answer.
 * `data.type` tells the app what to open when it is tapped.
 */
export async function pushOwnerMessage(storeId: number, message: { title: string; body: string; data: Record<string, unknown> },
  options: { sound?: string; interruptionLevel?: "time-sensitive" } = {}): Promise<void> {
  try {
    const devices = await pool.query<{ token: string }>(`SELECT token FROM owner_push_devices WHERE store_id = $1`, [storeId]);
    if (devices.rows.length === 0) return;
    const batch = devices.rows.map((d) => ({
      to: d.token, title: message.title, body: message.body, sound: options.sound ?? PUSH_SOUND, channelId: PUSH_CHANNEL, priority: "high", data: message.data,
      ...(options.interruptionLevel ? { interruptionLevel: options.interruptionLevel } : {}),
    }));
    for (let i = 0; i < batch.length; i += 100) {
      const part = batch.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(part), signal: AbortSignal.timeout(10_000),
      });
      const json: any = await res.json().catch(() => null);
      const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
      const dead = part.filter((_, n) => tickets[n]?.status === "error" && tickets[n]?.details?.error === "DeviceNotRegistered").map((m) => m.to);
      if (dead.length) await pool.query(`DELETE FROM owner_push_devices WHERE token = ANY($1::text[])`, [dead]);
      console.log(`[owner-push] store=${storeId} ${String(message.data.type ?? "message")}: sent=${part.length - tickets.filter((t) => t?.status === "error").length}`);
    }
  } catch (err: any) {
    console.warn("[owner-push] not sent:", err?.message ?? err);
  }
}

/**
 * The account's plan changed (owner, 2026-11-04): Plus started ("Certxa Pro+"), or Plus ended and the account is
 * Certxa Pro again, because its payment failed or the owner cancelled (services/saas-billing.ts backToSolo).
 */
export async function pushPlanChange(storeId: number, change: "plus" | "pro", why?: string): Promise<void> {
  await pushOwnerMessage(storeId, change === "plus"
    ? { title: "You're now Certxa Pro+", body: "Plus is on: unlimited text notifications for your clients.", data: { type: "plan" } }
    : {
        title: "Your account is now Certxa Pro",
        body: why === "payment_failed"
          ? "Your Plus payment didn't go through, so Plus has ended. Text notifications use credits again."
          : "Your Plus plan has ended. Text notifications use credits again.",
        data: { type: "plan" },
      });
}

/** A client left a review (owner, 2026-11-03): the owner's phone says so, and a tap opens Reviews to read and reply. */
export async function pushNewReview(storeId: number, review: { id: number | null; customerName: string | null; rating: number; comment: string | null }): Promise<void> {
  const who = String(review.customerName ?? "").trim().split(/\s+/)[0] || "A client";
  const said = String(review.comment ?? "").trim();
  const rating = Math.max(1, Math.min(5, Math.round(review.rating) || 5));
  await pushOwnerMessage(storeId, {
    title: `New review ${"★".repeat(rating)}${"☆".repeat(5 - rating)}`,
    body: `${said ? `${who}: "${said.slice(0, 120)}${said.length > 120 ? "…" : ""}"` : `${who} left a ${rating}-star review.`}\nTap to read it and reply.`,
    data: { type: "review", reviewId: review.id },
  });
}

/**
 * The house-call alarm (owner, 2026-11-04): the pro sets how long before a house call they need (Settings › Where you
 * see clients) to load the car, drive there and set up, and their phone sounds that long before each one. The server
 * sends it, so it works with the app closed and for bookings made online. The UPDATE claims each booking, so one alarm
 * goes out however many servers run this; leave_alarm_for holds the time it was for, so a moved booking sounds again.
 */
import { pool } from "../db";
import { pushOwnerMessage, ALARM_SOUND } from "../lib/ownerPush";

const SWEEP_MS = 60_000;

/** "Linda Parker · Gel Manicure at 2:00 PM\n1825 Logan St, Denver" */
export function alarmText(info: { client: string | null; service: string | null; time: string; address?: { line1?: string; city?: string } | null }): { title: string; body: string } {
  const who = [info.client || "Your client", info.service].filter(Boolean).join(" · ");
  const where = [info.address?.line1, info.address?.city].filter(Boolean).join(", ");
  return { title: "Time to get ready for your house call", body: `${who} at ${info.time}${where ? `\n${where}` : ""}` };
}

export async function sweepHouseCallAlarms(): Promise<void> {
  const { rows } = await pool.query(
    `WITH due AS (
       SELECT a.id FROM appointments a JOIN locations l ON l.id = a.store_id
        WHERE a.visit_at = 'client' AND a.date > now() AND a.date - make_interval(mins => l.house_call_alarm_minutes) <= now()
          AND l.house_calls = TRUE AND l.house_call_alarm_minutes > 0
          AND a.status IN ('pending', 'confirmed') AND a.calendar_hidden IS NOT TRUE
          AND a.leave_alarm_for IS DISTINCT FROM a.date
     )
     UPDATE appointments a SET leave_alarm_for = a.date FROM due WHERE a.id = due.id
     RETURNING a.id, a.store_id, a.date, a.client_address, a.customer_id, a.customer_name, a.service_id`);
  for (const row of rows) {
    const info = await pool.query(
      `SELECT COALESCE((SELECT full_name FROM clients WHERE id = $1), $2) AS client, (SELECT name FROM services WHERE id = $3) AS service,
              (SELECT timezone FROM locations WHERE id = $4) AS timezone`,
      [row.customer_id, row.customer_name, row.service_id, row.store_id]);
    const { client, service, timezone } = info.rows[0];
    const time = new Date(row.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone || "UTC" });
    const address = typeof row.client_address === "string" ? JSON.parse(row.client_address) : row.client_address;
    await pushOwnerMessage(row.store_id, { ...alarmText({ client, service, time, address }), data: { type: "house_call_alarm", appointmentId: row.id } },
      { sound: ALARM_SOUND, interruptionLevel: "time-sensitive" });
  }
}

export function startHouseCallAlarms(): void {
  setInterval(() => { void sweepHouseCallAlarms().catch((e) => console.error("[house-call alarm] failed:", e?.message)); }, SWEEP_MS);
}

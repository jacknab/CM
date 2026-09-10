/**
 * External calendar sync worker.
 *
 * Runs only on the scheduler instance (NODE_APP_INSTANCE 0 / undefined). Three
 * loops:
 *   • drainOutbox     — push appointment create/update/cancel to remote calendars
 *   • pollInbound     — incremental pull of external "busy" events (webhook fallback)
 *   • renewChannels   — keep Google events.watch push channels alive
 *
 * Outbound rows are enqueued into calendar_sync_outbox by storage.createAppointment
 * / updateAppointment / cancel paths. See migration 0168_calendar_sync.sql.
 */

import crypto from "crypto";
import { pool } from "../db";
import { IS_SCHEDULER_INSTANCE } from "../lib/clusterInfo";
import { decryptToken } from "../lib/googleTokenCrypto";
import * as gcal from "../lib/calendar/googleCalendar";
import type { CalendarEventInput } from "../lib/calendar/googleCalendar";

const OUTBOX_TICK_MS = 15_000;
const INBOUND_TICK_MS = 5 * 60_000;
const RENEW_TICK_MS = 30 * 60_000;
const OUTBOX_BATCH = 20;
const MAX_ATTEMPTS = 6;

let started = false;

// ── connection row shape shared with the Google adapter ────────────────────
type ConnRow = {
  id: number;
  store_id: number;
  staff_id: number | null;
  provider: string;
  sync_direction: string;
  show_client_names: boolean;
  target_calendar_id: string;
  sync_token: string | null;
  channel_id: string | null;
  channel_resource_id: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: Date | null;
  status: string;
};

const CONN_COLS = `id, store_id, staff_id, provider, sync_direction, show_client_names,
  target_calendar_id, sync_token, channel_id, channel_resource_id,
  access_token_enc, refresh_token_enc, token_expires_at, status`;

function webhookUrl(): string {
  return (process.env.APP_URL ?? "https://certxa.com").replace(/\/$/, "") + "/api/calendar-sync/webhook/google";
}

function isAuthError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  const code = err?.code ?? err?.response?.status;
  return code === 401 || /invalid_grant|invalid_token|unauthorized|Token has been expired or revoked/i.test(msg);
}

async function markConnError(connId: number, err: any): Promise<void> {
  const reauth = isAuthError(err);
  await pool.query(
    `UPDATE calendar_connections
        SET status = CASE WHEN $2 THEN 'reauth_required' ELSE status END,
            last_error = $3, last_error_at = now(), updated_at = now()
      WHERE id = $1`,
    [connId, reauth, String(err?.message ?? err).slice(0, 500)],
  );
}

// ── Outbound ──────────────────────────────────────────────────────────────

type ApptContext = {
  id: number;
  store_id: number;
  staff_id: number | null;
  status: string;
  date: Date;
  duration: number;
  notes: string | null;
  service_name: string | null;
  client_first: string | null;
  client_last: string | null;
  tz: string;
  loc_name: string | null;
  loc_address: string | null;
};

async function loadApptContext(appointmentId: number): Promise<ApptContext | null> {
  const r = await pool.query<ApptContext>(
    `SELECT a.id, a.store_id, a.staff_id, a.status, a.date, a.duration, a.notes,
            svc.name  AS service_name,
            cl.first_name AS client_first,
            cl.last_name  AS client_last,
            COALESCE(loc.timezone, 'UTC') AS tz,
            loc.name    AS loc_name,
            loc.address AS loc_address
       FROM appointments a
       LEFT JOIN services  svc ON svc.id = a.service_id
       LEFT JOIN clients   cl  ON cl.id  = a.customer_id
       LEFT JOIN locations loc ON loc.id = a.store_id
      WHERE a.id = $1`,
    [appointmentId],
  );
  return r.rows[0] ?? null;
}

function buildEventInput(appt: ApptContext, showClientNames: boolean): CalendarEventInput {
  const start = new Date(appt.date);
  const end = new Date(start.getTime() + (appt.duration || 60) * 60_000);
  const client = [appt.client_first, appt.client_last].filter(Boolean).join(" ").trim();
  const svc = appt.service_name ?? "Appointment";
  const summary = showClientNames ? (client ? `${svc} — ${client}` : svc) : "Busy (Certxa)";
  const descParts = [
    showClientNames && client ? `Client: ${client}` : null,
    `Service: ${svc}`,
    appt.notes ? `Notes: ${appt.notes}` : null,
    `Booked in Certxa · appointment #${appt.id}`,
  ].filter(Boolean);
  return {
    appointmentId: appt.id,
    summary,
    description: descParts.join("\n"),
    location: appt.loc_address ?? appt.loc_name ?? undefined,
    start,
    end,
    timeZone: appt.tz || "UTC",
    status: appt.status === "cancelled" || appt.status === "no-show" ? "cancelled" : "confirmed",
  };
}

function hashInput(input: CalendarEventInput): string {
  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify([
        input.summary,
        input.description,
        input.location,
        input.start.toISOString(),
        input.end.toISOString(),
        input.timeZone,
        input.status,
      ]),
    )
    .digest("hex");
}

async function connectionsForAppt(storeId: number, staffId: number | null): Promise<ConnRow[]> {
  const r = await pool.query<ConnRow>(
    `SELECT ${CONN_COLS} FROM calendar_connections
      WHERE store_id = $1
        AND provider = 'google'
        AND status = 'active'
        AND sync_direction IN ('both', 'outbound')
        AND (staff_id IS NULL OR staff_id = $2)`,
    [storeId, staffId],
  );
  return r.rows;
}

async function processOutboxRow(row: {
  id: number;
  appointment_id: number | null;
  external_refs: { connectionId: number; externalEventId: string }[] | null;
  op: string;
  attempts: number;
}): Promise<void> {
  // ── delete: use the (connectionId, externalEventId) pairs captured at enqueue
  //    time; the appointment + its mappings are already gone.
  if (row.op === "delete") {
    for (const ref of row.external_refs ?? []) {
      const connR = await pool.query<ConnRow>(`SELECT ${CONN_COLS} FROM calendar_connections WHERE id = $1`, [ref.connectionId]);
      const conn = connR.rows[0];
      if (!conn || conn.status !== "active") continue;
      try {
        await gcal.deleteEvent(conn as any, ref.externalEventId);
      } catch (err) {
        if (isAuthError(err)) await markConnError(conn.id, err);
        else throw err;
      }
    }
    return;
  }

  // ── upsert
  const appt = row.appointment_id ? await loadApptContext(row.appointment_id) : null;
  if (!appt) return; // appointment removed before we got here — a delete row (if any) handles cleanup

  const mappings = await pool.query<{ connection_id: number; external_event_id: string; last_pushed_hash: string | null }>(
    `SELECT connection_id, external_event_id, last_pushed_hash
       FROM appointment_external_events WHERE appointment_id = $1`,
    [appt.id],
  );
  const mapByConn = new Map(mappings.rows.map((m) => [m.connection_id, m]));

  // A cancelled/no-show appointment that still exists: push event status
  // 'cancelled' (keeps the row visible-but-struck in the remote calendar).
  const conns = await connectionsForAppt(appt.store_id, appt.staff_id);
  for (const conn of conns) {
    const input = buildEventInput(appt, conn.show_client_names);
    const hash = hashInput(input);
    const existing = mapByConn.get(conn.id);
    if (existing && existing.last_pushed_hash === hash) continue; // no-op / echo guard

    try {
      const result = await gcal.upsertEvent(conn as any, input, existing?.external_event_id ?? null);
      await pool.query(
        `INSERT INTO appointment_external_events
           (appointment_id, connection_id, external_event_id, etag, last_pushed_hash, last_pushed_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (appointment_id, connection_id)
         DO UPDATE SET external_event_id = EXCLUDED.external_event_id,
                       etag = EXCLUDED.etag,
                       last_pushed_hash = EXCLUDED.last_pushed_hash,
                       last_pushed_at = now()`,
        [appt.id, conn.id, result.externalEventId, result.etag, hash],
      );
    } catch (err) {
      if (isAuthError(err)) {
        await markConnError(conn.id, err);
        continue; // other connections may still succeed
      }
      throw err;
    }
  }
}

async function drainOutbox(): Promise<void> {
  const batch = await pool.query<{
    id: number;
    appointment_id: number | null;
    external_refs: { connectionId: number; externalEventId: string }[] | null;
    op: string;
    attempts: number;
  }>(
    `SELECT id, appointment_id, external_refs, op, attempts
       FROM calendar_sync_outbox
      WHERE processed_at IS NULL AND next_attempt_at <= now()
      ORDER BY id
      LIMIT ${OUTBOX_BATCH}`,
  );
  if (!batch.rows.length) return;

  for (const row of batch.rows) {
    try {
      await processOutboxRow(row);
      await pool.query(`UPDATE calendar_sync_outbox SET processed_at = now(), last_error = NULL WHERE id = $1`, [row.id]);
    } catch (err: any) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      const backoffMs = Math.min(60 * 60_000, 2 ** attempts * 30_000);
      await pool.query(
        `UPDATE calendar_sync_outbox
            SET attempts = $2,
                next_attempt_at = now() + ($3 || ' milliseconds')::interval,
                last_error = $4,
                processed_at = CASE WHEN $5 THEN now() ELSE NULL END
          WHERE id = $1`,
        [row.id, attempts, String(backoffMs), String(err?.message ?? err).slice(0, 500), giveUp],
      );
      console.error(
        `[calendar-sync] outbox row ${row.id} (appt ${row.appointment_id}) failed` +
          ` attempt ${attempts}${giveUp ? " — GIVING UP" : ""}:`,
        err?.message ?? err,
      );
    }
  }
}

// ── Inbound ───────────────────────────────────────────────────────────────

export async function runInboundSync(connectionId: number): Promise<void> {
  const r = await pool.query<ConnRow>(`SELECT ${CONN_COLS} FROM calendar_connections WHERE id = $1`, [connectionId]);
  const conn = r.rows[0];
  if (!conn || conn.status !== "active") return;
  if (!["both", "inbound"].includes(conn.sync_direction)) return;
  if (conn.provider !== "google") return;
  if (!decryptToken(conn.refresh_token_enc) && !decryptToken(conn.access_token_enc)) return;

  try {
    let { changes, nextSyncToken, expired } = await gcal.listChanges(conn as any, conn.sync_token);
    if (expired) {
      await pool.query(`UPDATE calendar_connections SET sync_token = NULL WHERE id = $1`, [conn.id]);
      ({ changes, nextSyncToken } = await gcal.listChanges(conn as any, null));
    }

    for (const ch of changes) {
      // Skip events Certxa itself authored — prevents an echo loop.
      if (ch.certxaApptId != null) continue;

      if (ch.status === "cancelled" || !ch.start || !ch.end) {
        await pool.query(
          `DELETE FROM external_busy_blocks WHERE connection_id = $1 AND external_event_id = $2`,
          [conn.id, ch.externalEventId],
        );
        continue;
      }

      await pool.query(
        `INSERT INTO external_busy_blocks
           (connection_id, staff_id, store_id, external_event_id, etag, title, starts_at, ends_at, all_day, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (connection_id, external_event_id)
         DO UPDATE SET etag = EXCLUDED.etag, title = EXCLUDED.title,
                       starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
                       all_day = EXCLUDED.all_day, status = EXCLUDED.status, updated_at = now()`,
        [
          conn.id,
          conn.staff_id,
          conn.store_id,
          ch.externalEventId,
          ch.etag,
          conn.show_client_names ? ch.summary : null,
          ch.start,
          ch.end,
          ch.allDay,
          ch.status,
        ],
      );
    }

    await pool.query(
      `UPDATE calendar_connections SET sync_token = $2, last_synced_at = now(), last_error = NULL WHERE id = $1`,
      [conn.id, nextSyncToken],
    );
  } catch (err: any) {
    await markConnError(conn.id, err);
    console.error(`[calendar-sync] inbound sync failed (conn ${conn.id}):`, err?.message ?? err);
  }
}

async function pollInbound(): Promise<void> {
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM calendar_connections
      WHERE provider = 'google' AND status = 'active' AND sync_direction IN ('both','inbound')`,
  );
  for (const row of r.rows) await runInboundSync(row.id);
}

// ── Push-channel renewal ──────────────────────────────────────────────────

async function renewChannels(): Promise<void> {
  const r = await pool.query<ConnRow>(
    `SELECT ${CONN_COLS} FROM calendar_connections
      WHERE provider = 'google' AND status = 'active' AND sync_direction IN ('both','inbound')
        AND (channel_id IS NULL OR channel_expires_at IS NULL OR channel_expires_at < now() + interval '1 day')`,
  );
  for (const conn of r.rows) {
    try {
      if (conn.channel_id && conn.channel_resource_id) {
        await gcal.stopChannel(conn as any, conn.channel_id, conn.channel_resource_id);
      }
      const ch = await gcal.watchCalendar(conn as any, webhookUrl());
      await pool.query(
        `UPDATE calendar_connections
            SET channel_id = $2, channel_resource_id = $3, channel_expires_at = $4, updated_at = now()
          WHERE id = $1`,
        [conn.id, ch.channelId, ch.resourceId, ch.expiration],
      );
    } catch (err: any) {
      if (isAuthError(err)) await markConnError(conn.id, err);
      else console.error(`[calendar-sync] channel renew failed (conn ${conn.id}):`, err?.message ?? err);
    }
  }
}

// ── lifecycle ─────────────────────────────────────────────────────────────

function safeInterval(fn: () => Promise<void>, ms: number, label: string): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err: any) {
      console.error(`[calendar-sync] ${label} tick error:`, err?.message ?? err);
    } finally {
      running = false;
    }
  };
  setInterval(tick, ms).unref();
}

export function startCalendarSyncWorker(): void {
  if (started) return;
  if (!IS_SCHEDULER_INSTANCE) return;
  if (!(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)) {
    console.log("[calendar-sync] no Google OAuth client configured — worker not started");
    return;
  }
  started = true;
  console.log("[calendar-sync] worker started (outbox 15s / inbound 5m / renew 30m)");
  safeInterval(drainOutbox, OUTBOX_TICK_MS, "outbox");
  safeInterval(pollInbound, INBOUND_TICK_MS, "inbound");
  safeInterval(renewChannels, RENEW_TICK_MS, "renew");
}

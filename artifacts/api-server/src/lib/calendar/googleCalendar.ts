/**
 * Google Calendar provider adapter for two-way external calendar sync.
 *
 * Reuses the platform Google OAuth client credentials (GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET) with a dedicated callback URL and the Calendar scope.
 * OAuth tokens are stored AES-256-GCM encrypted (lib/googleTokenCrypto.ts) on
 * calendar_connections.{access_token_enc,refresh_token_enc}.
 *
 * Adding the calendar scope to the platform OAuth consent screen puts the app
 * into Google's restricted-scope program (annual CASA security assessment).
 * Until that clears, keep this behind a feature flag / test users.
 */

import { google, type calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../../db";
import { encryptToken, decryptToken } from "../googleTokenCrypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
];

/** Private extended-property key stamped on every Certxa-authored remote event. */
export const CERTXA_APPT_PROP = "certxaApptId";

export interface CalendarEventInput {
  /** Certxa appointment id — stamped into extendedProperties.private.certxaApptId */
  appointmentId: number;
  summary: string;
  description?: string;
  location?: string;
  /** UTC instant */
  start: Date;
  /** UTC instant */
  end: Date;
  /** IANA tz of the salon, e.g. "America/Los_Angeles" */
  timeZone: string;
  /** 'confirmed' | 'tentative' | 'cancelled' */
  status?: string;
}

export interface UpsertResult {
  externalEventId: string;
  etag: string | null;
}

function callbackUrl(): string {
  return (
    process.env.GOOGLE_CALENDAR_CALLBACK_URL ??
    `${(process.env.APP_URL ?? "https://certxa.com").replace(/\/$/, "")}/api/calendar-sync/google/callback`
  );
}

export function makeOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
    callbackUrl(),
  );
}

/** Build the consent URL. `state` round-trips our connection intent (staffId etc). */
export function getAuthUrl(state: string): string {
  return makeOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    scope: GOOGLE_CALENDAR_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number | null;
  scope: string | null;
  email: string | null;
}> {
  const client = makeOAuthClient();
  const { tokens } = await client.getToken(code);
  let email: string | null = null;
  try {
    if (tokens.id_token) {
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token });
      email = ticket.getPayload()?.email ?? null;
    }
  } catch {
    /* non-fatal — email is a nice-to-have label */
  }
  return {
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    scope: tokens.scope ?? null,
    email,
  };
}

type ConnRow = {
  id: number;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: Date | null;
  target_calendar_id: string;
};

/**
 * Authenticated OAuth2 client for a connection. Registers a tokens listener so a
 * silently-refreshed access token is persisted back (encrypted) to the row.
 */
function authedClient(conn: ConnRow): OAuth2Client {
  const client = makeOAuthClient();
  client.setCredentials({
    access_token: decryptToken(conn.access_token_enc) ?? undefined,
    refresh_token: decryptToken(conn.refresh_token_enc) ?? undefined,
    expiry_date: conn.token_expires_at ? conn.token_expires_at.getTime() : undefined,
  });
  client.on("tokens", (t) => {
    void persistRefreshedTokens(conn.id, t);
  });
  return client;
}

async function persistRefreshedTokens(
  connectionId: number,
  t: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
): Promise<void> {
  try {
    await pool.query(
      `UPDATE calendar_connections
          SET access_token_enc  = COALESCE($2, access_token_enc),
              refresh_token_enc  = COALESCE($3, refresh_token_enc),
              token_expires_at   = COALESCE($4, token_expires_at),
              status             = 'active',
              updated_at         = now()
        WHERE id = $1`,
      [
        connectionId,
        t.access_token ? encryptToken(t.access_token) : null,
        t.refresh_token ? encryptToken(t.refresh_token) : null,
        t.expiry_date ? new Date(t.expiry_date) : null,
      ],
    );
  } catch (err: any) {
    console.error(`[calendar-sync] persist refreshed tokens failed (conn=${connectionId}):`, err?.message);
  }
}

function calendarApi(conn: ConnRow): calendar_v3.Calendar {
  return google.calendar({ version: "v3", auth: authedClient(conn) });
}

function toEventBody(input: CalendarEventInput): calendar_v3.Schema$Event {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
    status: input.status === "cancelled" ? "cancelled" : input.status === "tentative" ? "tentative" : "confirmed",
    extendedProperties: { private: { [CERTXA_APPT_PROP]: String(input.appointmentId) } },
    // Certxa is the source of truth for these events; don't let Google email guests.
    reminders: { useDefault: true },
  };
}

/** Insert (no existingEventId) or patch (existingEventId) a remote event. */
export async function upsertEvent(
  conn: ConnRow,
  input: CalendarEventInput,
  existingEventId: string | null,
): Promise<UpsertResult> {
  const api = calendarApi(conn);
  const calendarId = conn.target_calendar_id || "primary";
  const requestBody = toEventBody(input);

  if (existingEventId) {
    const res = await api.events.patch({
      calendarId,
      eventId: existingEventId,
      requestBody,
      sendUpdates: "none",
    });
    return { externalEventId: res.data.id ?? existingEventId, etag: res.data.etag ?? null };
  }

  const res = await api.events.insert({ calendarId, requestBody, sendUpdates: "none" });
  return { externalEventId: res.data.id!, etag: res.data.etag ?? null };
}

export async function deleteEvent(conn: ConnRow, eventId: string): Promise<void> {
  const api = calendarApi(conn);
  try {
    await api.events.delete({
      calendarId: conn.target_calendar_id || "primary",
      eventId,
      sendUpdates: "none",
    });
  } catch (err: any) {
    // 404/410 — already gone. Treat as success.
    const code = err?.code ?? err?.response?.status;
    if (code === 404 || code === 410) return;
    throw err;
  }
}

export interface RemoteChange {
  externalEventId: string;
  etag: string | null;
  status: string; // 'confirmed' | 'tentative' | 'cancelled'
  summary: string | null;
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  /** the certxaApptId extended prop, if this event was authored by Certxa */
  certxaApptId: number | null;
}

/**
 * Incremental pull. Pass the stored syncToken (null on first run — full sync of a
 * bounded window). Returns changes + the next syncToken to persist.
 * On a 410 GONE the caller must clear the stored syncToken and re-run full.
 */
export async function listChanges(
  conn: ConnRow,
  syncToken: string | null,
): Promise<{ changes: RemoteChange[]; nextSyncToken: string | null; expired: boolean }> {
  const api = calendarApi(conn);
  const calendarId = conn.target_calendar_id || "primary";
  const changes: RemoteChange[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  try {
    do {
      const res: any = await api.events.list({
        calendarId,
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken,
        ...(syncToken
          ? { syncToken }
          : {
              // First sync: bound to a sane window so we don't import years of history.
              timeMin: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
              timeMax: new Date(Date.now() + 90 * 24 * 3600_000).toISOString(),
            }),
      });

      for (const ev of res.data.items ?? []) {
        const apptProp = ev.extendedProperties?.private?.[CERTXA_APPT_PROP];
        const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
        changes.push({
          externalEventId: ev.id!,
          etag: ev.etag ?? null,
          status: ev.status ?? "confirmed",
          summary: ev.summary ?? null,
          start: ev.start?.dateTime ? new Date(ev.start.dateTime) : ev.start?.date ? new Date(ev.start.date) : null,
          end: ev.end?.dateTime ? new Date(ev.end.dateTime) : ev.end?.date ? new Date(ev.end.date) : null,
          allDay,
          certxaApptId: apptProp ? Number(apptProp) : null,
        });
      }

      pageToken = res.data.nextPageToken ?? undefined;
      if (res.data.nextSyncToken) nextSyncToken = res.data.nextSyncToken;
    } while (pageToken);

    return { changes, nextSyncToken, expired: false };
  } catch (err: any) {
    const code = err?.code ?? err?.response?.status;
    if (code === 410) return { changes: [], nextSyncToken: null, expired: true };
    throw err;
  }
}

/** Register a push channel (events.watch). Returns channel bookkeeping to persist. */
export async function watchCalendar(
  conn: ConnRow,
  webhookUrl: string,
): Promise<{ channelId: string; resourceId: string | null; expiration: Date | null }> {
  const api = calendarApi(conn);
  const channelId = `certxa-cal-${conn.id}-${Date.now()}`;
  const res = await api.events.watch({
    calendarId: conn.target_calendar_id || "primary",
    requestBody: { id: channelId, type: "web_hook", address: webhookUrl },
  });
  return {
    channelId,
    resourceId: res.data.resourceId ?? null,
    expiration: res.data.expiration ? new Date(Number(res.data.expiration)) : null,
  };
}

export async function stopChannel(conn: ConnRow, channelId: string, resourceId: string): Promise<void> {
  try {
    await calendarApi(conn).channels.stop({ requestBody: { id: channelId, resourceId } });
  } catch (err: any) {
    console.warn(`[calendar-sync] stopChannel failed (${channelId}):`, err?.message);
  }
}

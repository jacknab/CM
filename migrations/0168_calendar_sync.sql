-- Two-way external calendar sync (Google Calendar first; Microsoft Graph / CalDAV later).
--
--   calendar_connections        — one OAuth connection per staff member (or store-level).
--                                 Owns the encrypted tokens + push-channel bookkeeping.
--   appointment_external_events  — maps a Certxa appointment to its mirrored remote event(s).
--   external_busy_blocks         — personal/external events pulled IN from a remote calendar,
--                                 used to block availability so staff aren't double-booked.
--   calendar_sync_outbox         — durable queue of appointment mutations awaiting an
--                                 outbound push. Drained by calendarSyncWorker on the
--                                 scheduler instance (NODE_APP_INSTANCE 0 / undefined).

CREATE TABLE IF NOT EXISTS calendar_connections (
  id                     serial PRIMARY KEY,
  store_id               integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id               integer REFERENCES staff(id) ON DELETE CASCADE,   -- NULL = store-level calendar
  provider               text NOT NULL DEFAULT 'google',                   -- 'google' | 'microsoft' | 'caldav'
  provider_account_email text,
  access_token_enc       text,
  refresh_token_enc      text,
  token_expires_at       timestamptz,
  scopes                 text,
  target_calendar_id     text NOT NULL DEFAULT 'primary',                  -- remote calendar events are written to
  sync_direction         text NOT NULL DEFAULT 'both',                     -- 'both' | 'outbound' | 'inbound'
  show_client_names      boolean NOT NULL DEFAULT true,                    -- false => generic "Busy" event summary
  -- Inbound incremental-sync cursor (Google syncToken / Graph deltaLink)
  sync_token             text,
  -- Google push channel (events.watch) bookkeeping
  channel_id             text,
  channel_resource_id    text,
  channel_expires_at     timestamptz,
  -- Health
  status                 text NOT NULL DEFAULT 'active',                   -- 'active' | 'reauth_required' | 'disabled' | 'error'
  last_synced_at         timestamptz,
  last_error             text,
  last_error_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_connections_store_idx ON calendar_connections (store_id);
CREATE INDEX IF NOT EXISTS calendar_connections_staff_idx ON calendar_connections (staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_connections_staff_provider_uidx
  ON calendar_connections (staff_id, provider) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS calendar_connections_channel_idx ON calendar_connections (channel_id);
CREATE INDEX IF NOT EXISTS calendar_connections_renew_idx
  ON calendar_connections (channel_expires_at) WHERE channel_expires_at IS NOT NULL;


CREATE TABLE IF NOT EXISTS appointment_external_events (
  appointment_id   integer NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  connection_id    integer NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  etag             text,
  last_pushed_hash text,                                              -- payload hash — skip no-op pushes / echo
  last_pushed_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (appointment_id, connection_id)
);

CREATE INDEX IF NOT EXISTS appointment_external_events_conn_idx
  ON appointment_external_events (connection_id, external_event_id);


CREATE TABLE IF NOT EXISTS external_busy_blocks (
  id               serial PRIMARY KEY,
  connection_id    integer NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  staff_id         integer REFERENCES staff(id) ON DELETE CASCADE,
  store_id         integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  etag             text,
  title            text,                                              -- only stored/shown if connection.show_client_names
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  all_day          boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'confirmed',                 -- 'confirmed' | 'tentative' | 'cancelled'
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS external_busy_blocks_staff_time_idx
  ON external_busy_blocks (staff_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS external_busy_blocks_store_time_idx
  ON external_busy_blocks (store_id, starts_at, ends_at);


CREATE TABLE IF NOT EXISTS calendar_sync_outbox (
  id              serial PRIMARY KEY,
  -- 'upsert' rows carry appointment_id (context is read live at drain time).
  -- 'delete' rows carry external_refs (captured at deletion, since the row and
  -- its appointment_external_events mappings are gone by drain time).
  appointment_id  integer REFERENCES appointments(id) ON DELETE SET NULL,
  external_refs   jsonb,                                             -- [{connectionId, externalEventId}] for 'delete'
  store_id        integer NOT NULL,
  staff_id        integer,
  op              text NOT NULL,                                      -- 'upsert' | 'delete'
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  processed_at    timestamptz                                        -- NULL = pending
);

CREATE INDEX IF NOT EXISTS calendar_sync_outbox_pending_idx
  ON calendar_sync_outbox (next_attempt_at) WHERE processed_at IS NULL;

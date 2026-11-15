-- Kevin: a 24/7 AI receptionist for a made-up property management company (owner, 2026-11-15; routes/kevinAgent.ts):
-- Summit Ridge Property Management, one property, Juniper Flats Apartments. His own tables, separate from Certxa's.

-- Who Kevin calls about an emergency, in escalation order (lower first): on-call technicians, then the property manager.
CREATE TABLE IF NOT EXISTS kevin_on_call (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  phone_e164  text NOT NULL,
  role        text NOT NULL DEFAULT 'on_call_technician',
  priority    integer NOT NULL DEFAULT 1,
  active      boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The tenant directory, built as tenants call. Nothing here is taken as proof of who a caller is on its own.
CREATE TABLE IF NOT EXISTS kevin_tenants (
  id                  serial PRIMARY KEY,
  name                text NOT NULL,
  phone_e164          text,
  unit                text,
  -- confirmed by the office (true) or only what a caller said (false)
  confirmed           boolean NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_call_at        timestamptz
);
CREATE INDEX IF NOT EXISTS kevin_tenants_phone ON kevin_tenants (phone_e164);

CREATE TABLE IF NOT EXISTS kevin_incidents (
  id                        serial PRIMARY KEY,
  tenant_id                 integer REFERENCES kevin_tenants(id),
  tenant_name               text,
  tenant_phone_e164         text,
  unit                      text,
  category                  text,
  description               text NOT NULL,
  -- critical: life safety or major damage now · urgent: tonight · routine: next business day
  severity                  text NOT NULL CHECK (severity IN ('critical', 'urgent', 'routine')),
  severity_reason           text,
  permission_to_enter       boolean,
  pets_on_site              text,
  summary                   text,
  -- routine_follow_up · pending_review (office message / unclear) · awaiting_acknowledgment (Kevin is calling the
  -- escalation list) · acknowledged (someone accepted it and gave an ETA) · escalation_exhausted · resolved · closed.
  -- Acknowledged is never resolved: only the office resolves or closes an incident.
  status                    text NOT NULL,
  current_on_call_id        integer REFERENCES kevin_on_call(id),
  attempts_on_current       integer NOT NULL DEFAULT 0,
  total_attempts            integer NOT NULL DEFAULT 0,
  rounds                    integer NOT NULL DEFAULT 0,
  next_attempt_at           timestamptz,
  acknowledged_at           timestamptz,
  acknowledged_by_on_call_id integer REFERENCES kevin_on_call(id),
  eta_minutes               integer,
  eta_words                 text,
  tech_notes                text,
  tenant_update_attempts    integer NOT NULL DEFAULT 0,
  next_tenant_update_at     timestamptz,
  tenant_notified_at        timestamptz,
  reported_call_sid         text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kevin_incidents_attempt_due ON kevin_incidents (next_attempt_at) WHERE next_attempt_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS kevin_incidents_update_due ON kevin_incidents (next_tenant_update_at) WHERE next_tenant_update_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS kevin_incidents_tenant ON kevin_incidents (tenant_phone_e164, created_at DESC);

-- Every call Kevin is on: tenants and other callers calling in, his escalation calls, his call-backs with the ETA.
CREATE TABLE IF NOT EXISTS kevin_calls (
  id                serial PRIMARY KEY,
  call_sid          text UNIQUE,
  purpose           text NOT NULL,           -- inbound · escalation · tenant_update
  caller_role       text,                    -- tenant · owner · vendor · prospect · other (inbound)
  incident_id       integer REFERENCES kevin_incidents(id),
  on_call_id        integer REFERENCES kevin_on_call(id),
  tenant_id         integer REFERENCES kevin_tenants(id),
  phone_e164        text,
  answered_by       text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  duration_seconds  integer,
  -- escalation: no_answer · busy · failed · voicemail · declined · acknowledged · ended_unconfirmed
  outcome           text,
  transcript        jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS kevin_calls_incident ON kevin_calls (incident_id);

-- Messages for the office from owners, vendors, prospective tenants and anyone else who isn't reporting maintenance.
CREATE TABLE IF NOT EXISTS kevin_messages (
  id            serial PRIMARY KEY,
  caller_role   text NOT NULL,
  caller_name   text,
  phone_e164    text,
  company       text,
  about         text,
  message       text NOT NULL,
  call_sid      text,
  status        text NOT NULL DEFAULT 'new',
  created_at    timestamptz NOT NULL DEFAULT now()
);

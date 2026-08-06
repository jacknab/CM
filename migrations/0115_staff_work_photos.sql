-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0115: Staff Work Photos + Client Photo Permissions
-- ─────────────────────────────────────────────────────────────────────────────

-- Photo records created by staff after completing a service.
-- Goes directly to the GBP photo engine queue — no owner approval step.
CREATE TABLE IF NOT EXISTS staff_work_photos (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES locations(id),
  staff_id          INTEGER NOT NULL REFERENCES staff(id),
  appointment_id    INTEGER REFERENCES appointments(id),
  service_id        INTEGER REFERENCES services(id),
  client_id         INTEGER,                   -- soft ref to clients(id) — nullable (walk-ins, display shots)
  image_url         TEXT NOT NULL,
  image_r2_key      TEXT,
  ai_description    TEXT,
  ai_tags           TEXT[],
  staff_caption     TEXT,                      -- optional note from the technician
  gbp_queued        BOOLEAN NOT NULL DEFAULT FALSE,
  gbp_queue_id      INTEGER REFERENCES gbp_photo_queue(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS swp_store_id_idx       ON staff_work_photos (store_id);
CREATE INDEX IF NOT EXISTS swp_staff_id_idx       ON staff_work_photos (staff_id);
CREATE INDEX IF NOT EXISTS swp_appointment_id_idx ON staff_work_photos (appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS swp_service_id_idx     ON staff_work_photos (service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS swp_created_at_idx     ON staff_work_photos (created_at DESC);

-- Per-client photo usage consent (opt-out model).
-- No record means GBP is allowed by default unless explicitly revoked.
CREATE TABLE IF NOT EXISTS client_photo_permissions (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL,
  client_id         INTEGER NOT NULL,
  gbp_allowed       BOOLEAN NOT NULL DEFAULT TRUE,
  website_allowed   BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_allowed BOOLEAN NOT NULL DEFAULT FALSE,  -- requires explicit opt-in
  consent_method    TEXT,                             -- 'staff_portal' | 'owner_manual' | 'kiosk'
  consented_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, client_id)
);

CREATE INDEX IF NOT EXISTS cpp_store_client_idx ON client_photo_permissions (store_id, client_id);

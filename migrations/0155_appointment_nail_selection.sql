-- 0155_appointment_nail_selection.sql
--
-- Booking-time capture of the client's nail configuration. One row per
-- appointment whose service is a fake-nail service. Every value is SNAPSHOTTED
-- at booking time so a receipt never changes when the salon edits its config
-- later. FKs to the vocab rows are provenance only (ON DELETE SET NULL); the
-- *_snapshot columns are the source of truth.
--
-- Mirrors the pgTable definition in shared/schema.ts.

CREATE TABLE IF NOT EXISTS appointment_nail_selection (
  id                            SERIAL PRIMARY KEY,
  appointment_id                INTEGER       NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  store_id                      INTEGER       NOT NULL REFERENCES locations(id)    ON DELETE CASCADE,
  base_price_snapshot           NUMERIC(10,2) NOT NULL,

  nail_size_id                  INTEGER       REFERENCES nail_sizes(id) ON DELETE SET NULL,
  length_name_snapshot          TEXT,
  length_price_adj_snapshot     NUMERIC(10,2) NOT NULL DEFAULT 0,
  length_duration_adj_snapshot  INTEGER       NOT NULL DEFAULT 0,

  nail_shape_id                 INTEGER       REFERENCES nail_shapes(id) ON DELETE SET NULL,
  shape_name_snapshot           TEXT,
  shape_price_adj_snapshot      NUMERIC(10,2) NOT NULL DEFAULT 0,
  shape_duration_adj_snapshot   INTEGER       NOT NULL DEFAULT 0,

  nail_art_application_id       INTEGER       REFERENCES nail_art_applications(id) ON DELETE SET NULL,
  nail_art_effect_id           INTEGER       REFERENCES nail_art_effects(id)     ON DELETE SET NULL,
  art_application_name_snapshot TEXT,
  art_effect_name_snapshot      TEXT,
  art_price_adj_snapshot        NUMERIC(10,2) NOT NULL DEFAULT 0,
  art_duration_adj_snapshot     INTEGER       NOT NULL DEFAULT 0,
  art_is_custom_quote           BOOLEAN       NOT NULL DEFAULT FALSE,

  total_price_snapshot          NUMERIC(10,2) NOT NULL,
  created_at                    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT appointment_nail_selection_appointment_id_key UNIQUE (appointment_id)
);
CREATE INDEX IF NOT EXISTS appointment_nail_selection_store_id_idx ON appointment_nail_selection (store_id);

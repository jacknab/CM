-- 0154_nail_configuration.sql
--
-- Nail Configuration — store-owned length / shape / art configuration for
-- fake-nail services (Acrylic / Hard Gel / Dip-with-tips / Gel-X full sets & fills).
--
-- Adds:
--   • 4 vocabulary tables   nail_sizes, nail_shapes, nail_art_applications, nail_art_effects
--   • 1 per-service gate     nail_service_configs   (1 row per fake-nail service)
--   • 4 service→vocab links  service_nail_sizes, service_nail_shapes,
--                            service_nail_art_applications, service_nail_art_effects
--
-- Pricing lives ONLY on the junction rows, as a signed NUMERIC(10,2) delta vs
-- services.price. Nail-art price = application delta + effect delta. Combination
-- totals are never stored. The existing addons / service_addons /
-- appointment_addons / service_options system is NOT modified by this migration.
--
-- Mirrors the pgTable definitions in shared/schema.ts (drizzle-kit push also
-- manages these tables — none of them belong in the drizzle.config tablesFilter).

-- ── Vocabularies (store-owned) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nail_sizes (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER     NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code        TEXT,
  name        TEXT        NOT NULL,
  description TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nail_sizes_store_id_name_key UNIQUE (store_id, name),
  CONSTRAINT nail_sizes_store_id_code_key UNIQUE (store_id, code)
);
CREATE INDEX IF NOT EXISTS nail_sizes_store_id_idx ON nail_sizes (store_id);

CREATE TABLE IF NOT EXISTS nail_shapes (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER     NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code        TEXT,
  name        TEXT        NOT NULL,
  description TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nail_shapes_store_id_name_key UNIQUE (store_id, name),
  CONSTRAINT nail_shapes_store_id_code_key UNIQUE (store_id, code)
);
CREATE INDEX IF NOT EXISTS nail_shapes_store_id_idx ON nail_shapes (store_id);

CREATE TABLE IF NOT EXISTS nail_art_applications (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER     NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code        TEXT,
  name        TEXT        NOT NULL,
  description TEXT,
  is_quote    BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nail_art_applications_store_id_name_key UNIQUE (store_id, name),
  CONSTRAINT nail_art_applications_store_id_code_key UNIQUE (store_id, code)
);
CREATE INDEX IF NOT EXISTS nail_art_applications_store_id_idx ON nail_art_applications (store_id);

CREATE TABLE IF NOT EXISTS nail_art_effects (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER     NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code        TEXT,
  name        TEXT        NOT NULL,
  description TEXT,
  image_url   TEXT,
  swatch_hex  TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nail_art_effects_store_id_name_key UNIQUE (store_id, name),
  CONSTRAINT nail_art_effects_store_id_code_key UNIQUE (store_id, code)
);
CREATE INDEX IF NOT EXISTS nail_art_effects_store_id_idx ON nail_art_effects (store_id);

-- ── Per-service gate ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nail_service_configs (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER     NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  service_id      INTEGER     NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  is_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  length_required BOOLEAN     NOT NULL DEFAULT TRUE,
  shape_required  BOOLEAN     NOT NULL DEFAULT TRUE,
  art_required    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nail_service_configs_service_id_key UNIQUE (service_id)
);
CREATE INDEX IF NOT EXISTS nail_service_configs_store_id_idx ON nail_service_configs (store_id);

-- ── Service → vocabulary junctions (pricing lives here) ────────────────────

CREATE TABLE IF NOT EXISTS service_nail_sizes (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER       NOT NULL REFERENCES locations(id)  ON DELETE CASCADE,
  service_id          INTEGER       NOT NULL REFERENCES services(id)   ON DELETE CASCADE,
  nail_size_id        INTEGER       NOT NULL REFERENCES nail_sizes(id) ON DELETE RESTRICT,
  price_adjustment    NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_adjustment INTEGER       NOT NULL DEFAULT 0,
  is_default          BOOLEAN       NOT NULL DEFAULT FALSE,
  is_enabled          BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order          INTEGER       NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT service_nail_sizes_service_id_nail_size_id_key UNIQUE (service_id, nail_size_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS service_nail_sizes_one_default_idx
  ON service_nail_sizes (service_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS service_nail_sizes_service_id_idx   ON service_nail_sizes (service_id);
CREATE INDEX IF NOT EXISTS service_nail_sizes_store_id_idx     ON service_nail_sizes (store_id);
CREATE INDEX IF NOT EXISTS service_nail_sizes_nail_size_id_idx ON service_nail_sizes (nail_size_id);

CREATE TABLE IF NOT EXISTS service_nail_shapes (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER       NOT NULL REFERENCES locations(id)   ON DELETE CASCADE,
  service_id          INTEGER       NOT NULL REFERENCES services(id)    ON DELETE CASCADE,
  nail_shape_id       INTEGER       NOT NULL REFERENCES nail_shapes(id) ON DELETE RESTRICT,
  price_adjustment    NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_adjustment INTEGER       NOT NULL DEFAULT 0,
  is_default          BOOLEAN       NOT NULL DEFAULT FALSE,
  is_enabled          BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order          INTEGER       NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT service_nail_shapes_service_id_nail_shape_id_key UNIQUE (service_id, nail_shape_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS service_nail_shapes_one_default_idx
  ON service_nail_shapes (service_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS service_nail_shapes_service_id_idx    ON service_nail_shapes (service_id);
CREATE INDEX IF NOT EXISTS service_nail_shapes_store_id_idx      ON service_nail_shapes (store_id);
CREATE INDEX IF NOT EXISTS service_nail_shapes_nail_shape_id_idx ON service_nail_shapes (nail_shape_id);

CREATE TABLE IF NOT EXISTS service_nail_art_applications (
  id                     SERIAL PRIMARY KEY,
  store_id               INTEGER       NOT NULL REFERENCES locations(id)             ON DELETE CASCADE,
  service_id             INTEGER       NOT NULL REFERENCES services(id)              ON DELETE CASCADE,
  nail_art_application_id INTEGER      NOT NULL REFERENCES nail_art_applications(id) ON DELETE RESTRICT,
  price_adjustment       NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_adjustment    INTEGER       NOT NULL DEFAULT 0,
  is_enabled             BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order             INTEGER       NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT service_nail_art_applications_svc_app_key UNIQUE (service_id, nail_art_application_id)
);
CREATE INDEX IF NOT EXISTS service_nail_art_applications_service_id_idx ON service_nail_art_applications (service_id);
CREATE INDEX IF NOT EXISTS service_nail_art_applications_store_id_idx   ON service_nail_art_applications (store_id);
CREATE INDEX IF NOT EXISTS service_nail_art_applications_app_id_idx     ON service_nail_art_applications (nail_art_application_id);

CREATE TABLE IF NOT EXISTS service_nail_art_effects (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER       NOT NULL REFERENCES locations(id)        ON DELETE CASCADE,
  service_id          INTEGER       NOT NULL REFERENCES services(id)         ON DELETE CASCADE,
  nail_art_effect_id  INTEGER       NOT NULL REFERENCES nail_art_effects(id) ON DELETE RESTRICT,
  price_adjustment    NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_adjustment INTEGER       NOT NULL DEFAULT 0,
  is_enabled          BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order          INTEGER       NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT service_nail_art_effects_svc_effect_key UNIQUE (service_id, nail_art_effect_id)
);
CREATE INDEX IF NOT EXISTS service_nail_art_effects_service_id_idx ON service_nail_art_effects (service_id);
CREATE INDEX IF NOT EXISTS service_nail_art_effects_store_id_idx   ON service_nail_art_effects (store_id);
CREATE INDEX IF NOT EXISTS service_nail_art_effects_effect_id_idx  ON service_nail_art_effects (nail_art_effect_id);

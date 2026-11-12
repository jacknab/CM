-- PROPOSED rev 2 (Last Cut Formula Engine) - NOT APPLIED. Renumber at implementation. Requires 0352.
-- The hairstyle library: Certxa's global catalog (store_id IS NULL) plus each store's private styles.
-- No customer data lives here. Runner safety: idempotent statements, no semicolons inside quoted text.

DO $$
BEGIN
  IF to_regclass('public.locations') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'LCF 0353: prerequisite table missing (locations, users)';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS hairstyle_categories (
  id             serial PRIMARY KEY,
  slug           text NOT NULL,
  name           text NOT NULL,
  description    text,
  display_order  integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hairstyle_categories_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX IF NOT EXISTS hairstyle_categories_slug_uidx ON hairstyle_categories (slug);

CREATE TABLE IF NOT EXISTS hairstyle_templates (
  id                  serial PRIMARY KEY,
  store_id            integer REFERENCES locations(id) ON DELETE CASCADE,   -- NULL = Certxa global template
  -- 0 for a global template, else the owning store. Lets formulas reference (template_id, scope) with a real foreign
  -- key: a formula may use a global (scope 0) or its own store's template (scope = its store_id), nothing else.
  scope_key           integer GENERATED ALWAYS AS (coalesce(store_id, 0)) STORED,
  category_id         integer NOT NULL REFERENCES hairstyle_categories(id) ON DELETE RESTRICT,
  slug                text NOT NULL,
  name                text NOT NULL,
  description         text,
  aliases             text[] NOT NULL DEFAULT '{}',
  default_spec        jsonb NOT NULL DEFAULT '{"v":1}'::jsonb,
  spec_version        smallint NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'draft',
  is_active           boolean NOT NULL DEFAULT true,
  created_by_user_id  varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hairstyle_templates_store_not_zero CHECK (store_id IS NULL OR store_id > 0),
  CONSTRAINT hairstyle_templates_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT hairstyle_templates_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT hairstyle_templates_spec_object CHECK (jsonb_typeof(default_spec) = 'object' AND jsonb_typeof(default_spec -> 'v') = 'number'),
  CONSTRAINT hairstyle_templates_spec_size CHECK (pg_column_size(default_spec) < 32768),
  CONSTRAINT hairstyle_templates_aliases_max CHECK (cardinality(aliases) <= 30)
);
CREATE UNIQUE INDEX IF NOT EXISTS hairstyle_templates_global_slug_uidx ON hairstyle_templates (slug) WHERE store_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hairstyle_templates_store_slug_uidx ON hairstyle_templates (store_id, slug) WHERE store_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hairstyle_templates_global_name_uidx ON hairstyle_templates (lower(name)) WHERE store_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hairstyle_templates_store_name_uidx ON hairstyle_templates (store_id, lower(name)) WHERE store_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hairstyle_templates_id_scope_uidx ON hairstyle_templates (id, scope_key);
CREATE INDEX IF NOT EXISTS hairstyle_templates_category_idx ON hairstyle_templates (category_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS hairstyle_templates_store_idx ON hairstyle_templates (store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hairstyle_templates_name_trgm_idx ON hairstyle_templates USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hairstyle_templates_aliases_gin_idx ON hairstyle_templates USING gin (aliases);

-- A template never changes owner: a global can't become a store's, a store's can't become global or move stores.
CREATE OR REPLACE FUNCTION hairstyle_templates_owner_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'A hairstyle template cannot change owner (template %)', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER hairstyle_templates_owner_guard_trg
  BEFORE UPDATE OF store_id ON hairstyle_templates
  FOR EACH ROW EXECUTE FUNCTION hairstyle_templates_owner_guard();

CREATE TABLE IF NOT EXISTS hairstyle_template_images (
  id                   serial PRIMARY KEY,
  template_id          integer NOT NULL REFERENCES hairstyle_templates(id) ON DELETE CASCADE,
  view                 text NOT NULL,
  r2_key               text NOT NULL,
  source               text NOT NULL,
  approval_status      text NOT NULL DEFAULT 'pending',
  approved_by_user_id  varchar REFERENCES users(id) ON DELETE SET NULL,
  approved_at          timestamptz,
  alt_text             text,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order        integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hairstyle_template_images_view CHECK (view IN ('front', 'left', 'right', 'back', 'detail')),
  CONSTRAINT hairstyle_template_images_source CHECK (source IN ('certxa_artwork', 'ai_generated', 'approved_reference', 'store_upload')),
  CONSTRAINT hairstyle_template_images_status CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT hairstyle_template_images_approved_by CHECK (approval_status <> 'approved' OR (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL)),
  CONSTRAINT hairstyle_template_images_r2_key CHECK (r2_key ~ '^[A-Za-z0-9/_.-]+$' AND r2_key NOT LIKE '%..%'),
  CONSTRAINT hairstyle_template_images_metadata CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS hairstyle_template_images_key_uidx ON hairstyle_template_images (template_id, r2_key);
CREATE INDEX IF NOT EXISTS hairstyle_template_images_approved_idx ON hairstyle_template_images (template_id, view, display_order) WHERE approval_status = 'approved';

-- PROPOSED rev 2 (Last Cut Formula Engine) - NOT APPLIED. Renumber at implementation. Requires 0352 and 0353.
-- A client's haircut formulas in one store, their append-only history, and an append-only audit trail.
-- Every reference that carries a store goes through a composite key, so cross-store rows are impossible.
-- Runner safety: idempotent statements, no semicolons inside quoted text.

DO $$
BEGIN
  IF to_regclass('public.hairstyle_templates') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'clients_id_store_uidx')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'client_quick_notes_id_store_uidx') THEN
    RAISE EXCEPTION 'LCF 0354: run 0352 and 0353 first';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS client_haircut_formulas (
  id                  serial PRIMARY KEY,
  store_id            integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id           integer NOT NULL,
  label               text,                       -- e.g. Summer cut. NULL for the everyday formula.
  is_default          boolean NOT NULL DEFAULT true,
  template_id         integer,
  template_scope      integer,                    -- 0 = global template, else must equal store_id
  is_archived         boolean NOT NULL DEFAULT false,
  created_by_user_id  varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chf_client_fk FOREIGN KEY (client_id, store_id) REFERENCES clients (id, store_id) ON DELETE CASCADE,
  CONSTRAINT chf_template_fk FOREIGN KEY (template_id, template_scope) REFERENCES hairstyle_templates (id, scope_key) ON DELETE RESTRICT,
  CONSTRAINT chf_template_pair CHECK ((template_id IS NULL) = (template_scope IS NULL)),
  CONSTRAINT chf_template_scope CHECK (template_scope IS NULL OR template_scope = 0 OR template_scope = store_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS chf_default_uidx ON client_haircut_formulas (store_id, client_id) WHERE is_default AND NOT is_archived;
CREATE UNIQUE INDEX IF NOT EXISTS chf_id_store_client_uidx ON client_haircut_formulas (id, store_id, client_id);
CREATE INDEX IF NOT EXISTS chf_client_idx ON client_haircut_formulas (store_id, client_id);

CREATE TABLE IF NOT EXISTS client_haircut_formula_versions (
  id                     serial PRIMARY KEY,
  store_id               integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  formula_id             integer,                   -- NULL only for a name-only walk-in's visit not yet tied to a client
  version_number         integer,                   -- 1, 2, 3 within the formula (set with formula_id)
  client_id              integer,                   -- always the formula's client (NULL for an unlinked walk-in)
  appointment_id         integer,                   -- the ticket of this cut
  staff_id               integer,                   -- the barber
  visit_at               timestamptz,               -- when the cut was done, for history order
  spec                   jsonb NOT NULL,
  spec_version           smallint NOT NULL DEFAULT 1,
  template_id            integer,
  template_scope         integer,                   -- 0 = global template, else must equal store_id
  hairstyle_name         text,                      -- snapshot at the time
  category_name          text,                      -- snapshot at the time
  notes                  text,
  source                 text NOT NULL,
  corrects_version_id    integer,
  quick_note_id          integer,
  idempotency_key        text,
  created_by_user_id     varchar REFERENCES users(id) ON DELETE SET NULL,
  created_by_staff_id    integer,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- The version's client is always its formula's client. ON UPDATE CASCADE carries a merge (formula moved to the
  -- surviving client) into the history without any privileged switch.
  CONSTRAINT chfv_formula_fk FOREIGN KEY (formula_id, store_id, client_id)
    REFERENCES client_haircut_formulas (id, store_id, client_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chfv_appointment_fk FOREIGN KEY (appointment_id, store_id) REFERENCES appointments (id, store_id) ON DELETE SET NULL (appointment_id),
  CONSTRAINT chfv_staff_fk FOREIGN KEY (staff_id, store_id) REFERENCES staff (id, store_id) ON DELETE SET NULL (staff_id),
  CONSTRAINT chfv_created_by_staff_fk FOREIGN KEY (created_by_staff_id, store_id) REFERENCES staff (id, store_id) ON DELETE SET NULL (created_by_staff_id),
  CONSTRAINT chfv_template_fk FOREIGN KEY (template_id, template_scope) REFERENCES hairstyle_templates (id, scope_key) ON DELETE RESTRICT,
  CONSTRAINT chfv_quick_note_fk FOREIGN KEY (quick_note_id, store_id) REFERENCES client_quick_notes (id, store_id) ON DELETE SET NULL (quick_note_id),
  CONSTRAINT chfv_template_pair CHECK ((template_id IS NULL) = (template_scope IS NULL)),
  CONSTRAINT chfv_template_scope CHECK (template_scope IS NULL OR template_scope = 0 OR template_scope = store_id),
  CONSTRAINT chfv_source CHECK (source IN ('checkout', 'manual', 'repeat', 'correction', 'import', 'quick_note_backfill', 'walk_in')),
  CONSTRAINT chfv_formula_version_pair CHECK ((formula_id IS NULL) = (version_number IS NULL)),
  CONSTRAINT chfv_formula_client_pair CHECK ((formula_id IS NULL) = (client_id IS NULL)),
  CONSTRAINT chfv_version_positive CHECK (version_number IS NULL OR version_number >= 1),
  CONSTRAINT chfv_unlinked_source CHECK (formula_id IS NOT NULL OR source IN ('walk_in', 'correction')),
  CONSTRAINT chfv_correction_target CHECK ((source = 'correction') = (corrects_version_id IS NOT NULL)),
  CONSTRAINT chfv_not_self_correction CHECK (corrects_version_id IS NULL OR corrects_version_id <> id),
  CONSTRAINT chfv_spec_object CHECK (jsonb_typeof(spec) = 'object' AND jsonb_typeof(spec -> 'v') = 'number'),
  CONSTRAINT chfv_spec_size CHECK (pg_column_size(spec) < 32768),
  CONSTRAINT chfv_idempotency_key CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 8 AND 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS chfv_id_store_uidx ON client_haircut_formula_versions (id, store_id);
-- A correction points at a version of the same store (the rest is checked by the insert guard below).
ALTER TABLE client_haircut_formula_versions ADD CONSTRAINT chfv_corrects_fk
  FOREIGN KEY (corrects_version_id, store_id) REFERENCES client_haircut_formula_versions (id, store_id);
CREATE UNIQUE INDEX IF NOT EXISTS chfv_formula_version_uidx ON client_haircut_formula_versions (formula_id, version_number) WHERE formula_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chfv_idempotency_uidx ON client_haircut_formula_versions (store_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chfv_one_visit_record_uidx ON client_haircut_formula_versions (appointment_id) WHERE appointment_id IS NOT NULL AND source IN ('checkout', 'walk_in', 'quick_note_backfill');
CREATE UNIQUE INDEX IF NOT EXISTS chfv_quick_note_uidx ON client_haircut_formula_versions (quick_note_id) WHERE quick_note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chfv_client_history_idx ON client_haircut_formula_versions (store_id, client_id, visit_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS chfv_formula_idx ON client_haircut_formula_versions (formula_id, version_number DESC);
CREATE INDEX IF NOT EXISTS chfv_unlinked_idx ON client_haircut_formula_versions (store_id, appointment_id) WHERE formula_id IS NULL;
CREATE INDEX IF NOT EXISTS chfv_corrects_idx ON client_haircut_formula_versions (corrects_version_id) WHERE corrects_version_id IS NOT NULL;

-- Append-only audit of the operations that move or remove history (merges, walk-in links, deletions).
-- No foreign keys on purpose: it outlives the client and the store it describes. It holds ids only, no names.
CREATE TABLE IF NOT EXISTS client_haircut_formula_audit (
  id             bigserial PRIMARY KEY,
  at             timestamptz NOT NULL DEFAULT now(),
  store_id       integer NOT NULL,
  action         text NOT NULL,
  formula_id     integer,
  version_id     integer,
  client_id_old  integer,
  client_id_new  integer,
  db_user        text NOT NULL DEFAULT current_user,
  app_actor      text,                              -- the server's SET LOCAL certxa.actor (user or staff id), when given
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT chfa_action CHECK (action IN ('formula_client_changed', 'formula_archived', 'formula_deleted', 'walk_in_linked', 'version_deleted'))
);
CREATE INDEX IF NOT EXISTS chfa_store_at_idx ON client_haircut_formula_audit (store_id, at DESC);

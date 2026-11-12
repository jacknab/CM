-- PROPOSED rev 2 (Last Cut Formula Engine) - NOT APPLIED. Renumber at implementation. Requires 0354.
-- Integrity guards and the audit trail. Rev 2 has NO privileged switches (no certxa.formula_relink, no
-- certxa.formula_purge) and no pg_trigger_depth() exception: every allowed change is decided from the state of the
-- database itself (does the parent still exist, does the ticket belong to that client).
-- certxa.actor is read only to label audit rows. It grants nothing.
-- Runner safety: CREATE OR REPLACE functions, CREATE TRIGGER (a re-run fails with duplicate_object, which the runner
-- skips). No semicolons inside quoted text.

DO $$
BEGIN
  IF to_regclass('public.client_haircut_formula_versions') IS NULL OR to_regclass('public.client_haircut_formula_audit') IS NULL THEN
    RAISE EXCEPTION 'LCF 0355: run 0354 first';
  END IF;
END
$$;

-- ── Versions: what a new row may say ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION chfv_insert_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ticket_client integer;
  ticket_found boolean := false;
  ticket_time timestamptz;
  target record;
  qn record;
BEGIN
  IF NEW.appointment_id IS NOT NULL THEN
    SELECT true, a.customer_id, coalesce(a.completed_at, a.date) INTO ticket_found, ticket_client, ticket_time
      FROM appointments a WHERE a.id = NEW.appointment_id AND a.store_id = NEW.store_id;
  END IF;

  IF NEW.formula_id IS NULL THEN
    -- An unlinked version is a name-only walk-in's visit: it needs its ticket, and that ticket has no client.
    IF NEW.appointment_id IS NULL OR NOT coalesce(ticket_found, false) THEN
      RAISE EXCEPTION 'A walk-in haircut record needs the ticket it was done on' USING ERRCODE = 'P0001';
    END IF;
    IF ticket_client IS NOT NULL THEN
      RAISE EXCEPTION 'Ticket % has a client: save the haircut to that client''s formula' , NEW.appointment_id USING ERRCODE = 'P0001';
    END IF;
  ELSIF ticket_client IS NOT NULL AND ticket_client <> NEW.client_id THEN
    RAISE EXCEPTION 'Ticket % belongs to another client' , NEW.appointment_id USING ERRCODE = 'P0001';
  END IF;

  IF NEW.corrects_version_id IS NOT NULL THEN
    SELECT v.formula_id, v.appointment_id, v.store_id INTO target
      FROM client_haircut_formula_versions v WHERE v.id = NEW.corrects_version_id;
    IF NOT FOUND OR target.store_id <> NEW.store_id
       OR target.formula_id IS DISTINCT FROM NEW.formula_id
       OR (target.appointment_id IS NOT NULL AND target.appointment_id IS DISTINCT FROM NEW.appointment_id)
       OR (NEW.formula_id IS NULL AND target.appointment_id IS NULL) THEN
      RAISE EXCEPTION 'A correction must be for a version of the same formula and the same visit' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.quick_note_id IS NOT NULL THEN
    SELECT q.client_id, q.appointment_id INTO qn FROM client_quick_notes q WHERE q.id = NEW.quick_note_id AND q.store_id = NEW.store_id;
    IF NOT FOUND OR qn.appointment_id IS DISTINCT FROM NEW.appointment_id OR qn.client_id IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'Quick Note % is for another visit or client' , NEW.quick_note_id USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.visit_at IS NULL THEN NEW.visit_at := coalesce(ticket_time, now()); END IF;
  RETURN NEW;
END
$$;

-- ── Versions: history never changes, except three structural moves ─────────────
CREATE OR REPLACE FUNCTION chfv_update_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  formula_client integer;
  ticket_client integer;
  target_formula integer;
BEGIN
  -- What the haircut was: never rewritten. A mistake is fixed with a correction version.
  IF NEW.spec IS DISTINCT FROM OLD.spec OR NEW.spec_version IS DISTINCT FROM OLD.spec_version
     OR NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.hairstyle_name IS DISTINCT FROM OLD.hairstyle_name
     OR NEW.category_name IS DISTINCT FROM OLD.category_name OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.template_scope IS DISTINCT FROM OLD.template_scope OR NEW.visit_at IS DISTINCT FROM OLD.visit_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.corrects_version_id IS DISTINCT FROM OLD.corrects_version_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Haircut history cannot be changed (version %). Save a correction instead.', OLD.id USING ERRCODE = 'P0001';
  END IF;

  -- A ticket, barber or Quick Note that no longer exists: its foreign key sets that one column to NULL.
  IF (NEW.appointment_id IS DISTINCT FROM OLD.appointment_id AND NEW.appointment_id IS NOT NULL)
     OR (NEW.staff_id IS DISTINCT FROM OLD.staff_id AND NEW.staff_id IS NOT NULL)
     OR (NEW.created_by_staff_id IS DISTINCT FROM OLD.created_by_staff_id AND NEW.created_by_staff_id IS NOT NULL)
     OR (NEW.quick_note_id IS DISTINCT FROM OLD.quick_note_id AND NEW.quick_note_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A version''s ticket, barber or Quick Note can only be cleared, never replaced (version %)', OLD.id USING ERRCODE = 'P0001';
  END IF;

  IF NEW.formula_id IS NOT DISTINCT FROM OLD.formula_id AND NEW.version_number IS NOT DISTINCT FROM OLD.version_number THEN
    IF NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN
      RETURN NEW;                                   -- only references cleared
    END IF;
    -- Merge: the formula was moved to the surviving client and the foreign key carried it here.
    SELECT f.client_id INTO formula_client FROM client_haircut_formulas f WHERE f.id = NEW.formula_id;
    IF NEW.formula_id IS NOT NULL AND formula_client = NEW.client_id THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A version''s client always follows its formula (version %)', OLD.id USING ERRCODE = 'P0001';
  END IF;

  -- Walk-in link: an unlinked visit goes into the formula of the client its ticket now belongs to. Only once.
  IF OLD.formula_id IS NULL AND NEW.formula_id IS NOT NULL AND NEW.appointment_id IS NOT NULL
     AND NEW.appointment_id = OLD.appointment_id THEN
    SELECT a.customer_id INTO ticket_client FROM appointments a WHERE a.id = NEW.appointment_id AND a.store_id = NEW.store_id;
    IF ticket_client IS NULL OR ticket_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Walk-in visit % can only join the formula of the client its ticket belongs to', OLD.id USING ERRCODE = 'P0001';
    END IF;
    IF NEW.corrects_version_id IS NOT NULL THEN
      SELECT v.formula_id INTO target_formula FROM client_haircut_formula_versions v WHERE v.id = NEW.corrects_version_id;
      IF target_formula IS DISTINCT FROM NEW.formula_id THEN
        RAISE EXCEPTION 'Link the original walk-in visit before its corrections (version %)', OLD.id USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'This change to haircut history is not allowed (version %)', OLD.id USING ERRCODE = 'P0001';
END
$$;

-- History is deleted only with what it belongs to: the client (privacy deletion), the store, or - for a name-only
-- walk-in whose ticket no longer exists - as an orphan clean-up. A direct DELETE of live history is refused.
CREATE OR REPLACE FUNCTION chfv_delete_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = OLD.store_id)
     OR (OLD.formula_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM client_haircut_formulas f WHERE f.id = OLD.formula_id))
     OR (OLD.formula_id IS NULL AND (OLD.appointment_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = OLD.appointment_id))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Haircut history cannot be deleted while its client exists (version %)', OLD.id USING ERRCODE = 'P0001';
END
$$;

-- ── Formulas: never deleted directly (archive instead), never change store ──────
CREATE OR REPLACE FUNCTION chf_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = OLD.store_id)
       OR NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = OLD.client_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'A haircut formula is archived, not deleted (formula %)', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'A haircut formula cannot move to another store (formula %)', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

-- ── Audit (append-only) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chf_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE actor text := nullif(current_setting('certxa.actor', true), '');
BEGIN
  IF TG_TABLE_NAME = 'client_haircut_formulas' THEN
    IF TG_OP = 'DELETE' THEN
      INSERT INTO client_haircut_formula_audit (store_id, action, formula_id, client_id_old, app_actor)
        VALUES (OLD.store_id, 'formula_deleted', OLD.id, OLD.client_id, actor);
      RETURN OLD;
    END IF;
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      INSERT INTO client_haircut_formula_audit (store_id, action, formula_id, client_id_old, client_id_new, app_actor)
        VALUES (NEW.store_id, 'formula_client_changed', NEW.id, OLD.client_id, NEW.client_id, actor);
    END IF;
    IF NEW.is_archived AND NOT OLD.is_archived THEN
      INSERT INTO client_haircut_formula_audit (store_id, action, formula_id, client_id_old, app_actor)
        VALUES (NEW.store_id, 'formula_archived', NEW.id, NEW.client_id, actor);
    END IF;
    RETURN NEW;
  END IF;
  -- versions
  IF TG_OP = 'DELETE' THEN
    INSERT INTO client_haircut_formula_audit (store_id, action, formula_id, version_id, client_id_old, app_actor, details)
      VALUES (OLD.store_id, 'version_deleted', OLD.formula_id, OLD.id, OLD.client_id, actor, jsonb_build_object('appointment_id', OLD.appointment_id));
    RETURN OLD;
  END IF;
  IF OLD.formula_id IS NULL AND NEW.formula_id IS NOT NULL THEN
    INSERT INTO client_haircut_formula_audit (store_id, action, formula_id, version_id, client_id_new, app_actor, details)
      VALUES (NEW.store_id, 'walk_in_linked', NEW.formula_id, NEW.id, NEW.client_id, actor, jsonb_build_object('appointment_id', NEW.appointment_id));
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION chfa_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The haircut formula audit trail is append-only' USING ERRCODE = 'P0001';
END
$$;

CREATE TRIGGER chfv_insert_guard_trg BEFORE INSERT ON client_haircut_formula_versions FOR EACH ROW EXECUTE FUNCTION chfv_insert_guard();
CREATE TRIGGER chfv_update_guard_trg BEFORE UPDATE ON client_haircut_formula_versions FOR EACH ROW EXECUTE FUNCTION chfv_update_guard();
CREATE TRIGGER chfv_delete_guard_trg BEFORE DELETE ON client_haircut_formula_versions FOR EACH ROW EXECUTE FUNCTION chfv_delete_guard();
CREATE TRIGGER chfv_audit_trg AFTER UPDATE OR DELETE ON client_haircut_formula_versions FOR EACH ROW EXECUTE FUNCTION chf_audit();
CREATE TRIGGER chf_guard_trg BEFORE UPDATE OR DELETE ON client_haircut_formulas FOR EACH ROW EXECUTE FUNCTION chf_guard();
CREATE TRIGGER chf_audit_trg AFTER UPDATE OR DELETE ON client_haircut_formulas FOR EACH ROW EXECUTE FUNCTION chf_audit();
CREATE TRIGGER chfa_append_only_trg BEFORE UPDATE OR DELETE ON client_haircut_formula_audit FOR EACH ROW EXECUTE FUNCTION chfa_append_only();

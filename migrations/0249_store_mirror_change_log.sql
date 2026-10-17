-- The salon's account on its tablets (plans/salon-local-database.md, artifacts/api-server/src/lib/storeMirror.ts).
-- Every insert, update and delete on a copied table is written to store_changes under one ever-increasing seq;
-- a tablet asks for the changes after the last seq it applied. Generated from MIRROR_TABLES — keep them in step
-- (lib/storeMirror.test.ts checks it).
CREATE TABLE IF NOT EXISTS store_changes (
  seq        BIGSERIAL PRIMARY KEY,
  store_id   INTEGER NOT NULL,
  tbl        TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  op         CHAR(1) NOT NULL,             -- I / U / D
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_changes_store_seq_idx ON store_changes (store_id, seq);
CREATE INDEX IF NOT EXISTS store_changes_changed_at_idx ON store_changes (changed_at);
-- How far each salon's log was trimmed (entries older than 30 days go nightly): a tablet behind that copies again.
CREATE TABLE IF NOT EXISTS store_changes_pruned (
  store_id       INTEGER PRIMARY KEY,
  pruned_through BIGINT NOT NULL
);

-- TG_ARGV[0]: 'store' (the row has store_id), 'self' (locations: the row is the salon), or '<parent table>:<fk column>'.
CREATE OR REPLACE FUNCTION log_store_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rec   jsonb;
  old_r jsonb;
  sid   integer;
  old_sid integer;
  mode  text := TG_ARGV[0];
  parent_tbl text;
  fk    text;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := to_jsonb(OLD); ELSE rec := to_jsonb(NEW); END IF;
  IF mode = 'store' THEN
    sid := (rec->>'store_id')::integer;
    IF TG_OP = 'UPDATE' THEN old_sid := (to_jsonb(OLD)->>'store_id')::integer; END IF;
  ELSIF mode = 'self' THEN
    sid := (rec->>'id')::integer;
  ELSE
    parent_tbl := split_part(mode, ':', 1);
    fk := split_part(mode, ':', 2);
    IF rec->>fk IS NOT NULL THEN
      EXECUTE format('SELECT store_id FROM %I WHERE id = $1', parent_tbl) INTO sid USING (rec->>fk)::integer;
    END IF;
  END IF;
  IF sid IS NOT NULL THEN
    INSERT INTO store_changes (store_id, tbl, row_id, op) VALUES (sid, TG_TABLE_NAME, rec->>'id', left(TG_OP, 1));
  END IF;
  -- A row moved to another salon leaves the first one's copy.
  IF old_sid IS NOT NULL AND old_sid IS DISTINCT FROM sid THEN
    INSERT INTO store_changes (store_id, tbl, row_id, op) VALUES (old_sid, TG_TABLE_NAME, rec->>'id', 'D');
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS store_mirror_log ON locations;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON locations
  FOR EACH ROW EXECUTE FUNCTION log_store_change('self');
DROP TRIGGER IF EXISTS store_mirror_log ON clients;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON client_phones;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_phones
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON client_emails;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_emails
  FOR EACH ROW EXECUTE FUNCTION log_store_change('clients:client_id');
DROP TRIGGER IF EXISTS store_mirror_log ON client_addresses;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_addresses
  FOR EACH ROW EXECUTE FUNCTION log_store_change('clients:client_id');
DROP TRIGGER IF EXISTS store_mirror_log ON client_marketing_preferences;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_marketing_preferences
  FOR EACH ROW EXECUTE FUNCTION log_store_change('clients:client_id');
DROP TRIGGER IF EXISTS store_mirror_log ON client_notes;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_notes
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON client_tags;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_tags
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON client_tag_relationships;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_tag_relationships
  FOR EACH ROW EXECUTE FUNCTION log_store_change('clients:client_id');
DROP TRIGGER IF EXISTS store_mirror_log ON client_custom_fields;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_custom_fields
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON client_custom_field_values;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON client_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION log_store_change('clients:client_id');
DROP TRIGGER IF EXISTS store_mirror_log ON appointments;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON appointment_addons;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON appointment_addons
  FOR EACH ROW EXECUTE FUNCTION log_store_change('appointments:appointment_id');
DROP TRIGGER IF EXISTS store_mirror_log ON appointment_nail_selection;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON appointment_nail_selection
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON booking_requests;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON kiosk_checkins;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON kiosk_checkins
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON waitlist;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON waitlist
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON service_categories;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON service_categories
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON services;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON services
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON service_options;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON service_options
  FOR EACH ROW EXECUTE FUNCTION log_store_change('services:service_id');
DROP TRIGGER IF EXISTS store_mirror_log ON addons;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON addons
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON service_addons;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON service_addons
  FOR EACH ROW EXECUTE FUNCTION log_store_change('services:service_id');
DROP TRIGGER IF EXISTS store_mirror_log ON packages;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON packages
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON package_items;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON package_items
  FOR EACH ROW EXECUTE FUNCTION log_store_change('packages:package_id');
DROP TRIGGER IF EXISTS store_mirror_log ON products;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON nail_sizes;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON nail_sizes
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON nail_shapes;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON nail_shapes
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON nail_art_applications;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON nail_art_applications
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON nail_art_effects;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON nail_art_effects
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON nail_service_configs;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON nail_service_configs
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON service_nail_sizes;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON service_nail_sizes
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON service_nail_shapes;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON service_nail_shapes
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON service_nail_art_applications;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON service_nail_art_applications
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON service_nail_art_effects;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON service_nail_art_effects
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON salon_resources;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON salon_resources
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON staff;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON staff
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON staff_services;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON staff_services
  FOR EACH ROW EXECUTE FUNCTION log_store_change('staff:staff_id');
DROP TRIGGER IF EXISTS store_mirror_log ON staff_availability;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON staff_availability
  FOR EACH ROW EXECUTE FUNCTION log_store_change('staff:staff_id');
DROP TRIGGER IF EXISTS store_mirror_log ON staff_settings;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON staff_settings
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON roles;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON permissions;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON permissions
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON timeclock;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON timeclock
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON turn_events;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON turn_events
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON turn_assignment_log;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON turn_assignment_log
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON gift_cards;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON gift_cards
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON gift_card_transactions;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON gift_card_transactions
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON loyalty_rewards;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON loyalty_rewards
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON loyalty_transactions;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON loyalty_transactions
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON payment_refunds;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON payment_refunds
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON cash_drawers;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON cash_drawers
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON cash_drawer_sessions;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON cash_drawer_sessions
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON registers;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON registers
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON frontdesk_screens;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON frontdesk_screens
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON commission_structures;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON commission_structures
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON contractors;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON contractors
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON contractor_commissions;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON contractor_commissions
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON staff_commission_accruals;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON staff_commission_accruals
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON pay_schedules;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON pay_schedules
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON payroll_runs;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON payroll_run_items;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON payroll_run_items
  FOR EACH ROW EXECUTE FUNCTION log_store_change('payroll_runs:payroll_run_id');
DROP TRIGGER IF EXISTS store_mirror_log ON payout_runs;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON payout_runs
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON payout_checks;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON payout_checks
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON payout_adjustments;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON payout_adjustments
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON payout_deduction_rules;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON payout_deduction_rules
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON store_settings;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON calendar_settings;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON calendar_settings
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON business_hours;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON business_hours
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON business_days;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON business_days
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');

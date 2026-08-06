-- Migration: 0012_vps_critical_fixes.sql
-- Comprehensive idempotent fix for ALL columns and tables missing from the VPS
-- database that were not covered by 0011_vps_schema_sync.sql.
-- Safe to run multiple times — every statement uses IF NOT EXISTS.

-- ─── 1. users: missing columns ───────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions       JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed  BOOLEAN DEFAULT false;

-- ─── 2. appointments: missing columns ────────────────────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method      TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tip_amount          DECIMAL(10, 2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_amount     DECIMAL(10, 2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS total_paid          DECIMAL(10, 2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_at          TIMESTAMP;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_at        TIMESTAMP;

-- ─── 3. staff: employment_type rename guard ───────────────────────────────────
-- employment_type was added in 0011 as TEXT but the original had it as 'stylist'
ALTER TABLE staff ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'stylist';

-- ─── 4. permissions table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  store_id    INTEGER NOT NULL REFERENCES locations(id),
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS permissions_store_id_idx ON permissions (store_id);

-- ─── 5. roles table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  store_id    INTEGER NOT NULL REFERENCES locations(id),
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS roles_store_id_idx       ON roles (store_id);
CREATE INDEX IF NOT EXISTS roles_name_store_idx     ON roles (name, store_id);

-- ─── 6. app table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id),
  app_name    TEXT NOT NULL,
  active      BOOLEAN DEFAULT false,
  active_date TIMESTAMP,
  user_pin    TEXT,
  permissions INTEGER
);
CREATE INDEX IF NOT EXISTS app_store_id_idx         ON app (store_id);
CREATE INDEX IF NOT EXISTS app_store_app_unique_idx ON app (store_id, app_name);

-- ─── 7. staff_settings table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_settings (
  id          SERIAL PRIMARY KEY,
  staff_id    INTEGER NOT NULL UNIQUE REFERENCES staff(id),
  store_id    INTEGER NOT NULL REFERENCES locations(id),
  preferences TEXT NOT NULL,
  updated_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_settings_store_id_idx ON staff_settings (store_id);

-- ─── 8. store_settings table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_settings (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL UNIQUE REFERENCES locations(id),
  preferences TEXT NOT NULL,
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ─── 9. stripe_settings table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_settings (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES locations(id),
  publishable_key  TEXT,
  secret_key       TEXT,
  test_magstripe_enabled BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_settings_store_id_uidx ON stripe_settings (store_id);

-- ─── 10. password_reset_tokens table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── 11. google_review_responses table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_review_responses (
  id              SERIAL PRIMARY KEY,
  google_review_id INTEGER NOT NULL REFERENCES google_reviews(id),
  store_id        INTEGER NOT NULL REFERENCES locations(id),
  response_text   TEXT NOT NULL,
  response_status TEXT NOT NULL,
  staff_id        INTEGER REFERENCES staff(id),
  created_by      TEXT REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS google_review_responses_google_review_id_idx ON google_review_responses (google_review_id);
CREATE INDEX IF NOT EXISTS google_review_responses_store_id_idx         ON google_review_responses (store_id);
CREATE INDEX IF NOT EXISTS google_review_responses_response_status_idx  ON google_review_responses (response_status);

-- ─── 12. reviews table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES locations(id),
  customer_id     INTEGER REFERENCES customers(id),
  appointment_id  INTEGER REFERENCES appointments(id),
  staff_id        INTEGER REFERENCES staff(id),
  rating          INTEGER NOT NULL,
  comment         TEXT,
  customer_name   TEXT,
  service_name    TEXT,
  staff_name      TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT true,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── 13. waitlist table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  service_id          INTEGER REFERENCES services(id),
  staff_id            INTEGER REFERENCES staff(id),
  customer_id         INTEGER REFERENCES customers(id),
  customer_name       TEXT NOT NULL,
  customer_phone      TEXT,
  customer_email      TEXT,
  preferred_date      TIMESTAMP,
  preferred_time_start TEXT,
  preferred_time_end  TEXT,
  notes               TEXT,
  party_size          INTEGER DEFAULT 1,
  status              TEXT DEFAULT 'waiting',
  notified_at         TIMESTAMP,
  called_at           TIMESTAMP,
  completed_at        TIMESTAMP,
  customer_latitude   TEXT,
  customer_longitude  TEXT,
  sms_sent_at         TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ─── 14. gift_cards table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gift_cards (
  id                       SERIAL PRIMARY KEY,
  store_id                 INTEGER NOT NULL REFERENCES locations(id),
  code                     TEXT NOT NULL UNIQUE,
  original_amount          DECIMAL(10, 2) NOT NULL,
  remaining_balance        DECIMAL(10, 2) NOT NULL,
  issued_to_name           TEXT,
  issued_to_email          TEXT,
  purchased_by_customer_id INTEGER REFERENCES customers(id),
  recipient_customer_id    INTEGER REFERENCES customers(id),
  is_active                BOOLEAN DEFAULT true,
  expires_at               TIMESTAMP,
  created_at               TIMESTAMP DEFAULT NOW(),
  notes                    TEXT
);

-- ─── 15. gift_card_transactions table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id             SERIAL PRIMARY KEY,
  gift_card_id   INTEGER NOT NULL REFERENCES gift_cards(id),
  store_id       INTEGER NOT NULL REFERENCES locations(id),
  appointment_id INTEGER REFERENCES appointments(id),
  amount         DECIMAL(10, 2) NOT NULL,
  type           TEXT NOT NULL,
  balance_after  DECIMAL(10, 2) NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ─── 16. intake_forms table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intake_forms (
  id                   SERIAL PRIMARY KEY,
  store_id             INTEGER NOT NULL REFERENCES locations(id),
  name                 TEXT NOT NULL,
  description          TEXT,
  is_active            BOOLEAN DEFAULT true,
  require_before_booking BOOLEAN DEFAULT false,
  service_id           INTEGER REFERENCES services(id),
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_form_fields (
  id         SERIAL PRIMARY KEY,
  form_id    INTEGER NOT NULL REFERENCES intake_forms(id),
  label      TEXT NOT NULL,
  field_type TEXT NOT NULL,
  options    TEXT,
  required   BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS intake_form_responses (
  id             SERIAL PRIMARY KEY,
  form_id        INTEGER NOT NULL REFERENCES intake_forms(id),
  store_id       INTEGER NOT NULL REFERENCES locations(id),
  customer_id    INTEGER REFERENCES customers(id),
  appointment_id INTEGER REFERENCES appointments(id),
  customer_name  TEXT,
  responses      TEXT NOT NULL,
  submitted_at   TIMESTAMP DEFAULT NOW()
);

-- ─── 17. loyalty_transactions table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES locations(id),
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  appointment_id INTEGER REFERENCES appointments(id),
  type           TEXT NOT NULL,
  points         INTEGER NOT NULL,
  description    TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ─── 18. sms_opt_outs table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id              SERIAL PRIMARY KEY,
  phone           TEXT NOT NULL UNIQUE,
  opted_out_at    TIMESTAMP DEFAULT NOW(),
  opted_back_in_at TIMESTAMP,
  is_opted_out    BOOLEAN NOT NULL DEFAULT true
);

-- ─── 19. pro_leads table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pro_leads (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  phone         VARCHAR(50),
  business_name VARCHAR(255),
  industry      VARCHAR(100),
  team_size     VARCHAR(50),
  message       TEXT,
  source        VARCHAR(100) DEFAULT 'pro-hub',
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── 20. seo_regions table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seo_regions (
  id             SERIAL PRIMARY KEY,
  city           VARCHAR(100) NOT NULL,
  state          VARCHAR(100) NOT NULL,
  state_code     VARCHAR(10) NOT NULL,
  slug           VARCHAR(200) NOT NULL UNIQUE,
  phone          VARCHAR(30),
  zip            VARCHAR(20),
  product        VARCHAR(20) NOT NULL DEFAULT 'booking',
  business_type  VARCHAR(100),
  business_types TEXT,
  nearby_cities  TEXT,
  meta_title     TEXT,
  meta_desc      TEXT,
  h1_override    TEXT,
  page_generated BOOLEAN DEFAULT false,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ─── 21. Pro Dashboard tables ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pro_crews (
  id         SERIAL PRIMARY KEY,
  store_id   INTEGER NOT NULL REFERENCES locations(id),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#00D4AA',
  active     BOOLEAN NOT NULL DEFAULT true,
  notes      TEXT,
  phone      TEXT,
  pin_hash   TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_crew_locations (
  id         SERIAL PRIMARY KEY,
  crew_id    INTEGER NOT NULL REFERENCES pro_crews(id),
  lat        DECIMAL(10, 7) NOT NULL,
  lng        DECIMAL(10, 7) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_service_orders (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES locations(id),
  order_number     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'new',
  priority         TEXT NOT NULL DEFAULT 'normal',
  service_type     TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  customer_email   TEXT,
  address          TEXT NOT NULL,
  city             TEXT,
  state            TEXT,
  zip              TEXT,
  lat              DECIMAL(10, 7),
  lng              DECIMAL(10, 7),
  description      TEXT,
  crew_id          INTEGER REFERENCES pro_crews(id),
  scheduled_at     TIMESTAMP,
  started_at       TIMESTAMP,
  completed_at     TIMESTAMP,
  estimated_hours  DECIMAL(4, 1),
  overtime_flagged BOOLEAN DEFAULT false,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_order_notes (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES pro_service_orders(id),
  store_id    INTEGER NOT NULL REFERENCES locations(id),
  note        TEXT NOT NULL,
  author_name TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_customers (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES locations(id),
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  property_type TEXT DEFAULT 'residential',
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_estimates (
  id                   SERIAL PRIMARY KEY,
  store_id             INTEGER NOT NULL REFERENCES locations(id),
  estimate_number      TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft',
  customer_id          INTEGER REFERENCES pro_customers(id),
  customer_name        TEXT NOT NULL,
  customer_phone       TEXT,
  customer_email       TEXT,
  address              TEXT,
  city                 TEXT,
  state                TEXT,
  zip                  TEXT,
  service_type         TEXT,
  description          TEXT,
  line_items           TEXT,
  subtotal             DECIMAL(10, 2) DEFAULT 0,
  tax                  DECIMAL(10, 2) DEFAULT 0,
  total                DECIMAL(10, 2) DEFAULT 0,
  converted_to_order_id INTEGER,
  valid_until          TIMESTAMP,
  notes                TEXT,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_invoices (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES locations(id),
  order_id        INTEGER REFERENCES pro_service_orders(id),
  invoice_number  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT,
  customer_email  TEXT,
  address         TEXT,
  line_items      TEXT,
  subtotal        DECIMAL(10, 2) DEFAULT 0,
  tax             DECIMAL(10, 2) DEFAULT 0,
  total           DECIMAL(10, 2) DEFAULT 0,
  paid_at         TIMESTAMP,
  due_at          TIMESTAMP,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── 22. Intelligence tables ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_intelligence (
  id                       SERIAL PRIMARY KEY,
  store_id                 INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  customer_id              INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  avg_visit_cadence_days   DECIMAL(6, 1),
  last_visit_date          TIMESTAMP,
  next_expected_visit_date TIMESTAMP,
  days_since_last_visit    INTEGER,
  days_overdue_pct         DECIMAL(6, 1),
  total_visits             INTEGER DEFAULT 0,
  total_revenue            DECIMAL(10, 2) DEFAULT 0.00,
  avg_ticket_value         DECIMAL(10, 2) DEFAULT 0.00,
  ltv_12_month             DECIMAL(10, 2) DEFAULT 0.00,
  ltv_all_time             DECIMAL(10, 2) DEFAULT 0.00,
  ltv_score                INTEGER DEFAULT 0,
  churn_risk_score         INTEGER DEFAULT 0,
  churn_risk_label         TEXT DEFAULT 'low',
  no_show_count            INTEGER DEFAULT 0,
  no_show_rate             DECIMAL(5, 2) DEFAULT 0.00,
  rebooking_rate           DECIMAL(5, 2) DEFAULT 0.00,
  preferred_staff_id       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  preferred_day_of_week    INTEGER,
  preferred_time_of_day    TEXT,
  last_winback_sent_at     TIMESTAMP,
  winback_sent_count       INTEGER DEFAULT 0,
  is_drifting              BOOLEAN DEFAULT false,
  is_at_risk               BOOLEAN DEFAULT false,
  computed_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ci_store_id_idx          ON client_intelligence (store_id);
CREATE INDEX IF NOT EXISTS ci_customer_id_idx       ON client_intelligence (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS ci_store_customer_uidx ON client_intelligence (store_id, customer_id);
CREATE INDEX IF NOT EXISTS ci_churn_risk_idx        ON client_intelligence (churn_risk_score);
CREATE INDEX IF NOT EXISTS ci_is_drifting_idx       ON client_intelligence (is_drifting);
CREATE INDEX IF NOT EXISTS ci_is_at_risk_idx        ON client_intelligence (is_at_risk);

CREATE TABLE IF NOT EXISTS staff_intelligence (
  id                      SERIAL PRIMARY KEY,
  store_id                INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id                INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  total_appointments      INTEGER DEFAULT 0,
  completed_appointments  INTEGER DEFAULT 0,
  no_show_count           INTEGER DEFAULT 0,
  cancellation_count      INTEGER DEFAULT 0,
  rebooked_count          INTEGER DEFAULT 0,
  rebooking_rate_pct      DECIMAL(5, 2) DEFAULT 0.00,
  avg_ticket_value        DECIMAL(10, 2) DEFAULT 0.00,
  total_revenue           DECIMAL(10, 2) DEFAULT 0.00,
  unique_clients_served   INTEGER DEFAULT 0,
  client_retention_rate   DECIMAL(5, 2) DEFAULT 0.00,
  trend                   TEXT DEFAULT 'stable',
  computed_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS si_store_id_idx       ON staff_intelligence (store_id);
CREATE INDEX IF NOT EXISTS si_staff_id_idx       ON staff_intelligence (staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS si_store_staff_uidx ON staff_intelligence (store_id, staff_id);

CREATE TABLE IF NOT EXISTS intelligence_interventions (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  intervention_type TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'sms',
  message_body      TEXT,
  status            TEXT NOT NULL DEFAULT 'sent',
  triggered_by      TEXT NOT NULL DEFAULT 'auto',
  metadata          JSONB,
  sent_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at      TIMESTAMP,
  converted_at      TIMESTAMP,
  appointment_id    INTEGER
);
CREATE INDEX IF NOT EXISTS ii_store_id_idx    ON intelligence_interventions (store_id);
CREATE INDEX IF NOT EXISTS ii_customer_id_idx ON intelligence_interventions (customer_id);
CREATE INDEX IF NOT EXISTS ii_type_idx        ON intelligence_interventions (intervention_type);
CREATE INDEX IF NOT EXISTS ii_sent_at_idx     ON intelligence_interventions (sent_at);

CREATE TABLE IF NOT EXISTS growth_score_snapshots (
  id                   SERIAL PRIMARY KEY,
  store_id             INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  overall_score        INTEGER NOT NULL,
  retention_score      INTEGER NOT NULL,
  rebooking_score      INTEGER NOT NULL,
  utilization_score    INTEGER NOT NULL,
  revenue_score        INTEGER NOT NULL,
  new_client_score     INTEGER NOT NULL,
  active_clients       INTEGER DEFAULT 0,
  drifting_clients     INTEGER DEFAULT 0,
  at_risk_clients      INTEGER DEFAULT 0,
  avg_rebooking_rate   DECIMAL(5, 2),
  seat_utilization_pct DECIMAL(5, 2),
  monthly_revenue      DECIMAL(10, 2),
  snapshot_date        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS gss_store_id_idx      ON growth_score_snapshots (store_id);
CREATE INDEX IF NOT EXISTS gss_snapshot_date_idx ON growth_score_snapshots (snapshot_date);

CREATE TABLE IF NOT EXISTS dead_seat_patterns (
  id                      SERIAL PRIMARY KEY,
  store_id                INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  day_of_week             INTEGER NOT NULL,
  hour_start              INTEGER NOT NULL,
  avg_utilization_pct     DECIMAL(5, 2) DEFAULT 0.00,
  total_slots_analyzed    INTEGER DEFAULT 0,
  booked_slots            INTEGER DEFAULT 0,
  estimated_lost_revenue  DECIMAL(10, 2) DEFAULT 0.00,
  computed_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS dsp_store_id_idx   ON dead_seat_patterns (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS dsp_store_slot_uidx ON dead_seat_patterns (store_id, day_of_week, hour_start);

-- ─── 23. Client data architecture tables ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  first_name          TEXT NOT NULL DEFAULT '',
  last_name           TEXT NOT NULL DEFAULT '',
  full_name           TEXT NOT NULL DEFAULT '',
  preferred_name      TEXT,
  date_of_birth       TEXT,
  allergies           TEXT,
  gender              TEXT,
  preferred_staff_id  INTEGER REFERENCES staff(id),
  client_status       TEXT NOT NULL DEFAULT 'active',
  source              TEXT DEFAULT 'manual',
  referral_source     TEXT,
  avatar_url          TEXT,
  total_visits        INTEGER NOT NULL DEFAULT 0,
  total_spent_cents   INTEGER NOT NULL DEFAULT 0,
  last_visit_at       TIMESTAMP,
  next_appointment_at TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMP DEFAULT NOW() NOT NULL,
  archived_at         TIMESTAMP
);
CREATE INDEX IF NOT EXISTS clients_store_id_idx  ON clients (store_id);
CREATE INDEX IF NOT EXISTS clients_full_name_idx ON clients (full_name);
CREATE INDEX IF NOT EXISTS clients_status_idx    ON clients (client_status);
CREATE INDEX IF NOT EXISTS clients_last_visit_idx ON clients (last_visit_at);

CREATE TABLE IF NOT EXISTS client_emails (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email_address     TEXT NOT NULL,
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  verified          BOOLEAN NOT NULL DEFAULT false,
  marketing_opt_in  BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_emails_client_id_idx ON client_emails (client_id);
CREATE INDEX IF NOT EXISTS client_emails_address_idx   ON client_emails (email_address);

CREATE TABLE IF NOT EXISTS client_phones (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone_number_e164   TEXT NOT NULL,
  display_phone       TEXT,
  phone_type          TEXT NOT NULL DEFAULT 'mobile',
  sms_opt_in          BOOLEAN NOT NULL DEFAULT true,
  verified            BOOLEAN NOT NULL DEFAULT false,
  is_primary          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_phones_client_id_idx ON client_phones (client_id);
CREATE INDEX IF NOT EXISTS client_phones_e164_idx      ON client_phones (phone_number_e164);

CREATE TABLE IF NOT EXISTS client_addresses (
  id            SERIAL PRIMARY KEY,
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT DEFAULT 'US',
  address_type  TEXT NOT NULL DEFAULT 'home',
  created_at    TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_addresses_client_id_idx ON client_addresses (client_id);

CREATE TABLE IF NOT EXISTS client_tags (
  id         SERIAL PRIMARY KEY,
  store_id   INTEGER NOT NULL REFERENCES locations(id),
  tag_name   TEXT NOT NULL,
  tag_color  TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_tags_store_id_idx    ON client_tags (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_tags_store_name_uidx ON client_tags (store_id, tag_name);

CREATE TABLE IF NOT EXISTS client_tag_relationships (
  id         SERIAL PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES client_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_tag_rel_client_idx ON client_tag_relationships (client_id);
CREATE INDEX IF NOT EXISTS client_tag_rel_tag_idx    ON client_tag_relationships (tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_tag_rel_uidx ON client_tag_relationships (client_id, tag_id);

CREATE TABLE IF NOT EXISTS client_notes (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  created_by_user_id  TEXT REFERENCES users(id),
  note_type           TEXT NOT NULL DEFAULT 'general',
  visibility          TEXT NOT NULL DEFAULT 'internal',
  note_content        TEXT NOT NULL,
  pinned              BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_notes_client_id_idx ON client_notes (client_id);
CREATE INDEX IF NOT EXISTS client_notes_store_id_idx  ON client_notes (store_id);
CREATE INDEX IF NOT EXISTS client_notes_pinned_idx    ON client_notes (pinned);

CREATE TABLE IF NOT EXISTS client_marketing_preferences (
  id                        SERIAL PRIMARY KEY,
  client_id                 INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  sms_marketing_opt_in      BOOLEAN NOT NULL DEFAULT true,
  email_marketing_opt_in    BOOLEAN NOT NULL DEFAULT true,
  promotional_notifications BOOLEAN NOT NULL DEFAULT true,
  appointment_reminders     BOOLEAN NOT NULL DEFAULT true,
  birthday_messages         BOOLEAN NOT NULL DEFAULT true,
  review_requests           BOOLEAN NOT NULL DEFAULT true,
  updated_at                TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_mkt_prefs_client_idx ON client_marketing_preferences (client_id);

CREATE TABLE IF NOT EXISTS client_custom_fields (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  field_name          TEXT NOT NULL,
  field_type          TEXT NOT NULL DEFAULT 'text',
  field_options_json  JSONB,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_custom_fields_store_idx ON client_custom_fields (store_id);

CREATE TABLE IF NOT EXISTS client_custom_field_values (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  custom_field_id INTEGER NOT NULL REFERENCES client_custom_fields(id) ON DELETE CASCADE,
  field_value     TEXT,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_cfv_client_idx ON client_custom_field_values (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_cfv_uidx ON client_custom_field_values (client_id, custom_field_id);

CREATE TABLE IF NOT EXISTS client_audit_logs (
  id             SERIAL PRIMARY KEY,
  client_id      INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  store_id       INTEGER NOT NULL REFERENCES locations(id),
  action_type    TEXT NOT NULL,
  actor_user_id  TEXT REFERENCES users(id),
  metadata_json  JSONB,
  ip_address     TEXT,
  created_at     TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_audit_client_idx  ON client_audit_logs (client_id);
CREATE INDEX IF NOT EXISTS client_audit_store_idx   ON client_audit_logs (store_id);
CREATE INDEX IF NOT EXISTS client_audit_action_idx  ON client_audit_logs (action_type);
CREATE INDEX IF NOT EXISTS client_audit_created_idx ON client_audit_logs (created_at);

CREATE TABLE IF NOT EXISTS client_export_jobs (
  id                     SERIAL PRIMARY KEY,
  store_id               INTEGER NOT NULL REFERENCES locations(id),
  requested_by_user_id   TEXT REFERENCES users(id),
  format                 TEXT NOT NULL DEFAULT 'csv',
  status                 TEXT NOT NULL DEFAULT 'pending',
  filter_json            JSONB,
  total_rows             INTEGER,
  download_url           TEXT,
  error_message          TEXT,
  expires_at             TIMESTAMP,
  created_at             TIMESTAMP DEFAULT NOW() NOT NULL,
  completed_at           TIMESTAMP
);
CREATE INDEX IF NOT EXISTS client_export_jobs_store_idx   ON client_export_jobs (store_id);
CREATE INDEX IF NOT EXISTS client_export_jobs_status_idx  ON client_export_jobs (status);

CREATE TABLE IF NOT EXISTS client_import_jobs (
  id                     SERIAL PRIMARY KEY,
  store_id               INTEGER NOT NULL REFERENCES locations(id),
  requested_by_user_id   TEXT REFERENCES users(id),
  status                 TEXT NOT NULL DEFAULT 'pending',
  file_name              TEXT,
  total_rows             INTEGER DEFAULT 0,
  imported_rows          INTEGER DEFAULT 0,
  skipped_rows           INTEGER DEFAULT 0,
  error_rows             INTEGER DEFAULT 0,
  duplicates_found       INTEGER DEFAULT 0,
  preview_json           JSONB,
  errors_json            JSONB,
  field_mapping_json     JSONB,
  created_at             TIMESTAMP DEFAULT NOW() NOT NULL,
  completed_at           TIMESTAMP
);
CREATE INDEX IF NOT EXISTS client_import_jobs_store_idx   ON client_import_jobs (store_id);
CREATE INDEX IF NOT EXISTS client_import_jobs_status_idx  ON client_import_jobs (status);

-- ─── 24. api_keys table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id),
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  scopes       TEXT DEFAULT 'read',
  is_active    BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  expires_at   TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_store_id ON api_keys (store_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON api_keys (key_hash);

-- ─── 25. campaigns table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES locations(id),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  channel           TEXT NOT NULL DEFAULT 'sms',
  audience          TEXT NOT NULL DEFAULT 'all',
  audience_value    TEXT,
  message_template  TEXT NOT NULL,
  scheduled_at      TIMESTAMP,
  sent_at           TIMESTAMP,
  sent_count        INTEGER DEFAULT 0,
  failed_count      INTEGER DEFAULT 0,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_store_id ON campaigns (store_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status   ON campaigns (status);

-- ─── 26. names table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS names (
  id     SERIAL PRIMARY KEY,
  name   VARCHAR(100) NOT NULL,
  origin VARCHAR(32) NOT NULL,
  gender VARCHAR(16) NOT NULL DEFAULT 'female'
);
CREATE INDEX IF NOT EXISTS idx_names_origin ON names (origin);
CREATE UNIQUE INDEX IF NOT EXISTS idx_names_name_origin_unique ON names (name, origin);

-- ─── 27. onboarding_submissions + subdomains ──────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id                   SERIAL PRIMARY KEY,
  email                TEXT,
  contact_email        TEXT,
  business_name        TEXT,
  template_id          TEXT,
  phone                TEXT,
  address_line1        TEXT,
  address_line2        TEXT,
  city                 TEXT,
  county_state         TEXT,
  postcode             TEXT,
  country              TEXT DEFAULT 'GB',
  hours                JSONB,
  booking_enabled      BOOLEAN DEFAULT false,
  domain_type          TEXT DEFAULT 'subdomain',
  subdomain            TEXT,
  custom_domain        TEXT,
  domain_payment_status TEXT DEFAULT 'n/a',
  hero_image           TEXT,
  plan                 TEXT DEFAULT 'free',
  powered_by_certxa    BOOLEAN DEFAULT true,
  status               TEXT DEFAULT 'pending',
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subdomains (
  id            SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES onboarding_submissions(id),
  slug          TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── 28. sms_conversations table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_conversations (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id),
  client_phone TEXT NOT NULL,
  client_name  TEXT,
  direction    TEXT NOT NULL,
  body         TEXT NOT NULL,
  twilio_sid   TEXT,
  read_at      TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS sms_conv_store_phone_idx   ON sms_conversations (store_id, client_phone);
CREATE INDEX IF NOT EXISTS sms_conv_store_created_idx ON sms_conversations (store_id, created_at);

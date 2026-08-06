-- ============================================================
-- CERTXA — FULL SCHEMA (safe to run on existing DB)
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Run with: psql $DATABASE_URL -f schema.sql
-- ============================================================

-- ── Auth ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions(expire);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  password VARCHAR NOT NULL,
  google_id VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR,
  profile_image_url VARCHAR,
  role VARCHAR DEFAULT 'owner',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  staff_id INTEGER,
  permissions JSONB,
  onboarding_completed BOOLEAN DEFAULT false,
  password_changed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  subscription_status VARCHAR(20) DEFAULT 'active',
  trial_started_at TIMESTAMP,
  trial_ends_at TIMESTAMP
);

-- ── Core ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  address TEXT,
  phone TEXT,
  email TEXT,
  category TEXT,
  city TEXT,
  state TEXT,
  postcode TEXT,
  booking_slug TEXT UNIQUE,
  booking_theme TEXT DEFAULT 'simple',
  commission_payout_frequency TEXT DEFAULT 'monthly',
  sms_tokens INTEGER NOT NULL DEFAULT 0,
  sms_allowance INTEGER NOT NULL DEFAULT 0,
  sms_credits INTEGER NOT NULL DEFAULT 0,
  sms_credits_total_purchased INTEGER NOT NULL DEFAULT 0,
  user_id TEXT REFERENCES users(id),
  account_status TEXT DEFAULT 'Active',
  store_latitude TEXT,
  store_longitude TEXT,
  website TEXT,
  yelp_alias TEXT,
  facebook_page_id TEXT,
  late_grace_period_minutes INTEGER NOT NULL DEFAULT 10,
  cancellation_hours_cutoff INTEGER NOT NULL DEFAULT 24,
  pos_enabled BOOLEAN NOT NULL DEFAULT true,
  weekly_digest_opt_out BOOLEAN NOT NULL DEFAULT false,
  parking_options JSONB DEFAULT '[]',
  accessibility_features JSONB DEFAULT '[]',
  beverage_options JSONB,
  platform_credits DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  sales_tax_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  stripe_customer_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_locations_stripe_customer_id ON locations(stripe_customer_id);

CREATE TABLE IF NOT EXISTS business_hours (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  day_of_week INTEGER NOT NULL,
  open_time TEXT NOT NULL DEFAULT '09:00',
  close_time TEXT NOT NULL DEFAULT '17:00',
  is_closed BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS service_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  store_id INTEGER REFERENCES locations(id),
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL,
  category_id INTEGER REFERENCES service_categories(id),
  image_url TEXT,
  store_id INTEGER REFERENCES locations(id),
  deposit_required BOOLEAN DEFAULT false,
  deposit_amount DECIMAL(10,2)
);

CREATE TABLE IF NOT EXISTS addons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration INTEGER NOT NULL,
  image_url TEXT,
  store_id INTEGER REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'stylist',
  bio TEXT,
  color TEXT DEFAULT '#3b82f6',
  avatar_url TEXT,
  commission_enabled BOOLEAN DEFAULT false,
  commission_rate DECIMAL(5,2) DEFAULT 0,
  store_id INTEGER REFERENCES locations(id),
  password TEXT,
  permissions JSONB,
  status TEXT DEFAULT 'active',
  employment_type TEXT DEFAULT 'stylist',
  invite_token TEXT,
  invite_expires_at TIMESTAMP,
  invited_at TIMESTAMP,
  joined_at TIMESTAMP,
  removed_at TIMESTAMP,
  invited_by_user_id TEXT,
  mailing_address1 TEXT,
  mailing_address2 TEXT,
  mailing_city TEXT,
  mailing_state TEXT,
  mailing_zip TEXT,
  mailing_country TEXT,
  show_on_calendar BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  birthday TEXT,
  allergies TEXT,
  marketing_opt_in BOOLEAN DEFAULT true,
  loyalty_points INTEGER DEFAULT 0,
  store_id INTEGER REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  duration INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  cancellation_reason TEXT,
  payment_method TEXT,
  tip_amount DECIMAL(10,2),
  discount_amount DECIMAL(10,2),
  total_paid DECIMAL(10,2),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  service_id INTEGER REFERENCES services(id),
  staff_id INTEGER REFERENCES staff(id),
  customer_id INTEGER REFERENCES customers(id),
  store_id INTEGER REFERENCES locations(id),
  recurrence_rule TEXT,
  recurrence_parent_id INTEGER,
  deposit_required BOOLEAN DEFAULT false,
  deposit_amount DECIMAL(10,2),
  deposit_paid BOOLEAN DEFAULT false,
  gift_card_id INTEGER,
  gift_card_amount DECIMAL(10,2),
  loyalty_points_earned INTEGER DEFAULT 0,
  loyalty_points_redeemed INTEGER DEFAULT 0,
  client_requested_staff BOOLEAN NOT NULL DEFAULT false,
  calendar_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_addons (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id),
  addon_id INTEGER NOT NULL REFERENCES addons(id)
);

CREATE TABLE IF NOT EXISTS appointment_addons (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id),
  addon_id INTEGER NOT NULL REFERENCES addons(id)
);

CREATE TABLE IF NOT EXISTS staff_services (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  service_id INTEGER NOT NULL REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS staff_availability (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  price DECIMAL(10,2) NOT NULL,
  purchase_price DECIMAL(10,2),
  stock INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  category TEXT,
  upc TEXT,
  store_id INTEGER REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  opened_at TIMESTAMP NOT NULL,
  closed_at TIMESTAMP,
  opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  closing_balance DECIMAL(10,2),
  denomination_breakdown TEXT,
  opening_denomination_breakdown TEXT,
  reported_card_sales DECIMAL(10,2),
  prior_closing_mismatch BOOLEAN NOT NULL DEFAULT false,
  prior_closing_variance DECIMAL(10,2),
  prior_closing_resolved_by TEXT,
  prior_closing_resolved_at TIMESTAMP,
  prior_closing_resolution_notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  opened_by TEXT,
  closed_by TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS drawer_actions (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES cash_drawer_sessions(id),
  type TEXT NOT NULL,
  amount DECIMAL(10,2),
  reason TEXT,
  performed_by TEXT,
  performed_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  start_of_week TEXT NOT NULL DEFAULT 'monday',
  time_slot_interval INTEGER NOT NULL DEFAULT 15,
  non_working_hours_display INTEGER NOT NULL DEFAULT 1,
  allow_booking_outside_hours BOOLEAN NOT NULL DEFAULT true,
  auto_complete_appointments BOOLEAN NOT NULL DEFAULT true,
  auto_mark_no_shows BOOLEAN NOT NULL DEFAULT false,
  show_prices BOOLEAN NOT NULL DEFAULT true,
  walk_ins_enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sms_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_phone_number TEXT,
  booking_confirmation_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_hours_before INTEGER NOT NULL DEFAULT 24,
  review_request_enabled BOOLEAN NOT NULL DEFAULT false,
  google_review_url TEXT,
  confirmation_template TEXT,
  reminder_template TEXT,
  review_template TEXT
);

CREATE TABLE IF NOT EXISTS sms_log (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  appointment_id INTEGER REFERENCES appointments(id),
  customer_id INTEGER REFERENCES customers(id),
  phone TEXT NOT NULL,
  message_type TEXT NOT NULL,
  message_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  twilio_sid TEXT,
  error_message TEXT,
  sent_at TIMESTAMP NOT NULL,
  sms_source TEXT,
  cost_estimate DECIMAL(10,4) DEFAULT 0.0100
);

CREATE TABLE IF NOT EXISTS mail_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  mailgun_api_key TEXT,
  mailgun_domain TEXT,
  sender_email TEXT,
  booking_confirmation_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_hours_before INTEGER NOT NULL DEFAULT 24,
  review_request_enabled BOOLEAN NOT NULL DEFAULT false,
  google_review_url TEXT,
  confirmation_template TEXT,
  reminder_template TEXT,
  review_template TEXT
);

CREATE TABLE IF NOT EXISTS stripe_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  publishable_key TEXT,
  secret_key TEXT,
  test_magstripe_enabled BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_settings_store_id_uidx ON stripe_settings(store_id);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS permissions_store_id_idx ON permissions(store_id);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS roles_store_id_idx ON roles(store_id);
CREATE INDEX IF NOT EXISTS roles_name_store_idx ON roles(name, store_id);

CREATE TABLE IF NOT EXISTS app (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  app_name TEXT NOT NULL,
  active BOOLEAN DEFAULT false,
  active_date TIMESTAMP,
  user_pin TEXT,
  permissions INTEGER
);
CREATE INDEX IF NOT EXISTS app_store_id_idx ON app(store_id);
CREATE INDEX IF NOT EXISTS app_store_app_unique_idx ON app(store_id, app_name);

CREATE TABLE IF NOT EXISTS staff_settings (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  store_id INTEGER NOT NULL REFERENCES locations(id),
  preferences TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_settings_staff_id_uidx ON staff_settings(staff_id);
CREATE INDEX IF NOT EXISTS staff_settings_store_id_idx ON staff_settings(store_id);

CREATE TABLE IF NOT EXISTS store_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  preferences TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_settings_store_id_uidx ON store_settings(store_id);

-- ── Google Business ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_business_profiles (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  google_account_email TEXT,
  business_name TEXT,
  business_account_id TEXT,
  business_account_resource_name TEXT,
  location_id TEXT,
  location_resource_name TEXT,
  location_address TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  is_connected BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS google_business_profiles_store_id_idx ON google_business_profiles(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS google_business_profiles_store_id_uidx ON google_business_profiles(store_id);

ALTER TABLE google_business_profiles ADD COLUMN IF NOT EXISTS business_account_resource_name TEXT;
ALTER TABLE google_business_profiles ADD COLUMN IF NOT EXISTS location_address TEXT;

CREATE TABLE IF NOT EXISTS google_business_accounts (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  google_account_id TEXT NOT NULL,
  account_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  scopes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gba_store_id_idx ON google_business_accounts(store_id);
CREATE INDEX IF NOT EXISTS gba_user_id_idx ON google_business_accounts(user_id);
CREATE INDEX IF NOT EXISTS gba_google_account_id_idx ON google_business_accounts(google_account_id);

CREATE TABLE IF NOT EXISTS google_business_locations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  business_account_id INTEGER NOT NULL REFERENCES google_business_accounts(id),
  location_resource_name TEXT NOT NULL,
  location_id TEXT NOT NULL,
  location_name TEXT,
  address TEXT,
  phone TEXT,
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gbl_store_id_idx ON google_business_locations(store_id);
CREATE INDEX IF NOT EXISTS gbl_user_id_idx ON google_business_locations(user_id);
CREATE INDEX IF NOT EXISTS gbl_business_account_id_idx ON google_business_locations(business_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS gbl_location_resource_name_uidx ON google_business_locations(location_resource_name);

CREATE TABLE IF NOT EXISTS google_business_sync_logs (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES locations(id),
  user_id VARCHAR REFERENCES users(id),
  location_id INTEGER REFERENCES google_business_locations(id),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  reviews_synced INTEGER,
  synced_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gbsl_store_id_idx ON google_business_sync_logs(store_id);
CREATE INDEX IF NOT EXISTS gbsl_location_id_idx ON google_business_sync_logs(location_id);
CREATE INDEX IF NOT EXISTS gbsl_synced_at_idx ON google_business_sync_logs(synced_at);

CREATE TABLE IF NOT EXISTS google_reviews (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  google_review_id TEXT UNIQUE NOT NULL,
  google_location_id TEXT,
  gb_location_id INTEGER REFERENCES google_business_locations(id),
  customer_name TEXT,
  customer_phone_number TEXT,
  rating INTEGER NOT NULL,
  review_text TEXT,
  review_image_urls TEXT,
  review_create_time TIMESTAMP,
  review_update_time TIMESTAMP,
  reviewer_language_code TEXT,
  review_publishing_status TEXT DEFAULT 'published',
  response_status TEXT DEFAULT 'not_responded',
  appointment_id INTEGER REFERENCES appointments(id),
  customer_id INTEGER REFERENCES customers(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS google_reviews_store_id_idx ON google_reviews(store_id);
CREATE INDEX IF NOT EXISTS google_reviews_google_review_id_idx ON google_reviews(google_review_id);
CREATE INDEX IF NOT EXISTS google_reviews_rating_idx ON google_reviews(rating);
CREATE INDEX IF NOT EXISTS google_reviews_response_status_idx ON google_reviews(response_status);

ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS gb_location_id INTEGER REFERENCES google_business_locations(id);
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS customer_phone_number TEXT;
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS review_image_urls TEXT;
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS reviewer_language_code TEXT;

CREATE TABLE IF NOT EXISTS google_review_responses (
  id SERIAL PRIMARY KEY,
  google_review_id INTEGER NOT NULL REFERENCES google_reviews(id),
  store_id INTEGER NOT NULL REFERENCES locations(id),
  response_text TEXT NOT NULL,
  response_status TEXT NOT NULL,
  staff_id INTEGER REFERENCES staff(id),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS google_review_responses_google_review_id_idx ON google_review_responses(google_review_id);
CREATE INDEX IF NOT EXISTS google_review_responses_store_id_idx ON google_review_responses(store_id);
CREATE INDEX IF NOT EXISTS google_review_responses_response_status_idx ON google_review_responses(response_status);

-- ── Misc features ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  service_id INTEGER REFERENCES services(id),
  staff_id INTEGER REFERENCES staff(id),
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  preferred_date TIMESTAMP,
  preferred_time_start TEXT,
  preferred_time_end TEXT,
  notes TEXT,
  party_size INTEGER DEFAULT 1,
  status TEXT DEFAULT 'waiting',
  notified_at TIMESTAMP,
  called_at TIMESTAMP,
  completed_at TIMESTAMP,
  customer_latitude TEXT,
  customer_longitude TEXT,
  sms_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_cards (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  code TEXT NOT NULL UNIQUE,
  original_amount DECIMAL(10,2) NOT NULL,
  remaining_balance DECIMAL(10,2) NOT NULL,
  issued_to_name TEXT,
  issued_to_email TEXT,
  purchased_by_customer_id INTEGER REFERENCES customers(id),
  recipient_customer_id INTEGER REFERENCES customers(id),
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id SERIAL PRIMARY KEY,
  gift_card_id INTEGER NOT NULL REFERENCES gift_cards(id),
  store_id INTEGER NOT NULL REFERENCES locations(id),
  appointment_id INTEGER REFERENCES appointments(id),
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_forms (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  require_before_booking BOOLEAN DEFAULT false,
  service_id INTEGER REFERENCES services(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_form_fields (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id),
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  options TEXT,
  required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS intake_form_responses (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id),
  store_id INTEGER NOT NULL REFERENCES locations(id),
  customer_id INTEGER REFERENCES customers(id),
  appointment_id INTEGER REFERENCES appointments(id),
  customer_name TEXT,
  responses TEXT NOT NULL,
  submitted_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  appointment_id INTEGER REFERENCES appointments(id),
  type TEXT NOT NULL,
  points INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  opted_out_at TIMESTAMP DEFAULT NOW(),
  opted_back_in_at TIMESTAMP,
  is_opted_out BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  customer_id INTEGER REFERENCES customers(id),
  appointment_id INTEGER REFERENCES appointments(id),
  staff_id INTEGER REFERENCES staff(id),
  rating INTEGER NOT NULL,
  comment TEXT,
  customer_name TEXT,
  service_name TEXT,
  staff_name TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Pro / Field Service ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pro_crews (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#00D4AA',
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  phone TEXT,
  pin_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_crew_locations (
  id SERIAL PRIMARY KEY,
  crew_id INTEGER NOT NULL REFERENCES pro_crews(id),
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_service_orders (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  service_type TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  description TEXT,
  crew_id INTEGER REFERENCES pro_crews(id),
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  estimated_hours DECIMAL(4,1),
  overtime_flagged BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_order_notes (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pro_service_orders(id),
  store_id INTEGER NOT NULL REFERENCES locations(id),
  note TEXT NOT NULL,
  author_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_customers (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  property_type TEXT DEFAULT 'residential',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_estimates (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  estimate_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  customer_id INTEGER REFERENCES pro_customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  service_type TEXT,
  description TEXT,
  line_items TEXT,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  converted_to_order_id INTEGER,
  valid_until TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_invoices (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  order_id INTEGER REFERENCES pro_service_orders(id),
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  address TEXT,
  line_items TEXT,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  paid_at TIMESTAMP,
  due_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── Pro Leads / SEO ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pro_leads (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  business_name VARCHAR(255),
  industry VARCHAR(100),
  team_size VARCHAR(50),
  message TEXT,
  source VARCHAR(100) DEFAULT 'pro-hub',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seo_regions (
  id SERIAL PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  state_code VARCHAR(10) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  phone VARCHAR(30),
  zip VARCHAR(20),
  product VARCHAR(20) NOT NULL DEFAULT 'booking',
  business_type VARCHAR(100),
  business_types TEXT,
  nearby_cities TEXT,
  meta_title TEXT,
  meta_desc TEXT,
  h1_override TEXT,
  page_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── Names / Onboarding / SMS Inbox ───────────────────────────
CREATE TABLE IF NOT EXISTS names (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  origin VARCHAR(32) NOT NULL,
  gender VARCHAR(16) NOT NULL DEFAULT 'female'
);
CREATE INDEX IF NOT EXISTS idx_names_origin ON names(origin);
CREATE UNIQUE INDEX IF NOT EXISTS idx_names_name_origin_unique ON names(name, origin);

CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id SERIAL PRIMARY KEY,
  email TEXT,
  contact_email TEXT,
  business_name TEXT,
  template_id TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  county_state TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'GB',
  hours JSONB,
  booking_enabled BOOLEAN DEFAULT false,
  domain_type TEXT DEFAULT 'subdomain',
  subdomain TEXT,
  custom_domain TEXT,
  domain_payment_status TEXT DEFAULT 'n/a',
  hero_image TEXT,
  plan TEXT DEFAULT 'free',
  powered_by_certxa BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subdomains (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES onboarding_submissions(id),
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_conversations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  client_phone TEXT NOT NULL,
  client_name TEXT,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  twilio_sid TEXT,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sms_conv_store_phone_idx ON sms_conversations(store_id, client_phone);
CREATE INDEX IF NOT EXISTS sms_conv_store_created_idx ON sms_conversations(store_id, created_at);

-- ── Clients CRM ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  preferred_name TEXT,
  date_of_birth TEXT,
  allergies TEXT,
  gender TEXT,
  preferred_staff_id INTEGER REFERENCES staff(id),
  client_status TEXT NOT NULL DEFAULT 'active',
  source TEXT DEFAULT 'manual',
  referral_source TEXT,
  avatar_url TEXT,
  total_visits INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMP,
  next_appointment_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS clients_store_id_idx ON clients(store_id);
CREATE INDEX IF NOT EXISTS clients_full_name_idx ON clients(full_name);
CREATE INDEX IF NOT EXISTS clients_status_idx ON clients(client_status);
CREATE INDEX IF NOT EXISTS clients_last_visit_idx ON clients(last_visit_at);

CREATE TABLE IF NOT EXISTS client_emails (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_emails_client_id_idx ON client_emails(client_id);
CREATE INDEX IF NOT EXISTS client_emails_address_idx ON client_emails(email_address);

CREATE TABLE IF NOT EXISTS client_phones (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone_number_e164 TEXT NOT NULL,
  display_phone TEXT,
  phone_type TEXT NOT NULL DEFAULT 'mobile',
  sms_opt_in BOOLEAN NOT NULL DEFAULT true,
  verified BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_phones_client_id_idx ON client_phones(client_id);
CREATE INDEX IF NOT EXISTS client_phones_e164_idx ON client_phones(phone_number_e164);

CREATE TABLE IF NOT EXISTS client_addresses (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  address_type TEXT NOT NULL DEFAULT 'home',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_addresses_client_id_idx ON client_addresses(client_id);

CREATE TABLE IF NOT EXISTS client_tags (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  tag_name TEXT NOT NULL,
  tag_color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_tags_store_id_idx ON client_tags(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_tags_store_name_uidx ON client_tags(store_id, tag_name);

CREATE TABLE IF NOT EXISTS client_tag_relationships (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES client_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_tag_rel_client_idx ON client_tag_relationships(client_id);
CREATE INDEX IF NOT EXISTS client_tag_rel_tag_idx ON client_tag_relationships(tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_tag_rel_uidx ON client_tag_relationships(client_id, tag_id);

CREATE TABLE IF NOT EXISTS client_notes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  created_by_user_id TEXT REFERENCES users(id),
  note_type TEXT NOT NULL DEFAULT 'general',
  visibility TEXT NOT NULL DEFAULT 'internal',
  note_content TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_notes_client_id_idx ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS client_notes_store_id_idx ON client_notes(store_id);
CREATE INDEX IF NOT EXISTS client_notes_pinned_idx ON client_notes(pinned);

CREATE TABLE IF NOT EXISTS client_marketing_preferences (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  sms_marketing_opt_in BOOLEAN NOT NULL DEFAULT true,
  email_marketing_opt_in BOOLEAN NOT NULL DEFAULT true,
  promotional_notifications BOOLEAN NOT NULL DEFAULT true,
  appointment_reminders BOOLEAN NOT NULL DEFAULT true,
  birthday_messages BOOLEAN NOT NULL DEFAULT true,
  review_requests BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_mkt_prefs_client_idx ON client_marketing_preferences(client_id);

CREATE TABLE IF NOT EXISTS client_custom_fields (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  field_options_json JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_custom_fields_store_idx ON client_custom_fields(store_id);

CREATE TABLE IF NOT EXISTS client_custom_field_values (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  custom_field_id INTEGER NOT NULL REFERENCES client_custom_fields(id) ON DELETE CASCADE,
  field_value TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_cfv_client_idx ON client_custom_field_values(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_cfv_uidx ON client_custom_field_values(client_id, custom_field_id);

CREATE TABLE IF NOT EXISTS client_audit_logs (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  action_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  metadata_json JSONB,
  ip_address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_audit_client_idx ON client_audit_logs(client_id);
CREATE INDEX IF NOT EXISTS client_audit_store_idx ON client_audit_logs(store_id);
CREATE INDEX IF NOT EXISTS client_audit_action_idx ON client_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS client_audit_created_idx ON client_audit_logs(created_at);

CREATE TABLE IF NOT EXISTS client_export_jobs (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  requested_by_user_id TEXT REFERENCES users(id),
  format TEXT NOT NULL DEFAULT 'csv',
  status TEXT NOT NULL DEFAULT 'pending',
  filter_json JSONB,
  total_rows INTEGER,
  download_url TEXT,
  error_message TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS client_export_jobs_store_idx ON client_export_jobs(store_id);
CREATE INDEX IF NOT EXISTS client_export_jobs_status_idx ON client_export_jobs(status);

CREATE TABLE IF NOT EXISTS client_import_jobs (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  requested_by_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  file_name TEXT,
  total_rows INTEGER DEFAULT 0,
  imported_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  duplicates_found INTEGER DEFAULT 0,
  preview_json JSONB,
  errors_json JSONB,
  field_mapping_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS client_import_jobs_store_idx ON client_import_jobs(store_id);
CREATE INDEX IF NOT EXISTS client_import_jobs_status_idx ON client_import_jobs(status);

-- ── API Keys / Campaigns ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT DEFAULT 'read',
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_store_id ON api_keys(store_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  channel TEXT NOT NULL DEFAULT 'sms',
  audience TEXT NOT NULL DEFAULT 'all',
  audience_value TEXT,
  message_template TEXT NOT NULL,
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_store_id ON campaigns(store_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- ── Billing ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_plans (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents DECIMAL(12,0) NOT NULL,
  contacts_min DECIMAL(12,0),
  contacts_max DECIMAL(12,0),
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  interval TEXT DEFAULT 'month',
  sms_credits DECIMAL(12,0),
  currency TEXT DEFAULT 'usd',
  active BOOLEAN DEFAULT true,
  features_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_customers (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  customer_id TEXT NOT NULL UNIQUE,
  store_number INTEGER REFERENCES locations(id) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id ON stripe_customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_store_number ON stripe_customers(store_number);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  subscription_id TEXT,
  price_id TEXT,
  current_period_start BIGINT,
  current_period_end BIGINT,
  cancel_at_period_end BOOLEAN DEFAULT false,
  payment_method_brand TEXT,
  payment_method_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_subs_customer_id ON stripe_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subs_subscription_id ON stripe_subscriptions(subscription_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  store_number INTEGER NOT NULL REFERENCES locations(id),
  plan_code TEXT NOT NULL REFERENCES billing_plans(code),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT,
  current_period_end TEXT,
  current_period_start TEXT,
  interval TEXT DEFAULT 'month',
  price_id TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  payment_method_brand TEXT,
  payment_method_last4 TEXT,
  seat_quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_number ON subscriptions(store_number);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON subscriptions(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS stripe_orders (
  id SERIAL PRIMARY KEY,
  checkout_session_id TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  amount_subtotal BIGINT NOT NULL,
  amount_total BIGINT NOT NULL,
  currency TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_customer_id ON stripe_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_checkout_session ON stripe_orders(checkout_session_id);

CREATE TABLE IF NOT EXISTS scheduled_plan_changes (
  id SERIAL PRIMARY KEY,
  stripe_subscription_id TEXT NOT NULL,
  new_plan_code TEXT NOT NULL REFERENCES billing_plans(code),
  interval TEXT,
  effective_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_plan_changes_sub_id ON scheduled_plan_changes(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS customer_billing_profiles (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  salon_id INTEGER REFERENCES locations(id),
  stripe_customer_id TEXT UNIQUE,
  default_payment_method_id TEXT,
  customer_email TEXT,
  customer_name TEXT,
  billing_phone TEXT,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  billing_country TEXT DEFAULT 'US',
  tax_exempt_status TEXT DEFAULT 'none',
  preferred_currency TEXT DEFAULT 'usd',
  current_plan_id INTEGER REFERENCES billing_plans(id),
  current_subscription_status TEXT DEFAULT 'none',
  trial_ends_at TIMESTAMP,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMP,
  subscription_started_at TIMESTAMP,
  lifetime_value_cents BIGINT DEFAULT 0,
  total_successful_payments INTEGER DEFAULT 0,
  total_failed_payments INTEGER DEFAULT 0,
  last_payment_date TIMESTAMP,
  last_payment_amount_cents BIGINT,
  last_failed_payment_date TIMESTAMP,
  last_failed_payment_reason TEXT,
  delinquent BOOLEAN DEFAULT false,
  account_hold BOOLEAN DEFAULT false,
  internal_billing_notes TEXT,
  account_status TEXT DEFAULT 'active',
  suspended_at TIMESTAMP,
  locked_at TIMESTAMP,
  suspended_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cbp_user_id ON customer_billing_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_cbp_salon_id ON customer_billing_profiles(salon_id);
CREATE INDEX IF NOT EXISTS idx_cbp_stripe_customer_id ON customer_billing_profiles(stripe_customer_id);

CREATE TABLE IF NOT EXISTS invoice_records (
  id SERIAL PRIMARY KEY,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  salon_id INTEGER REFERENCES locations(id),
  invoice_number TEXT,
  status TEXT,
  paid BOOLEAN DEFAULT false,
  attempted BOOLEAN DEFAULT false,
  forgiven BOOLEAN DEFAULT false,
  collection_method TEXT,
  currency TEXT DEFAULT 'usd',
  subtotal_cents BIGINT DEFAULT 0,
  tax_cents BIGINT DEFAULT 0,
  total_cents BIGINT DEFAULT 0,
  amount_paid_cents BIGINT DEFAULT 0,
  amount_remaining_cents BIGINT DEFAULT 0,
  hosted_invoice_url TEXT,
  invoice_pdf_url TEXT,
  billing_reason TEXT,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  due_date TIMESTAMP,
  paid_at TIMESTAMP,
  attempted_at TIMESTAMP,
  next_payment_attempt TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_records_stripe_invoice_id ON invoice_records(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_records_salon_id ON invoice_records(salon_id);
CREATE INDEX IF NOT EXISTS idx_invoice_records_stripe_customer_id ON invoice_records(stripe_customer_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id SERIAL PRIMARY KEY,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT UNIQUE,
  stripe_invoice_id TEXT,
  salon_id INTEGER REFERENCES locations(id),
  user_id TEXT REFERENCES users(id),
  status TEXT,
  payment_method_brand TEXT,
  payment_method_last4 TEXT,
  payment_method_fingerprint TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  amount_cents BIGINT DEFAULT 0,
  currency TEXT DEFAULT 'usd',
  failure_code TEXT,
  failure_message TEXT,
  receipt_url TEXT,
  refunded BOOLEAN DEFAULT false,
  refund_amount_cents BIGINT DEFAULT 0,
  dispute_status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_txn_salon_id ON payment_transactions(salon_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_stripe_charge_id ON payment_transactions(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_stripe_pi_id ON payment_transactions(stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id SERIAL PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  api_version TEXT,
  processed BOOLEAN DEFAULT false,
  processing_attempts INTEGER DEFAULT 0,
  processing_error TEXT,
  payload_json JSONB,
  received_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed ON stripe_webhook_events(processed);

CREATE TABLE IF NOT EXISTS billing_activity_logs (
  id SERIAL PRIMARY KEY,
  salon_id INTEGER REFERENCES locations(id),
  user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata_json JSONB,
  source TEXT DEFAULT 'system',
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_activity_salon_id ON billing_activity_logs(salon_id);
CREATE INDEX IF NOT EXISTS idx_billing_activity_user_id ON billing_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_activity_event_type ON billing_activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_activity_created_at ON billing_activity_logs(created_at);

CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  stripe_refund_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  salon_id INTEGER REFERENCES locations(id),
  user_id TEXT REFERENCES users(id),
  initiated_by_user_id TEXT REFERENCES users(id),
  amount_cents BIGINT NOT NULL,
  currency TEXT DEFAULT 'usd',
  reason TEXT,
  internal_reason_notes TEXT,
  refund_type TEXT DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  receipt_url TEXT,
  metadata_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refunds_salon_id ON refunds(salon_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund_id ON refunds(stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_charge_id ON refunds(stripe_charge_id);

CREATE TABLE IF NOT EXISTS subscription_plan_changes (
  id SERIAL PRIMARY KEY,
  salon_id INTEGER REFERENCES locations(id),
  user_id TEXT REFERENCES users(id),
  stripe_subscription_id TEXT,
  old_plan_id INTEGER REFERENCES billing_plans(id),
  new_plan_id INTEGER REFERENCES billing_plans(id),
  old_price_cents BIGINT,
  new_price_cents BIGINT,
  change_type TEXT,
  proration_used BOOLEAN DEFAULT false,
  prorated_amount_cents BIGINT,
  effective_date TIMESTAMP,
  initiated_by TEXT,
  reason TEXT,
  metadata_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_plan_changes_salon_id ON subscription_plan_changes(salon_id);
CREATE INDEX IF NOT EXISTS idx_sub_plan_changes_stripe_sub_id ON subscription_plan_changes(stripe_subscription_id);

-- ── Revenue Intelligence Engine ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_intelligence (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  avg_visit_cadence_days DECIMAL(6,1),
  last_visit_date TIMESTAMP,
  next_expected_visit_date TIMESTAMP,
  days_since_last_visit INTEGER,
  days_overdue_pct DECIMAL(6,1),
  total_visits INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0.00,
  avg_ticket_value DECIMAL(10,2) DEFAULT 0.00,
  ltv_12_month DECIMAL(10,2) DEFAULT 0.00,
  ltv_all_time DECIMAL(10,2) DEFAULT 0.00,
  ltv_score INTEGER DEFAULT 0,
  churn_risk_score INTEGER DEFAULT 0,
  churn_risk_label TEXT DEFAULT 'low',
  no_show_count INTEGER DEFAULT 0,
  no_show_rate DECIMAL(5,2) DEFAULT 0.00,
  rebooking_rate DECIMAL(5,2) DEFAULT 0.00,
  preferred_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  preferred_day_of_week INTEGER,
  preferred_time_of_day TEXT,
  last_winback_sent_at TIMESTAMP,
  winback_sent_count INTEGER DEFAULT 0,
  is_drifting BOOLEAN DEFAULT false,
  is_at_risk BOOLEAN DEFAULT false,
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ci_store_customer_uidx UNIQUE (store_id, customer_id)
);
CREATE INDEX IF NOT EXISTS ci_store_id_idx ON client_intelligence(store_id);
CREATE INDEX IF NOT EXISTS ci_customer_id_idx ON client_intelligence(customer_id);
CREATE INDEX IF NOT EXISTS ci_churn_risk_idx ON client_intelligence(churn_risk_score);
CREATE INDEX IF NOT EXISTS ci_is_drifting_idx ON client_intelligence(is_drifting);
CREATE INDEX IF NOT EXISTS ci_is_at_risk_idx ON client_intelligence(is_at_risk);

CREATE TABLE IF NOT EXISTS staff_intelligence (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  total_appointments INTEGER DEFAULT 0,
  completed_appointments INTEGER DEFAULT 0,
  no_show_count INTEGER DEFAULT 0,
  cancellation_count INTEGER DEFAULT 0,
  rebooked_count INTEGER DEFAULT 0,
  rebooking_rate_pct DECIMAL(5,2) DEFAULT 0.00,
  avg_ticket_value DECIMAL(10,2) DEFAULT 0.00,
  total_revenue DECIMAL(10,2) DEFAULT 0.00,
  unique_clients_served INTEGER DEFAULT 0,
  client_retention_rate DECIMAL(5,2) DEFAULT 0.00,
  trend TEXT DEFAULT 'stable',
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT si_store_staff_uidx UNIQUE (store_id, staff_id)
);
ALTER TABLE staff_intelligence ADD COLUMN IF NOT EXISTS trend TEXT DEFAULT 'stable';
CREATE INDEX IF NOT EXISTS si_store_id_idx ON staff_intelligence(store_id);
CREATE INDEX IF NOT EXISTS si_staff_id_idx ON staff_intelligence(staff_id);

CREATE TABLE IF NOT EXISTS intelligence_interventions (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  intervention_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  message_body TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  triggered_by TEXT NOT NULL DEFAULT 'auto',
  metadata JSONB,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP,
  converted_at TIMESTAMP,
  appointment_id INTEGER
);
CREATE INDEX IF NOT EXISTS ii_store_id_idx ON intelligence_interventions(store_id);
CREATE INDEX IF NOT EXISTS ii_customer_id_idx ON intelligence_interventions(customer_id);
CREATE INDEX IF NOT EXISTS ii_type_idx ON intelligence_interventions(intervention_type);
CREATE INDEX IF NOT EXISTS ii_sent_at_idx ON intelligence_interventions(sent_at);

CREATE TABLE IF NOT EXISTS growth_score_snapshots (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  overall_score INTEGER NOT NULL,
  retention_score INTEGER NOT NULL,
  rebooking_score INTEGER NOT NULL,
  utilization_score INTEGER NOT NULL,
  revenue_score INTEGER NOT NULL,
  new_client_score INTEGER NOT NULL,
  active_clients INTEGER DEFAULT 0,
  drifting_clients INTEGER DEFAULT 0,
  at_risk_clients INTEGER DEFAULT 0,
  avg_rebooking_rate DECIMAL(5,2),
  seat_utilization_pct DECIMAL(5,2),
  monthly_revenue DECIMAL(10,2),
  snapshot_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS gss_store_id_idx ON growth_score_snapshots(store_id);
CREATE INDEX IF NOT EXISTS gss_snapshot_date_idx ON growth_score_snapshots(snapshot_date);

CREATE TABLE IF NOT EXISTS dead_seat_patterns (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL,
  hour_start INTEGER NOT NULL,
  avg_utilization_pct DECIMAL(5,2) DEFAULT 0.00,
  total_slots_analyzed INTEGER DEFAULT 0,
  booked_slots INTEGER DEFAULT 0,
  estimated_lost_revenue DECIMAL(10,2) DEFAULT 0.00,
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dsp_store_slot_uidx UNIQUE (store_id, day_of_week, hour_start)
);
CREATE INDEX IF NOT EXISTS dsp_store_id_idx ON dead_seat_patterns(store_id);

-- ── AI Chatbot ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Safe column additions (idempotent ALTER TABLE statements) ───────────────
-- These add columns that were introduced after the initial schema was written.
-- Using IF NOT EXISTS ensures they are safe to run on any database (new or existing).
ALTER TABLE locations ADD COLUMN IF NOT EXISTS weekly_digest_opt_out BOOLEAN NOT NULL DEFAULT false;

-- ── LaunchSite Template Catalog ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS launchsite_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  style         TEXT NOT NULL DEFAULT 'Modern',
  "desc"        TEXT NOT NULL DEFAULT '',
  badge         TEXT NOT NULL DEFAULT '',
  features      JSONB NOT NULL DEFAULT '[]'::jsonb,
  accent        TEXT NOT NULL DEFAULT '#a855f7',
  dark          TEXT NOT NULL DEFAULT '#0a0b15',
  light         TEXT NOT NULL DEFAULT '#1c1d27',
  url_slug      TEXT NOT NULL,
  hero_tagline  TEXT NOT NULL DEFAULT '',
  hero_sub      TEXT NOT NULL DEFAULT '',
  business_name TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL DEFAULT 'php',
  react_path    TEXT,
  scraped_path  TEXT,
  source_url    TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS launchsite_templates_category_idx ON launchsite_templates(category);
CREATE INDEX IF NOT EXISTS launchsite_templates_sort_idx ON launchsite_templates(sort_order, created_at);

-- ── Staff PIN Codes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_pins (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  pin TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS sp_store_pin_uidx ON staff_pins(store_id, pin);
CREATE UNIQUE INDEX IF NOT EXISTS sp_staff_store_uidx ON staff_pins(staff_id, store_id);

-- ── Time Clock (Clock In / Out) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeclock (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  clock_in TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  clock_out TIMESTAMP,
  work_date TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS tc_staff_date_idx ON timeclock(staff_id, work_date);
CREATE INDEX IF NOT EXISTS tc_store_date_idx ON timeclock(store_id, work_date);

-- ── Contractor Payroll (commission-only) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  period_start     TEXT NOT NULL,
  period_end       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  total_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
  contractor_count INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pr_store_created_idx ON payroll_runs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pr_store_status_idx  ON payroll_runs(store_id, status);

CREATE TABLE IF NOT EXISTS payroll_run_items (
  id               SERIAL PRIMARY KEY,
  payroll_run_id   INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id         INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  staff_name       TEXT NOT NULL DEFAULT '',
  commission_rate  DECIMAL(5,2) NOT NULL DEFAULT 0,
  appointment_count INTEGER NOT NULL DEFAULT 0,
  service_revenue  DECIMAL(10,2) NOT NULL DEFAULT 0,
  addon_revenue    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_revenue    DECIMAL(10,2) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
  notes            TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pri_run_idx ON payroll_run_items(payroll_run_id);

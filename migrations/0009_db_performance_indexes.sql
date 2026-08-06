-- ============================================================
-- Migration 0009: Production-Grade Performance Indexes
-- Certxa SalonOS — PostgreSQL 16
--
-- Run with:  psql $DATABASE_URL -f migrations/0009_db_performance_indexes.sql
--
-- Uses CREATE INDEX CONCURRENTLY so it can run on a live DB
-- with zero table locks. Must be executed OUTSIDE a transaction.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
-- pg_trgm powers trigram-based fuzzy search (ILIKE, similarity)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- btree_gin lets us build GIN indexes on plain scalar columns
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ============================================================
-- APPOINTMENTS  (highest-traffic table — dashboard, calendar, reports)
-- ============================================================

-- Primary tenant-isolation + date range scan (calendar view)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_store_date
  ON appointments (store_id, date DESC);

-- Status filtering within a salon (dashboard KPIs)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_store_status
  ON appointments (store_id, status);

-- Compound: salon + date + status  (dashboard today / this-week queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_store_date_status
  ON appointments (store_id, date DESC, status);

-- Staff calendar view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_staff_date
  ON appointments (staff_id, date DESC)
  WHERE staff_id IS NOT NULL;

-- Customer appointment history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_customer_date
  ON appointments (customer_id, date DESC)
  WHERE customer_id IS NOT NULL;

-- Service usage reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_service_id
  ON appointments (service_id)
  WHERE service_id IS NOT NULL;

-- Partial: only active (non-terminal) appointments — avoids scanning history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_store_active
  ON appointments (store_id, date DESC)
  WHERE status NOT IN ('completed', 'cancelled', 'no_show');

-- Revenue reporting: paid appointments within salon
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_store_completed_date
  ON appointments (store_id, date DESC)
  WHERE status = 'completed';

-- ============================================================
-- CUSTOMERS  (CRM search + tenant isolation)
-- ============================================================

-- Tenant isolation — every customer list query starts here
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_store_id
  ON customers (store_id);

-- CRM search by name within store
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_store_name
  ON customers (store_id, name);

-- Trigram GIN for fuzzy name search  (supports ILIKE '%...%', similarity())
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name_trgm
  ON customers USING GIN (name gin_trgm_ops);

-- Trigram GIN for phone lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING GIN (phone gin_trgm_ops);

-- Trigram GIN for email lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_email_trgm
  ON customers USING GIN (email gin_trgm_ops);

-- ============================================================
-- STAFF  (frequently joined; must be tenant-isolated)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_store_id
  ON staff (store_id);

-- Active staff only (used in seat-count queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_store_active
  ON staff (store_id)
  WHERE role != 'inactive';

-- Staff email lookup / auth
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_email
  ON staff (email)
  WHERE email IS NOT NULL;

-- Staff trigram (search by name in agent dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_name_trgm
  ON staff USING GIN (name gin_trgm_ops);

-- ============================================================
-- STAFF_SERVICES  (junction table — needs both FK indexes)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_services_staff_id
  ON staff_services (staff_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_services_service_id
  ON staff_services (service_id);

-- ============================================================
-- STAFF_AVAILABILITY
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_avail_staff_id
  ON staff_availability (staff_id);

-- ============================================================
-- SERVICES
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_store_id
  ON services (store_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_category_id
  ON services (category_id)
  WHERE category_id IS NOT NULL;

-- ============================================================
-- SERVICE_CATEGORIES
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_service_categories_store_id
  ON service_categories (store_id);

-- ============================================================
-- ADDONS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addons_store_id
  ON addons (store_id);

-- ============================================================
-- APPOINTMENT_ADDONS  (junction)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_addons_appt_id
  ON appointment_addons (appointment_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appt_addons_addon_id
  ON appointment_addons (addon_id);

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_store_id
  ON products (store_id);

-- Low-stock alert query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_store_stock
  ON products (store_id, stock);

-- ============================================================
-- BUSINESS_HOURS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_hours_store_id
  ON business_hours (store_id);

-- ============================================================
-- CASH_DRAWER_SESSIONS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drawer_sessions_store_date
  ON cash_drawer_sessions (store_id, opened_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drawer_sessions_store_status
  ON cash_drawer_sessions (store_id, status);

-- Partial: only open sessions (avoids scanning closed history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drawer_sessions_store_open
  ON cash_drawer_sessions (store_id)
  WHERE status = 'open';

-- ============================================================
-- DRAWER_ACTIONS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drawer_actions_session_id
  ON drawer_actions (session_id, performed_at DESC);

-- ============================================================
-- SMS_LOG  (grows fast; needs pruning-friendly indexes)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_log_store_sent
  ON sms_log (store_id, sent_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_log_appointment_id
  ON sms_log (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_log_customer_id
  ON sms_log (customer_id)
  WHERE customer_id IS NOT NULL;

-- Pending messages queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_log_pending
  ON sms_log (store_id, sent_at)
  WHERE status = 'pending';

-- ============================================================
-- WAITLIST
-- ============================================================

-- Active waitlist view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waitlist_store_status
  ON waitlist (store_id, status);

-- Timeline view (newest first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waitlist_store_created
  ON waitlist (store_id, created_at DESC);

-- Partial: hot path for active-only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waitlist_store_waiting
  ON waitlist (store_id, created_at DESC)
  WHERE status = 'waiting';

-- Queue SMS scheduler: entries needing SMS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waitlist_sms_pending
  ON waitlist (store_id, created_at)
  WHERE status = 'waiting' AND sms_sent_at IS NULL;

-- ============================================================
-- GIFT_CARDS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gift_cards_store_id
  ON gift_cards (store_id);

-- Active card lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gift_cards_store_active
  ON gift_cards (store_id, is_active);

-- Fast lookup by code within store
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gift_cards_store_code
  ON gift_cards (store_id, code);

-- ============================================================
-- GIFT_CARD_TRANSACTIONS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gct_gift_card_id
  ON gift_card_transactions (gift_card_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gct_store_created
  ON gift_card_transactions (store_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gct_appointment_id
  ON gift_card_transactions (appointment_id)
  WHERE appointment_id IS NOT NULL;

-- ============================================================
-- INTAKE_FORMS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intake_forms_store_id
  ON intake_forms (store_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intake_form_fields_form_id
  ON intake_form_fields (form_id);

-- ============================================================
-- INTAKE_FORM_RESPONSES  (grows with every booking)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ifr_store_submitted
  ON intake_form_responses (store_id, submitted_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ifr_customer_id
  ON intake_form_responses (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ifr_appointment_id
  ON intake_form_responses (appointment_id)
  WHERE appointment_id IS NOT NULL;

-- ============================================================
-- LOYALTY_TRANSACTIONS  (customer timeline + reporting)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyalty_store_customer_date
  ON loyalty_transactions (store_id, customer_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyalty_store_date
  ON loyalty_transactions (store_id, created_at DESC);

-- ============================================================
-- REVIEWS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_store_created
  ON reviews (store_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_store_rating
  ON reviews (store_id, rating);

-- Public featured reviews
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_store_public_featured
  ON reviews (store_id, is_featured, created_at DESC)
  WHERE is_public = true;

-- ============================================================
-- GOOGLE_REVIEWS
-- ============================================================

-- Compound for response-status dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_google_reviews_store_status_date
  ON google_reviews (store_id, response_status, review_create_time DESC);

-- ============================================================
-- PASSWORD_RESET_TOKENS  (security — must be fast + prunable)
-- ============================================================

-- Lookup by token value
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prt_user_id
  ON password_reset_tokens (user_id);

-- TTL pruning
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prt_expires_at
  ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

-- ============================================================
-- USERS  (auth + admin queries)
-- ============================================================

-- Subscription status filter (billing dunning)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_subscription_status
  ON users (subscription_status);

-- Trial expiry scanning
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_trial_ends_at
  ON users (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

-- Trigram on email (support agent search)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_trgm
  ON users USING GIN (email gin_trgm_ops);

-- ============================================================
-- BILLING: INVOICE_RECORDS  (grows heavily — key for support UX)
-- ============================================================

-- Fast salon invoice history with date ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_records_salon_created
  ON invoice_records (salon_id, created_at DESC);

-- Unpaid invoice filter for support/dunning
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_records_salon_paid_created
  ON invoice_records (salon_id, paid, created_at DESC);

-- Subscription-scoped invoice lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_records_stripe_sub_id
  ON invoice_records (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_records_salon_status
  ON invoice_records (salon_id, status);

-- ============================================================
-- BILLING: PAYMENT_TRANSACTIONS
-- ============================================================

-- Fast salon transaction history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_txn_salon_created
  ON payment_transactions (salon_id, created_at DESC);

-- Invoice join
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_txn_invoice_id
  ON payment_transactions (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

-- Failed payments for dunning
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_txn_salon_failed
  ON payment_transactions (salon_id, created_at DESC)
  WHERE status IN ('failed', 'requires_action', 'requires_payment_method');

-- ============================================================
-- BILLING: STRIPE_WEBHOOK_EVENTS  (high-volume; needs pruning)
-- ============================================================

-- Unprocessed event queue (partial — only unprocessed rows indexed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_unprocessed
  ON stripe_webhook_events (received_at ASC)
  WHERE processed = false;

-- Compound for admin event-type drill-down
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_type_received
  ON stripe_webhook_events (event_type, received_at DESC);

-- ============================================================
-- BILLING: BILLING_ACTIVITY_LOGS  (audit log — must support cursor pagination)
-- ============================================================

-- Primary cursor-pagination index (salon + time)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_activity_salon_created
  ON billing_activity_logs (salon_id, created_at DESC);

-- Severity filter (alert dashboards)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_activity_salon_severity
  ON billing_activity_logs (salon_id, severity, created_at DESC);

-- ============================================================
-- BILLING: CUSTOMER_BILLING_PROFILES
-- ============================================================

-- Delinquent accounts (dunning scheduler)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cbp_delinquent
  ON customer_billing_profiles (delinquent, updated_at DESC)
  WHERE delinquent = true;

-- Account hold / suspended
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cbp_account_status
  ON customer_billing_profiles (account_status)
  WHERE account_status != 'active';

-- Subscription status for MRR reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cbp_sub_status
  ON customer_billing_profiles (current_subscription_status);

-- ============================================================
-- BILLING: REFUNDS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refunds_salon_created
  ON refunds (salon_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refunds_status
  ON refunds (status)
  WHERE status = 'pending';

-- ============================================================
-- BILLING: SUBSCRIPTION_PLAN_CHANGES
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spc_salon_created
  ON subscription_plan_changes (salon_id, created_at DESC);

-- ============================================================
-- PRO DASHBOARD: SERVICE_ORDERS
-- ============================================================

-- Job board (store + status)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_so_store_status
  ON pro_service_orders (store_id, status);

-- Job board with date ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_so_store_created
  ON pro_service_orders (store_id, created_at DESC);

-- Crew dispatch map
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_so_crew_status
  ON pro_service_orders (crew_id, status)
  WHERE crew_id IS NOT NULL;

-- Scheduled jobs timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_so_store_scheduled
  ON pro_service_orders (store_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- Open jobs only (partial — avoids completed history scans)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_so_store_open
  ON pro_service_orders (store_id, scheduled_at)
  WHERE status NOT IN ('completed', 'cancelled', 'invoiced');

-- ============================================================
-- PRO DASHBOARD: ORDER_NOTES
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_notes_order_created
  ON pro_order_notes (order_id, created_at DESC);

-- ============================================================
-- PRO DASHBOARD: PRO_CUSTOMERS
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_customers_store_id
  ON pro_customers (store_id);

-- Trigram search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_customers_name_trgm
  ON pro_customers USING GIN (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_customers_phone_trgm
  ON pro_customers USING GIN (phone gin_trgm_ops);

-- ============================================================
-- PRO DASHBOARD: PRO_ESTIMATES
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_estimates_store_status
  ON pro_estimates (store_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_estimates_store_created
  ON pro_estimates (store_id, created_at DESC);

-- ============================================================
-- PRO DASHBOARD: PRO_INVOICES
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_invoices_store_status
  ON pro_invoices (store_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_invoices_store_created
  ON pro_invoices (store_id, created_at DESC);

-- ============================================================
-- CREW_LOCATIONS  (realtime map — needs fastest possible lookup)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crew_locations_crew_updated
  ON pro_crew_locations (crew_id, updated_at DESC);

-- ============================================================
-- ONBOARDING_SUBMISSIONS  (admin/support queries)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_status_created
  ON onboarding_submissions (status, created_at DESC);

-- ============================================================
-- TRAINING_EVENTS  (already indexed; add pruning index)
-- ============================================================

-- Efficient bulk delete for retention policy
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_events_occurred_desc
  ON training_events (occurred_at DESC);

-- ============================================================
-- SESSIONS  (already has expire index; add composite for GC)
-- ============================================================

-- Already has IDX_session_expire; no additional needed.

-- ============================================================
-- JSONB GIN INDEXES (for content-based JSONB queries)
-- ============================================================

-- staff.permissions JSONB (permission key lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_permissions_gin
  ON staff USING GIN (permissions)
  WHERE permissions IS NOT NULL;

-- users.permissions JSONB
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_permissions_gin
  ON users USING GIN (permissions)
  WHERE permissions IS NOT NULL;

-- billing_activity_logs.metadata_json (event correlation queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_activity_metadata_gin
  ON billing_activity_logs USING GIN (metadata_json)
  WHERE metadata_json IS NOT NULL;

-- ============================================================
-- ANALYZE all modified tables for fresh planner statistics
-- ============================================================

ANALYZE appointments;
ANALYZE customers;
ANALYZE staff;
ANALYZE staff_services;
ANALYZE staff_availability;
ANALYZE services;
ANALYZE service_categories;
ANALYZE addons;
ANALYZE appointment_addons;
ANALYZE products;
ANALYZE business_hours;
ANALYZE cash_drawer_sessions;
ANALYZE drawer_actions;
ANALYZE sms_log;
ANALYZE waitlist;
ANALYZE gift_cards;
ANALYZE gift_card_transactions;
ANALYZE intake_forms;
ANALYZE intake_form_fields;
ANALYZE intake_form_responses;
ANALYZE loyalty_transactions;
ANALYZE reviews;
ANALYZE google_reviews;
ANALYZE password_reset_tokens;
ANALYZE users;
ANALYZE invoice_records;
ANALYZE payment_transactions;
ANALYZE stripe_webhook_events;
ANALYZE billing_activity_logs;
ANALYZE customer_billing_profiles;
ANALYZE refunds;
ANALYZE subscription_plan_changes;
ANALYZE pro_service_orders;
ANALYZE pro_order_notes;
ANALYZE pro_customers;
ANALYZE pro_estimates;
ANALYZE pro_invoices;
ANALYZE pro_crew_locations;
ANALYZE onboarding_submissions;

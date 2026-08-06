-- ============================================================
-- CERTXA — FULL SCHEMA (auto-generated from live DB)
-- Safe to run on a fresh empty database.
-- All CREATE TABLE / SEQUENCE statements use IF NOT EXISTS.
-- Generated: 2026-06-16T16:48:15Z
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS addons (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    duration integer NOT NULL,
    image_url text,
    store_id integer,
    type text DEFAULT 'full'::text NOT NULL,
    parent_addon_id integer,
    is_stackable boolean DEFAULT true NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS addons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE addons_id_seq OWNED BY addons.id;
CREATE TABLE IF NOT EXISTS api_keys (
    id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    scopes text DEFAULT 'read'::text,
    is_active boolean DEFAULT true,
    last_used_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS api_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE api_keys_id_seq OWNED BY api_keys.id;
CREATE TABLE IF NOT EXISTS app (
    id integer NOT NULL,
    store_id integer NOT NULL,
    app_name text NOT NULL,
    active boolean DEFAULT false,
    active_date timestamp without time zone,
    user_pin text,
    permissions integer
);
CREATE SEQUENCE IF NOT EXISTS app_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE app_id_seq OWNED BY app.id;
CREATE TABLE IF NOT EXISTS appointment_addons (
    id integer NOT NULL,
    appointment_id integer NOT NULL,
    addon_id integer NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS appointment_addons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE appointment_addons_id_seq OWNED BY appointment_addons.id;
CREATE TABLE IF NOT EXISTS appointments (
    id integer NOT NULL,
    date timestamp without time zone NOT NULL,
    duration integer NOT NULL,
    status text DEFAULT 'pending'::text,
    notes text,
    cancellation_reason text,
    payment_method text,
    tip_amount numeric(10,2),
    discount_amount numeric(10,2),
    total_paid numeric(10,2),
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    checked_in_at timestamp without time zone,
    service_id integer,
    staff_id integer,
    customer_id integer,
    store_id integer,
    recurrence_rule text,
    recurrence_parent_id integer,
    deposit_required boolean DEFAULT false,
    deposit_amount numeric(10,2),
    deposit_paid boolean DEFAULT false,
    gift_card_id integer,
    gift_card_amount numeric(10,2),
    loyalty_points_earned integer DEFAULT 0,
    loyalty_points_redeemed integer DEFAULT 0,
    client_requested_staff boolean DEFAULT false NOT NULL,
    calendar_hidden boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS appointments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE appointments_id_seq OWNED BY appointments.id;
CREATE TABLE IF NOT EXISTS billing_activity_logs (
    id integer NOT NULL,
    salon_id integer,
    user_id text,
    event_type text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    message text NOT NULL,
    metadata_json jsonb,
    source text DEFAULT 'system'::text,
    ip_address text,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS billing_activity_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE billing_activity_logs_id_seq OWNED BY billing_activity_logs.id;
CREATE TABLE IF NOT EXISTS billing_plans (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    price_cents numeric(12,0) NOT NULL,
    contacts_min numeric(12,0),
    contacts_max numeric(12,0),
    stripe_price_id text,
    stripe_product_id text,
    "interval" text DEFAULT 'month'::text,
    sms_credits numeric(12,0),
    currency text DEFAULT 'usd'::text,
    active boolean DEFAULT true,
    features_json jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS billing_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE billing_plans_id_seq OWNED BY billing_plans.id;
CREATE TABLE IF NOT EXISTS business_hours (
    id integer NOT NULL,
    store_id integer NOT NULL,
    day_of_week integer NOT NULL,
    open_time text DEFAULT '09:00'::text NOT NULL,
    close_time text DEFAULT '17:00'::text NOT NULL,
    is_closed boolean DEFAULT false NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS business_hours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE business_hours_id_seq OWNED BY business_hours.id;
CREATE TABLE IF NOT EXISTS calendar_settings (
    id integer NOT NULL,
    store_id integer NOT NULL,
    start_of_week text DEFAULT 'monday'::text NOT NULL,
    time_slot_interval integer DEFAULT 15 NOT NULL,
    non_working_hours_display integer DEFAULT 1 NOT NULL,
    allow_booking_outside_hours boolean DEFAULT true NOT NULL,
    auto_complete_appointments boolean DEFAULT true NOT NULL,
    auto_mark_no_shows boolean DEFAULT false NOT NULL,
    show_prices boolean DEFAULT true NOT NULL,
    walk_ins_enabled boolean DEFAULT true NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS calendar_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE calendar_settings_id_seq OWNED BY calendar_settings.id;
CREATE TABLE IF NOT EXISTS campaigns (
    id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    channel text DEFAULT 'sms'::text NOT NULL,
    audience text DEFAULT 'all'::text NOT NULL,
    audience_value text,
    message_template text NOT NULL,
    scheduled_at timestamp without time zone,
    sent_at timestamp without time zone,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaigns_id_seq OWNED BY campaigns.id;
CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
    id integer NOT NULL,
    store_id integer NOT NULL,
    opened_at timestamp without time zone NOT NULL,
    closed_at timestamp without time zone,
    opening_balance numeric(10,2) DEFAULT 0.00 NOT NULL,
    closing_balance numeric(10,2),
    denomination_breakdown text,
    opening_denomination_breakdown text,
    reported_card_sales numeric(10,2),
    prior_closing_mismatch boolean DEFAULT false NOT NULL,
    prior_closing_variance numeric(10,2),
    prior_closing_resolved_by text,
    prior_closing_resolved_at timestamp without time zone,
    prior_closing_resolution_notes text,
    status text DEFAULT 'open'::text NOT NULL,
    opened_by text,
    closed_by text,
    notes text
);
CREATE SEQUENCE IF NOT EXISTS cash_drawer_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE cash_drawer_sessions_id_seq OWNED BY cash_drawer_sessions.id;
CREATE TABLE IF NOT EXISTS client_addresses (
    id integer NOT NULL,
    client_id integer NOT NULL,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    postal_code text,
    country text DEFAULT 'US'::text,
    address_type text DEFAULT 'home'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_addresses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_addresses_id_seq OWNED BY client_addresses.id;
CREATE TABLE IF NOT EXISTS client_audit_logs (
    id integer NOT NULL,
    client_id integer,
    store_id integer NOT NULL,
    action_type text NOT NULL,
    actor_user_id text,
    metadata_json jsonb,
    ip_address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_audit_logs_id_seq OWNED BY client_audit_logs.id;
CREATE TABLE IF NOT EXISTS client_custom_field_values (
    id integer NOT NULL,
    client_id integer NOT NULL,
    custom_field_id integer NOT NULL,
    field_value text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_custom_field_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_custom_field_values_id_seq OWNED BY client_custom_field_values.id;
CREATE TABLE IF NOT EXISTS client_custom_fields (
    id integer NOT NULL,
    store_id integer NOT NULL,
    field_name text NOT NULL,
    field_type text DEFAULT 'text'::text NOT NULL,
    field_options_json jsonb,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_custom_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_custom_fields_id_seq OWNED BY client_custom_fields.id;
CREATE TABLE IF NOT EXISTS client_emails (
    id integer NOT NULL,
    client_id integer NOT NULL,
    email_address text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    marketing_opt_in boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_emails_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_emails_id_seq OWNED BY client_emails.id;
CREATE TABLE IF NOT EXISTS client_export_jobs (
    id integer NOT NULL,
    store_id integer NOT NULL,
    requested_by_user_id text,
    format text DEFAULT 'csv'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    filter_json jsonb,
    total_rows integer,
    download_url text,
    error_message text,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone
);
CREATE SEQUENCE IF NOT EXISTS client_export_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_export_jobs_id_seq OWNED BY client_export_jobs.id;
CREATE TABLE IF NOT EXISTS client_import_jobs (
    id integer NOT NULL,
    store_id integer NOT NULL,
    requested_by_user_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    file_name text,
    total_rows integer DEFAULT 0,
    imported_rows integer DEFAULT 0,
    skipped_rows integer DEFAULT 0,
    error_rows integer DEFAULT 0,
    duplicates_found integer DEFAULT 0,
    preview_json jsonb,
    errors_json jsonb,
    field_mapping_json jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone
);
CREATE SEQUENCE IF NOT EXISTS client_import_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_import_jobs_id_seq OWNED BY client_import_jobs.id;
CREATE TABLE IF NOT EXISTS client_intelligence (
    id integer NOT NULL,
    store_id integer NOT NULL,
    customer_id integer NOT NULL,
    avg_visit_cadence_days numeric(6,1),
    last_visit_date timestamp without time zone,
    next_expected_visit_date timestamp without time zone,
    days_since_last_visit integer,
    days_overdue_pct numeric(6,1),
    total_visits integer DEFAULT 0,
    total_revenue numeric(10,2) DEFAULT 0.00,
    avg_ticket_value numeric(10,2) DEFAULT 0.00,
    ltv_12_month numeric(10,2) DEFAULT 0.00,
    ltv_all_time numeric(10,2) DEFAULT 0.00,
    ltv_score integer DEFAULT 0,
    churn_risk_score integer DEFAULT 0,
    churn_risk_label text DEFAULT 'low'::text,
    no_show_count integer DEFAULT 0,
    no_show_rate numeric(5,2) DEFAULT 0.00,
    rebooking_rate numeric(5,2) DEFAULT 0.00,
    preferred_staff_id integer,
    preferred_day_of_week integer,
    preferred_time_of_day text,
    last_winback_sent_at timestamp without time zone,
    winback_sent_count integer DEFAULT 0,
    is_drifting boolean DEFAULT false,
    is_at_risk boolean DEFAULT false,
    computed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE SEQUENCE IF NOT EXISTS client_intelligence_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_intelligence_id_seq OWNED BY client_intelligence.id;
CREATE TABLE IF NOT EXISTS client_marketing_preferences (
    id integer NOT NULL,
    client_id integer NOT NULL,
    sms_marketing_opt_in boolean DEFAULT true NOT NULL,
    email_marketing_opt_in boolean DEFAULT true NOT NULL,
    promotional_notifications boolean DEFAULT true NOT NULL,
    appointment_reminders boolean DEFAULT true NOT NULL,
    birthday_messages boolean DEFAULT true NOT NULL,
    review_requests boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_marketing_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_marketing_preferences_id_seq OWNED BY client_marketing_preferences.id;
CREATE TABLE IF NOT EXISTS client_notes (
    id integer NOT NULL,
    client_id integer NOT NULL,
    store_id integer NOT NULL,
    created_by_user_id text,
    note_type text DEFAULT 'general'::text NOT NULL,
    visibility text DEFAULT 'internal'::text NOT NULL,
    note_content text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_notes_id_seq OWNED BY client_notes.id;
CREATE TABLE IF NOT EXISTS client_phones (
    id integer NOT NULL,
    client_id integer NOT NULL,
    phone_number_e164 text NOT NULL,
    display_phone text,
    phone_type text DEFAULT 'mobile'::text NOT NULL,
    sms_opt_in boolean DEFAULT true NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    store_id integer
);
CREATE SEQUENCE IF NOT EXISTS client_phones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_phones_id_seq OWNED BY client_phones.id;
CREATE TABLE IF NOT EXISTS client_tag_relationships (
    id integer NOT NULL,
    client_id integer NOT NULL,
    tag_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_tag_relationships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_tag_relationships_id_seq OWNED BY client_tag_relationships.id;
CREATE TABLE IF NOT EXISTS client_tags (
    id integer NOT NULL,
    store_id integer NOT NULL,
    tag_name text NOT NULL,
    tag_color text DEFAULT '#6366f1'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS client_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE client_tags_id_seq OWNED BY client_tags.id;
CREATE TABLE IF NOT EXISTS clients (
    id integer NOT NULL,
    store_id integer NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    full_name text DEFAULT ''::text NOT NULL,
    preferred_name text,
    date_of_birth text,
    allergies text,
    gender text,
    preferred_staff_id integer,
    client_status text DEFAULT 'active'::text NOT NULL,
    source text DEFAULT 'manual'::text,
    referral_source text,
    avatar_url text,
    total_visits integer DEFAULT 0 NOT NULL,
    total_spent_cents integer DEFAULT 0 NOT NULL,
    last_visit_at timestamp without time zone,
    next_appointment_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    archived_at timestamp without time zone,
    loyalty_points integer DEFAULT 0 NOT NULL,
    notes text
);
CREATE SEQUENCE IF NOT EXISTS clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE clients_id_seq OWNED BY clients.id;
CREATE TABLE IF NOT EXISTS contractors (
    id integer NOT NULL,
    store_id integer NOT NULL,
    staff_id integer,
    name text NOT NULL,
    email text,
    phone text,
    tax_id text,
    payment_method character varying(32) DEFAULT 'manual'::character varying,
    payment_details jsonb DEFAULT '{}'::jsonb,
    commission_structure_id integer,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    first_name text,
    last_name text,
    profile_image text,
    role text,
    commission_rate numeric(5,2),
    product_commission_rate numeric(5,2),
    payout_method character varying(32),
    tax_classification character varying(32),
    tax_id_last4 text,
    stripe_account_id text,
    onboarding_status character varying(32),
    bank_verified boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text
);
CREATE SEQUENCE IF NOT EXISTS contractors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE contractors_id_seq OWNED BY contractors.id;
CREATE TABLE IF NOT EXISTS conversations (
    id integer NOT NULL,
    title text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE conversations_id_seq OWNED BY conversations.id;
CREATE TABLE IF NOT EXISTS customer_billing_profiles (
    id integer NOT NULL,
    user_id text NOT NULL,
    salon_id integer,
    stripe_customer_id text,
    default_payment_method_id text,
    customer_email text,
    customer_name text,
    billing_phone text,
    billing_address_line1 text,
    billing_address_line2 text,
    billing_city text,
    billing_state text,
    billing_zip text,
    billing_country text DEFAULT 'US'::text,
    tax_exempt_status text DEFAULT 'none'::text,
    preferred_currency text DEFAULT 'usd'::text,
    current_plan_id integer,
    current_subscription_status text DEFAULT 'none'::text,
    trial_ends_at timestamp without time zone,
    current_period_start timestamp without time zone,
    current_period_end timestamp without time zone,
    cancel_at_period_end boolean DEFAULT false,
    canceled_at timestamp without time zone,
    subscription_started_at timestamp without time zone,
    lifetime_value_cents bigint DEFAULT 0,
    total_successful_payments integer DEFAULT 0,
    total_failed_payments integer DEFAULT 0,
    last_payment_date timestamp without time zone,
    last_payment_amount_cents bigint,
    last_failed_payment_date timestamp without time zone,
    last_failed_payment_reason text,
    delinquent boolean DEFAULT false,
    account_hold boolean DEFAULT false,
    internal_billing_notes text,
    account_status text DEFAULT 'active'::text,
    suspended_at timestamp without time zone,
    locked_at timestamp without time zone,
    suspended_reason text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS customer_billing_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE customer_billing_profiles_id_seq OWNED BY customer_billing_profiles.id;
CREATE TABLE IF NOT EXISTS customers (
    id integer NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    notes text,
    birthday text,
    allergies text,
    marketing_opt_in boolean DEFAULT true,
    loyalty_points integer DEFAULT 0,
    store_id integer
);
CREATE SEQUENCE IF NOT EXISTS customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE customers_id_seq OWNED BY customers.id;
CREATE TABLE IF NOT EXISTS dead_seat_patterns (
    id integer NOT NULL,
    store_id integer NOT NULL,
    day_of_week integer NOT NULL,
    hour_start integer NOT NULL,
    avg_utilization_pct numeric(5,2) DEFAULT 0.00,
    total_slots_analyzed integer DEFAULT 0,
    booked_slots integer DEFAULT 0,
    estimated_lost_revenue numeric(10,2) DEFAULT 0.00,
    computed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE SEQUENCE IF NOT EXISTS dead_seat_patterns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE dead_seat_patterns_id_seq OWNED BY dead_seat_patterns.id;
CREATE TABLE IF NOT EXISTS drawer_actions (
    id integer NOT NULL,
    session_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(10,2),
    reason text,
    performed_by text,
    performed_at timestamp without time zone NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS drawer_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE drawer_actions_id_seq OWNED BY drawer_actions.id;
CREATE TABLE IF NOT EXISTS gift_card_transactions (
    id integer NOT NULL,
    gift_card_id integer NOT NULL,
    store_id integer NOT NULL,
    appointment_id integer,
    amount numeric(10,2) NOT NULL,
    type text NOT NULL,
    balance_after numeric(10,2) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS gift_card_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE gift_card_transactions_id_seq OWNED BY gift_card_transactions.id;
CREATE TABLE IF NOT EXISTS gift_cards (
    id integer NOT NULL,
    store_id integer NOT NULL,
    code text NOT NULL,
    original_amount numeric(10,2) NOT NULL,
    remaining_balance numeric(10,2) NOT NULL,
    issued_to_name text,
    issued_to_email text,
    purchased_by_customer_id integer,
    recipient_customer_id integer,
    is_active boolean DEFAULT true,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    notes text
);
CREATE SEQUENCE IF NOT EXISTS gift_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE gift_cards_id_seq OWNED BY gift_cards.id;
CREATE TABLE IF NOT EXISTS google_business_accounts (
    id integer NOT NULL,
    store_id integer NOT NULL,
    user_id character varying NOT NULL,
    google_account_id text NOT NULL,
    account_name text,
    access_token text,
    refresh_token text,
    token_expiry timestamp without time zone,
    scopes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS google_business_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE google_business_accounts_id_seq OWNED BY google_business_accounts.id;
CREATE TABLE IF NOT EXISTS google_business_locations (
    id integer NOT NULL,
    store_id integer NOT NULL,
    user_id character varying NOT NULL,
    business_account_id integer NOT NULL,
    location_resource_name text NOT NULL,
    location_id text NOT NULL,
    location_name text,
    address text,
    phone text,
    is_selected boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS google_business_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE google_business_locations_id_seq OWNED BY google_business_locations.id;
CREATE TABLE IF NOT EXISTS google_business_profiles (
    id integer NOT NULL,
    store_id integer NOT NULL,
    google_account_email text,
    business_name text,
    business_account_id text,
    business_account_resource_name text,
    location_id text,
    location_resource_name text,
    location_address text,
    access_token text,
    refresh_token text,
    token_expires_at timestamp without time zone,
    is_connected boolean DEFAULT false,
    sync_enabled boolean DEFAULT true,
    last_synced_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS google_business_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE google_business_profiles_id_seq OWNED BY google_business_profiles.id;
CREATE TABLE IF NOT EXISTS google_business_sync_logs (
    id integer NOT NULL,
    store_id integer,
    user_id character varying,
    location_id integer,
    sync_type text NOT NULL,
    status text NOT NULL,
    error_message text,
    reviews_synced integer,
    synced_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS google_business_sync_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE google_business_sync_logs_id_seq OWNED BY google_business_sync_logs.id;
CREATE TABLE IF NOT EXISTS google_review_responses (
    id integer NOT NULL,
    google_review_id integer NOT NULL,
    store_id integer NOT NULL,
    response_text text NOT NULL,
    response_status text NOT NULL,
    staff_id integer,
    created_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS google_review_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE google_review_responses_id_seq OWNED BY google_review_responses.id;
CREATE TABLE IF NOT EXISTS google_reviews (
    id integer NOT NULL,
    store_id integer NOT NULL,
    google_review_id text NOT NULL,
    google_location_id text,
    gb_location_id integer,
    customer_name text,
    customer_phone_number text,
    rating integer NOT NULL,
    review_text text,
    review_image_urls text,
    review_create_time timestamp without time zone,
    review_update_time timestamp without time zone,
    reviewer_language_code text,
    review_publishing_status text DEFAULT 'published'::text,
    response_status text DEFAULT 'not_responded'::text,
    appointment_id integer,
    customer_id integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS google_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE google_reviews_id_seq OWNED BY google_reviews.id;
CREATE TABLE IF NOT EXISTS growth_score_snapshots (
    id integer NOT NULL,
    store_id integer NOT NULL,
    overall_score integer NOT NULL,
    retention_score integer NOT NULL,
    rebooking_score integer NOT NULL,
    utilization_score integer NOT NULL,
    revenue_score integer NOT NULL,
    new_client_score integer NOT NULL,
    active_clients integer DEFAULT 0,
    drifting_clients integer DEFAULT 0,
    at_risk_clients integer DEFAULT 0,
    avg_rebooking_rate numeric(5,2),
    seat_utilization_pct numeric(5,2),
    monthly_revenue numeric(10,2),
    snapshot_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE SEQUENCE IF NOT EXISTS growth_score_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE growth_score_snapshots_id_seq OWNED BY growth_score_snapshots.id;
CREATE TABLE IF NOT EXISTS intake_form_fields (
    id integer NOT NULL,
    form_id integer NOT NULL,
    label text NOT NULL,
    field_type text NOT NULL,
    options text,
    required boolean DEFAULT false,
    sort_order integer DEFAULT 0
);
CREATE SEQUENCE IF NOT EXISTS intake_form_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE intake_form_fields_id_seq OWNED BY intake_form_fields.id;
CREATE TABLE IF NOT EXISTS intake_form_responses (
    id integer NOT NULL,
    form_id integer NOT NULL,
    store_id integer NOT NULL,
    customer_id integer,
    appointment_id integer,
    customer_name text,
    responses text NOT NULL,
    submitted_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS intake_form_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE intake_form_responses_id_seq OWNED BY intake_form_responses.id;
CREATE TABLE IF NOT EXISTS intake_forms (
    id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    require_before_booking boolean DEFAULT false,
    service_id integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS intake_forms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE intake_forms_id_seq OWNED BY intake_forms.id;
CREATE TABLE IF NOT EXISTS intelligence_interventions (
    id integer NOT NULL,
    store_id integer NOT NULL,
    customer_id integer,
    intervention_type text NOT NULL,
    channel text DEFAULT 'sms'::text NOT NULL,
    message_body text,
    status text DEFAULT 'sent'::text NOT NULL,
    triggered_by text DEFAULT 'auto'::text NOT NULL,
    metadata jsonb,
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    responded_at timestamp without time zone,
    converted_at timestamp without time zone,
    appointment_id integer
);
CREATE SEQUENCE IF NOT EXISTS intelligence_interventions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE intelligence_interventions_id_seq OWNED BY intelligence_interventions.id;
CREATE TABLE IF NOT EXISTS invoice_records (
    id integer NOT NULL,
    stripe_invoice_id text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    salon_id integer,
    invoice_number text,
    status text,
    paid boolean DEFAULT false,
    attempted boolean DEFAULT false,
    forgiven boolean DEFAULT false,
    collection_method text,
    currency text DEFAULT 'usd'::text,
    subtotal_cents bigint DEFAULT 0,
    tax_cents bigint DEFAULT 0,
    total_cents bigint DEFAULT 0,
    amount_paid_cents bigint DEFAULT 0,
    amount_remaining_cents bigint DEFAULT 0,
    hosted_invoice_url text,
    invoice_pdf_url text,
    billing_reason text,
    period_start timestamp without time zone,
    period_end timestamp without time zone,
    due_date timestamp without time zone,
    paid_at timestamp without time zone,
    attempted_at timestamp without time zone,
    next_payment_attempt timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS invoice_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE invoice_records_id_seq OWNED BY invoice_records.id;
CREATE TABLE IF NOT EXISTS kiosk_checkins (
    id integer NOT NULL,
    store_id integer NOT NULL,
    client_id integer,
    phone text,
    client_name text,
    services jsonb DEFAULT '[]'::jsonb,
    token text NOT NULL,
    appointment_id integer,
    status text DEFAULT 'waiting'::text,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '04:00:00'::interval),
    staff_id integer,
    assigned_staff_name text
);
CREATE SEQUENCE IF NOT EXISTS kiosk_checkins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE kiosk_checkins_id_seq OWNED BY kiosk_checkins.id;
CREATE TABLE IF NOT EXISTS kiosk_turn (
    id integer NOT NULL,
    store_id integer NOT NULL,
    staff_id integer NOT NULL,
    turn_position integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true
);
CREATE SEQUENCE IF NOT EXISTS kiosk_turn_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE kiosk_turn_id_seq OWNED BY kiosk_turn.id;
CREATE TABLE IF NOT EXISTS launchsite_templates (
    id text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    style text DEFAULT 'Modern'::text NOT NULL,
    "desc" text DEFAULT ''::text NOT NULL,
    badge text DEFAULT ''::text NOT NULL,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    accent text DEFAULT '#a855f7'::text NOT NULL,
    dark text DEFAULT '#0a0b15'::text NOT NULL,
    light text DEFAULT '#1c1d27'::text NOT NULL,
    url_slug text NOT NULL,
    hero_tagline text DEFAULT ''::text NOT NULL,
    hero_sub text DEFAULT ''::text NOT NULL,
    business_name text DEFAULT ''::text NOT NULL,
    type text DEFAULT 'php'::text NOT NULL,
    react_path text,
    scraped_path text,
    source_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS locations (
    id integer NOT NULL,
    name text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    address text,
    phone text,
    email text,
    category text,
    city text,
    state text,
    postcode text,
    booking_slug text,
    booking_theme text DEFAULT 'simple'::text,
    commission_payout_frequency text DEFAULT 'monthly'::text,
    sms_tokens integer DEFAULT 0 NOT NULL,
    sms_allowance integer DEFAULT 0 NOT NULL,
    sms_credits integer DEFAULT 0 NOT NULL,
    sms_credits_total_purchased integer DEFAULT 0 NOT NULL,
    user_id text,
    account_status text DEFAULT 'Active'::text,
    store_latitude text,
    store_longitude text,
    yelp_alias text,
    facebook_page_id text,
    late_grace_period_minutes integer DEFAULT 10 NOT NULL,
    cancellation_hours_cutoff integer DEFAULT 24 NOT NULL,
    pos_enabled boolean DEFAULT true NOT NULL,
    weekly_digest_opt_out boolean DEFAULT false NOT NULL,
    parking_options jsonb DEFAULT '[]'::jsonb,
    accessibility_features jsonb DEFAULT '[]'::jsonb,
    beverage_options jsonb,
    platform_credits numeric(10,2) DEFAULT 0.00 NOT NULL,
    sales_tax_rate numeric(5,4) DEFAULT 0.0000 NOT NULL,
    stripe_customer_id text,
    tax_services_taxable boolean DEFAULT false NOT NULL,
    tax_addons_taxable boolean DEFAULT false NOT NULL,
    tax_products_taxable boolean DEFAULT true NOT NULL,
    tax_gift_cards_taxable boolean DEFAULT false NOT NULL,
    register_target_float numeric(10,2) DEFAULT NULL
);
CREATE SEQUENCE IF NOT EXISTS locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE locations_id_seq OWNED BY locations.id;
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id integer NOT NULL,
    store_id integer NOT NULL,
    customer_id integer NOT NULL,
    appointment_id integer,
    type text NOT NULL,
    points integer NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS loyalty_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE loyalty_transactions_id_seq OWNED BY loyalty_transactions.id;
CREATE TABLE IF NOT EXISTS mail_settings (
    id integer NOT NULL,
    store_id integer NOT NULL,
    mailgun_api_key text,
    mailgun_domain text,
    sender_email text,
    booking_confirmation_enabled boolean DEFAULT false NOT NULL,
    reminder_enabled boolean DEFAULT false NOT NULL,
    reminder_hours_before integer DEFAULT 24 NOT NULL,
    review_request_enabled boolean DEFAULT false NOT NULL,
    google_review_url text,
    confirmation_template text,
    reminder_template text,
    review_template text
);
CREATE SEQUENCE IF NOT EXISTS mail_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE mail_settings_id_seq OWNED BY mail_settings.id;
CREATE TABLE IF NOT EXISTS messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE messages_id_seq OWNED BY messages.id;
CREATE TABLE IF NOT EXISTS names (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    origin character varying(32) NOT NULL,
    gender character varying(16) DEFAULT 'female'::character varying NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS names_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE names_id_seq OWNED BY names.id;
CREATE TABLE IF NOT EXISTS onboarding_submissions (
    id integer NOT NULL,
    email text,
    contact_email text,
    business_name text,
    template_id text,
    phone text,
    address_line1 text,
    address_line2 text,
    city text,
    county_state text,
    postcode text,
    country text DEFAULT 'GB'::text,
    hours jsonb,
    booking_enabled boolean DEFAULT false,
    domain_type text DEFAULT 'subdomain'::text,
    subdomain text,
    custom_domain text,
    domain_payment_status text DEFAULT 'n/a'::text,
    hero_image text,
    plan text DEFAULT 'free'::text,
    powered_by_certxa boolean DEFAULT true,
    status text DEFAULT 'pending'::text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS onboarding_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE onboarding_submissions_id_seq OWNED BY onboarding_submissions.id;
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id integer NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE password_reset_tokens_id_seq OWNED BY password_reset_tokens.id;
CREATE TABLE IF NOT EXISTS payment_transactions (
    id integer NOT NULL,
    stripe_payment_intent_id text,
    stripe_charge_id text,
    stripe_invoice_id text,
    salon_id integer,
    user_id text,
    status text,
    payment_method_brand text,
    payment_method_last4 text,
    payment_method_fingerprint text,
    card_exp_month integer,
    card_exp_year integer,
    amount_cents bigint DEFAULT 0,
    currency text DEFAULT 'usd'::text,
    failure_code text,
    failure_message text,
    receipt_url text,
    refunded boolean DEFAULT false,
    refund_amount_cents bigint DEFAULT 0,
    dispute_status text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS payment_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE payment_transactions_id_seq OWNED BY payment_transactions.id;
CREATE TABLE IF NOT EXISTS payout_run_items (
    id integer NOT NULL,
    payout_run_id integer NOT NULL,
    contractor_id integer,
    staff_id integer,
    gross_amount numeric(12,2),
    deductions numeric(12,2),
    net_amount numeric(12,2),
    appointment_count integer DEFAULT 0,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contractor_name text,
    service_revenue numeric(12,2),
    product_revenue numeric(12,2),
    tips numeric(12,2),
    total_deductions numeric(12,2),
    payout_method character varying(32),
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    failure_reason text,
    check_number text,
    paid_at timestamp with time zone
);
CREATE SEQUENCE IF NOT EXISTS payout_run_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE payout_run_items_id_seq OWNED BY payout_run_items.id;
CREATE TABLE IF NOT EXISTS payout_runs (
    id integer NOT NULL,
    store_id integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status character varying(32) DEFAULT 'draft'::character varying NOT NULL,
    total_gross numeric(12,2),
    total_deductions numeric(12,2),
    total_net numeric(12,2),
    contractor_count integer DEFAULT 0,
    notes text,
    auto_generated boolean DEFAULT false NOT NULL,
    auto_approve_after timestamp with time zone,
    created_by_user_id text,
    approved_by_user_id text,
    approved_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS payout_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE payout_runs_id_seq OWNED BY payout_runs.id;
CREATE TABLE IF NOT EXISTS payroll_run_items (
    id integer NOT NULL,
    payroll_run_id integer NOT NULL,
    staff_id integer NOT NULL,
    staff_name text DEFAULT ''::text NOT NULL,
    commission_rate numeric(5,2) DEFAULT 0 NOT NULL,
    appointment_count integer DEFAULT 0 NOT NULL,
    service_revenue numeric(10,2) DEFAULT 0 NOT NULL,
    addon_revenue numeric(10,2) DEFAULT 0 NOT NULL,
    total_revenue numeric(10,2) DEFAULT 0 NOT NULL,
    commission_amount numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS payroll_run_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE payroll_run_items_id_seq OWNED BY payroll_run_items.id;
CREATE TABLE IF NOT EXISTS payroll_runs (
    id integer NOT NULL,
    store_id integer NOT NULL,
    period_start text NOT NULL,
    period_end text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    total_commission numeric(10,2) DEFAULT 0 NOT NULL,
    contractor_count integer DEFAULT 0 NOT NULL,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    finalized_at timestamp without time zone
);
CREATE SEQUENCE IF NOT EXISTS payroll_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE payroll_runs_id_seq OWNED BY payroll_runs.id;
CREATE TABLE IF NOT EXISTS permissions (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    store_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE permissions_id_seq OWNED BY permissions.id;
CREATE TABLE IF NOT EXISTS pro_crew_locations (
    id integer NOT NULL,
    crew_id integer NOT NULL,
    lat numeric(10,7) NOT NULL,
    lng numeric(10,7) NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pro_crew_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pro_crew_locations_id_seq OWNED BY pro_crew_locations.id;
CREATE TABLE IF NOT EXISTS pro_crews (
    id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#00D4AA'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    notes text,
    phone text,
    pin_hash text,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pro_crews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pro_crews_id_seq OWNED BY pro_crews.id;
CREATE TABLE IF NOT EXISTS pro_customers (
    id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    city text,
    state text,
    zip text,
    property_type text DEFAULT 'residential'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pro_customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pro_customers_id_seq OWNED BY pro_customers.id;
CREATE TABLE IF NOT EXISTS pro_estimates (
    id integer NOT NULL,
    store_id integer NOT NULL,
    estimate_number text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    customer_id integer,
    customer_name text NOT NULL,
    customer_phone text,
    customer_email text,
    address text,
    city text,
    state text,
    zip text,
    service_type text,
    description text,
    line_items text,
    subtotal numeric(10,2) DEFAULT 0,
    tax numeric(10,2) DEFAULT 0,
    total numeric(10,2) DEFAULT 0,
    converted_to_order_id integer,
    valid_until timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pro_estimates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pro_estimates_id_seq OWNED BY pro_estimates.id;
CREATE TABLE IF NOT EXISTS pro_invoices (
    id integer NOT NULL,
    store_id integer NOT NULL,
    order_id integer,
    invoice_number text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    customer_name text NOT NULL,
    customer_phone text,
    customer_email text,
    address text,
    line_items text,
    subtotal numeric(10,2) DEFAULT 0,
    tax numeric(10,2) DEFAULT 0,
    total numeric(10,2) DEFAULT 0,
    paid_at timestamp without time zone,
    due_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pro_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pro_invoices_id_seq OWNED BY pro_invoices.id;
CREATE TABLE IF NOT EXISTS pro_leads (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(50),
    business_name character varying(255),
    industry character varying(100),
    team_size character varying(50),
    message text,
    source character varying(100) DEFAULT 'pro-hub'::character varying,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pro_leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pro_leads_id_seq OWNED BY pro_leads.id;
CREATE TABLE IF NOT EXISTS pro_order_notes (
    id integer NOT NULL,
    order_id integer NOT NULL,
    store_id integer NOT NULL,
    note text NOT NULL,
    author_name text,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pro_order_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pro_order_notes_id_seq OWNED BY pro_order_notes.id;
CREATE TABLE IF NOT EXISTS pro_service_orders (
    id integer NOT NULL,
    store_id integer NOT NULL,
    order_number text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    service_type text NOT NULL,
    customer_name text NOT NULL,
    customer_phone text,
    customer_email text,
    address text NOT NULL,
    city text,
    state text,
    zip text,
    lat numeric(10,7),
    lng numeric(10,7),
    description text,
    crew_id integer,
    scheduled_at timestamp without time zone,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    estimated_hours numeric(4,1),
    overtime_flagged boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pro_service_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE pro_service_orders_id_seq OWNED BY pro_service_orders.id;
CREATE TABLE IF NOT EXISTS products (
    id integer NOT NULL,
    name text NOT NULL,
    brand text,
    price numeric(10,2) NOT NULL,
    purchase_price numeric(10,2),
    stock integer DEFAULT 0,
    low_stock_threshold integer DEFAULT 5,
    category text,
    upc text,
    store_id integer
);
CREATE SEQUENCE IF NOT EXISTS products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE products_id_seq OWNED BY products.id;
CREATE TABLE IF NOT EXISTS refunds (
    id integer NOT NULL,
    stripe_refund_id text,
    stripe_charge_id text,
    stripe_payment_intent_id text,
    stripe_invoice_id text,
    salon_id integer,
    user_id text,
    initiated_by_user_id text,
    amount_cents bigint NOT NULL,
    currency text DEFAULT 'usd'::text,
    reason text,
    internal_reason_notes text,
    refund_type text DEFAULT 'manual'::text,
    status text DEFAULT 'pending'::text NOT NULL,
    receipt_url text,
    metadata_json jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS refunds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE refunds_id_seq OWNED BY refunds.id;
CREATE TABLE IF NOT EXISTS reviews (
    id integer NOT NULL,
    store_id integer NOT NULL,
    customer_id integer,
    appointment_id integer,
    staff_id integer,
    rating integer NOT NULL,
    comment text,
    customer_name text,
    service_name text,
    staff_name text,
    is_public boolean DEFAULT true NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE reviews_id_seq OWNED BY reviews.id;
CREATE TABLE IF NOT EXISTS roles (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    store_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE roles_id_seq OWNED BY roles.id;
CREATE TABLE IF NOT EXISTS scheduled_plan_changes (
    id integer NOT NULL,
    stripe_subscription_id text NOT NULL,
    new_plan_code text NOT NULL,
    "interval" text,
    effective_at bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS scheduled_plan_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE scheduled_plan_changes_id_seq OWNED BY scheduled_plan_changes.id;
CREATE TABLE IF NOT EXISTS seo_regions (
    id integer NOT NULL,
    city character varying(100) NOT NULL,
    state character varying(100) NOT NULL,
    state_code character varying(10) NOT NULL,
    slug character varying(200) NOT NULL,
    phone character varying(30),
    zip character varying(20),
    product character varying(20) DEFAULT 'booking'::character varying NOT NULL,
    business_type character varying(100),
    business_types text,
    nearby_cities text,
    meta_title text,
    meta_desc text,
    h1_override text,
    page_generated boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS seo_regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE seo_regions_id_seq OWNED BY seo_regions.id;
CREATE TABLE IF NOT EXISTS service_addons (
    id integer NOT NULL,
    service_id integer NOT NULL,
    addon_id integer NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS service_addons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE service_addons_id_seq OWNED BY service_addons.id;
CREATE TABLE IF NOT EXISTS service_categories (
    id integer NOT NULL,
    name text NOT NULL,
    image_url text,
    store_id integer,
    sort_order integer DEFAULT 0
);
CREATE SEQUENCE IF NOT EXISTS service_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE service_categories_id_seq OWNED BY service_categories.id;
CREATE TABLE IF NOT EXISTS service_illustration_categories (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    image_url text,
    industry text DEFAULT 'NAIL_SALON'::text NOT NULL,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS service_illustration_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE service_illustration_categories_id_seq OWNED BY service_illustration_categories.id;
CREATE TABLE IF NOT EXISTS services (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    duration integer NOT NULL,
    price numeric(10,2) NOT NULL,
    category text NOT NULL,
    category_id integer,
    image_url text,
    store_id integer,
    deposit_required boolean DEFAULT false,
    deposit_amount numeric(10,2),
    illustration_category_id integer,
    custom_illustration_url text,
    auto_assigned boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE services_id_seq OWNED BY services.id;
CREATE TABLE IF NOT EXISTS sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);
CREATE TABLE IF NOT EXISTS sms_conversations (
    id integer NOT NULL,
    store_id integer NOT NULL,
    client_phone text NOT NULL,
    client_name text,
    direction text NOT NULL,
    body text NOT NULL,
    twilio_sid text,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS sms_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sms_conversations_id_seq OWNED BY sms_conversations.id;
CREATE TABLE IF NOT EXISTS sms_log (
    id integer NOT NULL,
    store_id integer NOT NULL,
    appointment_id integer,
    customer_id integer,
    phone text NOT NULL,
    message_type text NOT NULL,
    message_body text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    twilio_sid text,
    error_message text,
    sent_at timestamp without time zone NOT NULL,
    sms_source text,
    cost_estimate numeric(10,4) DEFAULT 0.0100
);
CREATE SEQUENCE IF NOT EXISTS sms_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sms_log_id_seq OWNED BY sms_log.id;
CREATE TABLE IF NOT EXISTS sms_opt_outs (
    id integer NOT NULL,
    phone text NOT NULL,
    opted_out_at timestamp without time zone DEFAULT now(),
    opted_back_in_at timestamp without time zone,
    is_opted_out boolean DEFAULT true NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS sms_opt_outs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sms_opt_outs_id_seq OWNED BY sms_opt_outs.id;
CREATE TABLE IF NOT EXISTS sms_settings (
    id integer NOT NULL,
    store_id integer NOT NULL,
    twilio_account_sid text,
    twilio_auth_token text,
    twilio_phone_number text,
    booking_confirmation_enabled boolean DEFAULT false NOT NULL,
    reminder_enabled boolean DEFAULT false NOT NULL,
    reminder_hours_before integer DEFAULT 24 NOT NULL,
    review_request_enabled boolean DEFAULT false NOT NULL,
    google_review_url text,
    confirmation_template text,
    reminder_template text,
    review_template text
);
CREATE SEQUENCE IF NOT EXISTS sms_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sms_settings_id_seq OWNED BY sms_settings.id;
CREATE TABLE IF NOT EXISTS staff (
    id integer NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    role text DEFAULT 'stylist'::text,
    bio text,
    color text DEFAULT '#3b82f6'::text,
    avatar_url text,
    commission_enabled boolean DEFAULT false,
    commission_rate numeric(5,2) DEFAULT 0,
    commission_structure_id integer,
    store_id integer,
    password text,
    permissions jsonb,
    status text DEFAULT 'active'::text,
    employment_type text DEFAULT 'stylist'::text,
    invite_token text,
    invite_expires_at timestamp without time zone,
    invited_at timestamp without time zone,
    joined_at timestamp without time zone,
    removed_at timestamp without time zone,
    invited_by_user_id text,
    mailing_address1 text,
    mailing_address2 text,
    mailing_city text,
    mailing_state text,
    mailing_zip text,
    mailing_country text,
    show_on_calendar boolean DEFAULT true NOT NULL,
    avatar_thumb_url text
);
CREATE TABLE IF NOT EXISTS staff_availability (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    day_of_week integer NOT NULL,
    start_time text NOT NULL,
    end_time text NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS staff_availability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE staff_availability_id_seq OWNED BY staff_availability.id;
CREATE SEQUENCE IF NOT EXISTS staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE staff_id_seq OWNED BY staff.id;
CREATE TABLE IF NOT EXISTS staff_intelligence (
    id integer NOT NULL,
    store_id integer NOT NULL,
    staff_id integer NOT NULL,
    total_appointments integer DEFAULT 0,
    completed_appointments integer DEFAULT 0,
    no_show_count integer DEFAULT 0,
    cancellation_count integer DEFAULT 0,
    rebooked_count integer DEFAULT 0,
    rebooking_rate_pct numeric(5,2) DEFAULT 0.00,
    avg_ticket_value numeric(10,2) DEFAULT 0.00,
    total_revenue numeric(10,2) DEFAULT 0.00,
    unique_clients_served integer DEFAULT 0,
    client_retention_rate numeric(5,2) DEFAULT 0.00,
    trend text DEFAULT 'stable'::text,
    computed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE SEQUENCE IF NOT EXISTS staff_intelligence_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE staff_intelligence_id_seq OWNED BY staff_intelligence.id;
CREATE TABLE IF NOT EXISTS staff_pins (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    store_id integer NOT NULL,
    pin text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS staff_pins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE staff_pins_id_seq OWNED BY staff_pins.id;
CREATE TABLE IF NOT EXISTS staff_services (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    service_id integer NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS staff_services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE staff_services_id_seq OWNED BY staff_services.id;
CREATE TABLE IF NOT EXISTS staff_settings (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    store_id integer NOT NULL,
    preferences text NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS staff_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE staff_settings_id_seq OWNED BY staff_settings.id;
CREATE TABLE IF NOT EXISTS store_settings (
    id integer NOT NULL,
    store_id integer NOT NULL,
    preferences text NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS store_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE store_settings_id_seq OWNED BY store_settings.id;
CREATE TABLE IF NOT EXISTS store_subscriptions (
    id integer NOT NULL,
    store_id integer NOT NULL,
    plan_id integer,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    stripe_subscription_id text,
    stripe_customer_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    canceled_at timestamp with time zone
);
CREATE SEQUENCE IF NOT EXISTS store_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE store_subscriptions_id_seq OWNED BY store_subscriptions.id;
CREATE TABLE IF NOT EXISTS stripe_customers (
    id integer NOT NULL,
    user_id text NOT NULL,
    customer_id text NOT NULL,
    store_number integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    deleted_at timestamp without time zone
);
CREATE SEQUENCE IF NOT EXISTS stripe_customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE stripe_customers_id_seq OWNED BY stripe_customers.id;
CREATE TABLE IF NOT EXISTS stripe_orders (
    id integer NOT NULL,
    checkout_session_id text NOT NULL,
    payment_intent_id text NOT NULL,
    customer_id text NOT NULL,
    amount_subtotal bigint NOT NULL,
    amount_total bigint NOT NULL,
    currency text NOT NULL,
    payment_status text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    deleted_at timestamp without time zone
);
CREATE SEQUENCE IF NOT EXISTS stripe_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE stripe_orders_id_seq OWNED BY stripe_orders.id;
CREATE TABLE IF NOT EXISTS stripe_settings (
    id integer NOT NULL,
    store_id integer NOT NULL,
    publishable_key text,
    secret_key text,
    test_magstripe_enabled boolean DEFAULT true NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS stripe_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE stripe_settings_id_seq OWNED BY stripe_settings.id;
CREATE TABLE IF NOT EXISTS stripe_subscriptions (
    id integer NOT NULL,
    customer_id text NOT NULL,
    subscription_id text,
    price_id text,
    current_period_start bigint,
    current_period_end bigint,
    cancel_at_period_end boolean DEFAULT false,
    payment_method_brand text,
    payment_method_last4 text,
    status text DEFAULT 'not_started'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    deleted_at timestamp without time zone
);
CREATE SEQUENCE IF NOT EXISTS stripe_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE stripe_subscriptions_id_seq OWNED BY stripe_subscriptions.id;
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id integer NOT NULL,
    stripe_event_id text NOT NULL,
    event_type text NOT NULL,
    api_version text,
    processed boolean DEFAULT false,
    processing_attempts integer DEFAULT 0,
    processing_error text,
    payload_json jsonb,
    received_at timestamp without time zone DEFAULT now(),
    processed_at timestamp without time zone
);
CREATE SEQUENCE IF NOT EXISTS stripe_webhook_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE stripe_webhook_events_id_seq OWNED BY stripe_webhook_events.id;
CREATE TABLE IF NOT EXISTS subdomains (
    id integer NOT NULL,
    submission_id integer,
    slug text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS subdomains_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE subdomains_id_seq OWNED BY subdomains.id;
CREATE TABLE IF NOT EXISTS subscription_plan_changes (
    id integer NOT NULL,
    salon_id integer,
    user_id text,
    stripe_subscription_id text,
    old_plan_id integer,
    new_plan_id integer,
    old_price_cents bigint,
    new_price_cents bigint,
    change_type text,
    proration_used boolean DEFAULT false,
    prorated_amount_cents bigint,
    effective_date timestamp without time zone,
    initiated_by text,
    reason text,
    metadata_json jsonb,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS subscription_plan_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE subscription_plan_changes_id_seq OWNED BY subscription_plan_changes.id;
CREATE TABLE IF NOT EXISTS subscriptions (
    id integer NOT NULL,
    store_number integer NOT NULL,
    plan_code text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    status text,
    current_period_end text,
    current_period_start text,
    "interval" text DEFAULT 'month'::text,
    price_id text,
    cancel_at_period_end integer DEFAULT 0,
    payment_method_brand text,
    payment_method_last4 text,
    seat_quantity integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE subscriptions_id_seq OWNED BY subscriptions.id;
CREATE TABLE IF NOT EXISTS support_agents (
    id integer NOT NULL,
    name text NOT NULL,
    email text,
    role character varying(32) DEFAULT 'agent'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    first_name text,
    last_name text,
    avatar_url text,
    last_login_at timestamp with time zone
);
CREATE SEQUENCE IF NOT EXISTS support_agents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE support_agents_id_seq OWNED BY support_agents.id;
CREATE TABLE IF NOT EXISTS support_incident_tasks (
    id integer NOT NULL,
    incident_id integer NOT NULL,
    title text NOT NULL,
    assigned_to_id integer,
    assigned_to_name text,
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS support_incident_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE support_incident_tasks_id_seq OWNED BY support_incident_tasks.id;
CREATE TABLE IF NOT EXISTS support_incident_updates (
    id integer NOT NULL,
    incident_id integer NOT NULL,
    content text NOT NULL,
    status text,
    author_id integer,
    author_name text,
    is_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS support_incident_updates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE support_incident_updates_id_seq OWNED BY support_incident_updates.id;
CREATE TABLE IF NOT EXISTS support_incidents (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    severity text DEFAULT 'SEV-3'::text NOT NULL,
    status text DEFAULT 'investigating'::text NOT NULL,
    affected_accounts integer DEFAULT 0,
    owner_id integer,
    owner_name text,
    services text[] DEFAULT '{}'::text[],
    root_cause text,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS support_incidents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE support_incidents_id_seq OWNED BY support_incidents.id;
CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    author_type character varying(16) DEFAULT 'user'::character varying NOT NULL,
    author_name character varying(128),
    agent_id integer,
    content text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS support_ticket_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE support_ticket_messages_id_seq OWNED BY support_ticket_messages.id;
CREATE TABLE IF NOT EXISTS support_tickets (
    id integer NOT NULL,
    account_id integer NOT NULL,
    ticket_number character varying(32) NOT NULL,
    subject text NOT NULL,
    description text,
    priority character varying(16) DEFAULT 'normal'::character varying NOT NULL,
    status character varying(16) DEFAULT 'open'::character varying NOT NULL,
    assigned_agent_id integer,
    assigned_agent_name character varying(128),
    created_by_agent_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS support_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE support_tickets_id_seq OWNED BY support_tickets.id;
CREATE TABLE IF NOT EXISTS timeclock (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    store_id integer NOT NULL,
    clock_in timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    clock_out timestamp without time zone,
    work_date text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS timeclock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE timeclock_id_seq OWNED BY timeclock.id;
CREATE TABLE IF NOT EXISTS turn_assignment_log (
    id integer NOT NULL,
    store_id integer NOT NULL,
    appointment_id integer,
    assigned_staff_id integer NOT NULL,
    turn_recommended_staff_id integer,
    is_override boolean DEFAULT false NOT NULL,
    source text DEFAULT 'turn_system'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS turn_assignment_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE turn_assignment_log_id_seq OWNED BY turn_assignment_log.id;
CREATE TABLE IF NOT EXISTS users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying NOT NULL,
    password character varying NOT NULL,
    google_id character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    role character varying DEFAULT 'owner'::character varying,
    is_admin boolean DEFAULT false NOT NULL,
    staff_id integer,
    permissions jsonb,
    onboarding_completed boolean DEFAULT false,
    password_changed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    subscription_status character varying(20) DEFAULT 'active'::character varying,
    trial_started_at timestamp without time zone,
    trial_ends_at timestamp without time zone,
    account_type text
);
CREATE TABLE IF NOT EXISTS waitlist (
    id integer NOT NULL,
    store_id integer NOT NULL,
    service_id integer,
    staff_id integer,
    customer_id integer,
    customer_name text NOT NULL,
    customer_phone text,
    customer_email text,
    preferred_date timestamp without time zone,
    preferred_time_start text,
    preferred_time_end text,
    notes text,
    party_size integer DEFAULT 1,
    status text DEFAULT 'waiting'::text,
    notified_at timestamp without time zone,
    called_at timestamp without time zone,
    completed_at timestamp without time zone,
    customer_latitude text,
    customer_longitude text,
    sms_sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS waitlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE waitlist_id_seq OWNED BY waitlist.id;
ALTER TABLE ONLY addons ALTER COLUMN id SET DEFAULT nextval('addons_id_seq'::regclass);
ALTER TABLE ONLY api_keys ALTER COLUMN id SET DEFAULT nextval('api_keys_id_seq'::regclass);
ALTER TABLE ONLY app ALTER COLUMN id SET DEFAULT nextval('app_id_seq'::regclass);
ALTER TABLE ONLY appointment_addons ALTER COLUMN id SET DEFAULT nextval('appointment_addons_id_seq'::regclass);
ALTER TABLE ONLY appointments ALTER COLUMN id SET DEFAULT nextval('appointments_id_seq'::regclass);
ALTER TABLE ONLY billing_activity_logs ALTER COLUMN id SET DEFAULT nextval('billing_activity_logs_id_seq'::regclass);
ALTER TABLE ONLY billing_plans ALTER COLUMN id SET DEFAULT nextval('billing_plans_id_seq'::regclass);
ALTER TABLE ONLY business_hours ALTER COLUMN id SET DEFAULT nextval('business_hours_id_seq'::regclass);
ALTER TABLE ONLY calendar_settings ALTER COLUMN id SET DEFAULT nextval('calendar_settings_id_seq'::regclass);
ALTER TABLE ONLY campaigns ALTER COLUMN id SET DEFAULT nextval('campaigns_id_seq'::regclass);
ALTER TABLE ONLY cash_drawer_sessions ALTER COLUMN id SET DEFAULT nextval('cash_drawer_sessions_id_seq'::regclass);
ALTER TABLE ONLY client_addresses ALTER COLUMN id SET DEFAULT nextval('client_addresses_id_seq'::regclass);
ALTER TABLE ONLY client_audit_logs ALTER COLUMN id SET DEFAULT nextval('client_audit_logs_id_seq'::regclass);
ALTER TABLE ONLY client_custom_field_values ALTER COLUMN id SET DEFAULT nextval('client_custom_field_values_id_seq'::regclass);
ALTER TABLE ONLY client_custom_fields ALTER COLUMN id SET DEFAULT nextval('client_custom_fields_id_seq'::regclass);
ALTER TABLE ONLY client_emails ALTER COLUMN id SET DEFAULT nextval('client_emails_id_seq'::regclass);
ALTER TABLE ONLY client_export_jobs ALTER COLUMN id SET DEFAULT nextval('client_export_jobs_id_seq'::regclass);
ALTER TABLE ONLY client_import_jobs ALTER COLUMN id SET DEFAULT nextval('client_import_jobs_id_seq'::regclass);
ALTER TABLE ONLY client_intelligence ALTER COLUMN id SET DEFAULT nextval('client_intelligence_id_seq'::regclass);
ALTER TABLE ONLY client_marketing_preferences ALTER COLUMN id SET DEFAULT nextval('client_marketing_preferences_id_seq'::regclass);
ALTER TABLE ONLY client_notes ALTER COLUMN id SET DEFAULT nextval('client_notes_id_seq'::regclass);
ALTER TABLE ONLY client_phones ALTER COLUMN id SET DEFAULT nextval('client_phones_id_seq'::regclass);
ALTER TABLE ONLY client_tag_relationships ALTER COLUMN id SET DEFAULT nextval('client_tag_relationships_id_seq'::regclass);
ALTER TABLE ONLY client_tags ALTER COLUMN id SET DEFAULT nextval('client_tags_id_seq'::regclass);
ALTER TABLE ONLY clients ALTER COLUMN id SET DEFAULT nextval('clients_id_seq'::regclass);
ALTER TABLE ONLY contractors ALTER COLUMN id SET DEFAULT nextval('contractors_id_seq'::regclass);
ALTER TABLE ONLY conversations ALTER COLUMN id SET DEFAULT nextval('conversations_id_seq'::regclass);
ALTER TABLE ONLY customer_billing_profiles ALTER COLUMN id SET DEFAULT nextval('customer_billing_profiles_id_seq'::regclass);
ALTER TABLE ONLY customers ALTER COLUMN id SET DEFAULT nextval('customers_id_seq'::regclass);
ALTER TABLE ONLY dead_seat_patterns ALTER COLUMN id SET DEFAULT nextval('dead_seat_patterns_id_seq'::regclass);
ALTER TABLE ONLY drawer_actions ALTER COLUMN id SET DEFAULT nextval('drawer_actions_id_seq'::regclass);
ALTER TABLE ONLY gift_card_transactions ALTER COLUMN id SET DEFAULT nextval('gift_card_transactions_id_seq'::regclass);
ALTER TABLE ONLY gift_cards ALTER COLUMN id SET DEFAULT nextval('gift_cards_id_seq'::regclass);
ALTER TABLE ONLY google_business_accounts ALTER COLUMN id SET DEFAULT nextval('google_business_accounts_id_seq'::regclass);
ALTER TABLE ONLY google_business_locations ALTER COLUMN id SET DEFAULT nextval('google_business_locations_id_seq'::regclass);
ALTER TABLE ONLY google_business_profiles ALTER COLUMN id SET DEFAULT nextval('google_business_profiles_id_seq'::regclass);
ALTER TABLE ONLY google_business_sync_logs ALTER COLUMN id SET DEFAULT nextval('google_business_sync_logs_id_seq'::regclass);
ALTER TABLE ONLY google_review_responses ALTER COLUMN id SET DEFAULT nextval('google_review_responses_id_seq'::regclass);
ALTER TABLE ONLY google_reviews ALTER COLUMN id SET DEFAULT nextval('google_reviews_id_seq'::regclass);
ALTER TABLE ONLY growth_score_snapshots ALTER COLUMN id SET DEFAULT nextval('growth_score_snapshots_id_seq'::regclass);
ALTER TABLE ONLY intake_form_fields ALTER COLUMN id SET DEFAULT nextval('intake_form_fields_id_seq'::regclass);
ALTER TABLE ONLY intake_form_responses ALTER COLUMN id SET DEFAULT nextval('intake_form_responses_id_seq'::regclass);
ALTER TABLE ONLY intake_forms ALTER COLUMN id SET DEFAULT nextval('intake_forms_id_seq'::regclass);
ALTER TABLE ONLY intelligence_interventions ALTER COLUMN id SET DEFAULT nextval('intelligence_interventions_id_seq'::regclass);
ALTER TABLE ONLY invoice_records ALTER COLUMN id SET DEFAULT nextval('invoice_records_id_seq'::regclass);
ALTER TABLE ONLY kiosk_checkins ALTER COLUMN id SET DEFAULT nextval('kiosk_checkins_id_seq'::regclass);
ALTER TABLE ONLY kiosk_turn ALTER COLUMN id SET DEFAULT nextval('kiosk_turn_id_seq'::regclass);
ALTER TABLE ONLY locations ALTER COLUMN id SET DEFAULT nextval('locations_id_seq'::regclass);
ALTER TABLE ONLY loyalty_transactions ALTER COLUMN id SET DEFAULT nextval('loyalty_transactions_id_seq'::regclass);
ALTER TABLE ONLY mail_settings ALTER COLUMN id SET DEFAULT nextval('mail_settings_id_seq'::regclass);
ALTER TABLE ONLY messages ALTER COLUMN id SET DEFAULT nextval('messages_id_seq'::regclass);
ALTER TABLE ONLY names ALTER COLUMN id SET DEFAULT nextval('names_id_seq'::regclass);
ALTER TABLE ONLY onboarding_submissions ALTER COLUMN id SET DEFAULT nextval('onboarding_submissions_id_seq'::regclass);
ALTER TABLE ONLY password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('password_reset_tokens_id_seq'::regclass);
ALTER TABLE ONLY payment_transactions ALTER COLUMN id SET DEFAULT nextval('payment_transactions_id_seq'::regclass);
ALTER TABLE ONLY payout_run_items ALTER COLUMN id SET DEFAULT nextval('payout_run_items_id_seq'::regclass);
ALTER TABLE ONLY payout_runs ALTER COLUMN id SET DEFAULT nextval('payout_runs_id_seq'::regclass);
ALTER TABLE ONLY payroll_run_items ALTER COLUMN id SET DEFAULT nextval('payroll_run_items_id_seq'::regclass);
ALTER TABLE ONLY payroll_runs ALTER COLUMN id SET DEFAULT nextval('payroll_runs_id_seq'::regclass);
ALTER TABLE ONLY permissions ALTER COLUMN id SET DEFAULT nextval('permissions_id_seq'::regclass);
ALTER TABLE ONLY pro_crew_locations ALTER COLUMN id SET DEFAULT nextval('pro_crew_locations_id_seq'::regclass);
ALTER TABLE ONLY pro_crews ALTER COLUMN id SET DEFAULT nextval('pro_crews_id_seq'::regclass);
ALTER TABLE ONLY pro_customers ALTER COLUMN id SET DEFAULT nextval('pro_customers_id_seq'::regclass);
ALTER TABLE ONLY pro_estimates ALTER COLUMN id SET DEFAULT nextval('pro_estimates_id_seq'::regclass);
ALTER TABLE ONLY pro_invoices ALTER COLUMN id SET DEFAULT nextval('pro_invoices_id_seq'::regclass);
ALTER TABLE ONLY pro_leads ALTER COLUMN id SET DEFAULT nextval('pro_leads_id_seq'::regclass);
ALTER TABLE ONLY pro_order_notes ALTER COLUMN id SET DEFAULT nextval('pro_order_notes_id_seq'::regclass);
ALTER TABLE ONLY pro_service_orders ALTER COLUMN id SET DEFAULT nextval('pro_service_orders_id_seq'::regclass);
ALTER TABLE ONLY products ALTER COLUMN id SET DEFAULT nextval('products_id_seq'::regclass);
ALTER TABLE ONLY refunds ALTER COLUMN id SET DEFAULT nextval('refunds_id_seq'::regclass);
ALTER TABLE ONLY reviews ALTER COLUMN id SET DEFAULT nextval('reviews_id_seq'::regclass);
ALTER TABLE ONLY roles ALTER COLUMN id SET DEFAULT nextval('roles_id_seq'::regclass);
ALTER TABLE ONLY scheduled_plan_changes ALTER COLUMN id SET DEFAULT nextval('scheduled_plan_changes_id_seq'::regclass);
ALTER TABLE ONLY seo_regions ALTER COLUMN id SET DEFAULT nextval('seo_regions_id_seq'::regclass);
ALTER TABLE ONLY service_addons ALTER COLUMN id SET DEFAULT nextval('service_addons_id_seq'::regclass);
ALTER TABLE ONLY service_categories ALTER COLUMN id SET DEFAULT nextval('service_categories_id_seq'::regclass);
ALTER TABLE ONLY service_illustration_categories ALTER COLUMN id SET DEFAULT nextval('service_illustration_categories_id_seq'::regclass);
ALTER TABLE ONLY services ALTER COLUMN id SET DEFAULT nextval('services_id_seq'::regclass);
ALTER TABLE ONLY sms_conversations ALTER COLUMN id SET DEFAULT nextval('sms_conversations_id_seq'::regclass);
ALTER TABLE ONLY sms_log ALTER COLUMN id SET DEFAULT nextval('sms_log_id_seq'::regclass);
ALTER TABLE ONLY sms_opt_outs ALTER COLUMN id SET DEFAULT nextval('sms_opt_outs_id_seq'::regclass);
ALTER TABLE ONLY sms_settings ALTER COLUMN id SET DEFAULT nextval('sms_settings_id_seq'::regclass);
ALTER TABLE ONLY staff ALTER COLUMN id SET DEFAULT nextval('staff_id_seq'::regclass);
ALTER TABLE ONLY staff_availability ALTER COLUMN id SET DEFAULT nextval('staff_availability_id_seq'::regclass);
ALTER TABLE ONLY staff_intelligence ALTER COLUMN id SET DEFAULT nextval('staff_intelligence_id_seq'::regclass);
ALTER TABLE ONLY staff_pins ALTER COLUMN id SET DEFAULT nextval('staff_pins_id_seq'::regclass);
ALTER TABLE ONLY staff_services ALTER COLUMN id SET DEFAULT nextval('staff_services_id_seq'::regclass);
ALTER TABLE ONLY staff_settings ALTER COLUMN id SET DEFAULT nextval('staff_settings_id_seq'::regclass);
ALTER TABLE ONLY store_settings ALTER COLUMN id SET DEFAULT nextval('store_settings_id_seq'::regclass);
ALTER TABLE ONLY store_subscriptions ALTER COLUMN id SET DEFAULT nextval('store_subscriptions_id_seq'::regclass);
ALTER TABLE ONLY stripe_customers ALTER COLUMN id SET DEFAULT nextval('stripe_customers_id_seq'::regclass);
ALTER TABLE ONLY stripe_orders ALTER COLUMN id SET DEFAULT nextval('stripe_orders_id_seq'::regclass);
ALTER TABLE ONLY stripe_settings ALTER COLUMN id SET DEFAULT nextval('stripe_settings_id_seq'::regclass);
ALTER TABLE ONLY stripe_subscriptions ALTER COLUMN id SET DEFAULT nextval('stripe_subscriptions_id_seq'::regclass);
ALTER TABLE ONLY stripe_webhook_events ALTER COLUMN id SET DEFAULT nextval('stripe_webhook_events_id_seq'::regclass);
ALTER TABLE ONLY subdomains ALTER COLUMN id SET DEFAULT nextval('subdomains_id_seq'::regclass);
ALTER TABLE ONLY subscription_plan_changes ALTER COLUMN id SET DEFAULT nextval('subscription_plan_changes_id_seq'::regclass);
ALTER TABLE ONLY subscriptions ALTER COLUMN id SET DEFAULT nextval('subscriptions_id_seq'::regclass);
ALTER TABLE ONLY support_agents ALTER COLUMN id SET DEFAULT nextval('support_agents_id_seq'::regclass);
ALTER TABLE ONLY support_incident_tasks ALTER COLUMN id SET DEFAULT nextval('support_incident_tasks_id_seq'::regclass);
ALTER TABLE ONLY support_incident_updates ALTER COLUMN id SET DEFAULT nextval('support_incident_updates_id_seq'::regclass);
ALTER TABLE ONLY support_incidents ALTER COLUMN id SET DEFAULT nextval('support_incidents_id_seq'::regclass);
ALTER TABLE ONLY support_ticket_messages ALTER COLUMN id SET DEFAULT nextval('support_ticket_messages_id_seq'::regclass);
ALTER TABLE ONLY support_tickets ALTER COLUMN id SET DEFAULT nextval('support_tickets_id_seq'::regclass);
ALTER TABLE ONLY timeclock ALTER COLUMN id SET DEFAULT nextval('timeclock_id_seq'::regclass);
ALTER TABLE ONLY turn_assignment_log ALTER COLUMN id SET DEFAULT nextval('turn_assignment_log_id_seq'::regclass);
ALTER TABLE ONLY waitlist ALTER COLUMN id SET DEFAULT nextval('waitlist_id_seq'::regclass);
DO $$ BEGIN
  ALTER TABLE ONLY addons
    ADD CONSTRAINT addons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY app
    ADD CONSTRAINT app_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY appointment_addons
    ADD CONSTRAINT appointment_addons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY billing_activity_logs
    ADD CONSTRAINT billing_activity_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY billing_plans
    ADD CONSTRAINT billing_plans_code_key UNIQUE (code);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY business_hours
    ADD CONSTRAINT business_hours_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY calendar_settings
    ADD CONSTRAINT calendar_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY cash_drawer_sessions
    ADD CONSTRAINT cash_drawer_sessions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_intelligence
    ADD CONSTRAINT ci_store_customer_uidx UNIQUE (store_id, customer_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_addresses
    ADD CONSTRAINT client_addresses_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_audit_logs
    ADD CONSTRAINT client_audit_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_custom_field_values
    ADD CONSTRAINT client_custom_field_values_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_custom_fields
    ADD CONSTRAINT client_custom_fields_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_emails
    ADD CONSTRAINT client_emails_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_export_jobs
    ADD CONSTRAINT client_export_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_import_jobs
    ADD CONSTRAINT client_import_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_intelligence
    ADD CONSTRAINT client_intelligence_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_marketing_preferences
    ADD CONSTRAINT client_marketing_preferences_client_id_key UNIQUE (client_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_marketing_preferences
    ADD CONSTRAINT client_marketing_preferences_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_notes
    ADD CONSTRAINT client_notes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_phones
    ADD CONSTRAINT client_phones_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_tag_relationships
    ADD CONSTRAINT client_tag_relationships_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_tags
    ADD CONSTRAINT client_tags_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY contractors
    ADD CONSTRAINT contractors_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY customer_billing_profiles
    ADD CONSTRAINT customer_billing_profiles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY customer_billing_profiles
    ADD CONSTRAINT customer_billing_profiles_stripe_customer_id_key UNIQUE (stripe_customer_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY customer_billing_profiles
    ADD CONSTRAINT customer_billing_profiles_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY dead_seat_patterns
    ADD CONSTRAINT dead_seat_patterns_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY drawer_actions
    ADD CONSTRAINT drawer_actions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY dead_seat_patterns
    ADD CONSTRAINT dsp_store_slot_uidx UNIQUE (store_id, day_of_week, hour_start);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_cards
    ADD CONSTRAINT gift_cards_code_key UNIQUE (code);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_cards
    ADD CONSTRAINT gift_cards_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_accounts
    ADD CONSTRAINT google_business_accounts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_locations
    ADD CONSTRAINT google_business_locations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_profiles
    ADD CONSTRAINT google_business_profiles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_sync_logs
    ADD CONSTRAINT google_business_sync_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_review_responses
    ADD CONSTRAINT google_review_responses_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_reviews
    ADD CONSTRAINT google_reviews_google_review_id_key UNIQUE (google_review_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_reviews
    ADD CONSTRAINT google_reviews_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY growth_score_snapshots
    ADD CONSTRAINT growth_score_snapshots_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_form_fields
    ADD CONSTRAINT intake_form_fields_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_form_responses
    ADD CONSTRAINT intake_form_responses_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_forms
    ADD CONSTRAINT intake_forms_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intelligence_interventions
    ADD CONSTRAINT intelligence_interventions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY invoice_records
    ADD CONSTRAINT invoice_records_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY invoice_records
    ADD CONSTRAINT invoice_records_stripe_invoice_id_key UNIQUE (stripe_invoice_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY kiosk_checkins
    ADD CONSTRAINT kiosk_checkins_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY kiosk_checkins
    ADD CONSTRAINT kiosk_checkins_token_key UNIQUE (token);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY kiosk_turn
    ADD CONSTRAINT kiosk_turn_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY kiosk_turn
    ADD CONSTRAINT kiosk_turn_store_id_staff_id_key UNIQUE (store_id, staff_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY launchsite_templates
    ADD CONSTRAINT launchsite_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY locations
    ADD CONSTRAINT locations_booking_slug_key UNIQUE (booking_slug);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY mail_settings
    ADD CONSTRAINT mail_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY names
    ADD CONSTRAINT names_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY onboarding_submissions
    ADD CONSTRAINT onboarding_submissions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payment_transactions
    ADD CONSTRAINT payment_transactions_stripe_charge_id_key UNIQUE (stripe_charge_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payout_run_items
    ADD CONSTRAINT payout_run_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payout_runs
    ADD CONSTRAINT payout_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payroll_run_items
    ADD CONSTRAINT payroll_run_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY permissions
    ADD CONSTRAINT permissions_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_crew_locations
    ADD CONSTRAINT pro_crew_locations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_crews
    ADD CONSTRAINT pro_crews_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_customers
    ADD CONSTRAINT pro_customers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_estimates
    ADD CONSTRAINT pro_estimates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_invoices
    ADD CONSTRAINT pro_invoices_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_leads
    ADD CONSTRAINT pro_leads_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_order_notes
    ADD CONSTRAINT pro_order_notes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_service_orders
    ADD CONSTRAINT pro_service_orders_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY refunds
    ADD CONSTRAINT refunds_stripe_refund_id_key UNIQUE (stripe_refund_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY scheduled_plan_changes
    ADD CONSTRAINT scheduled_plan_changes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY seo_regions
    ADD CONSTRAINT seo_regions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY seo_regions
    ADD CONSTRAINT seo_regions_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY service_addons
    ADD CONSTRAINT service_addons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY service_categories
    ADD CONSTRAINT service_categories_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY service_illustration_categories
    ADD CONSTRAINT service_illustration_categories_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY service_illustration_categories
    ADD CONSTRAINT service_illustration_categories_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_intelligence
    ADD CONSTRAINT si_store_staff_uidx UNIQUE (store_id, staff_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_conversations
    ADD CONSTRAINT sms_conversations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_log
    ADD CONSTRAINT sms_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_opt_outs
    ADD CONSTRAINT sms_opt_outs_phone_key UNIQUE (phone);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_opt_outs
    ADD CONSTRAINT sms_opt_outs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_settings
    ADD CONSTRAINT sms_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_availability
    ADD CONSTRAINT staff_availability_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_intelligence
    ADD CONSTRAINT staff_intelligence_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_pins
    ADD CONSTRAINT staff_pins_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_services
    ADD CONSTRAINT staff_services_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_settings
    ADD CONSTRAINT staff_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY store_settings
    ADD CONSTRAINT store_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY store_subscriptions
    ADD CONSTRAINT store_subscriptions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY store_subscriptions
    ADD CONSTRAINT store_subscriptions_store_id_key UNIQUE (store_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_customers
    ADD CONSTRAINT stripe_customers_customer_id_key UNIQUE (customer_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_customers
    ADD CONSTRAINT stripe_customers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_customers
    ADD CONSTRAINT stripe_customers_store_number_key UNIQUE (store_number);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_orders
    ADD CONSTRAINT stripe_orders_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_settings
    ADD CONSTRAINT stripe_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_subscriptions
    ADD CONSTRAINT stripe_subscriptions_customer_id_key UNIQUE (customer_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_subscriptions
    ADD CONSTRAINT stripe_subscriptions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_stripe_event_id_key UNIQUE (stripe_event_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subdomains
    ADD CONSTRAINT subdomains_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subdomains
    ADD CONSTRAINT subdomains_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subscription_plan_changes
    ADD CONSTRAINT subscription_plan_changes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_agents
    ADD CONSTRAINT support_agents_email_key UNIQUE (email);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_agents
    ADD CONSTRAINT support_agents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_incident_tasks
    ADD CONSTRAINT support_incident_tasks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_incident_updates
    ADD CONSTRAINT support_incident_updates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_incidents
    ADD CONSTRAINT support_incidents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_tickets
    ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY timeclock
    ADD CONSTRAINT timeclock_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY turn_assignment_log
    ADD CONSTRAINT turn_assignment_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY users
    ADD CONSTRAINT users_email_key UNIQUE (email);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions USING btree (expire);
CREATE INDEX IF NOT EXISTS app_store_app_unique_idx ON app USING btree (store_id, app_name);
CREATE INDEX IF NOT EXISTS app_store_id_idx ON app USING btree (store_id);
CREATE INDEX IF NOT EXISTS ci_churn_risk_idx ON client_intelligence USING btree (churn_risk_score);
CREATE INDEX IF NOT EXISTS ci_customer_id_idx ON client_intelligence USING btree (customer_id);
CREATE INDEX IF NOT EXISTS ci_is_at_risk_idx ON client_intelligence USING btree (is_at_risk);
CREATE INDEX IF NOT EXISTS ci_is_drifting_idx ON client_intelligence USING btree (is_drifting);
CREATE INDEX IF NOT EXISTS ci_store_id_idx ON client_intelligence USING btree (store_id);
CREATE INDEX IF NOT EXISTS client_addresses_client_id_idx ON client_addresses USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_audit_action_idx ON client_audit_logs USING btree (action_type);
CREATE INDEX IF NOT EXISTS client_audit_client_idx ON client_audit_logs USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_audit_created_idx ON client_audit_logs USING btree (created_at);
CREATE INDEX IF NOT EXISTS client_audit_store_idx ON client_audit_logs USING btree (store_id);
CREATE INDEX IF NOT EXISTS client_cfv_client_idx ON client_custom_field_values USING btree (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_cfv_uidx ON client_custom_field_values USING btree (client_id, custom_field_id);
CREATE INDEX IF NOT EXISTS client_custom_fields_store_idx ON client_custom_fields USING btree (store_id);
CREATE INDEX IF NOT EXISTS client_emails_address_idx ON client_emails USING btree (email_address);
CREATE INDEX IF NOT EXISTS client_emails_client_id_idx ON client_emails USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_export_jobs_status_idx ON client_export_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS client_export_jobs_store_idx ON client_export_jobs USING btree (store_id);
CREATE INDEX IF NOT EXISTS client_import_jobs_status_idx ON client_import_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS client_import_jobs_store_idx ON client_import_jobs USING btree (store_id);
CREATE INDEX IF NOT EXISTS client_mkt_prefs_client_idx ON client_marketing_preferences USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_notes_client_id_idx ON client_notes USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_notes_pinned_idx ON client_notes USING btree (pinned);
CREATE INDEX IF NOT EXISTS client_notes_store_id_idx ON client_notes USING btree (store_id);
CREATE INDEX IF NOT EXISTS client_phones_client_id_idx ON client_phones USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_phones_e164_idx ON client_phones USING btree (phone_number_e164);
CREATE UNIQUE INDEX IF NOT EXISTS client_phones_phone_store_unique ON client_phones USING btree (phone_number_e164, store_id);
CREATE INDEX IF NOT EXISTS client_tag_rel_client_idx ON client_tag_relationships USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_tag_rel_tag_idx ON client_tag_relationships USING btree (tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_tag_rel_uidx ON client_tag_relationships USING btree (client_id, tag_id);
CREATE INDEX IF NOT EXISTS client_tags_store_id_idx ON client_tags USING btree (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_tags_store_name_uidx ON client_tags USING btree (store_id, tag_name);
CREATE INDEX IF NOT EXISTS clients_full_name_idx ON clients USING btree (full_name);
CREATE INDEX IF NOT EXISTS clients_last_visit_idx ON clients USING btree (last_visit_at);
CREATE INDEX IF NOT EXISTS clients_status_idx ON clients USING btree (client_status);
CREATE INDEX IF NOT EXISTS clients_store_id_idx ON clients USING btree (store_id);
CREATE INDEX IF NOT EXISTS dsp_store_id_idx ON dead_seat_patterns USING btree (store_id);
CREATE INDEX IF NOT EXISTS gba_google_account_id_idx ON google_business_accounts USING btree (google_account_id);
CREATE INDEX IF NOT EXISTS gba_store_id_idx ON google_business_accounts USING btree (store_id);
CREATE INDEX IF NOT EXISTS gba_user_id_idx ON google_business_accounts USING btree (user_id);
CREATE INDEX IF NOT EXISTS gbl_business_account_id_idx ON google_business_locations USING btree (business_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS gbl_location_resource_name_uidx ON google_business_locations USING btree (location_resource_name);
CREATE INDEX IF NOT EXISTS gbl_store_id_idx ON google_business_locations USING btree (store_id);
CREATE INDEX IF NOT EXISTS gbl_user_id_idx ON google_business_locations USING btree (user_id);
CREATE INDEX IF NOT EXISTS gbsl_location_id_idx ON google_business_sync_logs USING btree (location_id);
CREATE INDEX IF NOT EXISTS gbsl_store_id_idx ON google_business_sync_logs USING btree (store_id);
CREATE INDEX IF NOT EXISTS gbsl_synced_at_idx ON google_business_sync_logs USING btree (synced_at);
CREATE INDEX IF NOT EXISTS google_business_profiles_store_id_idx ON google_business_profiles USING btree (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS google_business_profiles_store_id_uidx ON google_business_profiles USING btree (store_id);
CREATE INDEX IF NOT EXISTS google_review_responses_google_review_id_idx ON google_review_responses USING btree (google_review_id);
CREATE INDEX IF NOT EXISTS google_review_responses_response_status_idx ON google_review_responses USING btree (response_status);
CREATE INDEX IF NOT EXISTS google_review_responses_store_id_idx ON google_review_responses USING btree (store_id);
CREATE INDEX IF NOT EXISTS google_reviews_google_review_id_idx ON google_reviews USING btree (google_review_id);
CREATE INDEX IF NOT EXISTS google_reviews_rating_idx ON google_reviews USING btree (rating);
CREATE INDEX IF NOT EXISTS google_reviews_response_status_idx ON google_reviews USING btree (response_status);
CREATE INDEX IF NOT EXISTS google_reviews_store_id_idx ON google_reviews USING btree (store_id);
CREATE INDEX IF NOT EXISTS gss_snapshot_date_idx ON growth_score_snapshots USING btree (snapshot_date);
CREATE INDEX IF NOT EXISTS gss_store_id_idx ON growth_score_snapshots USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys USING btree (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_store_id ON api_keys USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_billing_activity_created_at ON billing_activity_logs USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_billing_activity_event_type ON billing_activity_logs USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_billing_activity_salon_id ON billing_activity_logs USING btree (salon_id);
CREATE INDEX IF NOT EXISTS idx_billing_activity_user_id ON billing_activity_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns USING btree (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_store_id ON campaigns USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_cbp_salon_id ON customer_billing_profiles USING btree (salon_id);
CREATE INDEX IF NOT EXISTS idx_cbp_stripe_customer_id ON customer_billing_profiles USING btree (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_cbp_user_id ON customer_billing_profiles USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_records_salon_id ON invoice_records USING btree (salon_id);
CREATE INDEX IF NOT EXISTS idx_invoice_records_stripe_customer_id ON invoice_records USING btree (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_records_stripe_invoice_id ON invoice_records USING btree (stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_locations_stripe_customer_id ON locations USING btree (stripe_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_names_name_origin_unique ON names USING btree (name, origin);
CREATE INDEX IF NOT EXISTS idx_names_origin ON names USING btree (origin);
CREATE INDEX IF NOT EXISTS idx_payment_txn_salon_id ON payment_transactions USING btree (salon_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_stripe_charge_id ON payment_transactions USING btree (stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_stripe_pi_id ON payment_transactions USING btree (stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_refunds_salon_id ON refunds USING btree (salon_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_charge_id ON refunds USING btree (stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund_id ON refunds USING btree (stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_plan_changes_sub_id ON scheduled_plan_changes USING btree (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id ON stripe_customers USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_store_number ON stripe_customers USING btree (store_number);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_checkout_session ON stripe_orders USING btree (checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_customer_id ON stripe_orders USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subs_customer_id ON stripe_subscriptions USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subs_subscription_id ON stripe_subscriptions USING btree (subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events USING btree (stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed ON stripe_webhook_events USING btree (processed);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type ON stripe_webhook_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_sub_plan_changes_salon_id ON subscription_plan_changes USING btree (salon_id);
CREATE INDEX IF NOT EXISTS idx_sub_plan_changes_stripe_sub_id ON subscription_plan_changes USING btree (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_number ON subscriptions USING btree (store_number);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON subscriptions USING btree (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS ii_customer_id_idx ON intelligence_interventions USING btree (customer_id);
CREATE INDEX IF NOT EXISTS ii_sent_at_idx ON intelligence_interventions USING btree (sent_at);
CREATE INDEX IF NOT EXISTS ii_store_id_idx ON intelligence_interventions USING btree (store_id);
CREATE INDEX IF NOT EXISTS ii_type_idx ON intelligence_interventions USING btree (intervention_type);
CREATE INDEX IF NOT EXISTS launchsite_templates_category_idx ON launchsite_templates USING btree (category);
CREATE INDEX IF NOT EXISTS launchsite_templates_sort_idx ON launchsite_templates USING btree (sort_order, created_at);
CREATE INDEX IF NOT EXISTS permissions_store_id_idx ON permissions USING btree (store_id);
CREATE INDEX IF NOT EXISTS pr_store_created_idx ON payroll_runs USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pr_store_status_idx ON payroll_runs USING btree (store_id, status);
CREATE INDEX IF NOT EXISTS pri_run_idx ON payroll_run_items USING btree (payroll_run_id);
CREATE INDEX IF NOT EXISTS roles_name_store_idx ON roles USING btree (name, store_id);
CREATE INDEX IF NOT EXISTS roles_store_id_idx ON roles USING btree (store_id);
CREATE INDEX IF NOT EXISTS si_staff_id_idx ON staff_intelligence USING btree (staff_id);
CREATE INDEX IF NOT EXISTS si_store_id_idx ON staff_intelligence USING btree (store_id);
CREATE INDEX IF NOT EXISTS sms_conv_store_created_idx ON sms_conversations USING btree (store_id, created_at);
CREATE INDEX IF NOT EXISTS sms_conv_store_phone_idx ON sms_conversations USING btree (store_id, client_phone);
CREATE UNIQUE INDEX IF NOT EXISTS sp_staff_store_uidx ON staff_pins USING btree (staff_id, store_id);
CREATE UNIQUE INDEX IF NOT EXISTS sp_store_pin_uidx ON staff_pins USING btree (store_id, pin);
CREATE UNIQUE INDEX IF NOT EXISTS staff_settings_staff_id_uidx ON staff_settings USING btree (staff_id);
CREATE INDEX IF NOT EXISTS staff_settings_store_id_idx ON staff_settings USING btree (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS store_settings_store_id_uidx ON store_settings USING btree (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_settings_store_id_uidx ON stripe_settings USING btree (store_id);
CREATE INDEX IF NOT EXISTS tc_staff_date_idx ON timeclock USING btree (staff_id, work_date);
CREATE INDEX IF NOT EXISTS tc_store_date_idx ON timeclock USING btree (store_id, work_date);
DO $$ BEGIN
  ALTER TABLE ONLY addons
    ADD CONSTRAINT addons_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY api_keys
    ADD CONSTRAINT api_keys_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY app
    ADD CONSTRAINT app_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY appointment_addons
    ADD CONSTRAINT appointment_addons_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES addons(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY appointment_addons
    ADD CONSTRAINT appointment_addons_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY appointments
    ADD CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY appointments
    ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY appointments
    ADD CONSTRAINT appointments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY appointments
    ADD CONSTRAINT appointments_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY billing_activity_logs
    ADD CONSTRAINT billing_activity_logs_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY billing_activity_logs
    ADD CONSTRAINT billing_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY business_hours
    ADD CONSTRAINT business_hours_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY calendar_settings
    ADD CONSTRAINT calendar_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY campaigns
    ADD CONSTRAINT campaigns_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY cash_drawer_sessions
    ADD CONSTRAINT cash_drawer_sessions_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_addresses
    ADD CONSTRAINT client_addresses_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_audit_logs
    ADD CONSTRAINT client_audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_audit_logs
    ADD CONSTRAINT client_audit_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_audit_logs
    ADD CONSTRAINT client_audit_logs_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_custom_field_values
    ADD CONSTRAINT client_custom_field_values_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_custom_field_values
    ADD CONSTRAINT client_custom_field_values_custom_field_id_fkey FOREIGN KEY (custom_field_id) REFERENCES client_custom_fields(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_custom_fields
    ADD CONSTRAINT client_custom_fields_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_emails
    ADD CONSTRAINT client_emails_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_export_jobs
    ADD CONSTRAINT client_export_jobs_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_export_jobs
    ADD CONSTRAINT client_export_jobs_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_import_jobs
    ADD CONSTRAINT client_import_jobs_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_import_jobs
    ADD CONSTRAINT client_import_jobs_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_intelligence
    ADD CONSTRAINT client_intelligence_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_intelligence
    ADD CONSTRAINT client_intelligence_preferred_staff_id_fkey FOREIGN KEY (preferred_staff_id) REFERENCES staff(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_intelligence
    ADD CONSTRAINT client_intelligence_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_marketing_preferences
    ADD CONSTRAINT client_marketing_preferences_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_notes
    ADD CONSTRAINT client_notes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_notes
    ADD CONSTRAINT client_notes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_notes
    ADD CONSTRAINT client_notes_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_phones
    ADD CONSTRAINT client_phones_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_tag_relationships
    ADD CONSTRAINT client_tag_relationships_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_tag_relationships
    ADD CONSTRAINT client_tag_relationships_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES client_tags(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY client_tags
    ADD CONSTRAINT client_tags_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY clients
    ADD CONSTRAINT clients_preferred_staff_id_fkey FOREIGN KEY (preferred_staff_id) REFERENCES staff(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY clients
    ADD CONSTRAINT clients_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY customer_billing_profiles
    ADD CONSTRAINT customer_billing_profiles_current_plan_id_fkey FOREIGN KEY (current_plan_id) REFERENCES billing_plans(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY customer_billing_profiles
    ADD CONSTRAINT customer_billing_profiles_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY customer_billing_profiles
    ADD CONSTRAINT customer_billing_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY customers
    ADD CONSTRAINT customers_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY dead_seat_patterns
    ADD CONSTRAINT dead_seat_patterns_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY drawer_actions
    ADD CONSTRAINT drawer_actions_session_id_fkey FOREIGN KEY (session_id) REFERENCES cash_drawer_sessions(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_gift_card_id_fkey FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_cards
    ADD CONSTRAINT gift_cards_purchased_by_customer_id_fkey FOREIGN KEY (purchased_by_customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_cards
    ADD CONSTRAINT gift_cards_recipient_customer_id_fkey FOREIGN KEY (recipient_customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY gift_cards
    ADD CONSTRAINT gift_cards_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_accounts
    ADD CONSTRAINT google_business_accounts_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_accounts
    ADD CONSTRAINT google_business_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_locations
    ADD CONSTRAINT google_business_locations_business_account_id_fkey FOREIGN KEY (business_account_id) REFERENCES google_business_accounts(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_locations
    ADD CONSTRAINT google_business_locations_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_locations
    ADD CONSTRAINT google_business_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_profiles
    ADD CONSTRAINT google_business_profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_sync_logs
    ADD CONSTRAINT google_business_sync_logs_location_id_fkey FOREIGN KEY (location_id) REFERENCES google_business_locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_sync_logs
    ADD CONSTRAINT google_business_sync_logs_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_business_sync_logs
    ADD CONSTRAINT google_business_sync_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_review_responses
    ADD CONSTRAINT google_review_responses_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_review_responses
    ADD CONSTRAINT google_review_responses_google_review_id_fkey FOREIGN KEY (google_review_id) REFERENCES google_reviews(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_review_responses
    ADD CONSTRAINT google_review_responses_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_review_responses
    ADD CONSTRAINT google_review_responses_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_reviews
    ADD CONSTRAINT google_reviews_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_reviews
    ADD CONSTRAINT google_reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_reviews
    ADD CONSTRAINT google_reviews_gb_location_id_fkey FOREIGN KEY (gb_location_id) REFERENCES google_business_locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY google_reviews
    ADD CONSTRAINT google_reviews_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY growth_score_snapshots
    ADD CONSTRAINT growth_score_snapshots_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_form_fields
    ADD CONSTRAINT intake_form_fields_form_id_fkey FOREIGN KEY (form_id) REFERENCES intake_forms(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_form_responses
    ADD CONSTRAINT intake_form_responses_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_form_responses
    ADD CONSTRAINT intake_form_responses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_form_responses
    ADD CONSTRAINT intake_form_responses_form_id_fkey FOREIGN KEY (form_id) REFERENCES intake_forms(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_form_responses
    ADD CONSTRAINT intake_form_responses_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_forms
    ADD CONSTRAINT intake_forms_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intake_forms
    ADD CONSTRAINT intake_forms_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intelligence_interventions
    ADD CONSTRAINT intelligence_interventions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY intelligence_interventions
    ADD CONSTRAINT intelligence_interventions_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY invoice_records
    ADD CONSTRAINT invoice_records_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY locations
    ADD CONSTRAINT locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY mail_settings
    ADD CONSTRAINT mail_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payment_transactions
    ADD CONSTRAINT payment_transactions_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payment_transactions
    ADD CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payout_run_items
    ADD CONSTRAINT payout_run_items_payout_run_id_fkey FOREIGN KEY (payout_run_id) REFERENCES payout_runs(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payroll_run_items
    ADD CONSTRAINT payroll_run_items_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payroll_run_items
    ADD CONSTRAINT payroll_run_items_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY payroll_runs
    ADD CONSTRAINT payroll_runs_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY permissions
    ADD CONSTRAINT permissions_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_crew_locations
    ADD CONSTRAINT pro_crew_locations_crew_id_fkey FOREIGN KEY (crew_id) REFERENCES pro_crews(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_crews
    ADD CONSTRAINT pro_crews_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_customers
    ADD CONSTRAINT pro_customers_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_estimates
    ADD CONSTRAINT pro_estimates_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES pro_customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_estimates
    ADD CONSTRAINT pro_estimates_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_invoices
    ADD CONSTRAINT pro_invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES pro_service_orders(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_invoices
    ADD CONSTRAINT pro_invoices_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_order_notes
    ADD CONSTRAINT pro_order_notes_order_id_fkey FOREIGN KEY (order_id) REFERENCES pro_service_orders(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_order_notes
    ADD CONSTRAINT pro_order_notes_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_service_orders
    ADD CONSTRAINT pro_service_orders_crew_id_fkey FOREIGN KEY (crew_id) REFERENCES pro_crews(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY pro_service_orders
    ADD CONSTRAINT pro_service_orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY products
    ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY refunds
    ADD CONSTRAINT refunds_initiated_by_user_id_fkey FOREIGN KEY (initiated_by_user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY refunds
    ADD CONSTRAINT refunds_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY refunds
    ADD CONSTRAINT refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY reviews
    ADD CONSTRAINT reviews_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY reviews
    ADD CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY reviews
    ADD CONSTRAINT reviews_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY reviews
    ADD CONSTRAINT reviews_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY roles
    ADD CONSTRAINT roles_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY scheduled_plan_changes
    ADD CONSTRAINT scheduled_plan_changes_new_plan_code_fkey FOREIGN KEY (new_plan_code) REFERENCES billing_plans(code);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY service_addons
    ADD CONSTRAINT service_addons_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES addons(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY service_addons
    ADD CONSTRAINT service_addons_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY service_categories
    ADD CONSTRAINT service_categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY services
    ADD CONSTRAINT services_category_id_fkey FOREIGN KEY (category_id) REFERENCES service_categories(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY services
    ADD CONSTRAINT services_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_conversations
    ADD CONSTRAINT sms_conversations_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_log
    ADD CONSTRAINT sms_log_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_log
    ADD CONSTRAINT sms_log_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_log
    ADD CONSTRAINT sms_log_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY sms_settings
    ADD CONSTRAINT sms_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_availability
    ADD CONSTRAINT staff_availability_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_intelligence
    ADD CONSTRAINT staff_intelligence_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_intelligence
    ADD CONSTRAINT staff_intelligence_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_pins
    ADD CONSTRAINT staff_pins_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_pins
    ADD CONSTRAINT staff_pins_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_services
    ADD CONSTRAINT staff_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_services
    ADD CONSTRAINT staff_services_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_settings
    ADD CONSTRAINT staff_settings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff_settings
    ADD CONSTRAINT staff_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY staff
    ADD CONSTRAINT staff_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY store_settings
    ADD CONSTRAINT store_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_customers
    ADD CONSTRAINT stripe_customers_store_number_fkey FOREIGN KEY (store_number) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_customers
    ADD CONSTRAINT stripe_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY stripe_settings
    ADD CONSTRAINT stripe_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subdomains
    ADD CONSTRAINT subdomains_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES onboarding_submissions(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subscription_plan_changes
    ADD CONSTRAINT subscription_plan_changes_new_plan_id_fkey FOREIGN KEY (new_plan_id) REFERENCES billing_plans(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subscription_plan_changes
    ADD CONSTRAINT subscription_plan_changes_old_plan_id_fkey FOREIGN KEY (old_plan_id) REFERENCES billing_plans(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subscription_plan_changes
    ADD CONSTRAINT subscription_plan_changes_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subscription_plan_changes
    ADD CONSTRAINT subscription_plan_changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_plan_code_fkey FOREIGN KEY (plan_code) REFERENCES billing_plans(code);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_store_number_fkey FOREIGN KEY (store_number) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY timeclock
    ADD CONSTRAINT timeclock_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY timeclock
    ADD CONSTRAINT timeclock_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY waitlist
    ADD CONSTRAINT waitlist_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY waitlist
    ADD CONSTRAINT waitlist_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY waitlist
    ADD CONSTRAINT waitlist_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY waitlist
    ADD CONSTRAINT waitlist_store_id_fkey FOREIGN KEY (store_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

CREATE TABLE "wb_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"thumbnail" text,
	"files_path" text NOT NULL,
	"build_status" text,
	"build_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wb_websites" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"storeid" text,
	"template_id" integer,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"custom_domain" text,
	"custom_domain_status" text,
	"custom_domain_token" text,
	"stripe_checkout_session_id" text,
	"assigned_subdomain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wb_websites_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "wb_image_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"category" text NOT NULL,
	"original_url" text,
	"file_size" integer,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wb_purchased_subdomains" (
	"id" serial PRIMARY KEY NOT NULL,
	"storeid" text NOT NULL,
	"subdomain" text NOT NULL,
	"stripe_checkout_session_id" text,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "wb_purchased_subdomains_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
CREATE TABLE "addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"duration" integer NOT NULL,
	"image_url" text,
	"store_id" integer
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" text DEFAULT 'read',
	"is_active" boolean DEFAULT true,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "appointment_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointment_id" integer NOT NULL,
	"addon_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"duration" integer NOT NULL,
	"status" text DEFAULT 'pending',
	"notes" text,
	"cancellation_reason" text,
	"payment_method" text,
	"tip_amount" numeric(10, 2),
	"discount_amount" numeric(10, 2),
	"total_paid" numeric(10, 2),
	"started_at" timestamp,
	"completed_at" timestamp,
	"service_id" integer,
	"staff_id" integer,
	"customer_id" integer,
	"store_id" integer,
	"recurrence_rule" text,
	"recurrence_parent_id" integer,
	"deposit_required" boolean DEFAULT false,
	"deposit_amount" numeric(10, 2),
	"deposit_paid" boolean DEFAULT false,
	"gift_card_id" integer,
	"gift_card_amount" numeric(10, 2),
	"loyalty_points_earned" integer DEFAULT 0,
	"loyalty_points_redeemed" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "app" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"app_name" text NOT NULL,
	"active" boolean DEFAULT false,
	"active_date" timestamp,
	"user_pin" text,
	"permissions" integer
);
--> statement-breakpoint
CREATE TABLE "billing_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"salon_id" integer,
	"user_id" text,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata_json" jsonb,
	"source" text DEFAULT 'system',
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" numeric(12, 0) NOT NULL,
	"contacts_min" numeric(12, 0),
	"contacts_max" numeric(12, 0),
	"stripe_price_id" text,
	"stripe_product_id" text,
	"interval" text DEFAULT 'month',
	"sms_credits" numeric(12, 0),
	"currency" text DEFAULT 'usd',
	"active" boolean DEFAULT true,
	"features_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "billing_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" text DEFAULT '09:00' NOT NULL,
	"close_time" text DEFAULT '17:00' NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"start_of_week" text DEFAULT 'monday' NOT NULL,
	"time_slot_interval" integer DEFAULT 15 NOT NULL,
	"non_working_hours_display" integer DEFAULT 1 NOT NULL,
	"allow_booking_outside_hours" boolean DEFAULT true NOT NULL,
	"auto_complete_appointments" boolean DEFAULT true NOT NULL,
	"auto_mark_no_shows" boolean DEFAULT false NOT NULL,
	"show_prices" boolean DEFAULT true NOT NULL,
	"walk_ins_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"channel" text DEFAULT 'sms' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"audience_value" text,
	"message_template" text NOT NULL,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"sent_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_drawer_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"opened_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"opening_balance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"closing_balance" numeric(10, 2),
	"denomination_breakdown" text,
	"opening_denomination_breakdown" text,
	"reported_card_sales" numeric(10, 2),
	"prior_closing_mismatch" boolean DEFAULT false NOT NULL,
	"prior_closing_variance" numeric(10, 2),
	"prior_closing_resolved_by" text,
	"prior_closing_resolved_at" timestamp,
	"prior_closing_resolution_notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_by" text,
	"closed_by" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "client_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'US',
	"address_type" text DEFAULT 'home' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"store_id" integer NOT NULL,
	"action_type" text NOT NULL,
	"actor_user_id" text,
	"metadata_json" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"custom_field_id" integer NOT NULL,
	"field_value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"field_name" text NOT NULL,
	"field_type" text DEFAULT 'text' NOT NULL,
	"field_options_json" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"email_address" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"marketing_opt_in" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_export_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"requested_by_user_id" text,
	"format" text DEFAULT 'csv' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"filter_json" jsonb,
	"total_rows" integer,
	"download_url" text,
	"error_message" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "client_import_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"requested_by_user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_name" text,
	"total_rows" integer DEFAULT 0,
	"imported_rows" integer DEFAULT 0,
	"skipped_rows" integer DEFAULT 0,
	"error_rows" integer DEFAULT 0,
	"duplicates_found" integer DEFAULT 0,
	"preview_json" jsonb,
	"errors_json" jsonb,
	"field_mapping_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "client_intelligence" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"avg_visit_cadence_days" numeric(6, 1),
	"last_visit_date" timestamp,
	"next_expected_visit_date" timestamp,
	"days_since_last_visit" integer,
	"days_overdue_pct" numeric(6, 1),
	"total_visits" integer DEFAULT 0,
	"total_revenue" numeric(10, 2) DEFAULT '0.00',
	"avg_ticket_value" numeric(10, 2) DEFAULT '0.00',
	"ltv_12_month" numeric(10, 2) DEFAULT '0.00',
	"ltv_all_time" numeric(10, 2) DEFAULT '0.00',
	"ltv_score" integer DEFAULT 0,
	"churn_risk_score" integer DEFAULT 0,
	"churn_risk_label" text DEFAULT 'low',
	"no_show_count" integer DEFAULT 0,
	"no_show_rate" numeric(5, 2) DEFAULT '0.00',
	"rebooking_rate" numeric(5, 2) DEFAULT '0.00',
	"preferred_staff_id" integer,
	"preferred_day_of_week" integer,
	"preferred_time_of_day" text,
	"last_winback_sent_at" timestamp,
	"winback_sent_count" integer DEFAULT 0,
	"is_drifting" boolean DEFAULT false,
	"is_at_risk" boolean DEFAULT false,
	"computed_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "client_marketing_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"sms_marketing_opt_in" boolean DEFAULT true NOT NULL,
	"email_marketing_opt_in" boolean DEFAULT true NOT NULL,
	"promotional_notifications" boolean DEFAULT true NOT NULL,
	"appointment_reminders" boolean DEFAULT true NOT NULL,
	"birthday_messages" boolean DEFAULT true NOT NULL,
	"review_requests" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_marketing_preferences_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "client_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"created_by_user_id" text,
	"note_type" text DEFAULT 'general' NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"note_content" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_phones" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"phone_number_e164" text NOT NULL,
	"display_phone" text,
	"phone_type" text DEFAULT 'mobile' NOT NULL,
	"sms_opt_in" boolean DEFAULT true NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_tag_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"tag_name" text NOT NULL,
	"tag_color" text DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"preferred_name" text,
	"date_of_birth" text,
	"allergies" text,
	"gender" text,
	"preferred_staff_id" integer,
	"client_status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'manual',
	"referral_source" text,
	"avatar_url" text,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"total_spent_cents" integer DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp,
	"next_appointment_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pro_crew_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"crew_id" integer NOT NULL,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pro_crews" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#00D4AA' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"phone" text,
	"pin_hash" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_billing_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"salon_id" integer,
	"stripe_customer_id" text,
	"default_payment_method_id" text,
	"customer_email" text,
	"customer_name" text,
	"billing_phone" text,
	"billing_address_line1" text,
	"billing_address_line2" text,
	"billing_city" text,
	"billing_state" text,
	"billing_zip" text,
	"billing_country" text DEFAULT 'US',
	"tax_exempt_status" text DEFAULT 'none',
	"preferred_currency" text DEFAULT 'usd',
	"current_plan_id" integer,
	"current_subscription_status" text DEFAULT 'none',
	"trial_ends_at" timestamp,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"canceled_at" timestamp,
	"subscription_started_at" timestamp,
	"lifetime_value_cents" bigint DEFAULT 0,
	"total_successful_payments" integer DEFAULT 0,
	"total_failed_payments" integer DEFAULT 0,
	"last_payment_date" timestamp,
	"last_payment_amount_cents" bigint,
	"last_failed_payment_date" timestamp,
	"last_failed_payment_reason" text,
	"delinquent" boolean DEFAULT false,
	"account_hold" boolean DEFAULT false,
	"internal_billing_notes" text,
	"account_status" text DEFAULT 'active',
	"suspended_at" timestamp,
	"locked_at" timestamp,
	"suspended_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_billing_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "customer_billing_profiles_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"birthday" text,
	"allergies" text,
	"marketing_opt_in" boolean DEFAULT true,
	"loyalty_points" integer DEFAULT 0,
	"store_id" integer
);
--> statement-breakpoint
CREATE TABLE "dead_seat_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"hour_start" integer NOT NULL,
	"avg_utilization_pct" numeric(5, 2) DEFAULT '0.00',
	"total_slots_analyzed" integer DEFAULT 0,
	"booked_slots" integer DEFAULT 0,
	"estimated_lost_revenue" numeric(10, 2) DEFAULT '0.00',
	"computed_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "drawer_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2),
	"reason" text,
	"performed_by" text,
	"performed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_card_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"gift_card_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"appointment_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"type" text NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"code" text NOT NULL,
	"original_amount" numeric(10, 2) NOT NULL,
	"remaining_balance" numeric(10, 2) NOT NULL,
	"issued_to_name" text,
	"issued_to_email" text,
	"purchased_by_customer_id" integer,
	"recipient_customer_id" integer,
	"is_active" boolean DEFAULT true,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"notes" text,
	CONSTRAINT "gift_cards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "google_business_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"google_account_id" text NOT NULL,
	"account_name" text,
	"access_token" text,
	"refresh_token" text,
	"token_expiry" timestamp,
	"scopes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "google_business_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"business_account_id" integer NOT NULL,
	"location_resource_name" text NOT NULL,
	"location_id" text NOT NULL,
	"location_name" text,
	"address" text,
	"phone" text,
	"is_selected" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "google_business_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"google_account_email" text,
	"business_name" text,
	"business_account_id" text,
	"business_account_resource_name" text,
	"location_id" text,
	"location_resource_name" text,
	"location_address" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"is_connected" boolean DEFAULT false,
	"sync_enabled" boolean DEFAULT true,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "google_business_sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer,
	"user_id" varchar,
	"location_id" integer,
	"sync_type" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"reviews_synced" integer,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "google_review_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_review_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"response_text" text NOT NULL,
	"response_status" text NOT NULL,
	"staff_id" integer,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "google_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"google_review_id" text NOT NULL,
	"google_location_id" text,
	"gb_location_id" integer,
	"customer_name" text,
	"customer_phone_number" text,
	"rating" integer NOT NULL,
	"review_text" text,
	"review_image_urls" text,
	"review_create_time" timestamp,
	"review_update_time" timestamp,
	"reviewer_language_code" text,
	"review_publishing_status" text DEFAULT 'published',
	"response_status" text DEFAULT 'not_responded',
	"appointment_id" integer,
	"customer_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "google_reviews_google_review_id_unique" UNIQUE("google_review_id")
);
--> statement-breakpoint
CREATE TABLE "growth_score_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"overall_score" integer NOT NULL,
	"retention_score" integer NOT NULL,
	"rebooking_score" integer NOT NULL,
	"utilization_score" integer NOT NULL,
	"revenue_score" integer NOT NULL,
	"new_client_score" integer NOT NULL,
	"active_clients" integer DEFAULT 0,
	"drifting_clients" integer DEFAULT 0,
	"at_risk_clients" integer DEFAULT 0,
	"avg_rebooking_rate" numeric(5, 2),
	"seat_utilization_pct" numeric(5, 2),
	"monthly_revenue" numeric(10, 2),
	"snapshot_date" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "intake_form_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"options" text,
	"required" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "intake_form_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"customer_id" integer,
	"appointment_id" integer,
	"customer_name" text,
	"responses" text NOT NULL,
	"submitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intake_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"require_before_booking" boolean DEFAULT false,
	"service_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intelligence_interventions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"customer_id" integer,
	"intervention_type" text NOT NULL,
	"channel" text DEFAULT 'sms' NOT NULL,
	"message_body" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"triggered_by" text DEFAULT 'auto' NOT NULL,
	"metadata" jsonb,
	"sent_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"responded_at" timestamp,
	"converted_at" timestamp,
	"appointment_id" integer
);
--> statement-breakpoint
CREATE TABLE "invoice_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"salon_id" integer,
	"invoice_number" text,
	"status" text,
	"paid" boolean DEFAULT false,
	"attempted" boolean DEFAULT false,
	"forgiven" boolean DEFAULT false,
	"collection_method" text,
	"currency" text DEFAULT 'usd',
	"subtotal_cents" bigint DEFAULT 0,
	"tax_cents" bigint DEFAULT 0,
	"total_cents" bigint DEFAULT 0,
	"amount_paid_cents" bigint DEFAULT 0,
	"amount_remaining_cents" bigint DEFAULT 0,
	"hosted_invoice_url" text,
	"invoice_pdf_url" text,
	"billing_reason" text,
	"period_start" timestamp,
	"period_end" timestamp,
	"due_date" timestamp,
	"paid_at" timestamp,
	"attempted_at" timestamp,
	"next_payment_attempt" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "invoice_records_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "launchsite_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"style" text DEFAULT 'Modern' NOT NULL,
	"desc" text DEFAULT '' NOT NULL,
	"badge" text DEFAULT '' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accent" text DEFAULT '#a855f7' NOT NULL,
	"dark" text DEFAULT '#0a0b15' NOT NULL,
	"light" text DEFAULT '#1c1d27' NOT NULL,
	"url_slug" text NOT NULL,
	"hero_tagline" text DEFAULT '' NOT NULL,
	"hero_sub" text DEFAULT '' NOT NULL,
	"business_name" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'php' NOT NULL,
	"react_path" text,
	"scraped_path" text,
	"source_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"category" text,
	"city" text,
	"state" text,
	"postcode" text,
	"booking_slug" text,
	"booking_theme" text DEFAULT 'simple',
	"commission_payout_frequency" text DEFAULT 'monthly',
	"sms_tokens" integer DEFAULT 0 NOT NULL,
	"sms_allowance" integer DEFAULT 0 NOT NULL,
	"sms_credits" integer DEFAULT 0 NOT NULL,
	"sms_credits_total_purchased" integer DEFAULT 0 NOT NULL,
	"user_id" text,
	"account_status" text DEFAULT 'Active',
	"store_latitude" text,
	"store_longitude" text,
	"yelp_alias" text,
	"facebook_page_id" text,
	"late_grace_period_minutes" integer DEFAULT 10 NOT NULL,
	"cancellation_hours_cutoff" integer DEFAULT 24 NOT NULL,
	"pos_enabled" boolean DEFAULT true NOT NULL,
	"weekly_digest_opt_out" boolean DEFAULT false NOT NULL,
	CONSTRAINT "locations_booking_slug_unique" UNIQUE("booking_slug")
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"appointment_id" integer,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mail_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"mailgun_api_key" text,
	"mailgun_domain" text,
	"sender_email" text,
	"booking_confirmation_enabled" boolean DEFAULT false NOT NULL,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_hours_before" integer DEFAULT 24 NOT NULL,
	"review_request_enabled" boolean DEFAULT false NOT NULL,
	"google_review_url" text,
	"confirmation_template" text DEFAULT '<p>Hi {customerName},</p>
<p>Your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}.</p>
<p>See you then!</p>',
	"reminder_template" text DEFAULT '<p>Hi {customerName},</p>
<p>This is a reminder of your appointment at {storeName} on {appointmentDate} at {appointmentTime}.</p>
<p>Reply to this email to confirm or cancel.</p>',
	"review_template" text DEFAULT '<p>Hi {customerName},</p>
<p>Thank you for visiting {storeName}! We''d love your feedback.</p>
<p><a href="{reviewUrl}">Leave us a review</a></p>'
);
--> statement-breakpoint
CREATE TABLE "names" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"origin" varchar(32) NOT NULL,
	"gender" varchar(16) DEFAULT 'female' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"contact_email" text,
	"business_name" text,
	"template_id" text,
	"phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"county_state" text,
	"postcode" text,
	"country" text DEFAULT 'GB',
	"hours" jsonb,
	"booking_enabled" boolean DEFAULT false,
	"domain_type" text DEFAULT 'subdomain',
	"subdomain" text,
	"custom_domain" text,
	"domain_payment_status" text DEFAULT 'n/a',
	"hero_image" text,
	"plan" text DEFAULT 'free',
	"powered_by_certxa" boolean DEFAULT true,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pro_order_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"note" text NOT NULL,
	"author_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"stripe_invoice_id" text,
	"salon_id" integer,
	"user_id" text,
	"status" text,
	"payment_method_brand" text,
	"payment_method_last4" text,
	"payment_method_fingerprint" text,
	"card_exp_month" integer,
	"card_exp_year" integer,
	"amount_cents" bigint DEFAULT 0,
	"currency" text DEFAULT 'usd',
	"failure_code" text,
	"failure_message" text,
	"receipt_url" text,
	"refunded" boolean DEFAULT false,
	"refund_amount_cents" bigint DEFAULT 0,
	"dispute_status" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payment_transactions_stripe_charge_id_unique" UNIQUE("stripe_charge_id")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"store_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "permissions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pro_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"property_type" text DEFAULT 'residential',
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pro_estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"estimate_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"service_type" text,
	"description" text,
	"line_items" text,
	"subtotal" numeric(10, 2) DEFAULT '0',
	"tax" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) DEFAULT '0',
	"converted_to_order_id" integer,
	"valid_until" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pro_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"order_id" integer,
	"invoice_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"address" text,
	"line_items" text,
	"subtotal" numeric(10, 2) DEFAULT '0',
	"tax" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) DEFAULT '0',
	"paid_at" timestamp,
	"due_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pro_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"business_name" varchar(255),
	"industry" varchar(100),
	"team_size" varchar(50),
	"message" text,
	"source" varchar(100) DEFAULT 'pro-hub',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"price" numeric(10, 2) NOT NULL,
	"stock" integer DEFAULT 0,
	"low_stock_threshold" integer DEFAULT 5,
	"category" text,
	"store_id" integer
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_refund_id" text,
	"stripe_charge_id" text,
	"stripe_payment_intent_id" text,
	"stripe_invoice_id" text,
	"salon_id" integer,
	"user_id" text,
	"initiated_by_user_id" text,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'usd',
	"reason" text,
	"internal_reason_notes" text,
	"refund_type" text DEFAULT 'manual',
	"status" text DEFAULT 'pending' NOT NULL,
	"receipt_url" text,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "refunds_stripe_refund_id_unique" UNIQUE("stripe_refund_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"customer_id" integer,
	"appointment_id" integer,
	"staff_id" integer,
	"rating" integer NOT NULL,
	"comment" text,
	"customer_name" text,
	"service_name" text,
	"staff_name" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"store_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_plan_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"new_plan_code" text NOT NULL,
	"interval" text,
	"effective_at" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seo_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"state_code" varchar(10) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"phone" varchar(30),
	"zip" varchar(20),
	"product" varchar(20) DEFAULT 'booking' NOT NULL,
	"business_type" varchar(100),
	"business_types" text,
	"nearby_cities" text,
	"meta_title" text,
	"meta_desc" text,
	"h1_override" text,
	"page_generated" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "seo_regions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "service_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"addon_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"store_id" integer,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "pro_service_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"order_number" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"service_type" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"address" text NOT NULL,
	"city" text,
	"state" text,
	"zip" text,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"description" text,
	"crew_id" integer,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"estimated_hours" numeric(4, 1),
	"overtime_flagged" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"category" text NOT NULL,
	"category_id" integer,
	"image_url" text,
	"store_id" integer,
	"deposit_required" boolean DEFAULT false,
	"deposit_amount" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"client_phone" text NOT NULL,
	"client_name" text,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"twilio_sid" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"appointment_id" integer,
	"customer_id" integer,
	"phone" text NOT NULL,
	"message_type" text NOT NULL,
	"message_body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"twilio_sid" text,
	"error_message" text,
	"sent_at" timestamp NOT NULL,
	"sms_source" text,
	"cost_estimate" numeric(10, 4) DEFAULT '0.0100'
);
--> statement-breakpoint
CREATE TABLE "sms_opt_outs" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"opted_out_at" timestamp DEFAULT now(),
	"opted_back_in_at" timestamp,
	"is_opted_out" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sms_opt_outs_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "sms_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"twilio_account_sid" text,
	"twilio_auth_token" text,
	"twilio_phone_number" text,
	"booking_confirmation_enabled" boolean DEFAULT false NOT NULL,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_hours_before" integer DEFAULT 24 NOT NULL,
	"review_request_enabled" boolean DEFAULT false NOT NULL,
	"google_review_url" text,
	"confirmation_template" text DEFAULT 'Hi {customerName}, your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}. See you then!',
	"reminder_template" text DEFAULT 'Hi {customerName}, this is a reminder of your appointment at {storeName} tomorrow at {appointmentTime}. Reply STOP to opt out.',
	"review_template" text DEFAULT 'Hi {customerName}, thank you for visiting {storeName}! We''d love your feedback. Leave us a review: {reviewUrl}',
	"auto_engage_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text DEFAULT 'stylist',
	"bio" text,
	"color" text DEFAULT '#3b82f6',
	"avatar_url" text,
	"commission_enabled" boolean DEFAULT false,
	"commission_rate" numeric(5, 2) DEFAULT '0',
	"store_id" integer,
	"password" text,
	"permissions" jsonb,
	"status" text DEFAULT 'active',
	"employment_type" text DEFAULT 'stylist',
	"invite_token" text,
	"invite_expires_at" timestamp,
	"invited_at" timestamp,
	"joined_at" timestamp,
	"removed_at" timestamp,
	"invited_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "staff_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_intelligence" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"total_appointments" integer DEFAULT 0,
	"completed_appointments" integer DEFAULT 0,
	"no_show_count" integer DEFAULT 0,
	"cancellation_count" integer DEFAULT 0,
	"rebooked_count" integer DEFAULT 0,
	"rebooking_rate_pct" numeric(5, 2) DEFAULT '0.00',
	"avg_ticket_value" numeric(10, 2) DEFAULT '0.00',
	"total_revenue" numeric(10, 2) DEFAULT '0.00',
	"unique_clients_served" integer DEFAULT 0,
	"client_retention_rate" numeric(5, 2) DEFAULT '0.00',
	"trend" text DEFAULT 'stable',
	"computed_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "staff_pins" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"pin" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"service_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"preferences" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"preferences" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"store_number" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "stripe_customers_customer_id_unique" UNIQUE("customer_id"),
	CONSTRAINT "stripe_customers_store_number_unique" UNIQUE("store_number")
);
--> statement-breakpoint
CREATE TABLE "stripe_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"checkout_session_id" text NOT NULL,
	"payment_intent_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"amount_subtotal" bigint NOT NULL,
	"amount_total" bigint NOT NULL,
	"currency" text NOT NULL,
	"payment_status" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stripe_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"publishable_key" text,
	"secret_key" text,
	"test_magstripe_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"subscription_id" text,
	"price_id" text,
	"current_period_start" bigint,
	"current_period_end" bigint,
	"cancel_at_period_end" boolean DEFAULT false,
	"payment_method_brand" text,
	"payment_method_last4" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "stripe_subscriptions_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"api_version" text,
	"processed" boolean DEFAULT false,
	"processing_attempts" integer DEFAULT 0,
	"processing_error" text,
	"payload_json" jsonb,
	"received_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "subdomains" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "subdomains_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_plan_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"salon_id" integer,
	"user_id" text,
	"stripe_subscription_id" text,
	"old_plan_id" integer,
	"new_plan_id" integer,
	"old_price_cents" bigint,
	"new_price_cents" bigint,
	"change_type" text,
	"proration_used" boolean DEFAULT false,
	"prorated_amount_cents" bigint,
	"effective_date" timestamp,
	"initiated_by" text,
	"reason" text,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_number" integer NOT NULL,
	"plan_code" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"current_period_end" text,
	"current_period_start" text,
	"interval" text DEFAULT 'month',
	"price_id" text,
	"cancel_at_period_end" integer DEFAULT 0,
	"payment_method_brand" text,
	"payment_method_last4" text,
	"seat_quantity" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timeclock" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"clock_in" timestamp DEFAULT now() NOT NULL,
	"clock_out" timestamp,
	"work_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"password" varchar NOT NULL,
	"google_id" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'owner',
	"is_admin" boolean DEFAULT false NOT NULL,
	"staff_id" integer,
	"permissions" jsonb,
	"onboarding_completed" boolean DEFAULT false,
	"password_changed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"subscription_status" varchar(20) DEFAULT 'active',
	"trial_started_at" timestamp,
	"trial_ends_at" timestamp,
	"account_type" varchar(32),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"service_id" integer,
	"staff_id" integer,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"preferred_date" timestamp,
	"preferred_time_start" text,
	"preferred_time_end" text,
	"notes" text,
	"party_size" integer DEFAULT 1,
	"status" text DEFAULT 'waiting',
	"notified_at" timestamp,
	"called_at" timestamp,
	"completed_at" timestamp,
	"customer_latitude" text,
	"customer_longitude" text,
	"sms_sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "addons" ADD CONSTRAINT "addons_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_addons" ADD CONSTRAINT "appointment_addons_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_addons" ADD CONSTRAINT "appointment_addons_addon_id_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."addons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app" ADD CONSTRAINT "app_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_activity_logs" ADD CONSTRAINT "billing_activity_logs_salon_id_locations_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_activity_logs" ADD CONSTRAINT "billing_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_settings" ADD CONSTRAINT "calendar_settings_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_audit_logs" ADD CONSTRAINT "client_audit_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_audit_logs" ADD CONSTRAINT "client_audit_logs_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_audit_logs" ADD CONSTRAINT "client_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_custom_field_values" ADD CONSTRAINT "client_custom_field_values_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_custom_field_values" ADD CONSTRAINT "client_custom_field_values_custom_field_id_client_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."client_custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_custom_fields" ADD CONSTRAINT "client_custom_fields_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_emails" ADD CONSTRAINT "client_emails_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_export_jobs" ADD CONSTRAINT "client_export_jobs_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_export_jobs" ADD CONSTRAINT "client_export_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_import_jobs" ADD CONSTRAINT "client_import_jobs_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_import_jobs" ADD CONSTRAINT "client_import_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_intelligence" ADD CONSTRAINT "client_intelligence_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_intelligence" ADD CONSTRAINT "client_intelligence_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_intelligence" ADD CONSTRAINT "client_intelligence_preferred_staff_id_staff_id_fk" FOREIGN KEY ("preferred_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_marketing_preferences" ADD CONSTRAINT "client_marketing_preferences_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_phones" ADD CONSTRAINT "client_phones_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tag_relationships" ADD CONSTRAINT "client_tag_relationships_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tag_relationships" ADD CONSTRAINT "client_tag_relationships_tag_id_client_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."client_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_preferred_staff_id_staff_id_fk" FOREIGN KEY ("preferred_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_crew_locations" ADD CONSTRAINT "pro_crew_locations_crew_id_pro_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."pro_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_crews" ADD CONSTRAINT "pro_crews_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_billing_profiles" ADD CONSTRAINT "customer_billing_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_billing_profiles" ADD CONSTRAINT "customer_billing_profiles_salon_id_locations_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_billing_profiles" ADD CONSTRAINT "customer_billing_profiles_current_plan_id_billing_plans_id_fk" FOREIGN KEY ("current_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_seat_patterns" ADD CONSTRAINT "dead_seat_patterns_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawer_actions" ADD CONSTRAINT "drawer_actions_session_id_cash_drawer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_drawer_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_gift_card_id_gift_cards_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_purchased_by_customer_id_customers_id_fk" FOREIGN KEY ("purchased_by_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_recipient_customer_id_customers_id_fk" FOREIGN KEY ("recipient_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_accounts" ADD CONSTRAINT "google_business_accounts_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_accounts" ADD CONSTRAINT "google_business_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_locations" ADD CONSTRAINT "google_business_locations_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_locations" ADD CONSTRAINT "google_business_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_locations" ADD CONSTRAINT "google_business_locations_business_account_id_google_business_accounts_id_fk" FOREIGN KEY ("business_account_id") REFERENCES "public"."google_business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_profiles" ADD CONSTRAINT "google_business_profiles_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_sync_logs" ADD CONSTRAINT "google_business_sync_logs_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_sync_logs" ADD CONSTRAINT "google_business_sync_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_business_sync_logs" ADD CONSTRAINT "google_business_sync_logs_location_id_google_business_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."google_business_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_review_responses" ADD CONSTRAINT "google_review_responses_google_review_id_google_reviews_id_fk" FOREIGN KEY ("google_review_id") REFERENCES "public"."google_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_review_responses" ADD CONSTRAINT "google_review_responses_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_review_responses" ADD CONSTRAINT "google_review_responses_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_review_responses" ADD CONSTRAINT "google_review_responses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_gb_location_id_google_business_locations_id_fk" FOREIGN KEY ("gb_location_id") REFERENCES "public"."google_business_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_score_snapshots" ADD CONSTRAINT "growth_score_snapshots_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form_fields" ADD CONSTRAINT "intake_form_fields_form_id_intake_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."intake_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form_responses" ADD CONSTRAINT "intake_form_responses_form_id_intake_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."intake_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form_responses" ADD CONSTRAINT "intake_form_responses_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form_responses" ADD CONSTRAINT "intake_form_responses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form_responses" ADD CONSTRAINT "intake_form_responses_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_interventions" ADD CONSTRAINT "intelligence_interventions_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_interventions" ADD CONSTRAINT "intelligence_interventions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_salon_id_locations_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_settings" ADD CONSTRAINT "mail_settings_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_order_notes" ADD CONSTRAINT "pro_order_notes_order_id_pro_service_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pro_service_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_order_notes" ADD CONSTRAINT "pro_order_notes_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_salon_id_locations_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_customers" ADD CONSTRAINT "pro_customers_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_estimates" ADD CONSTRAINT "pro_estimates_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_estimates" ADD CONSTRAINT "pro_estimates_customer_id_pro_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."pro_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_invoices" ADD CONSTRAINT "pro_invoices_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_invoices" ADD CONSTRAINT "pro_invoices_order_id_pro_service_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pro_service_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_salon_id_locations_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_plan_changes" ADD CONSTRAINT "scheduled_plan_changes_new_plan_code_billing_plans_code_fk" FOREIGN KEY ("new_plan_code") REFERENCES "public"."billing_plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_addons" ADD CONSTRAINT "service_addons_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_addons" ADD CONSTRAINT "service_addons_addon_id_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."addons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_service_orders" ADD CONSTRAINT "pro_service_orders_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_service_orders" ADD CONSTRAINT "pro_service_orders_crew_id_pro_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."pro_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_settings" ADD CONSTRAINT "sms_settings_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_intelligence" ADD CONSTRAINT "staff_intelligence_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_intelligence" ADD CONSTRAINT "staff_intelligence_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pins" ADD CONSTRAINT "staff_pins_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pins" ADD CONSTRAINT "staff_pins_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_settings" ADD CONSTRAINT "staff_settings_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_settings" ADD CONSTRAINT "staff_settings_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_store_number_locations_id_fk" FOREIGN KEY ("store_number") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_settings" ADD CONSTRAINT "stripe_settings_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subdomains" ADD CONSTRAINT "subdomains_submission_id_onboarding_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_changes" ADD CONSTRAINT "subscription_plan_changes_salon_id_locations_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_changes" ADD CONSTRAINT "subscription_plan_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_changes" ADD CONSTRAINT "subscription_plan_changes_old_plan_id_billing_plans_id_fk" FOREIGN KEY ("old_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_changes" ADD CONSTRAINT "subscription_plan_changes_new_plan_id_billing_plans_id_fk" FOREIGN KEY ("new_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_number_locations_id_fk" FOREIGN KEY ("store_number") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_code_billing_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."billing_plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeclock" ADD CONSTRAINT "timeclock_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeclock" ADD CONSTRAINT "timeclock_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_store_id" ON "api_keys" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_api_keys_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "app_store_id_idx" ON "app" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "app_store_app_unique_idx" ON "app" USING btree ("store_id","app_name");--> statement-breakpoint
CREATE INDEX "idx_billing_activity_salon_id" ON "billing_activity_logs" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "idx_billing_activity_user_id" ON "billing_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_billing_activity_event_type" ON "billing_activity_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_billing_activity_created_at" ON "billing_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_campaigns_store_id" ON "campaigns" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_campaigns_status" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_addresses_client_id_idx" ON "client_addresses" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_audit_client_idx" ON "client_audit_logs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_audit_store_idx" ON "client_audit_logs" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "client_audit_action_idx" ON "client_audit_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "client_audit_created_idx" ON "client_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "client_cfv_client_idx" ON "client_custom_field_values" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_cfv_uidx" ON "client_custom_field_values" USING btree ("client_id","custom_field_id");--> statement-breakpoint
CREATE INDEX "client_custom_fields_store_idx" ON "client_custom_fields" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "client_emails_client_id_idx" ON "client_emails" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_emails_address_idx" ON "client_emails" USING btree ("email_address");--> statement-breakpoint
CREATE INDEX "client_export_jobs_store_idx" ON "client_export_jobs" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "client_export_jobs_status_idx" ON "client_export_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_import_jobs_store_idx" ON "client_import_jobs" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "client_import_jobs_status_idx" ON "client_import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ci_store_id_idx" ON "client_intelligence" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "ci_customer_id_idx" ON "client_intelligence" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_store_customer_uidx" ON "client_intelligence" USING btree ("store_id","customer_id");--> statement-breakpoint
CREATE INDEX "ci_churn_risk_idx" ON "client_intelligence" USING btree ("churn_risk_score");--> statement-breakpoint
CREATE INDEX "ci_is_drifting_idx" ON "client_intelligence" USING btree ("is_drifting");--> statement-breakpoint
CREATE INDEX "ci_is_at_risk_idx" ON "client_intelligence" USING btree ("is_at_risk");--> statement-breakpoint
CREATE INDEX "client_mkt_prefs_client_idx" ON "client_marketing_preferences" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_notes_client_id_idx" ON "client_notes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_notes_store_id_idx" ON "client_notes" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "client_notes_pinned_idx" ON "client_notes" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "client_phones_client_id_idx" ON "client_phones" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_phones_e164_idx" ON "client_phones" USING btree ("phone_number_e164");--> statement-breakpoint
CREATE INDEX "client_tag_rel_client_idx" ON "client_tag_relationships" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_tag_rel_tag_idx" ON "client_tag_relationships" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_tag_rel_uidx" ON "client_tag_relationships" USING btree ("client_id","tag_id");--> statement-breakpoint
CREATE INDEX "client_tags_store_id_idx" ON "client_tags" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_tags_store_name_uidx" ON "client_tags" USING btree ("store_id","tag_name");--> statement-breakpoint
CREATE INDEX "clients_store_id_idx" ON "clients" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "clients_full_name_idx" ON "clients" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("client_status");--> statement-breakpoint
CREATE INDEX "clients_last_visit_idx" ON "clients" USING btree ("last_visit_at");--> statement-breakpoint
CREATE INDEX "idx_cbp_user_id" ON "customer_billing_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cbp_salon_id" ON "customer_billing_profiles" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "idx_cbp_stripe_customer_id" ON "customer_billing_profiles" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "dsp_store_id_idx" ON "dead_seat_patterns" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dsp_store_slot_uidx" ON "dead_seat_patterns" USING btree ("store_id","day_of_week","hour_start");--> statement-breakpoint
CREATE INDEX "gba_store_id_idx" ON "google_business_accounts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "gba_user_id_idx" ON "google_business_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gba_google_account_id_idx" ON "google_business_accounts" USING btree ("google_account_id");--> statement-breakpoint
CREATE INDEX "gbl_store_id_idx" ON "google_business_locations" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "gbl_user_id_idx" ON "google_business_locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gbl_business_account_id_idx" ON "google_business_locations" USING btree ("business_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gbl_location_resource_name_uidx" ON "google_business_locations" USING btree ("location_resource_name");--> statement-breakpoint
CREATE INDEX "google_business_profiles_store_id_idx" ON "google_business_profiles" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_business_profiles_store_id_uidx" ON "google_business_profiles" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "gbsl_store_id_idx" ON "google_business_sync_logs" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "gbsl_location_id_idx" ON "google_business_sync_logs" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "gbsl_synced_at_idx" ON "google_business_sync_logs" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "google_review_responses_google_review_id_idx" ON "google_review_responses" USING btree ("google_review_id");--> statement-breakpoint
CREATE INDEX "google_review_responses_store_id_idx" ON "google_review_responses" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "google_review_responses_response_status_idx" ON "google_review_responses" USING btree ("response_status");--> statement-breakpoint
CREATE INDEX "google_reviews_store_id_idx" ON "google_reviews" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "google_reviews_google_review_id_idx" ON "google_reviews" USING btree ("google_review_id");--> statement-breakpoint
CREATE INDEX "google_reviews_rating_idx" ON "google_reviews" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "google_reviews_response_status_idx" ON "google_reviews" USING btree ("response_status");--> statement-breakpoint
CREATE INDEX "gss_store_id_idx" ON "growth_score_snapshots" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "gss_snapshot_date_idx" ON "growth_score_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "ii_store_id_idx" ON "intelligence_interventions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "ii_customer_id_idx" ON "intelligence_interventions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ii_type_idx" ON "intelligence_interventions" USING btree ("intervention_type");--> statement-breakpoint
CREATE INDEX "ii_sent_at_idx" ON "intelligence_interventions" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_records_stripe_invoice_id" ON "invoice_records" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_records_salon_id" ON "invoice_records" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_records_stripe_customer_id" ON "invoice_records" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "idx_names_origin" ON "names" USING btree ("origin");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_names_name_origin_unique" ON "names" USING btree ("name","origin");--> statement-breakpoint
CREATE INDEX "idx_payment_txn_salon_id" ON "payment_transactions" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "idx_payment_txn_stripe_charge_id" ON "payment_transactions" USING btree ("stripe_charge_id");--> statement-breakpoint
CREATE INDEX "idx_payment_txn_stripe_pi_id" ON "payment_transactions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "permissions_store_id_idx" ON "permissions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_refunds_salon_id" ON "refunds" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "idx_refunds_stripe_refund_id" ON "refunds" USING btree ("stripe_refund_id");--> statement-breakpoint
CREATE INDEX "idx_refunds_stripe_charge_id" ON "refunds" USING btree ("stripe_charge_id");--> statement-breakpoint
CREATE INDEX "roles_store_id_idx" ON "roles" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "roles_name_store_idx" ON "roles" USING btree ("name","store_id");--> statement-breakpoint
CREATE INDEX "idx_scheduled_plan_changes_sub_id" ON "scheduled_plan_changes" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "sms_conv_store_phone_idx" ON "sms_conversations" USING btree ("store_id","client_phone");--> statement-breakpoint
CREATE INDEX "sms_conv_store_created_idx" ON "sms_conversations" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "si_store_id_idx" ON "staff_intelligence" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "si_staff_id_idx" ON "staff_intelligence" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "si_store_staff_uidx" ON "staff_intelligence" USING btree ("store_id","staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sp_store_pin_uidx" ON "staff_pins" USING btree ("store_id","pin");--> statement-breakpoint
CREATE UNIQUE INDEX "sp_staff_store_uidx" ON "staff_pins" USING btree ("staff_id","store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_settings_staff_id_uidx" ON "staff_settings" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_settings_store_id_idx" ON "staff_settings" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_settings_store_id_uidx" ON "store_settings" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_customers_user_id" ON "stripe_customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_customers_customer_id" ON "stripe_customers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_customers_store_number" ON "stripe_customers" USING btree ("store_number");--> statement-breakpoint
CREATE INDEX "idx_stripe_orders_customer_id" ON "stripe_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_orders_checkout_session" ON "stripe_orders" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_settings_store_id_uidx" ON "stripe_settings" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_subs_customer_id" ON "stripe_subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_subs_subscription_id" ON "stripe_subscriptions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_event_id" ON "stripe_webhook_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_type" ON "stripe_webhook_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_processed" ON "stripe_webhook_events" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "idx_sub_plan_changes_salon_id" ON "subscription_plan_changes" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "idx_sub_plan_changes_stripe_sub_id" ON "subscription_plan_changes" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_store_number" ON "subscriptions" USING btree ("store_number");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_stripe_sub_id" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "tc_staff_date_idx" ON "timeclock" USING btree ("staff_id","work_date");--> statement-breakpoint
CREATE INDEX "tc_store_date_idx" ON "timeclock" USING btree ("store_id","work_date");
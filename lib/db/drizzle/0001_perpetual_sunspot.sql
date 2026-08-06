CREATE TABLE "wb_page_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"path" text DEFAULT '/',
	"referrer" text,
	"ip_hash" text,
	"ua_snippet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_agent_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer,
	"account_id" integer,
	"action" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"role" varchar(32) DEFAULT 'agent' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"password_hash" text,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_call_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"call_sid" text,
	"caller_phone" text,
	"caller_name" text,
	"outcome" text DEFAULT 'in_progress' NOT NULL,
	"appointment_id" integer,
	"duration_seconds" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"notes" text,
	"transcript" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_silence_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_log_id" integer,
	"store_id" integer NOT NULL,
	"call_sid" text,
	"layer" text NOT NULL,
	"silence_duration_ms" integer NOT NULL,
	"recovery_action" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autumn_demo_callers" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"ip" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_usage_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_log_id" integer,
	"store_id" integer NOT NULL,
	"call_sid" text,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"audio_tokens_in" integer DEFAULT 0 NOT NULL,
	"audio_tokens_out" integer DEFAULT 0 NOT NULL,
	"text_tokens_in" integer DEFAULT 0 NOT NULL,
	"text_tokens_out" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"raw_usage" jsonb,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"ai_response_count" integer DEFAULT 0 NOT NULL,
	"twilio_minutes" numeric(10, 4) DEFAULT '0' NOT NULL,
	"twilio_est_cost" numeric(10, 6) DEFAULT '0' NOT NULL,
	"openai_est_cost" numeric(10, 6) DEFAULT '0' NOT NULL,
	"total_est_cost" numeric(10, 6) DEFAULT '0' NOT NULL,
	"termination_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_structures" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"employee_percent" numeric(5, 2) NOT NULL,
	"house_percent" numeric(5, 2) NOT NULL,
	"applies_to" text DEFAULT 'both',
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer NOT NULL,
	"account_type" text DEFAULT 'checking',
	"bank_name" text,
	"routing_last4" text,
	"account_last4" text,
	"verification_status" text DEFAULT 'pending',
	"is_default" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_onboarding_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_onboarding_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"staff_id" integer,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"profile_image" text,
	"role" text DEFAULT 'stylist',
	"commission_rate" numeric(5, 2) DEFAULT '0',
	"commission_structure_id" integer,
	"product_commission_rate" numeric(5, 2) DEFAULT '0',
	"payout_method" text DEFAULT 'ach',
	"tax_classification" text DEFAULT 'individual',
	"tax_id_last4" text,
	"stripe_account_id" text,
	"onboarding_status" text DEFAULT 'pending',
	"bank_verified" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"feature_id" text NOT NULL,
	"period_start" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kiosk_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"client_id" integer,
	"phone" text,
	"client_name" text,
	"services" jsonb DEFAULT '[]'::jsonb,
	"token" text NOT NULL,
	"appointment_id" integer,
	"status" text DEFAULT 'waiting',
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	"staff_id" integer,
	"assigned_staff_name" text,
	CONSTRAINT "kiosk_checkins_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "kiosk_turn" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"turn_position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "payout_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"contractor_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"category" text DEFAULT 'Manual Adjustment' NOT NULL,
	"description" text NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "payout_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"user_id" text,
	"user_email" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"payout_run_item_id" integer,
	"contractor_id" integer NOT NULL,
	"check_number" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payee_name" text NOT NULL,
	"memo" text,
	"period_start" text,
	"period_end" text,
	"print_status" text DEFAULT 'queued',
	"void_status" text DEFAULT 'active',
	"cleared_status" text DEFAULT 'outstanding',
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"printed_at" timestamp,
	"voided_at" timestamp,
	"cleared_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_deduction_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"contractor_id" integer,
	"name" text NOT NULL,
	"type" text DEFAULT 'fixed',
	"amount" numeric(10, 2) DEFAULT '0',
	"applies_to" text DEFAULT 'all',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_run_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"payout_run_id" integer NOT NULL,
	"contractor_id" integer NOT NULL,
	"contractor_name" text DEFAULT '' NOT NULL,
	"appointment_count" integer DEFAULT 0 NOT NULL,
	"service_revenue" numeric(10, 2) DEFAULT '0' NOT NULL,
	"product_revenue" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tips" numeric(10, 2) DEFAULT '0' NOT NULL,
	"gross_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"deductions" jsonb,
	"total_deductions" numeric(10, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"payout_method" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"check_number" integer,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_gross" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_net" numeric(12, 2) DEFAULT '0' NOT NULL,
	"contractor_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"auto_generated" boolean DEFAULT false NOT NULL,
	"auto_approve_after" timestamp,
	"created_by_user_id" text,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_w9_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer NOT NULL,
	"legal_name" text NOT NULL,
	"business_name" text,
	"tax_classification" text NOT NULL,
	"tax_id_last4" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"year" integer NOT NULL,
	"certified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_run_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_run_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"staff_name" text DEFAULT '' NOT NULL,
	"commission_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"appointment_count" integer DEFAULT 0 NOT NULL,
	"service_revenue" numeric(10, 2) DEFAULT '0' NOT NULL,
	"addon_revenue" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_revenue" numeric(10, 2) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_commission" numeric(10, 2) DEFAULT '0' NOT NULL,
	"contractor_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finalized_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"feature_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"limit_value" integer,
	"overage_rate_cents" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salon_usage_limits" (
	"store_id" integer PRIMARY KEY NOT NULL,
	"max_call_duration_min" integer DEFAULT 12 NOT NULL,
	"max_daily_minutes" integer DEFAULT 480 NOT NULL,
	"max_monthly_cost_usd" numeric(10, 2) DEFAULT '200' NOT NULL,
	"max_concurrent_calls" integer DEFAULT 3 NOT NULL,
	"idle_timeout_seconds" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_illustration_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"industry" text DEFAULT 'NAIL_SALON' NOT NULL,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "service_illustration_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "service_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sms_contact_routing" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"client_phone" text NOT NULL,
	"last_outbound_at" timestamp,
	"last_inbound_at" timestamp,
	"last_interaction_at" timestamp NOT NULL,
	"archived_at" timestamp,
	"blocked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "staff_password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "store_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"invoice_number" text,
	"status" text,
	"paid" boolean DEFAULT false NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"hosted_invoice_url" text,
	"invoice_pdf_url" text,
	"billing_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "store_payment_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"provider" varchar(32) DEFAULT 'stripe' NOT NULL,
	"provider_account_id" text NOT NULL,
	"status" varchar(32) DEFAULT 'connected' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"email" text,
	"country" text,
	"currency" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "store_payment_accounts_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE "store_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"canceled_at" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_monthly_cents" integer DEFAULT 0 NOT NULL,
	"price_yearly_cents" integer DEFAULT 0 NOT NULL,
	"stripe_price_id_monthly" text,
	"stripe_price_id_yearly" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_account_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"business_name" text,
	"support_phone" text,
	"owner_user_id" text,
	"used_at" timestamp,
	"last_call_sid" text,
	"last_caller_phone" text,
	"last_caller_name" text,
	"last_issue_summary" text,
	"last_transcript" text,
	"last_ticket_id" integer,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_call_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_sid" text,
	"caller_phone" text,
	"caller_name" text,
	"business_name" text,
	"account_store_id" integer,
	"subscription_plan" text,
	"outcome" text DEFAULT 'in_progress' NOT NULL,
	"ticket_id" integer,
	"duration_seconds" integer,
	"summary" text,
	"escalated" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"transcript" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "support_incident_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"title" text NOT NULL,
	"assigned_to_id" integer,
	"assigned_to_name" text,
	"status" text DEFAULT 'open',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_incident_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"content" text NOT NULL,
	"status" text,
	"author_id" integer,
	"author_name" text,
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'SEV-3' NOT NULL,
	"status" text DEFAULT 'investigating' NOT NULL,
	"affected_accounts" integer DEFAULT 0,
	"owner_id" integer,
	"owner_name" text,
	"services" text[] DEFAULT '{}',
	"root_cause" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_type" varchar(16) DEFAULT 'user' NOT NULL,
	"author_name" varchar(128),
	"agent_id" integer,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"direction" text,
	"raw_headers" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"business_name" text,
	"phone" text,
	"email" text,
	"issue" text,
	"call_sid" text,
	"call_log_id" integer,
	"resolved_at" timestamp,
	"resolved_by" text,
	"internal_notes" text,
	"account_id" integer,
	"ticket_number" varchar(32),
	"subject" text,
	"description" text,
	"assigned_agent_id" integer,
	"assigned_agent_name" varchar(128),
	"created_by_agent_id" integer,
	"customer_email" text,
	"customer_name" text,
	"ip_address" text,
	"imap_message_id" text,
	"imap_thread_id" text,
	"account_name" text,
	"category" text,
	"subcategory" text,
	"channel" text,
	"first_response_at" timestamp,
	"last_response_at" timestamp,
	"closed_at" timestamp,
	"tags" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_assignment_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"booked_by_user_id" integer,
	"appointment_id" integer,
	"assigned_staff_id" integer NOT NULL,
	"turn_recommended_staff_id" integer,
	"is_override" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'turn_system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_email_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"billing_receipts" boolean DEFAULT true NOT NULL,
	"low_balance_alerts" boolean DEFAULT true NOT NULL,
	"data_operations" boolean DEFAULT true NOT NULL,
	"trial_reminders" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_email_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"stripe_payment_intent" text,
	"amount" integer NOT NULL,
	"transaction_type" text DEFAULT 'deposit' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_chat_agent_departments" (
	"agent_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_chat_canned" (
	"id" serial PRIMARY KEY NOT NULL,
	"shortcut" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_chat_canned_shortcut_key" UNIQUE("shortcut")
);
--> statement-breakpoint
CREATE TABLE "live_chat_departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"routing_keywords" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"sender_id" integer,
	"sender_name" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_name" text,
	"visitor_email" text,
	"visitor_token" text,
	"department_id" integer,
	"agent_id" integer,
	"account_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"subject" text,
	"page_url" text,
	"routed_by" text DEFAULT 'manual',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"rating" integer,
	"rating_comment" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"ticket_id" integer,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_assets" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"r2_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_account_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"tag" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"created_by_agent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"agent_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_billing_profiles" DROP CONSTRAINT "customer_billing_profiles_user_id_unique";--> statement-breakpoint
ALTER TABLE "customer_billing_profiles" DROP CONSTRAINT "customer_billing_profiles_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "invoice_records" DROP CONSTRAINT "invoice_records_stripe_invoice_id_unique";--> statement-breakpoint
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_stripe_charge_id_unique";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_stripe_refund_id_unique";--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_activity_logs" DROP CONSTRAINT "billing_activity_logs_salon_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_activity_logs" DROP CONSTRAINT "billing_activity_logs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_billing_profiles" DROP CONSTRAINT "customer_billing_profiles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_billing_profiles" DROP CONSTRAINT "customer_billing_profiles_salon_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_billing_profiles" DROP CONSTRAINT "customer_billing_profiles_current_plan_id_billing_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "gift_cards" DROP CONSTRAINT "gift_cards_purchased_by_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "gift_cards" DROP CONSTRAINT "gift_cards_recipient_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "google_reviews" DROP CONSTRAINT "google_reviews_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "intake_form_responses" DROP CONSTRAINT "intake_form_responses_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_records" DROP CONSTRAINT "invoice_records_salon_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP CONSTRAINT "loyalty_transactions_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_salon_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_salon_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_initiated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "scheduled_plan_changes" DROP CONSTRAINT "scheduled_plan_changes_new_plan_code_billing_plans_code_fk";
--> statement-breakpoint
ALTER TABLE "sms_log" DROP CONSTRAINT "sms_log_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_customers" DROP CONSTRAINT "stripe_customers_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_customers" DROP CONSTRAINT "stripe_customers_store_number_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_settings" DROP CONSTRAINT "stripe_settings_store_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_plan_changes" DROP CONSTRAINT "subscription_plan_changes_salon_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_plan_changes" DROP CONSTRAINT "subscription_plan_changes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_plan_changes" DROP CONSTRAINT "subscription_plan_changes_old_plan_id_billing_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_plan_changes" DROP CONSTRAINT "subscription_plan_changes_new_plan_id_billing_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "waitlist" DROP CONSTRAINT "waitlist_customer_id_customers_id_fk";
--> statement-breakpoint
DROP INDEX "idx_billing_activity_salon_id";--> statement-breakpoint
DROP INDEX "idx_billing_activity_user_id";--> statement-breakpoint
DROP INDEX "idx_billing_activity_event_type";--> statement-breakpoint
DROP INDEX "idx_billing_activity_created_at";--> statement-breakpoint
DROP INDEX "idx_cbp_user_id";--> statement-breakpoint
DROP INDEX "idx_cbp_salon_id";--> statement-breakpoint
DROP INDEX "idx_cbp_stripe_customer_id";--> statement-breakpoint
DROP INDEX "idx_invoice_records_stripe_invoice_id";--> statement-breakpoint
DROP INDEX "idx_invoice_records_salon_id";--> statement-breakpoint
DROP INDEX "idx_invoice_records_stripe_customer_id";--> statement-breakpoint
DROP INDEX "idx_payment_txn_salon_id";--> statement-breakpoint
DROP INDEX "idx_payment_txn_stripe_charge_id";--> statement-breakpoint
DROP INDEX "idx_payment_txn_stripe_pi_id";--> statement-breakpoint
DROP INDEX "idx_refunds_salon_id";--> statement-breakpoint
DROP INDEX "idx_refunds_stripe_refund_id";--> statement-breakpoint
DROP INDEX "idx_refunds_stripe_charge_id";--> statement-breakpoint
DROP INDEX "idx_scheduled_plan_changes_sub_id";--> statement-breakpoint
DROP INDEX "idx_stripe_customers_user_id";--> statement-breakpoint
DROP INDEX "idx_stripe_customers_customer_id";--> statement-breakpoint
DROP INDEX "idx_stripe_customers_store_number";--> statement-breakpoint
DROP INDEX "idx_stripe_orders_customer_id";--> statement-breakpoint
DROP INDEX "idx_stripe_orders_checkout_session";--> statement-breakpoint
DROP INDEX "stripe_settings_store_id_uidx";--> statement-breakpoint
DROP INDEX "idx_stripe_subs_customer_id";--> statement-breakpoint
DROP INDEX "idx_stripe_subs_subscription_id";--> statement-breakpoint
DROP INDEX "idx_stripe_webhook_events_event_id";--> statement-breakpoint
DROP INDEX "idx_stripe_webhook_events_type";--> statement-breakpoint
DROP INDEX "idx_stripe_webhook_events_processed";--> statement-breakpoint
DROP INDEX "idx_sub_plan_changes_salon_id";--> statement-breakpoint
DROP INDEX "idx_sub_plan_changes_stripe_sub_id";--> statement-breakpoint
DROP INDEX "idx_subscriptions_stripe_sub_id";--> statement-breakpoint
ALTER TABLE "billing_plans" ALTER COLUMN "price_cents" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "billing_plans" ALTER COLUMN "contacts_min" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "billing_plans" ALTER COLUMN "contacts_max" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "billing_plans" ALTER COLUMN "interval" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_plans" ALTER COLUMN "sms_credits" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "billing_plans" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_plans" ALTER COLUMN "active" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wb_websites" ADD COLUMN "ssl_status" text;--> statement-breakpoint
ALTER TABLE "wb_websites" ADD COLUMN "ssl_provisioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wb_websites" ADD COLUMN "ssl_error" text;--> statement-breakpoint
ALTER TABLE "addons" ADD COLUMN "type" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "addons" ADD COLUMN "parent_addon_id" integer;--> statement-breakpoint
ALTER TABLE "addons" ADD COLUMN "is_stackable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "addons" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "checked_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "client_requested_staff" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "calendar_hidden" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "calendar_settings" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_phones" ADD COLUMN "store_id" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "loyalty_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "parking_options" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "accessibility_features" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "beverage_options" jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "platform_credits" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "sales_tax_rate" numeric(5, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "tax_services_taxable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "tax_addons_taxable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "tax_products_taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "tax_gift_cards_taxable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "register_target_float" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "auto_refill_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "auto_refill_threshold" numeric(10, 2) DEFAULT '5.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "auto_refill_amount" numeric(10, 2) DEFAULT '25.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "purchase_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "upc" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "illustration_category_id" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "custom_illustration_url" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "auto_assigned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_settings" ADD COLUMN "sms_cancellation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "avatar_thumb_url" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "commission_structure_id" integer;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "show_on_calendar" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mailing_address1" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mailing_address2" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mailing_city" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mailing_state" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mailing_zip" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mailing_country" text DEFAULT 'US';--> statement-breakpoint
ALTER TABLE "wb_page_views" ADD CONSTRAINT "wb_page_views_website_id_wb_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."wb_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_agent_activity" ADD CONSTRAINT "support_agent_activity_agent_id_support_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."support_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_silence_incidents" ADD CONSTRAINT "ai_silence_incidents_call_log_id_ai_call_log_id_fk" FOREIGN KEY ("call_log_id") REFERENCES "public"."ai_call_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_silence_incidents" ADD CONSTRAINT "ai_silence_incidents_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_usage_records" ADD CONSTRAINT "call_usage_records_call_log_id_ai_call_log_id_fk" FOREIGN KEY ("call_log_id") REFERENCES "public"."ai_call_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_usage_records" ADD CONSTRAINT "call_usage_records_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_structures" ADD CONSTRAINT "commission_structures_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_bank_accounts" ADD CONSTRAINT "contractor_bank_accounts_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_onboarding_tokens" ADD CONSTRAINT "contractor_onboarding_tokens_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_onboarding_tokens" ADD CONSTRAINT "contractor_onboarding_tokens_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_commission_structure_id_commission_structures_id_fk" FOREIGN KEY ("commission_structure_id") REFERENCES "public"."commission_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage" ADD CONSTRAINT "feature_usage_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage" ADD CONSTRAINT "feature_usage_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_adjustments" ADD CONSTRAINT "payout_adjustments_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_adjustments" ADD CONSTRAINT "payout_adjustments_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_audit_logs" ADD CONSTRAINT "payout_audit_logs_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_checks" ADD CONSTRAINT "payout_checks_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_checks" ADD CONSTRAINT "payout_checks_payout_run_item_id_payout_run_items_id_fk" FOREIGN KEY ("payout_run_item_id") REFERENCES "public"."payout_run_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_checks" ADD CONSTRAINT "payout_checks_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_deduction_rules" ADD CONSTRAINT "payout_deduction_rules_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_deduction_rules" ADD CONSTRAINT "payout_deduction_rules_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_run_items" ADD CONSTRAINT "payout_run_items_payout_run_id_payout_runs_id_fk" FOREIGN KEY ("payout_run_id") REFERENCES "public"."payout_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_run_items" ADD CONSTRAINT "payout_run_items_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_runs" ADD CONSTRAINT "payout_runs_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_w9_records" ADD CONSTRAINT "payout_w9_records_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_items" ADD CONSTRAINT "payroll_run_items_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_items" ADD CONSTRAINT "payroll_run_items_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credit_transactions" ADD CONSTRAINT "platform_credit_transactions_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salon_usage_limits" ADD CONSTRAINT "salon_usage_limits_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_options" ADD CONSTRAINT "service_options_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_contact_routing" ADD CONSTRAINT "sms_contact_routing_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_password_reset_tokens" ADD CONSTRAINT "staff_password_reset_tokens_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_invoices" ADD CONSTRAINT "store_invoices_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_account_codes" ADD CONSTRAINT "support_account_codes_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cs_store_id" ON "commission_structures" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_cba_contractor_id" ON "contractor_bank_accounts" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_cot_token" ON "contractor_onboarding_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_cot_contractor_id" ON "contractor_onboarding_tokens" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_contractors_store_id" ON "contractors" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_contractors_staff_id" ON "contractors" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_usage_store_feature_period_uidx" ON "feature_usage" USING btree ("store_id","feature_id","period_start");--> statement-breakpoint
CREATE INDEX "idx_feature_usage_store_id" ON "feature_usage" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_feature_usage_feature_id" ON "feature_usage" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_features_category" ON "features" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_features_is_active" ON "features" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "kiosk_turn_store_id_staff_id_key" ON "kiosk_turn" USING btree ("store_id","staff_id");--> statement-breakpoint
CREATE INDEX "idx_pay_adj_store_id" ON "payout_adjustments" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_pay_adj_contractor_id" ON "payout_adjustments" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_pal_store_id" ON "payout_audit_logs" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_pal_created_at" ON "payout_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pc_store_id" ON "payout_checks" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_pc_contractor_id" ON "payout_checks" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_pdr_store_id" ON "payout_deduction_rules" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_pri_run_id" ON "payout_run_items" USING btree ("payout_run_id");--> statement-breakpoint
CREATE INDEX "idx_pri_contractor_id" ON "payout_run_items" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_pr_store_status" ON "payout_runs" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "idx_pr_store_created" ON "payout_runs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_w9_contractor_id" ON "payout_w9_records" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "pri_run_idx" ON "payroll_run_items" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "pr_store_created_idx" ON "payroll_runs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "pr_store_status_idx" ON "payroll_runs" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_features_plan_feature_uidx" ON "plan_features" USING btree ("plan_id","feature_id");--> statement-breakpoint
CREATE INDEX "idx_plan_features_plan_id" ON "plan_features" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_plan_features_feature_id" ON "plan_features" USING btree ("feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_routing_store_phone_uq" ON "sms_contact_routing" USING btree ("store_id","client_phone");--> statement-breakpoint
CREATE INDEX "sms_routing_phone_idx" ON "sms_contact_routing" USING btree ("client_phone");--> statement-breakpoint
CREATE INDEX "sms_routing_interaction_idx" ON "sms_contact_routing" USING btree ("client_phone","last_interaction_at");--> statement-breakpoint
CREATE INDEX "idx_store_invoices_store_id" ON "store_invoices" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_store_invoices_paid" ON "store_invoices" USING btree ("paid");--> statement-breakpoint
CREATE INDEX "idx_store_subscriptions_store_id" ON "store_subscriptions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_store_subscriptions_plan_id" ON "store_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_store_subscriptions_status" ON "store_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_store_subscriptions_store_status" ON "store_subscriptions" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_code_uidx" ON "subscription_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_subscription_plans_is_active" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_subscription_plans_sort_order" ON "subscription_plans" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "support_account_codes_code_unique" ON "support_account_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_support_account_codes_store_id" ON "support_account_codes" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_support_call_logs_caller_phone" ON "support_call_logs" USING btree ("caller_phone");--> statement-breakpoint
CREATE INDEX "idx_support_call_logs_started_at" ON "support_call_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_support_call_logs_outcome" ON "support_call_logs" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_status" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_priority" ON "support_tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_created_at" ON "support_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_wallet_transactions_store_id" ON "wallet_transactions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_wallet_transactions_status" ON "wallet_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wallet_transactions_store_status" ON "wallet_transactions" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_event_id" ON "webhook_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_live_chat_msgs_chat" ON "live_chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_live_chats_status" ON "live_chats" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_live_chats_agent_id" ON "live_chats" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "processed_emails_message_id_key" ON "processed_emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_processed_emails_message_id" ON "processed_emails" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "client_phones" ADD CONSTRAINT "client_phones_store_id_locations_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_purchased_by_customer_id_clients_id_fk" FOREIGN KEY ("purchased_by_customer_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_recipient_customer_id_clients_id_fk" FOREIGN KEY ("recipient_customer_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_customer_id_clients_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form_responses" ADD CONSTRAINT "intake_form_responses_customer_id_clients_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_clients_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_clients_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_customer_id_clients_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_customer_id_clients_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subscriptions_stripe_subscription_id" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "billing_plans" DROP COLUMN "stripe_product_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "current_period_start";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "seat_quantity";
CREATE TABLE IF NOT EXISTS "google_business_profiles" (
        "id" serial PRIMARY KEY NOT NULL,
        "store_id" integer NOT NULL,
        "google_account_email" text,
        "business_name" text,
        "business_account_id" text,
        "business_account_resource_name" text,
        "location_id" text,
        "location_resource_name" text,
        "access_token" text,
        "refresh_token" text,
        "token_expires_at" timestamp,
        "is_connected" boolean DEFAULT false,
        "sync_enabled" boolean DEFAULT true,
        "last_synced_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "google_review_responses" (
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

CREATE TABLE IF NOT EXISTS "google_reviews" (
        "id" serial PRIMARY KEY NOT NULL,
        "store_id" integer NOT NULL,
        "google_review_id" text NOT NULL,
        "google_location_id" text,
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

CREATE TABLE IF NOT EXISTS "mail_settings" (
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

-- users table already exists; only add missing columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" varchar;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" varchar;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" varchar;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_image_url" varchar;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar DEFAULT 'admin';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "staff_id" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false;

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "sms_tokens" integer DEFAULT 0 NOT NULL;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "password" text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_business_profiles_store_id_locations_id_fk') THEN
    ALTER TABLE "google_business_profiles" ADD CONSTRAINT "google_business_profiles_store_id_locations_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_review_responses_google_review_id_google_reviews_id_fk') THEN
    ALTER TABLE "google_review_responses" ADD CONSTRAINT "google_review_responses_google_review_id_google_reviews_id_fk"
      FOREIGN KEY ("google_review_id") REFERENCES "public"."google_reviews"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_review_responses_store_id_locations_id_fk') THEN
    ALTER TABLE "google_review_responses" ADD CONSTRAINT "google_review_responses_store_id_locations_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_review_responses_staff_id_staff_id_fk') THEN
    ALTER TABLE "google_review_responses" ADD CONSTRAINT "google_review_responses_staff_id_staff_id_fk"
      FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_review_responses_created_by_users_id_fk') THEN
    ALTER TABLE "google_review_responses" ADD CONSTRAINT "google_review_responses_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_reviews_store_id_locations_id_fk') THEN
    ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_store_id_locations_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_reviews_appointment_id_appointments_id_fk') THEN
    ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_appointment_id_appointments_id_fk"
      FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_reviews_customer_id_customers_id_fk') THEN
    ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_customer_id_customers_id_fk"
      FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mail_settings_store_id_locations_id_fk') THEN
    ALTER TABLE "mail_settings" ADD CONSTRAINT "mail_settings_store_id_locations_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "google_business_profiles_store_id_idx" ON "google_business_profiles" USING btree ("store_id");
CREATE UNIQUE INDEX IF NOT EXISTS "google_business_profiles_store_id_uidx" ON "google_business_profiles" USING btree ("store_id");
CREATE INDEX IF NOT EXISTS "google_review_responses_google_review_id_idx" ON "google_review_responses" USING btree ("google_review_id");
CREATE INDEX IF NOT EXISTS "google_review_responses_store_id_idx" ON "google_review_responses" USING btree ("store_id");
CREATE INDEX IF NOT EXISTS "google_review_responses_response_status_idx" ON "google_review_responses" USING btree ("response_status");
CREATE INDEX IF NOT EXISTS "google_reviews_store_id_idx" ON "google_reviews" USING btree ("store_id");
CREATE INDEX IF NOT EXISTS "google_reviews_google_review_id_idx" ON "google_reviews" USING btree ("google_review_id");
CREATE INDEX IF NOT EXISTS "google_reviews_rating_idx" ON "google_reviews" USING btree ("rating");
CREATE INDEX IF NOT EXISTS "google_reviews_response_status_idx" ON "google_reviews" USING btree ("response_status");

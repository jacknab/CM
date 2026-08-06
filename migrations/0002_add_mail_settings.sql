CREATE TABLE IF NOT EXISTS "mail_settings" (
        "id" serial PRIMARY KEY,
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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'mail_settings_store_id_locations_id_fk'
      AND table_name = 'mail_settings'
  ) THEN
    ALTER TABLE "mail_settings" ADD CONSTRAINT "mail_settings_store_id_locations_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "locations"("id");
  END IF;
END $$;

-- Migration: Add Google Business Profile Tables
-- This migration creates all necessary tables for Google Business Profile integration

CREATE TABLE IF NOT EXISTS google_business_profiles (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  google_account_email TEXT,
  business_name TEXT,
  business_account_id TEXT,
  business_account_resource_name TEXT,
  location_id TEXT,
  location_resource_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  is_connected BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS google_business_profiles_store_id_idx 
  ON google_business_profiles(store_id);

CREATE TABLE IF NOT EXISTS google_reviews (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  google_review_id TEXT UNIQUE NOT NULL,
  google_location_id TEXT,
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

CREATE INDEX IF NOT EXISTS google_reviews_store_id_idx 
  ON google_reviews(store_id);
CREATE INDEX IF NOT EXISTS google_reviews_google_review_id_idx 
  ON google_reviews(google_review_id);
CREATE INDEX IF NOT EXISTS google_reviews_rating_idx 
  ON google_reviews(rating);
CREATE INDEX IF NOT EXISTS google_reviews_response_status_idx 
  ON google_reviews(response_status);

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

CREATE INDEX IF NOT EXISTS google_review_responses_google_review_id_idx 
  ON google_review_responses(google_review_id);
CREATE INDEX IF NOT EXISTS google_review_responses_store_id_idx 
  ON google_review_responses(store_id);
CREATE INDEX IF NOT EXISTS google_review_responses_response_status_idx 
  ON google_review_responses(response_status);

-- Add the following column to mail_settings table if not already present
ALTER TABLE mail_settings ADD COLUMN IF NOT EXISTS google_review_url TEXT;

-- Add the following column to sms_settings table if not already present
ALTER TABLE sms_settings ADD COLUMN IF NOT EXISTS google_review_url TEXT;

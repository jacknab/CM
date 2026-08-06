-- Website Builder tables: wb_templates, wb_websites, wb_page_views, wb_purchased_subdomains, wb_image_library

CREATE TABLE IF NOT EXISTS wb_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT,
  files_path TEXT NOT NULL,
  build_status TEXT,
  build_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wb_websites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  storeid TEXT,
  template_id INTEGER,
  content JSONB NOT NULL DEFAULT '{}',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  custom_domain TEXT,
  custom_domain_status TEXT,
  custom_domain_token TEXT,
  stripe_checkout_session_id TEXT,
  assigned_subdomain TEXT,
  ssl_status TEXT,
  ssl_provisioned_at TIMESTAMPTZ,
  ssl_error TEXT,
  publisher_type TEXT NOT NULL DEFAULT 'template',
  auto_settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wb_page_views (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES wb_websites(id) ON DELETE CASCADE,
  path TEXT DEFAULT '/',
  referrer TEXT,
  ip_hash TEXT,
  ua_snippet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wb_purchased_subdomains (
  id SERIAL PRIMARY KEY,
  storeid TEXT NOT NULL,
  subdomain TEXT NOT NULL UNIQUE,
  stripe_checkout_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS wb_image_library (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  category TEXT NOT NULL,
  original_url TEXT,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

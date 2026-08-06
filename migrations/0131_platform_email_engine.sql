-- Platform lifecycle email engine.
-- Separate from salon/client campaigns so platform messaging can be audited,
-- paused, retried, and measured without changing customer marketing behavior.

CREATE TABLE IF NOT EXISTS platform_email_campaigns (
  id SERIAL PRIMARY KEY,
  campaign_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'lifecycle',
  trigger_event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  audience_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  from_name TEXT,
  reply_to TEXT,
  created_by VARCHAR(255),
  last_run_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_email_steps (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES platform_email_campaigns(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  subject TEXT NOT NULL,
  preview_text TEXT,
  html_template TEXT NOT NULL,
  text_template TEXT,
  cta_label TEXT,
  cta_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, step_order)
);

CREATE TABLE IF NOT EXISTS platform_email_event_log (
  id SERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_email_enrollments (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES platform_email_campaigns(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  current_step INTEGER NOT NULL DEFAULT 1,
  next_send_at TIMESTAMP NOT NULL DEFAULT NOW(),
  enrolled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  last_event_at TIMESTAMP,
  last_error TEXT,
  UNIQUE(campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS platform_email_deliveries (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES platform_email_campaigns(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL REFERENCES platform_email_steps(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_id TEXT,
  error TEXT,
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, step_id, user_id)
);

CREATE TABLE IF NOT EXISTS platform_email_events (
  id SERIAL PRIMARY KEY,
  delivery_id INTEGER NOT NULL REFERENCES platform_email_deliveries(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_email_suppressions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'unsubscribe',
  source TEXT NOT NULL DEFAULT 'email',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_email_campaigns_status
  ON platform_email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_platform_email_campaigns_trigger
  ON platform_email_campaigns(trigger_event, status);
CREATE INDEX IF NOT EXISTS idx_platform_email_enrollments_due
  ON platform_email_enrollments(status, next_send_at);
CREATE INDEX IF NOT EXISTS idx_platform_email_deliveries_provider
  ON platform_email_deliveries(provider_id);
CREATE INDEX IF NOT EXISTS idx_platform_email_deliveries_user
  ON platform_email_deliveries(user_id, status);
-- Certxa Pro: client forms and waivers (owner, 2026-11-15: "match GlossGenius"). Builds on the old intake_forms tables
-- (empty on 2026-11-15). A form is sent to the client as a private link (certxa.com/f/<code>) before the visit, by
-- itself when the client books a service the form is for, or by the pro from the booking or the client's profile.
ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'intake';           -- intake | waiver
ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'once';        -- once | every_visit
ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS send_auto BOOLEAN NOT NULL DEFAULT true;        -- send on booking
ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS all_services BOOLEAN NOT NULL DEFAULT true;

-- The services a form is sent for (when all_services is false).
CREATE TABLE IF NOT EXISTS intake_form_services (
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (form_id, service_id)
);

-- One link sent to one client for one form (and the visit it was sent for, if any).
CREATE TABLE IF NOT EXISTS intake_form_requests (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL,
  appointment_id INTEGER,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent',                                 -- sent | completed
  sent_via TEXT,                                                       -- email | sms | in_person | none
  auto BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  response_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_intake_form_requests_customer ON intake_form_requests (store_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_form_requests_visit ON intake_form_requests (form_id, appointment_id) WHERE appointment_id IS NOT NULL;

-- What the client signed: the questions as they were then (a later edit of the form never changes a signed copy).
ALTER TABLE intake_form_responses ADD COLUMN IF NOT EXISTS request_id INTEGER;
ALTER TABLE intake_form_responses ADD COLUMN IF NOT EXISTS form_snapshot JSONB;
ALTER TABLE intake_form_responses ADD COLUMN IF NOT EXISTS signature_name TEXT;
ALTER TABLE intake_form_responses ADD COLUMN IF NOT EXISTS signature_image TEXT;
ALTER TABLE intake_form_responses ADD COLUMN IF NOT EXISTS ip_hash TEXT;
ALTER TABLE intake_form_responses ADD COLUMN IF NOT EXISTS user_agent TEXT;
CREATE INDEX IF NOT EXISTS idx_intake_form_responses_customer ON intake_form_responses (store_id, customer_id);

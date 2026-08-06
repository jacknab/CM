-- Service Options: hierarchical service + variants model
-- Each service can have unlimited options (e.g. "Hard Gel - Short", "Hard Gel - Long")
-- Existing services are migrated: each becomes a parent with one matching option.

CREATE TABLE IF NOT EXISTS service_options (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_options_service_id ON service_options(service_id);
CREATE INDEX IF NOT EXISTS idx_service_options_active ON service_options(service_id, is_active);

-- Seed one default option per existing service so legacy data keeps working.
-- name = service name, duration/price copied from parent.
INSERT INTO service_options (service_id, name, duration_minutes, price, is_default, display_order)
SELECT
  id,
  name,
  duration,
  CAST(price AS DECIMAL(10,2)),
  true,
  0
FROM services
WHERE NOT EXISTS (
  SELECT 1 FROM service_options so WHERE so.service_id = services.id
);

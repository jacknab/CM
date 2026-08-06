-- Service Import Jobs: tracks async AI-powered menu import jobs
CREATE TABLE IF NOT EXISTS service_import_jobs (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  status         TEXT    NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed | published
  import_type    TEXT    NOT NULL DEFAULT 'photos',   -- photos | pdf | manual
  uploaded_files JSONB   NOT NULL DEFAULT '[]',       -- [{url, originalName, mimeType}]
  ai_result      JSONB,                               -- {categories:[{name,services:[{name,price,duration,description}]}]}
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  notified_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sij_store_id ON service_import_jobs(store_id);
CREATE INDEX IF NOT EXISTS idx_sij_status   ON service_import_jobs(status);

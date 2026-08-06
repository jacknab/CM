CREATE TABLE IF NOT EXISTS data_transfer_jobs (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL,
  user_id               TEXT,
  mode                  VARCHAR(32)  NOT NULL DEFAULT 'self_service',
  status                VARCHAR(32)  NOT NULL DEFAULT 'pending_upload',
  source_platform       VARCHAR(64),
  files_json            JSONB        NOT NULL DEFAULT '[]',
  mapping_json          JSONB        NOT NULL DEFAULT '{}',
  preview_json          JSONB        NOT NULL DEFAULT '{}',
  import_ids_json       JSONB        NOT NULL DEFAULT '{}',
  imported_counts_json  JSONB        NOT NULL DEFAULT '{}',
  errors_json           JSONB        NOT NULL DEFAULT '[]',
  reject_reason         TEXT,
  review_notes          TEXT,
  reviewed_by_user_id   TEXT,
  reviewed_at           TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at          TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_data_transfer_jobs_store_id ON data_transfer_jobs (store_id);
CREATE INDEX IF NOT EXISTS idx_data_transfer_jobs_status   ON data_transfer_jobs (status);

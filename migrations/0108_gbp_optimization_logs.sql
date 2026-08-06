-- GBP Optimization Logs
-- Tracks all automated actions and recommendations made by the GBP Optimization Engine.
-- Phase 1: audit worker, auto-sync safe fields, category recommendations.

CREATE TABLE IF NOT EXISTS gbp_optimization_logs (
  id                      SERIAL PRIMARY KEY,
  store_id                INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  location_resource_name  TEXT,                          -- GBP location resource name at time of action
  action                  TEXT NOT NULL,                 -- 'sync_hours' | 'sync_description' | 'sync_booking_url' |
                                                         -- 'sync_website_url' | 'sync_services' |
                                                         -- 'category_recommendation' | 'audit_run' | 'sync_skipped'
  field                   TEXT,                          -- which GBP field was affected
  previous_value          TEXT,                          -- value before action (JSON or plain text)
  new_value               TEXT,                          -- value after action (JSON or plain text)
  status                  TEXT NOT NULL DEFAULT 'success', -- 'success' | 'failed' | 'skipped' | 'recommended'
  error_message           TEXT,
  triggered_by            TEXT NOT NULL DEFAULT 'scheduler', -- 'scheduler' | 'manual'
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gbp_opt_logs_store_id_idx   ON gbp_optimization_logs(store_id);
CREATE INDEX IF NOT EXISTS gbp_opt_logs_created_at_idx ON gbp_optimization_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS gbp_opt_logs_action_idx     ON gbp_optimization_logs(action);
CREATE INDEX IF NOT EXISTS gbp_opt_logs_status_idx     ON gbp_optimization_logs(status);

-- Migration 0177: Store Network Trust
--
-- Optionally restrict /kiosk/:slug and /frontdesk/:slug(/:registerId) to the
-- salon's own network. The FIRST device to ever report from /calendar for a
-- store becomes the "anchor" and its IP becomes trusted; only that same
-- device can update the trusted IP afterward (e.g. if the ISP-assigned IP
-- rotates) — a different device loading /calendar later (an owner checking
-- the schedule from home) can neither steal the anchor nor overwrite the
-- trusted IP. Off by default for every existing store — opt-in only.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS restrict_kiosk_network boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS store_network_trust (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL UNIQUE REFERENCES locations(id) ON DELETE CASCADE,
  anchor_device_id  TEXT NOT NULL,
  trusted_ip        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

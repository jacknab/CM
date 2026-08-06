-- Migration 0013: Clear any stale launchsite_templates rows.
-- No templates are pre-seeded; they are imported via the admin panel.
-- This is a no-op on a fresh database.
DELETE FROM launchsite_templates WHERE 1=1;

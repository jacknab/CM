-- Migration: 0017_add_missing_wb_columns.sql
-- Adds columns to wb_websites and wb_templates that are defined in the
-- Drizzle ORM schema but were never added to the actual database tables.
--
-- When Drizzle generates SELECT statements from the schema, it requests ALL
-- columns including ones that don't physically exist in the table, causing
-- PostgreSQL to throw "column does not exist" errors and the server to
-- respond with HTTP 500.
--
-- Safe to run multiple times — every statement uses IF NOT EXISTS.

-- ─── wb_websites: missing columns ─────────────────────────────────────────
ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS custom_domain_token  TEXT;
ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS assigned_subdomain   TEXT;

-- ─── wb_templates: missing columns ───────────────────────────────────────
ALTER TABLE wb_templates ADD COLUMN IF NOT EXISTS build_status   TEXT;
ALTER TABLE wb_templates ADD COLUMN IF NOT EXISTS build_error    TEXT;
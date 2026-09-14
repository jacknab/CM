-- Migration 0181: directory_inquiries.salon_id nullable
--
-- The marketplace's "For salon owners" lead form (business-inquiries) isn't
-- tied to any specific listing, unlike a per-salon "ask a question" inquiry.
-- Reuses the same directory_inquiries table from migration 0180 rather than
-- a separate one-off table.

ALTER TABLE directory_inquiries ALTER COLUMN salon_id DROP NOT NULL;

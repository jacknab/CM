-- ============================================================
-- CERTXA — Nail Salon Category Template
-- Creates exactly 7 default categories for a Nail Salon store
-- Safe to run repeatedly (idempotent)
-- Run with: psql $DATABASE_URL -f scripts/nail-salon-categories-template.sql -v store_id=123
-- ============================================================

-- Ensure unique index on (store_id, name) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_categories_store_name ON service_categories (store_id, name);

-- Insert the 7 standard Nail Salon categories with explicit sort_order
-- Uses :store_id parameter (pass via -v store_id=123)
INSERT INTO service_categories (name, store_id, sort_order) VALUES
  ('Manicures', :store_id, 1),
  ('Pedicures', :store_id, 2),
  ('Enhancements', :store_id, 3),
  ('Nail Art', :store_id, 4),
  ('Waxing', :store_id, 5),
  ('Threading', :store_id, 6),
  ('Combos', :store_id, 7)
ON CONFLICT (store_id, name) DO UPDATE SET
  sort_order = EXCLUDED.sort_order;

-- Verify the result
SELECT id, name, store_id, sort_order
FROM service_categories
WHERE store_id = :store_id
ORDER BY sort_order;
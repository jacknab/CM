-- Ensure unique index on (store_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_categories_store_name ON service_categories (store_id, name);

-- Insert categories for the first store with upsert
WITH store AS (SELECT id FROM locations LIMIT 1)
INSERT INTO service_categories (name, store_id, sort_order) SELECT 'Manicures', store.id, 1 FROM store
UNION ALL SELECT 'Pedicures', store.id, 2 FROM store
UNION ALL SELECT 'Enhancements', store.id, 3 FROM store
UNION ALL SELECT 'Nail Art', store.id, 4 FROM store
UNION ALL SELECT 'Waxing', store.id, 5 FROM store
UNION ALL SELECT 'Threading', store.id, 6 FROM store
UNION ALL SELECT 'Combos', store.id, 7 FROM store
ON CONFLICT (store_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- Add check constraint for allowed category names
ALTER TABLE service_categories ADD CONSTRAINT IF NOT EXISTS valid_nail_salon_categories CHECK (name IN ('Manicures', 'Pedicures', 'Enhancements', 'Nail Art', 'Waxing', 'Threading', 'Combos'));
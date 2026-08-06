-- POS Grid: lock flag, dimensions, department, active status, and default grid seed
ALTER TABLE pos_grids
  ADD COLUMN IF NOT EXISTS is_locked   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rows        INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS cols        INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS dept        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_status  INTEGER NOT NULL DEFAULT 0;

-- Seed 14 default grids for store 1 only when that store exists and has no grids yet.
-- These are the standard nail-salon grid templates (MAIN is the live POS grid).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM locations WHERE id = 1)
     AND NOT EXISTS (SELECT 1 FROM pos_grids WHERE store_id = 1)
  THEN
    INSERT INTO pos_grids
      (store_id, name, is_live, is_locked, is_active, internal_code,
       layout_type, dynamic_population, nav_behavior, rows, cols, dept, pos_status)
    VALUES
      (1, 'MAIN',        TRUE,  TRUE,  TRUE, '0001', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'OP MENU',     FALSE, TRUE,  TRUE, '0002', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'FOOD',        FALSE, FALSE, TRUE, '0003', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'MANICURES',   FALSE, FALSE, TRUE, '0004', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'FRENCH TIPS', FALSE, FALSE, TRUE, '0005', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'ADDONS',      FALSE, FALSE, TRUE, '0006', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'EXTRAS',      FALSE, FALSE, TRUE, '0007', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'PEDICURES',   FALSE, FALSE, TRUE, '0008', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'FULL SETS',   FALSE, FALSE, TRUE, '0009', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'ACRYLIC',     FALSE, FALSE, TRUE, '0010', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'STYLE',       FALSE, FALSE, TRUE, '0011', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'LENGTH',      FALSE, FALSE, TRUE, '0012', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'SHAPE',       FALSE, FALSE, TRUE, '0013', 'fixed', FALSE, 'stay', 6, 4, 0, 0),
      (1, 'FINISH',      FALSE, FALSE, TRUE, '0014', 'fixed', FALSE, 'stay', 6, 4, 0, 0);
  END IF;
END $$;

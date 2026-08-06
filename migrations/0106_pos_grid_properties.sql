-- POS Grid Properties: extended grid configuration fields
ALTER TABLE pos_grids
  ADD COLUMN IF NOT EXISTS internal_code       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS layout_type         VARCHAR(30)  NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS dynamic_population  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nav_behavior        VARCHAR(20)  NOT NULL DEFAULT 'stay',
  ADD COLUMN IF NOT EXISTS target_grid_id      INTEGER      REFERENCES pos_grids(id) ON DELETE SET NULL;

-- POS Grid Management: named button grids + per-slot configuration
CREATE TABLE IF NOT EXISTS pos_grids (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL DEFAULT 'MAIN',
  is_live     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_grid_slots (
  id            SERIAL PRIMARY KEY,
  grid_id       INTEGER NOT NULL REFERENCES pos_grids(id) ON DELETE CASCADE,
  slot_index    INTEGER NOT NULL,
  label         VARCHAR(200),
  service_id    INTEGER REFERENCES services(id) ON DELETE SET NULL,
  opens_grid_id INTEGER REFERENCES pos_grids(id) ON DELETE SET NULL,
  band_color    VARCHAR(30),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT pos_grid_slots_unique       UNIQUE (grid_id, slot_index),
  CONSTRAINT pos_grid_slots_slot_range   CHECK  (slot_index >= 0 AND slot_index <= 23)
);

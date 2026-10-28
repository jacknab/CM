-- 0268_station_cash_drawer.sql
-- Salons use one cash drawer (owner, 2026-10-29): a drawer can serve several POS stations; each station uses one
-- drawer. The link moves from the drawer (cash_drawers.register_id, one station each) to the station
-- (registers.cash_drawer_id). cash_drawers.register_id is no longer used. A salon with no station rows still marks
-- its drawer main_station.
ALTER TABLE registers ADD COLUMN IF NOT EXISTS cash_drawer_id INTEGER REFERENCES cash_drawers(id) ON DELETE SET NULL;
UPDATE registers r SET cash_drawer_id = d.id FROM cash_drawers d WHERE d.register_id = r.id AND r.cash_drawer_id IS NULL;
UPDATE cash_drawers SET register_id = NULL WHERE register_id IS NOT NULL;
DROP INDEX IF EXISTS cash_drawers_one_per_register;

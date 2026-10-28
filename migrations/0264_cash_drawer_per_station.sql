-- 0264_cash_drawer_per_station.sql
-- Cash drawers belong to POS stations (owner, 2026-10-29): a salon sets up a drawer with its starting cash (set once,
-- target_float) and assigns it to ONE POS station. A station without a drawer can't take cash.
-- A salon with no station rows has one built-in station (the POS runs as station 0): its drawer is marked
-- main_station instead of naming a register.
ALTER TABLE cash_drawers ADD COLUMN IF NOT EXISTS main_station BOOLEAN NOT NULL DEFAULT FALSE;

-- One drawer per station, and one per salon's built-in station.
CREATE UNIQUE INDEX IF NOT EXISTS cash_drawers_one_per_register ON cash_drawers (register_id) WHERE register_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cash_drawers_one_main_station ON cash_drawers (store_id) WHERE main_station;

-- One-time setup for salons already taking cash with the old implicit drawer (used in the last 60 days) and no
-- drawer of their own: "Drawer 1" on their default station (or the built-in one), starting cash = the last opening
-- amount, and their open drawer session moves onto it so Day Close carries on.
INSERT INTO cash_drawers (store_id, name, register_id, main_station, target_float)
SELECT s.store_id, 'Drawer 1',
       (SELECT r.id FROM registers r WHERE r.store_id = s.store_id AND r.is_active ORDER BY r.is_default DESC, r.sort_order, r.id LIMIT 1),
       NOT EXISTS (SELECT 1 FROM registers r WHERE r.store_id = s.store_id AND r.is_active),
       COALESCE(
         (SELECT cds.opening_balance FROM cash_drawer_sessions cds WHERE cds.store_id = s.store_id ORDER BY cds.opened_at DESC LIMIT 1),
         (SELECT l.register_target_float FROM locations l WHERE l.id = s.store_id),
         0)
FROM (SELECT DISTINCT store_id FROM cash_drawer_sessions WHERE opened_at > now() - interval '60 days') s
WHERE NOT EXISTS (SELECT 1 FROM cash_drawers d WHERE d.store_id = s.store_id);

UPDATE cash_drawer_sessions cds SET drawer_id = d.id
FROM cash_drawers d
WHERE cds.drawer_id IS NULL AND cds.status = 'open' AND d.store_id = cds.store_id AND d.name = 'Drawer 1'
  AND d.id = (SELECT MIN(d2.id) FROM cash_drawers d2 WHERE d2.store_id = cds.store_id);

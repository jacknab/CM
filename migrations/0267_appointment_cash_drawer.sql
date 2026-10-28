-- 0267_appointment_cash_drawer.sql
-- Each cash sale records the cash drawer that took it (owner, 2026-10-29), so a salon with a drawer per POS station
-- counts each drawer's own cash at its Day Close. NULL = no station said which (the Certxa Pro app, an older tablet,
-- a sale from before this) — counted in the salon's main drawer (lib/stationDrawer.ts primaryDrawerId).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cash_drawer_id INTEGER REFERENCES cash_drawers(id) ON DELETE SET NULL;

-- Migration 0178: Registers default row + ID sequence reset
--
-- Adds is_default to `registers`: the very first time a store adds a second
-- checkout station, a real "POS #1" row is now created alongside it
-- (isDefault=true) instead of leaving POS #1 as a hardcoded/synthetic
-- registerId-0 concept forever. A store that has never added an extra
-- station still has zero rows and behaves exactly as before — this only
-- changes what happens once a store actually uses the feature.
--
-- The registers.id sequence is also reset to start at 1250 (a cosmetic
-- request — low sequential ids like 1, 2, 3 looked like leftover test data).
-- This is a global sequence shared by every store's registers on the
-- platform, not per-store; resetting it is safe right now because the table
-- is empty (verified before running this migration).

ALTER TABLE registers ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS registers_store_default_uidx
  ON registers(store_id) WHERE is_default = true;

ALTER SEQUENCE registers_id_seq RESTART WITH 1250;

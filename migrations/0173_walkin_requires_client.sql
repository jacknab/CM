-- 0173_walkin_requires_client.sql
--
-- New Calendar Settings toggle: when enabled, walk-in appointments must be
-- linked to a real client record (no anonymous/no-client walk-ins). Distinct
-- from walk_ins_enabled, which controls whether walk-ins are allowed at all.
--
-- require_client_for_walkin : false by default, matches today's behavior
--                              (walk-ins can be created with no client record).

ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS require_client_for_walkin boolean NOT NULL DEFAULT false;

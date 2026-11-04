-- Pricing levels on the salon's tablets (owner, 2026-11-03): the salon copy (lib/storeMirror.ts, migration 0249) also
-- carries pricing_levels and service_level_prices, so /barber prices each service for the signed-in barber with no
-- internet too. A copied row needs an id: service_level_prices gets one (its key stays service + level).
ALTER TABLE service_level_prices ADD COLUMN IF NOT EXISTS id SERIAL;
CREATE UNIQUE INDEX IF NOT EXISTS service_level_prices_id_uq ON service_level_prices (id);

DROP TRIGGER IF EXISTS store_mirror_log ON pricing_levels;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON pricing_levels
  FOR EACH ROW EXECUTE FUNCTION log_store_change('store');
DROP TRIGGER IF EXISTS store_mirror_log ON service_level_prices;
CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON service_level_prices
  FOR EACH ROW EXECUTE FUNCTION log_store_change('pricing_levels:pricing_level_id');

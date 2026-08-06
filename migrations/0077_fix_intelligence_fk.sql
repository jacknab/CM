-- Migration 0077: Fix client_intelligence FK constraints
-- The intelligence tables previously referenced the customers table.
-- After the customers table was retired, the schema was updated to reference
-- clients instead. This migration ensures the FK constraints in the live DB
-- reflect that change, regardless of what name the old constraint had.

-- client_intelligence: drop old FK (any likely name), add correct one
ALTER TABLE client_intelligence
  DROP CONSTRAINT IF EXISTS client_intelligence_customer_id_customers_id_fk;
ALTER TABLE client_intelligence
  DROP CONSTRAINT IF EXISTS client_intelligence_customer_id_clients_id_fk;
ALTER TABLE client_intelligence
  ADD CONSTRAINT client_intelligence_customer_id_clients_id_fk
  FOREIGN KEY (customer_id) REFERENCES clients(id) ON DELETE CASCADE;

-- intelligence_interventions: drop old FK (any likely name), add correct one
ALTER TABLE intelligence_interventions
  DROP CONSTRAINT IF EXISTS intelligence_interventions_customer_id_customers_id_fk;
ALTER TABLE intelligence_interventions
  DROP CONSTRAINT IF EXISTS intelligence_interventions_customer_id_clients_id_fk;
ALTER TABLE intelligence_interventions
  ADD CONSTRAINT intelligence_interventions_customer_id_clients_id_fk
  FOREIGN KEY (customer_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Migration 0075: Drop retired customers table
-- All data was migrated to the clients table. The customers table has been
-- empty and unwritten-to since the clients CRM was introduced. The storage
-- layer already proxies all customer API calls to clients.

DROP TABLE IF EXISTS customers CASCADE;

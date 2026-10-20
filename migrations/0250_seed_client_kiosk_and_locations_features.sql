INSERT INTO "features" ("id", "name", "description", "category", "sort_order") VALUES
  ('client_kiosk', 'Client Kiosk', 'Self-service client check-in and queue access', 'booking', 150),
  ('locations', 'Locations', 'Manage multiple business locations under one account', 'general', 160)
ON CONFLICT ("id") DO NOTHING;

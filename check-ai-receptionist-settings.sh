#!/bin/bash
cd /apps/CM

# Parse DATABASE_URL manually
DB_URL=$(grep DATABASE_URL .env | cut -d'=' -f2-)

# Extract components using regex
DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@([^:]+):.*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@[^:]+:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@[^:]+:[0-9]+/(.*)|\1|')

# Query AI Receptionist settings
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 
    store_id, 
    l.name as store_name,
    preferences::jsonb->>'aiReceptionistEnabled' as ai_receptionist_enabled
FROM store_settings ss
JOIN locations l ON ss.store_id = l.id
WHERE preferences::jsonb ? 'aiReceptionistEnabled'
ORDER BY store_id;"
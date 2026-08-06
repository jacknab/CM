#!/bin/bash

# Load environment variables directly
eval "$(grep -E '^(AI_INTEGRATIONS_OPENAI_API_KEY|TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|TWILIO_PHONE_NUMBER|APP_URL|DATABASE_URL)=' /apps/CM/.env)"

echo "=== AI Receptionist Diagnostic Report ==="
echo

# 1. Environment Variables Check
echo "1. Environment Variables:"
echo "   OpenAI API Key: ${AI_INTEGRATIONS_OPENAI_API_KEY:+PRESENT}"
echo "   Twilio Account SID: ${TWILIO_ACCOUNT_SID:+PRESENT}"
echo "   App URL: $APP_URL"
echo

# 2. OpenAI API Key Validation
echo "2. OpenAI API Key Validation:"
if [ -n "$AI_INTEGRATIONS_OPENAI_API_KEY" ]; then
    # Check key format
    if [[ "$AI_INTEGRATIONS_OPENAI_API_KEY" =~ ^sk-proj- ]]; then
        echo "   ✓ Key format looks correct"
    else
        echo "   ✗ Key format seems unusual"
    fi

    # Basic length check
    key_length=${#AI_INTEGRATIONS_OPENAI_API_KEY}
    if [ $key_length -gt 50 ]; then
        echo "   ✓ Key length seems appropriate"
    else
        echo "   ✗ Key length seems too short"
    fi
else
    echo "   ✗ OpenAI API Key is MISSING"
fi
echo

# 3. Twilio Configuration Check
echo "3. Twilio Configuration:"
if [ -n "$TWILIO_ACCOUNT_SID" ] && [ -n "$TWILIO_AUTH_TOKEN" ] && [ -n "$TWILIO_PHONE_NUMBER" ]; then
    echo "   ✓ Twilio credentials are present"
    echo "   Account SID: $TWILIO_ACCOUNT_SID"
    echo "   Phone Number: $TWILIO_PHONE_NUMBER"
else
    echo "   ✗ Incomplete Twilio configuration"
fi
echo

# 4. Database Connection Check
echo "4. Database Connection:"
# Manually parse DATABASE_URL
db_user=$(echo "$DATABASE_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
db_pass=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
db_host=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@([^:]+):.*|\1|')
db_port=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@[^:]+:([0-9]+)/.*|\1|')
db_name=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@[^:]+:[0-9]+/(.*)|\1|')

echo "   User: $db_user"
echo "   Host: $db_host"
echo "   Port: $db_port"
echo "   Database: $db_name"

# 5. Store Settings Check
echo "5. Store Settings:"
PGPASSWORD="$db_pass" psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "
WITH store_ai_settings AS (
  SELECT 
    store_id, 
    l.name as store_name,
    preferences::jsonb->>'aiReceptionistEnabled' as ai_receptionist_enabled
  FROM store_settings ss
  JOIN locations l ON ss.store_id = l.id
  WHERE preferences::jsonb ? 'aiReceptionistEnabled'
)
SELECT 
  store_id, 
  store_name,
  ai_receptionist_enabled
FROM store_ai_settings
ORDER BY store_id;"
echo

# 6. Nginx WebSocket Configuration
echo "6. Nginx WebSocket Configuration:"
grep -A 10 "location /media-stream" /apps/CM/nginx-site.conf
echo

# 7. Server Logs for AI Receptionist
echo "7. Recent AI Receptionist Logs:"
pm2 logs certxa-api --lines 50 | grep -E "AI Receptionist|WebSocket|Twilio"
#!/bin/bash
cd /apps/CM
export $(grep -v '^#' .env | xargs)

# Check environment variables
echo "OpenAI API Key Present: ${AI_INTEGRATIONS_OPENAI_API_KEY:+Yes}"
echo "Twilio Account SID Present: ${TWILIO_ACCOUNT_SID:+Yes}"
echo "App URL: $APP_URL"

# Perform database query with more detailed JSON parsing
psql "$DATABASE_URL" -t -c "
WITH store_ai_settings AS (
  SELECT 
    store_id, 
    preferences,
    (preferences::jsonb->>'aiReceptionistEnabled')::text as ai_receptionist_enabled
  FROM store_settings
)
SELECT 
  store_id, 
  ai_receptionist_enabled,
  preferences
FROM store_ai_settings
WHERE ai_receptionist_enabled IS NOT NULL
LIMIT 10;"
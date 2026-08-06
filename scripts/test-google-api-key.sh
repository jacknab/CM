#!/bin/bash
# Test that the Google API key works against the Places Text Search API

API_KEY="${GOOGLE_API_KEY:-${GOOGLE_MAPS_API_KEY:-}}"

if [ -z "$API_KEY" ]; then
  echo "❌  No API key found — set GOOGLE_API_KEY or GOOGLE_MAPS_API_KEY"
  exit 1
fi

echo "🔑  Key found: ${API_KEY:0:8}…${API_KEY: -4}"
echo "🌐  Sending test request to Google Places Text Search API…"

RESPONSE=$(curl -s "https://maps.googleapis.com/maps/api/place/textsearch/json?query=nail+salon&type=nail_salon&key=${API_KEY}")

STATUS=$(echo "$RESPONSE" | grep -o '"status" *: *"[^"]*"' | head -1 | sed 's/.*: *"\(.*\)"/\1/')

echo "📋  API status: $STATUS"

case "$STATUS" in
  OK|ZERO_RESULTS)
    echo "✅  API key is valid and working."
    ;;
  REQUEST_DENIED)
    ERROR=$(echo "$RESPONSE" | grep -o '"error_message" *: *"[^"]*"' | sed 's/.*: *"\(.*\)"/\1/')
    echo "❌  Request denied. Error: $ERROR"
    echo "   → Make sure the Places API is enabled in your Google Cloud Console"
    echo "     https://console.cloud.google.com/apis/library/places-backend.googleapis.com"
    exit 1
    ;;
  INVALID_REQUEST)
    echo "❌  Invalid request (unexpected). Raw response:"
    echo "$RESPONSE"
    exit 1
    ;;
  OVER_DAILY_LIMIT|OVER_QUERY_LIMIT)
    echo "⚠️   Quota exceeded — key is valid but you've hit the daily/query limit."
    exit 1
    ;;
  *)
    echo "⚠️   Unexpected status: '$STATUS'"
    echo "    Raw response:"
    echo "$RESPONSE"
    exit 1
    ;;
esac

#!/usr/bin/env bash
# Minimal repro harness to time receptionist availability and booking APIs without Twilio/voice.
# Usage:
#   STORE_ID=2 SERVICE_ID=101 DATE=2025-07-01 \
#   CUSTOMER_PHONE=5551234567 CUSTOMER_NAME="Test Caller" SLOT_ISO=2025-07-01T15:00:00 \
#   ./scripts/repro-ai-receptionist.sh
#
# Notes:
# - Uses APP_URL if set, else http://127.0.0.1:5000
# - If LIST_SERVICES=1 is set, loads DATABASE_URL from /etc/certxa.env (if present) and lists services for the store via psql before HTTP calls (no caching).
# - Does NOT cache anything; this hits live booking logic.
# - If AI_RECEPTIONIST_API_KEY is set, it will be sent in x-ai-receptionist-key.
# - This helps spot slow hops (DB or availability) that cause dead-air in calls.

set -euo pipefail

api_base=${APP_URL:-"http://127.0.0.1:5000"}
store_id=${STORE_ID:-}
service_id=${SERVICE_ID:-}
date_arg=${DATE:-}
customer_phone=${CUSTOMER_PHONE:-}
customer_name=${CUSTOMER_NAME:-"Test Caller"}
slot_iso=${SLOT_ISO:-}
key_header=""
env_file="/etc/certxa.env"
psql_bin=${PSQL_BIN:-psql}

if [[ -z "${DATABASE_URL:-}" && -f "$env_file" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^(DATABASE_URL)=' "$env_file" | xargs)
fi

if [[ -n "${AI_RECEPTIONIST_API_KEY:-}" ]]; then
  key_header=("-H" "x-ai-receptionist-key: ${AI_RECEPTIONIST_API_KEY}")
fi

if [[ -z "$store_id" || -z "$service_id" || -z "$date_arg" ]]; then
  echo "Required: STORE_ID, SERVICE_ID, DATE" >&2
  exit 1
fi

echo "API base: $api_base"
echo "Store: $store_id  Service: $service_id  Date: $date_arg"

if [[ "${LIST_SERVICES:-0}" == "1" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "LIST_SERVICES=1 set but DATABASE_URL is not available" >&2
  else
    echo "--- services from DB (store_id=${store_id}) ---"
    $psql_bin "$DATABASE_URL" -c "SELECT id, name, duration, price FROM services WHERE store_id = ${store_id} ORDER BY id LIMIT 50;" || true
  fi
fi

echo "--- availability (timed) ---"
time curl -sS -X GET "${api_base}/api/ai-receptionist/store/${store_id}/availability?serviceId=${service_id}&date=${date_arg}" \
  -H "content-type: application/json" "${key_header[@]}"

if [[ -n "$customer_phone" && -n "$slot_iso" ]]; then
  echo "\n--- booking (timed) ---"
  time curl -sS -X POST "${api_base}/api/ai-receptionist/store/${store_id}/book" \
    -H "content-type: application/json" "${key_header[@]}" \
    -d @- <<EOF
{
  "customerName": "${customer_name}",
  "customerPhone": "${customer_phone}",
  "serviceId": ${service_id},
  "appointmentDateTime": "${slot_iso}",
  "extraDurationMinutes": 0
}
EOF
fi

echo "\nDone."

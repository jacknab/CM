#!/usr/bin/env bash
# Export salon data to JSON for AI receptionist prefetching.
# Outputs a single JSON file: scripts/output/salon-export-<storeId>.json
#
# Usage:
#   STORE_ID=2 ./scripts/export-salon.sh
#
# Optional env:
#   DATABASE_URL   Override DB URL (default: loaded from /etc/certxa.env)
#   PSQL_BIN       Override psql binary (default: psql)
#   OUTPUT_DIR     Override output dir (default: scripts/output)
#
# Sections exported:
#   - business_hours
#   - services
#   - addons
#   - staff
#   - staff_services (capabilities)
#   - staff_availability (weekly rules)
#   - appointments (from now to now+7 days)

set -euo pipefail

store_id=${STORE_ID:-}
if [[ -z "$store_id" ]]; then
  echo "STORE_ID is required" >&2
  exit 1
fi

psql_bin=${PSQL_BIN:-psql}
output_dir=${OUTPUT_DIR:-"scripts/output"}

# Hard-coded from /etc/certxa.env
DATABASE_URL="postgresql://certxausr_1:nVKha1ijDky6VoPegow9GyZykgCQ5hiO@localhost:5432/certxadata_1"

mkdir -p "$output_dir"
outfile="$output_dir/${store_id}.json"

now_ts="$(date -Iseconds)"

read -r -d '' sql <<'EOSQL'
WITH
bh AS (
  SELECT row_to_json(b) AS row
  FROM (
    SELECT id, store_id, day_of_week, open_time, close_time, is_closed
    FROM business_hours WHERE store_id = :store_id
    ORDER BY day_of_week
  ) b
),
sv AS (
  SELECT row_to_json(s) AS row
  FROM (
    SELECT id, store_id, name, description, duration, price, category, category_id, image_url, deposit_required, deposit_amount
    FROM services WHERE store_id = :store_id
    ORDER BY id
  ) s
),
ad AS (
  SELECT row_to_json(a) AS row
  FROM (
    SELECT id, store_id, name, description, price, duration, image_url
    FROM addons WHERE store_id = :store_id
    ORDER BY id
  ) a
),
st AS (
  SELECT row_to_json(s) AS row
  FROM (
    SELECT id, store_id, name, email, phone, role, bio, color, avatar_url, commission_enabled, commission_rate
    FROM staff WHERE store_id = :store_id
    ORDER BY id
  ) s
),
stsvc AS (
  SELECT row_to_json(ss) AS row
  FROM (
    SELECT staff_id, service_id
    FROM staff_services WHERE store_id = :store_id
    ORDER BY staff_id, service_id
  ) ss
),
stavail AS (
  SELECT row_to_json(sa) AS row
  FROM (
    SELECT id, staff_id, day_of_week, start_time, end_time
    FROM staff_availability WHERE staff_id IN (SELECT id FROM staff WHERE store_id = :store_id)
    ORDER BY staff_id, day_of_week
  ) sa
),
ap AS (
  SELECT row_to_json(a) AS row
  FROM (
    SELECT id, store_id, customer_id, staff_id, service_id, status, date, duration, notes
    FROM appointments
    WHERE store_id = :store_id
      AND date >= now()
      AND date < now() + interval '7 days'
    ORDER BY date
  ) a
)
SELECT json_build_object(
  'generated_at', now(),
  'store_id', :store_id,
  'business_hours', COALESCE((SELECT json_agg(row) FROM bh), '[]'::json),
  'services', COALESCE((SELECT json_agg(row) FROM sv), '[]'::json),
  'addons', COALESCE((SELECT json_agg(row) FROM ad), '[]'::json),
  'staff', COALESCE((SELECT json_agg(row) FROM st), '[]'::json),
  'staff_services', COALESCE((SELECT json_agg(row) FROM stsvc), '[]'::json),
  'staff_availability', COALESCE((SELECT json_agg(row) FROM stavail), '[]'::json),
  'appointments_next_7d', COALESCE((SELECT json_agg(row) FROM ap), '[]'::json)
) AS payload;
EOSQL

# Replace :store_id placeholders for psql on-the-fly
sql_rendered=$(echo "$sql" | sed "s/:store_id/${store_id}/g")

echo "Exporting store ${store_id} to ${outfile} ..."
$psql_bin "$DATABASE_URL" -t -A -c "$sql_rendered" > "$outfile"
echo "Done. Wrote ${outfile}"

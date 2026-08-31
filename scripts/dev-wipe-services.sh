#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# DEV / TEST ONLY — wipe every service category + service for one store.
#
# Deletes:  service_categories, services  (for the given store)
# Cleans:   service_options, service_addons, staff_services  (child rows deleted)
#           appointments.service_id, intake_forms.service_id, waitlist.service_id,
#           staff_work_photos.service_id  (set to NULL — rows kept)
#           service_review_matches  (removed via ON DELETE CASCADE)
#
# All in a single transaction. Reads DATABASE_URL from /etc/certxa.env.
#
# Usage:
#   ./scripts/dev-wipe-services.sh                # dry-run against store 2
#   ./scripts/dev-wipe-services.sh --yes          # execute against store 2
#   ./scripts/dev-wipe-services.sh --store 2 --yes
# ─────────────────────────────────────────────────────────────────────────────

ENV_FILE=/etc/certxa.env
STORE_ID=2
DRY_RUN=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)   DRY_RUN=false; shift ;;
    --store) STORE_ID="$2"; shift 2 ;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if ! [[ "$STORE_ID" =~ ^[0-9]+$ ]]; then
  echo "Error: --store must be a number (got '$STORE_ID')" >&2
  exit 1
fi

if [ ! -r "$ENV_FILE" ]; then
  echo "Error: cannot read $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL_LINE=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 || true)
DATABASE_URL=${DATABASE_URL_LINE#DATABASE_URL=}
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi
export DATABASE_URL

# psql interpolates :store only for stdin/-f input (not -c), so every query
# below is fed on stdin.
run_sql() { psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 -v store="$STORE_ID" "$@"; }

echo "Store ................ $STORE_ID"
echo "Mode ................. $([ "$DRY_RUN" = true ] && echo 'DRY RUN (no changes)' || echo 'EXECUTE')"
echo

run_sql <<'SQL'
SELECT 'categories to delete'      AS what, count(*) FROM service_categories WHERE store_id = :store
UNION ALL SELECT 'services to delete',        count(*) FROM services WHERE store_id = :store
UNION ALL SELECT 'service_options to delete', count(*) FROM service_options WHERE service_id IN (SELECT id FROM services WHERE store_id = :store)
UNION ALL SELECT 'service_addons to delete',  count(*) FROM service_addons  WHERE service_id IN (SELECT id FROM services WHERE store_id = :store)
UNION ALL SELECT 'staff_services to delete',  count(*) FROM staff_services  WHERE service_id IN (SELECT id FROM services WHERE store_id = :store)
UNION ALL SELECT 'appointments to unlink',    count(*) FROM appointments    WHERE service_id IN (SELECT id FROM services WHERE store_id = :store);
SQL

if [ "$DRY_RUN" = true ]; then
  echo
  echo "Dry-run only. Re-run with --yes to apply."
  exit 0
fi

echo
run_sql <<'SQL'
BEGIN;

CREATE TEMP TABLE _svc ON COMMIT DROP AS
  SELECT id FROM services WHERE store_id = :store;

-- Nullable FKs → keep the row, drop the link
UPDATE appointments      SET service_id = NULL WHERE service_id IN (SELECT id FROM _svc);
UPDATE intake_forms      SET service_id = NULL WHERE service_id IN (SELECT id FROM _svc);
UPDATE waitlist          SET service_id = NULL WHERE service_id IN (SELECT id FROM _svc);
UPDATE staff_work_photos SET service_id = NULL WHERE service_id IN (SELECT id FROM _svc);

-- NOT NULL child rows → delete
DELETE FROM service_options WHERE service_id IN (SELECT id FROM _svc);
DELETE FROM service_addons  WHERE service_id IN (SELECT id FROM _svc);
DELETE FROM staff_services  WHERE service_id IN (SELECT id FROM _svc);
-- service_review_matches is ON DELETE CASCADE — handled automatically

-- The targets
DELETE FROM services           WHERE store_id = :store;
DELETE FROM service_categories WHERE store_id = :store;

COMMIT;
SQL

echo
echo "Done. Post-wipe counts:"
run_sql <<'SQL'
SELECT 'categories' AS what, count(*) FROM service_categories WHERE store_id = :store
UNION ALL SELECT 'services', count(*) FROM services WHERE store_id = :store;
SQL

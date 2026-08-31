#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Rebuild the catalog from the nail-salon template (migration 0152).
#
# This database has a single account (store_id = 2), so the wipe clears the
# catalog tables outright rather than filtering by store_id — earlier catalog
# rows were imported with an inconsistent / NULL store_id and a store-scoped
# delete missed them.
#
#   1. DELETES, unconditionally, every row of:
#        appointment_addons
#        service_nail_art_effects, service_nail_art_applications,
#        service_nail_shapes, service_nail_sizes, nail_service_configs
#        service_addons, service_options, staff_services
#        services, service_categories, addons
#        nail_art_effects, nail_art_applications, nail_shapes, nail_sizes
#      Nullable service_id references on appointments / intake_forms / waitlist /
#      staff_work_photos are set to NULL (rows kept — appointments are heavily
#      referenced by sms_log, ai_call_log, payments, etc). pos_grid_slots.service_id
#      is ON DELETE SET NULL and clears itself.
#   2. RE-SEEDS store <id> (default 2) from nailSalonCatalog.ts via
#      seedNailSalonCatalog(storeId).
#
# Dry-run unless --yes. Reads DATABASE_URL from /etc/certxa.env.
#
# ⚠  DESTRUCTIVE and NOT store-scoped. Only safe on a single-account database.
#
# Usage:
#   ./scripts/rebuild-store2-nail-catalog.sh                 # dry-run
#   ./scripts/rebuild-store2-nail-catalog.sh --yes           # wipe + reseed store 2
#   ./scripts/rebuild-store2-nail-catalog.sh --store 2 --yes
#   ./scripts/rebuild-store2-nail-catalog.sh --yes --skip-wipe   # re-seed only
# ─────────────────────────────────────────────────────────────────────────────

ENV_FILE=/etc/certxa.env
STORE_ID=2
DRY_RUN=true
SKIP_WIPE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)       DRY_RUN=false; shift ;;
    --store)     STORE_ID="$2"; shift 2 ;;
    --skip-wipe) SKIP_WIPE=true; shift ;;
    -h|--help)   grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

[[ "$STORE_ID" =~ ^[0-9]+$ ]] || { echo "Error: --store must be a number (got '$STORE_ID')" >&2; exit 1; }
[ -r "$ENV_FILE" ] || { echo "Error: cannot read $ENV_FILE" >&2; exit 1; }

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | sed 's/^DATABASE_URL=//')
[ -n "$DATABASE_URL" ] || { echo "Error: DATABASE_URL not found in $ENV_FILE" >&2; exit 1; }
export DATABASE_URL

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run_sql() { psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }

echo "Reseed target store ... $STORE_ID"
echo "Mode .................. $([ "$DRY_RUN" = true ] && echo 'DRY RUN (no changes)' || echo 'EXECUTE')"
echo "Wipe ................. $([ "$SKIP_WIPE" = true ] && echo 'skipped (--skip-wipe)' || echo 'ENTIRE catalog (all rows)')"
echo

# guard: refuse to run the unconditional wipe if more than one account exists
ACCOUNTS=$(run_sql -Atc "SELECT count(*) FROM locations;")
echo "locations rows ....... $ACCOUNTS"
if [ "$SKIP_WIPE" = false ] && [ "$ACCOUNTS" != "1" ]; then
  echo
  echo "✗ Refusing to run an unconditional wipe: expected exactly 1 account, found $ACCOUNTS."
  echo "  Re-scope this script to a store_id before running on a multi-account database."
  exit 1
fi
echo

if [ "$SKIP_WIPE" = false ]; then
  echo "── Rows that will be deleted ──────────────────────────────────────────"
  run_sql <<'SQL'
SELECT 'service_categories'    AS table, count(*) FROM service_categories
UNION ALL SELECT 'services',             count(*) FROM services
UNION ALL SELECT 'addons',               count(*) FROM addons
UNION ALL SELECT 'service_addons',       count(*) FROM service_addons
UNION ALL SELECT 'service_options',      count(*) FROM service_options
UNION ALL SELECT 'staff_services',       count(*) FROM staff_services
UNION ALL SELECT 'appointment_addons',   count(*) FROM appointment_addons
UNION ALL SELECT 'appointments (service_id → NULL, kept)', count(*) FROM appointments WHERE service_id IS NOT NULL
UNION ALL SELECT 'nail_sizes',           count(*) FROM nail_sizes
UNION ALL SELECT 'nail_shapes',          count(*) FROM nail_shapes
UNION ALL SELECT 'nail_art_applications', count(*) FROM nail_art_applications
UNION ALL SELECT 'nail_art_effects',     count(*) FROM nail_art_effects
UNION ALL SELECT 'nail_service_configs', count(*) FROM nail_service_configs
ORDER BY 1;
SQL
  echo
fi

if [ "$DRY_RUN" = true ]; then
  echo "Dry-run only. Re-run with --yes to wipe and re-seed."
  exit 0
fi

if [ "$SKIP_WIPE" = false ]; then
  echo "── Wiping catalog ────────────────────────────────────────────────────"
  run_sql <<'SQL'
BEGIN;

-- children of appointments / addons
DELETE FROM appointment_addons;

-- nail configuration
DELETE FROM service_nail_art_effects;
DELETE FROM service_nail_art_applications;
DELETE FROM service_nail_shapes;
DELETE FROM service_nail_sizes;
DELETE FROM nail_service_configs;

-- classic catalog child rows
DELETE FROM service_addons;
DELETE FROM service_options;
DELETE FROM staff_services;

-- nullable service references kept (rows retained, link cleared)
UPDATE appointments      SET service_id = NULL WHERE service_id IS NOT NULL;
UPDATE intake_forms      SET service_id = NULL WHERE service_id IS NOT NULL;
UPDATE waitlist          SET service_id = NULL WHERE service_id IS NOT NULL;
UPDATE staff_work_photos SET service_id = NULL WHERE service_id IS NOT NULL;

-- the catalog itself
DELETE FROM services;
DELETE FROM service_categories;
DELETE FROM addons;

-- store-owned nail vocabularies
DELETE FROM nail_art_effects;
DELETE FROM nail_art_applications;
DELETE FROM nail_shapes;
DELETE FROM nail_sizes;

COMMIT;
SQL
  echo "Wipe complete."
  echo
fi

echo "── Re-seeding store $STORE_ID from nailSalonCatalog.ts ────────────────"
( cd "$REPO_ROOT/artifacts/api-server" && pnpm tsx ../../scripts/seed-store-nail-catalog.ts "$STORE_ID" )

echo
echo "── Post-seed counts ─────────────────────────────────────────────────"
run_sql <<'SQL'
SELECT 'service_categories'     AS table, count(*) FROM service_categories
UNION ALL SELECT 'services',              count(*) FROM services
UNION ALL SELECT 'addons',                count(*) FROM addons
UNION ALL SELECT 'service_addons',        count(*) FROM service_addons
UNION ALL SELECT 'nail_sizes',            count(*) FROM nail_sizes
UNION ALL SELECT 'nail_shapes',           count(*) FROM nail_shapes
UNION ALL SELECT 'nail_art_applications', count(*) FROM nail_art_applications
UNION ALL SELECT 'nail_art_effects',      count(*) FROM nail_art_effects
UNION ALL SELECT 'nail_service_configs',  count(*) FROM nail_service_configs
UNION ALL SELECT 'service_nail_sizes',    count(*) FROM service_nail_sizes
UNION ALL SELECT 'service_nail_shapes',   count(*) FROM service_nail_shapes
UNION ALL SELECT 'service_nail_art_applications', count(*) FROM service_nail_art_applications
UNION ALL SELECT 'service_nail_art_effects',      count(*) FROM service_nail_art_effects
ORDER BY 1;
SQL

echo
echo "Done."

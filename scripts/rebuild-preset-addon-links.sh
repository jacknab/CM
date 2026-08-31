#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Rebuild service_addons links for the preset/template store (default: 2).
#
# The store has add-ons and services but zero service_addons links, so no add-on
# shows as available on any service (and new accounts seeded from this store
# inherit that). This rebuilds the links from a keyword mapping:
#
#   Service groups (by category):
#     HANDS = Manicures, Acrylic Ext, Enhancements, Nail Art, Combos
#     FEET  = Pedicures, Combos
#     (Waxing gets no add-ons)
#
#   Add-on buckets (active add-ons only, matched by name):
#     FEET-only  : Paraffin Foot*, Extended Foot Massage*, Callus Treatment*
#     HANDS-only : French Tips*, French Manicure* (not "Hands & Toes"), "French",
#                  Nail Art*, Hand Design*, Chrome/Mirror*, Ombre/Gradient*,
#                  Extra Length*, Paraffin Hand*, Hot Oil Cuticle*,
#                  Hand Massage*, Nail Strengthening*
#     UNIVERSAL  : every other active add-on except "Lash Removal*"
#                  (polish/removal/scrub/repair/"Hands & Toes" items)
#
#   Links created:
#     HANDS services × (HANDS-only ∪ UNIVERSAL)
#     FEET  services × (FEET-only  ∪ UNIVERSAL)
#
# Idempotent — re-running only inserts links that don't already exist.
# Reads DATABASE_URL from /etc/certxa.env.
#
# Usage:
#   ./scripts/rebuild-preset-addon-links.sh            # dry-run against store 2
#   ./scripts/rebuild-preset-addon-links.sh --yes      # apply
#   ./scripts/rebuild-preset-addon-links.sh --store 2 --yes
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

[[ "$STORE_ID" =~ ^[0-9]+$ ]] || { echo "Error: --store must be a number" >&2; exit 1; }
[ -r "$ENV_FILE" ] || { echo "Error: cannot read $ENV_FILE" >&2; exit 1; }

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | sed 's/^DATABASE_URL=//')
[ -n "$DATABASE_URL" ] || { echo "Error: DATABASE_URL not found in $ENV_FILE" >&2; exit 1; }
export DATABASE_URL

run_sql() { psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 -v store="$STORE_ID" "$@"; }

# Shared CTE defining the buckets + the target link set.
read -r -d '' BUCKETS <<'SQL' || true
WITH svc_hands AS (
  SELECT id FROM services
  WHERE store_id = :store
    AND category IN ('Manicures','Acrylic Ext','Enhancements','Nail Art','Combos')
),
svc_feet AS (
  SELECT id FROM services
  WHERE store_id = :store AND category IN ('Pedicures','Combos')
),
addon_feet AS (
  SELECT id FROM addons
  WHERE store_id = :store AND is_active
    AND ( name ILIKE 'Paraffin Foot%'
       OR name ILIKE 'Extended Foot Massage%'
       OR name ILIKE 'Callus Treatment%' )
),
addon_hands AS (
  SELECT id FROM addons
  WHERE store_id = :store AND is_active
    AND ( name ILIKE 'French Tips%'
       OR (name ILIKE 'French Manicure%' AND name NOT ILIKE '%Hands & Toes%')
       OR name = 'French'
       OR name ILIKE 'Nail Art%'
       OR name ILIKE 'Hand Design%'
       OR name ILIKE 'Chrome/Mirror%'
       OR name ILIKE 'Ombre/Gradient%'
       OR name ILIKE 'Extra Length%'
       OR name ILIKE 'Paraffin Hand%'
       OR name ILIKE 'Hot Oil Cuticle%'
       OR name ILIKE 'Hand Massage%'
       OR name ILIKE 'Nail Strengthening%' )
),
addon_universal AS (
  SELECT id FROM addons
  WHERE store_id = :store AND is_active
    AND name NOT ILIKE 'Lash Removal%'
    AND id NOT IN (SELECT id FROM addon_feet)
    AND id NOT IN (SELECT id FROM addon_hands)
),
target AS (
  SELECT s.id AS service_id, a.id AS addon_id FROM svc_hands s CROSS JOIN addon_hands a
  UNION
  SELECT s.id, a.id FROM svc_feet  s CROSS JOIN addon_feet a
  UNION
  SELECT s.id, a.id FROM svc_hands s CROSS JOIN addon_universal a
  UNION
  SELECT s.id, a.id FROM svc_feet  s CROSS JOIN addon_universal a
)
SQL

echo "Store ....... $STORE_ID"
echo "Mode ........ $([ "$DRY_RUN" = true ] && echo 'DRY RUN (no changes)' || echo 'APPLY')"
echo

run_sql <<SQL
$BUCKETS
SELECT 'HANDS services'      AS bucket, count(*) FROM svc_hands
UNION ALL SELECT 'FEET services',        count(*) FROM svc_feet
UNION ALL SELECT 'addon: FEET-only',     count(*) FROM addon_feet
UNION ALL SELECT 'addon: HANDS-only',    count(*) FROM addon_hands
UNION ALL SELECT 'addon: UNIVERSAL',     count(*) FROM addon_universal
UNION ALL SELECT 'target links (total)', count(*) FROM target
UNION ALL SELECT 'already linked',       count(*) FROM service_addons sa
            WHERE EXISTS (SELECT 1 FROM target t WHERE t.service_id=sa.service_id AND t.addon_id=sa.addon_id)
UNION ALL SELECT 'links to be inserted', count(*) FROM target t
            WHERE NOT EXISTS (SELECT 1 FROM service_addons sa WHERE sa.service_id=t.service_id AND sa.addon_id=t.addon_id);
SQL

if [ "$DRY_RUN" = true ]; then
  echo
  echo "Sample of links that would be created (first 30):"
  run_sql <<SQL
$BUCKETS
SELECT sv.category, sv.name AS service, ad.name AS addon
FROM target t
JOIN services sv ON sv.id = t.service_id
JOIN addons   ad ON ad.id = t.addon_id
WHERE NOT EXISTS (SELECT 1 FROM service_addons sa WHERE sa.service_id=t.service_id AND sa.addon_id=t.addon_id)
ORDER BY sv.category, sv.name, ad.name
LIMIT 30;
SQL
  echo
  echo "Dry-run only. Re-run with --yes to apply."
  exit 0
fi

echo
run_sql <<SQL
BEGIN;
$BUCKETS
INSERT INTO service_addons (service_id, addon_id)
SELECT t.service_id, t.addon_id FROM target t
WHERE NOT EXISTS (
  SELECT 1 FROM service_addons sa
  WHERE sa.service_id = t.service_id AND sa.addon_id = t.addon_id
);
COMMIT;
SQL

echo
echo "Done. Post-run link count for store $STORE_ID:"
run_sql -Atc "SELECT count(*) FROM service_addons sa JOIN services s ON s.id=sa.service_id WHERE s.store_id=$STORE_ID;"

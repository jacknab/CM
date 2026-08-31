#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Merge the exact-name duplicate add-on rows on the preset store (store 2).
# These came from repeated catalogue imports and now show twice in a service's
# add-on picker.
#
#   Keep 29  "Callus Treatment"  ($10/10m, has appointment history)  ← drop 212
#   Keep 222 "French Manicure"   ($25/15m, active)                   ← drop 211 (inactive)
#   Keep 209 "Hand Design"       ($10/10m)                           ← drop 220 (0-min bug)
#   Keep 210 "Polish Change"     ($15/20m)                           ← drop 221
#
# For each pair: repoint service_addons + appointment_addons + any
# parent_addon_id from the loser to the keeper (skipping links that would
# duplicate an existing keeper link), then delete the loser add-on row.
#
# Not touched (distinct names, kept on purpose):
#   "Nail Repair" vs "Nail Repair (per nail)"
#   "French" / "French Tips" / "French Manicure" / "French Manicure (Hands & Toes)"
#   "Polish Change" vs "Polish Change (Hands & Toes)"
#
# Idempotent. Reads DATABASE_URL from /etc/certxa.env.
#
# Usage:
#   ./scripts/dedupe-preset-addons.sh          # dry-run
#   ./scripts/dedupe-preset-addons.sh --yes    # apply
# ─────────────────────────────────────────────────────────────────────────────

ENV_FILE=/etc/certxa.env
DRY_RUN=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) DRY_RUN=false; shift ;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

[ -r "$ENV_FILE" ] || { echo "Error: cannot read $ENV_FILE" >&2; exit 1; }
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | sed 's/^DATABASE_URL=//')
[ -n "$DATABASE_URL" ] || { echo "Error: DATABASE_URL not found" >&2; exit 1; }
export DATABASE_URL
run_sql() { psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }

# loser -> keeper pairs
PAIRS="(212,29),(211,222),(220,209),(221,210)"
LOSERS="212,211,220,221"

echo "Mode ... $([ "$DRY_RUN" = true ] && echo 'DRY RUN (no changes)' || echo 'APPLY')"
echo

run_sql <<SQL
SELECT a.id, a.name, a.price, a.is_active,
       (SELECT count(*) FROM service_addons     sa WHERE sa.addon_id = a.id) AS service_links,
       (SELECT count(*) FROM appointment_addons aa WHERE aa.addon_id = a.id) AS appt_links,
       CASE WHEN a.id IN ($LOSERS) THEN 'DROP' ELSE 'keep' END AS action
FROM addons a
WHERE a.id IN (29,212,222,211,209,220,210,221)
ORDER BY a.name, a.id;
SQL

if [ "$DRY_RUN" = true ]; then
  echo
  echo "service_addons links that would move to the keeper vs be dropped as redundant:"
  run_sql <<SQL
WITH d(loser,keeper) AS (VALUES $PAIRS)
SELECT d.loser, d.keeper,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM service_addons s2 WHERE s2.service_id = sa.service_id AND s2.addon_id = d.keeper)) AS will_move,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM service_addons s2 WHERE s2.service_id = sa.service_id AND s2.addon_id = d.keeper)) AS will_drop
FROM service_addons sa JOIN d ON sa.addon_id = d.loser
GROUP BY d.loser, d.keeper ORDER BY d.loser;
SQL
  echo
  echo "Totals now:  addons=$(run_sql -Atc "SELECT count(*) FROM addons WHERE store_id=2")  service_addons=$(run_sql -Atc "SELECT count(*) FROM service_addons sa JOIN services s ON s.id=sa.service_id WHERE s.store_id=2")"
  echo "Dry-run only. Re-run with --yes to apply."
  exit 0
fi

echo
run_sql <<SQL
BEGIN;

UPDATE service_addons sa
SET addon_id = d.keeper
FROM (VALUES $PAIRS) AS d(loser, keeper)
WHERE sa.addon_id = d.loser
  AND NOT EXISTS (SELECT 1 FROM service_addons s2
                  WHERE s2.service_id = sa.service_id AND s2.addon_id = d.keeper);

DELETE FROM service_addons WHERE addon_id IN ($LOSERS);

UPDATE appointment_addons aa
SET addon_id = d.keeper
FROM (VALUES $PAIRS) AS d(loser, keeper)
WHERE aa.addon_id = d.loser;

UPDATE addons a
SET parent_addon_id = d.keeper
FROM (VALUES $PAIRS) AS d(loser, keeper)
WHERE a.parent_addon_id = d.loser;

DELETE FROM addons WHERE id IN ($LOSERS);

COMMIT;
SQL

echo
echo "Done. Store 2 now:  addons=$(run_sql -Atc "SELECT count(*) FROM addons WHERE store_id=2")  service_addons=$(run_sql -Atc "SELECT count(*) FROM service_addons sa JOIN services s ON s.id=sa.service_id WHERE s.store_id=2")"
echo "Remaining exact-name add-on duplicates on store 2 (should be empty):"
run_sql -Atc "SELECT name, count(*) FROM addons WHERE store_id=2 GROUP BY name HAVING count(*) > 1 ORDER BY name;"

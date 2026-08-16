#!/usr/bin/env bash
set -euo pipefail

# Delete clients that have no email and no phone but do have a name.
# Reads DATABASE_URL from /etc/certxa.env.
# Usage:
#   ./scripts/delete-empty-clients.sh         # dry-run (shows count + sample)
#   ./scripts/delete-empty-clients.sh --yes   # perform deletion
#   ./scripts/delete-empty-clients.sh --yes --backup /tmp/clients-backup.csv

ENV_FILE=/etc/certxa.env
DRY_RUN=true
BACKUP_FILE=""
STORE_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) DRY_RUN=false; shift ;;
    --backup) BACKUP_FILE="$2"; shift 2 ;;
    --store) STORE_ID="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--yes] [--backup /path/to/backup.csv]"; exit 0 ;;
    *) echo "Unknown arg: $1"; echo "Usage: $0 [--yes] [--backup /path/to/backup.csv]"; exit 1 ;;
  esac
done

if [ ! -r "$ENV_FILE" ]; then
  echo "Error: cannot read $ENV_FILE. Ensure the file exists and is readable." >&2
  exit 1
fi

# Safely extract DATABASE_URL without sourcing arbitrary code.
DATABASE_URL_LINE=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 || true)
if [ -z "$DATABASE_URL_LINE" ]; then
  echo "Error: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=${DATABASE_URL_LINE#DATABASE_URL=}
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is empty in $ENV_FILE" >&2
  exit 1
fi

export DATABASE_URL

read -r -d '' SQL_WHERE <<'SQL' || true
NOT EXISTS (SELECT 1 FROM client_emails ce WHERE ce.client_id = clients.id AND ce.is_primary = true)
  AND NOT EXISTS (SELECT 1 FROM client_phones cp WHERE cp.client_id = clients.id AND cp.is_primary = true)
  AND (COALESCE(full_name,'') != '' OR COALESCE(first_name,'') != '' OR COALESCE(last_name,'') != '')
SQL

STORE_CLAUSE=""
if [ -n "$STORE_ID" ]; then
  STORE_CLAUSE="AND clients.store_id = ${STORE_ID}"
fi

COUNT_SQL="SELECT COUNT(*) FROM clients WHERE ${SQL_WHERE} ${STORE_CLAUSE};"
SAMPLE_SQL="SELECT id, store_id, full_name, first_name, last_name FROM clients WHERE ${SQL_WHERE} ${STORE_CLAUSE} ORDER BY id LIMIT 50;"

echo "Connecting to database..."
echo "Dry run: $DRY_RUN"

echo "Counting matching client rows..."
COUNT=$(psql "$DATABASE_URL" --no-psqlrc -qAt -c "$COUNT_SQL")
echo "Matching clients: $COUNT"

if [ "$COUNT" -eq 0 ]; then
  echo "No matching clients found. Nothing to do.";
  exit 0
fi

echo
echo "Sample rows (up to 50):"
psql "$DATABASE_URL" --no-psqlrc -c "$SAMPLE_SQL"

if [ -n "$BACKUP_FILE" ]; then
  echo
  echo "Writing backup CSV of matching client ids to: $BACKUP_FILE"
  psql "$DATABASE_URL" --no-psqlrc -c "COPY (SELECT id, full_name, first_name, last_name FROM clients WHERE ${SQL_WHERE} ORDER BY id) TO STDOUT WITH CSV HEADER" > "$BACKUP_FILE"
  echo "Backup written.";
fi

if [ "$DRY_RUN" = true ]; then
  echo
  echo "Dry-run complete. To perform deletion, re-run with --yes."
  exit 0
fi

echo
echo "Performing deletion of $COUNT clients..."
read -p "Are you sure you want to DELETE these rows? Type DELETE to confirm: " CONFIRM
if [ "$CONFIRM" != "DELETE" ]; then
  echo "Confirmation failed. Abort."; exit 1
fi

DELETE_SQL="BEGIN; DELETE FROM clients WHERE ${SQL_WHERE}; COMMIT;"
psql "$DATABASE_URL" --no-psqlrc -c "$DELETE_SQL"

echo "Deletion complete. Deleted $COUNT client rows (if no concurrent changes)."

#!/usr/bin/env bash
# =============================================================================
# cleanup-ghost-clients.sh
#
# Removes client records that have no phone number AND no email address.
# A client must have at least one entry in client_phones OR client_emails
# to be kept.  All child rows (phones, emails, addresses, notes, tags,
# loyalty events, etc.) are removed via ON DELETE CASCADE automatically.
#
# Safe to run multiple times — idempotent.
# Called automatically by deploy.sh after DB migrations.
#
# Usage (standalone):
#   DATABASE_URL=postgres://... bash scripts/cleanup-ghost-clients.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[cleanup-ghost-clients]${NC} $*"; }
success() { echo -e "${GREEN}[cleanup-ghost-clients]${NC} $*"; }
warn()    { echo -e "${YELLOW}[cleanup-ghost-clients]${NC} $*"; }
error()   { echo -e "${RED}[cleanup-ghost-clients]${NC} $*" >&2; exit 1; }

[[ -z "${DATABASE_URL:-}" ]] && error "DATABASE_URL is not set."

info "Scanning for ghost clients (no phone AND no email)..."

# ── Count before ─────────────────────────────────────────────────────────────
read -r TOTAL_CLIENTS GHOST_COUNT < <(psql "$DATABASE_URL" -tAc "
  SELECT
    (SELECT COUNT(*) FROM clients)::text,
    (
      SELECT COUNT(*)
      FROM   clients c
      WHERE  NOT EXISTS (
               SELECT 1 FROM client_phones cp WHERE cp.client_id = c.id
             )
        AND  NOT EXISTS (
               SELECT 1 FROM client_emails ce WHERE ce.client_id = c.id
             )
    )::text;
" | tr '|' ' ')

info "Total clients : $TOTAL_CLIENTS"
info "Ghost clients : $GHOST_COUNT  (no phone AND no email)"

if [[ "$GHOST_COUNT" -eq 0 ]]; then
  success "Nothing to clean up — all clients have at least one contact method."
  exit 0
fi

warn "Deleting $GHOST_COUNT ghost client(s)..."

# ── Delete + report per-store breakdown ──────────────────────────────────────
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'EOSQL'
DO $$
DECLARE
  r         RECORD;
  del_count INTEGER;
  total_del INTEGER := 0;
BEGIN
  -- Per-store breakdown (informational)
  FOR r IN
    SELECT l.name AS store_name, COUNT(c.id) AS cnt
    FROM   clients c
    JOIN   locations l ON l.id = c.store_id
    WHERE  NOT EXISTS (SELECT 1 FROM client_phones cp WHERE cp.client_id = c.id)
      AND  NOT EXISTS (SELECT 1 FROM client_emails ce WHERE ce.client_id = c.id)
    GROUP  BY l.name
    ORDER  BY cnt DESC
  LOOP
    RAISE NOTICE '  Store "%" — % ghost client(s) to remove', r.store_name, r.cnt;
  END LOOP;
END $$;
EOSQL

# ── Perform the deletion ──────────────────────────────────────────────────────
DELETED=$(psql "$DATABASE_URL" -tAc "
WITH deleted AS (
  DELETE FROM clients
  WHERE  NOT EXISTS (
           SELECT 1 FROM client_phones cp WHERE cp.client_id = clients.id
         )
    AND  NOT EXISTS (
           SELECT 1 FROM client_emails ce WHERE ce.client_id = clients.id
         )
  RETURNING id
)
SELECT COUNT(*) FROM deleted;
" | tr -d '[:space:]')

success "Deleted $DELETED ghost client record(s).  All child rows removed via CASCADE."

# ── Verify ────────────────────────────────────────────────────────────────────
REMAINING=$(psql "$DATABASE_URL" -tAc "
  SELECT COUNT(*)
  FROM   clients c
  WHERE  NOT EXISTS (SELECT 1 FROM client_phones cp WHERE cp.client_id = c.id)
    AND  NOT EXISTS (SELECT 1 FROM client_emails ce WHERE ce.client_id = c.id);
" | tr -d '[:space:]')

if [[ "$REMAINING" -eq 0 ]]; then
  success "Verification passed — 0 ghost clients remain."
else
  warn "Verification: $REMAINING ghost client(s) still present (may have been inserted concurrently)."
fi

#!/usr/bin/env bash
# =============================================================================
# cleanup-ghost-clients.sh
#
# Removes client records that have no phone number AND no email address.
# Handles both the legacy `customers` table (email/phone columns directly
# on the record) and the new `clients` table (normalized into
# client_phones / client_emails).
#
# A client must have at least one entry in client_phones OR client_emails
# (new schema) or a non-NULL email/phone (legacy schema) to be kept.
# All child rows are removed via ON DELETE CASCADE automatically.
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

TOTAL_LEGACY=0
GHOST_LEGACY=0
TOTAL_NEW=0
GHOST_NEW=0
DELETED_LEGACY=0
DELETED_NEW=0

# ── Legacy customers table (email/phone columns directly on the record) ──
if psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.customers') IS NOT NULL" 2>/dev/null | grep -q '^t'; then
  info "Legacy 'customers' table found — checking for ghost clients..."

  read -r TOTAL_LEGACY GHOST_LEGACY < <(psql "$DATABASE_URL" -tAc "
    SELECT
      (SELECT COUNT(*) FROM customers)::text,
      (
        SELECT COUNT(*)
        FROM   customers
        WHERE  email IS NULL
          AND  phone IS NULL
      )::text;
  " | tr '|' ' ')

  info "Legacy customers : $TOTAL_LEGACY"
  info "Legacy ghost     : $GHOST_LEGACY  (no email AND no phone)"

  if [[ "$GHOST_LEGACY" -gt 0 ]]; then
    warn "Deleting $GHOST_LEGACY legacy ghost client(s) from customers table..."

    # The legacy customers table has FK references from appointments,
    # gift_cards, reviews, etc. without CASCADE.  We delete child rows
    # that reference ghost customers first, then remove the ghost clients.
    DELETED_LEGACY=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "
      WITH ghost_ids AS (
        SELECT id FROM customers
        WHERE  email IS NULL
          AND  phone IS NULL
      ),
      _appointments AS (
        DELETE FROM appointments
        WHERE  customer_id IN (SELECT id FROM ghost_ids)
      ),
      _gift_cards_purchased AS (
        DELETE FROM gift_cards
        WHERE  purchased_by_customer_id IN (SELECT id FROM ghost_ids)
      ),
      _gift_cards_recipient AS (
        DELETE FROM gift_cards
        WHERE  recipient_customer_id IN (SELECT id FROM ghost_ids)
      ),
      _reviews AS (
        DELETE FROM reviews
        WHERE  customer_id IN (SELECT id FROM ghost_ids)
      ),
      _loyalty AS (
        DELETE FROM loyalty_transactions
        WHERE  customer_id IN (SELECT id FROM ghost_ids)
      ),
      _waitlist AS (
        DELETE FROM waitlist
        WHERE  customer_id IN (SELECT id FROM ghost_ids)
      ),
      _intake AS (
        DELETE FROM intake_form_responses
        WHERE  customer_id IN (SELECT id FROM ghost_ids)
      ),
      _sms_log AS (
        DELETE FROM sms_log
        WHERE  customer_id IN (SELECT id FROM ghost_ids)
      ),
      _google_reviews AS (
        DELETE FROM google_reviews
        WHERE  customer_id IN (SELECT id FROM ghost_ids)
      ),
      deleted AS (
        DELETE FROM customers
        WHERE  id IN (SELECT id FROM ghost_ids)
        RETURNING id
      )
      SELECT COUNT(*) FROM deleted;
    " | tr -d '[:space:]')

    success "Deleted $DELETED_LEGACY legacy ghost client record(s) from customers table."
  else
    success "No ghost clients found in legacy customers table."
  fi
else
  info "Legacy 'customers' table not found — skipping."
fi

# ── New clients table (normalized client_phones / client_emails) ──────────
if psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.clients') IS NOT NULL" 2>/dev/null | grep -q '^t'; then
  info "New 'clients' table found — checking for ghost clients..."

  read -r TOTAL_NEW GHOST_NEW < <(psql "$DATABASE_URL" -tAc "
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

  info "New clients : $TOTAL_NEW"
  info "New ghost   : $GHOST_NEW  (no phone AND no email)"

  if [[ "$GHOST_NEW" -eq 0 ]]; then
    success "No ghost clients found in new clients table."
  else
    warn "Deleting $GHOST_NEW ghost client(s) from clients table..."

    # ── Per-store breakdown (informational) ──────────────────────────
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'EOSQL'
DO $$
DECLARE
  r         RECORD;
BEGIN
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

    # ── Perform the deletion ──────────────────────────────────────────
    DELETED_NEW=$(psql "$DATABASE_URL" -tAc "
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

    success "Deleted $DELETED_NEW ghost client record(s) from clients table.  All child rows removed via CASCADE."

    # ── Verify ────────────────────────────────────────────────────────
    REMAINING=$(psql "$DATABASE_URL" -tAc "
      SELECT COUNT(*)
      FROM   clients c
      WHERE  NOT EXISTS (SELECT 1 FROM client_phones cp WHERE cp.client_id = c.id)
        AND  NOT EXISTS (SELECT 1 FROM client_emails ce WHERE ce.client_id = c.id);
    " | tr -d '[:space:]')

    if [[ "$REMAINING" -eq 0 ]]; then
      success "Verification passed — 0 ghost clients remain in clients table."
    else
      warn "Verification: $REMAINING ghost client(s) still present in clients table (may have been inserted concurrently)."
    fi
  fi
else
  info "New 'clients' table not found — skipping."
fi

# ── Summary ──────────────────────────────────────────────────────────
TOTAL_DELETED=$((GHOST_LEGACY + GHOST_NEW))
if [[ "$TOTAL_DELETED" -eq 0 ]]; then
  success "Done — no ghost clients found in any table."
else
  success "Done — deleted $TOTAL_DELETED ghost client(s) total ($DELETED_LEGACY legacy + $DELETED_NEW new)."
fi

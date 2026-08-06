#!/usr/bin/env bash
# =============================================================================
# Certxa — VPS Migration Drift Repair (one-time run)
#
# Applies the 4 migrations that were recorded as "applied" in schema_migrations
# but whose tables were never actually created on the VPS database. All
# statements are idempotent (IF NOT EXISTS) so this is safe to re-run.
#
# Run from the project root:
#   bash scripts/vps-repair-drift.sh
# =============================================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

log()    { echo -e "${CYAN}[repair]${RESET} $*"; }
ok()     { echo -e "${GREEN}[repair] ✓${RESET} $*"; }
warn()   { echo -e "${YELLOW}[repair] ⚠${RESET}  $*"; }
die()    { echo -e "${RED}[repair] ✗${RESET} $*" >&2; exit 1; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  $*${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

# ── Load environment ──────────────────────────────────────────────────────────
ENV_FILE="/etc/certxa.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
  log "Loaded environment from ${ENV_FILE}."
else
  warn "${ENV_FILE} not found — relying on DATABASE_URL already in environment."
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  die "DATABASE_URL is not set. Cannot connect to the database."
fi

# ── Locate migrations directory ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${PROJECT_ROOT}/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  die "migrations/ directory not found at ${MIGRATIONS_DIR}. Run from project root."
fi

header "Certxa — One-time Migration Drift Repair"
echo ""
echo -e "  These 4 migration files were recorded as applied in ${BOLD}schema_migrations${RESET}"
echo -e "  but their tables were never actually created on this database."
echo -e "  All statements use ${BOLD}IF NOT EXISTS${RESET} — safe to run multiple times."
echo ""

run_migration() {
  local file="$1"
  local desc="$2"
  local path="${MIGRATIONS_DIR}/${file}"

  if [[ ! -f "$path" ]]; then
    warn "${file} not found — skipping."
    return
  fi

  log "Applying ${file} — ${desc}..."
  if psql "$DATABASE_URL" -f "$path" -v ON_ERROR_STOP=0 2>&1 | \
       grep -v "^NOTICE\|^WARNING\|already exists\|^$\|^--" | head -20; then
    ok "${file} applied."
  else
    warn "${file} may have had errors — check output above."
  fi
}

# ── Apply missing migrations ──────────────────────────────────────────────────

header "Step 1 of 4 — VPS schema sync (non-training schema fixes)"
run_migration "0011_vps_schema_sync.sql" \
  "legacy schema catchup + column additions (training tables intentionally removed)"

header "Step 2 of 4 — Support tasks, macros & escalations"
run_migration "0033_support_tasks_macros_escalations.sql" \
  "support_macros, support_tasks, support_escalations"

header "Step 3 of 4 — Data transfer jobs"
run_migration "0043_data_transfer_jobs.sql" \
  "data_transfer_jobs"

header "Step 4 of 4 — Schema drift fixes (includes data_transfer_jobs + store_payment_accounts)"
run_migration "0046_schema_drift_fixes.sql" \
  "data_transfer_jobs (idempotent), store_payment_accounts and other drift fixes"

# ── Verify the key tables now exist ──────────────────────────────────────────
header "Verification"
log "Checking that missing tables now exist in the live DB..."

MISSING=$(psql "$DATABASE_URL" -tAc "
  SELECT t FROM (VALUES
    ('support_macros'),
    ('support_tasks'),
    ('support_escalations'),
    ('data_transfer_jobs')
  ) AS v(t)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = v.t
  )
" 2>/dev/null)

if [[ -z "$MISSING" ]]; then
  ok "All required tables are present in the database."
  echo ""
  echo -e "  ${BOLD}Next step:${RESET} re-run ${BOLD}./deploy.sh${RESET} — the migration drift check should now pass."
  echo ""
else
  warn "Some tables are still missing after repair:"
  echo "$MISSING" | while read -r t; do
    echo -e "    ${RED}✗  ${t}${RESET}"
  done
  echo ""
  warn "Check the output above for psql errors and fix them before re-running deploy.sh."
  echo ""
  exit 1
fi

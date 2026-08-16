#!/usr/bin/env bash
# =============================================================================
# Certxa — Production Deploy Script
# Pulls latest code, installs deps, rebuilds all artifacts,
# runs DB migrations, and restarts services.
#
# Usage (run as the app user or root):
#   bash deploy.sh [OPTIONS]
#
# Options:
#   --app-dir <path>    Repo root (default: directory of this script)
#   --branch <branch>   Git branch to pull (default: main)
#   --skip-pull         Skip git pull (use current code as-is)
#   --skip-db-push      Skip drizzle schema push
#   --skip-install      Skip pnpm install (deps unchanged)
#   --api-only          Rebuild + restart API only (skip frontend builds)
#   --frontend-only     Rebuild frontends + reload nginx only (skip API restart)
#   --check-orphans     Find and kill orphan Node processes only — no pull/build/restart
#   --repair-columns    Restore all sentinel DB columns via ALTER TABLE IF NOT EXISTS, then exit
#   --mobile            After deploy, install Expo deps and launch Staff Mobile for testing
#                       (shows a QR code — scan with Expo Go on your phone)
#   --mobile-only       Skip API/frontend deploy; only (re)start the Staff Mobile Expo server
#   --mobile-port <n>   Expo Metro port on the VPS (default: 8082)
# =============================================================================
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
info()    { echo -e "${BLUE}[$TIMESTAMP][INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[$TIMESTAMP][OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[$TIMESTAMP][WARN]${NC}  $*"; }
error()   { echo -e "${RED}[$TIMESTAMP][ERROR]${NC} $*" >&2; exit 1; }

# ── defaults ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
BRANCH="main"
SKIP_PULL=false
SKIP_DB_PUSH=false
SKIP_INSTALL=false
API_ONLY=false
FRONTEND_ONLY=false
EXPORT_TENANT_DATA=false
TENANT_DATA_OUT=""
ENV_FILE="${ENV_FILE:-/etc/certxa.env}"
CHECK_ORPHANS_ONLY=false
REPAIR_COLUMNS_ONLY=false
SKIP_MIGRATION_CHECK=false
MOBILE=false
MOBILE_ONLY=false
MOBILE_PORT=8083

# ── arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --app-dir)            APP_DIR="$2";              shift 2 ;;
    --branch)             BRANCH="$2";               shift 2 ;;
    --skip-pull)          SKIP_PULL=true;             shift ;;
    --skip-db-push)       SKIP_DB_PUSH=true;          shift ;;
    --skip-install)       SKIP_INSTALL=true;           shift ;;
    --api-only)           API_ONLY=true;               shift ;;
    --frontend-only)      FRONTEND_ONLY=true;          shift ;;
    --export-tenant-data) EXPORT_TENANT_DATA=true;     shift ;;
    --tenant-data-out)    TENANT_DATA_OUT="$2";        shift 2 ;;
    --check-orphans)          CHECK_ORPHANS_ONLY=true;       shift ;;
    --repair-columns)         REPAIR_COLUMNS_ONLY=true;      shift ;;
    --skip-migration-check)   SKIP_MIGRATION_CHECK=true;     shift ;;
    --mobile)                 MOBILE=true;                   shift ;;
    --mobile-only)            MOBILE_ONLY=true; MOBILE=true; shift ;;
    --mobile-port)            MOBILE_PORT="$2";              shift 2 ;;
    *) error "Unknown option: $1" ;;
  esac
done

cd "$APP_DIR"

# ── start_mobile() ────────────────────────────────────────────────────────────
# Installs Expo prerequisites (if needed) and launches the Staff Mobile
# development server with --tunnel so a phone can scan the QR code.
# The API URL is taken from APP_URL in the env file (the VPS public domain).
start_mobile() {
  echo ""
  info "═══════════════════════════════════════════════════"
  info "  Staff Mobile (Expo Go) — VPS test setup"
  info "  Port  : $MOBILE_PORT"
  info "═══════════════════════════════════════════════════"
  echo ""

  # ── prereq: Node.js ────────────────────────────────────────────────────────
  if ! command -v node >/dev/null 2>&1; then
    error "Node.js is not installed. Install Node 20+ before running --mobile."
  fi
  NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
  info "Node.js $NODE_VER detected."

  # ── prereq: pnpm ───────────────────────────────────────────────────────────
  if ! command -v pnpm >/dev/null 2>&1; then
    info "pnpm not found — installing via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
  fi

  # ── install workspace deps (staff-mobile + shared) ─────────────────────────
  info "Installing/verifying staff-mobile dependencies..."
  pnpm install --frozen-lockfile
  success "Dependencies ready."

  # ── install @expo/ngrok for tunnel support (once) ──────────────────────────
  MOBILE_DIR="$APP_DIR/apps/staff-mobile"
  if ! pnpm --filter @workspace/staff-mobile exec expo --version >/dev/null 2>&1; then
    error "Expo CLI not found inside staff-mobile. Run 'pnpm install' first."
  fi
  # Ensure @expo/ngrok is available (required for --tunnel on VPS)
  if ! pnpm --filter @workspace/staff-mobile exec expo install --check @expo/ngrok 2>/dev/null; then
    info "Installing @expo/ngrok for tunnel support..."
    pnpm --filter @workspace/staff-mobile add @expo/ngrok --save-dev
    success "@expo/ngrok installed."
  fi

  # ── derive the API URL ─────────────────────────────────────────────────────
  # On the VPS, APP_URL is the public-facing domain (e.g. https://app.certxa.com).
  # The VPS nginx proxies /api to the API server, so no port is needed.
  MOBILE_API_URL="${APP_URL:-}"
  if [[ -z "$MOBILE_API_URL" ]]; then
    warn "APP_URL is not set in $ENV_FILE — API calls from the mobile app may fail."
    warn "Set APP_URL=https://yourdomain.com in $ENV_FILE and re-run with --mobile."
  else
    success "EXPO_PUBLIC_API_URL=$MOBILE_API_URL  (from APP_URL)"
  fi

  # ── kill any stale Metro / Expo process on this port ──────────────────────
  _STALE_PIDS=$(lsof -ti tcp:"$MOBILE_PORT" 2>/dev/null || true)
  if [[ -n "$_STALE_PIDS" ]]; then
    warn "Port $MOBILE_PORT in use — killing stale process(es): $_STALE_PIDS"
    echo "$_STALE_PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi

  # ── open firewall port (ufw) if present ───────────────────────────────────
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    if ! ufw status | grep -q "$MOBILE_PORT"; then
      info "Opening firewall port $MOBILE_PORT/tcp for Expo Metro..."
      ufw allow "$MOBILE_PORT/tcp" >/dev/null 2>&1 || true
    fi
  fi

  echo ""
  info "Starting Expo with tunnel — scan the QR code below with Expo Go."
  info "Press Ctrl+C to stop the dev server when done testing."
  echo ""

  export EXPO_PUBLIC_API_URL="$MOBILE_API_URL"
  exec pnpm --filter @workspace/staff-mobile exec expo start \
    --port "$MOBILE_PORT" \
    --tunnel \
    --clear
}

# ── --check-orphans early exit ────────────────────────────────────────────────
# Runs ONLY the orphan-kill logic, then exits. No pull / build / restart.
if [[ "$CHECK_ORPHANS_ONLY" == "true" ]]; then
  echo ""
  info "═══════════════════════════════════════════════════"
  info "  --check-orphans mode: scanning for stale Node processes"
  info "═══════════════════════════════════════════════════"
  echo ""

  _ENTRYPOINT="dist/index.mjs"
  # Collect PM2 daemon PID and all PIDs PM2 explicitly manages.
  # PM2 spawns node via an intermediate sh -c wrapper, so the node process is a
  # grandchild of the daemon — checking only direct-parent PID misses it.
  _PM2_PID=""
  _PM2_APP_PIDS=()
  if command -v pm2 >/dev/null 2>&1; then
    _PM2_PID=$(pm2 pid 2>/dev/null | tr -d '[:space:]' || true)
    while IFS= read -r _mpid; do
      [[ -n "$_mpid" ]] && _PM2_APP_PIDS+=("$_mpid")
    done < <(pm2 jlist 2>/dev/null | node -e \
      'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{JSON.parse(d).forEach(p=>{if(p.pid)console.log(p.pid)})}catch(e){}})' \
      2>/dev/null || true)
  fi

  _ORPHAN_PIDS=()
  while IFS= read -r _pid; do
    [[ -z "$_pid" ]] && continue
    _ppid=$(ps -o ppid= -p "$_pid" 2>/dev/null | tr -d '[:space:]' || true)
    # Skip direct child of PM2 daemon
    if [[ -n "$_PM2_PID" && "$_ppid" == "$_PM2_PID" ]]; then continue; fi
    # Skip any PID PM2 explicitly lists as a managed app process (grandchild etc.)
    for _mpid in "${_PM2_APP_PIDS[@]}"; do [[ "$_pid" == "$_mpid" ]] && continue 2; done
    [[ "$_pid" == "$$" ]] && continue
    _ORPHAN_PIDS+=("$_pid")
  done < <(pgrep -f "$_ENTRYPOINT" 2>/dev/null || true)

  if [[ ${#_ORPHAN_PIDS[@]} -eq 0 ]]; then
    success "No orphan Node processes found — nothing to do."
    exit 0
  fi

  warn "Found ${#_ORPHAN_PIDS[@]} orphan Node process(es): ${_ORPHAN_PIDS[*]}"
  for _pid in "${_ORPHAN_PIDS[@]}"; do
    _cmd=$(ps -o args= -p "$_pid" 2>/dev/null || echo "(unknown)")
    warn "  Sending SIGTERM to PID $_pid: $_cmd"
    kill -TERM "$_pid" 2>/dev/null || true
  done
  sleep 5
  for _pid in "${_ORPHAN_PIDS[@]}"; do
    if kill -0 "$_pid" 2>/dev/null; then
      warn "  PID $_pid did not exit — sending SIGKILL"
      kill -KILL "$_pid" 2>/dev/null || true
    fi
  done
  success "Orphan Node process(es) cleared. Run a full deploy to restart the API under PM2."
  exit 0
fi

# Load env file if present (gives us DATABASE_URL etc.)
if [[ -f "$ENV_FILE" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
  set +o allexport
  info "Loaded environment from $ENV_FILE"
fi

[[ -z "${DATABASE_URL:-}" ]] && error "DATABASE_URL is not set. Export it or add it to $ENV_FILE"

# ── --mobile-only early exit ──────────────────────────────────────────────────
# Skip the full deploy and go straight to launching the Expo dev server.
if [[ "$MOBILE_ONLY" == "true" ]]; then
  start_mobile
  exit 0
fi

# ── --repair-columns early exit ───────────────────────────────────────────────
# Runs ADD COLUMN IF NOT EXISTS for every sentinel column, then exits.
# Safe to run at any time — no-ops on columns that already exist.
# Usage: bash deploy.sh --repair-columns
if [[ "$REPAIR_COLUMNS_ONLY" == "true" ]]; then
  echo ""
  info "═══════════════════════════════════════════════════"
  info "  --repair-columns mode: restoring sentinel columns"
  info "═══════════════════════════════════════════════════"
  echo ""

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'EOSQL'
-- support_ticket_messages
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- locations: tax + register float + auto-refill
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_services_taxable   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_addons_taxable      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_products_taxable    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_gift_cards_taxable  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS register_target_float   NUMERIC(10,2);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS auto_refill_enabled     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS auto_refill_threshold   NUMERIC(10,2) NOT NULL DEFAULT 5.00;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS auto_refill_amount      NUMERIC(10,2) NOT NULL DEFAULT 25.00;

-- staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_thumb_url        TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_structure_id  INTEGER;

-- services
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS auto_assigned   BOOLEAN DEFAULT FALSE;

-- appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- calendar_settings
ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

-- sms_settings
ALTER TABLE sms_settings ADD COLUMN IF NOT EXISTS auto_engage_enabled       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sms_settings ADD COLUMN IF NOT EXISTS sms_cancellation_enabled  BOOLEAN NOT NULL DEFAULT TRUE;

-- clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loyalty_points  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes           TEXT;

-- contractors
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(32);

-- client_phones
ALTER TABLE client_phones ADD COLUMN IF NOT EXISTS store_id INTEGER;

-- google_business_profiles (0099 was baseline-seeded without executing)
ALTER TABLE google_business_profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'verified';
ALTER TABLE google_business_profiles ADD COLUMN IF NOT EXISTS postcard_sent_at    TIMESTAMPTZ;
ALTER TABLE google_business_profiles ADD COLUMN IF NOT EXISTS postcard_address    TEXT;

-- locations: onboarding setup flag (0116 was baseline-seeded without executing)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- google_reviews: reviewer photo URL (0126 was baseline-seeded without executing)
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS reviewer_photo_url TEXT;
EOSQL

  echo ""
  success "All sentinel columns restored (ADD COLUMN IF NOT EXISTS — existing columns untouched)."
  info  "Run a column verification to confirm:"
  info  "  bash deploy.sh --skip-pull --skip-install --skip-db-push  (triggers the post-push check)"
  echo ""
  exit 0
fi

# ── record start time for rollback hint ──────────────────────────────────────
DEPLOY_START=$(date +%s)
PREV_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo ""
info "═══════════════════════════════════════════════════"
info "  Certxa deploy starting"
info "  Branch : $BRANCH"
info "  App dir: $APP_DIR"
info "  Commit : $PREV_COMMIT"
info "═══════════════════════════════════════════════════"
echo ""

# ── 1. git pull ───────────────────────────────────────────────────────────────
if [[ "$SKIP_PULL" == "false" ]]; then
  info "Pulling latest code from origin/$BRANCH..."
  git fetch origin
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
  NEW_COMMIT=$(git rev-parse --short HEAD)
  success "Updated $PREV_COMMIT → $NEW_COMMIT"
else
  warn "--skip-pull: using current code ($PREV_COMMIT)"
fi

# ── 2. install dependencies ───────────────────────────────────────────────────
if [[ "$SKIP_INSTALL" == "false" ]]; then
  info "Installing workspace dependencies..."
  pnpm install --frozen-lockfile
  success "Dependencies installed."
fi

# ── 3. database schema push ───────────────────────────────────────────────────
if [[ "$SKIP_DB_PUSH" == "false" ]]; then
  info "Checking for duplicate table definitions across drizzle schema files..."
  if ! pnpm --filter @workspace/scripts run check-schema-sync; then
    error "Schema sync check failed — remove the duplicate pgTable definition(s) shown above from shared/schema/orphaned-tables.ts (or whichever later file re-declares the table)."
  fi
  success "Schema sync check passed."

  # ── 3b-pre. drizzle tablesFilter guard ───────────────────────────────────────
  # Detects tables created by SQL migrations that are NOT defined as pgTable()
  # in any TypeScript schema file AND are not excluded in drizzle.config.cjs
  # tablesFilter.  Such tables would be offered for deletion by drizzle-kit push.
  info "Checking drizzle tablesFilter covers all migration-only tables..."
  if ! APP_DIR="$APP_DIR" MIGRATIONS_DIR="$APP_DIR/migrations" DRIZZLE_CONFIG="$APP_DIR/lib/db/drizzle.config.cjs" \
       pnpm --filter @workspace/scripts run check-drizzle-filter; then
    error "drizzle-filter check FAILED — one or more SQL-migration tables are not excluded \
from drizzle-kit's scope (see above). \
Add the listed \"!<table>\" entries to the tablesFilter in lib/db/drizzle.config.cjs, \
then re-run deploy."
  fi
  success "drizzle-filter check passed."

  # ── 3b-pre2. sequence-guard sync check ───────────────────────────────────────
  # Ensures every table excluded via tablesFilter in drizzle.config.cjs is also
  # present in this script's own `excluded_tables` array below (step 3c). A
  # table missing from excluded_tables will crash drizzle-kit push if it has a
  # SERIAL column, since the crash guard silently skips unlisted tables.
  info "Checking tablesFilter and deploy.sh's sequence-fix guard are in sync..."
  if ! APP_DIR="$APP_DIR" DRIZZLE_CONFIG="$APP_DIR/lib/db/drizzle.config.cjs" DEPLOY_SCRIPT="$APP_DIR/deploy.sh" \
       pnpm --filter @workspace/scripts run check-sequence-guard-sync; then
    error "sequence-guard-sync check FAILED — tablesFilter (drizzle.config.cjs) and \
excluded_tables (deploy.sh) have drifted apart (see above). \
Add the missing entries to whichever list is incomplete, then re-run deploy."
  fi
  success "sequence-guard-sync check passed."

  info "Checking for NOT NULL columns with existing NULL values in live DB..."
  if ! DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run check-nullability; then
    error "Nullability check failed — fix the column(s) above before pushing. drizzle-kit push would crash with a Postgres NOT NULL violation."
  fi
  success "Nullability check passed."

  # ── 3c. Convert SERIAL sequences on excluded tables → GENERATED AS IDENTITY ──
  # drizzle-kit push enumerates ALL standalone sequences in the DB. Sequences
  # created by SERIAL columns on migration-only tables (excluded via
  # tablesFilter in lib/db/drizzle.config.cjs) appear as "orphaned" — drizzle
  # tries to drop them, but the column DEFAULT still references the sequence,
  # causing a crash like: "cannot drop sequence X because other objects depend on it".
  #
  # Fix: convert SERIAL columns on every excluded table to GENERATED ALWAYS AS
  # IDENTITY. Identity columns keep their sequence internal to the column;
  # drizzle-kit does not enumerate it as a standalone object and never tries
  # to drop it.  Fully idempotent — already-converted columns are skipped.
  #
  # KEEP THIS LIST IN SYNC with the tablesFilter in lib/db/drizzle.config.cjs.
  # Add a new entry here whenever you add a "!<table>" to tablesFilter.
  info "Fixing SERIAL sequences on drizzle-excluded tables (crash guard)..."
  # drizzle-kit enumerates standalone sequences and tries to DROP them, but
  # if a column DEFAULT still references the sequence Postgres refuses with
  # "cannot drop sequence … because column … requires it".
  #
  # Root cause: sequences created WITHOUT "OWNED BY" have no pg_depend entry,
  # so pg_get_serial_sequence() returns NULL — all prior helper-function
  # approaches silently skipped them.
  #
  # Fix: read the DEFAULT expression directly from pg_attrdef, extract the
  # sequence name with substring/regex (no pg_depend, no pg_get_serial_sequence),
  # then: DROP DEFAULT → DROP SEQUENCE → ADD GENERATED ALWAYS AS IDENTITY.
  # Fully idempotent — skips any column whose DEFAULT is not nextval(…).
  #
  # IMPORTANT: add a new entry to excluded_tables whenever you add "!<table>"
  # to lib/db/drizzle.config.cjs tablesFilter AND the table has a SERIAL column.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'EOSQL'
DO $$
DECLARE
  r           RECORD;
  v_seq_name  text;
  v_seq_ref   text;
  v_max       bigint;
  v_default   text;
  converted   integer := 0;
  excluded_tables TEXT[] := ARRAY[
    'entity_translations',
    'schema_migrations',
    'platform_settings',
    'data_transfer_jobs',
    'data_transfer_jobs_id_seq1',
    'support_escalations',
    'support_macros',
    'support_tasks',
    'booking_reassignment_log',
    'service_review_matches',
    'service_image_auto_match_runs',
    'platform_email_campaigns',
    'platform_email_deliveries',
    'platform_email_enrollments',
    'platform_email_event_log',
    'platform_email_events',
    'platform_email_steps',
    'platform_email_suppressions',
    'service_import_jobs',
    'appointment_events',
    'auth_events',
    'email_log',
    'service_events',
    'account_health_checks'
  ];
BEGIN
  FOR r IN
    -- Find columns whose DEFAULT is nextval(…) on any excluded table.
    -- Uses pg_attrdef directly — no pg_depend, no pg_get_serial_sequence,
    -- so it works even when the sequence has no OWNED BY relationship.
    SELECT t.relname AS tbl,
           a.attname AS col,
           pg_get_expr(ad.adbin, ad.adrelid) AS def_expr
    FROM   pg_attribute a
    JOIN   pg_class     t  ON t.oid = a.attrelid
    JOIN   pg_namespace n  ON n.oid = t.relnamespace
    JOIN   pg_attrdef   ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE  n.nspname     = 'public'
      AND  a.attnum      > 0
      AND  NOT a.attisdropped
      AND  a.attidentity = ''
      AND  pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval(%'
      AND  t.relname     = ANY(excluded_tables)
    ORDER  BY t.relname, a.attname
  LOOP
    -- Resolve sequence from DEFAULT expression robustly, including quoted and
    -- schema-qualified forms, e.g.:
    --   nextval('service_import_jobs_id_seq'::regclass)
    --   nextval('public.service_import_jobs_id_seq'::regclass)
    --   nextval('"service_import_jobs_id_seq"'::regclass)
    v_seq_ref := substring(r.def_expr FROM $rx$nextval\('(.+)'::regclass\)$rx$);
    v_seq_name := NULL;

    IF v_seq_ref IS NOT NULL THEN
      SELECT to_regclass(v_seq_ref)::text INTO v_seq_name;
    END IF;

    -- Fallback for serial columns that still have proper OWNED BY metadata.
    IF v_seq_name IS NULL THEN
      SELECT pg_get_serial_sequence(format('%I.%I', 'public', r.tbl), r.col)
        INTO v_seq_name;
    END IF;

    IF v_seq_name IS NULL THEN
      RAISE NOTICE 'Could not parse sequence name from DEFAULT "%" on %.% — skipped',
                   r.def_expr, r.tbl, r.col;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT COALESCE(MAX(%I), 0) + 1 FROM %I', r.col, r.tbl)
      INTO v_max;

    -- 1. Drop DEFAULT so the nextval() pg_attrdef dependency is removed
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', r.tbl, r.col);

    -- 2. Sever OWNED BY (auto dependency) — required when the sequence was
    --    created with SERIAL which sets OWNED BY automatically.
    --    Without this step, DROP SEQUENCE still fails with "column requires it"
    --    even after the DEFAULT is gone.
    EXECUTE format('ALTER SEQUENCE %s OWNED BY NONE', v_seq_name);

    -- 3. Drop the now-fully-unblocked sequence
    EXECUTE format('DROP SEQUENCE IF EXISTS %s', v_seq_name);

    -- 4. Replace with GENERATED ALWAYS AS IDENTITY (internal, invisible to drizzle-kit)
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I ADD GENERATED ALWAYS AS IDENTITY (START WITH %s)',
      r.tbl, r.col, v_max
    );

    RAISE NOTICE 'Converted %.% — seq "%" removed, IDENTITY added (next=%)',
                 r.tbl, r.col, v_seq_name, v_max;
    converted := converted + 1;
  END LOOP;

  IF converted = 0 THEN
    RAISE NOTICE 'No nextval() defaults found on excluded tables — nothing to convert.';
  ELSE
    RAISE NOTICE 'Done: % column(s) converted.', converted;
  END IF;
  -- NOTE: after SERIAL→IDENTITY conversion, the column keeps an internal
  -- sequence in the public schema (deptype=i).  drizzle-kit sees it as orphaned
  -- and generates a DROP on every subsequent push, which Postgres blocks (2BP01).
  -- PostgreSQL prevents moving IDENTITY sequences to another schema, so we
  -- cannot hide them.  The 2BP01 catch in the bash wrapper suppresses that
  -- error on every deploy — it is harmless because the schema IS current.
END $$;
EOSQL
  success "Sequence fix done."

  # ── 3d. Revert accidental IDENTITY → serial on drizzle-managed tables ────────
  # Root cause of "type serial does not exist" during drizzle-kit push:
  #
  # drizzle-kit 0.31.9 detects serial columns by checking for a nextval()
  # DEFAULT in pg_attrdef.  IDENTITY columns (GENERATED ALWAYS/BY DEFAULT AS
  # IDENTITY) never have a pg_attrdef entry — their auto-increment is stored
  # elsewhere — so drizzle-kit reads them as plain "integer", not "serial".
  #
  # If a drizzle-managed table (NOT in tablesFilter) somehow ended up with an
  # IDENTITY column (e.g. step 3c was mis-applied, or a manual ALTER), drizzle-
  # kit sees "DB=integer, schema=serial()" → generates:
  #
  #   ALTER TABLE "foo" ALTER COLUMN "id" SET DATA TYPE serial
  #
  # PostgreSQL rejects this: 'serial' is a DDL-only keyword, not a real pg_type,
  # so `ALTER COLUMN TYPE serial` fails with "type serial does not exist" (42704).
  #
  # Fix: scan ALL tables NOT in the excluded list.  Any IDENTITY integer column
  # there is converted back to a proper serial (DROP IDENTITY → CREATE SEQUENCE →
  # SET DEFAULT nextval).  drizzle-kit then detects the nextval() default in
  # pg_attrdef and correctly maps the column to serial() — no diff, no crash.
  #
  # This is the mirror-image of step 3c.  Idempotent: columns that are already
  # serial (have a nextval default) are skipped.
  info "Reverting any accidental IDENTITY columns on drizzle-managed tables (serial crash guard)..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'EOSQL'
DO $$
DECLARE
  r           RECORD;
  v_max       bigint;
  v_seq_name  text;
  converted   integer := 0;
  -- Tables excluded from drizzle-kit (managed by SQL migrations only).
  -- These are the same tables that step 3c may have converted to IDENTITY.
  -- Any OTHER table with an IDENTITY column is a drizzle-managed table and
  -- must be reverted to a serial column so drizzle-kit can introspect it.
  excluded_tables TEXT[] := ARRAY[
    'entity_translations',
    'schema_migrations',
    'platform_settings',
    'data_transfer_jobs',
    'data_transfer_jobs_id_seq1',
    'support_escalations',
    'support_macros',
    'support_tasks',
    'booking_reassignment_log',
    'service_review_matches',
    'service_image_auto_match_runs',
    'platform_email_campaigns',
    'platform_email_deliveries',
    'platform_email_enrollments',
    'platform_email_event_log',
    'platform_email_events',
    'platform_email_steps',
    'platform_email_suppressions',
    'service_import_jobs',
    'appointment_events',
    'auth_events',
    'email_log',
    'service_events',
    'account_health_checks'
  ];
BEGIN
  -- Find IDENTITY integer columns on tables NOT in the excluded list.
  -- attidentity = 'a' (ALWAYS) or 'd' (BY DEFAULT) — both need fixing.
  FOR r IN
    SELECT t.relname AS tbl, a.attname AS col
    FROM   pg_attribute a
    JOIN   pg_class     t  ON t.oid = a.attrelid
    JOIN   pg_namespace n  ON n.oid = t.relnamespace
    WHERE  n.nspname   = 'public'
      AND  a.attnum    > 0
      AND  NOT a.attisdropped
      AND  a.attidentity IN ('a', 'd')
      AND  a.atttypid  = ANY ('{int,int8,int2}'::regtype[])
      AND  NOT (t.relname = ANY(excluded_tables))
    ORDER  BY t.relname, a.attname
  LOOP
    -- Get the current max to set a safe start value for the new sequence
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) + 1 FROM %I', r.col, r.tbl)
      INTO v_max;

    v_seq_name := r.tbl || '_' || r.col || '_seq';

    -- 1. Drop the IDENTITY attribute (keeps the column as integer NOT NULL)
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP IDENTITY IF EXISTS', r.tbl, r.col);

    -- 2. Create a standalone sequence owned by this column (makes pg_get_serial_sequence work)
    EXECUTE format(
      'CREATE SEQUENCE IF NOT EXISTS %I START WITH %s OWNED BY %I.%I',
      v_seq_name, v_max, r.tbl, r.col
    );
    -- Advance to safe start point in case the sequence already existed at a lower value
    EXECUTE format('SELECT setval(%L, %s, false)', v_seq_name, v_max);

    -- 3. Restore the nextval() DEFAULT so drizzle-kit detects this as serial
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT nextval(%L::regclass)',
      r.tbl, r.col, v_seq_name
    );

    RAISE NOTICE 'Reverted %.% from IDENTITY to serial (seq=%, next=%)',
                 r.tbl, r.col, v_seq_name, v_max;
    converted := converted + 1;
  END LOOP;

  IF converted = 0 THEN
    RAISE NOTICE 'No accidental IDENTITY columns found on drizzle-managed tables — nothing to revert.';
  ELSE
    RAISE NOTICE 'Done: % IDENTITY column(s) reverted to serial.', converted;
  END IF;
END $$;
EOSQL
  success "IDENTITY→serial revert done."

  # Apply ALL pending SQL migrations BEFORE drizzle-kit push, in the same
  # idempotent "soft mode" the API server uses at startup (statement-by-
  # statement, skipping already-exists errors). Root cause this avoids: if a
  # migration-only table (e.g. blog_posts) doesn't exist yet at push time,
  # drizzle-kit's push heuristically flags it as an ambiguous "created vs
  # renamed from an existing table" case (comparing column shapes against
  # unrelated tables) and throws an interactive select prompt that hangs
  # deploy.sh forever — there is no CLI flag to disable it, and piped Enter
  # keystrokes are not reliably read by the underlying prompt library over a
  # non-TTY pipe. Pre-applying every pending migration means every
  # migration-defined table already exists by the time push runs, so
  # drizzle-kit sees no diff for any of them and never asks the question —
  # for any current or future migration, not just one hardcoded table.
  info "Pre-applying pending migrations (avoids drizzle-kit push rename-ambiguity prompts)..."
  APP_DIR="$APP_DIR" MIGRATIONS_DIR="$APP_DIR/migrations" \
    pnpm --filter @workspace/scripts run apply-pending-migrations

  # ── Pre-push column guard ─────────────────────────────────────────────────
  # Ensures columns that were baseline-seeded (recorded in schema_migrations
  # without executing) exist in the DB BEFORE drizzle-kit push runs.
  # Without this, drizzle-kit sees a column in the Drizzle schema that is
  # absent from the DB and triggers an interactive "new or renamed?" prompt
  # that hangs deploy.sh forever (no TTY; `yes ""` is unreliable here).
  # All statements use IF NOT EXISTS — safe to re-run on any DB state.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'EOSQL'
-- locations: onboarding setup flag (migration 0116 was baseline-seeded)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- google_reviews: reviewer photo URL (migration 0126 was baseline-seeded)
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS reviewer_photo_url TEXT;

EOSQL

  info "Pushing database schema..."
  # Capture output + exit code.
  # With --force, drizzle-kit sometimes exits 0 even after printing a 2BP01
  # "cannot drop sequence" error (it continues past the failed DROP and considers
  # the rest of the push successful).  So we must check the OUTPUT for 2BP01
  # regardless of exit code — not just when exit code is non-zero.
  #
  # drizzle-kit push can prompt interactively ("Is X table created or renamed
  # from Y?") when its rename-detection heuristic fires.  There is no CLI flag
  # to suppress this prompt.  The `yes "" | cmd` pattern DOES NOT work because
  # drizzle-kit's prompt library (clack/prompts) calls process.stdin.setRawMode()
  # which requires a real TTY — on a plain pipe setRawMode() throws ENOTTY and
  # the prompt hangs forever regardless of what is piped in.
  #
  # Fix: allocate a pseudo-TTY via Python's pty.fork() (stdlib, always available).
  # The wrapper sends an Enter keypress whenever output stops for >400 ms, which
  # accepts the default ("create table/column") for any rename-detection prompt.
  # Output is written to a temp file so we can grep it afterwards.
  _PUSH_LOG=$(mktemp)
  set +e
  python3 "$APP_DIR/scripts/drizzle-push-noninteractive.py" "$_PUSH_LOG"
  PUSH_EXIT=$?
  set -e
  PUSH_OUT=$(cat "$_PUSH_LOG")
  rm -f "$_PUSH_LOG"
  if echo "$PUSH_OUT" | grep -qE "cannot drop sequence|2BP01"; then
    # Known harmless 2BP01: drizzle-kit sees the internal IDENTITY sequence for
    # an excluded table as an orphan and tries to DROP it; Postgres blocks the
    # drop because the IDENTITY column still owns the sequence.  The schema IS
    # current — drizzle just cannot clean up the sequence.  Safe to continue.
    # Print only the clean drizzle-kit progress lines; strip the error block.
    echo "$PUSH_OUT" | grep -vE \
      "^error:|^\s+at |length:|severity:|code:|detail:|hint:|position:|internalPosition:|internalQuery:|where:|schema:|table:|column:|dataType:|constraint:|file:|line:|routine:|^\s*\}" \
      || true
    warn "drizzle-kit: suppressed 2BP01 (cannot drop IDENTITY sequence on excluded table — harmless, schema is current)."
  elif echo "$PUSH_OUT" | grep -qE "type.*serial.*does not exist|42704"; then
    # "type serial does not exist" (42704): drizzle-kit generated
    # ALTER TABLE … ALTER COLUMN … SET DATA TYPE serial — Postgres rejects this
    # because 'serial' is a DDL keyword, not a real pg_type entry.
    # Step 3d above should have reverted any accidental IDENTITY columns before
    # push runs, so this error means there is a column that step 3d did not
    # cover (e.g. a very recently added table).  The column is still
    # auto-incrementing (IDENTITY) and functionally correct.  Fail loudly so
    # the operator can add the table to step 3d's excluded_tables list and re-
    # run, rather than silently leaving the schema in a partial state.
    echo "$PUSH_OUT"
    error "drizzle-kit push failed with 'type serial does not exist'.  \
Step 3d did not revert all IDENTITY columns before the push.  \
Identify which table/column caused the error (see output above), ensure it is NOT \
in the excluded_tables list in step 3c (excluded tables must stay IDENTITY), \
then re-run deploy.sh.  If the table is drizzle-managed, step 3d will fix it on \
the next run once it is absent from the excluded list."
  elif [[ $PUSH_EXIT -ne 0 ]]; then
    echo "$PUSH_OUT"
    error "drizzle-kit push FAILED with unexpected errors — see output above. Fix before retrying."
  else
    echo "$PUSH_OUT"
    success "Database schema up to date."
  fi

  # ── 3a. post-push column verification ────────────────────────────────────────
  # Queries information_schema to confirm a set of sentinel columns are still
  # present after the push.  These are columns that have historically been
  # accidentally dropped (duplicate table definitions, missing drizzle entries).
  # Reports any missing columns as warnings — the deploy continues, but output
  # is clearly flagged so you know the DB may be in a bad state.
  info "Verifying critical columns survived drizzle-kit push..."
  COLUMN_CHECK_RESULT=$(psql "$DATABASE_URL" -tAc "
    WITH sentinels(tbl, col) AS (
      VALUES
        -- support_ticket_messages: updated_at was dropped by a duplicate-table bug
        ('support_ticket_messages', 'updated_at'),
        -- locations: tax + register-float columns added in 2025
        ('locations',               'tax_services_taxable'),
        ('locations',               'tax_addons_taxable'),
        ('locations',               'tax_products_taxable'),
        ('locations',               'tax_gift_cards_taxable'),
        ('locations',               'register_target_float'),
        ('locations',               'auto_refill_enabled'),
        ('locations',               'auto_refill_threshold'),
        ('locations',               'auto_refill_amount'),
        -- staff: avatar thumb + commission structure
        ('staff',                   'avatar_thumb_url'),
        ('staff',                   'commission_structure_id'),
        -- services: illustration + active flag
        ('services',                'is_active'),
        ('services',                'auto_assigned'),
        -- appointments: check-in timestamp
        ('appointments',            'checked_in_at'),
        -- calendar_settings: locale
        ('calendar_settings',       'language'),
        -- sms_settings: auto-engage + cancellation SMS
        ('sms_settings',            'auto_engage_enabled'),
        ('sms_settings',            'sms_cancellation_enabled'),
        -- clients: loyalty + notes added via ALTER TABLE
        ('clients',                 'loyalty_points'),
        ('clients',                 'notes'),
         -- contractors: display name added by migration 0145
         ('contractors',             'name'),
        -- users: account type
        ('users',                   'account_type'),
        -- client_phones: store scoping
        ('client_phones',           'store_id'),
        -- locations: onboarding setup flag (0116 baseline-seeded without executing)
        ('locations',               'setup_complete'),
        -- google_reviews: reviewer photo URL (0126 baseline-seeded without executing)
        ('google_reviews',          'reviewer_photo_url')
    )
    SELECT s.tbl || '.' || s.col
    FROM sentinels s
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = s.tbl
        AND c.column_name  = s.col
    );
  " 2>/dev/null || true)

  if [[ -n "$COLUMN_CHECK_RESULT" ]]; then
    warn "══════════════════════════════════════════════════════════"
    warn "  POST-PUSH WARNING: the following columns are MISSING"
    warn "  from the live DB after drizzle-kit push:"
    warn "══════════════════════════════════════════════════════════"

    # Recovery SQL for every sentinel column.
    # Format: "table.column" -> "ALTER TABLE ... ADD COLUMN IF NOT EXISTS ..."
    declare -A _RECOVERY_SQL
    _RECOVERY_SQL["support_ticket_messages.updated_at"]="ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
    _RECOVERY_SQL["locations.tax_services_taxable"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_services_taxable BOOLEAN NOT NULL DEFAULT FALSE;"
    _RECOVERY_SQL["locations.tax_addons_taxable"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_addons_taxable BOOLEAN NOT NULL DEFAULT FALSE;"
    _RECOVERY_SQL["locations.tax_products_taxable"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_products_taxable BOOLEAN NOT NULL DEFAULT TRUE;"
    _RECOVERY_SQL["locations.tax_gift_cards_taxable"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_gift_cards_taxable BOOLEAN NOT NULL DEFAULT FALSE;"
    _RECOVERY_SQL["locations.register_target_float"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS register_target_float NUMERIC(10,2);"
    _RECOVERY_SQL["locations.auto_refill_enabled"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS auto_refill_enabled BOOLEAN NOT NULL DEFAULT FALSE;"
    _RECOVERY_SQL["locations.auto_refill_threshold"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS auto_refill_threshold NUMERIC(10,2) NOT NULL DEFAULT 5.00;"
    _RECOVERY_SQL["locations.auto_refill_amount"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS auto_refill_amount NUMERIC(10,2) NOT NULL DEFAULT 25.00;"
    _RECOVERY_SQL["staff.avatar_thumb_url"]="ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_thumb_url TEXT;"
    _RECOVERY_SQL["staff.commission_structure_id"]="ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_structure_id INTEGER;"
    _RECOVERY_SQL["services.is_active"]="ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;"
    _RECOVERY_SQL["services.auto_assigned"]="ALTER TABLE services ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN DEFAULT FALSE;"
    _RECOVERY_SQL["appointments.checked_in_at"]="ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;"
    _RECOVERY_SQL["calendar_settings.language"]="ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';"
    _RECOVERY_SQL["sms_settings.auto_engage_enabled"]="ALTER TABLE sms_settings ADD COLUMN IF NOT EXISTS auto_engage_enabled BOOLEAN NOT NULL DEFAULT TRUE;"
    _RECOVERY_SQL["sms_settings.sms_cancellation_enabled"]="ALTER TABLE sms_settings ADD COLUMN IF NOT EXISTS sms_cancellation_enabled BOOLEAN NOT NULL DEFAULT TRUE;"
    _RECOVERY_SQL["clients.loyalty_points"]="ALTER TABLE clients ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;"
    _RECOVERY_SQL["clients.notes"]="ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;"
     _RECOVERY_SQL["contractors.name"]="ALTER TABLE contractors ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';"
    _RECOVERY_SQL["users.account_type"]="ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(32);"
    _RECOVERY_SQL["client_phones.store_id"]="ALTER TABLE client_phones ADD COLUMN IF NOT EXISTS store_id INTEGER;"
    _RECOVERY_SQL["locations.setup_complete"]="ALTER TABLE locations ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN NOT NULL DEFAULT FALSE;"
    _RECOVERY_SQL["google_reviews.reviewer_photo_url"]="ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS reviewer_photo_url TEXT;"

    warn ""
    warn "  Run the following SQL to restore missing columns:"
    warn "  (copy-paste into: psql \"\$DATABASE_URL\")"
    warn ""
    while IFS= read -r _col; do
      warn "  ✗  $_col"
      _sql="${_RECOVERY_SQL[$_col]:-}"
      if [[ -n "$_sql" ]]; then
        warn "     → $_sql"
      else
        warn "     → (no recovery SQL on file — add column manually)"
      fi
    done <<< "$COLUMN_CHECK_RESULT"
    warn ""
    warn "  The API will crash on queries that reference these columns."
    warn "  Restore them with the SQL above, then verify the API is healthy."
    warn "══════════════════════════════════════════════════════════"
  else
    success "Column verification passed — all sentinel columns present in live DB."
  fi

  # ── 3b. seed required data ──────────────────────────────────────────────────
  info "Seeding billing plans and default support agent..."
  if [[ "$(psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.billing_plans') IS NOT NULL" 2>/dev/null | tr -d '[:space:]')" == "t" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'EOSQL'
-- Billing plans (upsert — safe to run multiple times)
INSERT INTO billing_plans (code, name, description, price_cents, interval, currency, active, features_json)
VALUES
  ('solo',         'Solo',         'For independent stylists and booth renters. 1 calendar, 1 staff member.',
   900,  'month', 'usd', true, '{"calendars":1,"staff":1,"smsCreditsMonthly":200}'),
  ('professional', 'Professional', 'Everything, unlimited — unlimited calendars, unlimited staff, all features for any salon size.',
   2200, 'month', 'usd', true, '{"calendars":-1,"staff":-1,"smsCreditsMonthly":-1}'),
  ('elite',        'Elite',        'Full API access for custom integrations. Unlimited API keys, 50,000 SMS credits/mo, Chatbot & Dialer API, Webhooks & real-time events, 99.9% uptime SLA, Priority support (4h).',
   4900, 'month', 'usd', true, '{"calendars":-1,"staff":-1,"smsCreditsMonthly":50000,"apiKeys":true,"webhooks":true,"chatbot":true}')
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  active      = EXCLUDED.active,
  features_json = EXCLUDED.features_json,
  updated_at  = NOW();

EOSQL
  else
    warn "billing_plans table not found — skipping billing plan seed. Ensure migrations/schema include billing_plans before enabling billing seed."
  fi

  # Seed default support agent if the table is empty (hash generated at deploy time)
  if [[ "$(psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.support_agents') IS NOT NULL" 2>/dev/null | tr -d '[:space:]')" == "t" ]]; then
    AGENT_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM support_agents" 2>/dev/null || echo "0")
  else
    AGENT_COUNT="-1"
    warn "support_agents table not found — skipping default support agent seed."
  fi
  if [[ "$AGENT_COUNT" == "0" ]]; then
    AGENT_HASH=$(node -e "
      const bcrypt = require('bcryptjs');
      bcrypt.hash('support2024!', 10).then(h => process.stdout.write(h));
    " 2>/dev/null)
    if [[ -n "$AGENT_HASH" ]]; then
      psql "$DATABASE_URL" -c "
        INSERT INTO support_agents (email, password_hash, first_name, last_name, role)
        VALUES ('admin@certxa.com', '$AGENT_HASH', 'Admin', 'Agent', 'admin')
        ON CONFLICT (email) DO NOTHING;
      "
      info "Default support agent created: admin@certxa.com / support2024!"
    else
      warn "Could not generate bcrypt hash — default agent not seeded. The API server will seed it on first start."
    fi
  elif [[ "$AGENT_COUNT" != "-1" ]]; then
    info "Support agents already present — skipping default support agent seed."
  fi
  success "Seed data applied."

  # ── 3c. migration dry-run check ──────────────────────────────────────────────
  # Parses every pending migration file and verifies that the tables it
  # references (ALTER TABLE, INSERT INTO, CREATE INDEX ON, etc.) actually
  # exist in the live DB after the drizzle-kit push above.
  # If any table is missing the script exits 1, which aborts the deploy
  # BEFORE the API server restarts — avoiding a crash-loop on startup.
  if [[ "$SKIP_MIGRATION_CHECK" == "false" ]]; then
    info "Running migration dry-run check (pending migrations vs live DB)..."
    if ! MIGRATIONS_DIR="$APP_DIR/migrations" DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run check-migrations; then
      error "Migration dry-run check FAILED — one or more pending migrations reference tables \
that do not exist in the live DB (see above). \
Fix the migration(s) so they create missing tables before referencing them, \
then re-run deploy. \
To bypass this check (not recommended): add --skip-migration-check."
    fi
    success "Migration dry-run check passed."

    # ── 3c2. migration drift check (with auto-repair) ────────────────────────
    # Cross-checks every migration ALREADY recorded as applied in
    # schema_migrations against the live DB — catches the "baseline-seeding
    # trap" where a file is marked applied but its CREATE TABLE / ADD COLUMN
    # statements never actually ran. Missing tables are auto-repaired by
    # re-applying the offending migration files (all use IF NOT EXISTS so it
    # is safe); the check is then re-run to confirm. A second failure is a
    # hard error requiring manual intervention.
    info "Running migration drift check (applied migrations vs live DB)..."
    set +e
    DRIFT_OUT=$(MIGRATIONS_DIR="$APP_DIR/migrations" DATABASE_URL="$DATABASE_URL" \
      pnpm --filter @workspace/scripts run check-migration-drift 2>&1)
    DRIFT_EXIT=$?
    set -e
    echo "$DRIFT_OUT"

    if [[ $DRIFT_EXIT -ne 0 ]]; then
      # Extract the migration filenames that have missing tables from the output.
      # The check script prints them as e.g. "  0011_vps_schema_sync.sql"
      MISSING_FILES=$(echo "$DRIFT_OUT" | grep -oE '[0-9]{4}[a-z0-9_]*\.sql' | sort -u)

      if [[ -z "$MISSING_FILES" ]]; then
        error "Migration drift check FAILED — could not identify which files need repair. \
Check the output above and apply the missing SQL manually, then re-run deploy."
      fi

      warn "Baseline-seeding drift detected — auto-applying missing migrations (all use IF NOT EXISTS)..."
      while IFS= read -r mfile; do
        MPATH="$APP_DIR/migrations/${mfile}"
        if [[ -f "$MPATH" ]]; then
          info "  Applying ${mfile}..."
          psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$MPATH" 2>&1 \
            | grep -v "^NOTICE\|^$\|^--\|already exists" || true
          success "  ${mfile} applied."
        else
          warn "  ${mfile} not found in migrations/ — skipping."
        fi
      done <<< "$MISSING_FILES"

      # Re-run the drift check to confirm the repair worked.
      info "Re-running drift check after auto-repair..."
      if ! MIGRATIONS_DIR="$APP_DIR/migrations" DATABASE_URL="$DATABASE_URL" \
          pnpm --filter @workspace/scripts run check-migration-drift; then
        error "Migration drift check FAILED even after auto-repair — manual intervention required. \
Run: psql \"\$DATABASE_URL\" -f migrations/<file>.sql for each file listed above."
      fi
    fi
    success "Migration drift check passed."
  else
    warn "--skip-migration-check: migration dry-run skipped."
  fi
fi

# ── 3e. ghost client cleanup ─────────────────────────────────────────────────
# Remove client records that have no phone AND no email (junk/placeholder rows).
# Child rows are removed automatically via ON DELETE CASCADE.
# Skipped when --frontend-only is used (no DB access needed for frontend builds).
if [[ "$FRONTEND_ONLY" == "false" ]]; then
  info "Running ghost client cleanup..."
  bash "$APP_DIR/scripts/cleanup-ghost-clients.sh"
fi

# ── 4. build artifacts ────────────────────────────────────────────────────────
if [[ "$FRONTEND_ONLY" == "false" ]]; then
  info "Building API server..."
  NODE_ENV=production pnpm --filter @workspace/api-server run build
  success "API server built → artifacts/api-server/dist/index.mjs"
fi

if [[ "$API_ONLY" == "false" ]]; then
  info "Building Booking app..."
  NODE_ENV=production PORT=3001 BASE_PATH="/" \
    pnpm --filter @workspace/booking run build
  success "Booking app built → artifacts/booking/dist/public"

  info "Building Website Builder..."
  NODE_ENV=production PORT=3002 BASE_PATH="/website-builder/" \
    pnpm --filter @workspace/website-builder run build
  success "Website Builder built → artifacts/website-builder/dist/public"
fi

# ── 5. export tenant data (optional) ─────────────────────────────────────────
# Generates one JSON file per booking account for the website builder.
# Enable with --export-tenant-data. Default output:
#   artifacts/website-builder/dist/public/tenant-data/
# Override with --tenant-data-out <path>
if [[ "$EXPORT_TENANT_DATA" == "true" ]]; then
  _TENANT_OUT="${TENANT_DATA_OUT:-$APP_DIR/artifacts/website-builder/dist/public/tenant-data}"
  info "Exporting tenant data → $_TENANT_OUT"
  pnpm --filter @workspace/scripts run export-tenant-data -- --out "$_TENANT_OUT"
  success "Tenant data exported."
fi

# ── 6. restart / reload services ──────────────────────────────────────────────

# ── 6a. kill orphan Node processes ───────────────────────────────────────────
# Orphan node processes (not owned by PM2/systemd) running the old API bundle
# will keep serving stale PHP paths and ignore the freshly-built dist/index.mjs.
# We find every `node` process whose command line contains our dist entrypoint
# and that is NOT a child of the PM2 daemon, then SIGTERM → SIGKILL them.
if [[ "$FRONTEND_ONLY" == "false" ]]; then
  _ENTRYPOINT="dist/index.mjs"

  # Collect PM2 daemon PID and all PIDs PM2 explicitly manages.
  # PM2 spawns node via an intermediate sh -c wrapper, so the node process is a
  # grandchild of the daemon — checking only direct-parent PID misses it.
  _PM2_PID=""
  _PM2_APP_PIDS=()
  if command -v pm2 >/dev/null 2>&1; then
    _PM2_PID=$(pm2 pid 2>/dev/null | tr -d '[:space:]' || true)
    while IFS= read -r _mpid; do
      [[ -n "$_mpid" ]] && _PM2_APP_PIDS+=("$_mpid")
    done < <(pm2 jlist 2>/dev/null | node -e \
      'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{JSON.parse(d).forEach(p=>{if(p.pid)console.log(p.pid)})}catch(e){}})' \
      2>/dev/null || true)
  fi

  # Collect candidate orphan PIDs: node processes matching our entrypoint
  # that are NOT the PM2 daemon's direct children AND NOT in PM2's app list.
  _ORPHAN_PIDS=()
  while IFS= read -r _pid; do
    [[ -z "$_pid" ]] && continue
    _ppid=$(ps -o ppid= -p "$_pid" 2>/dev/null | tr -d '[:space:]' || true)
    # Skip if direct child of PM2 daemon
    if [[ -n "$_PM2_PID" && "$_ppid" == "$_PM2_PID" ]]; then continue; fi
    # Skip any PID PM2 explicitly lists as a managed app process (grandchild etc.)
    for _mpid in "${_PM2_APP_PIDS[@]}"; do [[ "$_pid" == "$_mpid" ]] && continue 2; done
    # Also skip our own shell (the deploy script itself)
    [[ "$_pid" == "$$" ]] && continue
    _ORPHAN_PIDS+=("$_pid")
  done < <(pgrep -f "$_ENTRYPOINT" 2>/dev/null || true)

  if [[ ${#_ORPHAN_PIDS[@]} -gt 0 ]]; then
    warn "Found ${#_ORPHAN_PIDS[@]} orphan Node process(es) running stale code: ${_ORPHAN_PIDS[*]}"
    for _pid in "${_ORPHAN_PIDS[@]}"; do
      _cmd=$(ps -o args= -p "$_pid" 2>/dev/null || echo "(unknown)")
      warn "  Sending SIGTERM to PID $_pid: $_cmd"
      kill -TERM "$_pid" 2>/dev/null || true
    done
    # Give them 5 s to exit gracefully, then SIGKILL anything still alive.
    sleep 5
    for _pid in "${_ORPHAN_PIDS[@]}"; do
      if kill -0 "$_pid" 2>/dev/null; then
        warn "  PID $_pid did not exit — sending SIGKILL"
        kill -KILL "$_pid" 2>/dev/null || true
      fi
    done
    success "Orphan Node process(es) cleared."
  else
    info "No orphan Node processes found — proceeding with normal restart."
  fi
fi

# ── PHP_DIR pre-flight check ──────────────────────────────────────────────────
# PHP_DIR tells the API server where to find the PHP marketing pages.
# If it is missing the server silently falls back to an internal path
# (artifacts/api-server/php/) and ignores all changes to the real php/ folder.
# This check catches that before PM2 is touched so the problem is visible.
if [[ "$FRONTEND_ONLY" == "false" ]]; then
  _PHP_DIR_EFFECTIVE="${PHP_DIR:-}"
  # Also accept it from the ecosystem file itself as a fallback hint
  if [[ -z "$_PHP_DIR_EFFECTIVE" ]]; then
    _PHP_DIR_EFFECTIVE=$(node -e "try{const c=require('$APP_DIR/artifacts/api-server/ecosystem.config.cjs');const v=c.apps[0].env.PHP_DIR||'';process.stdout.write(v);}catch(e){}" 2>/dev/null || true)
  fi
  if [[ -z "$_PHP_DIR_EFFECTIVE" ]]; then
    error "PHP_DIR is not set and could not be read from the ecosystem config.
  The API server would fall back to an internal php/ directory and ignore your
  actual PHP files. Fix: add  PHP_DIR=/apps/CM/php  to $ENV_FILE and re-run."
  fi
  if [[ ! -d "$_PHP_DIR_EFFECTIVE" ]]; then
    error "PHP_DIR is set to '$_PHP_DIR_EFFECTIVE' but that directory does not exist on this server.
  Fix: create the directory or correct PHP_DIR in $ENV_FILE."
  fi
  success "PHP_DIR=$_PHP_DIR_EFFECTIVE ✓  (directory exists)"
fi

if [[ "$FRONTEND_ONLY" == "false" ]]; then
  if command -v pm2 >/dev/null 2>&1 && pm2 jlist | grep -q '"name":"certxa-api"'; then
    info "Reloading certxa-api via PM2 (with updated environment)..."
    PM2_ECOSYSTEM="$APP_DIR/artifacts/api-server/ecosystem.config.cjs"
    if [[ -f "$PM2_ECOSYSTEM" ]]; then
      # Prefer restart-by-name: works even when the process was externally killed
      # and PM2's numeric ID record is stale. Fall back to delete + start if the
      # record is so corrupted that restart itself fails.
      if ! pm2 restart certxa-api --update-env 2>/dev/null; then
        warn "pm2 restart failed — removing stale record and re-adding from ecosystem"
        pm2 delete certxa-api 2>/dev/null || true
        pm2 start "$PM2_ECOSYSTEM" --only certxa-api
      fi
      pm2 save --force 2>/dev/null || true
    else
      warn "PM2 ecosystem file not found at $PM2_ECOSYSTEM — falling back to restart"
      pm2 restart certxa-api --update-env
    fi
  elif systemctl is-enabled --quiet certxa-api 2>/dev/null; then
    info "Restarting certxa-api service via systemd..."
    systemctl restart certxa-api
  else
    info "No PM2/systemd — starting API directly from built dist..."
    _API_LOG="/tmp/certxa-api.log"
    nohup env NODE_ENV=production PORT="${PORT:-9200}" \
      PHP_DIR="${PHP_DIR:-$APP_DIR/php}" \
      BOOKING_DIST="$APP_DIR/artifacts/booking/dist/public" \
      WEBSITE_BUILDER_DIST="$APP_DIR/artifacts/website-builder/dist/public" \
      node --enable-source-maps "$APP_DIR/artifacts/api-server/dist/index.mjs" \
      >> "$_API_LOG" 2>&1 &
    _DIRECT_PID=$!
    info "API started directly (PID $_DIRECT_PID) — logs: $_API_LOG"
    # Give the process a moment, then verify it didn't crash immediately.
    sleep 2
    if ! kill -0 "$_DIRECT_PID" 2>/dev/null; then
      error "API process (PID $_DIRECT_PID) exited immediately after launch.
  Check startup logs: tail -50 $_API_LOG"
    fi
    _DIRECT_START=true
  fi

  # Wait for API to become reachable (up to 30 s)
  HEALTH_URL="http://localhost:${PORT:-9200}/api/health"
  for i in {1..15}; do
    sleep 2
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
    if [[ "$CODE" == "200" || "$CODE" == "401" || "$CODE" == "404" ]]; then
      success "API reachable at $HEALTH_URL (HTTP $CODE)"
      break
    fi
    if [[ $i -eq 15 ]]; then
      if [[ "${_DIRECT_START:-false}" == "true" ]]; then
        error "API reachability check failed after 30 s — check direct-start logs: tail -80 /tmp/certxa-api.log"
      else
        error "API reachability check failed after 30 s — check PM2 logs (pm2 logs certxa-api --lines 80) or systemd journal"
      fi
    fi
  done

  # ── post-restart PHP_DIR verification ────────────────────────────────────────
  # Confirm the RUNNING process actually has PHP_DIR in its environment.
  # If PM2 was started by hand without --update-env, the env var won't be live
  # even though it's in the ecosystem config — and the PHP server will silently
  # read from a wrong fallback path.
  if command -v pm2 >/dev/null 2>&1 && pm2 jlist | grep -q '"name":"certxa-api"'; then
    # Prefer `pm2 env` (stable key:value format). `pm2 show` output formatting can
    # vary and may hide env vars, causing false "missing PHP_DIR" warnings.
    _LIVE_PHP_DIR=$(pm2 env certxa-api 2>/dev/null | awk -F': ' '/^PHP_DIR:/{print $2; exit}' | xargs || true)

    # Fallback: parse PM2 JSON in case `pm2 env` output changes.
    if [[ -z "$_LIVE_PHP_DIR" ]]; then
      _LIVE_PHP_DIR=$(pm2 jlist 2>/dev/null | node -e '
        try {
          const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
          const app = data.find(p => p && p.name === "certxa-api");
          const v = app?.pm2_env?.PHP_DIR || "";
          process.stdout.write(String(v));
        } catch {}
      ' | xargs || true)
    fi

    if [[ -z "$_LIVE_PHP_DIR" ]]; then
      warn "WARNING: PHP_DIR is NOT visible in the running certxa-api process environment.
  PHP marketing pages may be served from the wrong directory.
  To fix, ensure PHP_DIR is set in /etc/certxa.env, then run:
    set -a && source /etc/certxa.env && set +a
    pm2 restart certxa-api --update-env"
    else
      success "Running process has PHP_DIR=$_LIVE_PHP_DIR ✓"
    fi
  fi
fi

if [[ "$API_ONLY" == "false" ]]; then
  # Keep live nginx site config in sync with repo template.
  # This prevents drift where VPS keeps an old certxa.conf that can break
  # PHP marketing routes/static video paths (e.g. /videos/* for /overview hero).
  NGINX_TEMPLATE="$APP_DIR/nginx-site.conf"
  NGINX_TARGET="/etc/nginx/conf.d/certxa.conf"
  if [[ -f "$NGINX_TEMPLATE" && -d "/etc/nginx/conf.d" ]]; then
    info "Syncing nginx config from nginx-site.conf..."
    sed \
      -e "s|__DOMAIN__|certxa.com|g" \
      -e "s|__APP_DIR__|$APP_DIR|g" \
      -e "s|__API_PORT__|${PORT:-9200}|g" \
      "$NGINX_TEMPLATE" > "$NGINX_TARGET"
    success "nginx config synced to $NGINX_TARGET"
  else
    warn "Skipping nginx config sync (missing template or /etc/nginx/conf.d)"
  fi

  if systemctl is-enabled --quiet nginx 2>/dev/null; then
    info "Testing and reloading nginx..."
    nginx -t
    systemctl reload nginx
    success "nginx reloaded (static assets live)."
  else
    warn "nginx not running — static files updated but nginx reload skipped."
  fi
fi

# ── 7. staff mobile (optional) ────────────────────────────────────────────────
if [[ "$MOBILE" == "true" ]]; then
  start_mobile
  # start_mobile uses exec — nothing below this runs when --mobile is set.
fi

# ── 6. summary ────────────────────────────────────────────────────────────────
DEPLOY_END=$(date +%s)
ELAPSED=$(( DEPLOY_END - DEPLOY_START ))

echo ""
success "══════════════════════════════════════════════"
success "  Deploy complete in ${ELAPSED}s"
success "  Commit : $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
success ""
if [[ "$API_ONLY" == "false" ]]; then
  success "  To rollback frontends: git checkout $PREV_COMMIT -- artifacts/booking/dist artifacts/website-builder/dist && systemctl reload nginx"
fi
if [[ "$FRONTEND_ONLY" == "false" ]]; then
  success "  To rollback API: git checkout $PREV_COMMIT -- artifacts/api-server/dist && (pm2 restart certxa-api --update-env || systemctl restart certxa-api)"
fi
success "══════════════════════════════════════════════"
echo ""

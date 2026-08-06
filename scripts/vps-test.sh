#!/usr/bin/env bash
# =============================================================================
# Certxa — VPS Test Startup Script
# Usage:  bash scripts/vps-test.sh [--port <frontend-port>] [--skip-build]
#
# What this does:
#   1. Loads secrets from /etc/certxa.env (or .env in the project root)
#   2. Installs dependencies if node_modules is missing
#   3. Builds the API server and React frontend (unless --skip-build)
#   4. Starts Redis (if installed)
#   5. Starts the API on port 9200 (PM2 if available, else nohup)
#   6. Starts the Vite preview server for the frontend
#   7. Waits for both to be ready and prints the access URL
#
# Does NOT require nginx, SSL, or a domain name.
# Open the printed URL in your browser from any machine on the same network.
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

log()    { echo -e "${CYAN}[certxa]${RESET} $*"; }
ok()     { echo -e "${GREEN}[certxa] ✓${RESET} $*"; }
warn()   { echo -e "${YELLOW}[certxa] ⚠${RESET}  $*"; }
fail()   { echo -e "${RED}[certxa] ✗${RESET} $*" >&2; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  $*${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

# ── Parse arguments ───────────────────────────────────────────────────────────
FRONTEND_PORT=5000
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)       FRONTEND_PORT="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=true;    shift   ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Resolve project root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

header "Certxa — VPS Test Mode"
log "Project root : ${PROJECT_ROOT}"
log "Frontend port: ${FRONTEND_PORT}"
log "API port     : 9200 (internal)"

# ── 1. Load environment ───────────────────────────────────────────────────────
header "Environment"

# Try /etc/certxa.env first (production), then local .env (fallback)
if [[ -f /etc/certxa.env ]]; then
  log "Loading /etc/certxa.env ..."
  set -a; source /etc/certxa.env; set +a
  ok "Loaded /etc/certxa.env"
elif [[ -f "${PROJECT_ROOT}/.env" ]]; then
  log "Loading .env from project root..."
  set -a; source "${PROJECT_ROOT}/.env"; set +a
  ok "Loaded .env"
else
  warn "No environment file found."
  warn "Create /etc/certxa.env from deployment/certxa.env.example before running."
  warn "Continuing — DATABASE_URL and SESSION_SECRET must already be in the environment."
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is not set. The API will not start without it."
  echo -e "${DIM}  Add it to /etc/certxa.env or export it before running this script.${RESET}"
  exit 1
fi

if [[ -z "${SESSION_SECRET:-}" ]]; then
  fail "SESSION_SECRET is not set. The API will not start without it."
  exit 1
fi

ok "Required environment variables present."

# ── 2. Dependencies ───────────────────────────────────────────────────────────
header "Dependencies"

if ! command -v pnpm &>/dev/null; then
  fail "pnpm not found. Install it with: npm install -g pnpm"
  exit 1
fi

if [[ ! -d "${PROJECT_ROOT}/node_modules" ]]; then
  log "node_modules missing — running pnpm install..."
  pnpm install --frozen-lockfile
  ok "Dependencies installed."
else
  ok "node_modules present (use --skip-build if you also want to skip install)."
fi

# ── 3. Build ──────────────────────────────────────────────────────────────────
header "Build"

if [[ "$SKIP_BUILD" == "true" ]]; then
  warn "--skip-build passed. Skipping compilation — using existing dist/ and dist/."
  # Verify the build artifacts actually exist
  if [[ ! -f "${PROJECT_ROOT}/artifacts/api-server/dist/index.mjs" ]]; then
    fail "API build not found at artifacts/api-server/dist/index.mjs"
    echo -e "${DIM}  Remove --skip-build or run:  pnpm --filter @workspace/api-server run build${RESET}"
    exit 1
  fi
  if [[ ! -d "${PROJECT_ROOT}/artifacts/booking/dist" ]]; then
    fail "Frontend build not found at artifacts/booking/dist/"
    echo -e "${DIM}  Remove --skip-build or run:  pnpm --filter @workspace/booking run build${RESET}"
    exit 1
  fi
  ok "Skipped build — existing artifacts present."
else
  log "Building API server..."
  pnpm --filter @workspace/api-server run build
  ok "API server built."

  log "Building frontend..."
  pnpm --filter @workspace/booking run build
  ok "Frontend built."
fi

# ── 4. Redis ──────────────────────────────────────────────────────────────────
header "Redis"

if command -v redis-server &>/dev/null; then
  if redis-cli ping &>/dev/null 2>&1; then
    ok "Redis already running."
    export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
  else
    log "Starting Redis..."
    redis-server --daemonize yes --loglevel warning \
      --save "" --appendonly no \
      --bind 127.0.0.1 --port 6379 2>/dev/null || true
    sleep 1
    if redis-cli ping &>/dev/null 2>&1; then
      ok "Redis started."
      export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
    else
      warn "Redis failed to start — availability cache disabled."
    fi
  fi
else
  warn "redis-server not installed — availability cache disabled."
fi

# ── 5. API server ─────────────────────────────────────────────────────────────
header "API Server"

API_DIST="${PROJECT_ROOT}/artifacts/api-server/dist/index.mjs"
API_LOG="${PROJECT_ROOT}/logs/api.log"
mkdir -p "${PROJECT_ROOT}/logs"

API_ENV_ARGS=(
  "NODE_ENV=production"
  "PORT=9200"
)
# Pass through all env vars that were set from the env file
for VAR in DATABASE_URL SESSION_SECRET REDIS_URL APP_URL \
           OPENAI_API_KEY AI_INTEGRATIONS_OPENAI_API_KEY \
           STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY \
           STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_CLIENT_ID \
           STRIPE_CONNECT_WEBHOOK_SECRET \
           MAILGUN_API_KEY MAILGUN_DOMAIN \
           TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER \
           GOOGLE_TOKEN_ENCRYPTION_KEY \
           AWS_SDK_JS_NODE_VERSION_SUPPORT_WARNING_DISABLED \
           PHP_DIR TRIAL_PERIOD_DAYS CORS_ORIGINS; do
  [[ -n "${!VAR:-}" ]] && API_ENV_ARGS+=("${VAR}=${!VAR}")
done

if command -v pm2 &>/dev/null; then
  log "PM2 detected — managing certxa-api..."

  if pm2 list 2>/dev/null | grep -q "certxa-api"; then
    log "certxa-api already registered — restarting..."
    pm2 restart certxa-api --update-env
  else
    log "Starting certxa-api via PM2..."
    NODE_BIN=$(command -v node)
    env "${API_ENV_ARGS[@]}" pm2 start "$API_DIST" \
      --name certxa-api \
      --interpreter "$NODE_BIN" \
      --interpreter-args "--enable-source-maps" \
      --output "${API_LOG}" \
      --error "${PROJECT_ROOT}/logs/api-error.log"
  fi

  pm2 save --force &>/dev/null || true
  ok "certxa-api managed by PM2.  Logs: pm2 logs certxa-api"

else
  log "PM2 not found — starting API with nohup..."
  # Kill any stale process on port 9200
  if command -v lsof &>/dev/null; then
    OLD_API=$(lsof -ti:9200 2>/dev/null || true)
    [[ -n "$OLD_API" ]] && { log "Killing existing process on port 9200 (PID ${OLD_API})..."; kill "$OLD_API" 2>/dev/null || true; sleep 1; }
  fi

  env "${API_ENV_ARGS[@]}" \
    nohup node --enable-source-maps "$API_DIST" \
    >"${API_LOG}" 2>&1 &
  echo $! > "${PROJECT_ROOT}/logs/api.pid"
  ok "certxa-api started (PID $(cat "${PROJECT_ROOT}/logs/api.pid")).  Logs: tail -f ${API_LOG}"
fi

# ── 6. Frontend preview server ────────────────────────────────────────────────
header "Frontend"

WEB_LOG="${PROJECT_ROOT}/logs/web.log"

if command -v pm2 &>/dev/null; then
  if pm2 list 2>/dev/null | grep -q "certxa-web"; then
    log "certxa-web already registered — restarting..."
    pm2 restart certxa-web --update-env
  else
    log "Starting certxa-web (Vite preview) via PM2..."
    VITE_BIN="${PROJECT_ROOT}/node_modules/.bin/vite"
    VITE_CONFIG="${PROJECT_ROOT}/artifacts/booking/vite.config.ts"

    pm2 start "$VITE_BIN" \
      --name certxa-web \
      --cwd "${PROJECT_ROOT}/artifacts/booking" \
      -- preview \
        --config "$VITE_CONFIG" \
        --host 0.0.0.0 \
        --port "$FRONTEND_PORT" \
      --output "${WEB_LOG}" \
      --error "${PROJECT_ROOT}/logs/web-error.log"
  fi

  pm2 save --force &>/dev/null || true
  ok "certxa-web managed by PM2.  Logs: pm2 logs certxa-web"

else
  log "Starting Vite preview with nohup..."
  # Kill any stale process on the frontend port
  if command -v lsof &>/dev/null; then
    OLD_WEB=$(lsof -ti:"$FRONTEND_PORT" 2>/dev/null || true)
    [[ -n "$OLD_WEB" ]] && { log "Killing existing process on port ${FRONTEND_PORT} (PID ${OLD_WEB})..."; kill "$OLD_WEB" 2>/dev/null || true; sleep 1; }
  fi

  nohup pnpm --filter @workspace/booking run serve \
    -- --port "$FRONTEND_PORT" \
    >"${WEB_LOG}" 2>&1 &
  echo $! > "${PROJECT_ROOT}/logs/web.pid"
  ok "certxa-web started (PID $(cat "${PROJECT_ROOT}/logs/web.pid")).  Logs: tail -f ${WEB_LOG}"
fi

# ── 7. Health checks ──────────────────────────────────────────────────────────
header "Health Checks"

wait_for_port() {
  local NAME="$1"
  local PORT="$2"
  local MAX=45
  local N=0
  log "Waiting for ${NAME} on port ${PORT}..."
  while ! curl -s "http://127.0.0.1:${PORT}" &>/dev/null; do
    sleep 1
    N=$((N + 1))
    if (( N >= MAX )); then
      warn "${NAME} did not respond after ${MAX}s — check logs."
      return
    fi
  done
  ok "${NAME} is up (${N}s)."
}

wait_for_port "API"      9200
wait_for_port "Frontend" "$FRONTEND_PORT"

# Detailed API health
if curl -s "http://127.0.0.1:9200/api/health" &>/dev/null; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:9200/api/health")
  DB_STATUS=$(curl -s "http://127.0.0.1:9200/api/health" \
    | grep -o '"database":{"status":"[^"]*"' \
    | grep -o '"[^"]*"$' | tr -d '"' 2>/dev/null || echo "unknown")
  ok "API health: HTTP ${HTTP_CODE} · DB ${DB_STATUS}"
fi

# ── 8. Status summary ─────────────────────────────────────────────────────────
header "Ready"

# Best-effort: try to determine the server's public IP
PUBLIC_IP=$(curl -s --max-time 4 https://api.ipify.org 2>/dev/null \
  || hostname -I 2>/dev/null | awk '{print $1}' \
  || echo "YOUR_VPS_IP")

echo ""
echo -e "  ${BOLD}Open in your browser:${RESET}"
echo -e "  ${GREEN}${BOLD}  ➜  http://${PUBLIC_IP}:${FRONTEND_PORT}${RESET}"
echo ""
echo -e "  ${BOLD}API (internal):${RESET}  http://127.0.0.1:9200"
echo -e "  ${BOLD}Logs dir:${RESET}        ${PROJECT_ROOT}/logs/"
echo ""

if command -v pm2 &>/dev/null; then
  echo -e "  ${BOLD}Useful PM2 commands:${RESET}"
  echo -e "  ${DIM}  pm2 logs certxa-api        # stream API logs${RESET}"
  echo -e "  ${DIM}  pm2 logs certxa-web        # stream frontend logs${RESET}"
  echo -e "  ${DIM}  pm2 restart certxa-api     # restart API after code change${RESET}"
  echo -e "  ${DIM}  pm2 stop all               # stop everything${RESET}"
  echo -e "  ${DIM}  pm2 list                   # process overview${RESET}"
else
  echo -e "  ${BOLD}Useful commands:${RESET}"
  echo -e "  ${DIM}  tail -f ${PROJECT_ROOT}/logs/api.log${RESET}"
  echo -e "  ${DIM}  tail -f ${PROJECT_ROOT}/logs/web.log${RESET}"
  echo -e "  ${DIM}  kill \$(cat ${PROJECT_ROOT}/logs/api.pid)    # stop API${RESET}"
  echo -e "  ${DIM}  kill \$(cat ${PROJECT_ROOT}/logs/web.pid)    # stop frontend${RESET}"
  echo ""
  echo -e "  ${DIM}Tip: install PM2 for automatic process management:${RESET}"
  echo -e "  ${DIM}  npm install -g pm2${RESET}"
fi

echo ""
echo -e "  ${DIM}To stop everything and rebuild:  bash scripts/vps-test.sh${RESET}"
echo -e "  ${DIM}To skip rebuild (code unchanged): bash scripts/vps-test.sh --skip-build${RESET}"
echo ""
ok "Done."

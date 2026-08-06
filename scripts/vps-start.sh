#!/usr/bin/env bash
# =============================================================================
# Certxa — VPS Startup Script
# Run from the project root: bash scripts/vps-start.sh
#
# What this does:
#   1. Loads secrets from /etc/certxa.env
#   2. Starts Redis (if installed)
#   3. Starts the API server via PM2 (falls back to systemd)
#   4. Ensures nginx is running
#   5. Runs a health check
#   6. Prints a status summary
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
fail()   { echo -e "${RED}[certxa] ✗${RESET} $*"; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  $*${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

# ── Resolve project root (script can be called from anywhere) ─────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

header "Certxa — Starting Production Services"
log "Project root: ${PROJECT_ROOT}"

# ── 1. Load environment ───────────────────────────────────────────────────────
ENV_FILE="/etc/certxa.env"
if [[ -f "$ENV_FILE" ]]; then
  log "Loading environment from ${ENV_FILE}..."
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
  ok "Environment loaded."
else
  warn "${ENV_FILE} not found — using existing process environment."
  warn "If the API fails, create ${ENV_FILE} with DATABASE_URL, SESSION_SECRET, APP_URL."
fi

API_PORT="${PORT:-9200}"
APP_URL="${APP_URL:-https://certxa.com}"

# ── 2. Redis ──────────────────────────────────────────────────────────────────
header "Redis"
if command -v redis-server &>/dev/null; then
  if redis-cli ping &>/dev/null 2>&1; then
    ok "Redis is already running."
  else
    log "Starting Redis..."
    redis-server --daemonize yes --loglevel warning \
      --save "" --appendonly no \
      --bind 127.0.0.1 --port 6379 2>/dev/null || true
    sleep 1
    if redis-cli ping &>/dev/null 2>&1; then
      ok "Redis started."
      export REDIS_URL="redis://127.0.0.1:6379"
    else
      warn "Redis failed to start — availability cache will fall through to DB."
    fi
  fi
else
  warn "redis-server not installed — availability cache disabled."
fi

# ── 3. API server via PM2 (falls back to systemd) ────────────────────────────
header "API Server"

ECOSYSTEM="${PROJECT_ROOT}/ecosystem.config.js"

if command -v pm2 &>/dev/null; then
  log "PM2 detected — managing certxa-api process..."

  # If certxa-api is already in PM2, restart it; otherwise start fresh
  if pm2 list 2>/dev/null | grep -q "certxa-api"; then
    log "certxa-api already registered — restarting..."
    pm2 restart certxa-api
    ok "certxa-api restarted via PM2."
  else
    log "Starting certxa-api via PM2 ecosystem config..."
    if [[ -f "$ECOSYSTEM" ]]; then
      pm2 start "$ECOSYSTEM"
      ok "certxa-api started via PM2."
    else
      warn "ecosystem.config.js not found at ${ECOSYSTEM}."
      warn "Starting directly with node..."
      API_DIST="${PROJECT_ROOT}/artifacts/api-server/dist/index.mjs"
      if [[ ! -f "$API_DIST" ]]; then
        fail "API build not found at ${API_DIST}."
        echo -e "${DIM}  Run: pnpm --filter @workspace/api-server run build${RESET}"
        exit 1
      fi
      NODE_BIN=$(command -v node)
      PORT="$API_PORT" NODE_ENV=production \
        pm2 start "$API_DIST" \
          --name certxa-api \
          --interpreter "$NODE_BIN" \
          --interpreter-args "--enable-source-maps" \
          --env production
      ok "certxa-api started via PM2 (direct)."
    fi
  fi

  # Save PM2 process list so it survives reboots
  pm2 save --force &>/dev/null || true

elif systemctl list-units --type=service 2>/dev/null | grep -q "certxa-api"; then
  log "systemd service detected — restarting certxa-api..."
  sudo systemctl restart certxa-api
  ok "certxa-api restarted via systemd."

else
  fail "Neither PM2 nor a certxa-api systemd service was found."
  echo ""
  echo -e "  ${BOLD}To install PM2:${RESET}"
  echo -e "    npm install -g pm2"
  echo -e "    pm2 start ${ECOSYSTEM}"
  echo -e "    pm2 startup && pm2 save"
  echo ""
  exit 1
fi

# ── 4. Nginx ──────────────────────────────────────────────────────────────────
header "Nginx"
if command -v nginx &>/dev/null; then
  if systemctl is-active --quiet nginx 2>/dev/null; then
    ok "nginx is running."
  else
    log "nginx not running — attempting to start..."
    sudo systemctl start nginx 2>/dev/null || sudo nginx 2>/dev/null || true
    if systemctl is-active --quiet nginx 2>/dev/null; then
      ok "nginx started."
    else
      warn "Could not start nginx — check: sudo nginx -t && sudo systemctl start nginx"
    fi
  fi
else
  warn "nginx not found — frontend will not be served unless you have another web server."
fi

# ── 5. Health check ───────────────────────────────────────────────────────────
header "Health Check"
log "Waiting for API to become ready on port ${API_PORT}..."
MAX_WAIT=30
WAITED=0
while ! curl -s "http://127.0.0.1:${API_PORT}/api/health" &>/dev/null; do
  sleep 1
  WAITED=$((WAITED + 1))
  if (( WAITED >= MAX_WAIT )); then
    warn "API did not respond after ${MAX_WAIT}s."
    break
  fi
done

if curl -s "http://127.0.0.1:${API_PORT}/api/health" &>/dev/null; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/api/health")
  DB_STATUS=$(curl -s "http://127.0.0.1:${API_PORT}/api/health" | grep -o '"database":{"status":"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "unknown")
  ok "API is responding (HTTP ${HTTP_STATUS}, DB: ${DB_STATUS})."
else
  fail "API health check failed — check logs:"
  if command -v pm2 &>/dev/null; then
    echo -e "${DIM}  pm2 logs certxa-api --lines 30${RESET}"
  else
    echo -e "${DIM}  journalctl -u certxa-api -n 30${RESET}"
  fi
fi

# ── 6. Status summary ─────────────────────────────────────────────────────────
header "Status Summary"
echo ""
echo -e "  ${BOLD}App URL:${RESET}       ${APP_URL}"
echo -e "  ${BOLD}API Port:${RESET}      ${API_PORT} (internal)"
echo ""

if command -v pm2 &>/dev/null; then
  echo -e "  ${BOLD}PM2 processes:${RESET}"
  pm2 list 2>/dev/null | grep -E "certxa|name|─" || true
  echo ""
  echo -e "  ${DIM}Tail logs:  pm2 logs certxa-api${RESET}"
  echo -e "  ${DIM}Restart:    pm2 restart certxa-api${RESET}"
  echo -e "  ${DIM}Stop:       pm2 stop certxa-api${RESET}"
else
  echo -e "  ${DIM}Status:     systemctl status certxa-api${RESET}"
  echo -e "  ${DIM}Logs:       journalctl -u certxa-api -f${RESET}"
  echo -e "  ${DIM}Restart:    sudo systemctl restart certxa-api${RESET}"
fi

echo ""
ok "Done. Certxa is up at ${APP_URL}"
echo ""

#!/bin/bash
set -e

trap 'kill $(jobs -p) 2>/dev/null; exit' SIGTERM SIGINT EXIT

# ── Bootstrap — install workspace dependencies if node_modules are missing ────
# Use flock so concurrent workflow starts don't race on pnpm install
(
  flock -x 200
  if [ ! -d "node_modules" ]; then
    echo "[dev-start] node_modules missing — running pnpm install..."
    pnpm install --no-frozen-lockfile
    echo "[dev-start] pnpm install complete."
  fi
) 200>/tmp/pnpm-workspace-install.lock

# ── Platform environment file ─────────────────────────────────────────────────
if [ -f /etc/certxa.env ]; then
  echo "[dev-start] Loading environment from /etc/certxa.env..."
  set -a
  # shellcheck source=/dev/null
  source /etc/certxa.env
  set +a
fi

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_BIN=$(which redis-server 2>/dev/null || echo "")
if [ -n "$REDIS_BIN" ]; then
  echo "[dev-start] Starting Redis on port 6379..."
  redis-server --daemonize yes --loglevel warning --save "" --appendonly no \
    --bind 127.0.0.1 --port 6379 2>/dev/null || true
  export REDIS_URL="redis://127.0.0.1:6379"
  echo "[dev-start] Redis ready. REDIS_URL=$REDIS_URL"
else
  echo "[dev-start] redis-server not found — availability cache will fall through to live DB."
fi

# ── API server ───────────────────────────────────────────────────────────────
echo "[dev-start] Building and starting API server on port 8080..."
PORT=8080 pnpm --filter @workspace/api-server run dev &
API_PID=$!

# ── Booking frontend — starts immediately, proxies to API when it's ready ────
echo "[dev-start] Starting booking frontend on port 5000..."
PORT=5000 API_PROXY_TARGET=http://localhost:8080 pnpm --filter @workspace/booking run dev &
VITE_PID=$!

echo "[dev-start] Both services starting. API=$API_PID, Vite=$VITE_PID"
wait

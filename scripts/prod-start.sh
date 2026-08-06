#!/bin/bash
# prod-start.sh — Production-mode start for certxa.com
#
# Serves the pre-built React/Tailwind bundle as real static files (no Vite
# dev server, no HMR, no WebSocket CSS injection).  CSS ships as a plain
# <link> tag that works in every browser and Android WebView.
#
# To rebuild the frontend after code changes:
#   pnpm --filter @workspace/booking run build
# Then restart this workflow.
set -e

trap 'kill $(jobs -p) 2>/dev/null; exit' SIGTERM SIGINT EXIT

# ── Force production mode ─────────────────────────────────────────────────────
# [userenv.shared] sets NODE_ENV=development globally; override it here so
# Express serves static files from dist/public instead of proxying to Vite.
export NODE_ENV=production

# Ensure APP_URL is set so the subdomain middleware recognises certxa.com as
# the app domain (not a custom tenant domain).  APP_URL is only in
# [userenv.production] (Replit deploy env), so we set it explicitly here for
# the dev container which certxa.com's DNS points to.
export APP_URL="${APP_URL:-https://certxa.com}"
export GOOGLE_BUSINESS_CALLBACK_URL="${GOOGLE_BUSINESS_CALLBACK_URL:-https://certxa.com/api/google-business/callback}"

# ── Bootstrap ─────────────────────────────────────────────────────────────────
(
  flock -x 200
  if [ ! -d "node_modules" ]; then
    echo "[prod-start] node_modules missing — running pnpm install..."
    pnpm install --no-frozen-lockfile
    echo "[prod-start] pnpm install complete."
  fi
) 200>/tmp/pnpm-workspace-install.lock

# ── Platform environment file ─────────────────────────────────────────────────
if [ -f /etc/certxa.env ]; then
  echo "[prod-start] Loading environment from /etc/certxa.env..."
  set -a
  source /etc/certxa.env
  set +a
  # Re-assert after sourcing env file in case it sets NODE_ENV
  export NODE_ENV=production
fi

# ── Ensure the booking app has been built ─────────────────────────────────────
DIST_INDEX="artifacts/api-server/dist/public/index.html"
if [ ! -f "$DIST_INDEX" ]; then
  echo "[prod-start] No production build found — building booking app..."
  pnpm --filter @workspace/booking run build
  echo "[prod-start] Booking app build complete."
else
  echo "[prod-start] Production build found — skipping rebuild."
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_BIN=$(which redis-server 2>/dev/null || echo "")
if [ -n "$REDIS_BIN" ]; then
  echo "[prod-start] Starting Redis on port 6379..."
  redis-server --daemonize yes --loglevel warning --save "" --appendonly no \
    --bind 127.0.0.1 --port 6379 2>/dev/null || true
  export REDIS_URL="redis://127.0.0.1:6379"
  echo "[prod-start] Redis ready."
else
  echo "[prod-start] redis-server not found — availability cache will fall through to live DB."
fi

# ── Build the API server bundle ───────────────────────────────────────────────
# Skip rebuild if the bundle already exists — restarts are fast by default.
# To force a rebuild after code changes, delete artifacts/api-server/dist/index.mjs
# and restart the workflow.
API_BUNDLE="artifacts/api-server/dist/index.mjs"
if [ ! -f "$API_BUNDLE" ]; then
  echo "[prod-start] Building lib packages..."
  pnpm --filter @workspace/db build
  pnpm --filter @workspace/api-zod build
  echo "[prod-start] Lib packages built."
  echo "[prod-start] Building API server..."
  pnpm --filter @workspace/api-server run build
  echo "[prod-start] API server build complete."
else
  echo "[prod-start] API server bundle found — skipping rebuild."
fi

# ── Start API server in PRODUCTION mode on port 5000 ─────────────────────────
# Use `pnpm run start` (not `run dev`) so pnpm sets cwd to artifacts/api-server/
# before launching the process.  This is critical: the server resolves
# dist/public relative to process.cwd(), so it must run from its own directory.
# `run start` does not force NODE_ENV, so our export NODE_ENV=production is kept.
echo "[prod-start] Starting API server in PRODUCTION mode on port 5000..."
PORT=5000 pnpm --filter @workspace/api-server run start &
API_PID=$!

echo "[prod-start] API server started (PID=$API_PID). NODE_ENV=$NODE_ENV"
wait

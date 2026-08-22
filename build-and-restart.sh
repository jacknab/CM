#!/bin/bash
set -e

ROOT_DIR="/apps/CM"
PM2_APP_NAME="certxa-api"

# Load system environment (includes Redis credentials on this host)
if [ -f /etc/certxa.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/certxa.env
  set +a
  echo "Loaded environment from /etc/certxa.env"
fi

echo "========================================"
echo "  Building all applications..."
echo "========================================"

# ---- 1. API Server ----
echo ""
echo "[1/3] Building API Server..."
cd "$ROOT_DIR/artifacts/api-server"
pnpm run build
echo "  ✓ API Server built"

# ---- 2. Booking Frontend ----
echo ""
echo "[2/3] Building Booking Frontend..."
cd "$ROOT_DIR/artifacts/booking"
npx vite build --config vite.config.ts
echo "  ✓ Booking Frontend built"

# ---- 3. Website Builder ----
echo ""
echo "[3/3] Building Website Builder..."
cd "$ROOT_DIR/artifacts/website-builder"
npx vite build --config vite.config.ts
echo "  ✓ Website Builder built"

echo ""
echo "========================================"
echo "  All builds complete!"
echo "========================================"

# ---- Restart API Server (PM2-managed) ----
echo ""
echo "Restarting API Server..."
echo "  Restarting PM2 app: $PM2_APP_NAME"
pm2 restart "$PM2_APP_NAME" --update-env
pm2 save >/dev/null
echo "  ✓ PM2 app restarted and saved"

echo ""
echo "========================================"
echo "  Done! API Server build complete and PM2 app restarted"
echo "========================================"

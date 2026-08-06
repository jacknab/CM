#!/bin/bash
set -e

trap 'kill $(jobs -p) 2>/dev/null; exit' SIGTERM SIGINT EXIT

# ── Bootstrap ─────────────────────────────────────────────────────────────────
(
  flock -x 200
  if [ ! -d "node_modules" ]; then
    echo "[owner-app] node_modules missing — running pnpm install..."
    pnpm install --no-frozen-lockfile
    echo "[owner-app] pnpm install complete."
  fi
) 200>/tmp/pnpm-workspace-install.lock

# ── Copy assets from staff-mobile if missing ──────────────────────────────────
if [ ! -d "apps/certxa-owner/assets" ]; then
  echo "[owner-app] Copying assets from staff-mobile..."
  cp -r apps/staff-mobile/assets apps/certxa-owner/assets
fi

# ── Platform environment ──────────────────────────────────────────────────────
if [ -f /etc/certxa.env ]; then
  echo "[owner-app] Loading environment from /etc/certxa.env..."
  set -a
  source /etc/certxa.env
  set +a
fi

# ── Portal URL ────────────────────────────────────────────────────────────────
# The WebView loads this URL. On Replit, use the dev domain.
# On production, set OWNER_APP_PORTAL_URL in /etc/certxa.env.
if [ -n "${OWNER_APP_PORTAL_URL:-}" ]; then
  export EXPO_PUBLIC_PORTAL_URL="$OWNER_APP_PORTAL_URL"
  echo "[owner-app] Using OWNER_APP_PORTAL_URL: $EXPO_PUBLIC_PORTAL_URL"
elif [ -n "${REPLIT_DEV_DOMAIN:-}" ]; then
  export EXPO_PUBLIC_PORTAL_URL="https://${REPLIT_DEV_DOMAIN}"
  echo "[owner-app] Using Replit dev domain: $EXPO_PUBLIC_PORTAL_URL"
elif [ -n "${APP_URL:-}" ]; then
  export EXPO_PUBLIC_PORTAL_URL="$APP_URL"
  echo "[owner-app] Using APP_URL: $EXPO_PUBLIC_PORTAL_URL"
else
  export EXPO_PUBLIC_PORTAL_URL="https://certxa.com"
  echo "[owner-app] WARNING: No portal URL found, using https://certxa.com"
fi

export EXPO_NO_TELEMETRY=1
export REACT_NATIVE_START_DEVTOOLS=false
export BROWSER=none
export EXPO_NO_DOCTOR=1
export EXPO_NO_DEPENDENCY_VALIDATION=1
unset CI

# ── Ensure port 8084 is free ──────────────────────────────────────────────────
if fuser 8084/tcp > /dev/null 2>&1; then
  echo "[owner-app] Port 8084 in use — clearing..."
  fuser -k 8084/tcp > /dev/null 2>&1 || true
  sleep 1
fi

# ── ngrok auth ────────────────────────────────────────────────────────────────
if [ -n "${NGROK_AUTHTOKEN:-}" ]; then
  NGROK_BIN=$(find node_modules -name "ngrok" -type f -path "*/bin/*" 2>/dev/null | head -1 || true)
  if [ -n "$NGROK_BIN" ]; then
    "$NGROK_BIN" config add-authtoken "$NGROK_AUTHTOKEN" > /dev/null 2>&1 || true
  fi
fi

echo "[owner-app] Starting Certxa Owner App on port 8084..."
cd apps/certxa-owner
pnpm start

#!/bin/bash
set -e

trap 'kill $(jobs -p) 2>/dev/null; exit' SIGTERM SIGINT EXIT

# ── Bootstrap — install workspace dependencies if node_modules are missing ────
# Use flock so concurrent workflow starts don't race on pnpm install
(
  flock -x 200
  if [ ! -d "node_modules" ]; then
    echo "[mobile-start] node_modules missing — running pnpm install..."
    pnpm install --no-frozen-lockfile
    echo "[mobile-start] pnpm install complete."
  fi
) 200>/tmp/pnpm-workspace-install.lock

# ── Platform environment file ─────────────────────────────────────────────────
# On the VPS this file holds APP_URL, MOBILE_API_URL, NGROK_AUTHTOKEN, etc.
# Set MOBILE_API_URL in /etc/certxa.env to explicitly control the API endpoint
# for the mobile app (useful when APP_URL is a private/internal address).
# Example: MOBILE_API_URL=https://certxa.com
if [ -f /etc/certxa.env ]; then
  echo "[mobile-start] Loading environment from /etc/certxa.env..."
  set -a
  # shellcheck source=/dev/null
  source /etc/certxa.env
  set +a
fi

# ── API URL ───────────────────────────────────────────────────────────────────
# Resolution order (first non-empty wins):
#   1. MOBILE_API_URL    — explicit override in /etc/certxa.env (recommended on VPS)
#   2. REPLIT_DEV_DOMAIN — Replit preview URL (set automatically on Replit)
#   3. APP_URL           — public API URL from /etc/certxa.env
#
# On VPS: if APP_URL is a server-local/IP address (e.g. http://10.0.0.1:9200),
# add MOBILE_API_URL=https://yourcertxadomain.com to /etc/certxa.env so the
# mobile app reaches the API via the public domain name instead.
if [ -n "${MOBILE_API_URL:-}" ]; then
  export EXPO_PUBLIC_API_URL="$MOBILE_API_URL"
  echo "[mobile-start] Using MOBILE_API_URL from /etc/certxa.env"
elif [ -n "${REPLIT_DEV_DOMAIN:-}" ]; then
  export EXPO_PUBLIC_API_URL="https://${REPLIT_DEV_DOMAIN}"
elif [ -n "${APP_URL:-}" ]; then
  # Warn if APP_URL looks like a bare IP address (not a domain name)
  if echo "$APP_URL" | grep -qE 'https?://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+'; then
    echo "[mobile-start] WARNING: APP_URL appears to be an IP address (${APP_URL})."
    echo "[mobile-start]   Add MOBILE_API_URL=https://your-domain.com to /etc/certxa.env"
    echo "[mobile-start]   to point the mobile app at your public domain instead."
  fi
  export EXPO_PUBLIC_API_URL="$APP_URL"
else
  echo "[mobile-start] WARNING: Could not derive EXPO_PUBLIC_API_URL."
  echo "[mobile-start]   Add MOBILE_API_URL=https://yourcertxadomain.com to /etc/certxa.env"
fi
echo "[mobile-start] EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-}"

export EXPO_NO_TELEMETRY=1
export REACT_NATIVE_START_DEVTOOLS=false
export BROWSER=none
# Skip Expo doctor network fetches at startup (can fail on some VPS/network paths
# and prevent tunnel startup + QR output even when app dependencies are valid).
export EXPO_NO_DOCTOR=1
# Skip Expo dependency validation network calls (CLI calls Expo API and can throw
# `TypeError: fetch failed`, aborting startup before QR output).
export EXPO_NO_DEPENDENCY_VALIDATION=1

# Expo hides the QR code when CI=1. Unset it so the QR prints.
unset CI

# ── Ensure default Metro port is free ─────────────────────────────────────────
# Kill anything already bound to 8082 so Expo can start cleanly on the expected
# port before we fall back to alternates. Certxa POS owns 8083, so Staff Mobile
# must not compete for it.
if fuser 8082/tcp > /dev/null 2>&1; then
  echo "[mobile-start] Port 8082 is in use — terminating existing process(es)..."
  fuser -k 8082/tcp > /dev/null 2>&1 || true
  sleep 1
fi

# ── Authenticate ngrok (v3 binary replaces bundled v2) ───────────────────────
# The @expo/ngrok-bin binary has been replaced with ngrok v3 which supports
# free accounts (v2.3.41 was too old and rejected by ngrok.com).
# Auth token is saved to ~/.config/ngrok/ngrok.yml by ngrok v3.
if [ -n "${NGROK_AUTHTOKEN:-}" ]; then
  echo "[mobile-start] Configuring ngrok auth..."
  NGROK_BIN="node_modules/.pnpm/@expo+ngrok-bin-linux-x64@2.3.41/node_modules/@expo/ngrok-bin-linux-x64/ngrok"
  if [ -f "$NGROK_BIN" ]; then
    "$NGROK_BIN" config add-authtoken "$NGROK_AUTHTOKEN" > /dev/null 2>&1 || true
  fi
fi

# Decide Expo network mode.
# Tunnel requires ngrok auth; when missing, Expo can crash during tunnel setup.
EXPO_NETWORK_MODE="--tunnel"
if [ -z "${NGROK_AUTHTOKEN:-}" ]; then
  EXPO_NETWORK_MODE="--lan"
  echo "[mobile-start] NGROK_AUTHTOKEN is not set — falling back to LAN mode."
fi

# ── Silence the dotslash DevTools noise ──────────────────────────────────────
mkdir -p /tmp/certxa-stubs
cat > /tmp/certxa-stubs/dotslash << 'EOF'
#!/bin/bash
exit 0
EOF
chmod +x /tmp/certxa-stubs/dotslash
export PATH="/tmp/certxa-stubs:$PATH"

# ── Patch @tanstack/query-core exports ────────────────────────────────────────
# NOTE: metro.config.js already sets unstable_enablePackageExports=false which
# forces Metro to use the `main` field (legacy Hermes-safe CJS build) rather than
# the package exports field (modern build that uses private class fields).
# This runtime patch is kept as a belt-and-suspenders fallback for edge cases
# where the resolver setting alone isn't enough (e.g. symlinked paths in pnpm).
echo "[mobile-start] Patching @tanstack/query-core exports → legacy build..."
node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let found = [];
try {
  found = execSync(\"find node_modules -name 'package.json' -path '*/query-core/package.json' 2>/dev/null\")
    .toString().trim().split('\n').filter(Boolean);
} catch (_) {}

const targets = new Set(found);
for (const f of found) {
  try {
    const real = fs.realpathSync(path.dirname(f));
    targets.add(path.join(real, 'package.json'));
  } catch (_) {}
}

for (const pkgJsonPath of targets) {
  try {
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (!pkg.exports || !pkg.exports['.']) continue;
    if (pkg.exports['.'].require && pkg.exports['.'].require.default === './build/legacy/index.cjs') {
      console.log('  already patched:', pkgJsonPath);
      continue;
    }
    pkg.exports['.'].import = {
      types: './build/legacy/index.d.ts',
      default: './build/legacy/index.js',
    };
    pkg.exports['.'].require = {
      types: './build/legacy/index.d.cts',
      default: './build/legacy/index.cjs',
    };
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2));
    console.log('  patched:', pkgJsonPath);
  } catch (e) {
    console.warn('  could not patch:', pkgJsonPath, e.message);
  }
}
"

# ── Find a free Metro port ────────────────────────────────────────────────────
METRO_PORT=8082
for p in 8082 8088 8089 8090; do
  if ! fuser "${p}/tcp" > /dev/null 2>&1; then
    METRO_PORT=$p
    break
  fi
done
echo "[mobile-start] Using Metro port ${METRO_PORT}..."
if [ "$EXPO_NETWORK_MODE" = "--tunnel" ]; then
  echo "[mobile-start] Starting Expo in tunnel mode (QR code will work from any network)..."
else
  echo "[mobile-start] Starting Expo in LAN mode (same network required for QR access)..."
fi

# ── Raise inotify watcher limit (ENOSPC guard) ───────────────────────────────
# Metro watches the entire node_modules tree; the default limit (~8192) is too
# low for a pnpm monorepo. Increase it if we have permission; fail silently if
# not (the OS default is already as high as it goes in that case).
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf > /dev/null 2>&1 || true
sudo sysctl -p > /dev/null 2>&1 || true
# Attempt via procfs directly as a fallback (works on some Linux containers)
echo 524288 | sudo tee /proc/sys/fs/inotify/max_user_watches > /dev/null 2>&1 || true

# ── Start Expo ────────────────────────────────────────────────────────────────
exec pnpm --filter @workspace/staff-mobile exec expo start \
  "$EXPO_NETWORK_MODE" \
  --port "${METRO_PORT}" \
  --clear

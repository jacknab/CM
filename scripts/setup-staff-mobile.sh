#!/usr/bin/env bash
# =============================================================================
# Certxa Staff Mobile — VPS Setup & Start Script
# Run from the project root: bash scripts/setup-staff-mobile.sh
#
# What this script does:
#   1. Asks for an optional ngrok URL (press Enter to skip)
#   2. Asks for the API base URL  (default: https://certxa.com)
#   3. Picks a free Metro port    (default: 8082)
#   4. Installs dependencies
#   5. Patches @tanstack/query-core → Hermes-safe legacy build
#   6. Starts Expo in --lan mode so Expo Go on your phone can connect
#
# Prerequisites on the VPS:
#   - The Metro port (default 8082) must be open in your firewall / UFW rules.
#     e.g.  ufw allow 8082/tcp
#   - The API server must be running and reachable at the URL you provide.
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

log()    { echo -e "${CYAN}[staff-mobile]${RESET} $*"; }
ok()     { echo -e "${GREEN}[staff-mobile] ✓${RESET} $*"; }
warn()   { echo -e "${YELLOW}[staff-mobile] ⚠${RESET} $*"; }
die()    { echo -e "${RED}[staff-mobile] ✗${RESET} $*" >&2; exit 1; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${CYAN}  $*${RESET}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
}

header "Certxa Staff Mobile Setup"

# ── Platform environment file ─────────────────────────────────────────────────
if [ -f /etc/certxa.env ]; then
  echo -e "${CYAN}[staff-mobile]${RESET} Loading environment from /etc/certxa.env..."
  set -a
  # shellcheck source=/dev/null
  source /etc/certxa.env
  set +a
fi

# ── 1. Verify project root ────────────────────────────────────────────────────
log "Checking project root..."
MOBILE_DIR="apps/staff-mobile"
if [[ ! -f "pnpm-workspace.yaml" ]] || [[ ! -d "$MOBILE_DIR" ]]; then
  die "Run this script from the Certxa project root (the folder containing pnpm-workspace.yaml)."
fi
ok "Project root verified."

# ── 2. Node.js ────────────────────────────────────────────────────────────────
log "Checking Node.js..."
if ! command -v node &>/dev/null; then
  die "Node.js is not installed. Install Node.js 20+ from https://nodejs.org"
fi
NODE_VER=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if (( NODE_VER < 20 )); then
  die "Node.js ${NODE_VER} found — version 20+ is required."
fi
ok "Node.js $(node -v) found."

# ── 3. pnpm ───────────────────────────────────────────────────────────────────
log "Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — installing via npm..."
  npm install -g pnpm || die "Failed to install pnpm."
fi
ok "pnpm $(pnpm -v) found."

# ── 4. Interactive: ngrok tunnel URL ─────────────────────────────────────────
header "Tunnel (optional)"
echo ""
echo -e "  If you have ${BOLD}ngrok${RESET} running, enter its HTTPS URL so the QR code"
echo -e "  points through the tunnel (useful when the phone can't reach the VPS)."
echo -e "  Press ${BOLD}Enter${RESET} to skip — Metro will be served directly on the VPS hostname."
echo ""
read -r -p "  ngrok HTTPS URL (or press Enter to skip): " NGROK_URL
NGROK_URL="${NGROK_URL:-}"

if [[ -n "$NGROK_URL" ]]; then
  # Strip trailing slash
  NGROK_URL="${NGROK_URL%/}"
  ok "Using ngrok tunnel: ${NGROK_URL}"
else
  ok "No tunnel — will use the VPS public hostname for Metro."
fi

# ── 5. Interactive: API base URL ──────────────────────────────────────────────
header "API Configuration"
echo ""
echo -e "  Enter the public URL of your Certxa API server."
echo -e "  Press ${BOLD}Enter${RESET} to use the default: ${BOLD}https://certxa.com${RESET}"
echo ""
read -r -p "  API base URL [https://certxa.com]: " INPUT_API_URL
API_URL="${INPUT_API_URL:-https://certxa.com}"
API_URL="${API_URL%/}"   # strip trailing slash

export EXPO_PUBLIC_API_URL="$API_URL"
ok "EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}"

log "Checking API reachability at ${API_URL}/api/healthz ..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/healthz" 2>/dev/null || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  ok "API is reachable (HTTP ${HTTP_STATUS})."
elif [[ "$HTTP_STATUS" == "000" ]]; then
  warn "Could not reach ${API_URL}/api/healthz — is the API server running?"
else
  warn "API returned HTTP ${HTTP_STATUS} — double-check the URL if login fails."
fi

# ── 6. Interactive: Metro port ────────────────────────────────────────────────
header "Port Selection"
EXPO_PORT=8082
while true; do
  if ! lsof -i ":${EXPO_PORT}" &>/dev/null 2>&1; then
    ok "Using port ${EXPO_PORT}."
    break
  fi
  echo ""
  warn "Port ${EXPO_PORT} is already in use."
  read -r -p "  Try port $((EXPO_PORT + 1)) instead? [Y/n]: " ANSWER
  ANSWER="${ANSWER:-y}"
  if [[ "$ANSWER" =~ ^[Yy] ]]; then
    EXPO_PORT=$((EXPO_PORT + 1))
  else
    read -r -p "  Enter a port number to use: " EXPO_PORT
  fi
done

# Check whether the chosen port is open in UFW (best-effort, non-fatal)
if command -v ufw &>/dev/null; then
  if ufw status 2>/dev/null | grep -q "^${EXPO_PORT}"; then
    ok "UFW: port ${EXPO_PORT} is open."
  else
    warn "UFW may be blocking port ${EXPO_PORT}."
    warn "If Expo Go can't connect, run:  ufw allow ${EXPO_PORT}/tcp"
  fi
fi

# ── 7. Install dependencies ───────────────────────────────────────────────────
header "Installing Dependencies"
log "Running pnpm install..."
pnpm install --frozen-lockfile 2>&1 | tail -5 || {
  warn "Frozen lockfile install failed — retrying without lock..."
  pnpm install 2>&1 | tail -5
}
ok "Dependencies installed."

# ── 8. Patch @tanstack/query-core → Hermes-safe legacy build ─────────────────
# @tanstack/query-core v5 ships two builds:
#   build/legacy/index.cjs  — ES2015, NO private class fields  ← Hermes-safe
#   build/modern/index.cjs  — modern,  HAS private class fields  ← crashes iOS
# Metro resolves via the package `exports` field → modern build → Hermes throws
#   "SyntaxError: private properties are not supported" on iPhone.
# Fix: rewrite the package.json exports to point at the legacy build.
header "Patching @tanstack/query-core → legacy build"
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

for (const p of targets) {
  try {
    if (!fs.existsSync(p)) continue;
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!pkg.exports || !pkg.exports['.']) continue;
    if (pkg.exports['.'].require && pkg.exports['.'].require.default === './build/legacy/index.cjs') {
      console.log('  already patched:', p); continue;
    }
    pkg.exports['.'].import  = { types: './build/legacy/index.d.ts',  default: './build/legacy/index.js' };
    pkg.exports['.'].require = { types: './build/legacy/index.d.cts', default: './build/legacy/index.cjs' };
    pkg.exports['./build/legacy/index.cjs'] = './build/legacy/index.cjs';
    pkg.exports['./build/legacy/index.js']  = './build/legacy/index.js';
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
    console.log('  patched:', p);
  } catch (e) { console.warn('  could not patch:', p, e.message); }
}
"

# Verify the patch
node -e "
const fs = require('fs');
const { execSync } = require('child_process');
let found = [];
try {
  found = execSync(\"find node_modules -name 'package.json' -path '*/query-core/package.json' 2>/dev/null\")
    .toString().trim().split('\n').filter(Boolean);
} catch (_) {}
if (!found.length) { console.log('  [verify] no query-core packages found (ok)'); process.exit(0); }
let ok = true;
for (const p of found) {
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const d = pkg.exports && pkg.exports['.'] && pkg.exports['.'].require && pkg.exports['.'].require.default;
    if (d !== './build/legacy/index.cjs') { console.warn('  [verify] WARN — still resolves to:', d, 'in', p); ok = false; }
  } catch (_) {}
}
if (ok) console.log('  [verify] OK — @tanstack/query-core → legacy build');
"

# ── 9. Determine Metro hostname ───────────────────────────────────────────────
# The QR code must advertise an address reachable from the phone:
#   - ngrok mode: use the ngrok hostname (tunnel handles the routing)
#   - direct mode: use the API server hostname (VPS public IP or domain)
if [[ -n "$NGROK_URL" ]]; then
  METRO_HOST=$(echo "$NGROK_URL" | sed 's|^https\?://||' | sed 's|/.*||')
else
  METRO_HOST=$(echo "$API_URL" | sed 's|^https\?://||' | sed 's|/.*||')
fi

# ── 10. Start Expo ────────────────────────────────────────────────────────────
header "Starting Expo"
echo ""
echo -e "  ${BOLD}API URL:${RESET}    ${EXPO_PUBLIC_API_URL}"
echo -e "  ${BOLD}Port:${RESET}       ${EXPO_PORT}"
if [[ -n "$NGROK_URL" ]]; then
  echo -e "  ${BOLD}Tunnel:${RESET}     ${NGROK_URL}"
  echo -e "  ${BOLD}Mode:${RESET}       tunnel — QR code points through ngrok"
else
  echo -e "  ${BOLD}Metro host:${RESET} ${METRO_HOST}:${EXPO_PORT}"
  echo -e "  ${BOLD}Mode:${RESET}       direct — Expo Go connects straight to the VPS"
fi
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "  1. Wait for a QR code to appear below"
echo -e "  2. Install ${BOLD}Expo Go${RESET} on your phone (App Store / Google Play)"
echo -e "  3. iOS: scan with the Camera app | Android: scan inside Expo Go"
echo -e "  4. First load takes ~30–60 seconds to bundle"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop the server${RESET}"
echo ""

# Suppress telemetry prompts on non-TTY shells
export EXPO_NO_TELEMETRY=1

# Tell React Native NOT to auto-launch the DevTools Electron app.
# On a headless VPS there is no display, so the launch would fail.
# Setting this env var prevents the attempt entirely — no stub files
# needed, and no dotslash parse errors.
export REACT_NATIVE_START_DEVTOOLS=false
export EXPO_NO_DEV_CLIENT=0   # keep dev client enabled, just no DevTools window

# Skip Expo doctor and dependency-validation network calls.
# Both steps try to reach api.expo.dev at startup; on a VPS without outbound
# access to Expo's servers this throws "TypeError: fetch failed" and aborts
# before the QR code is ever printed. The installed packages are already
# correct — we don't need the online check.
export EXPO_NO_DOCTOR=1
export EXPO_NO_DEPENDENCY_VALIDATION=1

# Advertise the correct hostname in the QR code
export REACT_NATIVE_PACKAGER_HOSTNAME="${METRO_HOST}"

if [[ -n "$NGROK_URL" ]]; then
  exec pnpm --filter @workspace/staff-mobile exec expo start \
    --port "${EXPO_PORT}" \
    --tunnel \
    --clear
else
  exec pnpm --filter @workspace/staff-mobile exec expo start \
    --port "${EXPO_PORT}" \
    --lan \
    --clear
fi

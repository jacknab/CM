#!/bin/bash
# =============================================================================
# build-owner-app.sh — Build the Certxa Owner Android app via EAS
#
# Usage:
#   bash scripts/build-owner-app.sh               # preview APK (default)
#   bash scripts/build-owner-app.sh preview        # preview APK (sideload/test)
#   bash scripts/build-owner-app.sh production     # production AAB (Play Store)
#   bash scripts/build-owner-app.sh staging        # staging APK
#
# What each profile produces:
#   preview    → .apk  — download and sideload on any Android device to test
#   staging    → .apk  — same but points at staging.certxa.com
#   production → .aab  — upload to Google Play Console
# =============================================================================

set -e

# ── Load /etc/certxa.env if present (VPS environment — sets EXPO_TOKEN etc.) ──
if [ -f /etc/certxa.env ]; then
  set -a
  # shellcheck source=/dev/null
  source /etc/certxa.env
  set +a
fi

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[build]${NC} $*"; }
success() { echo -e "${GREEN}[build]${NC} $*"; }
warn()    { echo -e "${YELLOW}[build]${NC} $*"; }
error()   { echo -e "${RED}[build] ERROR:${NC} $*"; exit 1; }
banner()  { echo -e "\n${BOLD}$*${NC}"; }

# ── Profile argument ──────────────────────────────────────────────────────────
PROFILE="${1:-preview}"

case "$PROFILE" in
  preview|staging|production) ;;
  *) error "Unknown profile '$PROFILE'. Use: preview | staging | production" ;;
esac

# ── Banner ────────────────────────────────────────────────────────────────────
clear 2>/dev/null || true
banner "╔══════════════════════════════════════════════════╗"
banner "║       Certxa Owner App — Android Build           ║"
banner "╚══════════════════════════════════════════════════╝"
echo ""
info "Profile  : ${BOLD}${PROFILE}${NC}"

case "$PROFILE" in
  preview)    info "Output   : .apk  (sideload on device to test)"
              info "Portal   : https://certxa.com" ;;
  staging)    info "Output   : .apk  (sideload on device to test)"
              info "Portal   : https://staging.certxa.com" ;;
  production) info "Output   : .aab  (upload to Google Play Console)"
              info "Portal   : https://certxa.com" ;;
esac
echo ""

# ── Check we are in the repo root ─────────────────────────────────────────────
if [ ! -d "apps/certxa-owner" ]; then
  error "Run this script from the repo root (the folder containing apps/, scripts/, etc.)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Install EAS CLI
# ─────────────────────────────────────────────────────────────────────────────
banner "Step 1 — EAS CLI"

if command -v eas &>/dev/null; then
  EAS_VERSION=$(eas --version 2>/dev/null | head -1 || echo "installed")
  success "Already installed: $EAS_VERSION"
else
  info "Installing EAS CLI globally (this takes ~30 seconds)..."
  npm install -g eas-cli --quiet
  if ! command -v eas &>/dev/null; then
    # npm global bin might not be on PATH; try npx fallback
    warn "eas not on PATH after install — using npx fallback."
    EAS_CMD="npx eas-cli@latest"
  else
    success "EAS CLI installed."
  fi
fi

# Use 'eas' if on PATH, otherwise fall back to npx
EAS_CMD="${EAS_CMD:-eas}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Expo account login
# ─────────────────────────────────────────────────────────────────────────────
banner "Step 2 — Expo account"

# If EXPO_TOKEN is set, EAS uses it automatically — no interactive login needed.
if [ -n "${EXPO_TOKEN:-}" ]; then
  success "EXPO_TOKEN detected — skipping interactive login."
else
  # Check if already logged in
  if ! $EAS_CMD whoami &>/dev/null 2>&1; then
    echo ""
    info "You need to log in to your Expo account."
    info "Enter your expo.dev email and password when prompted."
    echo ""
    $EAS_CMD login
    echo ""
  fi
fi

# Always resolve the account name (works for both token and password login)
EAS_USER=$($EAS_CMD whoami 2>/dev/null | tr -d '[:space:]' || echo "your-account")
success "Logged in as: ${BOLD}${EAS_USER}${NC}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Project check
# ─────────────────────────────────────────────────────────────────────────────
banner "Step 3 — Project"

cd apps/certxa-owner

PROJECT_ID=$(node -e "
  try {
    const a = require('./app.json');
    console.log(a.expo?.extra?.eas?.projectId ?? '');
  } catch(e) { console.log(''); }
" 2>/dev/null || echo "")

if [ -n "$PROJECT_ID" ]; then
  success "Project linked: ${PROJECT_ID}"
else
  info "Linking project to EAS (one-time setup)..."
  $EAS_CMD init --id 27660910-dc59-41fb-89d8-2a2a6e22754e --non-interactive 2>/dev/null || \
  $EAS_CMD build:configure --platform android --non-interactive || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Build
# ─────────────────────────────────────────────────────────────────────────────
banner "Step 4 — Building..."
echo ""
info "Submitting build to EAS cloud servers."
info "The build runs remotely — you can close the terminal and check"
info "progress at ${BOLD}https://expo.dev/accounts/${EAS_USER:-your-account}/projects/certxa-owner/builds${NC}"
echo ""

$EAS_CMD build \
  --platform android \
  --profile "$PROFILE" \
  --non-interactive

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
echo ""
banner "╔══════════════════════════════════════════════════╗"
banner "║              Build submitted! ✓                  ║"
banner "╚══════════════════════════════════════════════════╝"
echo ""

case "$PROFILE" in
  preview|staging)
    success "Your APK will be ready in ~10–20 minutes."
    echo ""
    echo -e "  ${CYAN}To install on your Android device:${NC}"
    echo -e "  1. Go to ${BOLD}https://expo.dev${NC} → your project → Builds"
    echo -e "     (or scan the QR code printed above)"
    echo -e "  2. Download the ${BOLD}.apk${NC} file"
    echo -e "  3. On your Android device:"
    echo -e "       Settings → Apps → Special App Access → Install Unknown Apps"
    echo -e "       Allow your browser or Files app to install"
    echo -e "  4. Open the .apk and tap ${BOLD}Install${NC}"
    echo -e "  5. Open ${BOLD}Certxa${NC} from your home screen"
    ;;
  production)
    success "Your AAB will be ready in ~10–20 minutes."
    echo ""
    echo -e "  ${CYAN}To submit to the Play Store:${NC}"
    echo -e "  1. Go to ${BOLD}https://expo.dev${NC} → your project → Builds"
    echo -e "  2. Download the ${BOLD}.aab${NC} file"
    echo -e "  3. Go to ${BOLD}https://play.google.com/console${NC}"
    echo -e "  4. Your app → Testing → Internal Testing → Create new release"
    echo -e "  5. Upload the .aab"
    ;;
esac

echo ""

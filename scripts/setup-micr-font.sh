#!/usr/bin/env bash
# =============================================================================
# setup-micr-font.sh — Download and install the GnuMICR E-13B font
#
# Run once on the VPS / CI server before starting the application.
# The font is placed at artifacts/booking/public/fonts/micr-e13b.otf
# and served as a static file by the Vite booking app.
#
# Font: GnuMICR by Steve Sandeen (GPL-2.0-or-later)
# Docs: artifacts/booking/MICR_FONT.md
# =============================================================================
set -euo pipefail

DEST_DIR="artifacts/booking/public/fonts"
DEST_FILE="$DEST_DIR/micr-e13b.otf"

# Change to repo root regardless of where this script is called from
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

mkdir -p "$DEST_DIR"

# ── Skip if already installed ─────────────────────────────────────────────────
if [ -f "$DEST_FILE" ] && file "$DEST_FILE" 2>/dev/null | grep -qiE "OpenType|TrueType|font"; then
  echo "✓ MICR font already installed at $DEST_FILE"
  echo "  To reinstall, delete the file and run this script again."
  exit 0
fi

echo "Installing GnuMICR E-13B font..."
echo ""

# ── Attempt 1: CTAN primary + mirrors ────────────────────────────────────────
CTAN_URLS=(
  "https://mirrors.ctan.org/fonts/gnumicr/GnuMICR.otf"
  "https://ctan.math.illinois.edu/fonts/gnumicr/GnuMICR.otf"
  "https://ctan.math.utah.edu/ctan/tex-archive/fonts/gnumicr/GnuMICR.otf"
  "https://ftp.rrzn.uni-hannover.de/pub/mirror/tex-archive/fonts/gnumicr/GnuMICR.otf"
  "https://ctan.math.washington.edu/tex-archive/fonts/gnumicr/GnuMICR.otf"
  "https://ftp.yz.yamagata-u.ac.jp/pub/CTAN/fonts/gnumicr/GnuMICR.otf"
  "https://mirror.las.iastate.edu/tex-archive/fonts/gnumicr/GnuMICR.otf"
  "https://www.sandeen.net/gnumicr/GnuMICR.otf"
)

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

for url in "${CTAN_URLS[@]}"; do
  printf "  Trying %-70s ... " "$url"
  if curl -fsSL --max-time 30 --retry 2 "$url" -o "$TMP" 2>/dev/null; then
    if file "$TMP" 2>/dev/null | grep -qiE "OpenType|TrueType|font"; then
      cp "$TMP" "$DEST_FILE"
      echo "✓"
      echo ""
      echo "✓ GnuMICR installed: $DEST_FILE ($(wc -c < "$DEST_FILE") bytes)"
      exit 0
    fi
  fi
  echo "✗"
done

# ── Attempt 2: texlive-fonts-extra (Debian/Ubuntu) ───────────────────────────
echo ""
echo "  Direct download failed.  Trying texlive-fonts-extra..."
if command -v apt-get &>/dev/null; then
  sudo apt-get install -y texlive-fonts-extra 2>/dev/null && \
  found=$(find /usr/share/texmf /usr/share/texlive -name "GnuMICR.otf" 2>/dev/null | head -1)
  if [ -n "$found" ]; then
    cp "$found" "$DEST_FILE"
    echo "✓ GnuMICR installed from texlive: $DEST_FILE"
    exit 0
  fi
fi

# ── Attempt 3: MacTeX (macOS) ─────────────────────────────────────────────────
if command -v kpsewhich &>/dev/null; then
  found=$(kpsewhich GnuMICR.otf 2>/dev/null)
  if [ -n "$found" ]; then
    cp "$found" "$DEST_FILE"
    echo "✓ GnuMICR found via kpsewhich: $DEST_FILE"
    exit 0
  fi
fi

# ── All methods failed ────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  ERROR: Could not install the GnuMICR MICR E-13B font.       ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║                                                               ║"
echo "║  Manual installation (any ONE of the following):             ║"
echo "║                                                               ║"
echo "║  Option A — Download manually:                                ║"
echo "║    1. Visit https://www.sandeen.net/gnumicr/                  ║"
echo "║    2. Download GnuMICR.otf                                    ║"
echo "║    3. Copy to: $DEST_FILE"
echo "║                                                               ║"
echo "║  Option B — Debian/Ubuntu:                                    ║"
echo "║    sudo apt-get install texlive-fonts-extra                   ║"
echo "║    find /usr/share/texlive -name GnuMICR.otf \\               ║"
echo "║      | xargs -I{} cp {} $DEST_FILE"
echo "║                                                               ║"
echo "║  Option C — macOS (MacTeX):                                   ║"
echo "║    brew install --cask mactex-no-gui                         ║"
echo "║    kpsewhich GnuMICR.otf | xargs -I{} cp {} $DEST_FILE"
echo "║                                                               ║"
echo "║  See MICR_FONT.md for licensing information.                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
exit 1

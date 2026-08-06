#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-voice-nginx.sh
#
# Deploys the certxa.com Nginx configuration on your VPS and verifies that
# the AI receptionist is reachable at voice.certxa.com.
#
# Run from the directory containing nginx-mysalon.conf:
#   sudo bash deploy-voice-nginx.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CONF_SRC="nginx-mysalon.conf"
CONF_DEST="/etc/nginx/sites-available/certxa.com"
CONF_LINK="/etc/nginx/sites-enabled/certxa.com"
HEALTH_URL="https://voice.certxa.com/api/ai-receptionist/health"
HOOK_FILE="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC}  $*"; }
info() { echo -e "${CYAN}→${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}   $*"; }
fail() { echo -e "${RED}✗${NC}  $*"; exit 1; }

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   voice.certxa.com — Nginx deployment                ${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

# ── 1. Sanity checks ──────────────────────────────────────────────────────────
info "Checking prerequisites..."

[[ $EUID -eq 0 ]] || fail "Must be run as root. Use: sudo bash $0"
command -v nginx &>/dev/null || fail "Nginx is not installed (apt install nginx)"
[[ -f "$CONF_SRC" ]] || fail "'$CONF_SRC' not found in $(pwd) — copy it here first"

ok "Prerequisites OK"
echo ""

# ── 2. Verify SSL certificate exists ─────────────────────────────────────────
info "Checking SSL certificate..."
CERT_PATH="/etc/letsencrypt/live/certxa.com/fullchain.pem"
if [[ ! -f "$CERT_PATH" ]]; then
    echo ""
    fail "SSL certificate not found at $CERT_PATH\n\n" \
         "       Issue a wildcard cert with:\n" \
         "       certbot certonly --nginx -d certxa.com -d '*.certxa.com'"
fi
ok "SSL certificate found: $CERT_PATH"
echo ""

# ── 3. Back up existing config if present ─────────────────────────────────────
if [[ -f "$CONF_DEST" ]]; then
    BACKUP="${CONF_DEST}.bak.$(date +%Y%m%d_%H%M%S)"
    info "Backing up existing config to $BACKUP..."
    cp "$CONF_DEST" "$BACKUP"
    ok "Backup created"
fi

# ── 4. Install the config ─────────────────────────────────────────────────────
info "Installing config → $CONF_DEST..."
cp "$CONF_SRC" "$CONF_DEST"
ok "Config installed"

# ── 5. Enable the site ───────────────────────────────────────────────────────
info "Enabling site symlink → $CONF_LINK..."
ln -sf "$CONF_DEST" "$CONF_LINK"
ok "Site enabled"
echo ""

# ── 6. Test Nginx config ──────────────────────────────────────────────────────
info "Testing Nginx configuration syntax..."
echo ""
if nginx -t; then
    echo ""
    ok "Nginx config test passed"
else
    echo ""
    # Restore backup if we made one
    if [[ -n "${BACKUP:-}" && -f "$BACKUP" ]]; then
        warn "Restoring previous config from backup..."
        cp "$BACKUP" "$CONF_DEST"
        systemctl reload nginx 2>/dev/null || true
    fi
    fail "Nginx config test FAILED — previous config restored (if backup existed)"
fi
echo ""

# ── 7. Reload Nginx ───────────────────────────────────────────────────────────
info "Reloading Nginx..."
systemctl reload nginx
ok "Nginx reloaded"
echo ""

# ── 8. Verify API server is listening on port 5000 ───────────────────────────
info "Checking API server on port 5000..."
if command -v ss &>/dev/null && ss -tlnp 2>/dev/null | grep -q ':5000'; then
    ok "API server is listening on port 5000"
elif command -v netstat &>/dev/null && netstat -tlnp 2>/dev/null | grep -q ':5000'; then
    ok "API server is listening on port 5000"
else
    warn "Could not confirm API server on port 5000 — make sure it is running"
    warn "Start it with: systemctl start certxa-api  (or however you run it)"
fi
echo ""

# ── 9. Health check via HTTPS ─────────────────────────────────────────────────
if command -v curl &>/dev/null; then
    info "Waiting 2 seconds then hitting health endpoint..."
    sleep 2

    HTTP_STATUS=$(curl -s -o /tmp/_ai_health.json -w "%{http_code}" \
        --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")

    if [[ "$HTTP_STATUS" == "200" ]]; then
        ok "Health check passed (HTTP 200)"
        echo ""
        OPEN_AI=$(python3 -c "import json,sys; d=json.load(open('/tmp/_ai_health.json')); print(d.get('openAiConfigured','?'))" 2>/dev/null || echo "?")
        echo "     openAiConfigured : $OPEN_AI"
        echo "     uptime           : $(python3 -c "import json; d=json.load(open('/tmp/_ai_health.json')); print(str(d.get('uptime','?')) + 's')" 2>/dev/null || echo '?')"
        echo ""
        if [[ "$OPEN_AI" != "True" && "$OPEN_AI" != "true" ]]; then
            warn "openAiConfigured is $OPEN_AI — set OPENAI_API_KEY in your server environment"
        fi
    elif [[ "$HTTP_STATUS" == "000" ]]; then
        warn "Could not reach $HEALTH_URL"
        warn "DNS for voice.certxa.com may not have propagated yet — try again in a minute"
        warn "Or test locally: curl http://127.0.0.1:5000/api/ai-receptionist/health"
    else
        warn "Health check returned HTTP $HTTP_STATUS"
        warn "Response: $(cat /tmp/_ai_health.json 2>/dev/null)"
    fi
else
    warn "curl not installed — skipping HTTPS health check"
    warn "Manually verify: curl $HEALTH_URL"
fi

# ── 10. Install Certbot renewal hook ──────────────────────────────────────────
HOOK_DIR="$(dirname "$HOOK_FILE")"
if [[ -d "$HOOK_DIR" && ! -f "$HOOK_FILE" ]]; then
    info "Installing Certbot post-renewal hook (auto-reload Nginx after cert renewal)..."
    cat > "$HOOK_FILE" <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
    chmod +x "$HOOK_FILE"
    ok "Hook installed: $HOOK_FILE"
    echo ""
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Deployment complete!                               ${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo "  Set this as your Twilio webhook URL:"
echo ""
echo -e "  ${CYAN}https://voice.certxa.com/api/webhook/twilio?storeId=1${NC}"
echo ""
echo "  Twilio Console → Phone Numbers → Manage → Active Numbers"
echo "  → Voice → 'A call comes in' → Webhook → HTTP POST"
echo ""

#!/usr/bin/env bash
# =============================================================================
# Certxa — Server Setup Script
# Installs system dependencies, Node.js, pnpm, builds all artifacts,
# creates the PostgreSQL database, pushes DB schema, and wires up
# nginx + systemd for production.
#
# Usage:
#   sudo bash setup.sh [OPTIONS]
#
# Options:
#   --domain <domain>       Your domain name (e.g. certxa.com) — required
#   --app-dir <path>        Where the repo lives (default: /var/www/certxa)
#   --app-user <user>       OS user that owns/runs the app (default: certxa)
#   --db-url <url>          Skip DB creation, use this connection string instead
#   --db-name <name>        Database name to create (default: certxa)
#   --db-user <user>        Database role to create (default: certxa)
#   --db-pass <pass>        Database password (default: auto-generated)
#   --api-port <port>       Express API port (default: 9100)
#   --import-sql <file>     Path to a .sql dump to import after DB is created
#                           (old OWNER references are rewritten to --db-user)
#   --skip-db-create        Skip creating the database (use with --db-url)
#   --skip-nginx            Skip nginx installation and config
#   --skip-systemd          Skip systemd service setup
#   --skip-db-push          Skip drizzle schema push
#   --no-ssl                Configure nginx for HTTP only (no Certbot)
# =============================================================================
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

require_root() { [[ $EUID -eq 0 ]] || error "Run this script as root (sudo bash setup.sh ...)."; }

# ── defaults ─────────────────────────────────────────────────────────────────
DOMAIN=""
APP_DIR="/var/www/certxa"
APP_USER="certxa"
DB_URL="${DATABASE_URL:-}"
DB_NAME="certxadata_1"
DB_USER="certxausr_1"
DB_PASS=""
IMPORT_SQL=""
SKIP_DB_CREATE=false
SKIP_NGINX=false
SKIP_SYSTEMD=false
SKIP_DB_PUSH=false
NO_SSL=false
NODE_VERSION="24"
PNPM_VERSION="10"
API_PORT=9100

# ── arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)          DOMAIN="$2";          shift 2 ;;
    --app-dir)         APP_DIR="$2";         shift 2 ;;
    --app-user)        APP_USER="$2";        shift 2 ;;
    --db-url)          DB_URL="$2";          shift 2 ;;
    --db-name)         DB_NAME="$2";         shift 2 ;;
    --db-user)         DB_USER="$2";         shift 2 ;;
    --db-pass)         DB_PASS="$2";         shift 2 ;;
    --api-port)        API_PORT="$2";        shift 2 ;;
    --import-sql)      IMPORT_SQL="$2";      shift 2 ;;
    --skip-db-create)  SKIP_DB_CREATE=true;  shift ;;
    --skip-nginx)      SKIP_NGINX=true;      shift ;;
    --skip-systemd)    SKIP_SYSTEMD=true;    shift ;;
    --skip-db-push)    SKIP_DB_PUSH=true;    shift ;;
    --no-ssl)          NO_SSL=true;          shift ;;
    *) error "Unknown option: $1" ;;
  esac
done

[[ -z "$DOMAIN" ]] && error "You must provide --domain <your-domain.com>"

# If --db-url was provided (or set in env), skip DB creation automatically
if [[ -n "$DB_URL" ]]; then
  SKIP_DB_CREATE=true
fi

# If skipping DB creation, a DB_URL must be available
if [[ "$SKIP_DB_CREATE" == "true" ]] && [[ -z "$DB_URL" ]]; then
  error "Pass --db-url <url> (or set DATABASE_URL) when using --skip-db-create."
fi

require_root

info "Setting up Certxa on $DOMAIN (app dir: $APP_DIR, user: $APP_USER)"

# ── 0. clean up any existing PM2 certxa process ───────────────────────────────
if command -v pm2 &>/dev/null; then
  if pm2 describe certxa &>/dev/null 2>&1; then
    info "PM2 'certxa' process found — stopping and deleting it..."
    pm2 stop certxa   2>/dev/null || true
    pm2 delete certxa 2>/dev/null || true
    success "PM2 'certxa' process removed."
  else
    info "No PM2 'certxa' process found — nothing to clean up."
  fi
else
  info "PM2 not installed — skipping PM2 cleanup."
fi

# ── 1. system packages ────────────────────────────────────────────────────────
info "Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget gnupg2 ca-certificates \
  build-essential git \
  nginx \
  certbot python3-certbot-nginx \
  postgresql postgresql-client \
  logrotate

success "System packages installed."

# ── 1b. PostgreSQL — create database, user, and permissions ──────────────────
if [[ "$SKIP_DB_CREATE" == "false" ]]; then
  info "Setting up PostgreSQL database..."

  # Ensure postgres service is running
  systemctl enable postgresql
  systemctl start postgresql

  # Generate a strong password if not supplied
  if [[ -z "$DB_PASS" ]]; then
    DB_PASS="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)"
    info "Generated database password (saved to /etc/certxa.env)."
  fi

  # Create the role if it doesn't already exist
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    info "PostgreSQL role '$DB_USER' already exists — updating password."
    sudo -u postgres psql -c "ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';"
  else
    info "Creating PostgreSQL role '$DB_USER'..."
    sudo -u postgres psql -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';"
  fi

  # Create the database if it doesn't already exist
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    info "Database '$DB_NAME' already exists — skipping creation."
  else
    info "Creating database '$DB_NAME'..."
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  fi

  # Grant full privileges
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
  # Also grant schema-level access (PostgreSQL 15+ requires this)
  sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
  sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;"
  sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;"

  # Build the connection URL
  DB_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

  success "Database '$DB_NAME' ready. Connection URL built."
else
  info "Skipping database creation (using provided DB_URL)."
fi

# ── 1c. import SQL dump (if provided) ─────────────────────────────────────────
if [[ -n "$IMPORT_SQL" ]]; then
  [[ ! -f "$IMPORT_SQL" ]] && error "SQL file not found: $IMPORT_SQL"
  info "Importing SQL dump: $IMPORT_SQL"

  # Rewrite all OWNER TO / SET ROLE / ALTER ... OWNER references to the new
  # DB user so the import doesn't fail on a missing role from the old server.
  IMPORT_TMP="$(mktemp /tmp/certxa-import-XXXXXX.sql)"
  sed \
    -e "s/OWNER TO \"[^\"]*\"/OWNER TO \"$DB_USER\"/g" \
    -e "s/OWNER TO [a-zA-Z0-9_]*/OWNER TO $DB_USER/g" \
    -e "s/SET ROLE \"[^\"]*\"/SET ROLE \"$DB_USER\"/g" \
    -e "s/SET ROLE [a-zA-Z0-9_]*/SET ROLE $DB_USER/g" \
    "$IMPORT_SQL" > "$IMPORT_TMP"

  psql "$DB_URL" < "$IMPORT_TMP" \
    && success "SQL dump imported successfully." \
    || warn "SQL import finished with warnings — check output above."

  rm -f "$IMPORT_TMP"
fi

# ── 2. Node.js ────────────────────────────────────────────────────────────────
info "Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d 'v')" -lt "$NODE_VERSION" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
success "Node.js $(node --version) ready."

# ── 3. pnpm ───────────────────────────────────────────────────────────────────
info "Installing pnpm $PNPM_VERSION..."
npm install -g pnpm@$PNPM_VERSION --silent
success "pnpm $(pnpm --version) ready."

# ── 4. app user ───────────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  info "Creating system user '$APP_USER'..."
  useradd --system --shell /bin/bash --home-dir "$APP_DIR" --create-home "$APP_USER"
fi
success "App user '$APP_USER' ready."

# ── 5. app directory ──────────────────────────────────────────────────────────
info "Setting up app directory at $APP_DIR..."
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# If run inside the repo itself, skip cloning
if [[ ! -f "$APP_DIR/pnpm-workspace.yaml" ]]; then
  warn "No pnpm-workspace.yaml found in $APP_DIR."
  warn "Make sure your code is checked out there before running this script."
  warn "Example: git clone <your-repo-url> $APP_DIR"
  warn "Continuing anyway — subsequent steps may fail."
fi

# ── 6. install workspace dependencies ────────────────────────────────────────
info "Installing workspace dependencies..."
cd "$APP_DIR"
sudo -u "$APP_USER" pnpm install --frozen-lockfile
success "Dependencies installed."

# ── 7. build all artifacts ────────────────────────────────────────────────────
info "Building API server..."
sudo -u "$APP_USER" pnpm --filter @workspace/api-server run build

info "Building Booking app..."
sudo -u "$APP_USER" env \
  NODE_ENV=production \
  PORT=3001 \
  BASE_PATH="/" \
  pnpm --filter @workspace/booking run build

info "Building Website Builder..."
sudo -u "$APP_USER" env \
  NODE_ENV=production \
  PORT=3002 \
  BASE_PATH="/website-builder/" \
  pnpm --filter @workspace/website-builder run build

success "All artifacts built."

# ── 8. DB schema push ─────────────────────────────────────────────────────────
if [[ "$SKIP_DB_PUSH" == "false" ]]; then
  info "Pushing database schema..."
  sudo -u "$APP_USER" env DATABASE_URL="$DB_URL" \
    pnpm --filter @workspace/db run push
  success "Database schema up to date."
fi

# ── 9. environment file ───────────────────────────────────────────────────────
info "Writing /etc/certxa.env..."
cat > /etc/certxa.env <<ENV
# Certxa production environment — managed by setup.sh
# Edit this file and restart the certxa-api service after changes.
NODE_ENV=production
PORT=$API_PORT
APP_URL=https://$DOMAIN
DATABASE_URL=$DB_URL
# SESSION_SECRET — set a strong random value:
SESSION_SECRET=$(openssl rand -hex 48)
# Add other secrets below (Stripe, Twilio, etc.)
# STRIPE_SECRET_KEY=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
ENV
chmod 600 /etc/certxa.env
chown root:root /etc/certxa.env
success "/etc/certxa.env written (edit to add remaining secrets)."

# ── 10. systemd service ───────────────────────────────────────────────────────
if [[ "$SKIP_SYSTEMD" == "false" ]]; then
  info "Installing certxa-api systemd service..."
  cat > /etc/systemd/system/certxa-api.service <<SERVICE
[Unit]
Description=Certxa API Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/certxa.env
ExecStart=/usr/bin/node --enable-source-maps $APP_DIR/artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=certxa-api
# Security hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable certxa-api
  systemctl restart certxa-api
  success "certxa-api service installed and started."
fi

# ── 11. nginx ─────────────────────────────────────────────────────────────────
if [[ "$SKIP_NGINX" == "false" ]]; then
  info "Configuring nginx..."

  # Deploy to conf.d — this is included inside the existing http {} block
  # so it coexists safely with any other nginx sites already on this server.
  NGINX_CONF="/etc/nginx/conf.d/certxa.conf"

  cp "$APP_DIR/nginx-site.conf" "$NGINX_CONF"

  # Substitute placeholders
  sed -i "s|__DOMAIN__|$DOMAIN|g"     "$NGINX_CONF"
  sed -i "s|__APP_DIR__|$APP_DIR|g"   "$NGINX_CONF"
  sed -i "s|__API_PORT__|$API_PORT|g" "$NGINX_CONF"

  # If --no-ssl, swap in the HTTP-only server block by uncommenting it
  # and commenting out the SSL servers so nginx won't fail on missing certs.
  if [[ "$NO_SSL" == "true" ]]; then
    # Comment out the SSL-only redirect server and the HTTPS server
    python3 - "$NGINX_CONF" <<'PY'
import sys, re

text = open(sys.argv[1]).read()

# Wrap the two SSL server blocks in block comments
# Identify them by their listen 443 / return 301 patterns and comment them out
# by adding a guard so nginx ignores them at parse time.
# Simplest safe approach: prepend a synthetic "if false" via map isn't valid;
# instead we replace the SSL-cert lines with placeholders so nginx won't error.
text = re.sub(
    r'(ssl_certificate\s+/etc/letsencrypt)',
    r'# \1',
    text
)
text = re.sub(
    r'(ssl_certificate_key\s+/etc/letsencrypt)',
    r'# \1',
    text
)
text = re.sub(
    r'(include\s+/etc/letsencrypt/options-ssl-nginx\.conf)',
    r'# \1',
    text
)
text = re.sub(
    r'(ssl_dhparam\s+/etc/letsencrypt)',
    r'# \1',
    text
)
# Uncomment the HTTP-only server block
text = text.replace(
    '# server {\n#     listen 80 default_server;',
    'server {\n    listen 80 default_server;'
)
text = re.sub(r'\n#(\s)', r'\n\1', text)  # un-comment lines inside that block
open(sys.argv[1], 'w').write(text)
PY
    warn "--no-ssl: SSL lines commented out in $NGINX_CONF. Run certbot manually when ready."
  fi

  # Validate config before applying
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    success "nginx certxa config deployed and reloaded."
  else
    warn "nginx config test failed — showing errors:"
    nginx -t
    warn "Existing nginx config left untouched. Fix the error above and re-run."
    exit 1
  fi

  if [[ "$NO_SSL" == "false" ]]; then
    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    if [[ -f "$CERT_PATH" ]]; then
      info "Existing SSL certificate detected — skipping Certbot, nginx already reloaded."
      success "certxa config live with existing cert."
    else
      info "No certificate found — obtaining SSL certificate via Certbot..."
      certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
        --non-interactive --agree-tos --redirect \
        -m "admin@$DOMAIN" || warn "Certbot failed — configure SSL manually."
      systemctl reload nginx
      success "SSL certificate installed."
    fi
  fi
fi

# ── 12. logrotate ─────────────────────────────────────────────────────────────
cat > /etc/logrotate.d/certxa <<LOGROTATE
/var/log/certxa/*.log {
  daily
  missingok
  rotate 14
  compress
  delaycompress
  notifempty
  create 0640 $APP_USER adm
  sharedscripts
  postrotate
    systemctl kill -s HUP certxa-api 2>/dev/null || true
  endscript
}
LOGROTATE
mkdir -p /var/log/certxa
chown "$APP_USER:adm" /var/log/certxa

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
success "══════════════════════════════════════════════"
success "  Certxa setup complete!"
success "  Domain : https://$DOMAIN"
success "  App dir: $APP_DIR"
success "  API svc: systemctl status certxa-api"
success ""
if [[ "$SKIP_DB_CREATE" == "false" ]]; then
success "  Database credentials:"
success "    Host    : localhost:5432"
success "    Name    : $DB_NAME"
success "    User    : $DB_USER"
success "    Password: $DB_PASS"
success "    URL     : $DB_URL"
success ""
success "  Credentials saved to /etc/certxa.env"
success ""
fi
success "  Next: edit /etc/certxa.env and add your"
success "  Stripe/Twilio/etc. secrets, then:"
success "    systemctl restart certxa-api"
success "══════════════════════════════════════════════"

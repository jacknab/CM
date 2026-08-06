# Certxa — VPS Deployment Guide

This guide covers everything needed to run Certxa on your own Ubuntu/Debian VPS, including:

- The booking/salon-management API & frontend
- The **AI Voice Booking Receptionist** (OpenAI Realtime + Twilio Media Streams) — supports new bookings, cancellations, reschedules, and caller recognition by phone number
- The website builder / web hosting product (subdomains routed via site-router)

If you already have an existing Certxa nginx config running the website builder, see [`docs/nginx-certxa.conf`](./nginx-certxa.conf) — it adds the `/media-stream` block in-place without touching your subdomain or catch-all server blocks.

---

## Table of Contents

1. [Server Requirements](#server-requirements)
2. [Initial Server Setup](#initial-server-setup)
3. [Install Node.js 24](#install-nodejs-24)
4. [Install PostgreSQL](#install-postgresql)
5. [Clone & Build the App](#clone--build-the-app)
6. [Environment Variables](#environment-variables)
7. [Database Setup](#database-setup)
8. [PM2 Process Manager](#pm2-process-manager)
9. [Nginx — Reverse Proxy + WebSocket Support](#nginx--reverse-proxy--websocket-support)
10. [SSL with Let's Encrypt](#ssl-with-lets-encrypt)
11. [Firewall](#firewall)
12. [Twilio Configuration](#twilio-configuration)
13. [Configuring the AI Receptionist per Salon](#configuring-the-ai-receptionist-per-salon)
14. [Verify Everything is Working](#verify-everything-is-working)
15. [Keeping Things Updated](#keeping-things-updated)
16. [Troubleshooting](#troubleshooting)

---

## Server Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Network | Static IP + domain | Same |

You need a **domain name** pointed at your server's IP address (e.g. `app.certxa.com`) — Twilio requires a public HTTPS URL to reach your server, and the AI receptionist WebSocket must be accessible via `wss://`.

---

## Initial Server Setup

SSH in as root or a sudo user:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential
```

Create a dedicated app user (optional but recommended):

```bash
sudo adduser certxa
sudo usermod -aG sudo certxa
su - certxa
```

---

## Install Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version   # should print v24.x.x
npm --version
```

Install pnpm:

```bash
npm install -g pnpm
pnpm --version
```

---

## Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Create the database and user:

```bash
sudo -u postgres psql <<EOF
CREATE USER certxa WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE certxa_prod OWNER certxa;
GRANT ALL PRIVILEGES ON DATABASE certxa_prod TO certxa;
EOF
```

Your `DATABASE_URL` will be:

```
postgresql://certxa:your_strong_password_here@localhost:5432/certxa_prod
```

---

## Clone & Build the App

```bash
cd /home/certxa
git clone https://github.com/YOUR_ORG/certxa.git app
cd app

# Install all workspace dependencies
pnpm install

# Build everything (type-check + bundle)
pnpm run build
```

After a successful build, the API server bundle is at:
`artifacts/api-server/dist/index.mjs`

---

## Environment Variables

Create the environment file:

```bash
nano /home/certxa/app/.env.production
```

Paste and fill in every value:

```bash
# ── Database ───────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://certxa:your_strong_password_here@localhost:5432/certxa_prod

# ── Application ────────────────────────────────────────────────────────────────
NODE_ENV=production

# Your public domain (used to build WSS URLs for the AI receptionist)
APP_URL=https://app.certxa.com

SESSION_SECRET=replace_with_64_random_characters_minimum

# ── OpenAI (AI Receptionist) ───────────────────────────────────────────────────
# Get from https://platform.openai.com/api-keys
# Requires access to gpt-4o-realtime-preview-2024-12-17 (or gpt-realtime-2).
# The server accepts either variable name — OPENAI_API_KEY is the standard
# one (also used by the Replit OpenAI integration); AI_INTEGRATIONS_OPENAI_API_KEY
# is supported for back-compat. If both are set, AI_INTEGRATIONS_OPENAI_API_KEY wins.
OPENAI_API_KEY=sk-...
# AI_INTEGRATIONS_OPENAI_API_KEY=sk-...   # legacy alias, optional

# ── Twilio (SMS + AI receptionist) ─────────────────────────────────────────────
# TWILIO_AUTH_TOKEN is REQUIRED in production — the AI receptionist webhook
# uses it to validate every incoming request's X-Twilio-Signature header.
# Without it, any internet user could POST a forged caller-ID and the AI
# would let them cancel or reschedule that phone number's bookings.
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# ── Email (Mailgun) ────────────────────────────────────────────────────────────
# Used by SMS-reminder fallback, billing dunning, and trial-expiration emails.
MAILGUN_API_KEY=key-...
MAILGUN_DOMAIN=mg.certxa.com
MAILGUN_FROM_EMAIL=no-reply@certxa.com
MAILGUN_FROM_NAME=Certxa

# ── Stripe (billing) ───────────────────────────────────────────────────────────
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Optional one-time setup fee charged on first subscription:
# ENABLE_SETUP_FEE=true
# STRIPE_SETUP_FEE_PRICE_ID=price_...
# STRIPE_SETUP_FEE_AMOUNT=9900           # cents, used if no price ID
# STRIPE_SETUP_FEE_LABEL=One-time setup
# Test keys (used only when NODE_ENV !== production):
# STRIPE_TEST_SECRET_KEY=sk_test_...
# STRIPE_TEST_WEBHOOK_SECRET=whsec_...

# ── Google OAuth ───────────────────────────────────────────────────────────────
# Google Business Profile sync (review aggregation, location data):
GOOGLE_BUSINESS_CLIENT_ID=...
GOOGLE_BUSINESS_CLIENT_SECRET=...
GOOGLE_BUSINESS_CALLBACK_URL=https://app.certxa.com/api/google-business/callback

# ── Misc ───────────────────────────────────────────────────────────────────────
TRIAL_PERIOD_DAYS=14
LOG_LEVEL=info
# COOKIE_DOMAIN=.certxa.com              # only set if serving cookies on subdomains
# CORS_ORIGINS=https://app.certxa.com,https://www.certxa.com

# ── Website-builder PHP sidecar (optional) ─────────────────────────────────────
# Only required if you're running the website-hosting product on the same VPS.
# PHP_BIN=/usr/bin/php
# PHP_DIR=/home/certxa/app/php-sites
# PHP_HOST=127.0.0.1
# PHP_PORT=8104
```

Lock down the file:

```bash
chmod 600 /home/certxa/app/.env.production
```

---

## Database Setup

Run migrations to create all tables:

```bash
cd /home/certxa/app
export $(grep -v '^#' .env.production | xargs)

# Push schema to the production database
pnpm --filter @workspace/db run push
```

You should see `✓ Up to date` (or a list of applied migrations) with no errors.

---

## PM2 Process Manager

PM2 keeps the Node.js process alive and restarts it on crashes or reboots.

```bash
npm install -g pm2
```

Create the PM2 ecosystem config:

```bash
nano /home/certxa/app/ecosystem.config.cjs
```

```javascript
module.exports = {
  apps: [
    {
      name: "certxa-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: "/home/certxa/app",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      env_file: "/home/certxa/app/.env.production",
      env: {
        NODE_ENV: "production",
        PORT: "5000",
      },
      // Restart if the process uses more than 800 MB
      max_memory_restart: "800M",
      // Keep logs in /home/certxa/logs/
      out_file: "/home/certxa/logs/api-out.log",
      error_file: "/home/certxa/logs/api-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
```

```bash
mkdir -p /home/certxa/logs

# Start the app
pm2 start /home/certxa/app/ecosystem.config.cjs

# Save the process list so it survives reboots
pm2 save

# Configure PM2 to start on boot
pm2 startup
# Follow the printed command (it will ask you to run something with sudo)
```

Check it's running:

```bash
pm2 status
pm2 logs certxa-api --lines 50
```

---

## Nginx — Reverse Proxy + WebSocket Support

> **Critical:** The AI Receptionist uses a persistent WebSocket (`/media-stream`). Nginx must forward the `Upgrade` and `Connection` headers or the connection will be rejected by the browser/Twilio.

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

Create the site config:

```bash
sudo nano /etc/nginx/sites-available/certxa
```

```nginx
# Redirect all HTTP → HTTPS
server {
    listen 80;
    server_name app.certxa.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.certxa.com;

    # SSL certificates (filled in by Certbot — see next section)
    ssl_certificate     /etc/letsencrypt/live/app.certxa.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.certxa.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # ── Security headers ────────────────────────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ── Proxy settings ──────────────────────────────────────────────────────
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # ── WebSocket upgrade (REQUIRED for AI Receptionist) ───────────────────
    # This block must come BEFORE the general location / block.
    location /media-stream {
        proxy_pass         http://127.0.0.1:5000;

        # WebSocket handshake headers
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Keep the WebSocket alive for the duration of a phone call (up to 1 hour)
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
        proxy_connect_timeout 10s;
    }

    # ── All other traffic (API + frontend SPA) ──────────────────────────────
    location / {
        proxy_pass http://127.0.0.1:5000;

        # Timeouts for normal HTTP requests
        proxy_read_timeout  60s;
        proxy_send_timeout  60s;
        proxy_connect_timeout 10s;

        # Buffer settings
        proxy_buffering off;
        client_max_body_size 20M;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/certxa /etc/nginx/sites-enabled/
sudo nginx -t          # must print "test is successful"
sudo systemctl reload nginx
```

---

## SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx -d app.certxa.com
```

Certbot will:
1. Verify you own the domain (via HTTP)
2. Issue a certificate
3. Automatically update your Nginx config with the SSL block

Auto-renewal is set up automatically. Test it:

```bash
sudo certbot renew --dry-run
```

---

## Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

The Node.js API server (port 5000) should **not** be publicly accessible — Nginx proxies all traffic to it. If you need to verify this:

```bash
sudo ufw deny 5000    # block direct access to Node.js
```

---

## Twilio Configuration

### Step 1 — Buy a phone number per salon

In the [Twilio Console](https://console.twilio.com) → **Phone Numbers → Buy a number**. Purchase one phone number for each salon that will have AI answering.

### Step 2 — Find the salon's storeId

Log into the Certxa admin panel at `https://app.certxa.com/isAdmin`, go to **Accounts**, and find the salon. The storeId is shown in the AI Receptionist column — or you can query the database:

```sql
SELECT id, name FROM locations ORDER BY id;
```

### Step 3 — Configure each phone number's webhook

In the Twilio Console → **Phone Numbers → Manage → Active Numbers** → click the number:

- Under **Voice & Fax**:
  - **A CALL COMES IN**: `Webhook`
  - **URL**: `https://app.certxa.com/api/webhook/twilio?storeId=<N>`
  - **HTTP Method**: `HTTP POST`

Replace `<N>` with that salon's storeId. **The base URL is the same for every salon — only `?storeId=N` changes.**

Example for three salons:

| Salon | Store ID | Phone number | Webhook URL |
|---|---|---|---|
| Glam Studio | 1 | +1 212-555-0101 | `https://app.certxa.com/api/webhook/twilio?storeId=1` |
| Shear Bliss | 2 | +1 310-555-0202 | `https://app.certxa.com/api/webhook/twilio?storeId=2` |
| The Mane Event | 7 | +1 312-555-0707 | `https://app.certxa.com/api/webhook/twilio?storeId=7` |

### Step 4 — Enable the AI Receptionist for that salon

Two equivalent admin entry points (both call the same admin-only endpoint):

- **Quick toggle (accounts list):** `/isAdmin` → **Accounts** → find the salon row → click the **AI Receptionist** toggle.
- **Per-store detail page:** `/isAdmin` → **Accounts** → click a salon row → **Store Database Entry → Integration tab → AI Voice Receptionist** card → click **Enable**.

The per-store Integration view also shows the salon's provisioned Twilio number (if any) and the current ENABLED/DISABLED status.

---

## Configuring the AI Receptionist per Salon

As the platform admin, you control which salons have the AI active. Both admin views below hit the same protected endpoint (`PATCH /api/admin/stores/:storeId/ai-receptionist`, gated by `isAdminAuthenticated` → `users.isAdmin = true`):

1. **Bulk view** — `https://app.certxa.com/isAdmin` → **Accounts**: toggle column lets you flip many salons quickly.
2. **Per-store view** — `https://app.certxa.com/isadmin/store-entry/<storeId>` → **Integration** tab → **AI Voice Receptionist** card: enable/disable plus contextual info (Twilio number, current state, description of capabilities).

The change takes effect immediately — no restart required.

**Salon owners** can also toggle it themselves from their own dashboard: **Settings → AI Receptionist**. However, they see only an on/off switch — they never see the webhook URL or any technical details.

---

## Verify Everything is Working

### 1. Check the API server

```bash
pm2 status
# Should show certxa-api as "online"

curl https://app.certxa.com/api/health
# Should return 200 OK (or some JSON response)
```

### 2. Check the AI receptionist webhook

```bash
curl -s -X POST \
  "https://app.certxa.com/api/webhook/twilio?storeId=1" \
  -d "CallSid=CAtest&From=+15551234567" \
  | grep "<Stream"
```

You should see a line containing `url="wss://app.certxa.com/media-stream?storeId=1"`.

### 3. Check the WebSocket endpoint

```bash
# Install websocat if not already installed
curl -L https://github.com/vi/websocat/releases/latest/download/websocat.x86_64-unknown-linux-musl -o /usr/local/bin/websocat
chmod +x /usr/local/bin/websocat

# Test the WebSocket
websocat "wss://app.certxa.com/media-stream?storeId=1"
```

You should get a clean connection (no immediate close). Press `Ctrl+C` to exit.

### 4. Make a real test call

Call the Twilio phone number assigned to store 1. You should hear the AI greeting within 2–3 seconds.

### 5. Watch live logs

```bash
pm2 logs certxa-api --lines 100
```

You should see lines like:

```
[AI Receptionist] OpenAI key detected ✓  (source: OPENAI_API_KEY (Replit integration))
[AI Receptionist] Routes registered:
  POST /api/webhook/twilio?storeId=<N>              (Twilio inbound webhook)
  WSS  /media-stream?storeId=<N>                    (Twilio media stream)
  GET  /api/ai-receptionist/settings                (salon owner read)
  PATCH /api/ai-receptionist/settings               (salon owner write)
  GET  /api/admin/stores/:storeId/ai-receptionist   (admin read)
  PATCH /api/admin/stores/:storeId/ai-receptionist  (admin write)
[AI Receptionist] Capabilities: book · cancel · reschedule (with caller recognition)
[AI Receptionist] Incoming call → "Glam Studio" (store 1) from "+15551234567"
[AI Receptionist] OpenAI Realtime connected — store 1
[AI Receptionist] Stream started — streamSid=MZ… callSid=CA… from="+15551234567" store=1
[AI Receptionist] Configuring session — caller="+15551234567", 1 upcoming appointment(s)
[AI Receptionist] ✅ NEW booking — id=42, customer="Sophie Clarke", ...
```

For a cancellation or reschedule you'll see:

```
[AI Receptionist] ❌ CANCELLED appointment id=42 (store 1) — reason: Family emergency
[AI Receptionist] 🔄 RESCHEDULED appointment id=42 → 2026-05-30T16:00:00.000Z (store 1)
```

---

## Keeping Things Updated

```bash
cd /home/certxa/app

# Pull latest code
git pull origin main

# Install any new dependencies
pnpm install

# Rebuild
pnpm run build

# Apply any new database migrations
export $(grep -v '^#' .env.production | xargs)
pnpm --filter @workspace/db run push

# Restart the server (zero-downtime)
pm2 reload certxa-api
```

---

## Troubleshooting

### PM2 shows the process "errored" or keeps restarting

```bash
pm2 logs certxa-api --lines 200 --err
```

Common causes:
- `DATABASE_URL` is wrong or Postgres isn't running
- `SESSION_SECRET` is missing
- Port 5000 is already in use: `sudo lsof -i :5000`

### Nginx returns 502 Bad Gateway

The Node.js process isn't running or crashed. Check:

```bash
pm2 status
pm2 restart certxa-api
```

Also check Nginx error logs:

```bash
sudo tail -f /var/log/nginx/error.log
```

### Twilio shows "11200 — HTTP Retrieval Failure" or call gets rejected immediately

If logs show:

```
[AI Receptionist] ❌ Rejected unsigned/forged Twilio webhook from <ip>
```

…the `X-Twilio-Signature` header failed validation. Causes:

1. **`APP_URL` mismatch.** The validator hashes the *exact* URL Twilio used. If Twilio is configured with `https://app.certxa.com/...` but `APP_URL=https://certxa.com`, the hash won't match. Fix: set `APP_URL` to the exact hostname configured in the Twilio console, then `pm2 reload certxa-api`.
2. **Wrong `TWILIO_AUTH_TOKEN`.** Verify it's the token for the Twilio account that owns the phone number. Check at <https://console.twilio.com> → Account → API keys & tokens.
3. **Stale token in PM2.** After changing `.env.production`, do `pm2 reload certxa-api` (env_file is re-read on reload).

Otherwise, if you're not seeing any log entry at all, Twilio can't reach your webhook URL. Verify:

1. Nginx is running: `sudo systemctl status nginx`
2. SSL certificate is valid: `curl -I https://app.certxa.com/` — should return HTTP 200 or 302, not a connection error
3. Firewall allows port 443: `sudo ufw status`
4. DNS is propagated: `dig app.certxa.com` — should return your server's IP

### WebSocket connection drops immediately (AI Receptionist not working)

Almost always an Nginx config issue. Make sure:

1. The `/media-stream` location block has `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";`
2. `proxy_read_timeout 3600s;` is set — default Nginx timeout (60s) kills long calls
3. Test Nginx config: `sudo nginx -t`

### AI doesn't respond / caller hears silence

Check logs for one of:

```
[AI Receptionist] ⚠️  Neither OPENAI_API_KEY nor AI_INTEGRATIONS_OPENAI_API_KEY is set.
[AI Receptionist] OpenAI error: { ... }
```

If the key is set but invalid, OpenAI will return a 401 — you'll see it in the error log when the WebSocket fails to upgrade.

Verify the key is in `.env.production` and PM2 is loading it:

```bash
pm2 env certxa-api | grep -E 'OPENAI|AI_INTEGRATIONS'
```

The startup banner tells you which env var won:

```
[AI Receptionist] OpenAI key detected ✓  (source: OPENAI_API_KEY (Replit integration))
# or
[AI Receptionist] OpenAI key detected ✓  (source: AI_INTEGRATIONS_OPENAI_API_KEY)
```

Also verify the OpenAI account has access to `gpt-4o-realtime-preview-2024-12-17` — it requires the Realtime API beta to be enabled on the account. To upgrade to `gpt-realtime-2` (recommended for production), change the model string in `artifacts/api-server/src/routes/aiReceptionist.ts` at the `OPENAI_REALTIME_URL` constant, then `pnpm run build && pm2 reload certxa-api`.

### "Appointment booked" appears in logs but nothing in the database

The `storage.createAppointment` call may have thrown. Check error logs:

```bash
pm2 logs certxa-api --err --lines 100
```

Common cause: `serviceId` from OpenAI doesn't match any service in the database for that store — possibly the caller chose something ambiguous and the AI picked the wrong ID. The service list in the AI system prompt uses the exact database IDs, so this should be rare.

### Database connection errors after deploy

PostgreSQL may not allow connections from the app user. Check:

```bash
sudo -u postgres psql -c "\du"                         # list users
sudo -u postgres psql -c "\l"                          # list databases
sudo -u postgres psql certxa_prod -c "\dt"             # list tables
```

If tables are missing, re-run migrations:

```bash
cd /home/certxa/app
export $(grep -v '^#' .env.production | xargs)
pnpm --filter @workspace/db run push
```

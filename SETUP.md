# Certxa — Production Server Setup

## Requirements

- Ubuntu 22.04 or 24.04 (fresh or existing)
- A domain name pointed at the server's IP (A record for `certxa.com` and `www.certxa.com`)
- Root or sudo access
- The repo cloned on the server

---

## Fresh Install (clean server)

```bash
git clone <your-repo-url> /apps/CM
cd /apps/CM
sudo bash setup.sh --domain certxa.com --app-dir /apps/CM --api-port 9200
```

That single command:

1. Installs system packages (Node.js 24, pnpm, PostgreSQL, nginx, certbot)
2. Creates a dedicated OS user and app directory
3. Creates the PostgreSQL database and user with a generated password
4. Runs `pnpm install` and builds all artifacts (API server, Booking app, Website Builder)
5. Pushes the Drizzle schema to the database
6. Writes `/etc/certxa.env` with all generated credentials
7. Installs and starts the `certxa-api` systemd service
8. Configures nginx with SSL via Certbot (if a TLS cert is detected/obtained)
9. Sets up log rotation

### All flags

| Flag | Default | Description |
|------|---------|-------------|
| `--domain` | *(required)* | Your domain, e.g. `certxa.com` |
| `--app-dir` | `/var/www/certxa` | Where the repo lives on disk |
| `--app-user` | `certxa` | OS user that owns and runs the app |
| `--api-port` | `9100` | Port the Express API listens on |
| `--db-name` | `certxadata_1` | PostgreSQL database name to create |
| `--db-user` | `certxausr_1` | PostgreSQL role to create |
| `--db-pass` | *(auto-generated)* | Password for the DB role |
| `--db-url` | — | Skip DB creation, use this connection string |
| `--import-sql` | — | Path to a `.sql` dump to restore after DB creation |
| `--skip-db-create` | — | Skip creating the database entirely |
| `--skip-nginx` | — | Skip nginx install and config |
| `--skip-systemd` | — | Skip systemd service setup |
| `--skip-db-push` | — | Skip Drizzle schema push |
| `--no-ssl` | — | Configure nginx for HTTP only (no Certbot) |

---

## After Setup — Add Your Secrets

Setup writes auto-generated values to `/etc/certxa.env`. Open it and fill in the remaining secrets:

```bash
sudo nano /etc/certxa.env
```

The file looks like this:

```env
NODE_ENV=production
PORT=9200
APP_URL=https://certxa.com
DATABASE_URL=postgresql://certxausr_1:<generated-pass>@localhost:5432/certxadata_1
SESSION_SECRET=<generated>

# Fill these in:
# STRIPE_SECRET_KEY=sk_live_...
# TWILIO_ACCOUNT_SID=AC...
# TWILIO_AUTH_TOKEN=...
```

After editing, restart the API:

```bash
sudo systemctl restart certxa-api
systemctl status certxa-api
```

---

## Updating an Existing Server

```bash
cd /apps/CM
git pull
pnpm install --frozen-lockfile
pnpm --filter @workspace/booking run build
pnpm --filter @workspace/website-builder run build
pnpm --filter @workspace/api-server run build
sudo systemctl restart certxa-api
```

Or to re-run the full setup (safe to run on an existing install — it will not recreate the DB or overwrite `/etc/certxa.env` if they already exist):

```bash
sudo bash setup.sh --domain certxa.com --app-dir /apps/CM --api-port 9200
```

---

## Restoring from a SQL Dump

If you have a database dump from a previous install:

```bash
sudo bash setup.sh \
  --domain certxa.com \
  --app-dir /apps/CM \
  --api-port 9200 \
  --import-sql /path/to/dump.sql
```

The script rewrites any old `OWNER` references in the dump to match the new DB user automatically.

---

## Service Management

```bash
# Status
systemctl status certxa-api

# Logs (live)
journalctl -u certxa-api -f

# Restart
sudo systemctl restart certxa-api

# Stop / Start
sudo systemctl stop certxa-api
sudo systemctl start certxa-api
```

---

## Nginx

The nginx config is deployed to `/etc/nginx/conf.d/certxa.conf`. Routes:

| Path | Serves |
|------|--------|
| `/api/*` | Proxied to Express API (port 9200) |
| `/website-builder/*` | Booking Builder static files |
| `/*` | Booking App static files |

To update the nginx config after a `setup.sh` change:

```bash
sudo bash setup.sh --domain certxa.com --app-dir /apps/CM --api-port 9200 --skip-db-create --skip-db-push
sudo nginx -t && sudo systemctl reload nginx
```

---

## Troubleshooting

### API won't start — `ERR_MODULE_NOT_FOUND`
A dependency is missing from the build. Run:
```bash
cd /apps/CM && pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
sudo systemctl restart certxa-api
```

### API won't start — missing environment variable
Check `/etc/certxa.env` has all required vars (`APP_URL`, `DATABASE_URL`, `SESSION_SECRET`).
```bash
cat /etc/certxa.env
sudo systemctl restart certxa-api
```

### 502 Bad Gateway
The API process isn't running. Check:
```bash
systemctl status certxa-api
journalctl -u certxa-api -n 50
```

### nginx config test fails
```bash
sudo nginx -t
```
Common cause: `http2 on` directive requires nginx ≥ 1.25.1. The config uses `listen 443 ssl http2` which works on all versions.

### PHP preview unavailable (Website Builder)
The Website Builder's PHP template preview requires PHP installed:
```bash
sudo apt install -y php-fpm
sudo systemctl restart certxa-api
```

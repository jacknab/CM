# Certxa VPS Deployment Guide

## Server layout

```
/apps/CM/                    ← git repo root
├── artifacts/api-server/    ← Express API (built to dist/)
├── artifacts/booking/       ← React booking app (built to dist/public/)
├── artifacts/website-builder/ ← React website builder (built to dist/)
├── deployment/
│   ├── nginx/booking.conf   ← the correct nginx config (symlink to sites-enabled)
│   └── certxa.env.example   ← template for /etc/certxa.env
├── php/                     ← PHP marketing pages (served by Express proxy)
└── ecosystem.config.js      ← PM2 config (secrets come from /etc/certxa.env)
```

## One-time VPS setup

### 1. Create /etc/certxa.env with real secrets

```bash
sudo cp /apps/CM/deployment/certxa.env.example /etc/certxa.env
sudo chmod 600 /etc/certxa.env     # root-only read
sudo nano /etc/certxa.env          # fill in real values
```

### 2. Activate the correct nginx config (disable old launchsite config)

```bash
# Remove the old launchsite config if it exists — it conflicts with booking.conf
sudo rm -f /etc/nginx/sites-enabled/launchsite
sudo rm -f /etc/nginx/sites-enabled/launchsite.conf

# Symlink the correct config
sudo ln -sf /apps/CM/deployment/nginx/booking.conf /etc/nginx/sites-enabled/certxa-booking

# Verify and reload
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Start the API with PM2

```bash
cd /apps/CM

# Source secrets into environment, then start PM2
set -a && source /etc/certxa.env && set +a
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # make PM2 restart on reboot
```

## Deploying updates (standard push workflow)

```bash
cd /apps/CM
git pull origin main

# Install any new dependencies
pnpm install

# Build everything
pnpm run build
# This builds:
#   artifacts/api-server/dist/index.mjs      ← Express bundle
#   artifacts/booking/dist/public/           ← React SPA (served by Express at /)
#   artifacts/website-builder/dist/          ← Website builder React app

# Apply any new DB migrations
pnpm --filter @workspace/db run push

# Restart the API server (zero-downtime reload)
pm2 reload certxa-api
```

## Port map (everything goes through nginx → Express on 9200)

| Layer | Port | What runs there |
|-------|------|----------------|
| nginx | 80, 443 | Terminates TLS, proxies to Express |
| Express (prod) | 9200 | API + serves built React static files |
| PostgreSQL | 5432 | Database (local, not exposed) |
| Redis | 6379 | Availability cache (local, not exposed) |

**No separate Vite dev server in production.** Express serves the built
`artifacts/booking/dist/public/` files directly for all non-API routes.

## How the booking app gets served in production

`pnpm run build` in the booking artifact outputs to
`artifacts/booking/dist/public/`. The Express server in `src/index.ts` detects
`NODE_ENV=production` and calls `express.static(distPath)` to serve those files.
The `index.html` SPA fallback handles all React routes client-side.

## Checking if everything is running

```bash
pm2 status                          # API process status
pm2 logs certxa-api --lines 50      # Recent API logs
sudo nginx -t                       # Validate nginx config
curl -I https://certxa.com/api/health  # End-to-end health check
```

## Troubleshooting: 502 Bad Gateway

Means nginx can't reach the API on port 9200.

```bash
pm2 status              # Is certxa-api running?
pm2 restart certxa-api  # If crashed
ss -tlnp | grep 9200    # Confirm it's actually listening on 9200
```

## Security notes

- `/etc/certxa.env` is the single source of truth for ALL secrets on the VPS.
  Never commit real values to git.
- `artifacts/api-server/ecosystem.config.cjs` is in `.gitignore` on the VPS
  (or can be regenerated from `ecosystem.config.js` at the repo root).
- Rotate DB password + session secret if they were ever committed to git history.
  Use `git filter-repo` or contact your DB provider for credential rotation.

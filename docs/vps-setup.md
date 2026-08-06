# VPS Setup: voice.certxa.com (AI Receptionist)

This guide explains how to deploy the `nginx-mysalon.conf` configuration on your VPS
and point Twilio at the AI receptionist running on `voice.certxa.com`.

---

## Prerequisites

- Ubuntu/Debian VPS with Nginx installed
- Certbot + Let's Encrypt cert already issued for `certxa.com` (wildcard covers `*.certxa.com`)
- Certxa API server running on port 5000 on the VPS
- DNS: `voice.certxa.com` A record pointing to your VPS IP

---

## Option A — Automated bash script (recommended)

Copy both files to your VPS and run the script:

```bash
scp nginx-mysalon.conf   user@your-vps-ip:~/
scp deploy-voice-nginx.sh user@your-vps-ip:~/
ssh user@your-vps-ip
sudo bash deploy-voice-nginx.sh
```

The script will install the config, test it, reload Nginx, run a health check,
and print your final Twilio webhook URL.

---

## Option B — Manual steps

### 1. Copy the config file

```bash
sudo cp nginx-mysalon.conf /etc/nginx/sites-available/certxa.com
```

### 2. Enable the site (skip if already symlinked)

```bash
sudo ln -sf /etc/nginx/sites-available/certxa.com \
            /etc/nginx/sites-enabled/certxa.com
```

### 3. Test the configuration

```bash
sudo nginx -t
```

Expected output:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 4. Reload Nginx

```bash
sudo systemctl reload nginx
```

### 5. Verify the AI receptionist health endpoint

```bash
curl -s https://voice.certxa.com/api/ai-receptionist/health | python3 -m json.tool
```

Expected response:
```json
{
  "status": "ok",
  "service": "AI Receptionist",
  "openAiConfigured": true,
  "twilioWebhookPath": "/api/webhook/twilio?storeId=<N>",
  "uptime": 123.4
}
```

If `openAiConfigured` is `false`, set `OPENAI_API_KEY` in your server environment and restart the API server.

---

## Step 6 — Point Twilio at the new URL

In your Twilio Console, update the **A call comes in** webhook on your phone number:

```
https://voice.certxa.com/api/webhook/twilio?storeId=1
```

- **Method:** HTTP POST
- **Fallback URL:** leave blank or set a secondary URL for redundancy

> The server validates the Twilio signature header if `TWILIO_AUTH_TOKEN` is set as an
> environment variable — recommended for production to prevent spoofed calls.

---

## How the routing works

```
voice.certxa.com  (port 443, SSL)
  ├── POST /api/webhook/twilio   → port 5000  (Twilio inbound call)
  ├── WSS  /media-stream         → port 5000  (real-time audio stream, 1hr timeout)
  └── everything else            → 404

*.certxa.com  (port 443, SSL)
  ├── /api/*                     → port 5005  (website builder backend)
  └── /*                         → /opt/booking3/dist/public/index.html (SPA)

HTTP (port 80)  →  301 redirect to HTTPS
```

Nginx matches `voice.certxa.com` exactly, so it wins before the `*.certxa.com`
wildcard — the website builder never sees AI receptionist traffic.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| 502 from Twilio | Is the Certxa API server running? `systemctl status certxa-api` or `ss -tlnp \| grep 5000` |
| `openAiConfigured: false` | Set `OPENAI_API_KEY` in the environment and restart the API server |
| 404 on `/api/webhook/twilio` | Did Nginx reload after config change? `sudo systemctl reload nginx` |
| SSL handshake error | Confirm wildcard cert covers subdomains: `openssl s_client -connect voice.certxa.com:443 -servername voice.certxa.com \| head -5` |
| WebSocket error 31920 | Confirm `/media-stream` block is in the config with `Upgrade`/`Connection` headers |
| AI plays "an error has occurred" | `openAiConfigured` must be `true` — check key is set |
| Caller not greeted by name | First call must complete a booking; name is stored against their phone number for all future calls |

---

## Port reference

| Port | Service |
|---|---|
| 5000 | Certxa API server (AI receptionist + all API routes) |
| 5005 | Website builder backend |

---

## SSL certificate auto-renewal

Certbot renews the cert automatically. Add a deploy hook so Nginx reloads after renewal:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

Test renewal without actually renewing:
```bash
sudo certbot renew --dry-run
```

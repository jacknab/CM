# NGINX CONFIGURATION AUDIT REPORT - certxa.com
**Date:** 2026-05-22T08:49:51Z  
**Issue:** HTTP 502 errors and Twilio webhook failures (Error 11200)  
**Target:** https://certxa.com/api/webhook/twilio?storeId=2

---

## EXECUTIVE SUMMARY

**ROOT CAUSE IDENTIFIED:**  
The HTTP 502 errors are caused by **ai-receptionist service NOT RUNNING** on port 9210.  
Nginx configuration has a **DUPLICATE/CONFLICTING** setup that needs cleanup.

**SEVERITY:** 🔴 CRITICAL - Service down, webhooks failing

---

## DETAILED FINDINGS

### 1. DUPLICATE SERVER BLOCK CONFIGURATIONS

**FINDING:** Two separate nginx configuration files define `server_name certxa.com`:

#### File 1: `/etc/nginx/sites-available/certxa.com` ✅ ACTIVE
```nginx
# HTTP (port 80) → HTTPS redirect
server {
    listen 80;
    server_name certxa.com;
    return 301 https://$host$request_uri;
}

# HTTPS (port 443)
server {
    listen 443 ssl http2;
    server_name certxa.com;
    
    ssl_certificate /etc/letsencrypt/live/certxa.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/certxa.com/privkey.pem;
    
    location /api/webhook/twilio {
        proxy_pass http://localhost:9210;  # ← Direct pass-through
    }
    
    location /media-stream {
        proxy_pass http://localhost:9210;
    }
    
    location / {
        proxy_pass http://localhost:9210;
    }
}
```
- **Status:** Currently enabled via symlink at `/etc/nginx/sites-enabled/certxa.com`
- **Routing:** Direct proxy to `http://localhost:9210`

#### File 2: `/etc/nginx/sites-available/ai-receptionist.conf` ⚠️ NOT ACTIVE (but confusing)
```nginx
upstream ai_receptionist {
    server 127.0.0.1:9210;
}

server {
    listen 80;
    server_name certxa.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name certxa.com;
    
    ssl_certificate /etc/letsencrypt/live/certxa.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/certxa.com/privkey.pem;
    
    location /api/webhook/twilio {
        # ⚠️ DIFFERENT BACKEND PATH!
        proxy_pass http://ai_receptionist/ai-receptionist/twilio/webhook;
    }
    
    location /media-stream {
        proxy_pass http://ai_receptionist/ai-receptionist/media-stream;
    }
}
```
- **Status:** EXISTS but NOT enabled (no symlink in sites-enabled/)
- **Routing:** Rewrites paths - proxies to `http://127.0.0.1:9210/ai-receptionist/twilio/webhook`
- **Issue:** This config is more sophisticated but NOT actually being used by nginx

**VERDICT:** Configuration ambiguity exists but NOT causing nginx conflicts **YET** because ai-receptionist.conf is not enabled.

---

### 2. PORT 9210 - ai-receptionist SERVICE NOT RUNNING

**CRITICAL FINDING:**  
```bash
$ netstat -tlnp | grep 9210
Port 9210 not listening
```

**PM2 Process List:**
```
┌────┬────────────────────┬───────────┐
│ id │ name               │ status    │
├────┼────────────────────┼───────────┤
│ 4  │ booking-backend    │ online    │
│ 5  │ ccsc-api           │ online    │
│ 8  │ certxa             │ online    │
│ 9  │ certxa-api         │ online    │
│ 2  │ customer-portal    │ online    │
│ 6  │ lead-app-api       │ online    │
│ 7  │ lead-app-web       │ online    │
│ 1  │ project            │ online    │
│ 3  │ review-app         │ online    │
└────┴────────────────────┴───────────┘
```

**❌ ai-receptionist is NOT in the PM2 process list!**

**Test Results:**
```bash
$ curl -I http://localhost:9210/api/webhook/twilio?storeId=2
curl: (7) Failed to connect to localhost port 9210: Connection refused
```

**ROOT CAUSE:** No application is listening on port 9210, so nginx receives connection refused → HTTP 502 Bad Gateway

---

### 3. NGINX CONFIGURATION STATE

**Active Configuration Files:**
```
/etc/nginx/nginx.conf
  ├── include /etc/nginx/conf.d/*.conf
  │   ├── certxa.conf (certxa.com only, NOT certxa.com)
  │   └── aaa-wildcard.certxa.conf (*.certxa.com wildcard)
  └── include /etc/nginx/sites-enabled/*
      ├── certxa.com → /etc/nginx/sites-available/certxa.com ✅
      ├── fastcheckin.net → ...
      ├── node.fastcheckin.net → ...
      └── (other sites...)
```

**Current Nginx Test Results:**
```bash
$ nginx -t
nginx: [warn] "ssl_stapling" ignored, no OCSP responder URL in certificate
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**✅ NO "conflicting server name" warnings in current state!**

---

### 4. PROXY PATH ROUTING ANALYSIS

| Config File | Nginx Location | Backend URL | Path Rewrite |
|-------------|---------------|-------------|--------------|
| **certxa.com** (active) | `/api/webhook/twilio` | `http://localhost:9210` | ❌ None (direct pass) |
| **ai-receptionist.conf** (inactive) | `/api/webhook/twilio` | `http://127.0.0.1:9210/ai-receptionist/twilio/webhook` | ✅ Rewrites path |

**BACKEND ENDPOINT MISMATCH:**
- If ai-receptionist app expects requests at `/ai-receptionist/twilio/webhook`
- But active nginx config sends to `/api/webhook/twilio`
- This could cause routing failures **even if service starts**

---

## EXACT ROOT CAUSES

### Primary Cause: Service Not Running
- **File:** N/A (service not started)
- **Line:** N/A
- **Issue:** ai-receptionist service is not running on port 9210
- **Impact:** All requests to certxa.com → HTTP 502 Bad Gateway

### Secondary Cause: Configuration Ambiguity
- **File 1:** `/etc/nginx/sites-available/certxa.com` (active, simpler)
- **File 2:** `/etc/nginx/sites-available/ai-receptionist.conf` (inactive, more sophisticated)
- **Issue:** Two different configs for same domain with different routing logic
- **Impact:** Confusion, risk of enabling wrong config, path mismatch

### Tertiary Cause: Potential Path Mismatch
- **Active Config:** Proxies `/api/webhook/twilio` directly to backend
- **Inactive Config:** Rewrites to `/ai-receptionist/twilio/webhook`
- **Issue:** Unknown which backend path the Node.js app actually expects
- **Impact:** Even after starting service, routing might fail

---

## RECOMMENDED FIX STRATEGY

### OPTION A: Use Simple Direct Routing (certxa.com config)
1. ✅ Keep `/etc/nginx/sites-available/certxa.com` as-is
2. ❌ Delete or rename `/etc/nginx/sites-available/ai-receptionist.conf` 
3. Start ai-receptionist with endpoint at `/api/webhook/twilio`
4. Test: `curl https://certxa.com/api/webhook/twilio?storeId=2`

### OPTION B: Use Sophisticated Routing (ai-receptionist.conf)
1. ❌ Disable `/etc/nginx/sites-enabled/certxa.com`
2. ✅ Enable `/etc/nginx/sites-available/ai-receptionist.conf`
3. Start ai-receptionist with endpoint at `/ai-receptionist/twilio/webhook`
4. Test: `curl https://certxa.com/api/webhook/twilio?storeId=2`

**RECOMMENDATION:** Use **OPTION A** (simpler, less moving parts)

---

## EXACT FIX COMMANDS

### Step 1: Remove Duplicate Configuration
```bash
# Backup the inactive config
sudo mv /etc/nginx/sites-available/ai-receptionist.conf /etc/nginx/sites-available/ai-receptionist.conf.backup

# Confirm only one config exists for certxa.com
grep -r "server_name certxa.com" /etc/nginx/sites-available/ /etc/nginx/conf.d/
```

### Step 2: Start ai-receptionist Service
```bash
cd /apps/CM/ai-receptionist
pm2 start ecosystem.config.js
pm2 save
```

### Step 3: Verify Service is Listening
```bash
netstat -tlnp | grep 9210
# OR
ss -tlnp | grep 9210

# Expected: tcp 0 0 127.0.0.1:9210 0.0.0.0:* LISTEN <pid>/node
```

### Step 4: Test Nginx Config and Reload
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Test Twilio Webhook Endpoint
```bash
# Local test
curl -X POST http://localhost:9210/api/webhook/twilio?storeId=2 \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# External test (through nginx)
curl -X POST https://certxa.com/api/webhook/twilio?storeId=2 \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## VALIDATION CHECKLIST

- [ ] Only ONE server block for certxa.com on ports 80 and 443
- [ ] No conflicting server_name warnings: `nginx -t`
- [ ] Port 9210 is listening: `netstat -tlnp | grep 9210`
- [ ] ai-receptionist appears in PM2: `pm2 list`
- [ ] Webhook responds 200/400 (not 502): `curl -I https://certxa.com/api/webhook/twilio?storeId=2`
- [ ] Twilio webhook test from Twilio console succeeds
- [ ] No 502 errors in `/var/log/nginx/error.log`

---

## FINAL CLEAN CONFIGURATION

**File:** `/etc/nginx/sites-available/certxa.com`  
**Symlink:** `/etc/nginx/sites-enabled/certxa.com` → `/etc/nginx/sites-available/certxa.com`

```nginx
server {
    listen 80;
    server_name certxa.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name certxa.com;

    ssl_certificate /etc/letsencrypt/live/certxa.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/certxa.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    ssl_session_timeout 10m;
    ssl_session_cache shared:SSL:10m;

    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    location / {
        proxy_pass http://localhost:9210;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/webhook/twilio {
        proxy_pass http://localhost:9210;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_connect_timeout 60s;
    }

    location /media-stream {
        proxy_pass http://localhost:9210;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## MONITORING RECOMMENDATIONS

1. **Log Monitoring:**
   ```bash
   tail -f /var/log/nginx/error.log | grep certxa.com
   tail -f /var/log/nginx/access.log | grep certxa.com
   ```

2. **PM2 Monitoring:**
   ```bash
   pm2 monit
   pm2 logs ai-receptionist --lines 100
   ```

3. **Health Check Endpoint:**
   Add to ai-receptionist app:
   ```javascript
   app.get('/health', (req, res) => res.json({ status: 'ok', port: 9210 }));
   ```

---

**END OF AUDIT REPORT**

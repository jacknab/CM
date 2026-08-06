---
name: Session cookie fix for Replit dev
description: express-session drops Secure cookies when req.secure=false; Vite proxy must inject x-forwarded-proto:https
---

The API sets `secure: true` on the session cookie whenever `isReplit` is true (REPL_ID env is set). Express-session silently skips sending the Set-Cookie header when the request is plain HTTP and `secure: true` — even with `trust proxy: 1` — unless the incoming request carries `X-Forwarded-Proto: https`.

**Why:** Vite's http-proxy-middleware does NOT automatically forward `X-Forwarded-Proto`. So Express sees `req.secure = false` and drops the cookie, causing every login to appear to succeed (200 + user JSON) but never persist a session.

**How to apply:** In `artifacts/booking/vite.config.ts`, add `headers: { "x-forwarded-proto": "https" }` to every proxy entry that targets the API server. This tells Express the request arrived over HTTPS, so it sends the Secure cookie.

The fix was applied to `/api`, `/website-builder`, `/uploads`, `/media-stream`, `/ws`, and `^/$` proxy entries.

# "Continue with Google" — Login & Registration Setup (VPS)

This covers the account **login/registration** Google sign-in button on `/auth`
(both "Sign in with Google" and "Continue with Google" on the registration modal).

> **This is a separate integration from Google Business Profile.** The Business
> Profile connection (reviews/listing sync, documented in
> `docs/GOOGLE_BUSINESS_SETUP.md`) uses the `business.manage` scope only and must
> never be mixed with login scopes. Google login uses `openid email profile`
> scopes only and has its own callback URL. They can share the same Google Cloud
> OAuth client (recommended), or use separate clients — your choice.

## How it works (code map)

| Piece | File |
|---|---|
| Auth URL + code exchange | `artifacts/api-server/src/lib/googleLoginAuth.ts` |
| Routes: `GET /api/auth/google`, `GET /api/auth/google/callback` | `artifacts/api-server/src/auth.ts` |
| "Continue with Google" / "Sign in with Google" buttons | `artifacts/booking/src/pages/Auth.tsx` (`GoogleAuthButton`) |
| Rate limiting | `artifacts/api-server/src/index.ts` (`authLimiter` on `/api/auth/google`) |
| Startup config warnings | `artifacts/api-server/src/index.ts` (`validateEnv`) |

Flow: clicking the button is a full-page redirect to `GET /api/auth/google` →
Google consent screen → `GET /api/auth/google/callback` → the server finds or
creates the `users` row, starts a session, and redirects back to `/auth`
(preserving any `?redirect=`/`?plan=` params) where the existing post-login
logic takes over.

Since you've already added the `openid`, `.../auth/userinfo.email`, and
`.../auth/userinfo.profile` scopes to your Google Cloud project, you only need
to finish the steps below.

---

## Step 1 — Confirm the OAuth consent screen

You said you already added these scopes — good, that's exactly what's needed:
- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

Also confirm on the **OAuth consent screen** page:
- **Publishing status**: if it's still "Testing", only the email addresses you
  explicitly add under "Test users" can complete sign-in — everyone else sees
  a Google warning screen and is blocked. Click **PUBLISH APP** to open it to
  all users (Google may require verification for the `userinfo.email`/`profile`
  scopes if you request more than the default; for these three scopes alone,
  verification is usually not required, but Google decides this per-project).
- **App name / support email / logo**: this is what the end user sees on the
  consent screen — set it to your real brand.

## Step 2 — Register the redirect URI

1. Google Cloud Console → **APIs & Services → Credentials**
2. Open your existing OAuth 2.0 Client ID (the same one used for Business
   Profile is fine — a single client can have multiple redirect URIs), or
   create a new "Web application" client if you'd rather keep it separate.
3. Under **Authorized redirect URIs**, add:
   ```
   https://YOUR-DOMAIN.com/api/auth/google/callback
   ```
   Replace `YOUR-DOMAIN.com` with your actual VPS domain (e.g. `certxa.com`).
   This must match **exactly** — same scheme, host, and path, no trailing
   slash — or Google returns `redirect_uri_mismatch`.
4. Under **Authorized JavaScript origins**, add:
   ```
   https://YOUR-DOMAIN.com
   ```
5. Click **Save**. Copy the **Client ID** and **Client Secret** — you'll need
   them in Step 3.

## Step 3 — Set environment variables on the VPS

Add these to whatever holds your production environment (`.env` file loaded by
your process manager, or your PM2/systemd `Environment=` entries):

```bash
# Reuses the same Google OAuth client as Business Profile, if you have one.
# If GOOGLE_CLIENT_ID/SECRET are already set for Business Profile, you can
# skip these two and the login flow will fall back to them automatically.
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Required — must exactly match what you registered in Step 2.
GOOGLE_LOGIN_CALLBACK_URL=https://YOUR-DOMAIN.com/api/auth/google/callback
```

Only set `GOOGLE_LOGIN_CLIENT_ID` / `GOOGLE_LOGIN_CLIENT_SECRET` instead if you
created a **separate** OAuth client dedicated to login (not required — most
setups can share one client).

### Env vars this feature depends on that you likely already have

These are required by the app in general (not new), but Google login won't
work correctly without them:

| Var | Why it matters here |
|---|---|
| `APP_URL` | Base URL used elsewhere in the app; keep it in sync with your domain |
| `SESSION_SECRET` | Signs the session cookie created after Google login |
| `DATABASE_URL` | Where the `users` row is created/linked |
| `NODE_ENV=production` | Switches cookies to `secure: true` + `sameSite: "lax"`, required for the OAuth redirect round-trip to keep the session cookie on a real domain |

> If any of `DATABASE_URL`, `SESSION_SECRET`, or `APP_URL` are missing, the API
> server refuses to start at all (see `validateEnv` in `index.ts`) — this is
> existing behavior, not new.

## Step 4 — Restart and verify

1. Restart the API server (`pm2 restart certxa-api` or your equivalent).
2. Check the startup logs for either of these lines:
   - `[certxa] WARNING — Google login is not configured...` → your client
     ID/secret env vars aren't set; fix Step 3.
   - `[certxa] WARNING — GOOGLE_LOGIN_CALLBACK_URL is not set...` → set it;
     without it the server falls back to a `certxa.com` URL that won't match
     your VPS domain and Google will reject the request.
   - No warning at all → configuration looks good.
3. Quick curl check (should redirect to Google's consent screen, not to an
   error page):
   ```bash
   curl -sI https://YOUR-DOMAIN.com/api/auth/google | grep -i location
   ```
   - `Location: https://accounts.google.com/o/oauth2/...` → correct.
   - `Location: /auth?error=google_not_configured` → env vars still missing.
4. In a real browser, go to `https://YOUR-DOMAIN.com/auth?mode=register` and
   click **Continue with Google**. You should land on Google's account picker,
   then be redirected back into the app already signed in.

## What happens on the backend when someone signs in

- **First time, brand-new email** → a new row is created in `users` with
  `googleId` set, a 60-day trial starts (`TrialService.setupTrialForUser`),
  and a welcome email is sent. The `password` column is filled with a random
  hash the user can never type — they can set a real password later from
  account settings if they also want email/password login.
- **Email already has a password account, no Google link yet** → the existing
  account is linked (`googleId` is attached to it) and the user is signed in
  to that same account, keeping any existing store/booking data.
- **Returning Google user** → matched by `googleId`, signed straight in.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Clicking the button redirects to `/auth?error=google_not_configured` | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` not set on the VPS |
| Google shows "Error 400: redirect_uri_mismatch" | The URI in Step 2 doesn't exactly match `GOOGLE_LOGIN_CALLBACK_URL` — check scheme/host/path/trailing slash |
| Google shows "This app is blocked" / unverified app warning | Consent screen is still in "Testing" — publish it, or add your test account under Test users |
| Redirects back to `/auth?error=google_oauth_failed` | Check API server logs for `[Google Login]` — usually a CSRF state mismatch (session cookie not persisted between the redirect out and back — check `SESSION_SECRET`/cookie domain) or the code exchange failing (wrong client secret) |
| Signed in but immediately logged out again | Cookie `secure`/`sameSite` mismatch — confirm `NODE_ENV=production` and that you're serving over HTTPS (required for `secure` cookies) |
| Works locally but not on the VPS | Almost always the redirect URI — Google rejects any mismatch, including `http` vs `https` |

## Security notes

- The OAuth `state` parameter carries a random CSRF token that's checked
  against the session on callback — protects against cross-site request
  forgery on the login flow.
- Login scopes (`openid email profile`) are requested with
  `include_granted_scopes: false`, so this flow can never silently pick up the
  Business Profile's `business.manage` grant, or vice versa.
- Rate limited to 20 requests/min per IP in production via `authLimiter`
  (same limiter as `/api/auth/login` and `/api/auth/register`).

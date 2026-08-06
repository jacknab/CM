---
name: Google OAuth Token Encryption
description: AES-256-GCM at-rest encryption for Google OAuth tokens; pattern for all future token write/read sites.
---

# Google OAuth Token Encryption (Phase 3.1)

## Rule
All Google OAuth `access_token` and `refresh_token` values MUST pass through `encryptToken()` before any DB write and `decryptToken()` before any `setCredentials()` call.

**Why:** Tokens stored plaintext in Postgres are readable by anyone with DB access. AES-256-GCM with a per-value IV gives authenticated encryption with zero schema change.

## Key files
- `artifacts/api-server/src/lib/googleTokenCrypto.ts` — canonical `encryptToken` / `decryptToken` / `isEncryptedToken`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` secret — 64 hex chars (32 bytes); confirmed set in Replit secrets

## Format
Encrypted values: `enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>` (12-byte IV, GCM auth tag)  
Legacy plaintext: returned unchanged by `decryptToken` — migrated automatically on next write.

## How to apply
- Every `INSERT` / `UPDATE` of `accessToken` or `refreshToken` → wrap in `encryptToken(value)`
- Every `client.setCredentials({ access_token, refresh_token })` → wrap reads in `decryptToken(value)`
- Token copy between tables (e.g. profileRow → googleBusinessAccounts) → `encryptToken(decryptToken(value))` to normalize legacy plaintext
- Never include `accessToken` / `refreshToken` in `res.json()` — strip with destructuring before returning

## Token write sites patched
`routes.ts`: OAuth GET callback (profile update/insert, accounts update/insert), exchange-code (profile update/insert, accounts update/insert), POST callback (profile update/insert), retry-fetch-accounts insert.  
`google-business-api.ts`: `onTokenRefresh` persistence callback.  
`google-review-sync.ts`: both `buildOAuth2ClientFromAccount` and `buildOAuth2ClientFromProfile` 'tokens' listeners.

## Token read sites patched
`google-business-api.ts`: `createApiManagerFromProfile()` → `setCredentials`  
`google-review-sync.ts`: `buildOAuth2ClientFromAccount()` and `buildOAuth2ClientFromProfile()` → `setCredentials`

## Startup confirmation
`index.ts` logs `[certxa] Google OAuth token encryption: ACTIVE (AES-256-GCM)` when key is valid.

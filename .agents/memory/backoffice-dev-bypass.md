---
name: Back-office dev auth bypass
description: How requireSupportAuth bypasses auth in dev and why NODE_ENV doesn't work in esbuild bundles.
---

## Rule
`requireSupportAuth` uses an **inverse env-var pattern**: auth is bypassed unless `SUPPORT_REQUIRE_AUTH=true` is explicitly set in the environment. Never use `process.env.NODE_ENV === "development"` as the gate.

## Why
`NODE_ENV` is NOT reliably available at runtime in esbuild Node.js bundles on Replit. Even though `export NODE_ENV=development` is set in the dev script before building, testing showed the runtime check always failed (returned 401). The inverse pattern — bypass unless the production flag is set — requires zero build-time decisions and works in all environments.

## How to apply
- Dev (Replit): no env var set → bypass always active → agent ID 1 injected into every session
- Production deployment: set `SUPPORT_REQUIRE_AUTH=true` → bypass disabled → real session required
- Agent ID 1 is the seeded default admin agent (admin@certxa.com); the seed is idempotent via ON CONFLICT DO NOTHING

#!/bin/bash
# The acceptance-test server: this checkout's code, the scratch database, its own port. The server reads the
# production settings file by itself, and only for names not already set — so EVERY name in that file is set
# to empty here first. It therefore has no key for any outside service: no Stripe, texts, email, AI or storage.
S=/tmp/claude-0/-apps-CM/ca730288-4e83-4f29-a3a4-75c70e0853f0/scratchpad
cd /apps/CM/artifacts/api-server
BLANK=()
while IFS= read -r name; do BLANK+=("$name="); done < <(grep -o "^\(export \)\?[A-Za-z_][A-Za-z_0-9]*=" /etc/certxa.env | sed 's/^export //; s/=$//' | sort -u)
env -i "${BLANK[@]}" PATH="$PATH" HOME="$HOME" NODE_ENV=production APP_URL=http://127.0.0.1:9291 PORT=9291 DATABASE_URL="$(cat $S/e2e/testurl)" \
  SESSION_SECRET="offline-acceptance-test-only-secret-000000000000" NODE_OPTIONS="--max-old-space-size=2048" \
  setsid npx tsx src/index.ts > $S/e2e/server.log 2>&1 &

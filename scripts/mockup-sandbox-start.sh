#!/bin/bash
set -e

trap 'kill $(jobs -p) 2>/dev/null; exit' SIGTERM SIGINT EXIT

(
  flock -x 200
  if [ ! -d "node_modules" ]; then
    echo "[mockup-sandbox] node_modules missing — running pnpm install..."
    pnpm install --no-frozen-lockfile
    echo "[mockup-sandbox] pnpm install complete."
  fi
) 200>/tmp/pnpm-workspace-install.lock

export BASE_PATH=/__mockup/
export PORT=8080
echo "[mockup-sandbox] Starting mockup sandbox on port 8080..."
exec pnpm --filter @workspace/mockup-sandbox run dev

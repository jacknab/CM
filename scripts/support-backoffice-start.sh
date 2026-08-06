#!/bin/bash
set -e

trap 'kill $(jobs -p) 2>/dev/null; exit' SIGTERM SIGINT EXIT

(
  flock -x 200
  if [ ! -d "node_modules" ]; then
    echo "[backoffice] node_modules missing — running pnpm install..."
    pnpm install --no-frozen-lockfile
    echo "[backoffice] pnpm install complete."
  fi
) 200>/tmp/pnpm-workspace-install.lock

export PORT=3001
export API_PROXY_TARGET=http://localhost:9200
echo "[backoffice] Starting Support Back Office on port 3001..."
exec pnpm --filter @workspace/support-backoffice run dev

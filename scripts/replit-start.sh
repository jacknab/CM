#!/bin/bash
# replit-start.sh — Replit-optimised start
# • Auto-installs node_modules if missing (fresh clone / new environment)
# • Starts Redis for availability cache (gracefully skipped if already running)
# • Kills orphaned Vite/API processes from previous runs (fuser not on Nix)
# • Starts Vite on port 5000 first so the workflow watcher sees the port quickly
# • Starts API server in background (tsx — no build step in dev)

cleanup() {
  pkill -P $$ 2>/dev/null || true
  kill 0 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT EXIT

# ── Auto-install disabled — run pnpm install manually when needed ─────────────
# (removed to prevent consuming Replit credits on every startup)

# ── Redis (used by availability cache / BullMQ workers) ──────────────────────
if ! redis-cli ping &>/dev/null 2>&1; then
  echo "[replit-start] Starting Redis on port 6379..."
  redis-server --daemonize yes --port 6379 --loglevel warning 2>/dev/null || true
  sleep 1
fi

# ── Kill orphaned processes from a previous run (fuser not available on Nix) ─
pkill -f "vite.*--host 0.0.0.0" 2>/dev/null || true
pkill -f "tsx.*src/index.ts" 2>/dev/null || true
sleep 1

# ── API server in background (tsx — skips the esbuild compile step) ───────────
echo "[replit-start] Starting API server on port 9200 (background)..."
PORT=9200 NODE_ENV=development pnpm --filter @workspace/api-server exec \
  tsx --tsconfig tsconfig.json src/index.ts &

# ── Vite dev server — opens port 5000 quickly ────────────────────────────────
echo "[replit-start] Starting Vite on port 5000..."
PORT=5000 API_PROXY_TARGET=http://localhost:9200 pnpm --filter @workspace/booking run dev

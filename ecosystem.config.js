// Root-level PM2 config (mirrors artifacts/api-server/ecosystem.config.cjs).
// Secrets are NOT stored here — see /etc/certxa.env on the VPS.
// Load env before starting: set -a && source /etc/certxa.env && set +a

module.exports = {
  apps: [{
    name: "certxa-api",
    cwd: "/apps/CM/artifacts/api-server",
    script: "./dist/index.mjs",
    // Was pointing at a node version that no longer exists on this box
    // (v22.16.0) — pm2 was silently falling back to whatever `node` resolved
    // to on PATH. Pointing it at the real interpreter directly instead.
    interpreter: "/root/.nvm/versions/node/v20.20.0/bin/node",
    interpreter_args: "--enable-source-maps",
    instances: 1,
    exec_mode: "cluster",
    wait_ready: true,
    listen_timeout: 15000,
    kill_timeout: 5000,
    // Was hitting this ceiling roughly every 1-2 hours all day (real pm2 log
    // pattern: "[PM2][WORKER] Process 9 restarted because it exceeds
    // --max-memory-restart value"), and a site crawler running that whole
    // window landed 502s scattered across dozens of unrelated pages — each
    // one just happened to be in flight during one of those restarts. Raised
    // with real headroom to spare (~4GB available on this box) to cut restart
    // frequency; the actual memory-growth driver (see _enrichmentCache in
    // artifacts/api-server/src/lib/salonData.ts, an unbounded per-salon
    // cache) is a separate, real fix — this alone doesn't address that.
    max_memory_restart: "2000M",
    env: {
      NODE_ENV: "production",
      PORT: "9200",
      APP_URL: "https://certxa.com",
      PHP_DIR: "/apps/CM/php",
      TRIAL_PERIOD_DAYS: "60",
    },
  }]
}

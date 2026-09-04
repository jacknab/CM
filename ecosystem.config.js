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
    max_memory_restart: "1000M",
    env: {
      NODE_ENV: "production",
      PORT: "9200",
      APP_URL: "https://certxa.com",
      PHP_DIR: "/apps/CM/php",
      TRIAL_PERIOD_DAYS: "60",
    },
  }]
}

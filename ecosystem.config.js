// Root-level PM2 config (mirrors artifacts/api-server/ecosystem.config.cjs).
// Secrets are NOT stored here — see /etc/certxa.env on the VPS.
// Load env before starting: set -a && source /etc/certxa.env && set +a

module.exports = {
  apps: [{
    name: "certxa-api",
    cwd: "/apps/CM/artifacts/api-server",
    script: "./dist/index.mjs",
    interpreter: "/root/.nvm/versions/node/v22.16.0/bin/node",
    interpreter_args: "--enable-source-maps",
    env: {
      NODE_ENV: "production",
      PORT: "9200",
      APP_URL: "https://certxa.com",
      PHP_DIR: "/apps/CM/php",
      TRIAL_PERIOD_DAYS: "60",
    },
  }]
}

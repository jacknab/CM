/**
 * PM2 ecosystem config for the Certxa API server.
 *
 * The deploy script (deploy.sh) calls:
 *   pm2 start ecosystem.config.cjs --only certxa-api --update-env
 *
 * All secrets (DATABASE_URL, SESSION_SECRET, etc.) are loaded from
 * /etc/certxa.env by the deploy script before PM2 is touched, so they
 * are already present in the shell environment when PM2 reads this file.
 * --update-env pushes them into the running process.
 *
 * Do NOT hard-code secrets here — this file is committed to the repo.
 */

'use strict';

const path = require('path');

// Resolve paths relative to this file so the config works regardless of
// which directory pm2 is invoked from.
const ARTIFACT_DIR = __dirname;               // artifacts/api-server/
const REPO_ROOT    = path.resolve(ARTIFACT_DIR, '..', '..');  // /apps/CM

module.exports = {
  apps: [
    {
      name: 'certxa-api',
      script: path.join(ARTIFACT_DIR, 'dist', 'index.mjs'),

      // Keep one instance — the API is stateful (WS rooms, scheduler timers).
      instances: 1,
      exec_mode: 'fork',

      // PM2 will restart the process if it uses more than 1 GB of RAM.
      max_memory_restart: '1G',

      // Restart delay on crash (ms). Prevents a tight crash-loop from hammering the DB.
      restart_delay: 3000,

      // Do not auto-restart on intentional pm2 stop/delete.
      autorestart: true,

      // Merge stdout + stderr into one log stream (simpler for `pm2 logs`).
      merge_logs: true,

      // Log file locations (PM2 default: ~/.pm2/logs/).
      // These can be overridden by the PM2 daemon's global config.
      out_file:   '/var/log/certxa-api.log',
      error_file: '/var/log/certxa-api-error.log',

      // Default env for production. Secrets come from /etc/certxa.env → shell
      // → pm2 --update-env. Only non-secret defaults live here.
      env: {
        NODE_ENV:  'production',
        PORT:      '9200',

        // PHP marketing pages directory.
        // Override in /etc/certxa.env: PHP_DIR=/apps/CM/php
        PHP_DIR: process.env.PHP_DIR || path.join(REPO_ROOT, 'php'),

        // Booking / website-builder static asset directories (served by the API).
        BOOKING_DIST:         path.join(REPO_ROOT, 'artifacts', 'booking', 'dist', 'public'),
        WEBSITE_BUILDER_DIST: path.join(REPO_ROOT, 'artifacts', 'website-builder', 'dist', 'public'),
      },
    },
  ],
};

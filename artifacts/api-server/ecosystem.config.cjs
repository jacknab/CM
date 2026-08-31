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

      // Cluster mode, 2 instances: PM2 restarts one worker at a time on
      // deploy, so the other keeps serving traffic — no more multi-second
      // outage window on every backend restart. This requires the app itself
      // to be safe for multiple processes: WebSocket broadcasts relay through
      // Redis (see lib/wsBroadcastBus.ts) instead of only reaching whichever
      // worker's local client list happens to have the socket, and every
      // interval-based scheduler is gated to run in exactly one worker (see
      // lib/clusterInfo.ts's IS_SCHEDULER_INSTANCE) so reminders/emails/SMS
      // don't fire twice. Sessions were already Postgres-backed (connect-pg-simple),
      // not in-memory, so no changes were needed there.
      // 2 by default. Set CERTXA_API_INSTANCES=1 in /etc/certxa.env on a
      // memory-constrained host to halve the footprint (each worker caps at
      // max_memory_restart) — the app is cluster-safe at any count.
      instances: Number(process.env.CERTXA_API_INSTANCES) || 2,
      exec_mode: 'cluster',

      // Rolling reload must wait for each new worker to actually be
      // listening (process.send('ready') in index.ts) before touching the
      // next one — otherwise PM2 considers a worker "up" as soon as it
      // spawns, and this app's several-second cold start (large bundle,
      // startup DB/table checks) leaves a real gap with too few workers
      // able to serve traffic. listen_timeout is the ceiling if 'ready'
      // never arrives, so a stuck worker doesn't hang the whole reload.
      wait_ready: true,
      // Ceiling for the new worker to send 'ready' before PM2 moves on and
      // kills the old one. Startup runs waitForDb() (up to 60 s of retries when
      // Postgres is slow to accept connections after a reboot) before the HTTP
      // listener's callback fires 'ready' — 15 s was well under that, so a
      // reload during a DB blip left a real serving gap. 45 s stays under the
      // waitForDb deadline while covering a normal slow cold start.
      listen_timeout: Number(process.env.CERTXA_API_LISTEN_TIMEOUT) || 45000,
      kill_timeout: 5000,

      // PM2 restarts the worker if it exceeds this. Override with
      // CERTXA_API_MAX_MEM in /etc/certxa.env (e.g. '768M') on a small host.
      max_memory_restart: process.env.CERTXA_API_MAX_MEM || '1G',

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

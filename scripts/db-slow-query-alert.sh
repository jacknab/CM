#!/bin/bash
set -u

if [ -f /etc/certxa.env ]; then
  set -a
  . /etc/certxa.env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[$(date -u +%FT%TZ)] [db-alert] DATABASE_URL is not set; skipping slow-query check" >&2
  exit 0
fi

THRESHOLD_SECONDS="10"
OUT_FILE="/var/log/certxa-db-slow-alert.log"

RESULT=$(psql "$DATABASE_URL" -tA -c "SELECT pid || '|' || datname || '|' || usename || '|' || round(extract(epoch from now() - query_start)::numeric, 2) || '|' || left(query, 500) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '${THRESHOLD_SECONDS} seconds' AND pid <> pg_backend_pid() ORDER BY query_start ASC;" 2>/tmp/db-slow-query-alert.err)

if [ -n "$RESULT" ]; then
  echo "[$(date -u +%FT%TZ)] [db-alert] Slow active queries detected (> ${THRESHOLD_SECONDS}s)" >> "$OUT_FILE"
  printf '%s\n' "$RESULT" >> "$OUT_FILE"
  printf '%s\n' "$RESULT"
else
  printf '%s\n' "[$(date -u +%FT%TZ)] [db-alert] no slow active queries" > /tmp/db-slow-query-alert.last
fi

if [ -s /tmp/db-slow-query-alert.err ]; then
  echo "[$(date -u +%FT%TZ)] [db-alert] psql error: $(tr '\n' ' ' </tmp/db-slow-query-alert.err)" >> "$OUT_FILE"
  rm -f /tmp/db-slow-query-alert.err
fi

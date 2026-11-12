#!/usr/bin/env bash
# Last Cut Formula Engine — database tests (src/**/*.dbtest.ts) on a disposable copy of the production STRUCTURE.
#
#   bash scripts/lcf-dbtest.sh          (from the repo root or artifacts/api-server; needs root on the Certxa server)
#
# Production is only read (pg_dump --schema-only: structure, never rows). The copy is a database named
# lcf_test_<UTC time>_<pid>_<random>_dbtest, stamped with this run's id; cleanup drops only that database, only if the
# stamp still matches, and fails the run if it is still there. Any failure exits non-zero.
set -euo pipefail
export LC_ALL=C
HERE="$(cd "$(dirname "$(readlink -f "$0")")/../artifacts/api-server" && pwd)"   # scripts/ is the repo-root folder (artifacts/api-server/scripts links to it)
set -a; . /etc/certxa.env; set +a
APP_ROLE=$(psql "$DATABASE_URL" -tAc "select current_user")
PROD_DB=$(python3 -c "import os,urllib.parse as u; print(u.urlparse(os.environ['DATABASE_URL']).path.lstrip('/'))")
RUN_ID="$(date -u +%Y%m%d%H%M%S)_$$_${RANDOM}${RANDOM}"
DB="lcf_test_${RUN_ID}_dbtest"
[[ "$DB" =~ ^lcf_test_[0-9]{14}_[0-9]+_[0-9]+_dbtest$ ]] && [ "$DB" != "$PROD_DB" ] || { echo "bad scratch name"; exit 1; }
URL=$(python3 -c "import os,sys,urllib.parse as u; p=u.urlparse(os.environ['DATABASE_URL']); print(p._replace(path='/'+sys.argv[1]).geturl())" "$DB")
WORK="$(mktemp -d)"; chmod 755 "$WORK"

cleanup() {
  local rc=$? stamp left
  stamp=$(sudo -u postgres psql -qtAc "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '$DB'")
  if [ -n "$stamp" ]; then
    if [ "$stamp" = "lcf dbtest $RUN_ID" ]; then sudo -u postgres psql -qtAc "DROP DATABASE \"$DB\" WITH (FORCE)" >/dev/null
    else echo "refusing to drop $DB (stamp '$stamp')"; fi
  fi
  left=$(sudo -u postgres psql -qtAc "SELECT count(*) FROM pg_database WHERE datname = '$DB'")
  rm -rf "$WORK"
  if [ "$left" != "0" ]; then echo "== CLEANUP FAILED: $DB still exists"; exit 1; fi
  [ $rc -eq 0 ] && echo "== db tests passed; disposable database dropped" || echo "== db tests FAILED (exit $rc); disposable database dropped"
  exit $rc
}
trap cleanup EXIT

sudo -u postgres pg_dump --schema-only --no-owner --no-privileges "$PROD_DB" > "$WORK/base.sql"
python3 - "$WORK/base.sql" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"(?m)^(CREATE EXTENSION|COMMENT ON EXTENSION).*$", "-- extension created by the superuser", s)
open(p, "w").write(s)
PY
sudo -u postgres psql -qtAc "CREATE DATABASE \"$DB\" OWNER \"$APP_ROLE\"" >/dev/null
sudo -u postgres psql -qtAc "COMMENT ON DATABASE \"$DB\" IS 'lcf dbtest $RUN_ID'" >/dev/null
for e in $(psql "$DATABASE_URL" -tAc "select extname from pg_extension where extname <> 'plpgsql'"); do
  sudo -u postgres psql -q -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS \"$e\"" >/dev/null
done
psql "$URL" -q -v ON_ERROR_STOP=1 < "$WORK/base.sql" >/dev/null
echo "== structure loaded into $DB ($(psql "$URL" -tAc "select count(*) from pg_tables where schemaname='public'") tables)"

cd "$HERE"
LCF_TEST_DB="$URL" npx vitest run -c vitest.dbtest.config.ts

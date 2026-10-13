#!/bin/bash
# Throw away the scratch database (only ever the scratch one) and build it again empty, then start the test server and a test salon.
S=/tmp/claude-0/-apps-CM/ca730288-4e83-4f29-a3a4-75c70e0853f0/scratchpad
PID=$(ss -ltnp | grep ':9291 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2); [ -n "$PID" ] && kill $PID; sleep 2
set -a; . /etc/certxa.env; set +a
ROLE=$(python3 -c "import os,urllib.parse as u; print(u.urlparse(os.environ['DATABASE_URL']).username)")
sudo -n -u postgres dropdb --if-exists certxa_offline_test && sudo -n -u postgres createdb -O "$ROLE" certxa_offline_test || exit 1
psql "$(cat $S/e2e/testurl)" -q -f $S/e2e/schema.sql > $S/e2e/restore.log 2>&1; psql "$(cat $S/e2e/testurl)" -q -f $S/e2e/migrations-data.sql >> $S/e2e/restore.log 2>&1
$S/e2e/start.sh
for i in $(seq 1 60); do sleep 3; curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9291/api/sync/heartbeat 2>/dev/null | grep -q 200 && break; done
B=http://127.0.0.1:9291
# The server seeds its website templates just after it starts answering; onboarding needs them.
T="$(cat $S/e2e/testurl)"
for i in $(seq 1 20); do [ "$(psql "$T" -Atc "select count(*) from wb_templates where name = 'Nail Salon — Bloom'" 2>/dev/null)" = 1 ] && break; sleep 2; done
# On this small box the Bloom seed sometimes fails at start-up. The test salon only needs a template row to exist.
if [ "$(psql "$T" -Atc "select count(*) from wb_templates where name = 'Nail Salon — Bloom'")" != 1 ]; then
  COLS=$(psql "$T" -Atc "select string_agg(quote_ident(column_name), ',') from information_schema.columns where table_name='wb_templates' and column_name not in ('id','name','files_path')")
  psql "$T" -q -c "insert into wb_templates (name, files_path, $COLS) select 'Nail Salon — Bloom', files_path || '-bloom', $COLS from wb_templates where category = 'nail_salon' limit 1"
fi
curl -s -o /dev/null -H "X-Forwarded-Proto: https" -X POST $B/api/auth/register -H "Content-Type: application/json" -d '{"email":"offline-test@example.test","password":"test-only-123456","firstName":"Test","lastName":"Owner"}'
curl -s -D $S/e2e/h.txt -o /dev/null -H "X-Forwarded-Proto: https" -X POST $B/api/auth/login -H "Content-Type: application/json" -d '{"email":"offline-test@example.test","password":"test-only-123456"}'
grep -i "^set-cookie" $S/e2e/h.txt | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]*);.*/\1/' | tr '\n' ';' | sed 's/;$//; s/;/; /g' > $S/e2e/cookie; chmod 600 $S/e2e/cookie
HOURS=$(python3 -c "import json; print(json.dumps([{'dayOfWeek':d,'openTime':'00:00','closeTime':'23:59','isClosed':False} for d in range(7)]))")
curl -s -o /dev/null -w "onboarding %{http_code}\n" -H "X-Forwarded-Proto: https" -H "Cookie: $(cat $S/e2e/cookie)" -X POST $B/api/onboarding -H "Content-Type: application/json" -d "{\"businessName\":\"Offline Test Nails\",\"businessType\":\"Nail Salon\",\"timezone\":\"America/Phoenix\",\"phone\":\"6025550100\",\"address\":\"1 Test St\",\"city\":\"Phoenix\",\"state\":\"AZ\",\"postcode\":\"85001\",\"businessHours\":$HOURS,\"staff\":[{\"name\":\"Lan Test\"},{\"name\":\"Kim Test\"}]}"

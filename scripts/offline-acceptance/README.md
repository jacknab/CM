# Offline outage acceptance run (two simulated tablets against the real server code)

Runs this checkout's API server on its own port (9291) against a throwaway database, signs up a test salon,
and drives it with two copies of the /nail offline engine through an outage, lost replies, a server restart
and conflicting changes. It never uses the production database or any outside service.

- `reset.sh` — drops and rebuilds the scratch database `certxa_offline_test` (structure copied from production,
  no salon data), starts the test server, creates the test owner and salon. Needs `sudo -u postgres`.
- `start.sh` — starts the test server. IMPORTANT: the server loads `/etc/certxa.env` by itself for any name not
  already set, so this script sets every name in that file to empty first. Without that, the test server would
  hold live keys for texts, email, payments and storage.
- `drive.ts` — the scenario (`npx tsx drive.ts` from `artifacts/api-server`). Prints PASS / FAIL per check.

The paths inside point at a scratch folder; change the `S=` lines to wherever you keep the run's files.
Afterwards: stop the server on port 9291 and `dropdb certxa_offline_test`.

This is the real server and the real engine, but simulated tablets. It is not a test on Android hardware.

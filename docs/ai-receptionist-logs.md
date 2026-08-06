# AI Receptionist — Where to Find Logs

A complete reference for every log surface in the AI Voice Receptionist system.

---

## 1. Process / Server Logs (VPS)

These are the raw `console.log` / `console.error` lines printed by the API server.

| Log manager | Command |
|---|---|
| **PM2** (recommended) | `pm2 logs certxa-api` |
| **PM2 last 200 lines** | `pm2 logs certxa-api --lines 200` |
| **pm2 log file** | `~/.pm2/logs/certxa-api-out.log` and `certxa-api-error.log` |
| **journald** (if using systemd) | `journalctl -u certxa-api -f` |

### Key prefixes to grep for

```bash
# All AI Receptionist messages
pm2 logs certxa-api --nostream | grep "\[AI Receptionist\]"

# Only errors / safety gate trips
pm2 logs certxa-api --nostream | grep "❌\|🚨\|BLOCKED\|ERROR"

# Session lifecycle (session.updated, WS open/close)
pm2 logs certxa-api --nostream | grep "session.updated\|WebSocket\|WS open\|WS close"

# Tool calls (booking, lookup, availability)
pm2 logs certxa-api --nostream | grep "tool_call\|TOOL\|tool result"

# Safety gate trips
pm2 logs certxa-api --nostream | grep "safetyGate\|SAFETY\|circuit"
```

---

## 2. Live Operational Health (HTTP endpoints)

These can be curled from any terminal — no login required.

### `/api/ai-receptionist/health`

Live in-memory status. No auth. Safe to poll from a cron or monitoring script.

```bash
curl https://your-domain.com/api/ai-receptionist/health | jq .
```

**Returns:**

| Field | Meaning |
|---|---|
| `status` | `"ok"` if the process is up |
| `openAiConfigured` | `false` = API key missing, all calls will fail |
| `uptimeSeconds` | Seconds since last server restart |
| `activeCalls.total` | Live calls right now |
| `activeCalls.atRisk` | Health score < 50 (slow/stalling) |
| `activeCalls.critical` | Health score < 30 (auto-heal triggered) |
| `activeCalls.calls[]` | Per-call: score, risk, tool success/fail counts, last 3 errors |
| `stores["<id>"].liveCallsEnabled` | `false` = store preflight hasn't run |
| `stores["<id>"].blocked` | `true` = safety gate tripped |
| `stores["<id>"].blockedReason` | Why it tripped (e.g. "WS error rate exceeded") |
| `stores["<id>"].firstCallMode` | `true` = no successful call yet this session |
| `stores["<id>"].metrics` | Rolling: WS errors, tool failures, avg latency, total calls |

---

### `/api/ai-receptionist/session-log`

Last N call records from the database, including cost. No auth required. Scrubs PII (no phone numbers or caller names).

```bash
# Last 20 calls for store 2
curl "https://your-domain.com/api/ai-receptionist/session-log?storeId=2&limit=20" | jq .

# Only failed calls
curl "https://your-domain.com/api/ai-receptionist/session-log?storeId=2&outcome=failed" | jq .
```

**Query params:**

| Param | Default | Notes |
|---|---|---|
| `storeId` | required | Which salon to query |
| `limit` | `25` | Max 100 |
| `outcome` | (all) | Filter: `booked`, `failed`, `callback_required`, `hung_up`, `in_progress` |

**Returns:** array of call records with `outcome`, `durationSeconds`, `startedAt`, `endedAt`, `notes`, `totalEstCost`, `toolCallCount`, `terminationReason`.

---

## 3. Authenticated Dashboard Endpoints

These require a logged-in salon owner session (cookie / Bearer token).

### `/api/ai-receptionist/call-logs?limit=100`

Full call history for the logged-in salon, including PII fields (caller phone, caller name).

```bash
curl -b "your-session-cookie" \
  "https://your-domain.com/api/ai-receptionist/call-logs?limit=50" | jq .
```

### `/api/ai-receptionist/live`

Real-time snapshot of active calls for the logged-in salon. Same data as `/health` but scoped and unredacted.

### `/api/ai-receptionist/silence-incidents`

Paginated silence/stall events per call. Useful for diagnosing dead-air complaints.

```bash
# All silence events, newest first
curl -b "cookie" "https://your-domain.com/api/ai-receptionist/silence-incidents?limit=50"

# Only audio-layer silences for a specific call
curl -b "cookie" \
  "https://your-domain.com/api/ai-receptionist/silence-incidents?layer=L1_AUDIO_SILENCE&callSid=CAxxxx"
```

**Silence layers:**

| Layer | What it means |
|---|---|
| `L1_AUDIO_SILENCE` | No audio frames arriving from Twilio |
| `L2_RESPONSE_WAIT` | OpenAI hasn't started speaking within expected window |
| `L3_TOOL_STALL` | A tool call didn't return within the timeout |

---

## 4. Database Tables (direct Postgres)

Connect with: `psql $DATABASE_URL`

```sql
-- Last 50 calls for store 2
SELECT id, outcome, duration_seconds, started_at, notes
FROM ai_call_log
WHERE store_id = 2
ORDER BY started_at DESC
LIMIT 50;

-- Failed calls in the last 24 hours
SELECT id, outcome, notes, started_at
FROM ai_call_log
WHERE outcome = 'failed'
  AND started_at > now() - interval '24 hours'
ORDER BY started_at DESC;

-- Cost breakdown per call (last 10)
SELECT
  l.id, l.outcome, l.duration_seconds,
  u.tool_call_count, u.openai_est_cost, u.twilio_est_cost, u.total_est_cost,
  u.termination_reason
FROM ai_call_log l
LEFT JOIN call_usage_records u ON u.call_log_id = l.id
WHERE l.store_id = 2
ORDER BY l.started_at DESC
LIMIT 10;

-- Silence incidents for a call
SELECT layer, silence_duration_ms, occurred_at, recovery_action
FROM ai_silence_incidents
WHERE call_sid = 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
ORDER BY occurred_at;
```

---

## 5. Quick-reference: What to check when something goes wrong

| Symptom | Where to look |
|---|---|
| Calls not connecting at all | `/api/ai-receptionist/health` → `openAiConfigured`, `liveCallsEnabled` |
| Calls connecting but AI is silent | PM2 logs for `session.updated` confirmation; silence incidents table |
| `session.turn_detection` error in logs | Code is outdated — pull latest and restart |
| Safety gate tripped | `/health` → `stores["N"].blocked` + `blockedReason` |
| High latency / slow responses | `/health` → `stores["N"].metrics.avgToolLatencyMs` |
| Call ended unexpectedly | `session-log` → `terminationReason`; PM2 logs for `❌` |
| Cost spike | `call_usage_records` table → `total_est_cost` per call |
| Silence complaints from callers | `silence-incidents` endpoint, filter by `callSid` |

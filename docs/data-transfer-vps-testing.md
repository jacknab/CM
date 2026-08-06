# Data Transfer — VPS Testing Guide

## Overview

The Data Transfer system lets salon owners migrate their existing data from another platform into Certxa. It supports two modes:

| Mode | Who runs it | What it imports | Speed |
|------|-------------|-----------------|-------|
| **Self-service** | Store owner, instant | Clients only | Immediate |
| **Concierge** | Support agent approves | Clients + Appointments + Services + Products + Gift Cards | 24-hour review |

Supported source platforms: **Vagaro, GlossGenius, Square, Mindbody, Fresha, Booksy, CSV/Excel, Other**

---

## Architecture

```
Browser → POST /api/data-transfer/upload       → parses file, returns preview (no DB write)
       → POST /api/data-transfer/start         → creates data_transfer_jobs row, holds file data in memory
       → POST /api/data-transfer/jobs/:id/execute  → self-service: runs import immediately
       → POST /api/data-transfer/jobs/:id/rollback → deletes all records inserted by that job

Support backoffice:
       → GET  /api/data-transfer/support/queue         → list pending concierge jobs
       → POST /api/data-transfer/support/jobs/:id/approve → run full import
       → POST /api/data-transfer/support/jobs/:id/reject  → reject with reason
```

**Critical VPS caveat:** File data is held in `global.__dtjFileData` (server memory) between `/start` and `/execute` or `/approve`. If the API server restarts between those two calls the file data is lost and a concierge job will complete with 0 rows imported. Keep this in mind for concierge testing — do not restart the server between upload and approve.

---

## Prerequisites

On your VPS, make sure the `data_transfer_jobs` table exists. Run this SQL if it's missing:

```sql
CREATE TABLE IF NOT EXISTS data_transfer_jobs (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL,
  user_id               INTEGER,
  mode                  TEXT NOT NULL DEFAULT 'self_service',
  status                TEXT NOT NULL DEFAULT 'pending_upload',
  source_platform       TEXT NOT NULL DEFAULT 'csv',
  files_json            JSONB,
  mapping_json          JSONB,
  preview_json          JSONB,
  import_ids_json       JSONB,
  imported_counts_json  JSONB,
  errors_json           JSONB,
  reject_reason         TEXT,
  review_notes          TEXT,
  reviewed_by_user_id   INTEGER,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);
```

---

## Test 1 — Self-Service Client Import (Instant)

This is the simplest path. Clients-only CSVs import immediately without any support review.

### Step 1 — Create a test CSV

Save this as `test_clients.csv`:

```csv
First Name,Last Name,Email,Phone,Notes
Jane,Doe,jane@example.com,555-111-2222,Regular client
John,Smith,john@example.com,555-333-4444,Prefers evenings
Maria,Garcia,,555-999-0000,Allergic to latex
```

### Step 2 — Navigate to the UI

Go to `https://your-vps-domain/data-transfer` while logged in as an owner or manager.

1. Click **Start New Transfer**
2. Select **CSV / Excel** as the source platform
3. Drag `test_clients.csv` onto the **Clients** drop zone (leave all others empty)
4. Click **Continue**
5. The preview screen will show 3 records detected with a **"Ready to import now"** green badge
6. Click **Import Now**
7. Click **Import Clients Now** on the confirm screen

**Expected result:** The done screen shows "3 clients imported". Navigate to `/customers` and verify the 3 records appear.

### Step 3 — Test Rollback

Back on `/data-transfer`, the job row shows a **Undo** button. Click it.

**Expected result:** All 3 clients disappear from `/customers`. The job status changes to `rolled_back`.

---

## Test 2 — Self-Service via cURL (no browser)

Useful for automated testing or CI. Replace `YOUR_SESSION_COOKIE` with a valid session cookie from your browser's dev tools.

```bash
# 1. Upload and preview
curl -X POST https://your-vps-domain/api/data-transfer/upload \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -F "platform=csv" \
  -F "clients=@test_clients.csv"

# 2. Start the job (note the jobId in the response)
curl -X POST https://your-vps-domain/api/data-transfer/start \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -F "storeId=1" \
  -F "platform=csv" \
  -F "mode=self_service" \
  -F "clients=@test_clients.csv"
# → {"jobId":1,"mode":"self_service","status":"pending_upload"}

# 3. Execute the job immediately (use jobId from above)
curl -X POST https://your-vps-domain/api/data-transfer/jobs/1/execute \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
# → {"success":true,"counts":{"clients":3,"skipped":0,"errors":0}}

# 4. Check job status
curl https://your-vps-domain/api/data-transfer/jobs/1 \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"

# 5. Rollback if needed
curl -X POST https://your-vps-domain/api/data-transfer/jobs/1/rollback \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

---

## Test 3 — Concierge Full Import (Support Review Required)

Concierge mode is triggered automatically when you upload anything other than clients alone (appointments, services, products, or gift cards).

### Step 1 — Create test files

**services.csv**
```csv
Service Name,Description,Duration,Price,Category
Balayage,Full balayage color,120,185,Color
Blowout,Blowout and style,45,65,Styling
Cut & Style,Haircut with blowdry,60,85,Cut
```

**products.csv**
```csv
Product Name,Brand,Retail Price,Cost Per Item,Quantity,Category
Olaplex No.3,Olaplex,28,12,20,Treatment
Moroccan Oil,Moroccanoil,42,18,15,Styling
```

### Step 2 — Submit via UI

1. Go to `/data-transfer` → **Start New Transfer**
2. Pick **CSV / Excel**
3. Upload `test_clients.csv` to **Clients**, `services.csv` to **Services**, `products.csv` to **Products**
4. Click **Continue**
5. Preview shows all three files detected with an **amber "Requires a 24-hour review"** badge
6. Click **Submit for Review**
7. Click **Submit for Review** on the confirm screen

**Expected result:** Job is created with status `pending_review`. The done screen shows "Your transfer is under review."

### Step 3 — Approve via Support Back Office

The support backoffice runs on port 3001. Open `https://your-vps-domain:3001` (or whatever port your support app is on) and log in as a support agent.

Navigate to the **Data Transfer** queue. You should see the pending concierge job.

Alternatively, approve via cURL using a support session cookie:

```bash
# List pending concierge queue
curl https://your-vps-domain/api/data-transfer/support/queue \
  -H "Cookie: connect.sid=YOUR_SUPPORT_SESSION_COOKIE"

# Approve and run the import (use jobId from above)
curl -X POST https://your-vps-domain/api/data-transfer/support/jobs/1/approve \
  -H "Cookie: connect.sid=YOUR_SUPPORT_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"review_notes":"Looks good, approved."}'
# → {"success":true,"counts":{"clients":3,"services":3,"products":2}}

# Or reject it
curl -X POST https://your-vps-domain/api/data-transfer/support/jobs/1/reject \
  -H "Cookie: connect.sid=YOUR_SUPPORT_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"reason":"File format not compatible, please re-export."}'
```

**Expected result after approve:** Services and products appear in the relevant pages. The store owner gets a completion email (requires Mailgun env vars set).

---

## Test 4 — Platform-Specific Column Mapping

Each platform has pre-built column name mappings. To test Vagaro-style headers:

**vagaro_clients.csv**
```csv
First Name,Last Name,Email,Cell Phone,Date of Birth,Zip Code,Allergies,Notes
Sophie,Hart,sophie@example.com,555-800-9000,1990-03-15,90210,None,VIP client
Emma,Clarke,emma@example.com,555-700-8000,1985-07-22,10001,Latex,Prefers morning slots
```

Upload this via the UI, select **Vagaro** as the source platform. The column mapping will auto-detect `Cell Phone` → phone, `Zip Code` → postalCode, `Date of Birth` → dateOfBirth, etc.

---

## Test 5 — Excel (.xlsx) File

The parser supports `.xlsx` files in addition to CSV. Create a simple Excel file with the same columns as the CSV examples above, upload it through the UI, and verify the preview detects the correct row count and column headers.

---

## Checking Job State in the Database

```sql
-- View all jobs
SELECT id, store_id, mode, status, source_platform, 
       imported_counts_json, created_at, completed_at
FROM data_transfer_jobs
ORDER BY created_at DESC;

-- Check what was imported by a specific job
SELECT import_ids_json, imported_counts_json, errors_json
FROM data_transfer_jobs
WHERE id = 1;

-- Manually reset a stuck job back to pending (if server crashed mid-import)
UPDATE data_transfer_jobs 
SET status = 'pending_upload' 
WHERE id = 1 AND status = 'processing';
```

---

## Email Notifications

Two emails are sent automatically:
- **Transfer complete** — sent to the store owner when a job finishes (self-service or concierge)
- **Transfer rejected** — sent to the store owner when a support agent rejects a concierge job

These use Mailgun. On VPS, ensure `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` are set in your environment. If they're not set, the emails silently fail but the import still completes.

---

## Known VPS Limitations

| Limitation | Detail |
|---|---|
| **File data is in-memory** | Concierge file data lives in `global.__dtjFileData`. If the API process restarts between upload and approve, the file data is gone and the approve call will complete with 0 records. Use persistent storage (S3/object store) before going to production with concierge mode. |
| **No duplicate detection** | Re-importing the same CSV creates duplicate client records. Always rollback before re-importing during testing. |
| **Appointment import** | Appointment rows are stored in `data_transfer_jobs.files_json` metadata only — the execute path only imports clients in self-service mode. Full appointment import only runs in concierge (support-approved) mode. |
| **30 MB file limit** | Multer is configured with a 30 MB per-file limit. Split large exports into multiple files. |

---

## Quick Reference — All Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/data-transfer/upload` | User session | Parse files, return preview (no DB write) |
| POST | `/api/data-transfer/start` | User session | Create job, hold file data in memory |
| GET | `/api/data-transfer/jobs?storeId=X` | User session | List jobs for store |
| GET | `/api/data-transfer/jobs/:id` | User session | Get job detail |
| POST | `/api/data-transfer/jobs/:id/execute` | User session | Run self-service import |
| POST | `/api/data-transfer/jobs/:id/rollback` | User session | Delete all records from a completed job |
| GET | `/api/data-transfer/support/queue` | Support session | List pending concierge jobs |
| GET | `/api/data-transfer/support/jobs/:id` | Support session | Get concierge job detail |
| POST | `/api/data-transfer/support/jobs/:id/approve` | Support session | Approve and run full import |
| POST | `/api/data-transfer/support/jobs/:id/reject` | Support session | Reject with reason |

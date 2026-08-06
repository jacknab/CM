# Certxa — Data Import Guide

This document explains how to bring existing business data into Certxa, whether you're migrating from another platform or loading a spreadsheet. There are two paths: **Self-Service Import** (done by the store owner in the app) and **Concierge Import** (handled by the Certxa support team for complex or large migrations).

---

## Supported File Formats

| Format         | Extensions       | Notes                              |
|----------------|------------------|------------------------------------|
| CSV            | `.csv`           | UTF-8 or standard ASCII encoding   |
| Excel          | `.xlsx`, `.xls`  | First sheet is used by default     |

---

## What Can Be Imported

| Data Type      | Description                                     |
|----------------|------------------------------------------------|
| **Clients**    | Contact records — names, phone, email, DOB, notes, allergies, address |
| **Appointments** | Historical booking records                   |
| **Services**   | Menu of services with pricing and duration      |
| **Products**   | Retail inventory with pricing and stock levels  |
| **Gift Cards** | Issued gift cards with balances                 |

> **Self-service import supports Clients only.** Appointments, Services, Products, and Gift Cards require the Concierge path.

---

## Supported Source Platforms

The system has pre-built column mappings for these platforms. If you select the right platform, field mapping is automatic.

| Platform       | Code / Slug    |
|----------------|----------------|
| Vagaro         | `vagaro`       |
| GlossGenius    | `glossgenius`  |
| Square         | `square`       |
| Mindbody       | `mindbody`     |
| Fresha         | `fresha`       |
| Booksy         | `booksy`       |
| Generic / Other | (auto-detect) |

---

## Self-Service Client Import

### Who it's for
Store owners who want to import their client list themselves, without involving the support team.

### Where to find it
**Clients page → Import button** (opens the Import Dialog)

Alternatively: `Settings → Data Transfer → Self-Service Import`

### Step-by-step

#### Step 1 — Upload your file

1. Click **Import Clients** on the Clients page.
2. Select your `.csv` or `.xlsx` file.
3. Optionally select your **Source Platform** from the dropdown. If you pick a supported platform (e.g. Vagaro), column mappings are filled in automatically.

#### Step 2 — Map your columns

The system reads the header row and tries to match each column to a Certxa field. Review the suggested mappings and correct any that are wrong.

**Client fields available for mapping:**

| Certxa Field    | Common Column Names Auto-Detected                                    |
|-----------------|----------------------------------------------------------------------|
| First Name      | `First Name`, `First_Name`, `Given Name`                             |
| Last Name       | `Last Name`, `Last_Name`, `Surname`, `Family Name`                   |
| Email           | `Email`, `Email Address`, `E-mail`                                   |
| Phone           | `Phone`, `Mobile`, `Cell`, `Telephone`, `Phone Number`               |
| Date of Birth   | `Date of Birth`, `DOB`, `Birthday`, `Birth Date`                     |
| Gender          | `Gender`, `Sex`                                                       |
| Notes           | `Notes`, `Client Notes`                                               |
| Allergies       | `Allergies`                                                           |
| Address         | `Address`, `Street Address`                                          |

Any column you don't want to import can be set to **"— Skip this column —"**.

#### Step 3 — Choose how to handle duplicates

Duplicates are detected by matching **email address** and **phone number**.

| Option              | What it does                                                  |
|---------------------|---------------------------------------------------------------|
| **Skip duplicates** | Leave existing client records unchanged *(default)*           |
| **Update duplicates** | Overwrite name and contact info for matched clients          |
| **Create anyway**   | Import all rows, even if a matching client already exists     |

#### Step 4 — Review and confirm

A preview shows the first few rows of your data. Click **Import** to start.

#### Step 5 — Results summary

When the import finishes you'll see:

| Metric             | Meaning                                       |
|--------------------|-----------------------------------------------|
| **Imported**       | New client records successfully created        |
| **Skipped**        | Rows skipped due to duplicate-handling setting |
| **Duplicates found** | Rows that matched an existing client         |
| **Failed**         | Rows that could not be processed (see below)  |

Rows fail if required fields (name) are missing or the data is malformed. Failed rows do not block the rest of the import.

---

## Concierge Import (Full Data Transfer)

### Who it's for
Stores migrating from another platform with a full dataset — clients, appointments, services, products, and/or gift cards. A Certxa support agent reviews and executes the import.

### Where to find it
**Settings → Data Transfer** (`/data-transfer`)

### Step-by-step for store owners

#### Step 1 — Upload your export files

Go to **Settings → Data Transfer** and upload one or more files. You can upload separate files for clients, appointments, services, etc.

- The system auto-detects which data type each file contains.
- A **preview** of the first rows is shown so you can verify the content before submitting.
- Detected field mappings are shown — you can review them but don't need to correct them (the support agent will confirm before executing).

#### Step 2 — Submit the request

After uploading, click **Request Concierge Import**. This creates a job in the support queue with `mode: concierge`.

You'll receive a confirmation and can close the page — no further action is needed on your end.

#### Step 3 — Support team review

A Certxa support agent opens the job in the **Data Transfer Queue** and:

1. Inspects the file preview and field mappings.
2. Verifies data quality and resolves any ambiguous column mappings.
3. Approves the job when ready.

#### Step 4 — Execution and confirmation

Once approved, the system imports all data types in order. When complete:

- A **confirmation email** is sent to the store owner.
- Import counts per data type (imported / skipped / failed) are logged on the job record.

---

## Support Team: Managing the Queue

### Accessing the queue

Open the **Support Back Office** (`Support Back Office` workflow, port 3001) → **Data Transfer Queue**.

### Queue actions

| Action           | Description                                                      |
|------------------|------------------------------------------------------------------|
| View job         | See file preview, detected mappings, submitted data types        |
| Approve job      | Triggers full execution of all data categories                   |
| Rollback job     | Deletes all records created by a completed job                   |

### Rollback

Any completed import can be reversed. Click **Rollback** on the job — this deletes every record that was created during that specific import run. Records that existed before the import are not affected.

**Use rollback if:**
- The wrong file was imported.
- Column mappings were incorrect and produced bad data.
- A test import needs to be cleaned up before the real one.

---

## API Reference

### Client Import endpoints (`/api/clients`)

| Method | Path                         | Description                                     |
|--------|------------------------------|-------------------------------------------------|
| `POST` | `/api/clients/import/preview`| Upload a file; get back a data preview and suggested mappings |
| `POST` | `/api/clients/import/execute`| Execute the import with confirmed mappings      |

**Preview request** (multipart/form-data):

| Field            | Type    | Description                                              |
|------------------|---------|----------------------------------------------------------|
| `file`           | file    | The `.csv` or `.xlsx` file                               |
| `platform`       | string  | Platform slug: `vagaro`, `glossgenius`, `square`, etc. Optional |

**Execute request** (multipart/form-data):

| Field               | Type   | Description                                           |
|---------------------|--------|-------------------------------------------------------|
| `file`              | file   | Same file as the preview step                         |
| `fieldMapping`      | JSON   | Object mapping Certxa field names → CSV column headers |
| `duplicateStrategy` | string | `"skip"`, `"update"`, or `"create"`                   |
| `platform`          | string | Optional platform slug                                |

### Data Transfer endpoints (`/api/dataTransfer`)

| Method | Path                              | Auth          | Description                                          |
|--------|-----------------------------------|---------------|------------------------------------------------------|
| `POST` | `/api/dataTransfer/upload`        | Store owner   | Upload files; get preview and mappings               |
| `POST` | `/api/dataTransfer/start`         | Store owner   | Create a transfer job (`self_service` or `concierge`)|
| `POST` | `/api/dataTransfer/jobs/:id/execute` | Store owner | Execute a self-service job (clients only)           |
| `POST` | `/api/dataTransfer/jobs/:id/rollback` | Store owner | Undo a completed import                            |
| `GET`  | `/api/dataTransfer/support/queue` | Support only  | List all pending concierge jobs                      |
| `POST` | `/api/dataTransfer/support/jobs/:id/approve` | Support only | Approve and execute a concierge job    |

---

## Tips and Troubleshooting

### File preparation

- **Remove header rows** that aren't the column header row (e.g. a title row at the top).
- **One sheet per file** for Excel — the system reads the first sheet only.
- **Consistent formatting** for phone numbers. The system normalises digits only, so `(555) 123-4567`, `555-123-4567`, and `5551234567` all match the same client.
- **Date of birth format**: Use `YYYY-MM-DD`, `MM/DD/YYYY`, or `DD/MM/YYYY`. Include it only if your export has it — it's never required.

### After a Vagaro export

Vagaro exports use separate columns for `Cell Phone`, `Home Phone`, and `Work Phone`. The auto-mapping picks up `Cell Phone` as the primary phone. If your clients mainly used home or work numbers, adjust the mapping in Step 2.

### After a GlossGenius export

GlossGenius includes `Email Address` (not just `Email`) — the auto-mapping handles this. Check that your export includes the `Phone Number` column if you need phone matching for duplicate detection.

### After a Square export

Square's client export uses `Given Name` and `Family Name` instead of `First Name`/`Last Name`. The auto-mapping handles this correctly.

### Duplicate matching is by email and phone

If a client has neither an email nor a phone in your file, they cannot be matched against existing records. The duplicate strategy setting will have no effect for those rows — they will always be created as new records.

### Large files (10,000+ rows)

For very large files (over 10,000 client records), use the **Concierge path**. Self-service imports have a row limit and run synchronously in the browser tab — closing the tab before completion may interrupt the import.

### Rolling back a partial import

If an import was interrupted mid-way, it may have created only some of the records. You can still run a rollback on the job — it will delete whatever was created, after which you can re-run the import cleanly.

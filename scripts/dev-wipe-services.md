# dev-wipe-services — wipe all categories & services for one store

**Dev / test only.** Deletes every service category and service belonging to a
single store (default: store `2`), plus the rows that depend on them. Runs in one
transaction — it either all succeeds or all rolls back.

Script: [`dev-wipe-services.sh`](./dev-wipe-services.sh)

---

## TL;DR

```bash
cd /apps/CM/artifacts/api-server

# 1. See what would be removed (safe, changes nothing)
./scripts/dev-wipe-services.sh

# 2. Actually do it
./scripts/dev-wipe-services.sh --yes
```

That's it. No env vars to set, no flags to remember. Store `2` is the default.

---

## What it does

| Table | Action | Why |
|---|---|---|
| `service_categories` | **DELETE** (store's rows) | the target |
| `services` | **DELETE** (store's rows) | the target |
| `service_options` | **DELETE** child rows | `service_id` is `NOT NULL` — can't orphan them |
| `service_addons` | **DELETE** child rows | same |
| `staff_services` | **DELETE** child rows | staff↔service assignments; recreated when you re-add services |
| `service_review_matches` | auto-removed | FK is `ON DELETE CASCADE` |
| `appointments.service_id` | **set to NULL** | appointment rows are kept, just unlinked from the deleted service |
| `intake_forms.service_id` | **set to NULL** | same |
| `waitlist.service_id` | **set to NULL** | same |
| `staff_work_photos.service_id` | **set to NULL** | same |

Nothing outside the chosen store is touched.

---

## Running it

### Dry run (default)

```bash
./scripts/dev-wipe-services.sh
```

Prints a count table and exits without changing anything:

```
Store ................ 2
Mode ................. DRY RUN (no changes)

           what            | count
---------------------------+-------
 categories to delete      |     7
 services to delete        |    54
 service_options to delete |     0
 service_addons to delete  |     0
 staff_services to delete  |   170
 appointments to unlink    |    10

Dry-run only. Re-run with --yes to apply.
```

### Execute

```bash
./scripts/dev-wipe-services.sh --yes
```

Runs the transaction and then prints the post-wipe counts, which should be:

```
    what    | count
------------+-------
 categories |     0
 services   |     0
```

### A different store

```bash
./scripts/dev-wipe-services.sh --store 2 --yes
```

`--store` takes any numeric id. Without `--yes` it's still a dry run.

### Help

```bash
./scripts/dev-wipe-services.sh --help
```

---

## Notes & safety

- **`--yes` is required to change anything.** Every run without it is read-only.
- Reads `DATABASE_URL` from `/etc/certxa.env` automatically (same source the API
  server uses). Nothing to export.
- One transaction — if any statement fails, the whole thing rolls back and the
  store is left exactly as it was.
- **Not reversible.** Take a dump first if you might want it back:
  ```bash
  DB=$(grep '^DATABASE_URL=' /etc/certxa.env | cut -d= -f2-)
  pg_dump "$DB" -t service_categories -t services -t service_options \
    -t service_addons -t staff_services > /tmp/store2-services-backup.sql
  ```
- Restarting the API is **not** needed — the change is purely in the database and
  the app reads it live on the next request.
- After wiping you can rebuild the catalog from the seed scripts in this folder
  (e.g. `create-nail-salon-categories.sql`, `seed-nail-salon.ts`) or through the
  app UI.

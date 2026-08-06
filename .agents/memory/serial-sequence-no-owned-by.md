---
name: SERIAL sequence without OWNED BY — drizzle-kit drop crash
description: How to detect and fix SERIAL sequences that have no OWNED BY relationship, which breaks drizzle-kit push and all standard Postgres detection helpers.
---

## The rule

When a table is excluded from drizzle-kit via `tablesFilter: ["!table_name"]`, drizzle-kit still enumerates standalone sequences and tries to DROP them. If the column DEFAULT still references the sequence, Postgres refuses: `cannot drop sequence X because column id of table Y requires it`.

## Why standard helpers fail

If the sequence was created WITHOUT an `OWNED BY` clause (e.g. a raw `CREATE SEQUENCE` + `DEFAULT nextval(...)` migration without `ALTER SEQUENCE ... OWNED BY`), then:
- `pg_depend` has **no** `deptype='a'` row for it → any query joining through `pg_depend` returns 0 rows
- `pg_get_serial_sequence(table, col)` returns **NULL** → any code that checks this and skips on NULL silently does nothing
- Both approaches appear to succeed (exit 0) but convert nothing, so drizzle-kit crashes as before

## The correct detection

Query `pg_attrdef` directly and check the DEFAULT expression text:

```sql
SELECT t.relname AS tbl, a.attname AS col,
       pg_get_expr(ad.adbin, ad.adrelid) AS def_expr
FROM   pg_attribute a
JOIN   pg_class     t  ON t.oid = a.attrelid
JOIN   pg_namespace n  ON n.oid = t.relnamespace
JOIN   pg_attrdef   ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE  n.nspname = 'public'
  AND  a.attnum > 0
  AND  NOT a.attisdropped
  AND  a.attidentity = ''
  AND  pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval(%'
  AND  t.relname = ANY(excluded_tables)
```

Extract the sequence name with regex (no `pg_get_serial_sequence`):
```sql
v_seq_name := substring(r.def_expr FROM $rx$nextval\('([^':]+)$rx$);
```

## The fix (idempotent)

1. `ALTER TABLE t ALTER COLUMN id DROP DEFAULT` — removes the nextval() reference
2. `ALTER SEQUENCE seq OWNED BY NONE` — severs any OWNED BY
3. `DROP SEQUENCE IF EXISTS seq_name` — now unblocked
4. `ALTER TABLE t ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (START WITH n)` — restores auto-increment as IDENTITY

## The residual 2BP01 problem (every deploy after first)

After SERIAL→IDENTITY conversion, the IDENTITY column keeps an internal sequence in `public` schema with `deptype='i'`. On every subsequent deploy:
- Phase 1 fix skips it (column now has `attidentity != ''`)
- drizzle-kit sees the sequence as an orphan → tries to DROP → Postgres blocks with 2BP01

**PostgreSQL does NOT allow `ALTER SEQUENCE SET SCHEMA` for IDENTITY sequences** ("cannot move an owned sequence into another schema") — so hiding them in a private schema is not possible.

**The mitigation**: The 2BP01 catch in deploy.sh suppresses this. Critical bug was: the old catch gated on `$PUSH_EXIT -ne 0 &&` BUT with `--force`, drizzle-kit sometimes exits 0 even after printing the 2BP01 error (it continues past the failed DROP). The fix: check the **output text** for 2BP01 regardless of exit code:

```bash
# WRONG — misses the case where drizzle exits 0 after printing 2BP01:
if [[ $PUSH_EXIT -ne 0 ]] && echo "$PUSH_OUT" | grep -qE "cannot drop sequence|2BP01"; then

# CORRECT — catches 2BP01 regardless of drizzle exit code:
if echo "$PUSH_OUT" | grep -qE "cannot drop sequence|2BP01"; then
```

## The "type serial does not exist" crash (drizzle-kit 0.31.9)

drizzle-kit 0.31.9 detects serial columns via `EXISTS (SELECT FROM pg_attrdef ...)` — it looks for a `nextval()` entry in `pg_attrdef`. IDENTITY columns never have a `pg_attrdef` entry; their auto-increment is stored in `pg_attribute.attidentity`. So after step 3c converts an excluded-table column to IDENTITY, drizzle-kit reads it as plain `integer`.

If a drizzle-**managed** table (NOT in tablesFilter) ends up with an IDENTITY column (e.g. step 3c was mis-applied, or manual ALTER), drizzle-kit detects a diff (DB=`integer`, schema=`serial()`) and generates:

```sql
ALTER TABLE "foo" ALTER COLUMN "id" SET DATA TYPE serial
```

PostgreSQL rejects this: `serial` is a DDL-only keyword, not in `pg_type`, so `ALTER COLUMN TYPE serial` fails with error 42704 "type serial does not exist".

**Fix (deploy.sh step 3d):** Before the drizzle-kit push, scan for IDENTITY integer columns on drizzle-managed (non-excluded) tables and revert them to proper serial (DROP IDENTITY → CREATE SEQUENCE OWNED BY → SET DEFAULT nextval). This is the mirror of step 3c, idempotent.

## Gotchas

- Adding a table to `tablesFilter` in `drizzle.config.ts` is NOT enough — the same name must ALSO be added to `excluded_tables` in deploy.sh's sequence-fix block (step 3c) **and** must NOT appear in step 3d's excluded_tables (step 3d only touches drizzle-managed tables).
- The `1` suffix on a sequence name (e.g., `data_transfer_jobs_id_seq1`) means the original name was taken when the sequence was recreated — the fix block handles any name because it reads the name from `pg_attrdef`, not from a hardcoded list.
- drizzle-kit `--force` flag changes exit behavior: it can exit 0 after a failed DROP statement, making output-based checks mandatory.

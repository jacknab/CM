---
name: Drizzle schema ownership
description: Tables used by application code must have one explicit schema owner so deploy-time schema pushes cannot remove them.
---

Migration-only tables that application code queries should either remain explicitly excluded from Drizzle and be repaired by migrations, or be promoted fully into the canonical Drizzle schema. Do not mix the two models.

**Why:** A table created by an earlier migration can exist without newer columns when migration history was baseline-seeded. A route-level `CREATE TABLE IF NOT EXISTS` does not repair that shape and a partially excluded table can later drift during schema pushes.

**How to apply:** When a migration-managed table becomes part of the normal application schema, define it in both the canonical schema and the generated push schema, remove it from `tablesFilter` and deploy sequence guards, and add an idempotent catch-up migration for existing databases.
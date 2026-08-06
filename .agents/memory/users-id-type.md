---
name: users.id is VARCHAR/UUID
description: The users table primary key is character varying (UUID), not integer. Critical for FKs.
---

## Rule
`users.id` is `character varying` with default `gen_random_uuid()` — a UUID stored as varchar.

**Any column that references users(id) must be:**
- SQL migration: `VARCHAR REFERENCES users(id)`
- Drizzle schema: `text("column_name")`
- NOT `integer` or `serial`

## Why it matters
Declaring `INTEGER REFERENCES users(id)` causes a Postgres error at migration time:
> "foreign key constraint cannot be implemented"

This burned a restart cycle on the email preferences migration (0029).

## How to apply
Before adding any FK to `users`, confirm the type with `\d users` — look for `character varying` on the id column.

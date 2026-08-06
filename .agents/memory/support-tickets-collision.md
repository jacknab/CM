---
name: support_tickets table collision
description: The support_tickets table was created by the AI voice agent with different columns than the back-office system expects.
---

## Rule
When inserting back-office tickets into `support_tickets`, always use the back-office columns (`account_id`, `subject`, `description`, etc.) and do NOT include `issue`. The `issue` column has been made nullable via `ALTER TABLE support_tickets ALTER COLUMN issue DROP NOT NULL`.

## Why
The `support_tickets` table was originally created inline by the AI voice support agent (routes/supportAgent.ts) with columns: `name`, `phone`, `email`, `issue` (NOT NULL), `status`, `priority`, etc. The back-office system (routes/support.ts) later tried to use the same table name but with a completely different schema (`account_id`, `ticket_number`, `subject`, `description`). The `issue NOT NULL` constraint blocked all back-office inserts.

## Fix applied
```sql
ALTER TABLE support_tickets ALTER COLUMN issue DROP NOT NULL;
-- Added via ALTER TABLE IF NOT EXISTS:
-- account_id, ticket_number, subject, description, category, subcategory,
-- source, account_name, assigned_agent_id, assigned_agent_name,
-- created_by_agent_id, first_response_at, last_response_at
```

## New tables created (back-office support schema)
- `support_notes` — internal agent notes per account
- `support_account_tags` — colored tags per account (UNIQUE on account_id, tag)
- `support_agent_activity` — audit log for agent actions (already existed)
- `support_macros` — shared/personal reply templates
- `support_tasks` — per-ticket task checklist
- `support_escalations` — escalation records per ticket

---
name: Certxa Support Agent
description: Standalone AI voice support representative — architecture, paths, and activation requirements.
---

# Certxa Support Agent

## What it is
A dedicated AI voice support module for inbound Certxa customer calls. Completely separate from the AI Receptionist.

## Key files
- `artifacts/api-server/src/routes/supportAgent.ts` — full service (WebSocket bridge, KB retrieval, tools, admin API)
- `artifacts/api-server/knowledge-base/` — 15 .md files (appointments, booking, customers, pos, payroll, commissions, technicians, memberships, websites, billing, subscriptions, stripe, reports, troubleshooting, faq)
- `artifacts/booking/src/pages/admin/SupportAgentDashboard.tsx` — admin frontend
- `shared/schema.ts` — supportTickets + supportCallLogs tables at end of file

## DB tables
Applied via raw SQL (drizzle push is interactive and prompts for renames). Use the api-server's pg pool to apply manually.
Tables: `support_tickets`, `support_call_logs`

## Routes
- `GET  /api/support-agent/health` — public health check
- `POST /api/webhook/twilio/support` — Twilio inbound webhook
- `WSS  /support-agent-stream` — Twilio media stream
- `GET/PATCH /api/admin/support-agent/tickets` — ticket CRUD (admin only)
- `GET  /api/admin/support-agent/call-logs` — call history (admin only)
- `GET  /api/admin/support-agent/analytics` — aggregate stats (admin only)

## Registration
Imported and called alongside `setupAiReceptionistRoutes` in `artifacts/api-server/src/routes.ts` around line 94/575.

## Knowledge base path quirk
The compiled bundle lives in `dist/`, so the KB path must be `join(__dirname, "..", "knowledge-base")` — one level up from dist, sibling directory.

## Activation requirements
- `AI_INTEGRATIONS_OPENAI_API_KEY` or `OPENAI_API_KEY` — required for live calls (routes registered without it, calls fail gracefully)
- Twilio phone number → webhook pointed at `/api/webhook/twilio/support`
- `APP_URL` env var — used to construct the WSS URL in the TwiML response

## Tools the agent has
1. `search_knowledge_base` — keyword retrieval from loaded .md files
2. `lookup_certxa_account` — finds account by caller phone or business name (read-only)
3. `create_support_ticket` — writes to support_tickets table with priority
4. `get_account_info` — returns caller's account details from session context

## Emergency detection
Keyword phrases trigger automatic high-priority ticket creation (system down, can't process payments, appointments disappeared, etc.)

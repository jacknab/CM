# Certxa Telephone Support Line

The Certxa telephone support line is an independent copy of the salon AI receptionist's Twilio/OpenAI Realtime voice bridge. The agent is named **Brian** and uses OpenAI's **Cedar** voice, selected for its clear, natural, masculine presentation. It supports Certxa clients without changing or sharing routes with the salon receptionist.

## What it does

- Answers inbound calls as Certxa Support.
- Recognizes a client account from caller ID when the number matches a Certxa location.
- Searches the Markdown knowledge base before answering product questions.
- Reads subscription and account information without changing client data.
- Finds existing voice-support tickets.
- Creates normal, high, or urgent support tickets in the main support back office.
- Stores the call outcome, duration, transcript when available, and ticket relationship.
- Can email a written call summary when the caller supplies an email address.

## Routes

| Purpose | Route |
|---|---|
| Twilio inbound voice webhook | `POST /api/webhook/twilio/support` |
| Twilio media WebSocket | `WSS /support-agent-stream` |
| Health and readiness | `GET /api/support-agent/health` |
| Admin settings | `GET /api/admin/support-agent/settings` |
| Admin voice tickets | `GET /api/admin/support-agent/tickets` |
| Admin call logs | `GET /api/admin/support-agent/call-logs` |
| Admin analytics | `GET /api/admin/support-agent/analytics` |

The implementation is registered by the API server in `artifacts/api-server/src/routes.ts` and lives in `artifacts/api-server/src/routes/supportAgent.ts`.

## Required environment

```dotenv
APP_URL=https://app.certxa.com
OPENAI_API_KEY=...
TWILIO_AUTH_TOKEN=...
```

`AI_INTEGRATIONS_OPENAI_API_KEY` may be used instead of `OPENAI_API_KEY`. Existing email configuration is required only for follow-up emails. `APP_URL` must be the exact public origin Twilio calls; it is also used to construct the secure WebSocket URL and validate the Twilio signature.

In production, the webhook fails closed if `TWILIO_AUTH_TOKEN` is absent or the `X-Twilio-Signature` is invalid. Development without a Twilio token is allowed for local testing only.

## Twilio setup

The configured Twilio account already owns **+1 (844) 668-0500**, with voice capability enabled and its HTTP POST voice webhook set to `https://certxa.com/api/webhook/twilio/support`. No additional number purchase is currently required.

1. Buy or select the dedicated Certxa support telephone number in Twilio.
2. Under **Voice configuration → A call comes in**, select **Webhook**.
3. Set the method to **HTTP POST**.
4. Set the URL to `https://app.certxa.com/api/webhook/twilio/support` (replace the origin if production uses another public API origin).
5. Save, then call the number and confirm `GET /api/support-agent/health` reports an OpenAI key, Twilio authentication, a public app URL, and loaded knowledge-base documents.

The public reverse proxy must explicitly support WebSocket upgrades for `/support-agent-stream`. The repository Nginx configurations include this route with buffering disabled and long call-duration timeouts.

Do not point client salon numbers at this route. Salon receptionist numbers continue using `POST /api/webhook/twilio/:storeId`.

## Knowledge base

Articles are loaded at server startup from `artifacts/api-server/knowledge-base/*.md`. Add or update an article and restart the API process to reload it. Current topics cover appointments, booking, billing, commissions, customers, FAQs, memberships, payroll, POS, reports, Stripe, subscriptions, technicians, troubleshooting, and websites.

The agent is instructed not to guess. If it cannot ground an answer in the knowledge base, it should create a support ticket rather than invent a product behavior.

## Ticket and call data

Voice-created tickets use a `VOICE-*` human-facing ticket number, channel `VOICE`, account association when caller ID resolves, and an opening inbound message containing the caller's issue. This makes telephone tickets visible in the same support back office as web and email tickets.

Urgent phrases such as payment processing being down, missing appointments, missing customer data, or an offline website cause the agent to create an urgent ticket. The voice agent remains read-only: it can explain and troubleshoot but cannot alter account settings, issue credits, promise refunds, or modify client data.

## Deployment checks

```bash
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/api-server build
```

After deployment:

1. Request `/api/support-agent/health` and verify all readiness fields.
2. Place a call from a known account number and confirm account recognition.
3. Ask a documented product question and confirm the knowledge-base answer.
4. Ask to escalate an unresolved issue and confirm a `VOICE-*` ticket appears in the support back office.
5. Simulate an invalid Twilio signature and confirm the webhook returns HTTP 403.

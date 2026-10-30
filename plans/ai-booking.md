# Booking through AI assistants (ChatGPT, Claude, Google)

Owner request 2026-10-30: let someone book a Certxa salon by asking an AI assistant.

## What is live

**Certxa MCP server: `https://certxa.com/mcp`** (`artifacts/api-server/src/routes/mcp.ts`).
MCP (Model Context Protocol) is the standard ChatGPT apps and Claude connectors use to call outside services.
Public, no sign-in (like the booking page), stateless Streamable HTTP with JSON replies.

| Tool | What it does |
|---|---|
| `search_salons` | Find bookable Certxa salons by name, city, state, ZIP and/or service |
| `get_salon` | Address, phone, hours, staff, services (id, duration, price), booking rules |
| `check_availability` | Open times for one service on one date (per staff member); if full, the next 3 open days |
| `book_appointment` | Books through the salon's own booking endpoint; returns confirmation + manage link |

Every tool calls the salon's public booking endpoints over loopback, so an AI booking follows the booking
page's rules exactly: online booking on/off, notice and advance limits, ban list, existing-clients-only,
manual approval (returns `requested`), deposits (booking held, payment link texted, returned as
`payment_url`), card on file (returns the booking page link: an assistant can't take a card), confirmation
texts and e-mails.

Safeguards: time just taken → `slot_taken` with the 5 nearest open times that day; the same booking asked
again within 30 minutes (same salon, phone, time) returns the existing booking; max 5 bookings per phone per
hour; 60 requests/minute per address.

Bookable salons: active account, booking address, online booking not off, at least one public service.
There is no test-account flag, so "Test Salon — Evaluation Only" and "Toby's" (Pro test) are listed too.

Tested 2026-10-30 on the isolated test server (scratch database): 20 checks pass (protocol, search,
details, availability, booking, repeat call, slot taken + alternatives, bad input, manual approval, booking
off). Live: read-only checks against certxa.com. Not tested: a deposit salon (needs Stripe connected).

## Try it now

- **Claude:** Settings → Connectors → Add custom connector → URL `https://certxa.com/mcp`, no authentication.
- **ChatGPT:** Settings → Apps & Connectors → Advanced → Developer mode on → Create → URL
  `https://certxa.com/mcp`, authentication "No authentication". Then in a chat: "Book me a gel manicure at
  Luxury Nails in Tucson on Saturday afternoon."

## Listing in ChatGPT's app directory (owner's steps)

Submit in the OpenAI Platform (developer account with a verified organization). It asks for:
- Name: **Certxa** · Short description: "Find and book nail salons, hair salons, barbershops and spas that use Certxa."
- MCP server URL: `https://certxa.com/mcp` · Authentication: none
- Logo: `apps/certxa-owner/assets/icon.png` · Website: https://certxa.com · Privacy policy: https://certxa.com/privacy · Terms: https://certxa.com/terms · Support: support@certxa.com
- Test prompts and expected results:
  1. "Find a nail salon on Certxa in Tucson, AZ." → `search_salons` returns Luxury Nails.
  2. "What services does Luxury Nails offer and how much is a basic manicure?" → `get_salon`, $25, 30 minutes.
  3. "Is there an opening for a basic manicure at Luxury Nails next Saturday?" → `check_availability` lists times.
  4. "Book the first one for Jane Test, 520-555-0100." → asks to confirm, then `book_appointment` (use a test salon for reviewers).
- Country: United States.

Before submitting: decide whether the test accounts should be hidden from AI search (a per-salon switch is
not built).

## Google (Search AI Mode, Gemini, Maps "Book")

Google does not take MCP. Its door is **Reserve with Google** (the Actions Center appointments
integration): apply as a booking partner, then build Google's feeds (merchants, services, availability) and
its booking server API. Google says integrations take about 12–16 weeks once accepted. Answers for the
interest form: [google-reserve-application.md](google-reserve-application.md). The MCP tools' logic
(availability, booking through the public endpoint, slot-taken handling) is what the booking server reuses.

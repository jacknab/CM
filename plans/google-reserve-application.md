# Reserve with Google (Actions Center): answers for the partner interest form

Prepared 2026-10-30 for the owner to submit. Google's form: start at
https://developers.google.com/actions-center (Appointments / Local services → "Express interest").
Facts below are from the live system on 2026-10-30; check the salon count on the day you submit.

| Question (typical) | Answer |
|---|---|
| Company name | Certxa |
| Website | https://certxa.com |
| Contact | (owner's name and e-mail; support@certxa.com for technical contact) |
| Country / market | United States |
| Vertical | Beauty and wellness: nail salons (primary), hair salons, barbershops, spas, waxing and massage |
| What you are | A booking and point-of-sale platform (SaaS) used by salons to run their calendar, online booking, walk-in check-in, checkout and payroll. Each salon's real calendar lives in Certxa. |
| Number of merchants | 8 active salons today (2026-10-30), with free Solo accounts and paid salon plans open for sign-up |
| Booking volume | (owner: monthly online bookings, from Reports) |
| Real-time availability | Yes: availability is computed live from each salon's staff schedules, business hours, existing appointments and booking rules (notice, advance limit, buffers) |
| Can you create bookings by API | Yes: bookings are created against the live calendar with conflict checks; a taken time is refused |
| Cancellation | Yes: each booking has a manage link to view and cancel, honouring the salon's cancellation window |
| Payments / deposits | Salons can require a deposit or card on file (Stripe); salons without a payment policy book with no payment |
| Merchant matching | Each salon has name, street address, phone and coordinates; Google Business Profile connection is built into Certxa |
| Existing AI / agent integrations | Public MCP server for AI assistants (https://certxa.com/mcp): search, availability and booking |
| Technical resources | In-house engineering; integration can start on acceptance |

## Be ready for

- **Merchant count.** Google weighs a partner's size. Eight salons is small; say so plainly and describe the
  growth path (free Solo plan, salon plans from $29/month). If Google declines now, apply again once the
  count is larger.
- **Every salon needs a verified Google Business Profile** at the same address and phone as in Certxa.
- **Integration work after acceptance** (not started): merchant feed, services feed, availability feed and
  the booking server (`CheckAvailability`, `CreateBooking`, `UpdateBooking`, `GetBookingStatus`), plus
  Google's test and launch reviews. The MCP server's availability and booking logic is the starting point.

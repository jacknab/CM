# Solo plan: where you see clients, and booking approval

Started 2026-10-16. Independent beauty professionals on the Solo plan don't all work in a salon. Some rent a chair, booth or suite. Some work from a home studio. Some go to their clients. Many do a mix. They also need to decide whether a booking is accepted straight away or reviewed first. The reference app is GlossGenius.

## Owner decisions (2026-10-16)

- **Who:** every business on the Solo plan, in the Certxa Pro app and on the website. Other plans don't see these settings.
- **A mix is allowed:** their own place (salon/suite/booth or home studio) and house calls.
- **Travel fee:** one flat amount per house call (optional).
- **Service area:** a radius in miles from the professional's base address.
- **Booking approval:** a setting with two choices, auto-approve or manual approval. With manual approval:
  - **A new online booking is a request.** The professional gets a push notification and reviews it.
  - **Approve:** it becomes a normal booking and the client is told.
  - **Can't do that time:** the professional picks the times they can offer for this request. The client gets a message with a link to a page showing only those times, and picks one. That becomes the booking.

## What GlossGenius does

Each location is a "Fixed Location" or a "House Call" location. There's no real way to keep a home address private: their help centre suggests typing "Address Provided Upon Booking" into the address field ([GlossGenius help: hiding business details](https://support.glossgenius.com/en/articles/794-how-to-hide-your-business-details-name-hours-location-etc)). Certxa will keep a home studio's address private properly.

## Where you see clients

### Settings (per business)

- **Your place:** none, a salon/suite/booth, or a home studio.
  - **Salon/suite/booth:** the address is public, as today.
  - **Home studio:** the address is **private**. Clients see the city only, until they have booked.
- **House calls:** on or off.
  - When on: a radius in miles from the base address, an optional flat travel fee, and travel time added before and after each house call.
- **The base address:** the business address (`locations.address`). It's required by Stripe for payments and Tap to Pay, and used as the centre of the house-call radius. For a home studio or house calls only, it is never shown to clients except as below.

### Services

Each service is offered at the professional's place, at the client's place, or both (default: wherever the business works).

### Bookings

- **Where the visit happens:** each appointment records it (their place / the client's place), plus the client's address and the travel fee for a house call.
- **The client's address** is saved on the client record too, so a repeat house call can reuse it.
- **Online booking page:**
  - When a service can be done in both places, the client chooses.
  - For a house call, they enter their address. It's checked against the radius (geocoded with the US Census geocoder, as for the salon directory), the travel fee is added to the price, and travel time is blocked on the calendar.
- **Booking in the app:** the professional chooses where and enters the client's address.
- **Appointment screen:** shows the address with "Open in Maps", and the travel fee.
- **Checkout:** includes the travel fee.

### Keeping a home address private

The full address is shown only to the professional and to a client with a booking. That means confirmations and reminders, plus the online receipt. Everywhere else shows the city:
- the booking page themes, the confirmation screen and the receipt before booking
- the salon website and its search data (`tenant-seo.ts`: `areaServed` in place of the street address)
- the salon directory listing
- the AI receptionist Autumn, which won't read the address out
- deals
- Google Business Profile sync

## Booking approval

- **The setting:** auto-approve (today's behaviour, the default) or manual approval.
- **A request** is a row in its own `booking_requests` table, not an appointment. Many queries (reminders, reports, availability, the /nail board) treat every non-cancelled appointment as a real booking, so a request must never be one. Approving it creates the appointment through the normal booking path. A request doesn't hold its time for other online bookings; it shows in the professional's "Requests" list and on their calendar as a request.
- **New request:** a push notification to the Certxa Pro app, plus email/text to the professional as their notification settings say. The client sees "Request sent. You'll hear back soon."
- **Approve:** the appointment is created (a normal booking) and the client gets the usual confirmation. If the time was taken meanwhile, the professional is told and can offer other times instead.
- **Offer other times:**
  1. The professional picks one or more times they can do.
  2. The client gets a text/email with a link to `/book/<slug>/offer/<token>`, a page showing only those times.
  3. Picking one books it (auto-approved, since the professional offered it) and the other offered times are released.
- **Decline:** the client is told it couldn't be booked.
- **Requests not answered** within a set time (default 48 hours) expire, and the client is told.

## Order of work

1. **Data:** the business settings, the service "where" setting, the appointment and client address fields, and the `booking_requests` / offered-times tables (migration).
2. **Settings:** in the Certxa Pro app and on the website (Solo plan only). Sign-up asks "Where do you see clients?", and "Get paid" words the address as private when it should be.
3. **Privacy:** the home address hidden on every public surface listed above.
4. **House-call booking:** the online booking page and in-app booking, with the radius check, travel fee and travel time; the appointment screen with maps; checkout.
5. **Booking approval:** the setting, requests, the push notification, approve / offer times / decline, the client's offered-times page, and expiry.

## Progress

- 2026-10-16: plan written.
- 2026-10-16: Step 1 (data) done. Migration 0246 is applied, and every default keeps today's behaviour (all 6 businesses: own place "salon", no house calls, auto-approve). `booking_requests` is excluded from drizzle-kit (migration-only). The columns are in `shared/schema.ts` (locations, services, appointments) and `shared/schema/clients.ts`.
- 2026-10-16: Step 2 (settings) done:
  - **Server:** `routes/workPlaces.ts` provides `GET`/`PUT /api/work-places`, Solo plan only, with every value checked and at least one way of seeing clients required. The general `PATCH /api/stores/:id` ignores these fields. `/api/solo/register` takes `ownPlace` and `houseCalls`.
  - **Certxa Pro app:** sign-up asks "Where do you see clients?"; Settings has "Where you see clients"; the Get paid address wording follows the choice (private for a home studio or house calls only).
  - **Website:** Settings → Business → "Where You See Clients" (`pages/settings/WorkPlacesSettings.tsx`), shown on the Solo plan only.
- 2026-10-16: Step 3 (privacy) done:
  - **Owner's change:** the address is the professional's own choice, "Keep my address private" (`locations.address_private`, migration 0247), not tied to "home studio". Picking home studio switches it on, picking a salon/suite switches it off, and either can be changed. With no place of their own (house calls only) the address is always private.
  - **One rule** in `lib/publicStore.ts` (`publicStoreView`, `bookedClientStoreView`, `addressIsPrivate`), applied to: the public store endpoint and the subdomain endpoint (every booking theme); the website and its search data (`tenant-data.ts` SQL); Autumn (city only, told the address is private); deals; the Stripe support address (it prints on card receipts); and the directory importer's Certxa-store rows.
  - **Booking themes** show "City, ST · Address sent after you book" (`lib/storeAddress.ts`), with no directions or map.
  - **A client who has booked** (booking confirmation) still gets the full address.
  - **Google Business sync** only reads the address from Google, so nothing to change there.
  - **Found and fixed:** the public store endpoints also returned internal fields to anyone: EIN, legal entity, activation code, Stripe customer ID, credit and SMS balances, suspension details. They're now stripped for every business.


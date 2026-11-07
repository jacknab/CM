# Controlled salon account creation

This feature stages `nail_salons` records as unclaimed Certxa Pro Solo accounts and publishes a review-ready Bloom website. It does not create accounts at startup or when deployed.

## Before the first run

1. Apply the feature migration as part of the normal API-server migration rollout.
2. Confirm the API server can reach PostgreSQL and Redis/BullMQ. Google Places credentials are loaded by the API server from `/etc/certxa.env`; key values are not returned by the management API or written to logs.
3. Confirm current Google Maps Platform terms permit the intended display and permanent name-derived slug. The system imports no Place photos. Unclaimed Places-derived fields are scheduled for deletion before 30 days, and the site is unpublished when that deadline expires. Only the Place ID and assigned URL remain. A start action is blocked until an admin explicitly records policy review.

## Dry run and production control

Open **Back Office → Salon Creation** (`/isadmin/salon-account-creation`).

- **Test one · no writes** runs a Places lookup for a selected source ID. It creates no queue job or Certxa account.
- **Scan batch** records only match/skip decisions, up to five records per request. Scan repeatedly to review a small sample; it creates no accounts.
- To start production, review the matches, tick the Google data-use approval, type exactly `START PRODUCTION RUN`, and select **Approve and start**. This approval is not triggered by page load, deploy, migration, or worker startup.
- The queue then continues through remaining source records automatically. Jobs and audit events are stored in PostgreSQL; BullMQ jobs and pause state are persisted in Redis. Account creation starts are limited to one every six minutes (10/hour, at most 240/day).
- **Pause** stops new jobs; **Resume** continues the already-approved run. Restarting the server preserves progress and does not approve an unapproved run.

## What each created account contains

- A Certxa Pro user shell with a non-routable `.invalid` system alias and an unguessable password hash. Both website and Pro-app login reject the shell until a verified claim is completed. No owner email or password is invented or sent.
- The salon owner must first register a real Certxa Pro account. Platform staff then use the verified-claim panel only after checking ownership and email. The claim captures the owner-confirmed business name and any confirmed contact fields; it replaces Places-derived fields and repopulates the page. The online booking mode is `off` (“Nobody”) until the owner changes it.
- A permanent, collision-checked slug; a published Bloom site; a source/ownership notice; and the original website link only when valid. No imported photos, reviews, or first-person salon claims are added.
- Generic services are staged inactive and hidden from public menus. They use the existing service schema’s explicit unpriced-placeholder flag; the owner UI shows “Not set”, and a real owner-entered price is required before activation. No predefined nail-service pricing is seeded.

## Validation performed in this workspace

- Seven unit tests cover match confidence, address mismatch, slug rules, reserved internal aliases, booking mode and the price-free draft catalog.
- Three read-only sample lookups matched source rows 1 and 2 at 100% and rejected row 3 at 35%; no database writes were performed by the lookups.
- API-server typecheck and the booking-app Vite production build passed. The independent Bloom project typecheck could not run because its npm registry was unreachable; TSX syntax was separately bundled with esbuild.
- No migration was applied, no account queue was started, no account was created, and nothing was committed or deployed.

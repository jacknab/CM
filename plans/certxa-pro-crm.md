# Certxa Pro app — CRM (owner request 2026-11-03)

"Audit the booking application for its CRM setup and ensure this app also has a great CRM."

## What the website has (artifacts/booking: Customers, ClientProfile, ClientDetail, At-Risk)

All on the server already (`routes/clients.ts`, `routes/intelligence.ts`), all usable with the app's sign-in:

| Feature | Endpoint |
|---|---|
| Client list with status (New / Regular / VIP / At risk / Inactive — `shared/clientStatus.ts`), tags, search | `GET /api/clients`, tags `GET /api/clients/tags/list` |
| Profile: name, preferred name, birthday, allergies, VIP, phones, e-mails, addresses, custom fields | `GET/PATCH /api/clients/:id` |
| Live stats: visits, lifetime spend, last 12 months, last visit | in `GET /api/clients/:id` |
| Visit history (past + upcoming) | `GET /api/clients/:id/appointments` |
| Notes with pinning | `GET/POST/PATCH/DELETE /api/clients/:id/notes` |
| AI summary of the client | `GET /api/clients/:id/profile-note` |
| Tags (add / remove / create) | `POST /api/clients/:id/tags`, `DELETE …/tags/:tagId`, `POST /api/clients/tags` |
| Marketing consent (only `sms_marketing_opt_in` and `review_requests` are honoured when texts go out) | `GET/PUT /api/clients/:id/marketing-preferences` |
| Revenue intelligence: visit rhythm, next expected visit, churn risk, no-show rate, rebooking rate | `GET /api/intelligence/client/:id` |
| Win-back text | `POST /api/intelligence/winback` |
| Photo | `POST /api/customers/:id/photo` |
| Duplicates + merge, import, export | `/api/clients/detect-duplicates`, `/merge`, `/import/*`, `/export` |
| Reviews by the client, deposits, purchases, loyalty points | various |

## What the app had (before)

Clients tab: list searchable by name only; a client page showing **placeholder numbers** ("0 visits · — lifetime
spend", last visit "Certxa client" for everyone — the list endpoint never sent real stats); edit name / phone /
e-mail; Book appointment; one line of the latest note. The full notes screen was reachable only from an appointment.

## Phase 1 — built 2026-11-03 (existing endpoints, no new product decisions)

- Real numbers: the app's `GET /customers` (routes/certxaPro.ts) now sends visits, spend, last visit, last service,
  next appointment, allergies, VIP and tags per client.
- Clients list: search by name, phone or e-mail; filters All · Upcoming · New · Regular · At risk · Inactive · VIP
  (the website's rule); status shown on each row.
- Client profile screen (`app/client/[id].tsx`): status + tags, Call / Text / Book / Notes, allergy alert, stats
  (visits, lifetime spend, average visit, last 12 months, last visit, next visit, no-shows, loyalty points), visit
  rhythm from intelligence, upcoming and past visits (tap to open), pinned and latest notes, details (preferred
  name, birthday, allergies, VIP) editable, tags add/remove, the two marketing switches that work.

## Phase 2 — needs the owner's decision

1. Import contacts from the iPhone (expo-contacts: a native module, permission prompt, new build).
2. Find and merge duplicate clients.
3. Client photo (camera / library).
4. Win-back text from the profile (spends 1 SMS credit for a Pro account).
5. AI summary of the client on the profile.
6. Before/after photos per visit (formulas, nail designs).

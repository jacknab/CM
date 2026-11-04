# Intake forms: audit (2026-11-03)

Owner asked: intake forms were built on the website side but got buried, and the link isn't shown anymore.

## What exists
| Piece | State |
|---|---|
| Owner form builder `/intake-forms` (`pages/IntakeForms.tsx`) | **Works.** Create/edit/delete forms; field types: short text, paragraph, select, checkbox/agreement, radio, date, phone, e-mail, signature; required fields; a "required before booking" switch. |
| Server (`routes.ts` ~22360) | GET/POST/PUT/DELETE `/api/intake-forms`, GET `/api/intake-forms/responses`, POST `/api/intake-forms/:id/respond`. Tables `intake_forms`, `intake_form_fields`, `intake_form_responses`. |
| Where the owner finds it | `/manage` dashboard tile and the mobile bottom menu only. **The desktop sidebar link was lost** in the sidebar redesign (commit `2cbda8c9`, "Update dashboard navigation to match image style"): it used to be in two sidebar sections. Not in Settings either. |
| Data | 0 forms, 0 responses on the whole platform. |

## What was never built (no commit ever had it)
1. **The client side.** No booking page (Bloom, Simple, Classic, Mobile, the barber/hair ProBooking), confirmation text, or standalone page shows a form to a client. "Required before booking" is saved but nothing reads it.
2. **Reading answers.** The builder shows only a count of responses. Nothing shows a client's answers on their profile or appointment.
3. **Attaching a form to a service.** The server stores `service_id`, but the builder has no field for it.
4. The Help Center (`HelpCenter.tsx`) says all three of these work ("attach them to specific services… clients will be prompted… responses appear on the appointment and client profile"). It's wrong today.

## Problems found
- **`POST /api/intake-forms/:id/respond` is open to anyone** (no sign-in, no rate limit) and accepts any `customerId` / `appointmentId` without checking they belong to the form's business, so answers could be attached to another business's client or booking. Low impact now (no forms exist), but it must be fixed before the client side goes live.

## Recommended build (not started; waiting for the owner)
1. Put the builder back in the desktop sidebar (Clients area) and in the Pro app (Settings › Intake forms: simple builder).
2. Client side as **one secure link page** `certxa.com/form/<token>` instead of a step in every booking design: the
   link is texted with the booking confirmation for any form marked "before booking" (or for the booked service), and
   the pro can send it from a booking or client in the app ("Send intake form"). Works for every design, the app and
   the AI receptionist's bookings.
3. Replace the open respond route with the token one (form, client and booking fixed by the token).
4. Answers on the client profile (website + Pro app) and on the booking.
5. Service picker in the builder; fix the Help Center text.

# POS setup (first-time setup of the /nail POS)

Owner request 2026-10-31: an onboarding flow for the POS covering every POS question (taxes first), and a step
that sets up the first cash drawer on the main POS register. Built and live the same day.

## Audit: what the POS depends on, and what a new salon had on day one

| Setting | Where it lived | New salon before this |
|---|---|---|
| Sales tax rate + taxable (services, add-ons, retail, gift cards) | Settings › POS Settings (`locations`) | 0% — no tax charged |
| CARD button: Certxa reader (Stripe M2) or own provider | POS Settings › CARD button (`preferences.cardProvider`) | Certxa reader, even with no Stripe account |
| Cash price (% off for cash) | POS Settings (`locations.cash_discount_percent`) | Off |
| Cash drawer on the main POS register | Settings › Cash Drawers | None — the POS refused cash ("no cash drawer on this station") |
| Tip choices | POS Settings › Tip presets (`preferences.tipPresets`) | 15/18/20/25 |
| Turn method | Settings › Turn System, /nail Manager › Turn Rotation | Counted Turns |
| Tech IDs | given out on first sign-in; the owner had none until 10-31 | not shown anywhere at setup |
| Lock screen (Tech ID to use the POS) | /nail Manager › Lock Screen | On |
| Manager PIN | /nail Manager › Manager PIN | **2026 — the same for every salon** |

Not in the wizard (separate set-up, hardware or optional): Stripe account connection (Settings › Payments — the
wizard says when it is missing), printers, customer screen pairing, registers beyond the main one, quick area codes,
gift cards, loyalty.

## The flow (`artifacts/booking/src/pages/nail/PosSetupWizard.tsx`)

Welcome → Sales tax → Card payments → Cash price → First cash drawer → Tip choices → Turn rotation → Tech IDs + lock
screen → Manager PIN → Summary ("Your POS is ready"). Each answer is saved on Next through the existing settings
endpoints; nothing is new except:

- `GET /api/nail/pos-setup` — done or not, owner login or not, Stripe connected, the main drawer, team + Tech IDs,
  manager PIN still the default.
- `PUT /api/nail/pos-setup/drawer` — creates the main-station drawer (or updates the main register's drawer).
- `POST /api/nail/pos-setup/complete` — `preferences.posSetup.completedAt`.

Shown full screen in place of the POS until finished, to the owner's login only. "Finish later" hides it on that
tablet for the rest of the day. Manager › POS Setup opens it again. English, Vietnamese, Spanish and French.

Tested 2026-10-31 on the scratch test server: every step saved where the POS reads it (tax 8.7% on retail, own card
machine, 3% cash price, Drawer 1 $150 main station, dollar-based turns, lock on, new PIN works and 2026 is refused).

## Existing salons

None had finished it, so all 8 see it the next time /nail opens with the owner's login, filled with their current
settings. All of them were still on PIN 2026 and 0% tax.

---
name: Template Booking Integration
description: How the booking engine is embedded natively into the website builder template (no iframe).
---

# Template Booking Integration

## Rule
`BookingFlow.tsx` in `template_master/src/components/` IS the booking engine inside the template. It is a port of `artifacts/booking/src/pages/public-booking/MobileTheme.tsx`. Both must stay in sync — if booking logic changes in MobileTheme.tsx, apply the same change to BookingFlow.tsx.

**Why:** The task requirement forbids iframes and redirects. The template must own the full booking UX inside its slide-in panel.

## Key files
- `template_master/src/components/BookingFlow.tsx` — full booking state machine, ported from MobileTheme.tsx
- `template_master/src/components/BookingPanel.tsx` — slide-in panel that renders BookingFlow (no iframe)
- `template_master/src/context/BookingPanelContext.tsx` — holds `preSelectedServiceId` + `openWithService(id)`
- `template_master/src/components/Services.tsx` — Book button calls `openWithService(service.id)`
- `template_master/src/lib/timezone.ts` — timezone utilities (subset of booking app's timezone.ts)
- `template_master/src/App.tsx` — wraps everything in QueryClientProvider

## How pre-selection works
1. Customer clicks "Book" on a service card → `openWithService(serviceId)` sets `preSelectedServiceId` in context
2. `BookingPanel` renders `<BookingFlow key={slug+serviceId} preSelectedServiceId={serviceId} />`
3. `BookingFlow` uses a `useEffect` that watches `[preSelectedServiceId, services]` — once services are loaded, finds the matching service and calls the same `handleServiceSelect()` logic as if the customer clicked it manually

## Build
```
cd template_master && npm run build
```
This is a standalone npm project (NOT in the pnpm workspace). Dependencies are in `template_master/package.json` and `template_master/node_modules/`.

## API endpoints used (identical to MobileTheme.tsx)
- `GET /api/public/store/:slug` — store info + timezone
- `GET /api/public/store/:slug/services` — services, categories, addons
- `GET /api/public/store/:slug/availability` — time slots
- `GET /api/public/booking-payment-policy/:slug` — Stripe/deposit policy
- `POST /api/public/booking-setup-intent` — card-on-file
- `POST /api/public/booking-payment-intent` — deposit
- `POST /api/public/store/:slug/book` — create appointment

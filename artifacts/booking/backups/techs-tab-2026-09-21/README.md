# Techs tab — dark design backup (2026-09-21)

The Techs tab as it was before the light "Salon at a glance" redesign.

| File | Was at |
|---|---|
| `TechCards.tsx` | `src/pages/nail/TechCards.tsx` |
| `techLayout.ts` | `src/pages/nail/techLayout.ts` |
| `TechClockInSheet.tsx` | `src/pages/nail/TechClockInSheet.tsx` (unchanged by the redesign) |
| `techs-tab.css` | every Techs/glance rule from `src/pages/nail/nail.css` |

The client check-in panel on the left (`CheckInPanel.tsx`) was not touched by the redesign.

**Restore:** copy the three `.tsx/.ts` files back over `src/pages/nail/`, delete the `tt-*` rules (light design) from `nail.css`, and paste `techs-tab.css` back in.
Or use git: this design is exactly commit `8362d552` — `git checkout 8362d552 -- artifacts/booking/src/pages/nail/TechCards.tsx artifacts/booking/src/pages/nail/techLayout.ts artifacts/booking/src/pages/nail/nail.css`.
This folder is outside `src/`, so it is never built or shipped.

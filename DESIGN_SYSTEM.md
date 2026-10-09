# Certxa Rentals — Design System

Scoped to the Rentals product (`/rentals/*` in `artifacts/booking`). Certxa Salon has its own theme; this document does not apply there. Kept lean — add to it only when a new phase introduces a genuinely reusable pattern, not as a running commentary on every screen.

## Why a separate system

Rentals is a distinct product for facility operators, not a sub-feature of Salon. It deliberately does not reuse Salon's shadcn/theme-token primitives (`components/ui/*`) for anything carrying color — those primitives pull Salon's global `--primary`/`--sidebar` CSS variables (terracotta/cream), which would make Rentals read as a Salon add-on. Rentals is built with plain Tailwind utility classes on its own fixed palette instead, the same approach the internal `/isTeam` tool already uses for the same reason.

## Palette & type

- Chrome (sidebar, mobile nav): `neutral-950`/`neutral-900` graphite, single accent `amber-400` for active states.
- Content surfaces: `white` on `neutral-50`, borders `neutral-200`/`neutral-100`.
- Headings: `font-[Outfit]`. Body: `Inter` (both already loaded by `index.css`'s Google Fonts import — no new font requests).
- Status semantics use color only as a secondary cue — every status is always paired with a text label (never color alone).

## Status treatment

Every domain status (`SpaceStatusBadge`, `ProfessionalStatusBadge`, `AgreementLifecycleBadge` in `components/rentals/`) follows the same shape: a small colored dot + a text label, built from a `Record<Status, string>` color map and a `Record<Status, string>` label map defined once in `shared/rental*.ts`. New statuses should follow this pattern rather than inventing a new badge style.

## Inventory summary = filter, not KPI cards

Lists (Spaces, Professionals, Leases) show their status breakdown as clickable filter pills with counts (`All 18 · Available 4 · Occupied 12 ...`), never as separate colored stat cards. The summary is subordinate to the filtering workflow it doubles as.

## The Professional ↔ Space relationship

Wherever an Agreement is shown in a list (Leases list, and inline on Space/Professional detail pages), the Professional/business name and the Space name are shown adjacent with an arrow between them (`lucide-react`'s `ArrowRight`), e.g. `Maria's Nails → Suite 104`. This pairing is the single most important thing on the screen (Phase 4 Section 28) and should stay visually primary — rent, dates, and lifecycle are secondary, smaller, and below it.

## Rental terms formatting

Rent is always shown as `$amount frequency` (e.g. `$275 weekly`), via `RENT_FREQUENCY_LABELS` in `shared/rentalAgreements.ts` — never a bare number. Date ranges are `start → end`, with an open-ended agreement shown as `→ Month-to-month` rather than a blank or "N/A".

## Agreement lifecycle (derived, not stored)

Only two values are ever persisted (`active`/`terminated`); everything else the owner sees (Upcoming/Active/Ending Soon/Ended) is computed from dates at read time (`deriveAgreementLifecycle` in `shared/rentalAgreements.ts`) against the facility's own timezone, never server wall-clock. See that file's header comment for the full reasoning — this prevents status from ever contradicting an agreement's own dates.

## Forms

Grouped by real-world concept (e.g. "Person" / "Business" / "Contact" / "Facility"), not one flat list of inputs. Secondary/rarely-needed fields sit behind a single "Add details" progressive-disclosure toggle rather than being always visible. No field is required unless the workflow genuinely can't proceed without it.

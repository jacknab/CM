# Certxa HTML-First Salon Website — Implementation Report

Implements `plans/new_plan.md` on top of the findings in `WEBSITE-ARCHITECTURE-AUDIT.md`.
No destructive changes were made; no tables were dropped; no `drizzle-kit push` was run.

---

## 1. Files Changed

| File | Why |
|---|---|
| `artifacts/api-server/src/lib/render-salon-page.ts` | Rewritten from a single homepage renderer into a real multi-page SSR renderer (`/`, `/services/`, `/services/{id-slug}`, `/team/`, `/team/{id-slug}`, `/reviews/`, plus a genuine 404 for unknown paths). Replaced the client-side booking iframe drawer with plain `<a href>` Book Now links. Fixed the hardcoded `priceRange: "$"` and the generic stock-photo fallback for services with no real image. |
| `artifacts/api-server/src/lib/tenant-seo.ts` | Exported the previously-private, richer JSON-LD builder (`buildBusinessJsonLd`, was `buildJsonLd`) so both rendering modes can share one structured-data implementation. Added `buildBreadcrumbJsonLd` and `buildServiceJsonLd`. Added real `price`/`priceCurrency` to each service `Offer`, and an opt-in `review` array (only used on the page where those reviews are actually visible). |
| `artifacts/api-server/src/lib/tenant-data.ts` | Added a `staffServiceLinks` query (`staff_services` joined through `staff` for tenant-safe scoping) so service pages can show "performed by" and staff pages can show "services offered." |
| `artifacts/api-server/src/lib/tenant-page-urls.ts` | **New file.** Stable, zero-migration `id-slug` URL helpers (`idSlugPath`, `parseIdFromSlugParam`) — see §2. |
| `artifacts/api-server/src/lib/template-serve.ts` | Wired the new multi-page renderer into `serveAutoPage` (now path-aware, returns real 404s). Fixed a real bug where the auto-mode canonical URL pointed at `${appUrl}/${slug}` (no matching route) instead of the site's actual live URL. Replaced the dead/unreachable fragment-anchor sitemap logic (`/#services` etc.) with `buildTenantSitemapPaths()`, which emits only real, existing URLs. Exported `siteBaseUrl` for reuse. |
| `artifacts/api-server/src/routes/websites.ts` | Security fixes (§7): `published = true` now enforced on `/tenant/:slug/data` and `/tenant/:slug/status`; `/tenant/:slug` no longer does `SELECT *` (dropped `customDomainToken`, `stripeCheckoutSessionId`, template `filesPath`/`buildError`); `/websites/:id/preview` now requires authentication + ownership. Also fixed the same broken-canonical-URL bug in the `/websites/:id/auto-preview` route (used by the owner's settings-panel preview). |
| `artifacts/api-server/src/index.ts` | Added `app.use("/api/tenant", publicLimiter)` — same 60 req/min limiter already used for `/api/public` and `/api/book`, skipped outside production. |

## 2. Database Changes

**None. No migration was required or run.**

Real per-service and per-staff URLs were needed (`/services/{slug}`, `/team/{slug}`), but neither `services` nor `staff` has a `slug` column, and the plan explicitly discourages adding schema just for SEO pages. Instead, URLs use a stable `id`-prefixed slug (`/services/42-gel-x-manicure`) — the same pattern Stripe/Airbnb/Etsy use. The numeric id is authoritative; the trailing text is cosmetic and purely for readability/CTR. If a service is renamed, the old URL keeps resolving correctly (no 404, no duplicate page, no redirect needed) because only the leading digits are parsed. This satisfies "use stable slugs... avoid creating unnecessary duplicate pages" with zero schema risk.

I confirmed via a direct, read-only query against the live database that `wb_websites` currently has exactly 3 rows, **all `publisher_type = 'template'`, all published** — i.e., zero live customer traffic currently depends on `publisher_type = 'auto'`. This is why it was safe to extend/restructure the auto renderer this aggressively: there is no production regression surface for it today.

## 3. Routes Added/Changed

No new Express routes were registered. The same tenant-resolution entry points now do more:

- `handleTenantSiteBySlug` / `handleTenantSiteByDomain` (`template-serve.ts`) — unchanged signatures, but for `publisherType = "auto"` sites they now dispatch on the full request path instead of always rendering the homepage. Unknown paths now correctly 404 instead of silently re-rendering the homepage (this also closes a duplicate-content risk noted in the earlier audit).
- `GET /api/tenant/:slug/*` sitemap/robots handling — same route, corrected content (see §5).
- `GET /api/websites/:id/preview`, `/preview/*splat` — same route, now behind `isAuthenticated` + ownership check.
- `GET /api/websites/:id/auto-preview` — same route, fixed canonical URL, gained an optional `?page=` query param to preview a specific subpage (defaults to home, preserving prior behavior).

## 4. Rendering Architecture

For `publisherType = "auto"` sites, a request now flows: `subdomainMiddleware` → `handleTenantSiteBySlug`/`ByDomain` → `serveAutoPage(website, req.path, res)` → `buildTenantData(storeId)` (real DB reads, unchanged) → `renderAutoSite(tenantData, settings, canonicalBase, appUrl, req.path)`.

`renderAutoSite` normalizes the path and matches it against six real routes (`/`, `/services/`, `/services/{id-slug}`, `/team/`, `/team/{id-slug}`, `/reviews/`); anything else returns a real HTTP 404 with its own page. Every match calls a dedicated body-renderer (`renderHomeBody`, `renderServicesIndexBody`, `renderServiceDetailBody`, `renderTeamIndexBody`, `renderTeamDetailBody`, `renderReviewsBody`) and wraps it in one shared `renderShell()` (nav, footer, `<head>`/meta/JSON-LD, CSS) so every page reads as one consistent, on-brand site. All of it is still pure template-literal string building — zero framework JS, zero hydration, matching the file's original "sub-1s loads" design goal. The one JS enhancement kept is the homepage's live open/closed status pill (a `fetch` that only ever adds a small badge — never required to read the salon's core info).

`publisherType = "template"` sites are completely untouched — same pre-built CSR bundle, same client-side text-replacement mechanism, same single-route sitemap.

## 5. SEO

Every one of the six real auto-mode pages now independently emits a correct, non-duplicate `<title>`, meta description, canonical URL (pointing at that exact page, not just the homepage), Open Graph, and Twitter tags — generated server-side from real data (service name/price/description for service pages, staff name/bio for team pages, etc.), never templated placeholder text.

The tenant sitemap for an auto-mode site now lists every real page that exists — homepage, `/services/`, one entry per visible service, `/team/`, one entry per visible staff member, `/reviews/` — and nothing else. The old fragment-anchor entries (`/#services`) are gone; those were never independently indexable resources in the first place (a `#fragment` is stripped by the browser before the request reaches the server), so removing them is a pure correctness fix, not a downgrade. `robots.txt` continues to point at that same sitemap.

Fixed along the way: the auto-mode canonical URL was pointing at `${appUrl}/${slug}` (e.g. `https://certxa.com/bellanails`) — a URL with no matching route anywhere in the app — instead of the site's actual address (`https://bellanails.certxa.com`). Every canonical tag, and the sitemap itself, now uses the site's real, resolvable URL.

## 6. GEO / AI Discoverability

For every auto-mode page, an AI crawler that does **not** execute JavaScript can now read, directly from the raw HTML response: the business name, address, phone, hours (as a real `<table>`), every active service with its real price and duration, every active staff member with role/bio, and every public review — plus, on the dedicated `/services/{slug}` and `/team/{slug}` pages, a single specific service or person in isolation with its own URL, title, and JSON-LD, rather than only ever finding that information buried inside one long homepage. This directly answers the example questions in the plan ("What does Bella Nails charge for Gel-X?", "Who works at Bella Nails?") from a single fetch, with no script execution, matching or exceeding what a plain Google crawl would see.

## 7. Security

Three issues flagged in the earlier audit were fixed:

1. **`/api/tenant/:slug/data`** and **`/api/tenant/:slug/status`** previously omitted the `published = true` filter that every other tenant route already enforced — an unpublished/draft site's real address, phone, email, staff bios, and live operational status were publicly queryable before the owner chose to launch. Both now require `published = true`, matching the pattern already used everywhere else.
2. **`/api/tenant/:slug`** used an unrestricted `SELECT *` on both `wb_websites` and `wb_templates`, publicly leaking `customDomainToken` (the very secret meant to prove domain ownership), `stripeCheckoutSessionId`, and the template's server filesystem path and raw build-error text. It now selects only the specific fields a live client actually needs.
3. **`/api/websites/:id/preview`** had no authentication or ownership check at all — anyone who could guess or enumerate a numeric website id could view another store's in-progress, unpublished draft content. It now requires the same `isAuthenticated` + ownership check used by every sibling route in the file. Verified this doesn't break the legitimate flow: both call sites in the website-builder editor are already inside an authenticated, same-origin session.

Also added: `publicLimiter` (60 req/min, already used for `/api/public` and `/api/book`) now also covers `/api/tenant/*`, which previously had no rate limiting despite doing multiple DB reads per request.

## 8. Booking Safety

**Confirmed: `/book/{slug}`, TURN, availability, and appointment creation were not touched, replaced, or duplicated.** No file under `artifacts/booking/`, and no line of `artifacts/api-server/src/routes.ts` (where the TURN assignment/checkout logic and `/api/public/store/:slug/*` transactional API live), was modified. The salon website's only connection to booking is now a plain `<a href="https://certxa.com/book/{slug}">` anchor (with `?serviceId=`/`?staff=` deep-link params the booking app already reads) — the exact same existing booking application, just linked to correctly instead of embedded.

One pre-existing bug was fixed as part of this: the old booking-panel iframe (`buildBookingPanel`) built its `src` as `${appUrl}/${slug}?embed=true` — a URL with **no matching route** in the booking SPA (the real route is `/book/{slug}`) — so that iframe was already broken before this change. It has been removed and replaced with the plain-anchor approach the plan explicitly calls for ("Do NOT embed a second booking application into the service page... the basic link must work without JavaScript"), which also fully satisfies the no-JS requirement the old iframe drawer could never have met.

## 9. Existing Websites

**Zero impact.** All 3 currently-published `wb_websites` rows are `publisher_type = "template"`; none of the `render-salon-page.ts`/`renderAutoSite` changes are reachable by them. The template-mode rendering path (`serveTenantSite`, the CSR bundle serving, the client-side text-replacement mechanism) was not modified in any way. Per the plan, the default `publisherType` for *new* websites was **deliberately left as `"template"`** — the plan frames the default flip (Phase 8) as something to do "after verifying the new auto SSR system works correctly," which calls for live QA/manual verification this session can't perform against production traffic. There is also currently no owner-facing UI path to even create an `"auto"` site (`new.tsx` hardcodes `publisherType: "template"`) — flipping the backend default without that UI existing would have no visible effect anyway. This is flagged as the natural next step, not completed here.

## 10. Testing

No staging environment exists for this app, and the 3 live websites are all `template`-mode, so there was nothing to safely exercise via a real browser hit against `{slug}.certxa.com`. Instead, validation was done two ways, both read-only against the live production database (no writes):

1. **`tsc --noEmit`** on the full `api-server` package. Zero new type errors from any of the 6 changed files. (Two pre-existing errors remain in `storage.ts` and `__tests__/timezone.test.ts` — unrelated files, not touched by this change, present before this session started.)
2. **A direct, read-only Node/tsx script** that calls `buildTenantData()` and `renderAutoSite()` in-process (bypassing HTTP/nginx entirely — no request ever reached the live server) against a real store (storeid 2, "Luxury Nails," 26 real services, 4 real staff, 20 real reviews, 156 real staff-service links) and rendered all seven routes:

   | Route | Status | Verified |
   |---|---|---|
   | `/` | 200 | Real business name/title/canonical/H1; 1 JSON-LD block |
   | `/services/` | 200 | Breadcrumb + business JSON-LD; real service grid |
   | `/services/567-basic-manicure` | 200 | Real service name/price/description; `Service`+`Offer` JSON-LD with real `price: 25, priceCurrency: "USD"` |
   | `/team/` | 200 | Breadcrumb + business JSON-LD; real staff grid |
   | `/team/2-linda-marie` | 200 | Real staff name/bio |
   | `/reviews/` | 200 | Business JSON-LD with real `aggregateRating`, plus visible review list |
   | `/does-not-exist` | **404** | Confirms unknown paths no longer silently re-render the homepage |

   Also confirmed directly: no `images.pexels.com` stock-photo fallback anywhere in the output; no hardcoded `"priceRange"` field; no leftover booking-iframe markup; Book Now links resolve to the real `https://certxa.com/book/jims`; and `buildSitemapXml`/`buildRobotsTxt` produce valid, single-slash, fragment-free XML/text for a representative real-shaped path list.

---

## Explicitly Not Done (by design, per the plan's own scope limits)

- **Phase 8 default flip** — left as `"template"` for new sites; see §9.
- **Phase 9 deep visual customization** for auto-mode — `autoSettings` (brand color, tagline, social links, section show/hide) already gives owners real content/presentation separation without a new visual editor; building a full drag-and-drop block editor for auto-mode was explicitly out of scope ("Do NOT redesign the website editor").
- **The future Certxa Verified Reviews platform** — not touched, per explicit instruction. `/reviews/` renders only reviews already marked public under the *existing* review system, with no change to review eligibility or gating rules.
- **Migrating existing template-mode sites** — none exist to migrate risk-free, and none were touched.

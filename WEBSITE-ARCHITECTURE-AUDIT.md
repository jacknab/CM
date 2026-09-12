# Certxa Salon Website — Architecture & SEO/GEO Audit

**Scope:** Read-only investigation. No code, schema, routes, or config were modified in the course of this audit.
**Date:** 2026-09-12

---

## A. Executive Summary

Certxa runs **three separate, historically-accreted systems** under the `{slug}.certxa.com` / `certxa.com` umbrella, all dispatched by a single Express middleware based on the request's Host header:

1. **The website-builder platform (`wb_websites`)** — the current, actively-developed system. It has **two rendering modes selected per site**:
   - **`publisherType: "template"`** (the default, and what most existing sites use): a pre-built React/Vite single-page app is served byte-for-byte from disk on every request. The salon's real name, address, services, prices, staff, and hours are **not** in the HTML the server sends — they exist only as a JSON blob in an injected `<script>` tag, and are painted into the DOM by client-side JavaScript (a `MutationObserver`/`TreeWalker` text-replacement script) after the bundle boots. **Googlebot's or an LLM crawler's raw HTML fetch of a template-mode salon site returns the template's own placeholder/demo copy, not the salon's actual business information**, unless the crawler executes JavaScript and waits for hydration.
   - **`publisherType: "auto"`**: a genuinely server-rendered page (`render-salon-page.ts`) built from real interpolated business data with template-literal HTML — no client framework, no hydration required. This is the "GlossGenius-style" mode the codebase's own comments describe, and it is the architecture the requested target state (Section M) should generalize.
2. **A legacy "launchsite" system** (`onboarding_submissions` + `subdomains` tables, static PHP-templated builds under `php/templates/`) — still wired into the subdomain-resolution fallback chain, but the template files it expects on disk (`php/templates/{templateId}/index.html`) do not appear to exist in this checkout beyond two stray PHP files, suggesting this path is now vestigial/dead in practice even though the routing code and DB tables remain live.
3. **A third-party salon directory** (`certxa.com/salon/:slug`, `certxa.com/nail-salons/:state/:city`) — a ~51k-page SEO directory of scraped, mostly non-customer salon listings, entirely unrelated to the tenant website system, already flagged as a thin-content risk in a prior GEO audit (see `[geo-audit-2026-09]` memory) and explicitly disclaimed in `llms.txt`.

The **booking application** (`certxa.com/book/{slug}`, part of the `artifacts/booking` React SPA) is a fourth, cleanly separate codebase — no shared components, build tooling, or npm workspace with the website-builder templates. It already lives at its own URL and already has its own dedicated public REST API family (`/api/public/store/:slug/*`). This is good news: **the booking application does not need to be touched to achieve the separation goal.** The problem is entirely on the "public website" side of the line.

**The single biggest fact governing this whole audit:** the target architecture you're asking about (HTML-first, crawlable, JS-optional public website) **already exists in the codebase today**, live, in production, gated behind one boolean column (`wb_websites.publisher_type = 'auto'`). It is simply not the default, and it is missing some of the richer structured data and customization depth that the CSR template mode has. The most direct, lowest-risk path to your stated goal is **not a rewrite** — it's making the auto-mode renderer the default/primary path and investing further in it, rather than building something new alongside three systems that already exist.

---

## B. Current Architecture

```
                              Browser request
                                    │
                    Host: {slug}.certxa.com  or  certxa.com
                                    │
                                    ▼
                    nginx (deployment/nginx/booking.conf)
        ── certxa.com: routes /api,/ws,/media-stream,/uploads,/ → :9200
        ── *.certxa.com (any subdomain): routes everything → :9200
                                    │
                                    ▼
                 Express app (artifacts/api-server, port 9200)
                                    │
                 subdomainMiddleware (middleware/subdomain.ts)
                 resolves Host header, tries in order:
                                    │
      ┌─────────────┬───────────────────────┬────────────────────┬───────────────┐
      ▼             ▼                       ▼                    ▼               ▼
 wb_websites   locations.bookingSlug   legacy launchsite     custom domain    no match
 (published)   (no website published)  onboarding_submissions (websitesTable   → smart
      │             │                  + subdomains            .customDomain)  404 page
      ▼             ▼                       │                    │           (Jaro-Winkler
 template-serve.ts  rewrite URL to      php/templates/{id}/   handleTenantSite  slug-typo
 handleTenantSite   /book/:slug,        index.html (static     ByDomain          suggestions)
 BySlug             next() into         PHP-templated build —       │
      │             booking SPA         appears vestigial:     (same dispatch
      │             (artifacts/         expected template          as slug path)
      │             booking, CSR)       dirs largely absent
      │             │                   in this checkout)
      ▼             ▼
 publisherType?  /book/:slug route
      │          in artifacts/booking/
  ┌───┴────┐     src/App.tsx → PublicBooking.tsx
  ▼        ▼     → theme component (Bloom/Classic/
"template" "auto"  Mobile/Simple) → calls
  │        │       /api/public/store/:slug/*
  ▼        ▼
serveTenantSite  serveAutoPage
(CSR Vite bundle (render-salon-page.ts:
 from templates-  real SSR, template
 storage/, text   literals, real data,
 patched in by    weaker JSON-LD)
 client JS)


                    ── separately, entirely unrelated ──

certxa.com/           PHP marketing site (php/)              certxa.com/salon/:slug
(root domain, no      served via phpMiddleware,               certxa.com/nail-salons/...
 subdomain)           NOT a tenant site                       3rd-party directory
                                                                (salonDirectory.ts)
```

---

## C. Request Lifecycle: `https://{slug}.certxa.com/`

1. **DNS** resolves `{slug}.certxa.com` to the single app server (wildcard DNS record, implied by the nginx config's regex `server_name`).
2. **nginx** (`deployment/nginx/booking.conf` lines 197-227) matches the wildcard `server_name ~^(?<subdomain>.+)\.certxa\.com$` server block and proxies **every** path straight to `127.0.0.1:9200` — nginx does zero tenant-aware routing itself; all subdomain logic lives in the app.
3. **Express** receives the request. `subdomainMiddleware` (`artifacts/api-server/src/middleware/subdomain.ts:270-523`) runs early (mounted at `index.ts:566`, before static file serving, before the PHP middleware, before the salon-directory router). It:
   - Reads `X-Forwarded-Host`/`Host`, splits off the subdomain.
   - Skips reserved subdomains (`www, app, api, manage, certxa, ...`) and `/api/`, `/uploads/`, `/media-stream` paths — those `next()` through to normal app routing.
   - Queries `wb_websites WHERE slug = $1 AND published = true` (line 335-338). **If found, this wins over everything else** — even if the same slug also has a booking-app store — and dispatches to `handleTenantSiteBySlug`.
   - Else queries `locations WHERE booking_slug = $1` (line 352) — if found, account-status-gates it (suspended/canceled shows a static "not accepting bookings" page), then **rewrites the request path** to `/book/{slug}` in-place (line 371) so the booking React SPA's own router picks it up while the browser URL bar still shows the bare subdomain root.
   - Else checks the legacy `subdomains`/`onboarding_submissions` join (line 386-399) for the launchsite system, with several status-gated holding pages (inactive/suspended/pending-payment).
   - Else, for a genuinely custom (non-`certxa.com`) domain, delegates to `handleTenantSiteByDomain`.
   - Else renders a styled 404 with Jaro-Winkler fuzzy slug-typo suggestions (lines 90-268).
4. Assuming the common case — a published `wb_websites` row — **`handleTenantSiteBySlug`** (`template-serve.ts:1342-1392`) runs:
   - Special-cases `/sitemap.xml` and `/robots.txt` directly (bypassing the separate, effectively-unreachable route registrations in `websites.ts`).
   - Checks the linked store's `account_status` for suspension.
   - Branches on `publisherType`.

### If `publisherType === "auto"`:
`serveAutoPage()` → `buildTenantData(storeId)` (real DB reads: `locations`, `business_hours`, `service_categories`, `services`, `staff`, `google_reviews`/`reviews`, `wb_gallery_photos`, all correctly filtered by `store_id`) → `renderSalonPage()` builds one complete HTML string via template literals and sends it with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. **What the browser receives on the initial response is real, final, semantic-ish HTML containing the salon's actual name, address, phone, hours table, service cards with real prices/durations, staff cards, and review snippets — no JavaScript execution required to see any of it.** A JSON-LD `<script type="application/ld+json">` block with `@type` (`NailSalon`/`HairSalon`/`Barber`/`DaySpa`/`MassageTherapist`/`BeautySalon`, chosen by category) is also present.

### If `publisherType === "template"` (the majority path today):
`serveTenantSite()` finds the assigned template's pre-built `dist/index.html` (a Vite React SPA bundle, e.g. from `templates-storage/nail-salon-bloom-.../project/dist/`), reads it fresh off disk on **every single request** (`fs.readFileSync`, no caching), and:
- Server-side, via regex string replacement, swaps in real `<title>`, meta description, canonical URL, OG/Twitter tags, and JSON-LD (`applySeoHeadTags`, using `buildTenantSeo()`) — **the `<head>` metadata is real and server-rendered.**
- Injects an inline `<script>` in `<head>` setting `window.__CERTXA_SLUG__` and (when a store is linked) a full `STORE_DATA` JSON object plus a `fetch()` interceptor that serves it back to the React app instead of the app's own hardcoded demo API call.
- Injects a second script before `</body>` that, **only after the DOM exists (client-side, via `MutationObserver` + `TreeWalker`)**, walks all text nodes and swaps any matching the template's original demo copy for the owner's saved edits.
- Sends `Cache-Control: no-store`.

**What the browser's initial HTTP response body actually contains, for a template-mode site, is the template's own pre-built demo HTML** — e.g. a fictional salon name, placeholder service names/prices, stock photography — with the real business data present only as machine-readable JSON inside a `<script>` tag and as accurate `<head>` meta tags, not as visible/parseable page content. **A crawler or LLM agent that does not execute JavaScript will read the correct title/description/schema.org data but will see the wrong (template demo) business name, services, and prices in the actual rendered content of the page.** This is the direct answer to the question posed in Section 3 of the brief: yes, for the majority of live salon sites today, the initial HTML is effectively `<div id="root">[demo content]</div><script>...</script>` from a content standpoint, even though it is not literally an empty root div — it's a root div pre-filled with the wrong salon's/a fictional salon's content.

---

## D. Current Rendering Model

**Classification: Hybrid, inconsistent across sites, with one path per publisher type plus a vestigial legacy static path.**

| Publisher type | Classification | Real content in initial HTML? |
|---|---|---|
| `template` (default, majority of sites) | **Client-side rendered (CSR) with server-injected `<head>` metadata and post-hydration DOM patching.** Not SSR, not static, not "hydrated SSR" (there is no server-rendered markup of the body — only a runtime string-replace of a pre-built demo bundle). | `<head>` meta/JSON-LD: yes, real. Visible body content (services, staff, hours, name as shown to a human): **no**, shows template demo content until JS runs. |
| `auto` | **True server-side rendering**, template-literal based, no client framework required for content to appear. | Yes — name, address, phone, hours, services (name/price/duration), staff, photos, and review snippets are all present in the raw HTML. |
| Legacy launchsite | Static pre-built HTML per template, served via `res.sendFile` — genuinely static, but the on-disk template directories this path expects appear to be missing in this checkout, and it long predates the current data model (owner content lives in `onboarding_submissions`, not `wb_websites`). | Static HTML if the file exists; a "being set up" holding page otherwise. |
| Booking app (`/book/:slug`) | Pure CSR React SPA. `artifacts/booking/src/entry-server.tsx` is a dead/orphaned SSR stub (`return { html: "" }`, not referenced by `vite.config.ts` or anywhere else) — evidence that SSR for the booking app was attempted or scaffolded and abandoned. This is expected/acceptable since the booking app is a transactional tool, not a content page that needs to rank. | No — booking flow is entirely JS-dependent, as is appropriate for an interactive checkout-style flow. |

**Crawler checklist — what Google/Bing/AI crawlers can obtain without executing JavaScript, per mode:**

| Data point | `auto` mode | `template` mode |
|---|---|---|
| Salon name | ✅ real | ❌ demo/template name (✅ only in `<title>`/meta/JSON-LD) |
| Description | ✅ real | ✅ (meta tag only, server-injected) |
| Address / city / state | ✅ real | ❌ visible text is template's; ✅ in JSON-LD |
| Phone | ✅ real | ❌ visible text is template's; ✅ in JSON-LD (`telephone`) |
| Hours | ✅ real (HTML `<table>`) | ❌ (client-rendered only) |
| Services (names) | ✅ real | ❌ (client-rendered only) |
| Service prices | ✅ real | ❌ (client-rendered only; and template-mode's server-injected JSON-LD `Offer` array, when present, *does* carry real prices — see Section J) |
| Service durations | ✅ real | ❌ (client-rendered only) |
| Staff | ✅ real | ❌ (client-rendered only) |
| Photos | ✅ real (`<img src>`) | ❌ (client-rendered only) |
| Booking links | ✅ (opens an inline JS drawer, not a crawlable href — see Section G) | ❌ (client-rendered only) |
| Reviews | ✅ real (4★+ only, real customer/rating) | ❌ (client-rendered only) |

---

## E. Website Builder Architecture

**Data model.** A site is one row in `wb_websites` (migration `0143_website_builder_tables.sql`, `publisher_type` added later in `0073_auto_website_publisher.sql`): `slug`, `storeid` (stored as **text**, not FK-enforced), `templateId`, `content` (jsonb, `z.any()` — **zero server-side shape validation**), `published` (bool), `publisherType` (`'template'|'auto'`), `autoSettings` (jsonb), plus custom-domain/SSL fields. There is a companion `wb_templates` table (`id`, `category`, `filesPath` pointing at a built Vite project on disk, `buildStatus`) and `wb_page_views` for analytics.

**No draft/published content split.** `PUT /websites/:id` (`routes/websites.ts:345-428`) writes straight into the live `content` column. `published` is purely a visibility gate checked by the public-facing routes — it is not a "promote draft to live" mechanism, and there is no content snapshot/versioning. **Every click of Save on an already-published site goes live immediately, with no separate confirmation step.** New template-based sites are created with `published: true` from the moment a template is chosen (`routes/websites.ts:314`), before any customization has happened — meaning a newly-signed-up salon's subdomain is technically live and crawlable showing 100% template demo content the instant they pick a template.

**Customization flow.** Owner picks a template (gallery hard-locked to `category: "nail_salon"` in the current UI), which creates the `wb_websites` row. The editor (`artifacts/website-builder/src/pages/websites/edit.tsx`, 2261 lines) is a WYSIWYG iframe running the compiled template with an injected bridge script (the same script visible in `template-serve.ts`'s `buildEditorScript`), communicating via `postMessage`: text edits (`certxa-field-update`), block reorder/delete (`certxa-block-ops`), image swaps (`certxa-image-click`/`certxa-image-replaced`), color theme (`certxa-apply-colors`), and inserting new pre-built sections from a block library (`certxa-insert-block`). Content extraction for the initial "what text exists to edit" scan is done by **launching headless Chromium against the built template and scraping post-hydration text nodes** (`content-extractor.ts`) — a fragile, string-matching-based content model with no structural understanding (it doesn't know "this text is the business name" vs. "this text is a random `<h2>`"), and no guarantee it will still match if the underlying template bundle is rebuilt with different whitespace/wording.

**Auto-mode customization is comparatively shallow today.** `autoSettings` is a flat settings blob (brand color, tagline, section show/hide flags, social links) with no visual block/text editor comparable to the template flow — it is currently a secondary, less-customizable mode rather than the default.

**Can the current data model support an HTML-first public website without a full rebuild? Yes, largely.** The `auto` mode is a working proof that `wb_websites` + `buildTenantData()`'s already-normalized DB queries are sufficient to drive real server-rendered HTML — `published`, `customDomain`/SSL provisioning, and analytics are all publisher-type-agnostic and already work identically for both modes. The work required is not a schema migration; it's (a) closing the customization-depth gap between `auto` and `template` modes (or accepting a narrower "for now, less visually customizable but crawlable" trade-off), and (b) a plan for migrating/re-pointing existing `template`-mode sites.

---

## F. Service Data Flow

**Source of truth:** `services` and `service_categories` tables, scoped by `store_id`, filtered to `is_active = true` and `hidden_from_public = false` (confirmed correctly applied in `tenant-data.ts`'s `buildTenantData()` — no leak of paused/hidden services found).

- **Auto mode:** services are queried server-side inside `buildTenantData()` on every request and interpolated directly into the returned HTML string (`render-salon-page.ts`) as real `<div class="service-name">`/price/duration markup, plus (separately) into that page's own JSON-LD (no `Offer` objects there — see Section J).
- **Template mode:** the same underlying query (via `GET /tenant/:slug/data`, `routes/websites.ts:845-963`) is fetched, but by the **client-side** JS bridge, not read by the server into the page body. The server does inject the richer `buildTenantSeo()` JSON-LD (which *does* include an `Offer`/`Service` array with real prices for up to 24 services) into `<head>` — meaning template-mode sites have real, crawlable service+price data available to structured-data parsers even though a plain-text reader of the page body would not see it.
- **No unique URL per service, in either mode.** Both `auto` and `template` sitemaps only ever contain the site's root URL (see Section H) — there is no `/services/gel-manicure`-style page. A crawler cannot land on, snippet, or rank a specific service independently of the whole homepage.

**Owner edits a service (add/remove/price/duration/hide/category/image):** the change lands in the normal `services`/`service_categories` tables via the existing booking-app catalog UI (`CatalogServices.tsx` etc. — unrelated to the website builder). Because both rendering modes read live from these tables at request time (no build step, no cache — see Section K), **the public website reflects the change on the very next page load**, with no publish/rebuild action needed on the website side. This is a genuine strength of the current architecture worth preserving in any redesign.

---

## G. Booking Data Flow

The booking application (`artifacts/booking`) is architecturally clean and largely already separated from the website-rendering system:

- **`/book/:slug`** is a route inside the booking SPA's own React Router (`App.tsx:454`), resolved to `PublicBooking.tsx`, which loads the store by slug via `GET /api/public/store/:slug`, then renders one of four monolithic "theme" components (`BloomTheme`/`ClassicTheme`/`MobileTheme`/`SimpleTheme`, selected by the store's `bookingTheme` setting) — each theme is a single large file (700–2000 lines) managing its own internal step state (service → date/time → staff → add-ons/cart → customer info → confirmation), not a router of sub-pages.
- **TURN/resource-assignment logic** (fairness rotation, checkout-time queue evaluation) lives entirely server-side in `artifacts/api-server/src/routes.ts` (`assignAppointmentViaTurn`, `handleTurnCheckout`) and `lib/availabilityQueue.ts` — it is booking-operations logic, unrelated to and untouched by anything in the website-rendering path.
- **Public booking-operations API** (`/api/public/store/:slug/services|staff|reviews|availability|available-days|book|waitlist`, all in `routes.ts`) is the single shared surface both the booking SPA **and** at least one salon template's own inline booking widget (`templates-storage/nail-salon-bloom/.../BookingPanel.tsx`) call directly over HTTP. **There is no shared code between them** — the template's `BookingPanel.tsx` independently reimplements its own date-grid math, types, and `fetch()` calls rather than using the booking SPA's React Query client — but there is also **no separation boundary at the API layer**: both consumers hit the exact same live transactional endpoints with no gateway/BFF in between.
- **An embeddable booking widget already exists** (`/widget?slug=X`, `BookingWidgetPage.tsx` → `BookingWidget.tsx`, explicitly documented for iframe embedding) but **no current template actually uses it**. Instead: the flagship `nail-salon-bloom` template built its own duplicate inline booking mini-app from scratch, and older templates simply scroll to a static contact section with no real booking integration at all (`onClick={() => scrollTo('contact')}`). This is inconsistent and is itself a source of technical debt — three different "how does Book Now work" implementations exist across the template library today.
- **Read-only marketing/display data** (business info, hours, services list *for display*, staff, reviews) is a separate concern from booking operations and is already served through a different mechanism (`tenant-data.ts` / `/tenant/:slug/data`, injected server-side or fetched read-only) — this is the correct conceptual split to build on.

**Conclusion:** the booking engine itself needs no changes. What needs to be decided is how a future HTML-first website's "Book Now" buttons connect to it — the existing `/widget` iframe route is the natural, already-built mechanism, and standardizing every template/auto-mode site on it (instead of each template reinventing booking UI) would both reduce debt and cleanly enforce the public-website / booking-application boundary this audit is evaluating.

---

## H. SEO Findings

**Strengths:**
- `auto`-mode pages ship real, crawlable content, a real canonical tag, real OG/Twitter tags, and CDN-cacheable headers (`s-maxage=60, stale-while-revalidate=300`).
- Canonical URL handling is deliberate and correct: `template-serve.ts` actively strips/replaces any leftover template-demo canonical tag with the real tenant URL on every response (`serveDistFile`, lines ~1131-1144), preventing a whole class of duplicate-canonical bugs.
- The main `certxa.com` PHP marketing site has a mature JSON-LD graph (`Organization`, `WebSite`+`SearchAction`, `SoftwareApplication`+`Offer`, page-level `BreadcrumbList`) in `php/includes/header.php`.
- Service/price/duration data changes are reflected live with no publish/rebuild lag (Section F).

**Weaknesses:**
1. **Template-mode sites' visible body content is not crawlable without JS execution** (Section D) — this is the core finding driving the entire proposed re-architecture, and it affects the *majority* of live salon sites today, not an edge case.
2. **Tenant sitemaps are effectively single-URL.** The richer sitemap logic that adds anchor-fragment entries (`handleTenantSitemapBySlug`/`buildSitemapXml` with `extraPaths`, registered as `/tenant/:slug/sitemap.xml` in `routes/websites.ts:1062`) is **unreachable for real subdomain traffic** — `subdomainMiddleware` intercepts every path on `{slug}.certxa.com` before Express routing would ever match that route, and the actual handler that answers `/sitemap.xml` requests (`handleTenantSiteBySlug`'s own special-case at `template-serve.ts:1357`) calls `buildSitemapXml(website)` with no extra paths. Net effect: **every live tenant sitemap.xml lists exactly one URL** (the homepage), even where the codebase clearly intends to also list `/#services`, `/#team`, etc.
3. **Even where present by design, the anchor-fragment "pages" in sitemaps are not real indexable resources.** A URL fragment (`#services`) is stripped by browsers before the request reaches the server; Google does not treat it as a separate crawlable document. There is no genuine per-service, per-staff, or per-review URL anywhere in the current architecture.
4. **No sitemap of tenant sites exists at the certxa.com level.** The global `php/sitemap.php` sitemap-index only references marketing pages, the blog, and the third-party salon directory — a search engine has no single feed of "here are all N live Certxa customer websites."
5. **Legacy directory system creates URL/entity ambiguity.** `certxa.com/salon/:slug` (a mostly non-customer, scraped directory listing) and `{slug}.certxa.com` (an actual paying customer's real site) can use similar-looking slugs for entirely different, unrelated entities — already flagged as a risk in the prior GEO audit and disclaimed in `llms.txt`, but worth re-flagging here since it interacts directly with the URL-architecture question in Section 13/M.
6. **Programmatic local-SEO landing pages misuse `LocalBusiness` schema.** Static pages in `artifacts/booking/public/` (`phoenix-az-nail-salons.html`, `houston-tx-nail-salons.html`, `dallas-tx-booking.html`, `tempe-az-nail-salons.html`) mark up **Certxa itself** — a SaaS company with no physical storefront in those cities — as a `"@type": "LocalBusiness"` with a city-only address. This is schema misuse (LocalBusiness implies a real, physical, locatable premises) and inconsistent with the correct `SoftwareApplication` typing used elsewhere (`salons.html`, `php/includes/header.php`).

---

## I. GEO / AI Findings

Running through the specific questions posed:

| Question an AI crawler should be able to answer from HTML alone | `auto` mode | `template` mode |
|---|---|---|
| What is this business? | ✅ | ❌ (gets the template's fictional demo business) |
| Where is it located? | ✅ | ❌ |
| What services does it provide? | ✅ | ❌ |
| What do those services cost? | ✅ (body); JSON-LD has no `Offer` (Section J) | ❌ body; ✅ JSON-LD `Offer` (real prices) |
| How long do services take? | ✅ | ❌ |
| How can someone book? | Partial — booking opens a JS slide-in drawer/panel, not a distinct crawlable URL or a plain `<a href>` a non-JS agent could describe as "the booking link" | ❌ |
| What makes this salon different? | Only as much as `autoSettings.tagline` — thin | ❌ (template demo copy) |
| What do customers say? | ✅ real reviews rendered | ❌ |
| Is the information current? | Yes — live DB read on every request | Metadata: yes. Visible content: no (relies on JS) |

**Biggest single lever to improve AI/GEO discoverability:** make the SSR (`auto`) path the default rendering path for all sites, not a secondary mode — this single change would flip nearly every row above from ❌ to ✅ for the majority of currently-template-mode sites, with zero backend/schema work (the data layer already supports it).

**Second lever:** give services and staff their own real URLs (`/services/{slug}`, `/team/{slug}`) so AI answer engines and Google can cite/rank a specific service page rather than only ever surfacing the homepage — directly enables the long-tail "best gel manicure near me" class of query this platform should want to win.

**Third lever:** the future first-party reviews system (Section 12 of the brief) — see the dedicated note below; the *existing* review-handling code is currently designed to do the opposite of what's being asked for.

---

## J. Structured Data Findings

**What exists today, by location:**

| Location | JSON-LD `@type`(s) | Notes |
|---|---|---|
| `render-salon-page.ts` (`auto` mode, inline `buildJsonLd()`) | Category-mapped business type (`NailSalon`/`HairSalon`/`Barber`/`DaySpa`/`MassageTherapist`/`BeautySalon`), nested `PostalAddress`, `City` (`areaServed`), `OpeningHoursSpecification`, `GeoCoordinates` | No `AggregateRating`, no `Offer`/`Service`, no `BreadcrumbList`. `priceRange` is **hardcoded to `"$"`** regardless of actual prices — a minor fabricated field despite real price data being available. |
| `tenant-seo.ts` (`buildTenantSeo()`, wired **only** into `template`-mode paths — `serveTenantSite`, preview routes — never called by `serveAutoPage`) | Everything above, **plus** `@id`, `AggregateRating` (real `ratingValue`/`reviewCount`, only added when reviews exist — no fabrication on zero reviews), `makesOffer` → `Offer`/`Service` array with up to 24 real services and real prices | This is the **richer** of the two builders, yet it currently only benefits the rendering mode whose *visible body content* is not crawlable. This is a clear, fixable inversion: swap which mode gets which builder, or (better) unify on one builder used by both. |
| `php/includes/header.php` (main marketing site) | `Organization`, `WebSite`+`SearchAction`, `Person` (founder), `SoftwareApplication`+`AggregateOffer`+per-plan `Offer`, page-level `BreadcrumbList` | Solid, appropriate for a SaaS marketing site. Not a template for tenant sites to imitate directly (different entity type). |
| `artifacts/booking/public/*-nail-salons.html` (programmatic local landing pages) | `LocalBusiness` (misapplied — see Section H) and, inconsistently, `SoftwareApplication` on at least one sibling page | Needs reconciling to one correct type. |
| Raw `templates-storage/*/project/index.html` files (checked 3 representative templates) | **None** — zero JSON-LD or schema.org markup authored in the templates themselves | Confirms all structured data for template-mode sites comes exclusively from the server-side injection layer, not the template source — good separation of concerns, just currently under-populated relative to what's possible. |

**Recommendation on which schema types are actually supported by the content/architecture (not "add everything"):**
- `LocalBusiness` subtype (category-specific, e.g. `NailSalon`) — supported, appropriate, already correctly implemented in principle.
- `PostalAddress`, `GeoCoordinates`, `OpeningHoursSpecification` — supported by real data, already implemented.
- `Offer`/`Service` for real services — supported (real prices/durations exist), implemented only in the builder that's wired to the wrong rendering mode today.
- `AggregateRating` — supported **only** where real review counts exist; the existing code already correctly omits it when there are zero reviews (no fabrication) — good practice to keep.
- `Review` (individual review markup) — **not currently implemented anywhere**; would need to be added carefully once the first-party review system (Section below) exists, and only for reviews that are genuinely public (see the isPublic-gating problem below) to avoid a Google structured-data guideline violation (marking up reviews that aren't actually visible/verifiable on the page is exactly the kind of thing Google's guidelines prohibit).
- `BreadcrumbList` — **not currently useful** for tenant sites, since there is only one real URL (the homepage) per site; would become meaningful once/if real per-service or per-page URLs exist (Section I, second lever).
- `WebSite`/`WebPage` — not currently emitted for tenant sites; low priority, low risk to add.

---

## K. Performance Findings

- **Template-mode HTML is never cached — anywhere.** `Cache-Control: no-store` on every response (`template-serve.ts:1181`), the on-disk template `index.html` is `fs.readFileSync` fresh on every request, and the same DB reads used by `/tenant/:slug/data` (business, hours, services, staff, reviews) are re-run for the injected `STORE_DATA` blob on every request. There is no Redis layer for this path, despite Redis already being used extensively elsewhere in the codebase (availability slots, dashboard data) — this is a specific, fixable gap, not a fundamental limitation.
- **Auto-mode is the one path already built for scale**: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` is CDN/shared-cache-friendly, assuming a reverse proxy in front honors `s-maxage` (worth confirming — the current nginx config does not appear to run a caching layer itself, so this header currently has no CDN to act on unless one is added).
- **Uploaded media (photos)** are offloaded to Cloudflare R2 and served via redirect, with only a 60-second in-process cache of the *lookup*, not the asset bytes — reasonable, low-risk as-is.
- **Static template JS/CSS bundle files** (not the HTML shell) do get `Cache-Control: public, max-age=3600` — the template's compiled bundle itself is cacheable, only the HTML entry point and the data blob are not.
- **JS dependency for content = a mobile performance and Core Web Vitals problem, not just an SEO one.** A template-mode page's Largest Contentful Paint is gated on downloading and executing a full React bundle before the *real* business name/services are visible to a human, which is strictly worse for mobile LCP/INP than the auto-mode path's immediate server-rendered content.

---

## L. Security / Tenant-Isolation Findings

Overall, **core DB query scoping is sound** — every service/staff/hours/review query found in `tenant-data.ts` correctly filters by `store_id`, with no client-controllable parameter able to pivot across tenants. The specific problems found are narrower and fixable:

1. **`GET /tenant/:slug/data` and `GET /tenant/:slug/status` do not gate on `published = true`** (`routes/websites.ts:845-963`, `:967-1050`), unlike every other public tenant route. This means an **unpublished/draft** website's real business address, phone, email, staff bios, service list/prices, and live operational status (open/closed, staff working, upcoming appointment count) are all exposed to anyone who can guess or enumerate the slug — before the owner has chosen to launch. This is the clearest concrete tenant-isolation/privacy finding in this audit.
2. **`GET /tenant/:slug` leaks internal fields via `SELECT *`** (`routes/websites.ts:1254-1281`): `customDomainToken` (the very secret meant to prove domain ownership — handing it out publicly defeats its purpose), `stripeCheckoutSessionId`, and `template.filesPath`/`template.buildError` (server filesystem paths and raw build-error text) are all returned verbatim in a public JSON response to anyone who knows a published slug.
3. **`/websites/:id/preview` has no authentication or ownership check** (`routes/websites.ts:515-516`) — anyone who can guess/enumerate a numeric `websiteId` can view (though not edit/persist changes to) another store's in-progress, unpublished draft content.
4. **No confirmed rate-limiting specifically on the `/tenant/:slug/*` router** — the app does have global rate limiters (`authLimiter`, `publicLimiter`, etc.) but none was found wired specifically onto this router, and `/tenant/:slug/data` in particular does multiple DB round-trips per hit, making it a plausible scraping/DoS target if left unthrottled.
5. **`wb_websites.storeid` is stored as `text`, not FK-enforced** — not an active exploit path found, but a schema-hygiene gap that removes a layer of DB-level protection against a malformed/mismatched store reference ever being written.
6. **Positive finding:** the analytics beacon (`POST /tenant/:slug/pageview`) correctly checks `published`, hashes IPs with SHA-256, and stores no raw PII — a good pattern the fixes above should match.

---

## Note on Section 12: Future Certxa Reviews Architecture

This deserves its own callout because the audit found something directly load-bearing: **a first-party review system already exists in the codebase, and its current design is the opposite of what an unbiased public review system requires.**

- `shared/schema.ts` already has a `reviews` table (line 1615) tied to `storeId`, `customerId`, `appointmentId`, `staffId`, with `isPublic` (bool) and `isFeatured` (bool) flags.
- `artifacts/api-server/src/routes/reviewGating.ts` implements a token-based, post-appointment review-invitation flow (`/review/:token`) that is **explicitly a rating-gate**: a customer who rates the visit "Great" or "Just OK" is redirected straight out to the salon's real Google review page (no written review ever touches Certxa's own `reviews` table for that response); a customer who rates it "Bad" stays on Certxa, and their review is inserted with **`isPublic: !isBad` → always `false`** (`reviewGating.ts:148`, with the code's own comment: *"Bad reviews never auto-publish to the salon's own public testimonial widget — that's the whole point of the gate."*). The comment also notes owners can **manually flip `isPublic` later** via an existing `/api/reviews/:id` endpoint — meaning selective, owner-controlled publication of only positive/favorable content is not a hypothetical risk to design against, it is how the *current* system already works by default.
- This pattern (funnel happy customers to Google, keep unhappy ones private) is common industry practice and is not itself illegal, but it is **structurally incompatible** with the stated goal in the brief: *"Salon owners should not be able to selectively publish only positive reviews."* Any future first-party, publicly-crawlable review system (`{slug}.certxa.com/reviews/`) must either (a) be built on an entirely separate, non-owner-gated review table/flow with reviews public-by-default and immutable once submitted, or (b) very deliberately decide that the existing `reviews` table/gating flow is for *Certxa-internal, private feedback* only and is never the source for the new public-facing review surface.
- **Architectural placement recommendation:** the new public review surface belongs alongside the `auto`-mode SSR renderer (`render-salon-page.ts` already has a reviews section reading from `tenant-data.ts`, which already reads both `google_reviews` and the internal `reviews` table) — extending `buildTenantData()` to also pull from a new, ungated first-party reviews table, and adding a real routed subpage (not a same-page anchor, per the Section I "second lever" recommendation) is the natural extension point. It should **not** reuse the existing `isPublic`-gated `reviews` table without first resolving the gating-policy conflict above.

---

## M. Proposed Target Architecture

```
                              CERTXA
                                │
                ┌───────────────┴────────────────┐
                ▼                                 ▼
    {slug}.certxa.com                  certxa.com/book/{slug}
    Public Salon Website                  Booking Application
   (unchanged: wb_websites row,        (unchanged: artifacts/booking
    published flag, custom domain,      React SPA, TURN system,
    SSL — all already publisher-        /api/public/store/:slug/*,
    type-agnostic)                      payment/deposit flows)
                │                                 │
                ▼                                 │
   Default to publisherType = "auto"              │
   (render-salon-page.ts made the                 │
    primary path; template/CSR mode               │
    kept as an option for owners who               │
    want deeper visual customization,              │
    clearly labeled as "less                       │
    search-friendly")                              │
                │                                  │
                ▼                                  │
   Real per-page URLs added:                       │
   /  /services/{slug}  /team/{slug}                │
   /reviews/  (new, first-party,                    │
   ungated public review table)                     │
                │                                  │
                └──────────── "Book Now" ───────────┘
                   → standardize on the existing
                     /widget?slug= iframe route
                     instead of each template
                     reinventing booking UI
```

This is not a new system — it is (a) a default-flip plus depth investment in `auto` mode, (b) real subpages instead of anchor fragments, (c) a corrected review data source, and (d) standardizing the existing `/widget` embed as the one blessed connector between website and booking app. The booking application requires no changes.

---

## N. Migration Strategy

A phased approach that never breaks a live slug, booking URL, or the TURN/booking engine:

1. **Nothing about slugs, custom domains, or `/book/:slug` changes.** The subdomain-resolution order in `middleware/subdomain.ts` and the booking app's own routes are untouched throughout.
2. **Fix the isolation/leak bugs first** (Section L items 1-3) — these are small, surgical patches (add a `published = true` filter; stop `SELECT *`; add an ownership check to the preview route) independent of any rendering-architecture decision, and should ship regardless of what else happens.
3. **Enrich `auto` mode to parity with `template` mode's customization depth** *before* changing any default — brand color/tagline/section toggles already exist; the gap is closer to true drag-and-drop block editing. This can be built and tested against `publisherType = "auto"` on a small cohort of new signups without touching a single existing live site.
4. **Add real subpages to the `auto` renderer** (`/services/{slug}`, `/team/{slug}`, `/reviews/`) — additive to `render-salon-page.ts`/`template-serve.ts`'s routing, no schema change required (the data already exists per Section F).
5. **Build the first-party review system on a fresh, ungated table**, independent of the existing owner-gated `reviews` table (Section 12 note), wired into `buildTenantData()`.
6. **Change the default for *new* signups only** from `template` to `auto`, once steps 3-5 are live and validated. Existing `template`-mode sites are entirely unaffected — they keep working exactly as today.
7. **Offer existing `template`-mode owners an opt-in migration path** to `auto` mode (a one-way, clearly-communicated switch per site, since `wb_websites.publisher_type` is already a simple column flip) — never a forced migration, since some owners may have made bespoke visual customizations the `auto` renderer can't yet reproduce.
8. **Only after adoption data justifies it**, consider deprecating the CSR `template` path and its Puppeteer-based `content-extractor.ts` scraping mechanism. This is a "years, not months" step and is explicitly out of scope for now.
9. **Separately and in parallel** (does not block anything above): fix the schema-misuse `LocalBusiness` pages (Section H item 6), reconcile the sitemap dead-code path so real `extraPaths` actually reach live subdomain sitemap responses, and decide the disposition of the legacy launchsite tables/routes (they appear vestigial — confirm in production, not just this checkout, before removing anything).

Nothing above touches: TURN/resource logic, payment/deposit flows, the booking SPA's routes or components, calendar, POS, payroll, or any table outside `wb_websites`/a new reviews table.

---

## O. Files That Would Need Modification

| File | Why |
|---|---|
| `artifacts/api-server/src/routes/websites.ts` (`/tenant/:slug/data`, `/tenant/:slug/status`, `/tenant/:slug` handlers) | Add `published = true` filter; stop leaking internal fields via `SELECT *`; add ownership check to `/websites/:id/preview`. |
| `artifacts/api-server/src/lib/render-salon-page.ts` | Add real subpages (`/services/{slug}`, `/team/{slug}`, `/reviews/`); wire in `buildTenantSeo()`'s richer JSON-LD (`AggregateRating`, `Offer`) instead of/alongside its own weaker inline `buildJsonLd()`; remove the hardcoded `priceRange: "$"` and generic stock-photo fallback for service cards presented as if specific to the salon. |
| `artifacts/api-server/src/lib/tenant-seo.ts` | Confirm/redirect its richer JSON-LD builder to also serve `auto`-mode responses, not only `template`-mode. |
| `artifacts/api-server/src/lib/tenant-data.ts` | Extend to source review data from the future ungated first-party reviews table once built. |
| `artifacts/api-server/src/lib/template-serve.ts` | Fix the sitemap dead-code path so real per-section/per-template `extraPaths` actually reach `handleTenantSiteBySlug`'s/`handleTenantSiteByDomain`'s own sitemap responses; add real subpage routing for `auto` mode alongside `serveAutoPage`. |
| `artifacts/website-builder/src/pages/websites/edit.tsx`, `new.tsx` | Support choosing/switching `publisherType`, and build out `auto`-mode's editing UI toward parity with template-mode. |
| `lib/db/src/schema/websites.ts` | If pursuing item L5, tighten `storeid` to a proper integer FK; no other schema change is required for the rendering-mode work itself. |
| New: a first-party reviews table + routes (e.g. `shared/schema.ts` addition, a new `routes/publicReviews.ts`) | The Section 12 first-party review system, deliberately separate from the existing owner-gated `reviews` table. |
| `artifacts/booking/public/phoenix-az-nail-salons.html` and siblings | Fix `LocalBusiness` → `SoftwareApplication` schema type. |

## P. Files That MUST NOT Be Modified

- `artifacts/api-server/src/routes.ts` — TURN/resource-assignment logic (`assignAppointmentViaTurn`, `handleTurnCheckout`), booking creation, and the entire `/api/public/store/:slug/*` transactional API. This is the booking engine; nothing in this audit's recommendations touches it.
- `artifacts/booking/src/**` — the booking SPA (all four themes, `PublicBooking.tsx`, cart/add-on/payment logic, TURN offline sync engine `lib/turn-claims-db.ts`/`lib/turn-offline.ts`/`lib/enterprise-sync-engine.ts`, `lib/sync-engine.ts`, `lib/action-queue-db.ts`). None of it needs to change to achieve the website/booking split — it already stands alone.
- `artifacts/api-server/src/middleware/subdomain.ts`'s dispatch **order and fallback chain** — slugs, custom domains, and existing booking-store resolution must keep working exactly as today; only the *content* of what `handleTenantSiteBySlug` renders for `auto`-mode sites should change, not the routing logic that gets requests there.
- Payment/Stripe Connect logic, payroll, POS, calendar/availability core, and any other system outside the `wb_websites` website-builder domain — out of scope entirely and untouched by this audit's findings.
- The legacy launchsite tables/routes (`onboarding_submissions`, `subdomains`, `middleware/subdomain.ts`'s launchsite branch) — should not be deleted based on this audit alone; their real-world usage in production must be confirmed first (this checkout's missing `php/templates/*` directories are suggestive but not conclusive proof the path is fully dead).

## Q. Recommended Implementation Phases

1. **Phase 0 (immediate, low-risk, ships regardless of any other decision):** fix the three tenant-isolation/leak findings in Section L (missing `published` filters, `SELECT *` leak, unauthenticated preview route).
2. **Phase 1:** fix the sitemap dead-code path and the `LocalBusiness` schema misuse on the static local-SEO pages — both are small, isolated corrections with immediate SEO/GEO benefit and zero architectural risk.
3. **Phase 2:** invest in `auto`-mode customization depth (visual editing parity) and add real subpages (`/services/{slug}`, `/team/{slug}`), without changing any default — validate on new opt-in signups only.
4. **Phase 3:** design and build the first-party review system on a fresh table, independent of the existing owner-gated `reviews`/`reviewGating.ts` flow; add `/reviews/` as a real subpage once ready.
5. **Phase 4:** flip the default for new signups from `template` to `auto`; offer existing owners an opt-in, one-way migration.
6. **Phase 5 (long-horizon, data-driven):** evaluate deprecating the CSR `template` path and its Puppeteer-based content scraper once adoption/migration data supports it; separately, confirm and resolve the legacy launchsite system's real-world status.

---

*This audit is investigation-only. No files, schemas, routes, or configuration were changed. All findings above are traceable to the specific files and line numbers cited inline.*

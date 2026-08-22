# Certxa Google Indexing & Technical SEO Audit

**Audit date:** 2026-08-18  
**Scope:** Read-only inspection of the Certxa repository plus live HTTP validation of `https://certxa.com`.  
**Constraint:** No code, configuration, database, package, or production change was made.

## Executive Summary

Certxa is not a single Next.js application. The public domain is a hybrid PHP/Express deployment: PHP serves the main marketing site, while the Node/Express API server mounts a server-rendered salon directory before the PHP proxy. The directory implementation is materially more crawlable than a client-only SPA: state, city, and individual salon pages emit complete HTML, titles, canonicals, headings, links, and JSON-LD.

The most important findings are:

1. **The live root sitemap is valid and correctly is a sitemap index.** It returns HTTP 200 and `application/xml`, and references the marketing, blog, and salon sitemaps.
2. **The salon sitemap is split correctly at 50,000 URLs.** Live validation found 50,000 URLs in `sitemap-1.xml` and 1,499 in `sitemap-2.xml`, approximately 51,499 salon URLs, matching the local dataset.
3. **The directory is not included in the root `sitemap-pages.xml`; it is included through the separate `/salon/sitemap.xml` child index.** This is valid, but it creates two public sitemap systems and requires Search Console to process the child index successfully.
4. **The blog sitemap is not XML-valid as served.** The live response contains a leading blank line before the XML declaration, producing `XML or text declaration not at start of entity` in a strict parser.
5. **The production `/nails-salons/` URL is a trailing-slash variant that returns 200 and canonicals to the slashless URL.** That is a consolidatable duplicate, but there is no demonstrated redirect from slash to slashless.
6. **The national directory page is primarily an interactive location finder and has no H1 in the live HTML.** State and city pages have useful static links; the national page does not expose the 51,499 individual salon links in normal HTML.
7. **Individual pages are server-rendered and technically indexable, but most records are thin directory profiles.** The implementation uses placeholder service and hours data for unclaimed/non-matched salons, which creates a material content-trust and scaled-content risk.
8. **The sitemap is generated from a bundled JSON snapshot, not the database.** New, deleted, inactive, or corrected records do not automatically synchronize unless `public/salon-data.json` is regenerated and deployed.
9. **Salon pages perform a database lookup on first request per slug.** A failure is silently converted into placeholder data, and the unbounded in-memory record/index caches are process-local.
10. **The live robots policy is permissive for public URLs and only declares the root sitemap.** The checked-in [`php/robots.txt`](../php/robots.txt:18) is materially different: it contains a global query-string block and several scraper-specific directory blocks, but those rules were not present in the live response. This source/production drift is itself a deployment risk.

Overall, the immediate visibility problem is **a combination of technical/indexing risk and low-value content quality**, compounded by limited authority. The evidence does not show a universal crawl-blocking failure on the salon directory.

## Critical Problems

### C1 — Blog sitemap is malformed in production

- **Evidence:** `GET https://certxa.com/blog/sitemap.xml` returned HTTP 200 and `application/xml; charset=utf-8`, but strict XML parsing failed with `XML or text declaration not at start of entity: line 2, column 0`.
- **Code:** [`php/blog/sitemap.xml.php`](../php/blog/sitemap.xml.php:26) declares XML output; the live body has a leading newline before the declaration.
- **Impact:** Google may reject or partially process that child sitemap. This does not directly invalidate the root sitemap index, but it can suppress blog URLs.
- **Priority:** High.

### C2 — Directory URL inventory is not database-driven

- **Evidence:** [`salonDirectory.ts`](../artifacts/api-server/src/routes/salonDirectory.ts:13) documents a ~51k JSON dataset; [`loadSalonData()`](../artifacts/api-server/src/routes/salonDirectory.ts:91) reads `public/salon-data.json` once and caches it for the process lifetime. The sitemap maps that list directly at [`router.get("/salon/sitemap.xml")`](../artifacts/api-server/src/routes/salonDirectory.ts:1690).
- **Impact:** Newly created salons do not automatically enter the sitemap; removed, inactive, duplicate, or corrected records can remain indexable and listed. This creates stale URLs and weakens sitemap trust.
- **Priority:** Critical for a directory whose core SEO asset is the database.

### C3 — Most salon profiles can be thin or misleading

- **Evidence:** The local dataset has 51,499 unique slugs, 1,407 records without city/state, 3,865 without phone, and 23,219 without website. For non-live matches, the page injects generic [`PLACEHOLDER_SERVICES`](../artifacts/api-server/src/routes/salonDirectory.ts:146) and [`PLACEHOLDER_HOURS`](../artifacts/api-server/src/routes/salonDirectory.ts:159). The live sample page displays generic services/hours while the record is not claimed.
- **Impact:** A large proportion of indexed pages may offer little original value beyond an imported name/address/rating and generic copy. Google may crawl but choose not to index, or apply site-wide quality pressure. Generic hours/services also risk misleading users and creating inaccurate structured data.
- **Priority:** Critical.

## Sitemap Findings

### Live validation

| URL | Result |
|---|---|
| [`/sitemap.xml`](https://certxa.com/sitemap.xml) | HTTP 200; `application/xml`; valid sitemap index; 3 child sitemap URLs |
| [`/sitemap-pages.xml`](https://certxa.com/sitemap-pages.xml) | HTTP 200; valid `urlset`; 26 URLs |
| [`/blog/sitemap.xml`](https://certxa.com/blog/sitemap.xml) | HTTP 200; XML body malformed because of leading whitespace before declaration |
| [`/salon/sitemap.xml`](https://certxa.com/salon/sitemap.xml) | HTTP 200; valid sitemap index; 2 child sitemaps |
| [`/salon/sitemap-1.xml`](https://certxa.com/salon/sitemap-1.xml) | HTTP 200; valid `urlset`; 50,000 URLs; ~7.95 MB |
| [`/salon/sitemap-2.xml`](https://certxa.com/salon/sitemap-2.xml) | HTTP 200; valid `urlset`; 1,499 URLs; ~244 KB |

The root index contains:

- `https://certxa.com/sitemap-pages.xml`
- `https://certxa.com/blog/sitemap.xml`
- `https://certxa.com/salon/sitemap.xml`

The approximate total URL exposure is **51,525 URLs**: 26 marketing URLs, 51,499 salon URLs, plus the URLs emitted by the blog sitemap. The salon inventory is below the 50,000-per-`urlset` protocol limit only after splitting: 50,000 + 1,499. The child sitemap index is therefore required and is correctly present.

### Source implementation

- Static PHP sitemap index: [`php/sitemap.xml`](../php/sitemap.xml:6).
- Static marketing URL set: [`php/sitemap-pages.xml`](../php/sitemap-pages.xml:2).
- Directory sitemap index and slices: [`salonDirectory.ts`](../artifacts/api-server/src/routes/salonDirectory.ts:1688).
- Express root sitemap handler exists in [`static.ts`](../artifacts/api-server/src/static.ts:174), but [`index.ts`](../artifacts/api-server/src/index.ts:549) delegates sitemap routes to the PHP router. This is a source-of-truth ambiguity and should be confirmed in deployment documentation.

### What the sitemap does and does not include

- URLs are absolute HTTPS URLs and use the canonical `/salon/:slug` structure.
- No query parameters are present in the salon sitemap.
- No redirect URLs were observed in the validated salon slices.
- There are no explicit filtering checks for `active`, `deleted`, `noindex`, or HTTP status before emitting a URL.
- Salon URLs come from the JSON file, not a filesystem route scan or live database query.
- The page size and splitting logic do not truncate the current 51,499 records: 50,000 and 1,499 were observed.
- Sitemap responses are cached with `max-age=86400`; a changed dataset can remain represented by an old CDN/browser response for up to a day, and process memory remains unchanged until restart.
- The sitemap route has a custom non-bot limit of 10 requests per 10 minutes, while user-agent strings matching known bot names bypass it. This is not a Googlebot block in source, but naive monitoring tools can receive 429 responses.

### Sitemap protocol risks

- `changefreq` and `priority` are present but are not meaningful ranking controls.
- The root static sitemap contains dated `lastmod` values; the salon sitemap has no `lastmod`, so freshness is not communicated at URL level.
- The blog child sitemap must be fixed before reliable Search Console processing.
- The live `robots.txt` declares only `https://certxa.com/sitemap.xml`, which is sufficient because it is the root sitemap index. The checked-in PHP file declares four sitemap URLs, so production and source are out of sync.

## Nail Directory Findings

### Architecture and URL structure

The public directory is mounted by the Node server before the PHP middleware at [`index.ts`](../artifacts/api-server/src/index.ts:689). It supports:

- National directory: `/nail-salons`
- Alias: `/nail-salons/united-states` → 301 to `/nail-salons`
- State pages: `/nail-salons/{state-slug}`
- City pages: `/nail-salons/{state-slug}/{city-slug}`
- Paginated city pages: same path with `?page=N`
- Individual salon pages: `/salon/{record-slug}`
- Directory sitemap index: `/salon/sitemap.xml`

There is no ZIP-code, neighborhood, category, or service route in this implementation. The local snapshot contains 51,499 possible individual profiles. State and city indexes are built from records with recognized state and non-empty city at [`buildStateIndex()`](../artifacts/api-server/src/routes/salonDirectory.ts:237). Up to 150 cities are linked per state, while all records are represented in city data if valid.

### Discovery

- State pages statically link up to 150 city pages per state.
- City pages statically link 20 salon pages per page and expose pagination links.
- Individual pages link back to the directory and geographic parents through breadcrumbs/footer.
- The national page is an interactive map/list finder. Its initial HTML has no H1 and does not contain all salon cards; salon result links are generated client-side after geolocation/search/API interaction.
- The direct answer is: **not reliably for every salon**. Without the sitemap, a crawler can reach states and the linked cities, then the first 20 salons per city, but records beyond the first city page depend on query-string pagination. The checked-in robots file globally disallows `/*?*`, which would block those links if that file is deployed; the live robots response did not contain that rule at audit time. Salons in cities outside the state page's top 150 linked cities can also be orphaned from normal HTML links. The sitemap is therefore essential for full coverage.

## Individual Salon Page Findings

### Strengths

- Server-rendered complete HTML; no client-side API call is required to expose the core record.
- Unique title based on name, address, city, state, ZIP: [`pageTitle`](../artifacts/api-server/src/routes/salonDirectory.ts:455).
- Dynamic meta description, `index, follow`, self-canonical, Open Graph, Twitter metadata, and language declaration.
- Visible H1 is the salon name; address, phone, services, hours, map/directions, and breadcrumbs are present in HTML.
- JSON-LD uses `NailSalon` plus a separate `BreadcrumbList`: [`jsonLd`](../artifacts/api-server/src/routes/salonDirectory.ts:459).
- `PostalAddress`, optional `GeoCoordinates`, `hasMap`, `openingHoursSpecification`, `Offer`/`Service`, aggregate rating, and booking `sameAs` are emitted.
- An HTML microdata `PostalAddress` is also present at [`address`](../artifacts/api-server/src/routes/salonDirectory.ts:730).

### Weaknesses

- `NailSalon` is appropriate for a genuine nail salon, but the source record is not verified before the page is made indexable.
- Placeholder hours and services are emitted as if they describe the business. Closed hours are represented as `opens: 00:00`, `closes: 00:00`, which is semantically questionable.
- Aggregate ratings are copied from the imported record, but no review objects or source attribution are included. Eligibility for review rich results should not be assumed; third-party ratings and self-serving review markup require careful validation.
- There is no real business description field in the source record. The “About” text is generated boilerplate, limiting distinctiveness.
- Website URL is stored in the record but is not visibly rendered as a business website link in the inspected renderer.
- Images are six rotating generic Pexels hero images selected by slug, not salon-specific images. The image has no explicit `width`/`height` attributes, creating possible CLS risk and weak image relevance.
- No `dateModified`, `mainEntityOfPage`, `sameAs` to the salon's actual external website, or owner verification signal is emitted for unclaimed profiles.

## Indexability Findings

| Page type | Status | Robots | Canonical | Rendering | Assessment |
|---|---:|---|---|---|---|
| Homepage/marketing PHP pages | 200 in live samples | `index, follow` | Self | Server HTML | Generally crawlable |
| `/nail-salons` | 200 | `index, follow` | Slashless self URL | Server HTML plus JS map | Indexable but weak national HTML discovery |
| State page | 200 for valid state; 404 + `noindex` for invalid | `index, follow` | Self | Server HTML | Good template, only top 150 cities linked |
| City page | 200 for valid city; 404 + `noindex` for invalid | `index, follow` | Page 1 self; page >1 includes `?page=N` | Server HTML | Query pages conflict with global robots query block |
| Individual salon | 200 for valid slug; 404 + `noindex` for invalid | `index, follow` | Self | Server HTML | Technically indexable; content quality is the main risk |
| `/nail-salons/united-states` | 301 | N/A | Redirect | N/A | Not in sitemap; acceptable alias |
| Login/admin/API paths | Mostly blocked by robots | Usually app-controlled | N/A | App | Correctly excluded in principle |

The directory routes themselves do not emit `noindex` for valid records. They do emit `noindex` on invalid state/city/salon 404 pages, which is a good defensive measure but does not replace a proper 404 status (they do return 404).

## Technical SEO Findings

### T1 — Two overlapping public sitemap implementations

[`static.ts`](../artifacts/api-server/src/static.ts:101) contains another robots/sitemap implementation, while [`index.ts`](../artifacts/api-server/src/index.ts:549) delegates root sitemap requests to PHP, and [`php/router.php`](../php/router.php:287) handles the blog sitemap. This increases deployment drift risk: source code can suggest one response while production serves another.

### T2 — Trailing slash normalization is incomplete

Live `/nails-salons/` returns 200 and canonicalizes to `https://certxa.com/nail-salons`, while `/nail-salons` also returns 200. A single canonical is present, but a redirect would be a stronger signal and avoid duplicate rendering/crawling.

### T3 — Pagination signals are not aligned with the checked-in crawl rules

City page 2+ canonicals include `?page=N` and pagination links use query strings at [`renderCityPage()`](../artifacts/api-server/src/routes/salonDirectory.ts:1505). The checked-in robots file contains `Disallow: /*?*`, while the live robots response checked on 2026-08-18 did not. If the checked-in policy becomes active, the HTML advertises paginated URLs while robots asks crawlers not to crawl any query URL.

### T4 — Query string handling can produce duplicate/invalid pagination behavior

The renderer clamps page values to a valid page, but it does not redirect out-of-range, non-numeric, or alternate query variants. Multiple query URLs can return the same HTML/canonical. The canonical includes only the clamped page number, while `og:url` always points to the unparameterized city URL.

### T5 — Per-request database lookup and fallback

[`findMatchingStore()`](../artifacts/api-server/src/routes/salonDirectory.ts:305) queries locations, services, and hours on the first request for each slug. Failures are caught and cached as `null` at lines 367–370, causing the page to permanently use placeholders for the process lifetime. This risks slow TTFB, inconsistent content after recovery, and inaccurate metadata/schema.

### T6 — Memory and build/runtime dependency

The ~17 MB JSON file is synchronously read and parsed on first directory use, then state/city indexes are built in memory. This is acceptable at current size but makes cold-start latency, memory pressure, and multi-process consistency relevant. It is not a scalable database-backed sitemap/page architecture.

### T7 — Images lack intrinsic dimensions and are generic

The salon hero image uses an external Pexels URL selected from six options and the CSS sets `width`/`height` without HTML intrinsic dimensions. This can produce layout shifts and delivers weak, repeated visual content across thousands of pages.

### T8 — Performance risk from embedded map and fonts

The individual page embeds a Google Maps iframe and loads Google Fonts; the national page loads Leaflet CSS/JS and Google Fonts. These are not blocking the initial salon content because the page is server-rendered, but they increase page weight and third-party dependency risk. No load test was performed.

### T9 — Static sitemap dates can become stale or misleading

[`php/sitemap-pages.xml`](../php/sitemap-pages.xml:8) uses fixed future/current-looking dates, and the root index dates are manually/static. This can weaken freshness signals if content does not actually change on those dates.

### T10 — Production/source robots drift

The checked-in [`php/robots.txt`](../php/robots.txt:1) contains internal-path, query-string, scraper-agent, and four-sitemap rules. The live response contained a shorter internal-path policy and only the root sitemap declaration. Repository review therefore cannot be treated as proof of production crawl behavior without validating the deployed response.

## Content/Architecture Findings

### Commercial intent

Certxa has a reasonable commercial base: the live homepage and [`/nail-salon-software`](https://certxa.com/nail-salon-software) are server-rendered and target nail salon software, booking, management, and POS themes. The source also includes an industry SEO config for `/nails` and many other industries at [`SEO_CONFIG`](../artifacts/api-server/src/static.ts:9), but the production static PHP sitemap lists `/nail-salon-software`, not necessarily every configured route. This creates naming and URL architecture drift.

### Local intent

The directory supports scalable “nail salons in state/city” pages with readable lowercase hyphenated URLs. State/city templates have unique geographic titles, descriptions, H1s, and links. However, the pages are primarily lists and generated boilerplate; they lack locally useful editorial content, neighborhood context, service distinctions, ownership/verification signals, and first-party salon information.

### Directory intent

Individual salon-name queries are supported by readable slug URLs and a 51,499-record inventory. The fundamental architecture is viable for discovery, but Google does not have to index every URL merely because it is in a sitemap. Generic assets, placeholders, missing fields, and imported data make these pages vulnerable to “crawled - currently not indexed” or low-quality selection.

### Low-value URL risk

The system can generate approximately 51,499 salon pages, state pages, city pages, and potentially many query pagination variants. There is no visible active/deleted/quality threshold in the directory renderer or sitemap builder. The source dataset itself has missing identity/location fields, so invalid/low-value records are possible. The scale is under Google’s per-sitemap limit only because of a correctly implemented split; it is still large relative to the amount of unique content per page.

## Structured Data

Observed implementations include:

- Marketing PHP pages: JSON-LD exists in live homepage and product-page samples, but the audited source shows the page templates rather than a complete repository-wide schema inventory.
- Individual salon pages: dynamic `NailSalon` and `BreadcrumbList` JSON-LD at [`renderSalonPage()`](../artifacts/api-server/src/routes/salonDirectory.ts:459).
- State pages: `BreadcrumbList` only at [`renderStatePage()`](../artifacts/api-server/src/routes/salonDirectory.ts:1429).
- City pages: `BreadcrumbList` and `ItemList` at [`renderCityPage()`](../artifacts/api-server/src/routes/salonDirectory.ts:1512).
- Tenant websites: category-to-schema mapping and dynamic JSON-LD in [`render-salon-page.ts`](../artifacts/api-server/src/lib/render-salon-page.ts:127) and [`tenant-seo.ts`](../artifacts/api-server/src/lib/tenant-seo.ts:104).

The salon schema is dynamically populated from imported record data and optional live store data. Main validity risks are placeholder opening hours, imported aggregate ratings without review provenance, generic images, and a potentially misleading `sameAs` value that points to a Certxa booking URL only for matched stores.

## SEO Metadata

### Positive examples

- Live homepage: unique title, description, canonical, robots, H1, and JSON-LD.
- Live `/nail-salon-software`: unique title/description/canonical/H1 and JSON-LD.
- Live individual salon sample: unique title/description/canonical/H1, OG/Twitter, and two JSON-LD blocks.
- State and city pages: unique title, description, canonical, H1, and geographic metadata.

### Problems and examples

- National `/nail-salons` has no H1 in live HTML; the visible app is map/list UI with headings represented by non-H1 elements.
- National page has no OG description or OG image in the inspected renderer, unlike the individual page.
- Individual salon descriptions use a fixed sentence pattern and generic services/hours; uniqueness is mostly name/address/rating.
- State pages link only the first 150 cities, despite the underlying city index containing potentially more.
- City page page 2+ has parameterized canonical but `og:url` remains page 1, a metadata inconsistency.
- Invalid pages use minimal titles and `noindex`; the HTTP 404 is correct.

## Authority/Ranking Findings

These are not solved by code alone:

- A directory of imported business records needs external trust, citations, owner claims, and unique first-party value.
- Certxa needs backlinks and mentions from nail-salon, booking-software, POS, local-business, and industry sources.
- Google Business Profile and NAP/entity consistency for Certxa and claimed salons are external work.
- The commercial landing pages need proof, customers, case studies, comparisons, demonstrations, and topical content.
- Search Console data is not present in the repository; actual indexed count, selected canonical, crawl stats, and “crawled/discovered currently not indexed” status must be verified in GSC.

## Why Certxa May Have Poor Visibility After 11 Months

### Critical

1. **Scaled pages are not sufficiently differentiated.** The code publishes 51,499 indexable profiles, many with generic placeholder services/hours, generic Pexels images, and boilerplate descriptions. Google can crawl them yet decline to index or rank them because sitemap inclusion is not a quality guarantee.
2. **The inventory is a static snapshot rather than a live eligibility-controlled database feed.** Stale, missing, inactive, or invalid records can dilute the site’s indexable corpus and reduce trust.

### High

3. **Full discovery depends heavily on the sitemap.** The national page does not statically link all salons; state pages cap linked cities at 150; city pages expose only 20 salons per page; query pagination is globally disallowed by robots. Without successful sitemap processing, a substantial portion is difficult to discover.
4. **The malformed blog sitemap loses an independent content discovery channel.** It is a concrete production indexing defect, though not the primary explanation for salon visibility.
5. **The directory has limited authority.** Thousands of directory URLs without strong internal prominence, external links, owner contributions, or unique local content are unlikely to outrank established local directories and Google’s own local results.

### Medium

6. **Trailing-slash and query canonical inconsistencies create avoidable duplicate signals.** They are not a universal blocker but add crawl/index selection noise.
7. **Per-page first-request database lookups and large in-memory initialization may create sporadic latency or 5xx/fallback behavior.** The source catches failures, which protects availability but can silently produce lower-quality pages.
8. **Commercial architecture has route drift.** PHP production sitemap, Express SEO config, static geo pages, and marketing templates use overlapping names (`/nails`, `/nail-salon-software`, `/salons`) and multiple serving layers.

### Low

9. **Generic external hero images, missing intrinsic dimensions, fonts, and maps can reduce UX/performance quality.** These are unlikely to explain extremely poor visibility by themselves.
10. **Use of `priority`/`changefreq` and repeated metadata is not a primary ranking cause.** They are secondary compared with content quality, crawl discovery, and authority.

## Recommended Fixes

| Problem | Evidence | File/path | Why it matters | Recommended solution | Priority |
|---|---|---|---|---|---|
| Malformed blog XML | Live parser failure | [`php/blog/sitemap.xml.php`](../php/blog/sitemap.xml.php:26) | Child sitemap may be rejected | Ensure XML declaration is byte 0 and add automated XML validation | High |
| Stale JSON inventory | `readFileSync` + process cache | [`salonDirectory.ts`](../artifacts/api-server/src/routes/salonDirectory.ts:91) | New/deleted records do not sync | Build eligibility-filtered sitemap/page data from authoritative DB or controlled refresh job | Critical |
| Placeholder business facts | Generic services/hours for unmatched salons | [`PLACEHOLDER_SERVICES`](../artifacts/api-server/src/routes/salonDirectory.ts:146) | Thin/misleading pages and schema | Show only verified facts; add owner claim/enrichment workflow; noindex or omit low-value records | Critical |
| Sitemap not filtered by status | Direct `list.map` | [`salonDirectory.ts`](../artifacts/api-server/src/routes/salonDirectory.ts:1692) | Stale/invalid URLs can be submitted | Emit only 200, canonical, indexable, verified/eligible URLs | Critical |
| Source/live robots mismatch | Checked-in file has query/scraper rules; live response has neither | [`php/robots.txt`](../php/robots.txt:1), live `https://certxa.com/robots.txt` | Deployment behavior is not predictable from source | Make one robots owner, deploy it deliberately, and add a production contract test | High |
| Query pages blocked by checked-in policy | `Disallow: /*?*` plus `?page=N` links | [`php/robots.txt`](../php/robots.txt:18), [`salonDirectory.ts`](../artifacts/api-server/src/routes/salonDirectory.ts:1561) | Pagination discovery contradiction if policy is deployed | Choose a coherent strategy: clean paginated paths, sitemap them, or intentionally consolidate/noindex with HTML alternatives | High |
| National page lacks H1/static listings | Live HTML has no H1 and no full list | [`renderNationalPage()`](../artifacts/api-server/src/routes/salonDirectory.ts:764) | Weak topical signal and orphan risk | Add crawlable explanatory content and HTML state/city links; keep JS finder as enhancement | High |
| City link cap | `slice(0, 150)` | [`renderStatePage()`](../artifacts/api-server/src/routes/salonDirectory.ts:1438) | Cities beyond cap may be orphaned | Link all eligible cities or provide crawlable paginated city index | High |
| Canonical/OG mismatch | Page canonical has query; `og:url` does not | [`renderCityPage()`](../artifacts/api-server/src/routes/salonDirectory.ts:1578) | Conflicting URL signals | Make canonical, OG URL, links, and sitemap strategy consistent | Medium |
| Duplicate slash variants | Both `/nail-salons` and `/nail-salons/` return 200 | Live validation | Duplicate crawling | Redirect one form and use it consistently in links/canonicals/sitemaps | Medium |
| Generic images/no dimensions | Six shared Pexels images; CSS-only sizing | [`heroImage()`](../artifacts/api-server/src/routes/salonDirectory.ts:175) | Weak relevance and CLS | Use verified salon images with responsive dimensions or omit image when unavailable | Medium |
| Silent fallback after DB error | Errors cached as null | [`findMatchingStore()`](../artifacts/api-server/src/routes/salonDirectory.ts:367) | Incidents become persistent low-value HTML | Separate temporary errors from “no match”; monitor and retry safely | Medium |
| Multiple sitemap sources | PHP, Express, Node directory layers | [`static.ts`](../artifacts/api-server/src/static.ts:174), [`index.ts`](../artifacts/api-server/src/index.ts:549) | Deployment drift | Establish one documented production owner and contract tests | Medium |

## Recommended SEO Architecture

1. Keep one public web application boundary with explicit ownership for PHP marketing pages, Node directory pages, and tenant pages.
2. Use a database-backed, eligibility-filtered directory model with states such as `verified`, `claimed`, `unclaimed`, `inactive`, and `removed`.
3. Publish only pages with sufficient unique, accurate content. Keep thin imported records available for users if needed, but do not automatically index every record.
4. Use one canonical URL format, ideally `/nail-salons/{state}/{city}/{salon-slug}` or the current `/salon/{slug}` with strong geographic breadcrumbs and a stable slug policy. Redirect all aliases and slash variants.
5. Provide crawlable HTML links: homepage/product → directory; directory → every eligible state; state → every eligible city; city → paginated salon pages; salon → geographic parents and relevant related salons.
6. Use clean pagination paths or a deliberately documented query strategy. Do not simultaneously block query URLs and rely on them for discovery.
7. Maintain a root sitemap index split by content type and size. Child sitemaps should contain only canonical 200/indexable URLs, be generated from the same eligibility source as routing, and be XML-validated in CI.
8. Use real salon-specific data, owner claims, services, hours, images, descriptions, and updates. Emit `NailSalon` JSON-LD only when the facts are supported.
9. Add useful local content to city/state pages: service mix, neighborhoods, booking guidance, data methodology, update dates, and meaningful internal links—not spun paragraphs.
10. Measure Search Console coverage by template: submitted, discovered, crawled, indexed, duplicate, soft 404, and selected canonical.

## Codex Implementation Plan

No tasks below were implemented during this audit.

1. Add a read-only XML contract test for root, blog, directory index, and child sitemaps.
2. Document and verify the production route owner for `/robots.txt`, `/sitemap.xml`, `/blog/sitemap.xml`, and `/salon/sitemap.xml`.
3. Fix and test the blog sitemap serialization.
4. Define the directory page eligibility contract and data-quality thresholds.
5. Add a report-only job comparing authoritative salon records, rendered routes, and sitemap URLs.
6. Add status/deletion handling and 404/410 behavior for removed profiles.
7. Resolve slash normalization and decide the pagination URL strategy.
8. Expand crawlable state/city linking without creating low-value doorway pages.
9. Replace placeholder business facts with verified/enriched data or suppress those fields and schema properties.
10. Add real image handling, intrinsic dimensions, and performance budgets.
11. Add template-level SEO tests for title, description, H1, canonical, robots, OG, and JSON-LD.
12. Use Search Console inspection/coverage data to validate each change before scaling it to all records.

## Final Verdict

Certxa’s SEO problem is **a combination**, with the dominant internal causes being **scaled-content quality and directory data/indexing architecture**, not a single site-wide robots block. The live salon pages are server-rendered, return 200, have self-canonicals, and are represented by a correctly split salon sitemap. Therefore, “Google cannot technically crawl anything” is not supported by the evidence.

The more likely explanation for extremely poor visibility is that Certxa is asking Google to evaluate tens of thousands of largely templated profiles whose unique value is often limited to imported business fields, generic services/hours, and repeated imagery, while relying on a static snapshot and a sitemap for broad discovery. The malformed blog sitemap, pagination/robots contradiction, route-layer drift, and incomplete internal discovery amplify the problem. External authority and owner-generated content are also required; code changes alone will not make the directory competitive.

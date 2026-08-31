# Technical SEO / GEO Audit — certxa.com

**Audit date:** 2026-08-23
**Method:** Direct HTTP fetches (curl) of raw server responses — homepage, /pricing, /login, /blog, robots.txt, sitemap tree, and three sampled `/salon/` programmatic pages — cross-checked against multiple User-Agent strings (Chrome desktop, GPTBot, ClaudeBot, no-UA) to rule out cloaking/dynamic rendering.

## Technical Foundations

**Technical Score: 85/100 — Good**

### Score Breakdown

| Category | Score | Weight | Weighted | Status |
|---|---|---|---|---|
| Server-Side Rendering | 92/100 | 25% | 23.0 | Good |
| Meta Tags & Indexability | 95/100 | 15% | 14.25 | Excellent |
| Crawlability | 78/100 | 15% | 11.7 | Fair |
| Security Headers | 78/100 | 10% | 7.8 | Fair |
| Core Web Vitals Risk | 85/100 | 10% | 8.5 | Good |
| Mobile Optimization | 95/100 | 10% | 9.5 | Excellent |
| URL Structure | 65/100 | 5% | 3.25 | Fair |
| Response & Status | 90/100 | 5% | 4.5 | Good |
| Additional Checks | 50/100 | 5% | 2.5 | Poor |
| **Total** | | | **85.0** | **Good** |

The composite score is dragged down primarily by the `/salon/` programmatic directory (see "Additional Checks" and the dedicated section below) — a content-quality/duplicate-content risk, not a rendering or markup defect. On the dimensions that determine whether AI crawlers can read the site at all (SSR, meta tags, mobile, response hygiene), Certxa scores very well.

---

### Server-Side Rendering Assessment

**Status:** LOW risk
**Rendering Type:** Server-rendered (non-SPA) for all public-facing pages tested
**Framework Detected:** PHP-templated server rendering (`X-Powered-By: PHP/8.1.2-1ubuntu2.25`) for marketing + directory pages; Node/Express (`X-Powered-By: Express`) for the auth/redirect layer at `/login` → `/auth`.

**Important correction to the brief's assumption:** the task described Certxa as "a React SPA served from a Vite build (bundle names like `index-*.js`, `vendor-react-*.js` visible in page source)." That pattern was **not found** on any of the public pages fetched. The homepage, `/pricing`, `/blog`, and all sampled `/salon/*` pages ship exactly **one** script tag — `<script src="/assets/js/main.js">` (12.7KB, unbundled, no chunk hashing) — placed at the very end of `<body>`, line 1525 of 1535. There is no `<div id="root">`/`<div id="app">` shell, no `__NEXT_DATA__`/`__NUXT__` marker, no hydration attributes, and no `<noscript>` fallback — because none is needed. Full page content (headings, paragraphs, nav, footer, pricing tables, structured data) is present in the raw HTML before any JavaScript runs.

It's likely the Vite/React bundle the brief refers to belongs to the **authenticated app** (the salon-owner dashboard behind `/manage/`, `/dashboard/`, `/calendar/`, `/customers/` — all correctly `Disallow`'d in robots.txt and irrelevant to public/AI-crawler visibility). The **public marketing site and the 51k-page salon directory are a completely separate, server-rendered surface.** This is a materially positive finding for GEO: AI crawlers that don't execute JavaScript (GPTBot, ClaudeBot, PerplexityBot) see the same content a human browser sees.

**Verification against cloaking:** identical HTML (byte-for-byte, matching MD5 hash `da20a497c60aa1daebe6fbde51f6371d`) was returned for the homepage regardless of User-Agent — tested with Chrome desktop UA, `GPTBot/1.0`, `ClaudeBot/1.0`, and no UA at all. No dynamic-rendering/prerender-service split was detected; what curl sees is what a browser sees.

Verified content presence (excluding `<script>`/`<style>` blocks):
- Homepage: ~14,850 characters of visible body text
- `/pricing`: ~20,270 characters of visible body text, including plan names/prices in raw HTML
- Sampled `/salon/*` pages: ~1,380–1,425 characters each (thin — see below)

**Full meta tag rendering:** title, description, canonical, Open Graph, Twitter Card, and JSON-LD are all present in the initial server response — not injected client-side. This is the single highest-leverage GEO factor and Certxa passes it cleanly on every page type tested.

---

### Crawlability & Indexability

**Robots.txt:** Found at `/robots.txt` — well-formed, `User-agent: *` / `Allow: /` with a sensible `Disallow` list scoped to genuinely internal app routes (`/api/`, `/auth/`, `/manage/`, `/admin/`, `/dashboard/`, `/calendar/`, `/customers/`, `/products/`, staff auth/reset flows). No `Crawl-delay` directive. No AI-crawler-specific rules (no explicit `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` blocks or allowances) — the wildcard `Allow: /` covers them by default, which is fine, but there's no explicit signal of intent either way for AI-specific agents. One `Sitemap:` reference, correctly pointing to `/sitemap.xml`.

**XML Sitemap:** Found and well-structured as a three-way index:
- `/sitemap-pages.xml` — static marketing pages, `<lastmod>2026-07-10</lastmod>` on the index entry, individual pages carry per-URL `<lastmod>2026-07-20</lastmod>` and sensible `<priority>` values (1.0 homepage → descending for feature pages).
- `/blog/sitemap.xml` — currently lists only the `/blog` index URL; the blog has zero published articles ("No articles published yet" is genuinely rendered in the HTML), so this is accurate, not a bug.
- `/salon/sitemap.xml` — a second-level index of **11 sub-sitemaps** (`sitemap-1.xml` … `sitemap-11.xml`; the brief mentioned 10, there are actually 11), 5,000 URLs each except the last (1,499), for **51,499 total salon location pages**. None of the ~51,499 `<url>` entries carry a `<lastmod>` — a real gap for a directory that's presumably updated as listings are claimed/refreshed, though minor relative to the content-quality issue below.

The target homepage appears correctly in `/sitemap-pages.xml` with `priority=1.0`.

**Meta Robots:** `index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1` on the homepage — fully indexable, and explicitly opts into large snippets/previews (good for both classic SERP and AI Overview-style surfaces). Sampled salon pages carry `index, follow, max-image-preview:large, max-snippet:-1` — also fully indexable, which is the concern given the content quality found there (see below).

**Canonical:** Self-referencing on every page sampled (homepage, `/pricing`, all three salon pages). No cross-domain or missing canonicals found.

**URL normalization:** `www.certxa.com` → `certxa.com` (301), `http://` → `https://` (301), and `/pricing/` (trailing slash) → likely canonical form (301) all resolve in a single hop — no redirect chains detected anywhere tested.

---

### Meta Tags Audit

| Tag | Status | Value/Issue |
|---|---|---|
| Title | Present | Homepage: "Nail Salon Software \| Certxa" (37 chars, on the short side but clear); Pricing: "Salon Software Pricing \| Certxa" |
| Description | Present | Homepage description is well-written but long (~290 chars, will truncate in SERP — consider trimming to ~155–160); includes "Free 60-day trial" CTA |
| Canonical | Present | Self-referencing on all sampled pages |
| Viewport | Present | `width=device-width, initial-scale=1.0` — correct |
| Language | Present | `<html lang="en">` |
| Open Graph | Complete | `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image` (with width/height), `og:locale` all present |
| Twitter Card | Complete | `twitter:card=summary_large_image`, title, description, image all present |
| hreflang | Not present | Site is US-only/English-only with no multilingual signals found — absence is appropriate, not a defect |

Structured data (JSON-LD) on the homepage is notably strong for a marketing site: a `@graph` containing `WebSite` (with `SearchAction`), `Organization` (with `sameAs`, `contactPoint`), `SoftwareApplication` (with `offers`, `featureList`), and `FAQPage`. This is exactly the kind of explicit, machine-readable entity data that helps AI answer engines ground claims about the product.

---

### Security Headers

| Header | Status | Value |
|---|---|---|
| HTTPS | Yes | Enforced; HTTP redirects to HTTPS in one hop |
| HSTS | Present (duplicated, conflicting) | Two different values sent on the same response — see finding below |
| CSP | Present but weak | `script-src` includes `'unsafe-inline' 'unsafe-eval'` |
| X-Frame-Options | Present | `SAMEORIGIN` |
| X-Content-Type-Options | Present | `nosniff` |
| Referrer-Policy | Present | `strict-origin-when-cross-origin` |
| Permissions-Policy | Present (duplicated, conflicting) | Two different values sent — see finding below |

**Finding — duplicate/conflicting security headers.** Every response inspected (homepage, `/pricing`, the `/login` → `/auth` redirect, salon pages) sends **two full sets** of security headers: one block from the application layer (`Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`) and a second block that appears to originate from an nginx reverse-proxy layer (`Host: 127.0.0.1:13200`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`). Per RFC 6797 §8.1, browsers use the *first* `Strict-Transport-Security` header observed, meaning the weaker 1-year value (no `preload`) is likely the one that actually governs HSTS behavior, and the stronger, preload-eligible policy configured downstream is effectively dead configuration. This isn't an active vulnerability (both individual values are still reasonably safe), but it's a signal of two layers (app + proxy) independently setting overlapping security policy without coordination — worth consolidating to one source of truth, and to actually get HSTS preload-list eligibility if that's the intent.

**Finding — CSP allows `unsafe-inline` and `unsafe-eval`.** The `script-src` directive is `'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://js.stripe.com https://connect-js.stripe.com https://unpkg.com https://certxa.com`. `unsafe-inline` and `unsafe-eval` substantially weaken CSP's XSS-mitigation value — with both present, CSP no longer meaningfully restricts inline script injection, which is the attack vector CSP exists to stop. `style-src` also carries `unsafe-inline`. For a platform handling payment flows (Stripe) and client PII (salon customer records), tightening this — e.g., migrating inline scripts/styles to nonce- or hash-based CSP — would be a meaningful trust-signal and security improvement.

---

### Core Web Vitals Risk Assessment

| Vital | Risk Level | Indicators Found |
|---|---|---|
| LCP | Low–Medium | Hero background video is lazy-loaded via `data-src` (deferred, not render-blocking) rather than an eager `<video src>` — good. Google Fonts loaded via render-blocking `<link rel="stylesheet">` with `&display=swap` in the URL (mitigates FOIT). One additional render-blocking stylesheet (`/assets/css/style.css`, no `media` attribute). `<link rel="preconnect">` present for `fonts.googleapis.com`/`fonts.gstatic.com`. No `<link rel="preload">` for the hero video or fonts, which would further help LCP. |
| INP | Low | Only 12.7KB of first-party JS (`main.js`), loaded at the end of `<body>`, not `<head>` — minimal main-thread contention. Zero inline `onclick`/event-handler attributes found in the markup. No synchronous third-party script tags detected in the fetched HTML (GTM reference exists via CSP allowlist but wasn't observed loading synchronously in the sampled markup). |
| CLS | Low–Medium | No `<img>` tags at all were found in the homepage HTML (visuals are handled via CSS/video, not raster images) — so the classic "image without width/height" CLS risk doesn't apply on the homepage. `img, video, svg, iframe { max-width:100%; height:auto }` is set globally, which is good for responsiveness but doesn't guarantee reserved space unless paired with `aspect-ratio` — the hero video specifically should be checked for an explicit `aspect-ratio` or fixed container height to avoid a layout jump when it loads. |

Note: this is a static HTML/CSS analysis, not field data. Validate with PageSpeed Insights or CrUX for real user LCP/INP/CLS numbers, particularly on `/pricing` and a sampled `/salon/` page.

---

### Mobile Optimization

**Status:** Optimized

- Correct `viewport` meta tag on every page type sampled.
- 63 `@media` query blocks in the main stylesheet — substantial, well-developed responsive design, not a token afterthought.
- Global `max-width:100%; height:auto` rule on media elements.
- Touch targets: CSS shows `min-height: 44px`/`48px` used repeatedly (5 and 3 occurrences respectively) across interactive elements — meets/exceeds the 44×44px Apple HIG / WCAG 2.5.5 guidance.
- Base font size: `html { font-size: 16px }` — meets the 16px minimum for mobile legibility without forcing zoom.

No horizontal-scroll risk indicators (fixed-width elements wider than viewport) were found in the sampled markup.

---

### URL Structure

**Target URL:** `https://certxa.com`
**Assessment:** Split verdict — marketing URLs are clean; the 51k-page directory URLs are structurally weak.

**Marketing/product pages** are excellent: `/pricing`, `/online-booking`, `/revenue-intelligence`, `/checkin-kiosk`, `/google-business-profile` — all lowercase, hyphenated, short, descriptive, flat (no unnecessary nesting), and consistent.

**`/salon/*` directory pages** are a concern:
- URLs are flat (`/salon/{slug}`) and do **not** reflect the geographic hierarchy that the page's own breadcrumb schema declares (Nail Salons → United States → California → Perris → business). Compare the breadcrumb JSON-LD, which models `/nail-salons/california/perris` as a real hub, against the actual page URL `/salon/nails-salon-north-perris-boulevard-a14-perris-8XXSLX`, which lives in a completely flat namespace. A hierarchical path (e.g., `/nail-salons/california/perris/{business-slug}`) would better reflect site structure and give crawlers/AI systems a cleaner signal of geographic clustering.
- Every slug ends in a random alphanumeric suffix (`-8XXSLX`, `-FuzSBA`, `-46ziud`) needed for uniqueness where business names collide — functional, but it makes the URLs less human-readable and adds no keyword value.
- Length: most sampled URLs run 75–95 characters (e.g., `https://certxa.com/salon/floral-nail-spa-best-nail-salon-in-south-cicero-avenue-cicero-eV8gLK` = 93 chars) — approaching the "under 100 characters preferred" guideline, and some will exceed it once combined with longer city/business names.

---

### Additional Technical Checks

- **Duplicate content / canonicalization:** No www/non-www or http/https duplication risk — both normalize correctly in one redirect hop. Canonicals self-reference correctly everywhere sampled.
- **Redirect chains:** None found — every redirect tested (`www→apex`, `http→https`, `/login→/auth`, trailing-slash normalization) resolves in a single 301 hop.
- **Structured data:** No JSON-LD syntax errors found; parsed cleanly on every page sampled (`WebSite`, `Organization`, `SoftwareApplication`, `FAQPage` on the homepage; `NailSalon` + `BreadcrumbList` on directory pages).
- **Resource hints:** `preconnect` present for Google Fonts origins; no `preload` hints for any critical resource.
- **Caching:** Static assets (`/assets/js/main.js`) are cached correctly — `Cache-Control: public, immutable, max-age=31536000` with a 1-year `Expires` header. Directory pages send `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` plus a weak ETag — reasonable. The homepage/marketing HTML sends **no** `Cache-Control`/`ETag` at all, which is a minor miss (a short `max-age` with revalidation would reduce origin load without hurting freshness).
- **Compression:** `gzip` confirmed enabled on both HTML and directory pages.

**The dominant issue in this category — programmatic `/salon/` directory content quality:**

This is the single most important finding in the audit and the reason "Additional Checks" and "Crawlability" don't score higher despite clean sitemaps and correct meta robots tags.

Three sampled pages across the 51,499-URL directory (`nails-salon-north-perris-boulevard-a14-perris-8XXSLX`, `pr3tty-nails-mj-lemon-avenue-rancho-cucamonga-FuzSBA`, `nesh-nail-salon-princeland-court-corona-46ziud`) each render only **~1,380–1,425 characters** of visible body text, and the substantive paragraph is near-verbatim templated boilerplate with only the business name/address swapped in:

> "**[Name]** is a nail salon located at **[address]**. We offer a full range of nail services including manicures, pedicures, gel nails, acrylic nails, dip powder nails, nail art, and more. Our experienced nail technicians are committed to providing high-quality nail care in a clean and relaxing environment..."

The "Services" list (Classic Manicure, Gel Manicure, Acrylic Full Set, Dip Powder Nails, Classic Pedicure, Spa Pedicure, Gel Nail Extensions, Nail Art, French Manicure, Solar Nails) is **identical across all three sampled pages** — it is not sourced from the actual business, it's a fixed template list applied to every listing. Photos are generic Pexels stock images (`images.pexels.com/photos/939836/...`, `.../1570827/...`) rotated across listings, not photos of the actual salon. Each page carries this disclosure, rendered directly in the HTML:

> "This page uses publicly available information to help people discover this venue. The business is not currently affiliated with or partnered with Certxa — get in touch with us to update the information or claim this listing."

In other words: these are **unclaimed, scraped/aggregated directory listings**, not customer pages, built from public data (likely Google Places or a similar source) at a scale of ~51,500 pages — roughly 50-100x the page count of the legitimate marketing site. Each carries `<meta name="robots" content="index, follow, ...">`, has a self-referencing canonical, and is submitted for indexing via sitemap. This is a textbook **thin-content / doorway-page pattern** at a scale large enough to plausibly affect the whole domain's aggregate quality signals in Google's Helpful Content system and analogous AI-crawler content-quality heuristics — the risk isn't just "these 51K pages might not rank," it's "these 51K thin pages sitting on the same domain as the legitimate SaaS product could suppress how Google/AI systems trust the rest of certxa.com." This is elaborated further in the Priority Actions below; it's flagged here because it is fundamentally a crawlability/indexability decision (should 51K auto-generated, unaffiliated listings be indexable at all, and if so, how).

---

### Agent-Readiness Signals (non-scoring)

#### RFC 8288 Link Headers (Service Discovery)

**Status:** Absent

No `Link:` response headers were present on the homepage or any other page tested (checked via `curl -D -`). Certxa is not an API-first product from the public site's perspective (no `/api/` or `/developers/` paths surfaced in navigation, no OpenAPI spec referenced in the sitemap) — it's a vertical SaaS product for salon owners, not a developer platform. Per the audit brief, this section is appropriately omitted from scoring, and no recommendation is surfaced since there's no API-first signal to act on.

#### Markdown Content Negotiation

**Status:** Not Supported
**Test:** `GET https://certxa.com/` with `Accept: text/markdown`
**Response Content-Type:** `text/html; charset=UTF-8` (unchanged from a normal request)

The server ignores the `Accept: text/markdown` header and returns standard HTML — expected, since this is a PHP/nginx-served stack rather than a Cloudflare Workers/Pages deployment. This is a forward-looking, low-priority note only: if Certxa's infrastructure ever moves behind Cloudflare, markdown content negotiation is a one-line config addition that would give AI crawlers/agents a lighter-weight, guaranteed-clean text representation of every page. Not urgent given the site already renders full content server-side in HTML.

---

### Priority Actions

1. **[CRITICAL]** Resolve the `/salon/` directory's thin/duplicate-content and indexability risk at scale (51,499 pages). Options, in order of typical effectiveness: (a) set `noindex, follow` on unclaimed listings until they're claimed/enriched with real business-specific content (hours verified, real photos, owner-submitted descriptions), flipping to `index` only once claimed; (b) consolidate/deduplicate the templated "About" and "Services" boilerplate so each page has substantively unique text (even light templating variation — e.g., pulling real review snippets, real service menus where available — meaningfully reduces duplicate-content risk); (c) at minimum, move this directory to a subdomain (e.g., `directory.certxa.com`) so its aggregate quality signals are less likely to be attributed to the primary `certxa.com` domain that the SaaS product depends on for branded/product-related search and AI-citation visibility. Given the ~50-100x page-count imbalance versus the legitimate marketing site, this is the highest-leverage fix in the entire audit.
2. **[HIGH]** Tighten Content-Security-Policy: remove `'unsafe-inline'` and `'unsafe-eval'` from `script-src` (and `unsafe-inline` from `style-src`) by migrating to nonce- or hash-based CSP. As configured, CSP provides materially less XSS protection than its presence suggests — notable given Stripe payment flows and client PII run through this app.
3. **[HIGH]** Deduplicate the conflicting Strict-Transport-Security and Permissions-Policy headers being sent by the app layer and the nginx/proxy layer. Per RFC 6797, the browser honors the first HSTS header seen, which currently means the weaker (non-preload) policy governs rather than the stronger one already configured downstream — consolidate to a single source of truth and confirm intended values actually take effect.
4. **[MEDIUM]** Add `<lastmod>` dates to the ~51,499 URLs inside `/salon/sitemap-1.xml` through `sitemap-11.xml` (currently zero present) so crawlers can prioritize recrawl of genuinely updated listings over static ones.
5. **[MEDIUM]** Restructure `/salon/` URLs to reflect the geographic hierarchy already modeled in each page's own `BreadcrumbList` schema (e.g., `/nail-salons/california/perris/{slug}` instead of the current flat `/salon/{slug}`), and trim the longest slugs (several sampled URLs run 85-95+ characters) where possible.
6. **[LOW]** Add explicit AI-crawler directives to `robots.txt` (e.g., explicit `Allow`/`Disallow` blocks for `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`) rather than relying solely on the wildcard `User-agent: *` rule — makes intent explicit rather than implicit, and gives Certxa a lever to differentiate AI-training crawlers from AI-answer/citation crawlers if desired later.
7. **[LOW]** Add `Cache-Control`/`ETag` headers to the homepage and other marketing HTML responses (currently absent) and add `<link rel="preload">` for the hero video/critical font weights to shave marginal LCP risk.

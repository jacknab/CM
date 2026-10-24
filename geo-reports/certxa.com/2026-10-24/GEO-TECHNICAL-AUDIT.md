## Technical Foundations — certxa.com (2026-10-24)

**Technical Score: 84/100** Good (previous 2026-10-21: 80)

Method: I crawled all 39 sitemap URLs plus 11 extra paths (/cart, /nail-salon-software, /launchsite, /hardware, /shop, /vi, /compare, …) with `curl`, sending a GPTBot user agent. I captured headers, pulled the text from the raw HTML with no JS run, checked which hidden wrappers each H1 and image sits inside, measured image and bundle sizes, followed redirects, probed 10 crawler user agents, and read the source under /apps/CM. There was no browser, so the Core Web Vitals figures are risk estimates; check them with PageSpeed Insights or CrUX.

Not reported, as instructed: `window.__CERTXA_SHOP_PRICES__` is not in the /products or /cart HTML yet, because the pm2 reload is still pending. The page renders its built-in fallback prices ($799 / $99 / $199 / $99 / $69) in the raw HTML, so crawlers still see prices.

### Fixed since 10-21 (verified live)
- **/pricing is server-rendered.** Plan names, prices, the compare table and the FAQ answer ("Starter is $29.00 a month …") are all in the raw HTML. `marketing-site.ts:320-343` puts the plans into the page during rendering.
- **The price conflict is gone.** Home, /pricing, /vietnamese-nail-salon-software, JSON-LD and llms.txt all say Solo free / $29 / $99 / $179.
- **og:image / twitter:image work.** All marketing pages now use `https://certxa.com/assets/images/og-image.jpg` (200, 20 KB, 1200×630).
- **/launchsite/ canonical fixed.** It is now `https://certxa.com/launchsite`. The page is `noindex, follow` and has been dropped from the sitemap while the catalogue is empty (`php/sitemap.php:43-55,79`).
- **Sitemap `<lastmod>` reflects real edit dates.** `php/sitemap.php:21-41` takes them from the marketing `.tsx`/`.json` source files, and pages without a source file get no date. `/sms-terms` has been added.
- **Stock-photo redirects are resized.** They now go to `…/:/rs=w:1280,m` (`marketing-site.ts:301`). On /features the waitlist photo dropped from 306 KB to 141 KB as JPEG, or 85 KB as WebP.

### Score Breakdown

| Category | Score | Weight | Weighted | Status |
|---|---|---|---|---|
| Server-Side Rendering | 90/100 | 25% | 22.5 | Good — /pricing fixed |
| Meta Tags & Indexability | 85/100 | 15% | 12.75 | Placeholder favicon, long descriptions |
| Crawlability | 90/100 | 15% | 13.5 | Good |
| Security Headers | 85/100 | 10% | 8.5 | Duplicate/conflicting headers (unchanged) |
| Core Web Vitals Risk | 58/100 | 10% | 5.8 | **Regression:** /products hero hidden until JS runs |
| Mobile Optimization | 90/100 | 10% | 9.0 | Good |
| URL Structure | 90/100 | 5% | 4.5 | Good |
| Response & Status | 85/100 | 5% | 4.25 | Good |
| Additional Checks | 72/100 | 5% | 3.6 | 2-hop chains, /videos 403 |
| **Total** | | | **84.4 ≈ 84** | |

---

### Server-Side Rendering Assessment

**Status:** LOW risk
**Rendering Type:** Hybrid. React 18 SSR (react-router static handler + react-helmet) for the 19 marketing paths; PHP server-rendering for the blog, legal pages, /data-transfer, /google-data-policy and /launchsite.
**Framework Detected:** Vite + React SSR (`artifacts/marketing`, served by `artifacts/api-server/src/marketing-site.ts`) and PHP 8 (`php/`).

Word counts from the raw HTML (no JS):

| Page | Words | Notes |
|---|---|---|
| / | 720 | Prices in copy and JSON-LD |
| /pricing | 681 | **Plans, prices, compare table and FAQ all SSR** (was "Loading pricing plans…") |
| /features | 1,571 | |
| /products | 551 | Station $799 + 4 accessories with prices, rates, FAQ, ItemList/Product JSON-LD |
| /cart | 69 | Empty cart shell, `noindex, nofollow`. Correct |
| /compare/* | 662–711 | Comparison `<table>` SSR |
| /vietnamese-nail-salon-software | 956 | |
| /vi/phan-mem-tiem-nail | 1,093 | `lang="vi"` |
| Blog posts (16) | 824–1,723 | PHP, fully server-rendered |

- **/nail-salon-software is not a page.** It returns a **301 to /vietnamese-nail-salon-software** (`marketing-site.ts:60`, in place since 10-15). See Issue M3.
- **Content only the browser sees:** the **Certxa Kiosk** card on /products appears only after hydration, and only to visitors with the `certxa_nail=1` cookie (`artifacts/marketing/src/pages/products.tsx:32-43`). That is a deliberate owner decision, so crawlers never see a kiosk. But the page `<title>`, og:title and WebPage name still say "Terminals, **Kiosks** & Card Readers" (`products.tsx:59,115,121`), and llms.txt line 12 and llms-full.txt line 1348 still list "Certxa Kiosk". See Issue L4.
- Sections lower on the page are still server-rendered with inline `opacity:0` from framer-motion (home 29, /features 145, /autumn 59, /products 25). The text is in the DOM, so text-only AI crawlers read it. The `<noscript>` override at `marketing-site.ts:341` covers clients without JS.

### Crawlability & Indexability

**Robots.txt:** Found, clean, unchanged. `User-agent: *` gets `Allow: /` with the app paths disallowed and `/api/r2/` re-allowed. 17 AI crawlers are named with identical rules, and `Content-Signal: ai-train=yes, search=yes, ai-retrieval=yes` is set. Sitemap declared. Live probe: GPTBot, OAI-SearchBot, ClaudeBot, Claude-User, PerplexityBot, Google-Extended, Googlebot, bingbot, CCBot and Applebot all get **200** on /, /products, /pricing, a blog post and /llms.txt. Still open: the robots comment says `/listings/` "now 301s", but `https://certxa.com/listings/` returns 404 (`artifacts/booking/public/robots.txt`, the comment above the AhrefsBot group).

**XML Sitemap:** Found and valid. The index lists `sitemap-pages.xml` (22 URLs) and `blog/sitemap.xml` (/blog + 16 posts). All 39 URLs return 200 with no redirects. `lastmod` dates now differ per page and are plausible (10-12 to 10-24; blog posts follow `article:modified_time`). Remaining gaps:
- The `<lastmod>` on both entries in the sitemap index is always today: `php/sitemap.php:102-103` (`{$today}`). Use the newest child date instead.
- The `/blog` entry in `blog/sitemap.xml` has no `<lastmod>`.
- No `xhtml:link` hreflang alternates in the sitemap. This is optional, because the HTML tags are correct.

**Meta Robots:** Marketing pages send no robots meta, so they are indexed by default. PHP pages send `index, follow, max-snippet:-1, max-image-preview:large…`. /cart and /order-confirmed send `noindex, nofollow`, and /launchsite sends `noindex, follow` (all correct). No X-Robots-Tag header.
**Canonical:** Self-referencing on all 39 sitemap URLs. Trailing-slash and query variants (/pricing/, /products/, /blog/, /pricing?utm_source=x) canonicalise to the URL without the slash or query.

### Meta Tags Audit

| Tag | Status | Value/Issue |
|---|---|---|
| Title | Present on all | 11 blog titles are 66–90 chars and will be cut off, because " — Certxa Blog" is appended. /careers "Careers — Certxa" (16) is thin. /products title promises "Kiosks" (see above) |
| Description | Present on all | 25 run over 160 chars, e.g. /google-data-policy 264, /vi 239, /products 218, /terms 194, /autumn 192. /careers is 85 |
| Canonical | Present | Self-referencing everywhere |
| Viewport | Present | `width=device-width, initial-scale=1.0` |
| Language | Present | `lang="en"`; `/vi/phan-mem-tiem-nail` → `lang="vi"` |
| hreflang | Correct | en ↔ vi + x-default on both pages, matching each other and including themselves |
| Open Graph | **Complete (fixed)** | og:image = `/assets/images/og-image.jpg` (200, 1200×630) |
| Twitter Card | **Complete (fixed)** | `summary_large_image`, same image |
| **Favicon** | **Wrong on 19 marketing pages** | See Issue H1 |

### Security Headers (unchanged since 10-21)

| Header | Status | Value |
|---|---|---|
| HTTPS | Yes | http→https and www→apex in one 301 hop |
| HSTS | Present | `max-age=63072000; includeSubDomains; preload` |
| CSP | Present (weak) | `'unsafe-inline' 'unsafe-eval'`; no `frame-ancestors` / `object-src` / `base-uri` |
| X-Frame-Options | Present **twice** | `SAMEORIGIN` ×2 |
| X-Content-Type-Options | Present **twice** | `nosniff` ×2 |
| Referrer-Policy | Present **twice** | `strict-origin-when-cross-origin` ×2 |
| X-XSS-Protection | **Conflicting** | `0` (app) and `1; mode=block` (nginx) |
| Permissions-Policy | Present | `camera=(), microphone=(), geolocation=(self)` |

Cause: `/etc/nginx/conf.d/certxa.conf:77-80` still adds these headers again on top of the app's own (`artifacts/api-server/src/index.ts`). Static PHP assets also send two Cache-Control headers (`max-age=31536000` + `public, immutable`), and `/llms.txt` sends `max-age=3600` + `public, max-age=3600`. Separately, every `location` that has its own `add_header` (e.g. `certxa.conf:225-226, 246-247, 257`) drops the server-level HSTS and Permissions-Policy headers for that location, because nginx does not inherit `add_header` into a block that declares its own.

### Core Web Vitals Risk Assessment

| Vital | Risk Level | Indicators Found |
|---|---|---|
| LCP | **High on /products (new)**, Medium-High on / (desktop) | **/products:** the new hero `<img src="/_site/images/products/certxa-station-hero.webp" fetchPriority="high" loading="eager">` is preloaded correctly, but sits inside `<motion.div initial={{opacity:0, y:32}}>` (`products.tsx:158-163`). It is shown at **every** viewport width (no `hidden lg:block`), so it is the likely LCP element on mobile and desktop alike. Chrome does not count an `opacity:0` element as painted, so LCP waits for the 364 KB-gzip bundle to download and hydrate, then the 0.15 s delay and 0.7 s fade. The file itself is fine: 47 KB WebP, 1536×1024. **Home:** the desktop hero has the same problem (`index.tsx:227-241`, `initial={{opacity:0, scale:1.03}}`, still open from 10-21) and is a 208 KB 2560 px JPEG with no srcset or WebP. **About:** founder photo, same pattern. **All marketing pages:** `/_site/logo.png` (46 KB PNG, 679×144, shown 36 px tall) is `<link rel="preload" as="image">`'d on every page and competes with the hero. Google Fonts load through CSS `@import` (`artifacts/marketing/src/styles/globals.css:1`) with no preconnect, so the CSS waits on two more round-trips |
| INP | **Medium-High** | Entry bundle `/_site/assets/index-BUbvk7iE.js` = **1.28 MB raw / 364 KB gzip** (was 1.26 MB / 357 KB on 10-21) on every marketing page. `src/routes.tsx` has 28 static imports and no `React.lazy`. `manualChunks` (`vite.config.ts:472`) leaves `radix-ui` at 96 bytes and `react-vendor` at 3.9 KB, so almost everything is in the entry file. framer-motion runs on 25–145 nodes per page |
| CLS | Low | Every `<img>` has width/height. Animations use opacity/transform only. Font swap may cause minor reflow |

Note: This is a static HTML analysis. Validate with PageSpeed Insights or CrUX data for field measurements.

**Images:** The /products images are local WebP files (hero 47 KB, accessories 7–28 KB, lazy-loaded). The stock photos on home and /features (12 on /features) still **302** to `img1.wsimg.com`, now resized to 1280 px. That is about 60–85 KB as WebP and 104–141 KB as JPEG, for a 700×525 slot. Each one costs an extra DNS/TLS round-trip because there is no `preconnect` to `img1.wsimg.com`. The redirect is cached for only 1 h and is a 302. All images have descriptive `alt`. `/_site/` public files (logo, product images) are cached for 1 h only (`marketing-site.ts:280`).

### Mobile Optimization

**Status:** Optimized
The viewport tag is correct on every page. Layouts use Tailwind's responsive classes with flex and grid. The /products hero uses `w-full h-auto`. I found no fixed-width overflow. The home hero is hidden on mobile, which helps mobile LCP on /. /products does not have that protection (see the LCP row above).

### URL Structure

**Target URL:** `https://certxa.com/`
**Assessment:** Clean
URLs are lowercase, hyphenated and at most 2 levels deep. Trailing-slash variants return 200 with a canonical (a 301 would be cleaner). Unknown paths return a real **404** with `noindex`: /hardware, /shop, /checkout, /compare, /vi, /barber-shop-software, /compare/certxa-vs-nobody, /blog/not-real-xyz and /vi/xyz all checked.

### Additional Checks

- **2-hop redirect chains (still open):** `/checkin` → `/checkin-kiosk` → `/features` (`php/checkin/default.php:5`), and `/pro.php` → `/overview` → `/` (`php/pro.php:8`).
- `/videos` → 301 `/videos/` → **403** (still open).
- `/templates/` → 301 `/launchsite/`, which is now harmless because its canonical is right. Pointing it at `/launchsite` would save a duplicate URL.
- `/index.html` → 200 booking-SPA shell "Certxa - Online Booking Service" with `index, follow` (canonical → `/`). `/PRICING`, `/payroll` and `/nail` → 200 SPA shell with `noindex, nofollow`. Low.
- `/certxa-vs-square` (legacy-style address) → 404, while its three siblings 301 into `/compare/*` (`marketing-site.ts:81-84`). Add `"/certxa-vs-square": "/compare/certxa-vs-square"` for consistency.
- **Structured data:** JSON-LD parses on all 39 pages (Organization, WebSite, SoftwareApplication, WebPage, FAQPage, ItemList/Product with Offer prices on /products, BlogPosting on posts).
- **Pricing data conflict (content, needs an owner decision):** the /pricing plan cards and compare table come from the admin plans API. They give **Starter no AI receptionist**, Professional 100 calls and Enterprise 200 calls. The FAQ on the same page, plus /autumn, llms.txt and the changelog, say "20 on Solo, **50 on Starter**, 100 on Professional" (`artifacts/marketing/src/pages/pricing.tsx:413`, `content/pages/autumn.json:211,220`, `artifacts/booking/public/llms.txt:11`). AI answer engines will get two different allowances from the same page.
- **Response:** HTTP/2, gzip (no brotli). TTFB 73–126 ms on every page, including /pricing and /products, which load prices on the server. Marketing HTML is `no-cache` + ETag. PHP HTML pages still send no Cache-Control or ETag. HTML sizes are 10–80 KB.

### Agent-Readiness Signals (non-scoring)

#### RFC 8288 Link Headers (Service Discovery)
**Status:** Not Applicable. There are no `Link:` headers, and this is not an API-first site.

#### Markdown Content Negotiation
**Status:** Not Supported
**Test:** GET https://certxa.com/ with `Accept: text/markdown`
**Response Content-Type:** `text/html; charset=utf-8`
This is forward-looking only. The site runs on nginx + Express, not Cloudflare, so support would be a small Express middleware. `/llms.txt` and `/llms-full.txt` already exist; llms.txt still lists `/launchsite` (noindexed, empty catalogue) at line 14.

---

### Issues by Severity

#### HIGH
**H1. Placeholder "V3" favicon on every marketing page, including the home page.**
- **Evidence:** `<link rel="icon" href="/_site/favicon.ico">` serves a 236-byte **SVG** of a purple square with the text "V3". It is sent as `image/vnd.microsoft.icon`. Google picks the SERP favicon from the home page, so search results show this placeholder instead of the Certxa "C". The PHP pages use the real `/favicon.svg` (plum "C"), and `/favicon.ico` (15 KB) also exists.
- **Cause:** the file was copied from the export at `artifacts/marketing/public/favicon.ico` (since 10-12, commit 584780a3) and is linked from `artifacts/marketing/index.html:17`. It was there before 10-21; this audit is the first to report it.
- **Fix:** replace `public/favicon.ico` with the real icon, or point `index.html:17` at `/favicon.svg` (type `image/svg+xml`) plus `/favicon.ico`, and add `apple-touch-icon`. Then rebuild the marketing app.

**H2. Regression today: the /products hero, the likely LCP element, is hidden until JS runs.**
- **Evidence:** the hero wrapper is server-rendered with `style="opacity:0;transform:translateY(32px)"`. That cancels the benefit of `fetchPriority="high"` and the preload.
- **Cause:** `artifacts/marketing/src/pages/products.tsx:158-163`.
- **Fix:** render the image wrapper as a plain `<div>`, or use `initial={false}`, or animate `y` only and never opacity. Keep the fade on the copy below it if wanted.

#### MEDIUM
**M1. Home hero (desktop) and About founder photo are still hidden until JS runs.**
- **Cause:** `index.tsx:227-241`, and the equivalent wrapper in `about.tsx`.
- **Fix:** same as H2. Also serve a 1200 px WebP/AVIF of `pages__home__hero` (208 KB JPEG today) with `srcset`.

**M2. Marketing JS: 364 KB gzip on every page, up 7 KB since 10-21.**
- **Fix:** `React.lazy` the routes in `src/routes.tsx`, and make `manualChunks` (`vite.config.ts:472`) actually split react-dom, the router, framer-motion and the cart/Stripe code.

**M3. `/nail-salon-software` 301s to the Vietnamese-niche page.**
- **Cause:** `marketing-site.ts:60`.
- **Why it matters:** the generic head-term URL ("nail salon software", formerly titled "Nail Salon Booking Software | Certxa") now passes its standing to a page aimed at Vietnamese-owned salons. That page's H1 is "Nail salon software built for Vietnamese-owned salons", so it is a weaker match for the broad query. Not a regression (in place since 10-15).
- **Fix:** confirm this is intended. Otherwise give the generic term its own page, or redirect it to `/features` or `/`.

**M4. Duplicate and conflicting security headers.**
- **Fix:** delete `/etc/nginx/conf.d/certxa.conf:77-80` and keep the app as the only source. Then run `nginx -t && systemctl reload nginx`; this is the user's call, since it is server config. Later, tighten the CSP: drop `'unsafe-eval'` and add `frame-ancestors 'self'; object-src 'none'; base-uri 'self'`.

**M5. Stock-photo redirects: no preconnect, 302 cached 1 h, sized at 1280 px for 700 px slots.**
- **Cause:** `marketing-site.ts:298-302`.
- **Fix:** request `rs=w:700,h:525,cg:true,m/cr=w:700,h:525/qt=q:75` sized to the slot, use a 301/308 with a longer max-age, and add `<link rel="preconnect" href="https://img1.wsimg.com">`.

#### LOW
**L1. Fonts: CSS `@import` of Google Fonts with no preconnect.**
- **Cause:** `globals.css:1`.
- **Fix:** move to `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html`, or self-host the fonts.

**L2. Logo is a 46 KB PNG preloaded on every page.**
- **Fix:** serve an SVG or a roughly 340×72 WebP, and drop the preload.

**L3. Sitemap index `<lastmod>` is always today, and /blog has no `<lastmod>`.**
- **Cause:** `php/sitemap.php:102-103`.

**L4. /products title, og:title and llms.txt still promise "Kiosks" / "Certxa Kiosk", which crawlers never see.**
- **Fix:** retitle (e.g. "Salon POS Hardware — Certxa Station, Card Reader & Accessories") at `products.tsx:59,115,121`. Edit `artifacts/booking/public/llms.txt:12` and `llms-full.txt:1348`. Also drop the `/launchsite` entry (`llms.txt:14`) while that page is noindexed.

**L5. Autumn call allowance conflict between the /pricing plan cards (API) and the FAQ, /autumn and llms.txt.**
- **Fix:** an owner decision; then align `pricing.tsx:413`, `autumn.json:211,220` and `llms.txt:11` with the admin plans.

**L6. Redirect clean-up.**
- Collapse `php/checkin/default.php:5` and `php/pro.php:8` to one hop each.
- Fix `/videos` 403.
- Add `/certxa-vs-square` to `MOVED`.
- Fix the robots.txt `/listings/` comment.

**L7. Titles and descriptions.**
- Trim the " — Certxa Blog" suffix.
- Shorten the 25 descriptions over 160 chars.
- Expand the /careers title and description.
- Add Cache-Control/ETag to PHP HTML responses.
- Raise `/_site/` public-file caching above 1 h (`marketing-site.ts:280`), or hash those filenames.

### Priority Actions

1. **[HIGH]** Replace the "V3" placeholder favicon on the marketing pages (`artifacts/marketing/public/favicon.ico`, `index.html:17`).
2. **[HIGH]** Stop hiding the /products hero until JS runs (`products.tsx:158-163`). Do the same for the home and About heroes.
3. **[MEDIUM]** Split the 364 KB-gzip marketing bundle (`routes.tsx` lazy routes, `vite.config.ts:472`).
4. **[MEDIUM]** Decide on `/nail-salon-software` → Vietnamese page (`marketing-site.ts:60`).
5. **[MEDIUM]** Remove the duplicate headers in nginx (`certxa.conf:77-80`), then tighten the CSP.
6. **[MEDIUM]** Size the stock photos to their slots, preconnect to `img1.wsimg.com`, and make the redirect 301.
7. **[LOW]** Align the /products title and llms.txt with what crawlers can see; settle the Autumn Starter allowance; tidy the redirect chains, sitemap index dates and long descriptions.

### Regressions since 10-21
- **/products LCP:** the new hero image is hidden until JS runs (`products.tsx:158-163`). It is visible at every viewport width, so mobile is affected too.
- **Bundle growth:** the marketing entry bundle grew 1.26 MB to 1.28 MB raw (357 KB to 364 KB gzip).
- **"Kiosks" wording:** /products title, og:title and llms.txt still say "Kiosks", but since today's change the kiosk card is shown only in the browser to visitors with the nail cookie, so crawlers never see it.

No status-code, canonical, robots or SSR regressions were found.

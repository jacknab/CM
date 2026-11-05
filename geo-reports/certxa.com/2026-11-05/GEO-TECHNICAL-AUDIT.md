## Technical Foundations — certxa.com (2026-11-05)

**Technical Score: 85/100** Good (previous 2026-10-24: 84)

Method: I used the 46-URL crawl already collected (raw HTML, headers, page data) and added live `curl` probes: 13 crawler user agents across 7 paths, about 45 garbage/legacy paths, asset sizes, redirects, every URL in llms.txt and llms-full.txt, the directory's sitemaps, and `salons.certxa.com`. I also read the source and nginx config (read-only). There was no browser, so Core Web Vitals are risk estimates; confirm them with PageSpeed Insights or CrUX.

The curl probes ran **on the origin server itself** (certxa.com resolves to this box's IP), so the 76–139 ms TTFB shows server processing only, not network time. nginx saw no real remote client, and the rate limits were not tested.

No site code, nginx or deploy was touched. One log entry was added to `pre-errors.md`, as the project rules require.

### What changed since 10-24

| 10-24 item | Status now | Evidence |
|---|---|---|
| Duplicate security headers (`certxa.conf:77-80`) | **Fixed** | Each header appears once. `X-XSS-Protection` is only `0`. nginx now adds only HSTS and Permissions-Policy at server level (`certxa.conf:76-77`) |
| "V3" placeholder favicon | **Fixed** | `/_site/favicon.ico` is a real 15 KB ICO; `/_site/favicon.svg` also exists. Still no `apple-touch-icon` |
| /products hero hidden until JS | **Fixed** | Wrapper is now `opacity:1;transform:none` |
| Home and About heroes hidden until JS | **Fixed** | Same |
| /products title promised "Kiosks" | **Fixed** | "Salon POS Hardware — Certxa \| POS Terminal, Card Reader & Accessories". llms.txt no longer lists Certxa Kiosk |
| Logo: 46 KB PNG preload | **Partly fixed** | Now a 15.6 KB WebP, but reached through a `302` with `no-store` |
| 1.28 MB JS bundle | **Open, worse** | `index-DX8GEwGt.js` is **1,315,291 bytes raw / 373,101 gzip** (was 1.28 MB / 364 KB). `routes.tsx` has no `lazy()`; `radix-ui` chunk is 96 bytes |
| Home hero 2560 px JPEG, no WebP | **Open, worse** | Still 2560×1707, 208,443 bytes, no `srcset`. Now also `no-store` and preloaded on mobile (see H2, H3) |
| Sitemap index lastmod always today | **Open** | `php/sitemap.php:107-108` uses `{$today}` |
| `/blog` no lastmod in blog sitemap | **Open** | 16 of 17 URLs have one |
| Stock photos 302, no preconnect, 1280 px for 700 px slots | **Open** | The redirect is now `no-store` rather than cached |
| Fonts `@import`, no preconnect | **Open** | `globals.css:1` |
| 2-hop chains, `/videos` 403, `/certxa-vs-square` 404, `/listings/` comment | **Open** | All re-checked; see L-items |
| HSTS dropped where a `location` has its own `add_header` | **Open** | /llms.txt, /robots.txt and /assets/* have 0 HSTS and 2 Cache-Control headers |
| 23 descriptions over 160 chars, 22 titles over 60 | **Open** | Blog titles reach 90 chars; /google-data-policy description 264 |

New this audit (none are confirmed regressions except where stated):
- Retired PHP pages with **old prices** answer on every `*.certxa.com` subdomain (H1).
- Marketing images are `no-store` (H2). This shipped in commit `c6cfdab5`, 10-28.
- Home hero preload wastes 208 KB on mobile (H3).
- Directory nav links 404 (M1).
- API CORS reflects any origin with credentials (M2).

### Score Breakdown

| Category | Score | Weight | Weighted | Status |
|---|---|---|---|---|
| Server-Side Rendering | 92/100 | 25% | 23.0 | Good |
| Meta Tags & Indexability | 86/100 | 15% | 12.9 | Favicon fixed; stale pages indexable on subdomains |
| Crawlability | 86/100 | 15% | 12.9 | Robots clean; dead directory links |
| Security Headers | 84/100 | 10% | 8.4 | Duplicates fixed; CORS newly found |
| Core Web Vitals Risk | 70/100 | 10% | 7.0 | Up from 58: heroes visible. Bundle and image caching remain |
| Mobile Optimization | 90/100 | 10% | 9.0 | Good |
| URL Structure | 90/100 | 5% | 4.5 | Good |
| Response & Status | 85/100 | 5% | 4.25 | Real 404s; gzip only |
| Additional Checks | 68/100 | 5% | 3.4 | Open redirect chains, subdomain mirror |
| **Total** | | | **84.95 ≈ 85** | |

### Server-Side Rendering Assessment

**Status:** LOW risk
**Rendering Type:** Hybrid. React SSR for marketing paths, PHP for blog and legal pages.
**Framework Detected:** Vite + React SSR (`artifacts/marketing`, `artifacts/api-server/src/marketing-site.ts`) and PHP 8 (`php/`).

Raw-HTML word counts: / 734, /pricing 690, /features 1,596, /autumn 1,461, /products 583, /nail-salon-turn-system 1,452, /vi/chia-tua-tiem-nail 1,603, /compare/* 676–726, blog posts 756–1,729, /privacy 2,928, /terms 3,481. /pricing shows Starter $29, Professional $99, Enterprise $179 in raw HTML.

framer-motion still emits inline `opacity:0` on content below the hero (home 28, /features 146, /autumn 59, /products 24, /pricing 24, /about 10). The text is in the DOM, so text-only crawlers read it. A `<noscript>` override covers clients with no JS.

### Crawlability & Indexability

**Robots.txt:** Found and clean. `Allow: /`, 17 AI crawlers named with the same rules as `*`, Content-Signal set, sitemap declared. Internal paths disallowed, as intended.

**AI crawler probe:** GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Googlebot, bingbot, CCBot, Applebot and Bytespider all got 200 on /, /pricing, /blog, a post, /privacy, /llms.txt and /salons (following redirects).

**XML Sitemap:** Found and valid: index → `sitemap-pages.xml` (24 URLs) + `blog/sitemap.xml` (17). All crawled sitemap URLs return 200 with no redirects. `/sitemap_index.xml` is 404, which is harmless because robots names `/sitemap.xml`.

**llms links:** all 48 certxa URLs in llms.txt and llms-full.txt return 200 except `/mcp`, which correctly answers GET with 405 (it is a POST endpoint). `llms.txt:16` still lists `/launchsite`, which is `noindex, follow`.

**Meta Robots:** marketing pages have none (indexed by default); PHP pages send `index, follow…`; /cart, /order-confirmed and /pro-plus send `noindex, nofollow`. /launchsite sends `noindex, follow`.

**Canonical:** self-referencing on all sitemap URLs. `/pricing/`, `/blog/`, `/products/` and `?utm_source=x` return 200 and canonicalise to the clean URL. `/pro-plus` canonicalises to `/` with noindex; harmless.

### Requested verifications

**/nail-salon-software → /vietnamese-nail-salon-software: confirmed.** One-hop 301 (relative Location), `marketing-site.ts:66`, no internal links point at the old URL, not in sitemap. Target H1 is "Nail salon software built for Vietnamese-owned salons". So the head term "nail salon software" has **no dedicated page**. See M3.

**/salons → salons.certxa.com/salons, noindex, follow: confirmed.** One-hop 301. `/salons/california` is also `noindex, follow`. The directory sitemap holds **1 URL** in `sitemap-salons.xml` (indexable, 200) and 0 in `sitemap-listings.xml`. This fits the intended rule that unclaimed listings stay noindex and geo pages need 3+ booking salons (llms.txt line 64). Two points to note: no marketing page links to the directory, and the apex robots.txt rules for scrapers under `/salons/` no longer do anything there, because those paths 301 away. The subdomain's own robots.txt carries them.

**Legacy template: confirmed.** blog, posts, privacy, terms, data-transfer, google-data-policy and sms-terms all use the PHP layout (`php/includes/header.php`). Differences that matter:

| | Marketing (React) | Legacy (PHP) |
|---|---|---|
| Fonts | Plus Jakarta Sans, Inter | Cormorant Garamond, Fraunces and others |
| CSS / JS | 12 KB gzip CSS + 373 KB JS | 16 KB gzip CSS, 2 KB main.js, 7 KB live chat |
| Live chat | Not in raw HTML | Yes |
| Favicon | `/_site/favicon.*` | `/favicon.svg` |
| HTML caching | `no-cache` + ETag | **No Cache-Control, no ETag** |
| Nav | Header + footer | Mega menu. Links `/launchsite` (noindex) and `/staff-auth`; **no `/products`, `/compare/certxa-vs-square`, `/nail-salon-turn-system`, or `/vi/*`** |
| Footer | **No `/sms-terms` link** | Has it |

The entity graph is consistent: both use `https://certxa.com/#organization` and the same `@id`s. Effect is on internal linking and brand consistency, not on crawling. See M4.

### Meta Tags Audit

| Tag | Status | Value/Issue |
|---|---|---|
| Title | Present on all | 22 over 60 chars; the " — Certxa Blog" suffix cuts blog titles; /careers is 16 chars |
| Description | Present on all | 23 over 160 chars (/google-data-policy 264, /vi/phan-mem-tiem-nail 239, /products 227) |
| Canonical | Present | Self-referencing |
| Viewport | Present | Correct |
| Language | Present | `lang="en"`; vi pages `lang="vi"` |
| hreflang | Correct | en/vi/x-default on both pairs |
| Open Graph | Complete | `og-image.jpg`, 1200×630, 20 KB |
| Twitter Card | Complete | `summary_large_image` |

### Security Headers

| Header | Status | Value |
|---|---|---|
| HTTPS | Yes | http and www both 301 to the apex in one hop |
| HSTS | Present | `max-age=63072000; includeSubDomains; preload`; absent on /llms.txt, /robots.txt, /assets/* |
| CSP | Present (weak) | `'unsafe-inline' 'unsafe-eval'`; no `frame-ancestors`, `object-src`, `base-uri` |
| X-Frame-Options | Present, single | `SAMEORIGIN` |
| X-Content-Type-Options | Present, single | `nosniff` |
| Referrer-Policy | Present, single | `strict-origin-when-cross-origin` |
| Permissions-Policy | Present | `camera=(), microphone=(), geolocation=(self)` |

### Core Web Vitals Risk Assessment

| Vital | Risk Level | Indicators Found |
|---|---|---|
| LCP | Medium | Heroes no longer wait for JS. Remaining: 2560 px JPEG and 105 KB founder JPEG with `no-store`, logo behind a redirect, render-blocking Google Fonts `@import`, no preconnect |
| INP | Medium-High | 1.32 MB raw / 373 KB gzip entry bundle on every marketing page |
| CLS | Low | Images have width/height |

Note: This is a static HTML analysis. Validate with PageSpeed Insights or CrUX data for field measurements.

**Images:** Stock photos on home and /features 302 to `img1.wsimg.com` at 1280 px (38–85 KB WebP) for 700×525 slots. Only 1 home image is above the fold and the rest are `loading="lazy"`. All have `alt`.

### Mobile Optimization

**Status:** Optimized, with one waste. Viewport is correct on all pages and the layout is responsive, but see H3.

### URL Structure

**Target URL:** `https://certxa.com/`
**Assessment:** Clean. Lowercase, hyphenated, at most 2 levels deep.

### 404 behaviour

Garbage paths return real **404 + noindex**: /asdf-garbage-xyz, /Asdf, /a/b/c, /blog/garbage-xyz, /blog/x/y, /compare/garbage, /vi/garbage, /some-salon-slug-xyz, /wp-admin, /.env, /.git/config. `/foo.php` is a bare 404. App paths are soft: /nail/xxx, /book/xxx and /PRICING return 200 SPA shell with `noindex, nofollow` (Low). Listing the crawled guesses: /solo and /nail-salon-pos are 404 and nothing links to them.

### Additional Checks

- JSON-LD parses on every crawled page (0 bad blocks).
- Compression: gzip only, no brotli.
- `/_site/` public files cached only 1 h (`marketing-site.ts:286`).

### Agent-Readiness Signals (non-scoring)

#### RFC 8288 Link Headers (Service Discovery)

**Status:** Not Applicable. No `Link:` headers and not an API-first site. Certxa does run a public MCP server at /mcp, which llms.txt describes; a `Link` header or `/.well-known` entry could advertise it later.

#### Markdown Content Negotiation

**Status:** Not Supported
**Test:** GET https://certxa.com/ with `Accept: text/markdown`
**Response Content-Type:** `text/html; charset=utf-8`
Forward-looking only. The site is nginx + Express, so this would be a small middleware.

---

### Issues by Severity

#### HIGH

**H1. Retired PHP pages with old prices are live and `index, follow` on every subdomain.**
- **Evidence:** `https://salons.certxa.com/pricing` returns 200 and shows "Professional From $18/mo", "Elite From $39/mo" and "50 on Professional and 100 on Elite", while the same page's JSON-LD says 29/99. `https://zz-nonexistent-xyz.certxa.com/pricing` returns the same page, so all wildcard hosts do. `/booth-renters` and `/solo-professionals` also answer 200 on the subdomain, though the apex 301s them, and their canonicals point at the redirecting apex URLs. `/blog` and `/privacy` are mirrored too.
- **Discovery:** the directory footer links to `/solo-professionals` and `/booth-renters` on `salons.certxa.com`, so crawlers reach them.
- **Mitigation:** canonicals point to the apex, so Google will likely fold them in. AI retrievers may not, and could quote $18/$39.
- **Cause:** `marketing-site.ts:331` handles only `APEX_HOSTS`; other hosts fall through to PHP. Wildcard server: `aaa-wildcard.certxa.conf`.
- **Fix:** on non-apex hosts, 301 marketing and legacy paths to the apex.

**H2. Marketing images are `no-store`, so heroes re-download on every view.**
- **Evidence:** `/airo-assets/images/pages/home/hero` (208 KB), `team/thanh-lam-founder` (105 KB) and every 302 for logo and stock photos send `cache-control: no-store`. The logo redirect is preloaded on every page, so each navigation repeats it.
- **Cause:** `marketing-site.ts:294`, set for all branches; commit `c6cfdab5` (10-28).
- **Fix:** keep `no-store` only on the 503 branch if needed. Use a long or revalidated cache for `sendFile` and a short cache for redirects.

**H3. Home hero downloads on mobile though it is hidden.**
- **Evidence:** `<link rel="preload" as="image" href="/airo-assets/images/pages/home/hero" fetchPriority="high"/>` has no `media`, and the `<img>` is `loading="eager"` inside `hidden lg:block` (`artifacts/marketing/src/pages/index.tsx:238`). Phones spend 208 KB on an image they never show, competing with the real mobile LCP. This overturns the 10-24 note that hiding it helped mobile.
- **Fix:** a 1200 px WebP with `srcset`, and a `media="(min-width:1024px)"` preload.

#### MEDIUM

**M1. Directory nav and footer have dead links on every directory page.**
- **Evidence:** on `salons.certxa.com`, `/for-business` (header "For salons", footer "List your salon"), `/saved` and `/search` all return 404. Footer spotlight `/t-and-t-nail-salon-spa-…-xGHOJW` returns 410. `/overview` ("Certxa software for your salon") 301s back to the directory rather than the software site.
- **Cause:** `artifacts/marketplace/src/App.tsx:106,108,128,130,139`.

**M2. API reflects any Origin with credentials (security, outside GEO scoring proper).**
- **Evidence:** `Origin: https://evil.example` on `/`, `/api/health`, `/api/auth/user` and a preflight to `/api/auth/login` returns `access-control-allow-origin: https://evil.example` and `access-control-allow-credentials: true`.
- **Cause:** `CORS_ALLOW_ALL` is set in `/etc/certxa.env`, used at `artifacts/api-server/src/index.ts:211,297`.
- **Mitigation:** session cookies are `SameSite=Lax` (`auth.ts:140`), so cross-site `fetch` should not carry them. Not exploited or tested beyond these headers.
- **Fix:** owner decision; remove the flag and rely on the existing allow-list and subdomain rules.

**M3. No dedicated page for "nail salon software".**
- `marketing-site.ts:66` sends the head term to a Vietnamese-niche page. Not a regression (since 10-15). Owner decision: give it its own page, or redirect to `/features` or `/`.

**M4. Two templates split internal linking.**
- Legacy nav omits `/products`, `/nail-salon-turn-system` and `/vi/*`, so 17 blog pages pass nothing to those; marketing footer omits `/sms-terms`. Align nav and footer. Dropping `/launchsite` from the nav while it is noindexed would help too.

**M5. Marketing JS: 373 KB gzip on every page, up 9 KB.**
- `src/routes.tsx` static imports; `manualChunks` at `vite.config.ts:472` does not split in practice.

**M6. Stock-photo redirects:** resize to the slot, add `preconnect` to `img1.wsimg.com`, make cacheable (`marketing-site.ts`, see 10-24 M5).

#### LOW

- **L1.** Sitemap index lastmod is always today (`php/sitemap.php:107-108`); /blog has none.
- **L2.** Fonts `@import` with no preconnect (`globals.css:1`).
- **L3.** Static files: HSTS dropped and double Cache-Control on /llms.txt, /robots.txt, /assets/*.
- **L4.** Redirects: `/checkin` → `/checkin-kiosk` → `/features` (`php/checkin/default.php:5`); `/pro.php` → `/overview` → `/` (`php/pro.php:8`); `/videos` → `/videos/` → 403; `/templates/` → `/launchsite/`; `/certxa-vs-square` 404.
- **L5.** robots.txt line 101 says `/listings/` "now 301s" but it returns 404.
- **L6.** `llms.txt:16` lists noindexed `/launchsite`.
- **L7.** Shorten 22 titles and 23 descriptions; PHP HTML has no Cache-Control/ETag; `/_site/` public files cached 1 h; no brotli; no `apple-touch-icon`.
- **L8.** CSP: drop `'unsafe-eval'`, add `frame-ancestors`, `object-src`, `base-uri`.

### Priority Actions

1. **[HIGH]** Redirect non-apex marketing and legacy paths to the apex (`marketing-site.ts:331`) so the $18/$39 page stops answering.
2. **[HIGH]** Remove blanket `no-store` from images (`marketing-site.ts:294`).
3. **[HIGH]** Serve a resized hero and a desktop-only preload (`index.tsx:238`).
4. **[MEDIUM]** Fix directory dead links (`marketplace/src/App.tsx`).
5. **[MEDIUM]** Decide on `CORS_ALLOW_ALL` and on `/nail-salon-software`.
6. **[MEDIUM]** Align legacy nav and footer; split the bundle.
7. **[LOW]** Clear the L-items.

No SSR, canonical, robots or status-code regressions on the apex were found.

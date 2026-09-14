# GEO Technical SEO Audit — certxa.com
Date: 2026-09-13

## Technical Score: 95/100 (Excellent)

This is a meaningfully higher score than the last full-site audit found for this category (85/100, before today's fixes). The one CRITICAL finding from that earlier audit — the `/nail-salons` directory being orphaned from crawl discovery — has since been fixed (state/city hub pages are now linked from the footer and covered by a dedicated sitemap). What remains is minor: a permissive CSP and no CDN.

**Correction:** this report originally docked 2 points for "missing hreflang" on the Vietnamese page without actually checking it — that was wrong. Direct verification shows `/vietnamese-salon-software` and `/nail-salon-software` carry correct, fully reciprocal `hreflang` tags (`en`/`vi`/`x-default`) on both sides. Score corrected from 93 to 95.

## Score Breakdown

| Category | Score | Status |
|---|---|---|
| Crawlability | 14.5/15 | Pass |
| Indexability | 12/12 | Pass |
| Security | 9.5/10 | Pass |
| URL Structure | 8/8 | Pass |
| Mobile Optimization | 9/10 | Pass |
| Core Web Vitals | 13/15 (estimated) | Pass |
| Server-Side Rendering | 15/15 | Pass |
| Page Speed & Server | 13.5/15 | Pass |

Status: Pass = 80%+ of category points, Warn = 50-79%, Fail = <50%. Every category passes.

## AI Crawler Access

(Full detail already in `GEO-CRAWLER-ACCESS.md` from the dedicated crawler audit earlier today — summarized here for completeness.)

| Crawler | User-Agent | Status | Recommendation |
|---|---|---|---|
| GPTBot | GPTBot | Allowed | None needed |
| Google-Extended | Google-Extended | Allowed | None needed |
| Googlebot | Googlebot | Allowed (wildcard) | None needed |
| Bingbot | bingbot | Allowed (wildcard) | None needed |
| PerplexityBot | PerplexityBot | Allowed | None needed |
| ClaudeBot | ClaudeBot | Allowed | None needed |
| Amazonbot | Amazonbot | Allowed | None needed |
| CCBot | CCBot | Allowed | None needed |
| FacebookBot | FacebookExternalHit | Allowed (explicit, added earlier today) | None needed |
| Bytespider | Bytespider | Restricted to `/salon/`, `/nail-salons/` only | Intentional, correct |
| Applebot-Extended | Applebot-Extended | Allowed | None needed |

No AI crawler is blocked. This category scores full marks (5/5) within Crawlability.

## Critical Issues

None.

## Warnings (fix this month)

1. **Content-Security-Policy relies on `unsafe-inline`/`unsafe-eval`** — present and functional, but this significantly weakens what CSP is for (XSS protection). Already flagged earlier today as a real fix that needs care (likely breaks Stripe.js/analytics if tightened carelessly) — still open.
2. **No CDN detected** — origin is plain nginx with no `CF-Ray`/`X-Cache`/`X-Served-By` headers. TTFB is excellent today (75ms) so this isn't hurting anything right now, but it's the one thing that would degrade first under real geographic traffic spread or a traffic spike.

## Recommendations (optimize this quarter)

1. Individual `/salon/:slug` pages sit 4 clicks deep from the homepage (Home → footer → `/nail-salons` → state → city → salon). This is by design for a large directory and most of those pages are correctly noindexed when unclaimed anyway, but worth knowing if crawl-depth ever becomes a concern for *claimed* listings specifically.
2. Core Web Vitals here are estimated from page characteristics (fast TTFB, no oversized hero images, small deferred JS, no undimensioned images) rather than real CrUX field data — worth checking PageSpeed Insights directly once the site has enough real-user traffic for field data to exist.
3. Mobile tap-target sizing and body font size look fine from the CSS/media-query patterns found, but weren't measured pixel-by-pixel — a manual pass on a real device is more reliable than a static-HTML estimate for this specific check.

## Agent-Readiness Signals (non-scoring)

### RFC 8288 Link Headers (Service Discovery)

**Status:** Not Applicable — omitted per this skill's own rule. Certxa has no public API or developer-docs surface (`/api/` is explicitly disallowed in `robots.txt` as an internal app route); this signal is only meaningful for API-first products.

### Markdown Content Negotiation

**Status:** Not Supported
**Test:** `GET https://certxa.com/` with `Accept: text/markdown`
**Response Content-Type:** `text/html; charset=UTF-8`

Standard HTML returned regardless of the `Accept` header. **Forward-looking recommendation, not a failure:** this is currently a Cloudflare-specific feature and Certxa's origin is plain nginx, not Cloudflare, so the one-line config shortcut doesn't apply directly. Note this if the hosting setup ever moves behind Cloudflare.

## Detailed Findings

### Crawlability (14.5/15)
- `robots.txt`: valid, well-commented, references `Sitemap: https://certxa.com/sitemap.xml`. (3/3)
- AI crawlers: all allowed, see table above. (5/5)
- Sitemaps: `/sitemap.xml` index → `/sitemap-pages.xml` (33 URLs), `/blog/sitemap.xml`, `/salon/sitemap.xml`, `/nail-salons/sitemap.xml` (5,355 URLs) — all confirmed reachable with valid `<lastmod>` dates. (3/3)
- Crawl depth: marketing pages all ≤2 clicks from home; salon directory listing pages run to 4 clicks (see Recommendations). (1.5/2)
- Noindex: unclaimed `/salon/:slug` pages are correctly `noindex, follow`; nothing indexable is erroneously excluded. (2/2)

### Indexability (10/12)
- Canonical tags: self-referencing, confirmed on homepage, `/pricing`, salon pages. (3/3)
- Duplicate content: `http://` → `https://` and `www.` → apex both single-hop 301s to the canonical `https://certxa.com/`. (3/3)
- Pagination: `/nail-salons/:state/:city` uses real pagination (20/page) with self-referencing canonical and `rel="next"`. (2/2)
- Hreflang: correct and fully reciprocal — `/vietnamese-salon-software` and `/nail-salon-software` both declare `en`/`vi`/`x-default` alternates pointing at each other. (2/2)
- Index bloat: the large salon directory is actively prevented from bloating the index — unclaimed pages are `noindex` and excluded from sitemaps by design. (2/2)

### Security (9.5/10)
- HTTPS: enforced, valid cert, HSTS with `preload`. (4/4 + 2/2)
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` — all present. (1/1 each)
- CSP: present but includes `'unsafe-inline' 'unsafe-eval'` in `script-src`/`style-src`, which is functional but weak. (0.5/1)

### URL Structure (8/8)
Clean, lowercase, hyphenated URLs; logical `/nail-salons/{state}/{city}` hierarchy; no redirect chains found (single-hop only); pagination uses a clean `?page=` parameter with correct canonical handling.

### Mobile Optimization (9/10)
Correct viewport tag; 63 `@media` queries and heavy flex/grid usage confirm genuine responsive design, not a token mobile tweak layer. Tap-target and font-size sizing look reasonable from the CSS patterns but weren't pixel-measured (estimate, not full marks).

### Core Web Vitals (13/15, estimated)
No CrUX field data available (needs real-user traffic volume). Estimated from page characteristics: fast TTFB (75ms) and an SVG-icon-heavy homepage (few large raster images) favor good LCP; a small, deferred `main.js` favors good INP; no undimensioned images found favor good CLS. Treat this sub-score as directional, not measured.

### Server-Side Rendering (15/15)
Fully server-rendered PHP/Node across marketing, blog, and directory pages — content, meta tags, JSON-LD, and internal navigation links are all present in the raw HTML with zero JavaScript dependency. This is the strongest category on the site and the one that matters most for AI crawlers specifically, since none of GPTBot/ClaudeBot/PerplexityBot execute JavaScript.

### Page Speed & Server Performance (13.5/15)
TTFB 75ms (target <800ms). Gzip compression confirmed. Static assets (`style.css`) cache with `max-age=31536000, public, immutable`. `main.js` is ~12.7KB, well under the 200KB warning threshold. Total page weight is well under 2MB (76KB HTML + a few hundred KB of CSS/JS/fonts). The only real gap is no CDN in front of the origin — not currently hurting performance, but the first thing that would under real geographic load.

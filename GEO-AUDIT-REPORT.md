# GEO Audit — certxa.com

**Date:** 2026-10-21 · **Previous:** 2026-10-15 (53/100) · **Business type:** SaaS (nail-salon POS and booking software)

## GEO Score: 58/100

| Category | Weight | Score | 10-15 |
|---|---|---|---|
| AI Citability & Visibility | 25% | 82/100 | 70 |
| Brand Authority | 20% | 13/100 | 13 |
| Content Quality & E-E-A-T | 20% | 47/100 | 44 |
| Technical Foundations | 15% | 80/100 | 82 |
| Structured Data | 10% | 80/100 | 73 |
| Platform Optimization | 10% | 53/100 | 46 |

Crawler access 100/100 (every AI crawler allowed). llms.txt 85/100.
Platform scores: Bing Copilot 65, ChatGPT 61, Google AI Overviews 56, Perplexity 48, Gemini 35.

Detail reports from the five checks: `geo-reports/certxa.com/2026-10-21/` (AI visibility, platforms, technical, content, schema).

## Biggest finding: three different price lists were live

The /pricing page reads the admin plans (Solo free, Starter $29, Professional $99, Enterprise $179). The home page, its structured data, the compare and Vietnamese pages, llms.txt and a blog post still said Professional $22 / Elite $49. The /pricing page also showed crawlers only "Loading pricing plans…", and its FAQ answered "How much does Certxa cost?" with "prices are shown on the cards above". The owner confirmed the admin prices on 2026-10-21.

## Fixed on 2026-10-21

| # | Fix | Where |
|---|---|---|
| 1 | Owner's prices on every page, in the home and site-wide schema offers, llms.txt and the comparison blog post | marketing app, `php/includes/header.php`, `artifacts/booking/public/llms.txt`, `blog_posts` |
| 2 | /pricing plan cards and prices rendered in the HTML (server puts the plans into the page); FAQ states prices, yearly prices, 60-day trial, Autumn calls | `pages/pricing.tsx`, `api-server/src/marketing-site.ts` |
| 3 | Share image was a 404 on 17 pages → the existing 1200×630 image | 18 files in `artifacts/marketing/src` |
| 4 | /products schema: image, brand, url; card reader price 149 (was 0) | `pages/products.tsx` |
| 5 | Comparison tables: hidden Yes/No text in every icon cell | `pages/compare/ComparisonLayout.tsx` |
| 6 | Review copy described sentiment gating (Google forbids it; the product no longer does it) | `home.json`, `features.json` |
| 7 | Autumn "pay for call minutes" → per-call wording | `features.json` |
| 8 | City pages claimed deposits (not built) | four `*-salons.html` / `dallas-tx-booking.html` |
| 9 | /launchsite/ canonical pointed at the home page; empty template catalogue now noindex and out of the sitemap until it has templates | `php/router.php`, `php/launchsite/includes/*` , `php/sitemap.php` |
| 10 | Sitemap dates were "today" for 13 pages → real file dates; /sms-terms added | `php/sitemap.php` |
| 11 | WebSite search target `/search?q=` (404) → `/blog?q=` | `php/includes/header.php` |
| 12 | Stock photos redirect to GoDaddy's 1280 px resize (≈60% smaller) | `marketing-site.ts` |
| 13 | `/vietnamese-salon-software` → Vietnamese page (was home) | `marketing-site.ts` |
| 14 | "As seen on" (self-made listings) → "Find us on" | `home.json` |
| 15 | llms.txt points at the directory's new address, salons.certxa.com | `llms.txt` |

Earlier the same day (Ahrefs site-audit pass): every internal link now goes straight to a live page (no 301 hops), /data-transfer and /google-data-policy linked from the footers, /blog lists every post, the moved salon directory removed from the certxa.com sitemap.

**Goes live with `pm2 reload certxa-api`** (marketing pages, /pricing server render, image resize, redirect). PHP pages, the sitemap, llms.txt and the city pages are live already.

## Still open

### Needs the owner
1. **Brand authority (13/100, flat in every audit).** Capterra has 1 review, Product Hunt 1 upvote, no Wikidata item, no YouTube channel, no community threads found by the tools. This is the largest lever: a review drive (10+ on Capterra/G2), a Wikidata item, 2–3 short demo videos.
2. **Autumn on Enterprise:** the billing code includes 0 Autumn calls on Enterprise (Solo 20, Starter 50, Professional 100). The site says nothing about Enterprise's calls until this is decided.
3. **/data-transfer stats** ("24h average transfer time · 0 data lost · 7+ platforms") and a GDPR claim — keep only if true.
4. **/products** "Buy now" while the hardware shop is closed, and card fees there ("2.7% + 10¢") differ from /pricing ("2.7% + $0.05 plus a $0.60 Certxa fee").
5. **Launchit catalogue is empty** (0 templates) — add templates or retire the page.
6. **In-app billing pages** (`BillingPage.tsx`, `DashboardBilling.tsx`) still show $22/$49 to signed-in owners.

### Content (next pass)
- Blog posts: one real story or Certxa number in 3–4 posts, sources for stats, shorter sentences, visible "Updated" dates, a featured image per post.
- Question-style headings with 40–60-word answers on / and /features.
- Founder photo and LinkedIn on /about; one shared founder and `#software` schema node across PHP and the marketing app.

### Technical
- Duplicate security headers from nginx (`/etc/nginx/conf.d/certxa.conf` lines 77–80 repeat what the app sets) — server change for the owner.
- Single 1.26 MB JS bundle; hero images fade in after hydration (slow LCP).
- `regenerate llms-full.txt` after the reload: `python3 scripts/gen-llms-full.py`.

# GEO Audit Report: Certxa

**Audit Date:** 2026-10-15
**URL:** https://certxa.com
**Business Type:** Hybrid. The dominant part is nail salon software (B2B SaaS); the same domain also hosts a consumer nail-salon directory.
**Pages analysed:** 22 marketing pages, 17 blog posts, sampled salon and `/listings/` pages, robots.txt, llms.txt, llms-full.txt
**Previous audit:** 2026-10-12, 51/100

---

## Overall GEO Score: 53/100 (Poor), up 2

| Category | Score | Weight | Weighted | vs 10-12 |
|---|---|---|---|---|
| AI Citability | 70/100 | 25% | 17.50 | +5 |
| Brand Authority | 13/100 | 20% | 2.60 | 0 |
| Content E-E-A-T | 44/100 | 20% | 8.80 | +8 |
| Technical GEO | 82/100 | 15% | 12.30 | -6 |
| Schema & Structured Data | 73/100 | 10% | 7.30 | -3 |
| Platform Optimization | 46/100 | 10% | 4.60 | +4 |
| **Overall GEO Score** | | | **53/100** | **+2** |

### What changed since 10-12

Most marketing pages moved from the PHP site to the new marketing build (`artifacts/marketing`, routed by `artifacts/api-server/src/marketing-site.ts`). That change explains most of the movement.

**What improved:**
- The four settled facts (Autumn pricing, support hours, no native-app claims, deposits labelled "coming soon") now agree on every product page.
- New pages: `/vietnamese-nail-salon-software`, `/vi/phan-mem-tiem-nail` (with correct hreflang), and `/blog/best-pos-systems-vietnamese-nail-salons`. The blog post is a sourced, dated comparison and the most citable page on the site (86/100).

**What regressed:**
- **Schema:** the new build carries only a stub Organization node, on `/` alone. `#software` and the founder Person are defined differently on different pages.
- **Technical:**
  - The hero image redirects (302) to GoDaddy's CDN.
  - The bundle is 1.26 MB.
  - The H1 is server-rendered at `opacity:0`.
  - 28 legacy URLs use 302 instead of 301.
  - `/overview` now goes to `/features` instead of `/`.

**What hasn't moved:** brand authority, for the fifth audit in a row.

---

## Critical findings

1. **Certxa appears in none of the live discovery searches.** Tested queries:
   - "best nail salon booking software 2026"
   - "nail salon POS with turn rotation"
   - "salon software with AI receptionist"
   - "GlossGenius alternative for nail salons"
   - "Vietnamese nail salon software"

   Booksy, Zenoti, Tilavon, ConnectComPOS and others fill these results. **Correction:** the audit's search tool also failed to find certxa.com by brand name, but the owner's own Google search for "Certxa" returns the certxa.com pages. The brand-name and "look-alike names only" results came from the tool's limited index. They are not evidence about Google, and the site is indexed. The discovery-query gap above still stands.

2. **Almost no third-party presence (Brand 13/100).** What exists:
   - Wikipedia / Wikidata: none
   - Reddit: none
   - YouTube: none (`youtube.com/@certxa` returns 404)
   - LinkedIn: 4 followers
   - Capterra: 1 review
   - G2 and Product Hunt: unverifiable

   This is still the biggest lever, and it needs the owner to act: get reviews, get included in roundups, publish a YouTube walkthrough, and take part in Reddit.

3. **Wrong facts that AI engines will repeat:**
   - **Homepage meta description:** says "starting at $29/mo" (`artifacts/marketing/src/pages/index.tsx:109`). Search engines and AI tools quote this snippet most. The page's own og:description says "Free Solo plan; teams from $22/mo."
   - **Deposits:** three blog posts describe them as live, though they aren't built:
     - `/blog/nail-salon-payment-system-pos`
     - `/blog/reduce-no-shows-nail-salon`
     - `/blog/online-booking-fill-calendar-nail-salon`

     `llms-full.txt` repeats them word for word, next to the pricing page's "Coming soon".
   - **Capterra listing:** shows a $9 starting price and lists deposits. AI answers repeat both.

## High findings

4. **The schema graph is split between the old and new builds.**
   - On `/` the Organization node has no logo, address, contactPoint, founder or foundingDate. The other new-build pages reference `#organization` but never define it.
   - `#software` lists Solo and Professional only on `/` (no Elite), but all three plans as an AggregateOffer on PHP pages.
   - The founder is `#thanh-lam` on `/about` and `#founder-tom-tham` on blog posts, so parsers see two people.
5. **The homepage's largest image loads slowly.**
   - The hero image is a 302 to `img1.wsimg.com` (Getty stock, 1-hour cache). Check whether there's a licence to keep using it after the Airo site goes away.
   - The hero H1 is server-rendered invisible (the `fadeUp` animation in `index.tsx`, `about.tsx`, `contact.tsx`).
   - The JS bundle is 1.26 MB.
6. **IndexNow only pings blog posts** (`artifacts/api-server/src/routes/blog.ts:318`). New and changed marketing pages are never sent to Bing.
7. **`msvalidate.01` (Bing verification) is missing from marketing pages.** It survives only on `/blog`.
8. **Pages contradict themselves on Solo:**
   - `/pricing` said "All plans include a 60-day free trial".
   - The Autumn copy said "included calls start once your paid plan begins".

   Both conflict with Solo being free.
9. **Customer-outcome claims with nothing behind them:**
   - `/blog/reduce-no-shows-nail-salon`: "Salons using this combination inside Certxa report meaningfully fewer no-shows."
   - `/blog/hidden-revenue-nail-salon-leakage`: "no-show prediction", which isn't a feature listed on any product page.

## Medium findings

10. **Redirects:** 28 legacy URLs redirect with 302 (`marketing-site.ts:279`). `/overview` redirects to `/features` (`marketing-site.ts` `MOVED` map), but the 10-08 fix intended a 301 to `/`.
11. **Security headers are sent twice:** both nginx (`/etc/nginx/conf.d/certxa.conf:77-80`) and Node send them. `X-XSS-Protection` comes out as both `0` and `1; mode=block`.
12. **Sitemap dates aren't real:**
    - `php/sitemap.php` dates the new-build pages by the old PHP templates' file dates, or by today's date.
    - `sitemap-listings.xml` gives 5,192 URLs today's date and also lists `/`.
13. **Every new-build page has two canonical tags.** They're identical today, but Google ignores both if they ever disagree.
14. **5,192 thin `/listings/` city pages are indexable.** They carry one-line templated descriptions.
15. **The compare pages are weak for AI citation (about 40/100):**
    - They have no date, no sources and no competitor prices.
    - Their comparison tables use icons only.
    - The GlossGenius page's FAQ answers aren't in the server-rendered HTML.
    - The Vagaro page says "no Certxa marketplace", but the domain hosts one.
16. **The blog looks batch-generated:** 13 of the 17 posts share one timestamp (2026-08-25). They also show common AI-writing patterns, and there's no author page.
17. **The claimed salon page's `aggregateRating` comes from Google Places data.** Google doesn't accept ratings collected on another site.

## Low findings

18. **The homepage's `WebPage.datePublished` says 2024-01-01**, but the business was founded in Feb 2026.
19. **The `/about` meta description says "former salon owners"** (plural).
20. **`llms.txt` says "Careers: Open roles"**, but `/careers` says the company isn't hiring yet. `/careers` is 89 words long and listed in the sitemap.
21. **Three pages have long meta descriptions:** `/features` (255 characters), `/vietnamese-nail-salon-software` (241) and `/google-data-policy` (264).
22. **Smaller issues:**
    - 9 blog titles run past 70 characters.
    - The compare pages have two H1s each.
    - No `speakable` markup anywhere.
    - Some images have no width or height: the founder photo on `/about` and all 7 on each salon page.

---

## Category detail

**AI Citability (70).**
- Strongest passages:
  - The Vietnamese best-POS post (86)
  - The pricing FAQ (82)
  - The card-fee FAQ (80)
  - The Vietnamese landing page (76)
- Weakest: the compare pages (40) and the homepage feature blocks (55, almost no numbers).

**Brand Authority (13).** The `sameAs` list has 8 profiles, but none of them is a third-party source that confirms Certxa exists. Capterra's description is out of date.

**Content E-E-A-T (44).** Experience 9, Expertise 11, Authoritativeness 8, Trust 16. Every blog post now has a "Thanh Lam" byline.

**Technical (82).**
- Holding: SSR works, real 404s, unclaimed salons are `noindex`, http→https and www→apex are one 301 each, hreflang is correct, and first byte arrives in 0.08–0.21 s.
- Regressed: the items in findings 5 and 10–13.

**Schema (73).**
- Holding: BlogPosting with a Person author, clean FAQPage on 4 of the 5 FAQ pages, identical `sameAs` on every page that has it, and no deprecated types.

**Platform (46).** Google AI Overviews 50, ChatGPT 44, Perplexity 49, Gemini 36, Bing Copilot 50.

All AI crawlers are still allowed (100/100). `llms.txt` is valid.

---

## Fixes made 2026-10-15 (after the audit)

**Live now (database):** 4 blog posts no longer claim deposits exist or cite unsupported results:
- `reduce-no-shows-nail-salon`
- `online-booking-fill-calendar-nail-salon`
- `nail-salon-payment-system-pos`
- `hidden-revenue-nail-salon-leakage`

**Built, committed, waiting for `pm2 reload certxa-api`:**
- **Homepage meta description:** "...Free Solo plan; teams from $22/mo." (155 characters).
- **Homepage schema:** Elite offer added; `datePublished` 2026-02-01.
- **Organization schema:** full node (logo, address, contactPoint, founder) on every marketing page, matching `php/includes/header.php`.
- **Founder:** one `@id`, `#founder-tom-tham`, on `/about`.
- **Headlines:** every hero H1 renders visible (it was `opacity:0` until the scripts ran).
- **Compare pages:**
  - FAQ answers are now in the HTML.
  - The duplicate sr-only H1 is gone.
- **Solo-plan wording:**
  - `/pricing` trial line: "Professional and Elite include a 60-day free trial".
  - Autumn "paid plan begins" wording replaced on `/pricing` and `/autumn`.
- **Meta descriptions:**
  - `/about` now says "a former nail salon owner".
  - `/features` and `/vietnamese-nail-salon-software` trimmed to 155 characters or fewer.
- **`/about`:** width and height set on the founder photo.
- **`/backlinks/product-hunt`:** the $29/$79 pricing and per-minute Autumn text are corrected.
- **`marketing-site.ts`:**
  - `/overview` goes to `/`.
  - Legacy redirects are 301.
  - The canonical tag is added only when the page lacks one.
  - `msvalidate.01` is added.
  - IndexNow is pinged for every marketing page once per new build.
- **`llms.txt`:** Careers line says "Not hiring yet". Copy it to `artifacts/api-server/dist/public/` on deploy.

**Not done:**
- **Duplicate nginx headers:** remove `certxa.conf:77-80`. The edit to live nginx was blocked by a permission check.
- **Hero stock photo:** still hotlinked from GoDaddy. It's a Getty image licensed through Airo; copying it needs the licence confirmed, or a replacement photo.
- **Owner-only items:** Capterra listing ($9 and deposits), reviews, YouTube, Reddit, and roundup coverage.
- **Larger projects:**
  - `/listings/` thin pages
  - Salon LocalBusiness data quality
  - Third-party `aggregateRating` on claimed salons
  - Sitemap `lastmod`
  - The 1.26 MB bundle

## Next steps, in order

1. Deploy, then regenerate `llms-full.txt` from the live pages:

   ```bash
   cp artifacts/booking/public/llms.txt artifacts/api-server/dist/public/
   pm2 reload certxa-api
   python3 scripts/gen-llms-full.py
   cp artifacts/booking/public/llms-full.txt artifacts/api-server/dist/public/
   ```

2. Remove the duplicate headers at `/etc/nginx/conf.d/certxa.conf:77-80`, then run `nginx -t` and `systemctl reload nginx`.
3. **Owner:** correct the Capterra listing (Free / $22 / $49, no deposits), collect reviews on G2 and Capterra, and pursue Reddit, YouTube and roundup placements.
4. Self-host the hero image. Render the H1 visible on the server.
5. Ping IndexNow for marketing pages on deploy. Restore `msvalidate.01` on marketing pages.
6. Point `/overview` at `/`. Change the `MOVED` redirects to 301 once the move is settled.
7. Remove `certxa.conf:77-80` (duplicate headers). Base sitemap `lastmod` on the new build's real change dates. Keep a single canonical tag.
8. Add a "Last reviewed" date, sources and text table cells to the compare pages. Render the GlossGenius page's FAQ answers into the HTML.

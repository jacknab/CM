# GEO Audit Report: Certxa

**Audit Date:** 2026-10-12
**URL:** https://certxa.com
**Business Type:** Hybrid — nail salon software (B2B SaaS, dominant) plus a consumer nail-salon directory on the same domain
**Pages Analyzed:** 34 unique pages fetched across five analyses (5,242 URLs listed in the four sitemaps)
**Previous audit:** 2026-09-22, 49/100

---

## Executive Summary

**Overall GEO Score: 51/100 (Poor)**

The site itself is in good technical shape: every AI crawler is allowed, all public content is in the raw HTML, pages answer in under 0.2 s, and no errors were seen. What holds the score down is everything around the site. AI systems have almost nothing outside certxa.com to confirm Certxa exists (one Capterra review, a LinkedIn page with 4 followers and the wrong founding year, no Wikipedia, Reddit, YouTube or G2 content), and Certxa did not appear in any of five non-brand test searches. The second weakness is on the site: pages contradict each other on facts an AI would quote (what Autumn costs, whether deposits exist, support hours, whether there are native apps), and nothing on the marketing pages cites an outside source.

The score is up 2 points from September. Technical and schema improved; brand authority has not moved (13 vs 12).

### Score Breakdown

| Category | Score | Weight | Weighted Score |
|---|---|---|---|
| AI Citability | 65/100 | 25% | 16.25 |
| Brand Authority | 13/100 | 20% | 2.60 |
| Content E-E-A-T | 36/100 | 20% | 7.20 |
| Technical GEO | 88/100 | 15% | 13.20 |
| Schema & Structured Data | 76/100 | 10% | 7.60 |
| Platform Optimization | 42/100 | 10% | 4.20 |
| **Overall GEO Score** | | | **51/100** |

### Fixed during this audit (live now)

| What | Where |
|---|---|
| `llms.txt` said "Plans start at $9/month" in three places; now "Solo plan is free; team plans start at $22/month" | `/llms.txt` |
| `llms-full.txt` carried the old Solo price in 12 places ("Solo — $9/mo ($7 annual)", "Certxa $9 – $49/mo", the Vietnamese page) | `/llms-full.txt` |
| `llms.txt` linked `/listings/` twice (404) and `/overview` (redirect); now links real pages | `/llms.txt` |
| `llms.txt` said in one section that `/` is the software home page and in another that `/` is the salon directory; the second was wrong and is corrected | `/llms.txt` |
| Home page "How much does Certxa cost?" never mentioned the free plan and said a credit card is required; now states Solo free, Professional $22, Elite $49, card only for team plans (visible text and FAQ markup) | `/` |
| "Best free" page said "Certxa isn't free" and "no staff cap on any Certxa plan" beside "$0 Certxa Solo plan" and "1 on Solo" | `/best-free-salon-booking-system` |
| Kiosk page's FAQ markup listed six questions that were not on the page; markup is now generated from the visible list | `/checkin-kiosk` |

---

## Critical Issues (Fix Immediately)

1. **Certxa is not recognized as an entity outside its own site.** Searching "Certxa reviews" returned wine and cheese results (treated as a misspelling). No Wikipedia or Wikidata entry (both APIs return zero), no Reddit, YouTube, Product Hunt or Trustpilot mentions, one Capterra review in total. G2 returned 403 and has no indexed page. This cannot be fixed from the server.
2. **Certxa is absent from every non-brand query tested.** "best nail salon software 2026", "free salon booking software", "AI receptionist for salons", "nail salon check-in kiosk software": none returned Certxa. The one listicle that mentions it (iTechGuides) lists "SalonOS by Certxa" at $7/month with no free plan, which is now wrong.
3. **Autumn's price is stated two contradictory ways.** `/pricing`: "From $29 /mo" and "$0.50 per call handled". `/autumn`: "There's no additional monthly fee", billed per "minute of active call time". An AI asked what Autumn costs will quote one of these, and one is wrong. Needs your decision on the real price.
4. **Deposits are both "Coming Soon" and available.** `/pricing` lists "Deposits & prepayments — Coming Soon" on all plans; `/online-booking` says "You can require a deposit (fixed amount or percentage)"; `/best-free-salon-booking-system` says "Deposits, POS, and a kiosk included".

## High Priority Issues

1. **Support hours conflict.** Home: "24/7 live support". `/contact`: "Monday – Friday · 9:00 am – 6:00 pm ET · Closed weekends".
2. **Native apps conflict.** Home: "Certxa has native apps for both iOS … and Android". `/pricing`: "iOS & Android app — Coming Soon".
3. **Off-site facts are stale.** Capterra shows a $9 starting price; LinkedIn says founded 2024 with 11–50 employees (the site says February 2026); iTechGuides says $7/month.
4. **No outbound sources anywhere.** Zero external citations on all 16 marketing and blog pages fetched. Competitor prices on the comparison pages are dated ("as of August 2026", "September 2026") but not linked to the competitor's pricing page.
5. **No visible date or author on marketing pages.** Only blog posts show a byline and date. The comparison pages are the most quotable content on the site (80/100) and carry neither.
6. **Home page FAQ markup still differs from the visible FAQ.** "Does Certxa work for solo nail technicians?" in the markup is worded differently on the page, four answers are paraphrases, and the migration question differs. (The cost answer was aligned today.)
7. **Directory pages carry no Organization data.** Salon profiles, `/listings/*`, `/deals`, `/search` and `/for-business` have no Organization node, `@id` or `sameAs`. The marketing pages carry the correct seven-link list; the directory half says nothing about who publishes it.
8. **Home page meta description leads with the 60-day trial, not the free plan.**

## Medium Priority Issues

1. Unsupported claims: "24/7 Platform uptime guarantee" (`/pricing`, no SLA); "Funds land in your bank account by next business day, guaranteed" and "Most migrations complete in under an hour" (home); "Average response under 2 minutes" and "no bots" (`/contact`); "Salons using this combination inside Certxa report meaningfully fewer no-shows" (blog); "Lower cost at every tier" (`/certxa-vs-glossgenius`, ignores Certxa's $0.60 per transaction).
2. `/autumn`: "callers routinely can't tell she isn't your front-desk team" is unprovable, stronger than the page's own FAQ ("Many callers don't realise") and an AI-disclosure risk. "Picks up within two seconds" should stay only if call logs support it. The page also gives no price figure at all.
3. Mock-up numbers read as real results: "94% booking fill rate", "↑ 23%", "Client since Apr 2026 · 24 visits" on the home page; the `/online-booking` calendar shows "May 2025", before the company existed.
4. Scope conflict: "built exclusively for nail studios" (home FAQ, `/pricing`) against blog copy for "stylists, nail technicians, and barbers" and `/online-booking` mock-ups showing balayage and beard cuts.
5. Founder appears as "Thanh Lam" on the page and "Tom Tham" only in schema `alternateName`; the Person node has no `sameAs`; there is no author page or bio.
6. `/certxa-vs-glossgenius`: table says "Standard — $28/mo", FAQ says "$24–$168/month billed monthly".
7. The two 2026-10-04 blog posts (about 1,300 and 1,550 words, published two minutes apart) contain no numbers, prices or sources.
8. `/about` is about 350–500 words with two headings: thin for the main page describing the company. `/help` is 3 KB.
9. Claimed salon profile (`/tluxxe-nail-studio-…`): `aggregateRating` 5.0 from 4 reviews with no reviews shown; service prices in markup (25/40/55) not shown on the page.
10. All salon profiles: `streetAddress` holds the whole address, `postalCode` is missing, no `openingHoursSpecification`.
11. `/salons` has a second SoftwareApplication node ("price 0, Free trial included") that conflicts with the main one.
12. `/sitemap-listings.xml` stamps all 5,192 URLs with today's date as `lastmod`; the blog sitemap has no `lastmod` at all; 13 of 16 blog posts date from 25–26 August.
13. `sameAs` lacks YouTube, Google Business Profile, Wikidata and Crunchbase.

## Low Priority Issues

1. PHP pages send no `Cache-Control`, `ETag` or `Last-Modified`.
2. Node-served pages send some security headers twice, with conflicting `x-xss-protection` values; CSP allows `unsafe-inline` and `unsafe-eval`.
3. `Claude-SearchBot` is not named in `robots.txt` (it is covered by the `*` rule). No IndexNow. No HTTP/3.
4. `/online-booking` points `breadcrumb` at `#breadcrumb`, which is not declared; `/launchsite` references `#website` and `#software` without declaring them; `contactPoint.hoursAvailable` is a string; `legalName` is missing.
5. Heading level skip (h2 to h4) on `/online-booking`; emoji in a heading on `/pricing`.
6. City listing pages are thin (about 345 words); salon profile images have no width/height.
7. `/terms` says Delaware law and shows no "Certxa LLC" or street address.
8. "SalonOS" collides with unrelated products of the same name on Capterra.

---

## Category Deep Dives

### AI Citability (65/100)

| Page | Score |
|---|---|
| `/certxa-vs-glossgenius` | 80 |
| `/pricing` | 74 |
| `/autumn` | 70 |
| `/` | 62 |
| `/checkin-kiosk` | 60 |
| `/blog/salon-turn-system-walk-in-queue-software` | 58 |
| `/online-booking` | 55 |
| `/about` | 52 |
| `/blog/vietnamese-nail-salon-pos-system` | 50 |

Strongest passage, from the GlossGenius comparison: "Entry plan Solo — free / Standard — $28/mo ($24 annual) … Figures as of August 2026". It is dated, specific and stands on its own. The weakest was the home page cost answer, which gave no price; it was rewritten today. Marketing headings are slogans, not questions: `/online-booking` and `/checkin-kiosk` have no question headings above the FAQ, and the kiosk FAQ questions are buttons, not headings.

### Brand Authority (13/100)

| Platform | Status | Evidence |
|---|---|---|
| Wikipedia / Wikidata | Absent | Both APIs return zero results |
| Capterra | Exists, thin | 1 review, 5.0, still shows $9 |
| G2 | Unknown | 403 on fetch, no indexed page |
| LinkedIn | Exists, inactive | 4 followers, "founded 2024", "11–50 employees" |
| Reddit, YouTube, Product Hunt, Trustpilot | Absent | Search finds only other companies (Certopus, Certa) |
| Listicles | One | iTechGuides, with an outdated price |
| Facebook, X, Instagram, BBB | Not checked | |

Unchanged since September. Adding links to `sameAs` records profiles; it does not create mentions.

### Content E-E-A-T (36/100)

Experience 9/25, Expertise 10/25, Authoritativeness 6/25, Trustworthiness 11/25. The founder story on `/about` and the honest `/case-studies` page are real strengths, and no invented testimonials, ratings or review markup were found. The score is low because of the contradictions listed above, the absence of any outside source, no author bio, and no first-hand evidence (screenshots of the real product, customer data, call statistics).

### Technical GEO (88/100)

Measured from the server itself, so timings exclude network latency: no 5xx in 25 requests; first byte in 0.08–0.16 s; HTTP/2; gzip and brotli; HSTS with preload; canonical tags, unique titles and descriptions on all seven pages sampled; real 404 with `noindex` for a made-up URL; GPTBot and ClaudeBot receive byte-identical pages to a browser. Visible words without JavaScript: home 2,059, pricing 1,624, Autumn 1,872, online booking 1,030. Core Web Vitals and real-world speed were not measured.

### Schema & Structured Data (76/100)

All structured data is server-rendered JSON-LD and parses. Holding as intended: no software-wide star rating; offers show Solo 0, Professional 22, Elite 49; unclaimed listings are `noindex` and unrated; `/pricing`, `/autumn` (all nine questions, including the three new ones), `/about`, `/certxa-vs-vagaro` and blog posts are valid. Gaps are the directory half having no Organization data and the home page FAQ mismatch.

### Platform Optimization (42/100)

| Platform | Score | Biggest gap | Biggest strength |
|---|---|---|---|
| Bing Copilot | 53 | No IndexNow | Bing-verified on every page, clean HTML |
| Google AI Overviews | 50 | Headings are slogans, no rankings | FAQ, software and speakable markup everywhere |
| ChatGPT search | 40 | Brand barely recognized | OpenAI crawlers explicitly allowed |
| Perplexity | 34 | No outbound sources, no community validation | Dated claims on comparison pages |
| Gemini | 31 | No Google Business Profile, YouTube or Knowledge Graph signals | One consistent Organization and founder block sitewide |

Per-platform scores are estimates; actual index status in Google and Bing was not checked.

---

## Quick Wins (Implement This Week)

1. Decide the four facts the site disagrees on (Autumn's price, deposits, support hours, native apps) so every page can say the same thing. These are the answers an AI is most likely to quote.
2. Update the Capterra listing price to "Free" and the LinkedIn page to founded 2026 with the real team size.
3. Ask iTechGuides to correct their entry (Solo is free, not $7/month).
4. Add a visible "Last updated" date and source links to competitor pricing pages on the five comparison pages.
5. Make the home page FAQ markup come from the visible list, as was done for the kiosk page today.

## 30-Day Action Plan

### Week 1: One set of facts
- [ ] Settle Autumn pricing, deposits, support hours and app availability; apply to every page and to `llms-full.txt`
- [ ] Remove or soften the unsupported guarantees ("24/7 uptime guarantee", "next business day, guaranteed", "under 2 minutes")
- [ ] Label mock-up figures as examples and fix the "May 2025" calendar

### Week 2: Outside profiles
- [ ] Correct Capterra, LinkedIn and the iTechGuides entry
- [ ] Ask existing salons for Capterra and G2 reviews (target 10 each)
- [ ] Create a YouTube channel with three short product walkthroughs and a Google Business Profile; add both to `sameAs`

### Week 3: Proof on the page
- [ ] Add an author page for Thanh Lam with a bio and profile links; put bylines and dates on marketing pages
- [ ] Add source links and a checked-on date to every competitor claim
- [ ] Expand `/about` with company details (Certxa LLC, address, team) and real product screenshots

### Week 4: Structure
- [ ] Add the Organization node to the directory pages
- [ ] Fix salon profile addresses (`postalCode`, opening hours) and show the reviews behind any star rating
- [ ] Use real change dates in the listings sitemap and add `lastmod` to the blog sitemap
- [ ] Rewrite two or three section headings per product page as the questions people ask

---

## Appendix: Pages Analyzed

| URL | Title / role | GEO Issues |
|---|---|---|
| `/` | Home | 6 |
| `/pricing` | Pricing | 5 |
| `/autumn` | AI receptionist | 4 |
| `/online-booking` | Online booking | 5 |
| `/checkin-kiosk` | Check-in kiosk | 2 (1 fixed) |
| `/about` | About | 2 |
| `/contact` | Contact | 2 |
| `/help` | Help | 1 |
| `/terms` | Terms | 1 |
| `/case-studies` | Case studies | 0 |
| `/certxa-vs-glossgenius` | Comparison | 3 |
| `/certxa-vs-vagaro` | Comparison | 2 |
| `/best-free-salon-booking-system` | Comparison | 2 (2 fixed) |
| `/salons`, `/launchsite` | Product pages | 1 each |
| `/blog/salon-turn-system-walk-in-queue-software` | Blog, 2026-10-04 | 2 |
| `/blog/vietnamese-nail-salon-pos-system` | Blog, 2026-10-04 | 2 |
| `/blog/how-to-price-your-menu-in-2026` | Blog | 0 |
| `/blog/how-to-choose-nail-salon-software` | Blog | 1 |
| `/blog/reduce-no-shows-nail-salon` | Blog | 1 |
| `/tluxxe-nail-studio-…-HaR2gr` | Claimed salon profile | 3 |
| `/nailtique-green-valley-road-birmingham-TE1QXl` and two others | Unclaimed profiles (noindex) | 1 |
| `/listings/wayne--new-jersey`, `/listings/birmingham--alabama` | City listings | 1 |
| `/robots.txt`, `/llms.txt`, `/llms-full.txt`, five sitemaps | Crawl files | 3 (2 fixed) |

**Not verified:** G2 profile content (403), Capterra and iTechGuides page contents (search snippets only), Facebook, X, Instagram and BBB profiles, competitor prices against competitor sites, Core Web Vitals, and Google or Bing index status. Search tests used one US engine and seven queries.

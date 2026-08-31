# GEO Audit Report: Certxa

**Audit Date:** 2026-08-31 (clean re-run)
**URL:** https://certxa.com
**Business Type:** SaaS — vertical nail-salon management platform, with a large programmatic local-directory component (~51,000 `/salon/*` pages)
**Method:** Live fetch of homepage + 12 key pages + robots.txt / llms.txt / 4 sitemaps, **cross-checked against the actual source** (`php/` marketing site, `php/includes/header.php`, `php/blog/article.php`, `artifacts/api-server/src/lib/render-salon-page.ts`, `artifacts/booking/public/{robots,llms}.txt`). Source inspection is included because fetch-and-convert cannot see `<head>` metadata or `<script type="application/ld+json">`, which produces false negatives on schema and meta.

---

## Executive Summary

**Overall GEO Score: 55 / 100 (Poor — upper end, bordering Fair)**

Certxa's **technical and structured-data foundation is genuinely strong** — top-decile for this category. `robots.txt` gives every major AI crawler its own allow rule, `llms.txt` is a complete curated link index, every page is server-rendered, and the site injects a well-formed schema `@graph` (Organization + founder Person + WebSite + SoftwareApplication/AggregateOffer + BreadcrumbList) plus `FAQPage` on ~17 pages, `BlogPosting` on every post, and `LocalBusiness`/`NailSalon` on the salon directory template.

The score is held down almost entirely by **off-site reputation and content depth**, not by anything in the codebase:

- **No usable third-party footprint.** The one review-site profile (Capterra) is unclaimed, miscategorized as *Account Based Marketing Software*, has 0 reviews, and only exists on the Canada subdomain. No G2, Trustpilot, Software Advice, Wikipedia, Reddit, YouTube, or "best nail salon software" roundup presence.
- **Thin blog.** 16 posts, ~520–700 words each, bylined "Certxa Team", zero external citations, statistics stated without attribution.
- **Marketing-slogan headings.** H1s like "Walk-ins check in themselves. You stay in your zone." instead of the question a person or AI would actually match.
- **Trust inconsistencies.** `/case-studies` is deliberately empty, yet `/checkin-kiosk` shows a "247 reviews · 4.9" social-proof strip that no other surface (0 Capterra reviews, empty case studies) supports.

The company is ~6 months old (founded February 2026), so the reputation gap is expected — but it is the whole game now. Every point from here is earned off-site.

### Score Breakdown

| Category | Score | Weight | Weighted |
|---|---|---|---|
| AI Citability & Visibility | 64/100 | 25% | 16.0 |
| Brand Authority Signals | 23/100 | 20% | 4.6 |
| Content Quality & E-E-A-T | 41/100 | 20% | 8.2 |
| Technical Foundations | 87/100 | 15% | 13.1 |
| Structured Data | 86/100 | 10% | 8.6 |
| Platform Optimization | 46/100 | 10% | 4.6 |
| **Overall GEO Score** | | | **55/100** |

### Rating scale

| Range | Rating |
|---|---|
| 90–100 | Excellent |
| 75–89 | Good |
| 60–74 | Fair |
| 40–59 | Poor |
| 0–39 | Critical |

---

## Fixes already applied this session (in the codebase, pending deploy)

| Change | File | Finding |
|---|---|---|
| Removed "#1 Nail Salon Software" from default `<title>`; removed "trusted by thousands of…" from default meta description | `php/includes/header.php` | C1/C2 |
| Reworded 3 CTA blocks off "join thousands of [techs/owners] **who use Certxa**" | `php/booth-renters`, `php/online-booking`, `php/nail-salon-software` | C2 |
| Added `HowTo` schema + `#setup` anchor | `php/autumn/default.php`, `php/online-booking/default.php` | H5 |
| Blog `author` schema resolves to `Organization` for the generic "Certxa Team" byline (not a nameless `Person`); byline display de-duplicated | `php/blog/article.php` | H2 |
| Added `Claude-Web` + `anthropic-ai` to the AI-crawler allow-list | `artifacts/booking/public/robots.txt` | L1 |

None of these are live yet — PHP changes ship on the next marketing-site deploy; the `robots.txt` change is built into `artifacts/api-server/dist/public/` and ships with the app deploy.

---

## Critical Issues (Fix Immediately)

### C1. No usable third-party entity footprint
No presence on G2, Trustpilot, Software Advice (US), GetApp, Wikipedia, Reddit, YouTube, or any independent "best nail salon software" ranking (Blvd, Zenoti, GoHappyBeauty all omit it). A **Capterra listing exists** — `capterra.ca/software/1237764/Certxa-Booking-Software` — but is functionally dead: unclaimed, product name is the raw string "Certxa Booking Software", categorized as **Account Based Marketing Software** (alternatives shown: Jira, Pipedrive, Wrike), **0 reviews**, no screenshots, no link to certxa.com, Canada subdomain only (the `capterra.com` US URL at that ID 404s), not indexed. AI assistants triangulate what to recommend from exactly these sources; in its current state it contributes nothing.

**Fix:**
1. Claim the Capterra listing via the Gartner Digital Markets vendor portal — one account also manages **GetApp + Software Advice**, and reviews syndicate across all three.
2. Recategorize: Salon, Spa, Appointment Scheduling, Point of Sale (and Nail Salon Software if the taxonomy has it).
3. Fix name → "Certxa"; add real description, 5–8 screenshots, the three pricing tiers, website URL, integrations.
4. Get the profile published to the **`capterra.com` US catalog**, not just `.ca`.
5. Claim/create **G2**, **Trustpilot**, **LinkedIn company page**, **Crunchbase**.
6. Stand up a review engine: in-product prompt after ~30 days of active use → deep link to the review form; target **5 reviews in month 1, 20 by month 3** across Capterra + G2.

### C2. Unverifiable / potentially fabricated trust claims
- Default `<title>` said "#1 Nail Salon Software"; default meta description said "trusted by thousands of nail technicians and studio owners"; three CTA blocks claimed "thousands of [techs/owners] who use Certxa." **(Fixed in code this session — deploy pending.)**
- `/checkin-kiosk` renders a **"247 reviews · 4.9 rating"** social-proof strip. Nothing else on the site or off it supports this — `/case-studies` is explicitly empty and Capterra shows 0 reviews. If this number is decorative, it is a material trust risk: AI systems and buyers cross-check, and a fabricated aggregate can poison credibility for the whole domain.

**Fix:** Locate the "247 reviews" component (likely in `php/checkin-kiosk/default.php` or a shared partial) and either back it with a real, auditable source or remove it. Do not display any review count or star average you cannot substantiate. Never add `AggregateRating` schema to it.

---

## High Priority Issues (Fix Within 1 Week)

### H1. Blog has no named authors and no author entity
All 16 posts are "Certxa Team". No bio, credentials, photo, or `/authors/*` page. AI systems weight author expertise heavily for E-E-A-T. Assign a real person (the founder, a licensed nail tech, or a salon-ops specialist), build `/authors/<slug>` bio pages with `Person` schema (`knowsAbout`, `sameAs`, `image`), and reference them from `article.php`. *(Schema now degrades gracefully to `Organization` for the generic byline — deploy pending — but a real Person is the goal.)*

### H2. Blog content is too thin to be cited
520–700 words/post; statistics ("11% of Friday bookings to no-shows, ~$340/week") stated with **no attribution**; zero external links to authoritative sources. Rebuild cornerstone posts at 1,500–2,500 words, cite 3–5 external sources each, add `dateModified`, and — highest value — publish **original data from the platform** (anonymised no-show rates, price benchmarks by metro, rebooking lift). Data earns citations and links; thin how-tos do not.

### H3. `/about` is 385 words and under-documents a real strength
The founder-operator story (Tom Tham, practicing Vietnamese nail-salon owner in Phoenix, founded Feb 2026) is genuine first-hand Experience — but there is no bio, no photo, no LinkedIn, no team. Expand to ~800 words; add photo; enrich the site-wide founder `Person` node with `description`, `image`, `sameAs` once a LinkedIn exists.

### H4. `/case-studies` is empty
Zero customer-proof content for AI to cite, and it contradicts the "247 reviews" strip. Replace with 2–3 real early-adopter stories (named salon, city, quantified before/after, pull-quote) as consent allows; add `Review` schema then.

### H5. `HowTo` content without `HowTo` schema on `/checkin-kiosk`
The page has a clean 4-step "How It Works" (Tap → Enter phone → Pick service → Ticket prints). Add `HowTo` structured data (same pattern just applied to `/autumn` and `/online-booking`).

---

## Medium Priority Issues (Fix Within 1 Month)

### M1. Headings are slogans, not queries
"Walk-ins check in themselves. You stay in your zone." / "We're here to help." / "Plans that grow with your business." Add descriptive H2s that mirror real questions ("How does a nail salon check-in kiosk work?", "How much does Certxa cost?", "What is SalonOS?") and keep the slogan as the visual lead underneath. This is the single biggest on-page citability lever left.

### M2. No `hreflang` between the English and Vietnamese pages
`/nail-salon-software` (en) and `/vietnamese-salon-software` (`lang="vi"`, genuinely Vietnamese content — not machine translation) target overlapping intent in two languages with no `hreflang` reciprocal annotation. Add `hreflang="en"` / `hreflang="vi"` / `x-default` links so Google and AI engines serve the right one per user. This is a near-uncontested niche — worth doing right.

### M3. 51k `/salon/*` pages are ~80% boilerplate
~150–180 words of unique content per page against a large templated shell, explicitly disclaimered as unaffiliated. At scale this is a crawl-budget and site-quality risk. Options: (a) enrich — pull real hours, phone, services with prices, photos, a map embed, and Google review snippets; add `@id`, `image`, `hasMap`, and `aggregateRating`/`review` to the JSON-LD in `render-salon-page.ts`; (b) build **city/state hub pages** ("Nail salons in Phoenix, AZ") and internally link the listings up into them; (c) `noindex` the thinnest 30–40% (no hours, no services). Confirm every listing has a self-referential `<link rel="canonical">`.

### M4. Comparison pages are one-sided
`/certxa-vs-*` pages date competitor pricing and add a verify disclaimer (good), but competitor features are framed as "coming soon / not yet shipped." A short, honest "where [competitor] is stronger" section makes the page a citable comparison rather than marketing collateral — AI engines prefer balanced sources for "X vs Y" answers.

### M5. Blog posts have no visible "last updated"
Schema emits `dateModified`, but the byline shows publish date only. Surface an "Updated [date]" line when `dateModified` differs, and actually refresh the cornerstone posts on a cadence.

### M6. No `Speakable` schema on FAQ content
FAQ blocks are ideal for voice/assistant answers. Add `speakable` (CSS-selector form) to the FAQ sections on the top commercial pages.

---

## Low Priority Issues (Optimize When Possible)

- **L1.** Two divergent `robots.txt` in the repo — `php/robots.txt` is an older variant missing the entire AI-crawler allow-list and carrying `Crawl-delay: 2`. The served copy is `artifacts/booking/public/robots.txt` (correct), but reconcile them so a routing change can't ever serve the weak one. *(Legacy `Claude-Web`/`anthropic-ai` UAs added to the correct file this session.)*
- **L2.** Some top-nav items resolve to `#` ("How It Works", "Resources") — give them real hub pages.
- **L3.** Salon `LocalBusiness` nodes lack `@id`, `image`, and `sameAs` to the Google Business listing.
- **L4.** Homepage loads three font families (Cormorant Garamond, Fraunces, Inter) with many weights — audit against LCP; subset or drop one.
- **L5.** `Organization.sameAs` is empty (correct for now — populate once LinkedIn/Crunchbase/YouTube exist; do not assert profiles that don't exist).
- **L6.** No `/tools/*` section — free calculators (service pricing, commission, reminder-template) are strong passive link magnets for a site with no backlink profile.
- **L7.** Contact page has real phone/email/chat/hours but no `ContactPoint`/`ContactPage` schema tying it to the Organization node (the site-wide Organization `contactPoint` covers most of this — add the `ContactPage` type on the page itself).

---

## Category Deep Dives

### AI Citability & Visibility — 64/100

**Confirmed strengths**
- `FAQPage` schema on ~17 commercial pages (pricing, autumn, checkin-kiosk, online-booking, all 4 comparisons, payments, payment-processing, revenue-intelligence, nail-salon-software, get-more-reviews, solo-professionals, booth-renters, vietnamese-salon-software, overview). FAQ Q&A is the most extractable format that exists, and it is marked up.
- `HowTo` step content on `/autumn`, `/online-booking` (now schema-tagged), `/checkin-kiosk` (not yet tagged).
- Answer-shaped sentences throughout: "Clients can book instantly without creating an account or downloading anything"; "Any iPad or Android tablet works"; "The entire check-in flow is self-serve."
- Plain-text pricing ($9 / $22 / $49 monthly; $7 / $18 / $39 annual).
- Comparison tables on `/certxa-vs-*`.
- 100% SSR.
- `llms.txt` is a real curated index with Product / Audiences / Comparisons / Company sections and explicit LLM instructions — directly aids AI retrieval.
- A genuinely Vietnamese-language page for a large, underserved US nail-salon segment — near-uncontested citable content.

**Weaknesses**
- Slogan H1/H2s, not query-matched (M1).
- Blog: 520–700 words, unsourced stats, "Certxa Team" byline — low citation value (H1, H2).
- No attributed statistics or original research anywhere on the site.
- 51k directory pages are thin and disclaimed as non-Certxa — they do not build Certxa's citability.
- The "247 reviews · 4.9" strip is the kind of claim an AI will discount or hold against the source.

### Brand Authority Signals — 23/100

| Channel | Status |
|---|---|
| Branded SERP ("Certxa nail salon software") | ✅ #1 with sitelinks |
| Capterra | ⚠️ Exists (`capterra.ca/1237764`) but unclaimed, miscategorized as ABM software, 0 reviews, CA-only, `.com` 404s, not indexed |
| G2 / Trustpilot / Software Advice / GetApp | ❌ None |
| Wikipedia / Wikidata | ❌ No entity |
| Reddit / YouTube / podcasts | ❌ None found |
| "Best nail salon software" roundups | ❌ Absent from all found (Blvd, Zenoti, GoHappyBeauty) |
| LinkedIn / Crunchbase | ❌ Not surfaced |
| `Organization.sameAs` | Empty (correctly — no profiles to link yet) |

This is the gating category. Ahrefs' Dec-2025 analysis found brand *mentions* correlate ~3× more strongly with AI citation than backlinks — and Certxa has neither. The claimable Capterra asset plus the founder-PR angle (Vietnamese nail-salon owner builds the tool) are the fastest routes up.

### Content Quality & E-E-A-T — 41/100

- **Experience:** Strong premise, thinly documented. Founder-operator story on `/about`, `/vietnamese-salon-software`, `/case-studies`; site-wide founder `Person` schema. No bio, photo, LinkedIn, or team page.
- **Expertise:** Weak. No named authors, no credentials, no author pages.
- **Authoritativeness:** Weak. No external citations, no industry references, no sourced data.
- **Trust:** Mixed. Real contact page (toll-free phone, email with SLA, live chat, hours); Privacy / Terms / SMS-Terms / Google-Data-Policy present; comparison pages date and disclaim competitor pricing. **Against:** empty case studies; the unsupported "247 reviews · 4.9" strip; no security/compliance signals beyond "Stripe-powered"; thin blog; no visible "updated" dates.
- **Asset:** the Vietnamese content track is original (not MT) and serves the wedge audience — real E-E-A-T for that segment.

### Technical Foundations — 87/100

**Confirmed strong**
- `robots.txt`: dedicated `Allow: /` for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Amazonbot, CCBot, Cohere-ai (+ Claude-Web, anthropic-ai pending deploy); `Content-Signal: search=yes, ai-train=yes, ai-retrieval=yes, ai-personalization=no`; scraper bots (Ahrefs, Semrush, MJ12, Dot, BLEX, DataForSeo, Petal, Bytespider) blocked from `/salon/`.
- `llms.txt`: full described link index + LLM instructions + directory-affiliation disclaimer.
- 100% server-rendered on every page.
- Full `<head>` via `header.php`: unique `description`, `keywords`, `robots` (`max-snippet:-1, max-image-preview:large`), `canonical`, Open Graph, Twitter Card, article meta.
- Sitemap index (pages + blog + 51k salon) with `lastmod`.
- Internal app paths disallowed.

**Gaps**
- No `hreflang` between the EN and VI pages (M2).
- Salon-template self-referential canonical not confirmed (M3).
- Two divergent `robots.txt` in the repo (L1).
- Three font families / many weights — LCP risk, unmeasured (L4).
- Core Web Vitals not measured this pass — run PageSpeed Insights / CrUX on 5 templates.
- 51k thin pages — crawl-budget and quality exposure (M3).

### Structured Data — 86/100

**Present and well-formed (site-wide `@graph` from `header.php`):**
- `WebSite` (+ `SearchAction`)
- `Organization` — `foundingDate` 2026-02-01, Phoenix `PostalAddress`, `ContactPoint` (phone/email/hours/language), `knowsAbout`, `logo`; single `@id`
- `Person` — Tom Tham, founder, `worksFor` the Organization
- `SoftwareApplication` — `AggregateOffer` with all 3 tiers as `Offer` nodes + 12-item `featureList`; single `@id` for entity consolidation
- `BreadcrumbList` — built from `PAGE_BREADCRUMBS`
- `FAQPage` — ~17 pages
- `BlogPosting` — every post: `headline`, `datePublished`, `dateModified`, `author`, `publisher`, `image`, `mainEntityOfPage`, `isPartOf` Blog
- `HowTo` — `/autumn`, `/online-booking` (this session; deploy pending)
- `NailSalon` / `BeautySalon` (`render-salon-page.ts`) — `PostalAddress`, `GeoCoordinates`, `OpeningHoursSpecification`, E.164 `telephone`, `email`, `priceRange`, `areaServed`, `sameAs` (Yelp/Facebook when known)

**Gaps**
- No `Review` / `AggregateRating` anywhere (no real reviews yet — this is the main thing separating the score from ~95).
- Salon `LocalBusiness` nodes lack `@id`, `image`, `hasMap`.
- `/checkin-kiosk` and other step pages not all `HowTo`-tagged (H5).
- No `Speakable` on FAQ content (M6).
- Comparison pages carry `FAQPage` only — no comparison-specific structured data.
- **Validate everything** with Google's Rich Results Test after the pending deploy.

### Platform Optimization — 46/100

| Platform | Crawler | Readiness |
|---|---|---|
| Google AI Overviews | Google-Extended ✅ | Medium-High — SSR + FAQPage + HowTo + comparisons + llms.txt; blocked on authority for non-branded terms |
| ChatGPT Search | GPTBot, OAI-SearchBot ✅ | Low-Medium — eligible; little to cite without review-site / Reddit corroboration |
| Perplexity | PerplexityBot ✅ | Low — citation/consensus-driven; zero external footprint is the worst fit here |
| Google Gemini | Google-Extended ✅ | Medium |
| Bing Copilot / Apple Intelligence | Applebot-Extended, Amazonbot ✅ | Low-Medium |

Every assistant can crawl the site. None has a reason to recommend it for "best nail salon software" or "alternative to Vagaro/GlossGenius" yet — that surface is gated by the Capterra/G2/roundup absence (C1). The `/salon/*` directory + city hubs + `AggregateRating` is the path to "nail salon in [city]" AI local answers; the Vietnamese page is the path to that language's answer space.

---

## Quick Wins (This Week)

1. **Claim & fix the Capterra listing** (recategorize, rename, screenshots, US catalog) and start the review engine. Highest leverage available. *(C1)*
2. **Resolve the "247 reviews · 4.9" strip** on `/checkin-kiosk` — substantiate or remove. *(C2)*
3. **Deploy the fixes already in the branch** (title/desc/CTA claims, `HowTo` schema, robots UAs) and validate with Google Rich Results Test.
4. **Add `HowTo` schema to `/checkin-kiosk`** (same pattern as autumn/online-booking). *(H5)*
5. **Add `hreflang`** reciprocal links between `/nail-salon-software` and `/vietnamese-salon-software`. *(M2)*
6. **Give the blog a real named author** + one `/authors/<slug>` bio page with `Person` schema. *(H1)*
7. **Expand `/about` to ~800 words** with founder photo + bio. *(H3)*
8. **Create G2, Trustpilot, LinkedIn, Crunchbase** profiles (even unpopulated establishes the entity).

## 30-Day Action Plan

### Week 1 — Off-site entity + trust cleanup
- [ ] Claim Capterra via Gartner Digital Markets portal; recategorize (Salon / Spa / Appointment Scheduling / POS); fix name, description, screenshots, pricing, website link; push to `capterra.com` US catalog
- [ ] Create G2, Trustpilot, LinkedIn company page, Crunchbase
- [ ] Substantiate or remove the "247 reviews · 4.9" strip; audit the whole site for any other unsourced counts/claims
- [ ] Deploy the branch fixes; run Google Rich Results Test on every template; log the baseline
- [ ] Ship `HowTo` schema on `/checkin-kiosk`; add `hreflang` on the EN/VI pair

### Week 2 — Review engine + author E-E-A-T
- [ ] In-product review prompt after ~30 days active use → deep link to Capterra + G2 forms; follow-up email; disclosed unconditional incentive
- [ ] Publish `/authors/<slug>` bio page (founder or a licensed nail tech) with `Person` schema; wire into `article.php`; replace "Certxa Team" byline on cornerstone posts
- [ ] Expand `/about` (bio, photo, the salon he owns, why he built it); enrich the founder `Person` node

### Week 3 — Content depth + citability
- [ ] Rewrite 3 cornerstone blog posts to 1,500–2,500 words with 3–5 external citations each and `dateModified`
- [ ] Publish one original-data piece from the platform (anonymised no-show rates / price benchmarks / rebooking lift)
- [ ] Add question-shaped H2s to homepage, `/salonos`, `/autumn`, `/pricing`, `/checkin-kiosk`; lead each feature page with a one-line definition
- [ ] Add a balanced "where [competitor] is stronger" section to each `/certxa-vs-*` page

### Week 4 — Local pages + platform reach
- [ ] `render-salon-page.ts`: add `@id`, `image`, `hasMap`, `aggregateRating`/`review` to the JSON-LD; enrich content (hours, phone, services, map); confirm self-referential canonical; `noindex` the thinnest 30–40%
- [ ] Build a city/state directory hub template ("Nail salons in [city]"); internally link `/salon/*` up into it; add to sitemap
- [ ] Add `Speakable` to FAQ sections on the top 5 commercial pages
- [ ] Reconcile `php/robots.txt` with the served version
- [ ] Run PageSpeed Insights on 5 templates; address CWV failures; audit the 3-font load
- [ ] Publish 1 YouTube walkthrough (kiosk or Autumn demo) and 1 genuinely helpful Reddit answer where relevant
- [ ] Re-run this audit; compare category deltas

---

## Appendix: Pages Analyzed

| URL | Title (as served) | Notable GEO notes |
|---|---|---|
| https://certxa.com/ | Nail Salon Software \| Certxa | SSR; site-wide `@graph`; slogan H1; homepage title is clean (no "#1") |
| https://certxa.com/pricing | Salon Software Pricing \| Certxa | `FAQPage` schema; plain-text tiers; covered by site-wide `SoftwareApplication`/`AggregateOffer` |
| https://certxa.com/about | About Certxa — Founded by a Nail Salon Owner in Phoenix, AZ | ~385 words; founder named, not documented (no bio/photo/LinkedIn) |
| https://certxa.com/salonos | Nail Salon Management Software \| Certxa | Good one-line definition; no FAQ block |
| https://certxa.com/autumn | AI Receptionist for Salons \| Certxa | `FAQPage` + (new) `HowTo` schema; 3-step setup |
| https://certxa.com/online-booking | Nail Salon Online Booking \| Certxa | `FAQPage` + (new) `HowTo` schema; 3-step setup |
| https://certxa.com/checkin-kiosk | Nail Salon Check-In Kiosk \| Certxa | `FAQPage`; 4-step "How It Works" **without** `HowTo` schema; shows unsupported "247 reviews · 4.9" strip |
| https://certxa.com/vietnamese-salon-software | Phần Mềm Quản Lý Tiệm Nail Cho Chủ Tiệm Người Việt \| Certxa | Genuine Vietnamese content, `lang="vi"`; `FAQPage`; **no `hreflang`** pairing with the EN page |
| https://certxa.com/certxa-vs-glossgenius | Certxa vs GlossGenius — Nail Salon Software Comparison \| Certxa | Dated comparison table + disclaimer; `FAQPage`; one-sided framing |
| https://certxa.com/case-studies | Why Nail Salons Choose Certxa \| Certxa | Intentionally empty — contradicts the kiosk-page review strip |
| https://certxa.com/contact | Certxa Support \| Contact Us | Real phone/email/chat/hours; no `ContactPage` schema on the page itself |
| https://certxa.com/blog/hidden-revenue-nail-salon-leakage | The Hidden Revenue Every Nail Salon Is Losing … | ~520 words; "Certxa Team"; stats unsourced; no external links; `BlogPosting` schema present |
| https://certxa.com/blog/how-to-choose-nail-salon-software | How to Choose Nail Salon Software (A Non-Salesy Guide) — Certxa Blog | ~650 words; "Certxa Team"; internal links only |
| https://certxa.com/salon/nesh-nail-salon-princeland-court-corona-46ziud | Nesh Nail Salon - 527 Princeland Ct, Corona, CA 92879 \| Nail Salon | `NailSalon` schema (address/geo/hours/phone); ~150–180 words unique; no `@id`/`image`/`aggregateRating` |
| https://certxa.com/robots.txt | — | Best-practice AI allow-list; `Content-Signal` header; scrapers blocked from `/salon/` |
| https://certxa.com/llms.txt | — | Full described link index + LLM instructions + directory disclaimer |
| Sitemaps | — | 31 marketing + 16 blog + ~51k salon URLs across 11 child sitemaps; `lastmod` present |

### Method notes & limits
- Schema / meta findings are from **source inspection** (`php/includes/header.php`, `php/blog/article.php`, `render-salon-page.ts`, per-page `PAGE_SCHEMA` grep) plus live fetch. A prior fetch-only pass produced false negatives on schema/meta because HTML-to-markdown conversion drops `<head>` and `<script type="application/ld+json">`. **Re-validate with Google's Rich Results Test after deploy.**
- Brand-presence checks are web search as of the audit date; a manual pass on G2 / Capterra vendor portal / LinkedIn is recommended.
- Core Web Vitals and a full >16-page crawl were out of scope for this pass.
- The "247 reviews · 4.9" figure on `/checkin-kiosk` was observed in the rendered page; its source was not verified — treat as unsubstantiated until proven otherwise.

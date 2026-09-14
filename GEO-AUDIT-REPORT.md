# GEO Audit Report: Certxa (certxa.com)

**Audit Date:** 2026-09-12
**URL:** https://certxa.com
**Business Type:** SaaS (nail-salon management software; also operates a 51k-page salon directory)
**Pages / assets analyzed:** homepage, robots.txt, llms.txt, sitemap index + children, /pricing, /blog (article template), /salon/:slug directory renderer, site-wide schema graph (`includes/header.php`), plus 4 brand web searches

---

## Executive Summary

**Overall GEO Score: 58/100 (Poor — borderline Fair)**

Certxa is a **technically excellent** GEO target that is **almost invisible off-site**. The on-page work is genuinely strong: every major AI crawler is explicitly allowed, a valid `llms.txt` is in place, the whole site is server-rendered PHP, and there is a carefully-built site-wide schema `@graph` (one canonical `Organization` + founder `Person` + one `SoftwareApplication`, with `FAQPage` on 15+ marketing pages and `BlogPosting` on posts). The score is dragged down almost entirely by **brand authority** — Certxa has a Capterra listing and a few third-party listicle mentions, but **no G2, no Reddit discussion, no Wikipedia entry, no YouTube presence, and no Product Hunt launch** — the exact platforms AI models lean on for entity recognition and citation. A secondary drag is the **51,000 indexable thin directory pages** under `/salon/`, which put the whole domain's "helpfulness" signal at risk.

This matches the Sep-2026 internal note (brand authority ~13/100 as the #1 lever); the needle has barely moved.

### Score Breakdown

| Category | Score | Weight | Weighted |
|---|---|---|---|
| AI Citability | 78/100 | 25% | 19.5 |
| Brand Authority | 20/100 | 20% | 4.0 |
| Content E-E-A-T | 58/100 | 20% | 11.6 |
| Technical GEO | 80/100 | 15% | 12.0 |
| Schema & Structured Data | 88/100 | 10% | 8.8 |
| Platform Optimization | 25/100 | 10% | 2.5 |
| **Overall GEO Score** | | | **58/100** |

---

## Update: 2026-09-13 re-audit

Re-ran the same 5-subagent audit against the current live site, after a day of fixes (schema `sameAs`/`speakable`, `llms.txt` overhaul + `llms-full.txt`, `/nail-salons` directory crawlability fix, IndexNow, privacy-date/stat/footer content fixes, robots.txt tweaks). No brand-authority work was done — that needs the business owner (Wikipedia, LinkedIn, G2, YouTube, Reddit all still require creating real accounts, which is outside what code can fix).

**Revised GEO Score: 58/100** (was 51/100 immediately before today's fixes, using the same subagent methodology for a fair comparison — the very first score in this file, 58/100 from a separate earlier run, used slightly different subagent sampling and isn't a clean before/after baseline; treat 51→58 as the honest delta from today's actual work).

| Category | Before (today) | After (today) | Weight | Weighted Δ |
|---|---|---|---|---|
| AI Citability | 78/100 | 80/100 | 25% | +0.5 |
| Brand Authority | 8/100 | 12/100 | 20% | +0.8 |
| Content E-E-A-T | 35/100 | 48/100 | 20% | +2.6 |
| Technical GEO | 85/100 | 95/100 | 15% | +1.5 |
| Schema & Structured Data | 60/100 | 75/100 | 10% | +1.5 |
| Platform Optimization | 39/100 | 49/100 | 10% | +1.0 |
| **Overall** | **51/100** | **59/100** | | **+8** |

**What moved and why:**
- **Technical (+10):** the one CRITICAL issue from the original audit — the `/nail-salons` directory orphaned from crawl discovery — is fixed and independently re-verified live (server-rendered state/city links, a new 5,355-URL sitemap, a footer link). This was the single highest-confidence fix of the day.
- **Schema (+15):** `sameAs` now carries X/Twitter and a verified BBB listing, the founder `Person` node has `url` and an `alternateName` reconciling his legal name (Thanh Lam) with his public name (Tom Tham), the Organization has a real street address, and `speakable` is live on the homepage and every blog post.
- **Content (+13):** the privacy-policy date bug (predated the company's own founding date) is fixed, stats are now internally consistent and honestly framed ("early customers report up to..."), footer shows a location. Experience/Expertise/Authoritativeness are essentially unchanged — those need real named authorship and case studies, which weren't fabricated.
- **Platform (+10):** IndexNow moved Bing Copilot from 46→61, then a real `msvalidate.01` Bing verification tag moved it again to **76 — the strongest platform on the board**. Google Gemini corrected upward (36→48) once the user confirmed a Google Business Profile already exists — this report had it marked absent, which was wrong.
- **Citability (+2):** minor — mostly the stat-consistency fix removing a contradiction that would have made AI systems less confident quoting the figure at all.
- **Brand Authority (+4):** the first real movement all day. A verified BBB listing is now linked in schema — a genuine independent third-party record, not a code fix pretending to be one. Still low: Wikipedia, LinkedIn, YouTube, Reddit, and G2 remain absent, and AI search is already fabricating specific stats about Certxa ("50,000+ beauty professionals") that appear nowhere on the real site — a direct symptom of still having too few third-party sources to ground AI answers in. There's also a name-collision risk with an unrelated, established Swiss cybersecurity firm called "CertX," which LinkedIn (still the top open item) would directly help resolve.

**Bottom line:** every fix made today was real, verified, and moved its category — but the composite score is structurally capped while Brand Authority sits at 8/100. Closing that gap (LinkedIn page, G2/Capterra reviews, eventually Wikipedia/Wikidata once notability exists) is the only lever left that would move the overall score by more than a few points.

---

## Critical Issues (Fix Immediately)

*None.* No AI-crawler blocks, no domain-level noindex, no SSR gap, no missing-schema catastrophe. This is a well-built site.

---

## High Priority Issues (within 1 week)

1. **Brand authority is the entire ceiling on this score.** Certxa is not an "entity" to the models yet. Missing: a **G2 profile**, a **Product Hunt launch**, **Capterra reviews** (listing exists, needs reviews), a **Trustpilot** presence, and any **organic Reddit** footprint (r/Nails, r/smallbusiness, r/nailtech). Web search for `"Certxa" reddit/wikipedia/linkedin/youtube` returns nothing about the company. Until 3–4 of these exist with real review volume, AI Overviews / ChatGPT / Perplexity have almost nothing third-party to cite when someone asks "best nail salon software."
   - *This is founder/marketing work, not code.* Highest ROI action on the whole audit.

2. **51,000 `/salon/:slug` pages are all `index, follow` including unclaimed thin listings.** `routes/salonDirectory.ts:649` emits `<meta name="robots" content="index, follow, …">` on every page. Unclaimed listings render `PLACEHOLDER_SERVICES` / `PLACEHOLDER_HOURS` (`renderSalonPage`, ~line 528) — near-duplicate, low-value pages at massive scale. This is the classic pattern that triggers a **sitewide** quality/helpful-content dampening, which also suppresses the marketing pages' AI citability.
   - **Fix:** add `<meta name="robots" content="noindex, follow">` to unclaimed (`isVerified === false`) salon pages; keep verified ones indexable. Drop unclaimed URLs from `salon/sitemap.xml`. Re-evaluate whether the unclaimed directory belongs on the primary domain at all (subdomain isolation is an option).

3. **`softwareVersion` / trial-length / user-count facts are inconsistent across pages.** Schema says `softwareVersion: "2.0"`; a crawled page asserts a "60-day trial" while other surfaces say "free trial"; a third-party crawl surfaced "50,000+ beauty professionals." Conflicting numbers are a citability liability — an AI will quote whichever it saw and may contradict the site. Pick canonical values and use them everywhere (ideally injected from one config).

---

## Medium Priority Issues (within 1 month)

4. **Sitemap `lastmod` is stale.** `sitemap-pages.xml` → `2026-07-10`, `salon/sitemap.xml` → `2026-07-26` (audit date is 2026-09-08), and `blog/sitemap.xml` has no `lastmod` in the index. Stale dates tell crawlers "nothing changed here." Regenerate `lastmod` on deploy; add a real `lastmod` to the blog child in the index.

5. **Blog author attribution falls back to "Certxa Team".** `blog/article.php:118` correctly emits a `Person` author node **only when `author_name` is set**, else `PAGE_ARTICLE_AUTHOR` = "Certxa Team" (an org, not a person) and there is no author bio/credential block on the page. E-E-A-T for AI leans hard on named, credentialed authors. Assign every post to a real named person (founder Tom Tham already exists as a `Person` in the graph — reuse that `@id`), and add a 2–3 sentence bio with credentials at the foot of each article.

6. **Homepage `Common Questions` block may not be wired to `FAQPage` schema.** `FAQPage` is defined on `overview/default.php`, `pricing`, and 15+ pages — confirm the 6 homepage Q&As (`What is Certxa?`, `How much does Certxa cost?`, …) are the ones in the `overview` `FAQPage` `mainEntity`, and that the question text matches the visible copy verbatim (mismatch = ineligible for rich results / weaker extraction).

7. **No original data / research assets.** Stats like "35–40% drop in no-shows within 30 days" appear without a linked methodology or dataset. A single "State of Nail Salon No-Shows 2026" page with real aggregate numbers from the platform would become a citable primary source (the single most effective GEO content type for a SaaS).

8. **Founder/company has no `sameAs` web.** The `Organization` and `Person` (Tom Tham) nodes have `knowsAbout` but — from what's visible — no `sameAs` array linking to a LinkedIn company page, Crunchbase, X profile, or founder LinkedIn. `sameAs` is how entity resolution connects the schema to the wider web. Add it once brand profiles exist (ties into #1).

---

## Low Priority Issues (optimize when possible)

9. Directory `NailSalon` pages assert `priceRange: "$$"` and `paymentAccepted: "Cash, Credit Card"` as constants on unclaimed listings — harmless but unverifiable; consider omitting on `!isVerified`.
10. `sitemap-pages.xml` entries have no `<lastmod>`/`<priority>` (only the index does, partially).
11. The `lps.certxa.com` landing-page subdomain has its own 73-URL sitemap (`html/core-pages/sitemap.xml`) — confirm it's referenced from `lps.certxa.com/robots.txt` and not orphaned/duplicating the marketing pages.
12. Confirm `og:image` assets resolve (1200×630) on all templates — `header.php` references `PAGE_OG_IMAGE` per page; a 404 there weakens social/AI preview cards.

---

## Category Deep Dives

### AI Citability — 78/100
Strong. Marketing pages run ~2,100–2,500 words of plain server-rendered text with clear H1/H2/H3 hierarchy. `FAQPage` Q&A blocks on 15+ pages give AI clean question→answer pairs to lift. `/pricing` is exemplary: named tiers with bulleted inclusions, a full feature-comparison matrix by category, and quotable direct-answer sentences ("The price you see is the price you pay — monthly or annually"). Comparison pages (`certxa-vs-glossgenius`, `-vagaro`, `-fresha`, `-gocheckin`) are substantive and each carries its own `FAQPage`. **Deductions:** inconsistent product facts across pages (#3); stats without cited sources (#7); no single "definitive answer" asset for the head query ("best nail salon software for [X]").

### Brand Authority — 20/100
The ceiling on the whole audit. **Present:** Capterra (CA) listing; appears in a few 2026 "best nail salon software" listicles (zoca.com, zipdo.co). **Absent:** G2, Product Hunt, Trustpilot, Wikipedia, YouTube, and any organic Reddit thread. A direct search for the company name across Reddit/Wikipedia/LinkedIn/YouTube returns nothing about Certxa. AI models cite Reddit, YouTube and LinkedIn most heavily for this kind of recommendation query — Certxa is on none of them. Founder `Person` node exists in schema but isn't corroborated anywhere external.

### Content E-E-A-T — 58/100
**Experience/Expertise:** the founder `Person` node (`Tom Tham`, "Vietnamese-owned nail salon industry") is a good, specific expertise signal; comparison and feature pages read as written by someone who knows the vertical. **Authoritativeness:** thin — no external corroboration, no press, no named/credentialed authors on blog posts (fallback "Certxa Team"). **Trust:** privacy/terms/SMS-terms present; `llms.txt` disclaimer distinguishing owned product from scraped directory is a genuine trust-positive. **Freshness:** blog exists and posts carry `datePublished`/`dateModified`, but sitemap staleness undercuts the signal. Biggest lever: real bylines + one original-research page.

### Technical GEO — 80/100
Near-exemplary. `robots.txt` explicitly `Allow: /` for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-Web, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Amazonbot, CCBot, Cohere-ai — and disallows only data-scrapers (Ahrefs/Semrush/Bytespider/etc.) from `/salon/` + `/nail-salons/`. Valid `llms.txt` with a crawl policy and the directory-affiliation disclaimer. 100% server-side-rendered (PHP) — no JS-dependency risk. Sitemap index → 3 children. Full OG + Twitter card meta, deliberate canonical handling (homepage served at `/` with canonical `https://certxa.com/`, no redirect). **Deductions:** stale `lastmod` (#4); 51k indexable thin pages (#2) is a technical-quality risk even though each page is individually valid.

### Schema & Structured Data — 88/100
The strongest category. `includes/header.php` builds one site-wide `@graph`: canonical `Organization` (`#organization`), founder `Person` (`#founder-tom-tham`, `worksFor` the org), and a **single** canonical `SoftwareApplication` (`#software`) — explicitly designed so entity resolution sees one product, not a fragment per page — with `AggregateOffer` (3 real `Offer`s, `UnitPriceSpecification` monthly billing done correctly), a 12-item `featureList`, and `BreadcrumbList`. Per-page `FAQPage` on 15+ pages; `BlogPosting` with `Person`/Org author discipline; directory pages use `NailSalon`/`LocalBusiness` with ISO-8601 hours and a deliberate rule to **not** assert `AggregateRating` on unclaimed listings (correct — avoids a 51k-page rich-results manual-action risk). **Deductions:** no `sameAs` on Organization/Person (#8); verify homepage FAQ ↔ schema wiring (#6).

### Platform Optimization — 25/100
Google AI Overviews / Gemini: reasonably positioned (clean SSR, schema, FAQ, `Google-Extended` allowed) — this is the platform most likely to surface Certxa today. ChatGPT / Perplexity: weak, because both weight third-party corroboration (Reddit, review sites, listicles) and Certxa has little. Bing Copilot: minimal signal. The fix is the same as Brand Authority — off-site presence.

---

## Quick Wins (this week)

1. **`noindex` unclaimed `/salon/` pages** — one-line change in `routes/salonDirectory.ts` (branch the robots meta on `isVerified`); remove those URLs from `salon/sitemap.xml`. Protects the whole domain.
2. **Create a G2 product listing + a Product Hunt launch draft.** Free, ~1 hour each, immediately gives AI something third-party to cite.
3. **Fix the fact inconsistencies** (trial length, user count, `softwareVersion`) — pick canonical values, grep-and-replace across `php/`.
4. **Regenerate sitemap `lastmod` on deploy** and add a real `lastmod` for the blog child sitemap in the index.
5. **Add `sameAs` to the `Organization` node** now (LinkedIn company page, X `@certxa` which already exists in `twitter:site`, Capterra listing URL) — 15 minutes in `includes/header.php`.

## 30-Day Action Plan

### Week 1 — Stop the bleeding + easy authority
- [ ] `noindex` unclaimed salon directory pages; trim `salon/sitemap.xml`
- [ ] Canonicalize product facts (trial, user count, version) across `php/`
- [ ] Sitemap `lastmod` regeneration + blog child `lastmod`
- [ ] Add `Organization.sameAs` (LinkedIn, X, Capterra)
- [ ] Stand up G2 listing; draft Product Hunt launch

### Week 2 — Named expertise
- [ ] Assign every blog post a real named author; reuse `#founder-tom-tham` `@id` where applicable
- [ ] Add a 2–3 sentence credentialed author-bio block to `blog/article.php`
- [ ] Verify homepage `Common Questions` text matches the `overview` `FAQPage` `mainEntity` verbatim
- [ ] Publish 1 comparison-style answer page targeting a head query ("best nail salon software for a single tech / for a Vietnamese-owned salon / for multi-location")

### Week 3 — Original data
- [ ] Build a "State of Nail Salon No-Shows 2026" page from real platform aggregates (backs the "35–40%" claim with a methodology + chart) — this is the citation magnet
- [ ] Seed 2–3 genuine, non-spammy answers in relevant Reddit threads / Quora questions about salon software
- [ ] Request reviews from existing happy customers → Capterra + G2 (target 5+ each)

### Week 4 — Distribution
- [ ] Publish the Product Hunt launch
- [ ] 1 founder LinkedIn article on the nail-salon-software problem, linking the research page
- [ ] Record 1 short YouTube walkthrough (booking + kiosk flow) — even a 3-minute screen capture creates a YouTube entity
- [ ] Re-audit brand authority; target 35–40/100

---

## Appendix: Pages / Assets Analyzed

| URL / asset | What was checked | Notable findings |
|---|---|---|
| `/robots.txt` | AI crawler directives | All major AI bots explicitly allowed; scrapers blocked from `/salon/` |
| `/llms.txt` | Presence, validity, policy | Valid; crawl policy + directory-affiliation disclaimer |
| `/sitemap.xml` (+3 children) | Structure, lastmod | Index → pages / blog / salon (~51k); `lastmod` stale (Jul); blog child has none |
| `/` (homepage) | Title, nav, FAQ, CTAs, schema | Strong FAQ + nav; SaaS signals; schema not visible to markdown crawler but confirmed in source |
| `includes/header.php` | Site-wide schema `@graph` | Canonical Organization + founder Person + single SoftwareApplication; FAQPage/BreadcrumbList wiring |
| `/pricing` | Citability | Exemplary: named tiers, comparison matrix, quotable sentences, FAQ |
| `blog/article.php` | Article schema, author, 404 | `BlogPosting` + `Person`/Org author logic; hard `http_response_code(404)` on missing post (good) |
| `routes/salonDirectory.ts` | Directory 404 + robots + content | Hard 404 with `noindex`; **all** slug pages `index,follow`; unclaimed pages use placeholder services/hours |
| Web searches (×4) | Brand presence | Capterra + listicles only; no G2 / Reddit / Wikipedia / YouTube / Product Hunt |

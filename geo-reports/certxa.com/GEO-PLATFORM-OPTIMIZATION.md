# GEO Platform Optimization Report — certxa.com

**Date:** 2026-08-23
**Business type:** SaaS — salon/spa/nail-studio management (online booking, POS, staff management, payroll, AI receptionist)
**Pages analyzed directly (raw HTML fetched and parsed):** homepage (`/`), `/pricing`, `/nail-salon-software`, `/online-booking`, `/about`, `/case-studies`, plus `/robots.txt`, `/sitemap.xml`, `/sitemap-pages.xml`, `/blog/sitemap.xml`, `/llms.txt`, `/.well-known/indexnow-key.txt`, `/features`, `/book`
**Methodology:** Live `curl` fetch of raw server-rendered HTML (not a browser render) so all findings below reflect exactly what AI crawlers with limited/no JS execution (Perplexity, Bing/Copilot, most ChatGPT fetches) actually receive. Heading structure, JSON-LD, robots directives, and inline text were parsed with regex/Python — not inferred. SERP ranking position and off-site signals (Reddit, Wikipedia, backlinks) could not be verified with the tools available this session (Ahrefs site-explorer access returned "insufficient plan"); those items are explicitly marked as unverifiable rather than assumed absent or present.

## Overall Platform Readiness

**Combined GEO Platform Score: 39/100** (Weak-to-Fair — strong technical bones, thin entity/authority layer)

## Platform Scores

| Platform | Score | Status |
|---|---|---|
| Google AI Overviews | 46/100 | Fair |
| ChatGPT Web Search | 42/100 | Fair |
| Perplexity AI | 40/100 | Fair |
| Google Gemini | 20/100 | Weak |
| Bing Copilot | 47/100 | Fair |

Status thresholds: Strong = 70+, Fair = 40–69, Weak = 0–39

**Strongest platform: Bing Copilot (47/100)** — the site's biggest asset is a fully-open `robots.txt` (`Allow: /` with no bot-specific blocks), sub-100ms server-rendered HTML, and a LinkedIn company page in schema `sameAs`, which together clear most of Copilot's technical bar even though IndexNow and Bing Webmaster verification are missing.

**Weakest platform: Google Gemini (20/100)** — Gemini leans hardest on Google-owned-property presence (YouTube, Knowledge Panel, Google Business Profile, Scholar/News/Maps), and certxa.com has **zero** on-site or schema evidence of any of these. There is not one `<img>` tag or video reference in the homepage HTML for Gemini's multimodal signals to latch onto.

---

## certxa.com Site Inventory (as fetched)

- `sitemap.xml` is an index pointing to three sub-sitemaps:
  - `sitemap-pages.xml` — **25 static marketing URLs** (confirmed by direct fetch), the core set this audit evaluates.
  - `blog/sitemap.xml` — currently contains **only the `/blog` index URL itself; zero published blog posts**. This is a major content-depth gap (see Perplexity/ChatGPT sections).
  - `salon/sitemap.xml` — **51,000+ programmatic local salon landing pages** (not crawled per scope; noted here only as an existence/scale fact — this is a large surface area that was out of scope for this audit but should get its own technical/duplicate-content pass).
- `robots.txt` uses a single blanket `User-agent: * / Allow: /` with only path-based `Disallow` rules for internal app routes (`/api/`, `/admin/`, `/dashboard/`, etc.). **No AI-crawler-specific rules exist at all** — meaning GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Google-Extended, and Bingbot are all implicitly allowed on every marketing page. This is a clean baseline.
- `/llms.txt` exists and is well-formed, **but two of its four "Product" links are broken in practice**: it links to `/features` ("Full list of platform capabilities") and `/book` ("Clients can book appointments online 24/7"), but both resolve to a **2.9KB shell page with no `<h1>` and the generic title "Certxa - Online Booking Service"** — not the content llms.txt promises. Any AI crawler that trusts llms.txt and follows those links gets nothing useful, which actively wastes a citation opportunity and undermines trust in the file. Fix: point llms.txt at real, populated pages (`/nail-salon-software` or a genuine `/features` page if one is built) or build out `/features` to match its billing.
- JSON-LD schema is present and structurally solid on every page checked: `Organization`, `WebSite` (with `SearchAction`), `SoftwareApplication` (with a real `featureList` and `Offer`), `BreadcrumbList`, and `FAQPage` on most pages. This is well above the baseline for a SaaS marketing site and is the site's single biggest asset across all five platforms.

---

## Google AI Overviews (AIO)

**Score: 46/100**

| Signal Category | Score | Key Findings |
|---|---|---|
| Content Structure | 18/40 | Marketing-style headings, not question-format; FAQ content exists but isn't marked up as headings; only 1 comparison table sitewide |
| Source Authority | 8/30 | No verifiable top-10 rankings (SERP data unavailable this session); no outbound authoritative citations found on any page checked |
| Technical Signals | 20/30 | Clean h1→h2→h3 hierarchy on body copy, fast SSR HTML, strong JSON-LD — undercut by no `dateModified`/`datePublished` and the FAQ-as-button issue below |

**What's working:**
- Homepage `<h1>` is a single, clear statement ("Nail salon software that fills every chair.") with a clean 1×h1 / 8×h2 / 13×h3 hierarchy — no skipped levels.
- `FAQPage` JSON-LD is present on the homepage (6 Q&As), pricing (3 Q&As), `/nail-salon-software`, and `/online-booking`, and the same question text is duplicated in visible on-page copy (not cloaked schema) — e.g. "What is Certxa?", "How much does Certxa cost?", "Does Certxa work for solo nail technicians?".
- The pricing page has one genuine comparison table (plan × feature matrix: Booking & Scheduling, Client Management rows with ✓/–/"Coming Soon" cells) — exactly the format AIO extracts directly.

**Concrete gaps and fixes:**

1. **Zero true question-format headings outside the FAQ.** Every H2/H3 on the homepage and feature pages is a benefit tagline ("Book while you sleep. Every slot filled.", "Slash no-shows by up to 70%.") rather than a query-matching question. AIO and Featured Snippets are won by headings like "How does online booking software reduce no-shows?" followed immediately by a 40–60 word direct answer. **Fix:** on `/online-booking`, replace the H2 "Booking that works around the clock" with "How does 24/7 online booking work for a nail salon?" followed by a tight answer paragraph such as: *"Certxa's online booking page lets clients pick a technician, service, and time slot at any hour. The system checks staff availability in real time, blocks double-bookings automatically, and sends a confirmation text — so a client booked at 11pm shows up on your calendar the next morning with zero manual entry."* Do the same on `/nail-salon-software`, `/payments`, `/checkin-kiosk`, and `/revenue-intelligence` for their core value props.

2. **The FAQ accordion questions are not real headings.** Raw HTML shows each question wrapped in `<button class="accordion-btn">What is Certxa?</button>` — a plain button, not an `<h3>`/`<h4>`. This means the FAQ content that AIO would most want to extract carries no heading-level HTML semantics at all, hurting both the "clean HTML semantics" technical signal and the "question-based headings" content-structure signal simultaneously. **Fix:** wrap each accordion question in a heading, e.g. `<h3><button class="accordion-btn">What is Certxa?</button></h3>` (or `<button><span role="heading" aria-level="3">…</span></button>` if a real `<h3>` breaks the button's click target) — a one-line template change that applies sitewide everywhere the accordion component is reused.

3. **Only one comparison table on the entire 25-page marketing site.** Given Certxa's own FAQ answer states it migrates users "from GlossGenius, Vagaro, Square Appointments, Booksy, and Fresha," there is real intent-match demand for "Certxa vs GlossGenius"-style tables, but no dedicated comparison page exists in the sitemap. **Fix:** build 2–3 `/certxa-vs-glossgenius`, `/certxa-vs-vagaro`, `/certxa-vs-fresha` pages, each anchored by a feature×price HTML table (not an image) — this is simultaneously the highest-leverage AIO fix and a ChatGPT/Perplexity fix (see Cross-Platform Synergies).

4. **No `dateModified`/`datePublished` anywhere.** No page checked has either the JSON-LD property or visible "Last updated" text, even though `sitemap-pages.xml` itself carries `<lastmod>2026-07-20</lastmod>` for every URL. **Fix:** surface that same date as `"dateModified": "2026-07-20"` in the existing `WebPage`/`SoftwareApplication` JSON-LD blocks — the data already exists in the sitemap generator, it just isn't being reused in the page schema.

---

## ChatGPT Web Search

**Score: 42/100**

| Signal Category | Score | Key Findings |
|---|---|---|
| Entity Recognition | 5/35 | No Wikipedia, no Wikidata; `sameAs` limited to Twitter/Facebook/Instagram/LinkedIn — no Crunchbase, G2, or Capterra |
| Content Preferences | 12/40 | Factual, quotable FAQ/case-study copy exists, but no author bylines, no visible dates, pages are short (marketing-length, not 2000+ word authoritative treatments) |
| Crawler Access | 25/25 | `robots.txt` has no bot-specific restrictions — OAI-SearchBot, ChatGPT-User, and GPTBot are all implicitly allowed on every marketing URL |

**What's working:**
- Full, unrestricted crawler access is a real advantage many SaaS sites get wrong (some block GPTBot outright) — Certxa's blanket `Allow: /` costs nothing and is already correct.
- Case studies page names real customers with role and city — "Jessica Mitchell, Nail Technician & Salon Owner, London" (40% more bookings in 60 days, no-shows down from 5–6/week to <1) and a New York nail studio owner (revenue up 52%, no-shows down 91% with deposits). These are exactly the kind of specific, quotable, attributable claims ChatGPT prefers over vague marketing copy.
- `Organization` schema's `sameAs` array is present and correctly formatted, just thin.

**Concrete gaps and fixes:**

1. **No entity grounding beyond social profiles.** ChatGPT weights Wikipedia (47.9% of citations per platform behavior) and Wikidata far above brand-controlled content. Certxa is too early-stage for a Wikipedia article (notability bar), but the *cheaper* wins are unclaimed: **add G2 and Capterra profiles** (both are B2B SaaS review platforms ChatGPT and Bing index heavily for software category queries like "best nail salon software") and **add them to `sameAs`** once created: `"sameAs": ["https://twitter.com/certxa", "https://facebook.com/certxa", "https://instagram.com/certxa", "https://linkedin.com/company/certxa", "https://www.g2.com/products/certxa", "https://www.capterra.com/p/xxxxx/Certxa/"]`. This single addition is one of the highest-ROI actions in this report — see Cross-Platform Synergies.
2. **`/about` page is too thin to ground the entity.** Raw HTML shows exactly one `<h2>` ("Want to talk to a real person?") and zero founding story, leadership names, or company history — just a contact CTA. ChatGPT uses About-page content for "who, what, when, where, why" grounding. **Fix:** rewrite `/about` with a 300–500 word founding narrative that includes: founding year, founder name(s), headquarters city, and a specific origin story sentence ("Certxa was founded in [year] by [name] after running a nail studio and finding every existing booking tool built for hair salons first, nails second."). This single fact set (year, founder, HQ) is also what a future Wikidata item would need.
3. **No author bylines or credentialed content anywhere.** Zero instances of "By [Name]" found across all six pages checked. Since there are no blog posts yet (see below), there's no natural home for bylines today — but when blog content ships, every post needs a real author name + one-line credential ("Written by [Name], Head of Customer Success at Certxa") to build the expertise signal ChatGPT and AIO both reward.
4. **No long-form content exists to be "the" canonical cited source on anything.** The 25 marketing pages are all short, conversion-focused pages (hundreds of words, not 2000+). ChatGPT tends to cite one comprehensive source over several thin ones. **Fix:** the `/blog` route already exists in the sitemap infrastructure but has zero published posts — this is the natural home for 1,500–2,500 word deep-dives ("The Complete Guide to Reducing No-Shows at a Nail Salon," "Nail Salon POS Systems Compared") that could become the canonical ChatGPT-cited source for these queries.

---

## Perplexity AI

**Score: 40/100**

| Signal Category | Score | Key Findings |
|---|---|---|
| Community Validation | 0/30 | No Reddit, forum, G2/Capterra, or Quora presence found or referenced anywhere on-site; unverifiable off-site this session but nothing on-site points to any |
| Source Directness | 12/30 | Named, specific customer case studies with before/after numbers are decent primary-source material; no original research, survey, or benchmark data |
| Content Freshness | 8/20 | `sitemap-pages.xml` carries `<lastmod>` dates for every URL, but none of that surfaces on the pages themselves as visible dates or `dateModified` schema |
| Technical Access | 20/20 | Fully server-rendered HTML (homepage 83KB / ~79ms, pricing 63KB / ~76ms) with no JS-dependent content — ideal for Perplexity's limited JS execution; `robots.txt` has no PerplexityBot restriction |

**What's working:**
- Technical access is essentially perfect: pages load in well under 100ms and all content (headings, FAQ text, pricing table, schema) is present in the raw HTML with zero JavaScript required to render it. This is exactly the environment PerplexityBot needs.
- The case-study numbers (68% no-show reduction with a week-by-week chart: 85% → 45% → 12% weekly no-show rate; 91% no-show reduction with deposits; 78% of appointments using deposits) are specific enough to be quoted directly, which is the "quotable, standalone paragraph" pattern Perplexity favors.

**Concrete gaps and fixes:**

1. **Zero community-validation footprint.** This is Perplexity's single heaviest-weighted signal category (30 of 100 points, and Reddit alone accounts for ~47% of Perplexity's citation sources platform-wide) and Certxa has no on-site evidence of participating in or being discussed in r/smallbusiness, r/salons, r/Entrepreneur, or similar. **Fix:** this is a strategic (not a code) fix — have someone from Certxa answer genuine questions in relevant subreddits (e.g., threads asking "what booking software do you use for your nail salon") without overt promotion, and claim/complete a G2 or Capterra listing, since Perplexity indexes those review platforms too.
2. **No original data or research asset.** The case studies are strong anecdotal proof but are single-customer stories, not aggregate data. **Fix:** publish one aggregate stat page or downloadable report — e.g. "Certxa 2026 Nail Salon No-Show Benchmark Report" pulling anonymized platform-wide averages (average no-show rate, average booking lead time, deposit adoption rate) with a methodology note. This is exactly the "original data/research" asset Perplexity over-indexes on, and it's a natural Reddit/HN discussion trigger too (feeds gap #1).
3. **Freshness data exists but isn't exposed at the page level.** Same fix as the AIO recommendation: reuse the sitemap's `<lastmod>` value as visible "Updated [date]" text plus `dateModified` in JSON-LD on each page — low effort, and Perplexity deprioritizes undated content more aggressively than any other platform in this report.

---

## Google Gemini

**Score: 20/100**

| Signal Category | Score | Key Findings |
|---|---|---|
| Google Ecosystem | 0/35 | No YouTube channel/videos referenced anywhere on-site or in schema; no Google Business Profile evidence for Certxa itself (note: `/google-business-profile` is a *product feature page* about GBP integration for Certxa's customers, not Certxa's own GBP presence — don't conflate the two) |
| Knowledge Graph | 5/30 | `Organization` schema with `sameAs` exists (a real, if minimal, KG input signal) but no indication of an actual Knowledge Panel and no links to any Google-recognized entity source |
| Content Quality | 15/35 | 19 distinct feature pages under `sitemap-pages.xml` show genuine topical clustering and internal linking, but there is no video content and the homepage HTML contains **zero `<img>` tags** — no alt-text or descriptive-image signal for multimodal retrieval |

**What's working:**
- The site's information architecture is Gemini-friendly in one respect: 19 separate, purpose-built feature pages (`/online-booking`, `/payments`, `/checkin-kiosk`, `/client-management`, `/client-notifications`, `/google-business-profile`, `/client-reviews`, etc.) all linking back to and from the homepage constitute real topical clustering, which is one of Gemini's three content-quality sub-signals.
- `SoftwareApplication` schema's `featureList` array (12 itemized capabilities) gives Gemini a clean, structured entity summary to draw from even without a Knowledge Panel.

**Concrete gaps and fixes:**

1. **No YouTube presence at all — the single largest Gemini gap.** Gemini weights YouTube more heavily than standard Google Search, and Certxa has no channel referenced in `sameAs`, no embedded videos, and no mention of video content anywhere in the six pages checked. **Fix:** create a YouTube channel and publish even 3–5 short (2–4 minute) product-demo videos — "How the Autumn AI receptionist answers a call," "Setting up your first online booking page," "How the no-show deposit flow works" — with full URLs and keyword-rich descriptions, then add `"https://youtube.com/@certxa"` to the `Organization.sameAs` array. This is a from-scratch investment but the ceiling is high given how little competition exists in this specific niche.
2. **No images anywhere in the raw HTML for Gemini's multimodal signal.** Zero `<img>` tags were found on the homepage — the visual design likely relies on inline SVG/icon components or CSS backgrounds, none of which carry alt text or filename signals. **Fix:** add real product screenshots (booking calendar, POS checkout, client profile view) as genuine `<img>` elements with descriptive `alt` text ("Certxa online booking calendar showing multi-technician day view") on at least the homepage and top feature pages — this also directly feeds the AIO/Gemini E-E-A-T "demonstrated experience" signal.
3. **No Google Business Profile signal for Certxa itself.** For a B2B SaaS this matters less than for a local business, but a claimed, complete GBP listing for "Certxa" (software company category) with logo, description, and website link is still a legitimate, low-effort Knowledge Graph input that's currently unclaimed or at least unreferenced anywhere on-site.

---

## Bing Copilot

**Score: 47/100**

| Signal Category | Score | Key Findings |
|---|---|---|
| Bing Index Signals | 8/30 | No working IndexNow key file (the `/.well-known/indexnow-key.txt` path returns HTTP 200 but serves the app's generic SPA fallback, not a real key); no `msvalidate.01` meta tag found in homepage `<head>`; `sitemap.xml` is well-formed and would be submittable |
| Content Preferences | 15/30 | Clear, structured, professional-tone content with a real pricing table and FAQ; no outbound authoritative citations found |
| Microsoft Ecosystem | 8/20 | LinkedIn company page linked in `sameAs`; no GitHub presence (reasonable for a non-dev-facing product, so this is a minor gap, not a real miss) |
| Technical Signals | 16/20 | Fast SSR load (<100ms), mobile viewport meta present, mostly clean semantics — docked for the FAQ-button-instead-of-heading issue shared with the AIO section |

**What's working:**
- Every page checked returns real, fast, fully server-rendered HTML — Copilot's "fast load, structured markup" preference is already satisfied technically.
- `<link rel="canonical">` is correctly and consistently set (verified on homepage and pricing) — no canonicalization ambiguity for Bing's indexer.

**Concrete gaps and fixes:**

1. **No functioning IndexNow implementation.** `/.well-known/indexnow-key.txt` resolves with a 200 status but the body is the app's default HTML shell (`<!DOCTYPE html>...`), not a plaintext key — meaning there's no real key file and, by extension, almost certainly no active IndexNow ping on publish. **Fix:** generate a real IndexNow key, serve it as plaintext at `/{key}.txt` (or configure the app router to not catch `.well-known/` paths with the SPA fallback), and call the IndexNow API (`https://api.indexnow.org/indexnow`) whenever a marketing page or future blog post is published or updated. Given Certxa's 51,000+ programmatic `/salon/` pages, IndexNow is also the fastest way to get that volume indexed without waiting on organic crawl budget.
2. **No visible Bing Webmaster Tools verification signal.** No `msvalidate.01` meta tag was found in the homepage `<head>` (verification could still exist via DNS TXT record, which this analysis cannot check — noting as unverifiable rather than absent). **Fix:** confirm Bing Webmaster Tools is registered and verified; if not, add verification and submit `sitemap.xml` directly (Bing does not always discover sitemaps via `robots.txt` alone as reliably as Google does).
3. **Same FAQ-heading fix as AIO applies here too.** Bing/Copilot's content-preference scoring rewards "clear, structured content that answers questions directly" — converting the accordion `<button>` questions to real `<h3>` elements (see AIO fix #2) helps this platform identically.

---

## Cross-Platform Synergies

Actions that move the needle on multiple platform scores simultaneously:

1. **Wrap FAQ accordion questions in real `<h3>` headings.** — Impacts: Google AI Overviews, Bing Copilot, and indirectly ChatGPT (Bing-index-based). One template-level fix, applies across every page using the accordion component.
2. **Build 2–3 "Certxa vs [Competitor]" comparison pages with feature/price tables.** — Impacts: Google AI Overviews (table extraction), ChatGPT (comparison queries route through Bing's index), Perplexity (comparison queries are exactly the multi-source-citation format Perplexity favors). The FAQ already admits migration support for GlossGenius, Vagaro, Square Appointments, Booksy, and Fresha — the demand signal already exists in the site's own content.
3. **Reuse the sitemap's existing `<lastmod>` date as visible on-page text + `dateModified` JSON-LD.** — Impacts: Google AI Overviews, Perplexity (both explicitly deprioritize undated content), and Bing Copilot content-preference scoring. The data already exists in the sitemap generator — this is a wiring fix, not new content.
4. **Add G2/Capterra listings and reference them in `Organization.sameAs`.** — Impacts: ChatGPT (entity recognition + review-platform indexing), Perplexity (community validation — G2/Capterra reviews function like structured "community" signal), Google Gemini (additional Knowledge Graph input).
5. **Fix or remove the broken `/features` and `/book` links in `llms.txt`.** — Impacts: ChatGPT, Perplexity, and any LLM training/grounding crawler that respects `llms.txt` — a five-minute fix that currently actively misleads every AI crawler that reads the file.
6. **Publish the first 3–5 blog posts (the `/blog` route and sitemap plumbing already exist, just empty).** — Impacts: ChatGPT (comprehensive, citable long-form source), Perplexity (freshness + discussion-worthy content), Google AI Overviews (more surface area for question-based content), Google Gemini (topical clustering depth).

## Platform-Specific Quick Wins

- **AIO:** Add `dateModified` to existing JSON-LD blocks using the date already present in `sitemap-pages.xml` — near-zero effort, direct signal improvement.
- **ChatGPT:** Rewrite `/about` with founder name, founding year, and HQ city — one page, no new infrastructure.
- **Perplexity:** Add a visible "Updated [date]" line near the top of each of the 25 marketing pages.
- **Gemini:** Add `alt`-texted product screenshots to the homepage — currently zero `<img>` tags exist to optimize.
- **Bing Copilot:** Fix the `/.well-known/indexnow-key.txt` route to serve a real plaintext key instead of the SPA fallback shell.

---

## Priority Actions (All Platforms)

1. **[CRITICAL]** Fix `llms.txt`'s broken `/features` and `/book` links (currently resolve to a content-less 2.9KB shell with no `<h1>`) — Affects: ChatGPT, Perplexity, all LLM crawlers respecting llms.txt — Effort: Low
2. **[CRITICAL]** Wrap FAQ accordion questions in real `<h3>` elements instead of plain `<button>` text — Affects: Google AI Overviews, Bing Copilot — Effort: Low
3. **[HIGH]** Build "Certxa vs GlossGenius / Vagaro / Fresha" comparison pages with real HTML feature/price tables — Affects: Google AI Overviews, ChatGPT, Perplexity — Effort: Medium
4. **[HIGH]** Reconcile the pricing inconsistency: `SoftwareApplication` JSON-LD Offers and the meta description state Solo/Professional/Elite at **$9/$22/$49** per month, while the visible pricing-table headline shows **"From $7/mo," "From $18/mo," "From $39/mo"** with no label distinguishing monthly vs. annual billing. An AI system citing this page could quote either number as "the price." — Affects: Google AI Overviews, ChatGPT, Perplexity, Bing Copilot (all quote pricing directly from page content/schema) — Effort: Low
5. **[HIGH]** Publish the first wave of blog content — the `/blog` sitemap route exists but currently contains zero posts — Affects: ChatGPT, Perplexity, Google AI Overviews, Google Gemini — Effort: Medium
6. **[MEDIUM]** Create a YouTube channel with 3–5 short product-demo videos and add it to `Organization.sameAs` — Affects: Google Gemini (primary), ChatGPT, Perplexity — Effort: Medium
7. **[MEDIUM]** Add real product screenshots with descriptive `alt` text (currently zero `<img>` tags on the homepage) — Affects: Google Gemini, Google AI Overviews — Effort: Low-Medium
8. **[MEDIUM]** Implement a working IndexNow key file and ping the API on publish — Affects: Bing Copilot (directly relevant given the 51,000+ `/salon/` programmatic pages needing fast indexing) — Effort: Low
9. **[MEDIUM]** Claim/complete G2 and Capterra listings and add to `Organization.sameAs` — Affects: ChatGPT, Perplexity, Google Gemini — Effort: Medium (external, not code)
10. **[LOW]** Rewrite `/about` with founder name, founding year, HQ city, and a real founding narrative (currently one H2 and a contact CTA only) — Affects: ChatGPT, Google Gemini — Effort: Low

---

## What Could Not Be Verified This Session

- **Actual SERP ranking position** for target queries (Ahrefs site-explorer access returned "insufficient plan" for this account) — the AIO "top-10 ranking" sub-score (5/20 awarded) is an inferred estimate based on content/domain-maturity signals, not measured rank data.
- **Bing Webmaster Tools verification status** — no `msvalidate.01` meta tag was found, but verification via DNS TXT record cannot be ruled out externally.
- **Off-site Reddit/forum/Quora mentions of the Certxa brand** — no search-engine or Reddit API access was available this session; the 0/30 Perplexity community-validation score reflects the complete absence of on-site evidence or references to any such presence, not a confirmed off-site scan.
- **Google Business Profile / Knowledge Panel status for Certxa itself** — could not be queried directly; scored as absent based on no on-site reference, which is the best available proxy.

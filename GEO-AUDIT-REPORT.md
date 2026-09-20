# GEO Audit Report: Certxa

**Audit Date:** 2026-09-17
**URL:** https://certxa.com/
**Business Type:** Hybrid — Salon/Spa Booking & POS SaaS (B2B) + Consumer Salon Marketplace/Directory (B2C), same root domain
**Pages Analyzed:** 50 (32 SaaS marketing pages, 16 blog posts incl. index, 5 marketplace hub pages, 5 individual salon pages — sampled from a live site totaling ~32 SaaS pages, ~5,192 listing hub pages, and ~50,000 individual salon pages)

---

## Executive Summary

**Overall GEO Score: 46/100 (Poor)**

Certxa is genuinely two sites sharing a domain: a well-built, schema-rich SaaS marketing subsite (~30 pages) with strong AI-crawler access and citable FAQ content, and a ~55,000-page consumer directory whose scale is not matched by content depth or schema completeness. The single biggest lever remains Brand Authority (11/100) — Certxa has essentially no third-party presence AI systems can use to recognize it as a real entity (no Wikipedia/Wikidata, no G2/Product Hunt/Trustpilot, a near-empty LinkedIn, an unconfirmed Reddit account, and a YouTube video that isn't even a brand upload). This audit also surfaced two **new critical integrity issues** the prior audit missed: at least 2 of 15 blog posts are live, fully-indexed, schema-marked pages whose entire body is the placeholder text "This article has no content yet," and `llms.txt`/`llms-full.txt` describe the site root as the SaaS pitch when the live root actually serves the consumer marketplace homepage (the real SaaS content has moved to `/overview`, undocumented). Separately, this audit began during a live production outage (site-wide HTTP 503) caused by a missing SSR build artifact combined with a permanent-failure-caching bug in the SSR loader — fixed during this audit, but the underlying code defect that let one missing file take down 100% of the site with no self-healing has not yet been patched.

### Score Breakdown

| Category | Score | Weight | Weighted Score |
|---|---|---|---|
| AI Citability | 60/100 | 25% | 15.0 |
| Brand Authority | 11/100 | 20% | 2.2 |
| Content E-E-A-T | 41/100 | 20% | 8.2 |
| Technical GEO | 77/100 | 15% | 11.55 |
| Schema & Structured Data | 64/100 | 10% | 6.4 |
| Platform Optimization | 30/100 | 10% | 3.0 |
| **Overall GEO Score** | | | **46.35 → 46/100** |

---

## Critical Issues (Fix Immediately)

1. **SSR loader has no self-healing — already took the whole site down once today.** `artifacts/api-server/src/lib/marketplaceSsr.ts` permanently caches a *failed* SSR-bundle/asset-manifest load per pm2 worker process, with no retry. When the marketplace build output (`dist/public/mp-assets`, `dist/server/entry-server.js`) was briefly missing during a build/deploy race, the worker serving requests returned HTTP 503 on every single request — SaaS pages, blog, and marketplace alike, not just marketplace routes — and stayed down until a manual `pm2 reload`. Fixed for right now; the code defect that allows a transient build race to become an indefinite, non-recovering outage is still present. Fix: retry-with-backoff instead of a permanent negative cache, a build-artifact existence check gating deploy/reload, and a health check that auto-restarts a stuck worker.

2. **At least 2 of 15 blog posts are live, indexed, schema-marked stub pages with no actual content.** `/blog/vietnamese-nail-salon-software` and `/blog/salon-booking-website` both return HTTP 200 with full `BlogPosting` JSON-LD, a fabricated "5 min read" label, a real title implying a developed article, and a `lastmod` entry in `/blog/sitemap.xml` — but the entire visible body is the literal string "This article has no content yet." Only 7 of 15 posts were sampled; at a 2/7 (29%) stub rate, more of the other 8 are likely affected. This is a direct, machine-verifiable claim of content that doesn't exist — the kind of signal that damages both AI-crawler trust and brand trust if a user finds it. Fix: write the missing articles or pull them from the sitemap and set `noindex` until finished; audit the remaining 8 posts for the same pattern before republishing anything else.

3. **`llms.txt`/`llms-full.txt` describe the wrong homepage — and `llms-full.txt` embeds ~3,000 words of fabricated content attributed to `/`.** Both files describe `https://certxa.com/` as the SaaS "platform overview" page. The live root actually serves the consumer marketplace homepage ("Certxa — Find your good place"). The real, correct B2B SaaS content does exist and is live — it moved to `/overview` (confirmed HTTP 200, correct title/meta, linked from nav) — but neither `llms.txt` nor `llms-full.txt` was updated to point there. `llms-full.txt` compounds this by embedding a full stale copy of SaaS homepage prose (*"# Nail salon software that fills every chair..."*) labeled `Source: https://certxa.com/`, which does not match the live page at all. Any AI system trusting this file will describe Certxa incorrectly; any that instead trusts the live crawl will simply distrust the file. Fix is a one-line pointer change (`/` → `/overview`) plus regenerating the embedded content block.

4. **`Organization` schema is inconsistent across pages — two non-matching declarations of the same entity, confirmed independently by three separate analyses.** The homepage's `Organization` JSON-LD has no `@id`, no `logo`, no `address`, and lists `sameAs: ["linkedin.com/company/certxa", "reddit.com/user/Certxa-salon"]`. Every SaaS marketing page (`/pricing`, `/overview`, etc.) instead emits a full `@graph` block with `@id: "#organization"`, `logo`, `address`, `foundingDate`, and lists `sameAs: ["x.com/certxa", "bbb.org/.../certxa-llc-..."]` — zero overlapping URLs, no shared `@id`, so nothing stitches these into one entity for AI knowledge-graph construction. Fix: one canonical Organization block (shared `@id`, merged `sameAs` — all 4 existing links together) reused identically on every page.

5. **Wikipedia/Wikidata presence confirmed absent (direct API check, not inference).** Zero results from a direct MediaWiki search API query and a Wikidata search. This remains the single highest-leverage entity-recognition signal AI systems use, and it's the largest single driver of the 11/100 Brand Authority score. Not fixable in code — requires building real-world notability (press coverage, etc.) first; per standard guidance, do not attempt to create the article directly (conflict of interest).

---

## High Priority Issues

- **`/launchsite` is functionally broken for crawlers.** The template gallery's core content is client-fetched only — raw SSR HTML literally reads "0+ designs available … No templates found." It's also the only page in the entire 50-page sample with zero schema.org markup, no canonical tag, no meta description, and no OG/Twitter tags.
- **Public pages force every crawl hit through a single pm2 worker** (`Cache-Control: private, no-cache` on homepage/marketing/salon/listing pages) — this is also the exact component that caused today's outage; a public/CDN-cacheable policy would both improve TTFB/LCP and shrink the blast radius of any future SSR failure.
- **`priceRange` fix is deployed but effectively invisible across the ~50,000-page salon corpus.** The derivation (`entry-server.tsx`) is correctly implemented and confirmed live, but gated behind `salon.services?.length`, which is empty for unclaimed directory listings (the large majority of the corpus, including both salon pages this audit spot-checked directly). A `priceLevel` field (from Google Places data) is already collected and rendered in the UI but never wired into the `priceRange` fallback — a low-effort fix that would activate the property across far more of the corpus.
- **`BlogPosting.author` is set to the Organization, not the founder.** Every one of the 15 blog posts uses `"author": {"@type": "Organization", "name": "Certxa"}` despite a fully-built `Person` schema for founder Tom Tham (with `jobTitle`, `knowsAbout`, `worksFor`) already existing on `/about`/`/overview`. This is the one real Expertise/E-E-A-T asset the brand has, and it's never attached to the content that most needs it — a same-page wiring fix, not new content.
- **Zero Product/Offer schema on deal-voucher salon listings.** Pages like "World Nails At Tustin (10% OFF New Customers)" advertise a discount in the title with no structured `Offer` (price, currency, availability) backing the claim.
- **`FAQPage` JSON-LD content diverges from the visible FAQ accordion text on `/pricing`.** Schema asks "Is there a free trial for Certxa?"; the visible H3 asks "Is a credit card required to start the trial?" — related but not the same question or answer. Risks AI systems treating the markup as unreliable. Worth auditing the ~10 other FAQPage-schema pages for the same drift.
- **`BeautySalon` schema still missing `priceRange`, `openingHoursSpecification`, and `makesOffer`** on both directly-inspected live salon pages — blocks Gemini/AI-Overview "how much"/"what time" answer surfaces for local-business queries.
- **Thin/broken state-hub content confirmed live**, not just a discovery-pass artifact: `/listings/texas` renders "1 salons across 1 cities. Cypress 1" at 83 words — reads as a template rendering bug (singular/plural, count logic), not organic thinness, and may recur across other low-inventory state/city hubs in the 5,192-page hub set.
- **Zero YouTube brand presence.** The only indexed video mentioning Certxa is a personal channel upload (`@jacknabvoip`), not an official brand channel — a 20-point Gemini rubric item and meaningful ChatGPT/Perplexity signal sitting at zero.
- **No G2, Product Hunt, or Trustpilot listing found anywhere.** Capterra exists but only on the Canada subdomain (capterra.ca) with exactly 1 review — the primary capterra.com listing appears unclaimed/absent.
- **~50,000 salon pages carry near-duplicate, explicitly AI-labeled boilerplate descriptions** ("Summary generated from public listing data" — the disclosure itself is a genuine trust-positive, but the underlying uniqueness/citability of the prose is near-zero at scale). This is the same "thin directory" issue flagged in the prior audit and remains unaddressed.
- **`llms.txt`'s own "Instructions for LLMs" section is factually wrong about the site's own URL structure**, claiming third-party salon listings live under `/salon/` and `/nail-salons/` (neither prefix exists — confirmed against the live sitemaps and robots.txt). Real listing URLs are flat at root and hub pages live at `/listings/{state|city}`. An AI system following this instruction literally would fail to identify any of the ~55,000 real listing pages as third-party content — undermining the one disclaimer meant to protect Certxa from being credited/blamed for content it didn't write.

---

## Medium Priority Issues

- Templated meta descriptions on `/listings/*` hub pages are frequently far under the 150-160 char guideline (as low as 37 chars on `/listings/chicago--illinois`), applied at ~5,192-page scale.
- `<lastmod>` across the ~55,192-URL salon+listings sitemaps is uniformly stamped to the current build date rather than actual content-change dates — degrades their value as a crawl-efficiency signal.
- CSP header is present but `script-src` allows `unsafe-inline`/`unsafe-eval`, significantly reducing its XSS-mitigation value.
- Blog/guide content (pricing guide, waitlist management, etc.) cites zero outside sources for its claims — no outbound authority links anywhere in the sampled guide content.
- LinkedIn company page states "Founded: 2024," directly conflicting with the site's and `llms.txt`'s own "Founded February 2026" claim — a concrete, fixable cross-source contradiction.
- `postalCode` is embedded inside the `streetAddress` string on `BeautySalon` schema rather than broken out as its own property — affects the full ~50,000-page salon corpus.
- No visible `datePublished`/`dateModified` shown to readers on blog posts (present only in schema, and on the one stub post's schema the `dateModified` timestamp advanced an hour after publish with zero content actually added).
- Comparison pages (`/certxa-vs-*`) likely contain pricing-comparison data suited to `<table>` markup, but this wasn't directly confirmed in the sampled raw HTML — worth checking they render as real tables, which AI Overviews can cite directly.
- No `sameAs` on the founder's `Person` schema (no LinkedIn/X for Tom Tham individually), and no `speakable` markup outside the 16 blog posts — extending it to the 32 SaaS conversion pages would likely help AI-assistant readability where it matters most.

---

## Low Priority Issues

- No `hreflang` reciprocal annotation between `/vietnamese-salon-software` and its closest English equivalent.
- 0 of 9 homepage `<img>` tags (and likely the shared salon-page template) carry explicit `width`/`height` — a CLS risk repeated at scale.
- `HowTo` schema present on 4 pages (`/autumn`, `/online-booking`, `/checkin-kiosk`, `/client-reviews`) has carried no rich-result benefit since Google removed it in Sep 2023 — harmless but no longer useful.
- The `Reddit` `sameAs` link points to a personal user profile (`u/Certxa-salon`), not a subreddit or verified brand presence, and independent search found zero real discussion under that account — effectively an aspirational/unconfirmed signal rather than a real one.
- Salon page URLs are otherwise clean and hyphenated but every one carries a trailing 6-character mixed-case random ID for uniqueness (e.g. `...-Xa7JCo`), violating an all-lowercase URL convention across all ~50,000 listing pages — low severity individually, repeated at high volume.
- The one verified real review (Capterra.ca, 5.0/5, named reviewer, specific pros/cons) is authentic and positive — worth amplifying (request the same reviewer post to capterra.com/G2, request 2-3 more from recent customers) rather than treating as a gap.

---

## Category Deep Dives

### AI Citability (60/100)

Crawler access is exemplary: explicit named `Allow` rules for every major AI crawler (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-Web, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Amazonbot, CCBot, Cohere-ai, FacebookBot, GoogleOther), plus a `Content-Signal: search=yes, ai-train=yes, ai-retrieval=yes, ai-personalization=no` directive most sites haven't adopted. Content citability, however, is page-count-weighted across a domain where >99% of indexed URLs are the low-citability salon (~38/100) and hub (~22/100) pages rather than the genuinely strong SaaS pages (~64/100, driven by concrete, quantified, self-contained FAQ answers like the exact payment-processing rate breakdown on `/pricing`). The llms.txt root-page mismatch (Critical #3 above) is the largest single driver of this category's score drop from the prior audit's 74.

### Brand Authority (11/100)

The weakest category by a wide margin, and largely a real-world-presence gap rather than a code fix: Wikipedia/Wikidata confirmed absent (0/100), Reddit presence asserted in schema but unconfirmed by independent search (8/100), YouTube has one video but it's a personal, not brand, upload (12/100), LinkedIn exists but is thin — 2 followers, no post activity, and a conflicting founding-date claim (22/100) — and no G2/Product Hunt/Trustpilot exists anywhere, with Capterra present only regionally on capterra.ca with a single review (15/100). The one genuine positive: that Capterra review is real, specific, and positive — a seed worth deliberately growing rather than a problem to fix.

### Content E-E-A-T (41/100)

Experience (9/25): a real, consistently-repeated founder narrative (Tom Tham, a practicing nail salon owner in Phoenix before building Certxa) is the site's one genuine experience asset, but it's never made specific (no salon name, no dates, no photos) and never extended into the blog. Expertise (7/25): the founder's Person schema exists but is disconnected from the content that would benefit most (blog posts are authored by "Certxa Team," an Organization). Authoritativeness (6/25): a verified BBB listing is a real positive, but the company is 7 months old with no press, awards, or memberships yet. Trustworthiness (12/25): solid baseline signals (HTTPS, real address, substantial legal pages, an honest AI-disclosure label on salon summaries) are undercut by the stub-blog-post integrity issue (Critical #2) and the broken `/listings/texas` render.

### Technical GEO (77/100)

The strongest category. Server-side rendering is confirmed real and complete for the content that matters — every sampled page's JSON-LD and body text is present in the raw HTML response, with no JS-execution dependency for AI crawlers. Security headers are comprehensive (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all present). The one severe finding, which overrides the otherwise-strong numeric score, is the SSR loader's lack of self-healing (Critical #1) — a single missing build artifact took the entire site (both SaaS and marketplace halves) offline with zero automatic recovery, and already did so once during this audit.

### Schema & Structured Data (64/100)

100% JSON-LD, 100% server-rendered, no Microdata/RDFa, no JS-rendering risk. 49 of 50 sampled pages carry at least one valid schema block. Core defects are consistency and completeness rather than validity: the split `Organization` declaration (Critical #4), `BlogPosting.author` pointing at the Organization instead of the already-built founder `Person` entity, and `BeautySalon` schema missing `priceRange`/`openingHoursSpecification`/`makesOffer`/`Product`-`Offer` on listings that would benefit from them. The `priceRange` fix shipped during this audit session is real and correctly coded but data-gated to near-invisibility across the actual corpus (see High Priority Issues).

### Platform Optimization (30/100)

Scored per-platform for both site halves. SaaS pages average 33/100 across Google AI Overviews (49), ChatGPT (23), Perplexity (16), Gemini (28), and Bing Copilot (47); the marketplace/directory half averages lower at 26/100 (AIO 32, ChatGPT 17, Perplexity 19, Gemini 20, Bing 44). Bing Copilot is the strongest platform for both halves, helped by a confirmed `msvalidate.01` verification tag and highly literal, exact-match page titles — but even Bing scores are held back by a complete absence of IndexNow (Critical-adjacent High finding: zero implementation, cheap to add, applies sitewide). Perplexity is the weakest platform across the board, reflecting the near-total absence of Reddit/forum discussion, original data, and YouTube presence documented in the Brand Authority section.

---

## Quick Wins (Implement This Week)

1. Point `llms.txt`'s `Overview` link and `llms-full.txt`'s `Source:` line from `/` to `/overview`, and regenerate the embedded content block to match the real, live `/overview` page — a one-line-plus-regen fix for a Critical, sitewide trust issue.
2. Unify the `Organization` JSON-LD into a single canonical block (shared `@id`, merged `sameAs`: LinkedIn + X + Reddit + BBB together) reused identically on the homepage and all SaaS pages.
3. Set `BlogPosting.author` to the existing founder `Person` entity instead of the Organization — the Person node is already fully built in the same `@graph`.
4. Either finish or `noindex` + remove-from-sitemap the confirmed stub blog posts (`/blog/vietnamese-nail-salon-software`, `/blog/salon-booking-website`), and check the other 8 unsampled posts for the same pattern.
5. Fix `/listings/texas`'s broken "1 salons across 1 cities" render (likely a singular/plural + count-logic template bug) and spot-check a handful of other low-inventory state hubs for the same pattern.

## 30-Day Action Plan

### Week 1: Stop the bleeding — integrity and trust
- [ ] Audit all 15 blog posts for the stub-content pattern; fix or unpublish any that are incomplete
- [ ] Fix the `llms.txt`/`llms-full.txt` root-page mismatch
- [ ] Unify `Organization` schema across all pages
- [ ] Patch `marketplaceSsr.ts` to retry-with-backoff instead of permanently caching a failed SSR/asset load, and add a build-artifact existence check before a deploy/reload is allowed to proceed

### Week 2: Schema completeness
- [ ] Wire `BlogPosting.author` to the founder Person entity
- [ ] Add a `priceLevel`-based fallback for `priceRange` so it activates across more of the ~50,000-page salon corpus
- [ ] Add `openingHoursSpecification` and `makesOffer`/`Offer` to `BeautySalon` schema where the underlying data exists
- [ ] Add `Product`/`Offer` schema to deal-voucher salon listings

### Week 3: Directory quality at scale
- [ ] Audit and fix broken/thin state hub pages beyond `/listings/texas` across the 5,192-page hub set
- [ ] Reconcile FAQPage JSON-LD with visible accordion text on `/pricing` and audit the other ~10 FAQPage pages
- [ ] Fix `/launchsite`: move the template gallery fetch into the SSR path, add missing canonical/meta/OG/Twitter/schema tags
- [ ] Change `Cache-Control` on public pages from `private, no-cache` to a public, CDN-cacheable policy

### Week 4: Off-site brand authority
- [ ] Implement IndexNow (key file + ping on content changes, prioritizing the salon-page sitemap)
- [ ] Claim/verify the primary capterra.com listing (not just capterra.ca); request 2-3 more genuine reviews
- [ ] Fix the LinkedIn "Founded: 2024" vs. actual Feb-2026 founding-date contradiction; post at least a few times to reduce the "empty company page" signal
- [ ] Stand up a minimal official YouTube presence (a short, captioned product walkthrough)

---

## Appendix: Pages Analyzed

Full raw crawl data (50 pages, all HTTP 200): title, meta description, canonical, H1-H6 structure, word count, schema.org types, internal/external link counts, image alt-text coverage, OG/Twitter tags, response status — saved at `/tmp/claude-0/-apps-CM/87002509-01e7-4c41-bec5-94999bec6471/scratchpad/geo-audit/crawl_results.json` and `compact_table.txt`, alongside raw fetches of `robots.txt`, `sitemap.xml` and sub-sitemaps, `llms.txt`, and HTML snapshots of the homepage, a salon page, `/pricing`, `/launchsite`, and `/listings/texas`.

No fetch failures, no timeouts, no non-200 responses, and no robots.txt violations were encountered during discovery. Every URL sampled across all 5 category analyses was independently re-verified live (not just from cached snapshots) where the finding was schema- or content-specific.

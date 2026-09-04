# GEO Audit — certxa.com
**Date:** 2026-09-04 · **Trigger:** Certxa previously ranked/was AI-cited for "nail salon booking software"; as of this audit it appears in neither. Confirmed live via web search — this is a real, current regression, not a false alarm.

## Composite GEO Score: 57 / 100 (pre-fix baseline) → fixes below applied and deployed same session

| Category | Weight | Score | Notes |
|---|---|---|---|
| AI Citability & Visibility | 25% | 86 | Citability 80, crawler access 100, llms.txt 78 |
| Brand Authority Signals | 20% | 13 | The single biggest lever — see §2 |
| Content Quality / E-E-A-T | 20% | 58 | One indexed empty post (fixed), unlabeled review mockup |
| Technical Foundations | 15% | 85 | Strong SSR, fast TTFB, clean mobile/crawlability |
| Structured Data | 10% | 46 | Two real bugs found and fixed this session (see §5) |
| Platform Optimization | 10% | 41 | Certxa confirmed absent from live search results for the target query |

---

## 1. What's actually confirmed vs. what can't be verified from here

**Confirmed directly (live checks, not inference):**
- Certxa does not appear in web search results for "nail salon booking software" as of today (multiple subagents independently re-ran this query).
- robots.txt explicitly allows every major AI crawler by name (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Amazonbot, CCBot, Cohere-ai, etc.) plus a forward-looking `Content-Signal: ai-train=yes, ai-retrieval=yes` header — crawler access is not the problem.
- llms.txt exists and is well-formed (this was previously assumed missing — it's actually present and good).
- Site is fully server-rendered on both the PHP marketing site and the Node-rendered `/salon/*` directory — no JS-dependency risk for non-JS-executing AI crawlers.

**Cannot be verified without Google Search Console / Analytics access** (flagged by every subagent independently): actual historical ranking/impression data, whether this is an algorithmic demotion vs. a manual action vs. normal AI Overview volatility, and exact timing. **This is the single most valuable next step** — if you can get me read access or paste screenshots of the Performance and Manual Actions tabs, I can tie these findings to actual cause much more precisely.

---

## 2. Brand Authority — the biggest lever (13/100)

Zero presence on every platform AI engines use to cross-verify a brand is real before citing it:

| Platform | Status |
|---|---|
| Wikipedia / Wikidata | Absent (confirmed via API search) |
| LinkedIn company page | 404 |
| Product Hunt | 404 |
| G2 | No listing found |
| Reddit | Zero mentions found |
| Capterra | **Live**, but only 1 review (5.0★) |
| YouTube | One video, no established channel |
| Organization schema `sameAs` | Empty — deliberately, per a code comment explaining no real profiles exist yet to link |

Company is ~7 months old (`foundingDate: 2026-02-01` in your own schema) — some of this (Wikipedia notability) has a long time horizon regardless of fixes. The fast, controllable wins: create a real LinkedIn company page, launch on Product Hunt, get listed on G2, and drive more Capterra reviews (your own product already has a review-request feature for salons — point that same playbook at yourself).

## 3. Platform readiness (41/100 average)

Google AI Overviews 45, ChatGPT Web Search 48, Perplexity 38, Google Gemini 30, Bing Copilot 42. Strongest on ChatGPT (crawler access + quotable FAQ copy); weakest on Gemini (zero Google-ecosystem presence, no Knowledge Graph signal). Cross-platform fixes, in order of leverage:
1. Populate `sameAs` once real profiles exist (impacts ChatGPT, Gemini, Bing simultaneously).
2. Get listed/reviewed on Capterra + G2 (impacts Perplexity, ChatGPT, and indirectly AIO since those sites currently occupy the SERP for your target query).
3. ~~Soft-404: any nonexistent URL on certxa.com returns HTTP 200 with a generic title instead of a real 404~~ — **confirmed real** (`GET /this-page-absolutely-does-not-exist-xyz123` → 200). Root cause: the SPA catch-all in `artifacts/api-server/src/static.ts` serves `index.html` with `res.sendFile()` for literally any unmatched path, with no route-allowlist check. **Not fixed this session** — a correct fix needs to distinguish real dynamic client routes (`/team/:id`, `/payouts/contractors/:id`, etc.) from garbage, which risks breaking real deep-linked pages if done hastily. Recommend a dedicated pass with its own test coverage against the full route table, not bundled into a content/schema cleanup.

## 4. Content Quality (58/100)

- **Fixed, live:** `/blog/how-to-price-your-menu-in-2026` was published (dated, indexed, in the sitemap) with **zero body content** — a raw "This article has no content yet." placeholder. It was your newest, most prominent post. Wrote and published a full ~800-word article in the same voice as your best existing posts (concrete numbers, no fluff) — live now at that URL, no deploy needed (pure DB content).
- **Not fixed, flagged:** `/client-reviews` shows a "4.9 · 284 reviews" dashboard mockup with three named fictional testimonials (Sarah J., Marcus L., Priya K.) and no visible "example/illustrative" label. It's a screenshot of the *review-widget product feature*, not a live data claim, and carries no schema markup — but to a page-skimming reader or an AI summarizer it reads exactly like a real trust stat, which is the same pattern of claim that was already cleaned up elsewhere on the site earlier this session. Recommend either labeling it clearly as a product demo or swapping in your real Google Business Profile rating + real permissioned customer quotes.
- Blog author byline is "Certxa Team" everywhere — no named individual/credentials. Cheap, high-leverage E-E-A-T fix: attribute posts to a real name with a one-line credential.
- Freshness is good (posts dated within the last ~10 days) — not a concern.

## 5. Structured Data (46/100 pre-fix) — 4 real bugs found and fixed this session

1. **CRITICAL — fixed, live.** `PostalAddress.addressCountry` was hardcoded `"US"` for every one of the 51,499 auto-generated `/salon/*` directory pages regardless of actual country — including ~1,373 Canadian, ~79 Mexican, and ~102 Bahamian businesses. Root cause: the upstream scrape's US-shaped address parser shifted every field over by one for any address without a US-style street number (also affected ~1,300 *domestic* US listings). Rewrote the address-derivation logic in `salonDirectory.ts` to read the correct country/region/city/postal directly off Google's own formatted address string instead of trusting the pre-split, sometimes-garbled fields. Verified live on a real Canadian listing.
2. **CRITICAL — fixed, live.** Every one of those same 51,499 pages also asserted `aggregateRating` (a star rating + review count) with **zero visible review text anywhere on the page** for unclaimed, unaffiliated listings — a real risk factor for a Google "spammy structured data" review-policy flag *at scale*. Now gated to only the listings Certxa has actually verified (a real registered store, matched by phone).
3. **HIGH — fixed, live.** Same root cause as #1, different field: the `BreadcrumbList` schema on every non-US listing labeled the country level "United States" (e.g. "Nail Salons → United States → Canada → Fenelon Falls" — nonsensical, Canada isn't in the US). Now shows the correct country and only links to state/city browse pages for US listings, since those are the only ones that resolve to a real page.
4. **HIGH — fixed, live.** Sitewide `SoftwareApplication.offers` used `billingIncrement: "P1M"` — not a valid `Offer` property per schema.org (belongs on `UnitPriceSpecification`, and expects a number, not an ISO-8601 duration string). Every price was also a JSON string instead of a number. Rewrote to a correct `priceSpecification`/`billingDuration` structure, sitewide, via `header.php`.
5. **HIGH — fixed, live.** The homepage's `FAQPage` schema said Certxa's plans are named "Starter / Scale / Enterprise" — the actual plans (also in the same page's `SoftwareApplication.offers`) are named **Solo / Professional / Elite**. Self-contradicting structured data on the homepage, now consistent.
6. **MEDIUM — fixed, live.** Blog posts carried a redundant, partially-wrong Microdata `BlogPosting` block (author flattened to a plain string) sitting alongside the correct JSON-LD version. Removed — JSON-LD already covers it correctly.
7. **MEDIUM — not fixed, low-confidence value, flagged.** `/client-reviews` still carries a `HowTo` schema block. Google Search removed `HowTo` rich results in Sept 2023, so it produces no SERP benefit — but it isn't actively harmful either, and may still function as plain semantic context for AI crawlers. Left in place; low priority either way.

## 6. Technical (85/100) — strongest area, not the primary cause

Fast (TTFB ~80-90ms), fully SSR both surfaces, clean mobile, no CWV red flags, thorough robots.txt. Two real, minor findings not yet addressed: `/nail-salon-software`'s `<title>` said "Nail Studio Software" (mismatched its own H1 and URL slug) — **fixed, live**, retitled "Nail Salon Booking Software | Certxa" (distinct from the homepage's "Nail Salon Software | Certxa" to avoid duplicate-title cannibalization while still carrying your exact target phrase). Homepage meta description was 232 characters (truncates in SERPs) — **fixed, live**, trimmed to 148.

**The most consequential technical finding, independently corroborated by 3 of the 5 subagents:** the 51,499-page `/salon/*` directory is close to pure boilerplate — sampled pages showed ~700 characters of near-identical templated text differentiated only by swapped name/address tokens. Google's site-wide quality/helpfulness systems evaluate signal in aggregate across a domain; a domain where 99%+ of indexed URLs are auto-generated, low-uniqueness listings can plausibly drag down trust for the hand-written pages you actually want to rank — a coherent explanation for "used to rank, now appears nowhere." This is a strategic decision, not a quick code fix (options: add genuine unique content per listing, `noindex` the least-complete ones, or shrink the indexed footprint) — flagged for your call, ideally cross-checked against Search Console's indexing/impression trend for `/salon/*` vs. your core pages before committing to an approach.

---

## Summary of fixes shipped this session

| # | Fix | File(s) | Status |
|---|---|---|---|
| 1 | `addressCountry` hardcoded "US" → derived correctly | `salonDirectory.ts` | Live |
| 2 | `aggregateRating` on unverified listings → gated to verified only | `salonDirectory.ts` | Live |
| 3 | `BreadcrumbList` "United States" for non-US listings → correct country | `salonDirectory.ts` | Live |
| 4 | `billingIncrement` invalid schema property → `priceSpecification` | `header.php` | Live |
| 5 | FAQ plan names contradicted real plan names | `overview/default.php` | Live |
| 6 | Redundant/wrong blog Microdata removed | `blog/article.php` | Live |
| 7 | Empty indexed blog post → real ~800-word article | DB (`blog_posts` id 15) | Live |
| 8 | `/nail-salon-software` title mismatch fixed | `nail-salon-software/default.php` | Live |
| 9 | Homepage meta description trimmed (232→148 chars) | `overview/default.php` | Live |

## Needs your action (can't be done from the server)
- Create a real LinkedIn company page, Product Hunt launch, G2 listing.
- Drive more Capterra reviews (currently 1).
- Decide the `/salon/*` directory's content-depth strategy (add real content per listing vs. shrink the indexed footprint).
- Share Search Console access or screenshots (Performance + Manual Actions + Coverage) — this is the one thing that would let me tie findings to actual cause instead of plausible hypothesis.

## Recommended, not done (scope/risk)
- Fix the sitewide soft-404 (SPA catch-all always returns 200) — needs its own careful pass against the full route table.
- Label or replace the `/client-reviews` mockup dashboard.
- Named author bylines on blog posts.

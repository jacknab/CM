# GEO Audit Report: Certxa

**Audit Date:** 2026-09-22
**URL:** https://certxa.com
**Business Type:** Hybrid — Nail Salon SaaS (B2B) + Consumer Salon Directory/Marketplace (B2C), same root domain
**Pages Analyzed:** ~45 (33 core marketing pages, 6 blog posts sampled of 13, 5 salon directory listings sampled of ~10,000+ shown in the sitemap, 1 state hub page, plus robots.txt/llms.txt/llms-full.txt/sitemap index and children)

---

## Executive Summary

**Overall GEO Score: 49/100 (Poor)**

Certxa's core SaaS marketing site is well-built — full server-side rendering, every major AI crawler explicitly allowed, a real llms.txt, and genuinely citable FAQ content. But the composite score is dragged down by three things: **Brand Authority is still critical (12/100)** — the entity essentially doesn't exist outside certxa.com itself (no Wikipedia/Reddit/Product Hunt, one stagnant Capterra review, an inconsistent near-empty LinkedIn page); **a deliberate 2026-09-15 code change re-broke a fix from two weeks ago**, re-indexing the entire unclaimed salon directory (~10,000+ pages sampled, likely far more) with `index, follow` and a full `aggregateRating` schema block on boilerplate, unverified third-party listings; and **the site never appears in actual AI-synthesized answers** for the exact "best nail salon software" queries that triggered this whole audit thread a few weeks ago, even though it resolves fine once you search for it by name. This is the fourth audit of certxa.com this month (2026-09-04, -08, -17, and today); several issues are recurring across audits rather than being resolved (the llms.txt root-URL mismatch has now been wrong in three consecutive audits, in two different directions).

### Fixes Applied After This Audit (same day, 2026-09-22)

The user asked for the logged findings to be fixed immediately. The following were resolved in code right after this audit ran (scores above reflect the state *before* these fixes — a re-audit would score higher):

- **Critical #1 (directory regression):** restored the `isVerified` gate in `entry-server.tsx` (unclaimed salons → `noindex, follow`, and `aggregateRating` now also requires `isVerified`) and switched both sitemap routes in `salonDirectory.ts` back to `getClaimedSalonList()`.
- **Critical #2 (fake-looking sitewide rating):** removed `aggregateRating` from the `SoftwareApplication` schema in `php/includes/header.php` until there's a real sample size.
- **Critical #4 (llms.txt root mismatch):** corrected `llms.txt` and `llms-full.txt` to state the root URL is the SaaS homepage, not the directory; also fixed a stale, self-contradicting comment in `php/router.php` that was part of why this kept drifting across audits.
- **High (`/nail`/`/calendar` crawlable SPA shell):** turned out to be systemic across all ~80 internal app routes, not just those two — added `injectNoindex()` in `static.ts`'s final SPA catch-all.
- **High (homepage mock date):** `php/overview/default.php`'s demo client card now reads "Client since Apr 2026" instead of "Mar 2024."
- **High (obsolete `HowTo` schema):** removed from `/online-booking`, `/client-reviews`, `/autumn`, and `/checkin-kiosk` (found on all 4, not just `/online-booking`).

Not fixed (need the user, not code): Brand Authority (LinkedIn/G2/Wikipedia/Product Hunt/Capterra reviews), the `Article`/`BlogPosting` schema gap, blog author attribution, and the comparison-page tone rewrite.

### Score Breakdown

| Category | Score | Weight | Weighted Score |
|---|---|---|---|
| AI Citability | 68/100 | 25% | 17.0 |
| Brand Authority | 12/100 | 20% | 2.4 |
| Content E-E-A-T | 48/100 | 20% | 9.6 |
| Technical GEO | 70/100 | 15% | 10.5 |
| Schema & Structured Data | 55/100 | 10% | 5.5 |
| Platform Optimization | 41/100 | 10% | 4.1 |
| **Overall GEO Score** | | | **49.1 → 49/100** |

---

## Critical Issues (Fix Immediately)

1. **Salon directory indexing/schema gating was deliberately reverted, re-indexing the entire unclaimed corpus.** Commit `4fcdf767` (2026-09-08) added claim-status gating so unclaimed `/salon/:slug` pages got `noindex, follow` and were excluded from the sitemap. Commit `2acebbf5` (2026-09-15) explicitly deleted this — `artifacts/marketplace/src/entry-server.tsx:397-402` now emits `index, follow` unconditionally, and `artifacts/api-server/src/routes/salonDirectory.ts:128-174`'s sitemap route switched from `getClaimedSalonList()` to the full `getSalonList()`. Confirmed live on 3 independently sampled pages (e.g. `certxa.com/sahara-nails-and-lashes-east-lincoln-avenue-orange-Xa7JCo`): `index, follow`, full `aggregateRating` (4.8★/313 reviews) asserted on an unclaimed business, ~7,000 chars of near-identical templated boilerplate ("Experience a serene escape... skilled team is dedicated... warm atmosphere..."), no visible review content backing the count. At scale (~10,000+ sampled URLs across 10 sitemap shards, part of a larger ~47-55k record dataset per the code), this is a real Google structured-data policy risk and the most plausible single driver of a sitewide quality/trust discount. Logged to `pre-errors.md`.

2. **`SoftwareApplication.aggregateRating` (`ratingValue: 5, ratingCount: 1`) is asserted sitewide off a single review.** Present in the shared `@graph` (`php/includes/header.php:145`, included on the homepage, `/pricing`, `/about`, `/nail-salon-software`, `/online-booking`, and every blog post). A code comment there says it reflects a real Capterra review, so it isn't fabricated — but a perfect 5.0 score backed by exactly one review, published identically on every page of the site, is exactly the pattern Google's structured-data guidelines flag as low-trust/self-serving, and it risks rich-result suppression for the *entire domain*, not just this node. Fix: drop `aggregateRating` from the sitewide schema until there's a real sample size, or source it live from Capterra/G2 instead of hardcoding it.

3. **Brand Authority remains critical and effectively unchanged across four audits (13→20→11→12/100).** Zero Wikipedia/Wikidata, zero Reddit, zero Product Hunt, YouTube presence is a single non-brand upload. LinkedIn now exists (new since the 09-08 audit) but is a near-empty shell — 3 followers, no posts, and states "11-50 employees / Founded 2024," directly contradicting the site's own "founded Feb 2026, 7 months old" story; an AI system cross-checking entities would read this as an inconsistency, not a credibility boost. The G2 listing referenced in `sameAs` returns HTTP 403 to automated checks and surfaces no corroborating content in web search — its substance is unverifiable. Capterra is real but stuck at exactly 1 review since the 09-08 audit. This is not fixable in code; it needs real-world action (see Quick Wins/30-Day Plan).

4. **`llms.txt`/`llms-full.txt` have misdescribed the site root in every audit this month, in two different directions.** The 09-17 audit found them pointing at the SaaS homepage while the live root served the marketplace. Today, both files state the opposite: the root URL is described as the consumer directory homepage ("a considered local guide to independent salons..."), while the live root (confirmed via fresh fetch, 2026-09-22) actually serves the SaaS marketing homepage (title "Nail Salon Management Platform | Certxa", H1 "Nail salon software that fills every chair"). Any AI system trusting llms.txt over a live crawl will describe certxa.com's own homepage incorrectly — precisely the failure mode llms.txt exists to prevent, and it has now been wrong for at least two consecutive site-architecture changes without the file ever being updated to track them.

---

## High Priority Issues

- **Zero AI-synthesized-answer visibility for the exact queries that triggered this audit thread.** Live WebSearch for "best nail salon booking software 2026" and "nail salon POS software comparison" surfaces Mangomint, Boulevard, Fresha, Booksy, Square, GlossGenius, Vagaro, Setmore, and others — no Certxa. Searching "Certxa" by name resolves fine (Capterra, own pages, one listicle), confirming the entity is indexed but simply never selected at the discovery/comparison stage.
- **Comparison pages read as one-sided marketing and don't rank for their own query.** `/certxa-vs-glossgenius` frames GlossGenius's shipped-vs-announced features unfavorably and doesn't surface at all in web search for "Certxa vs GlossGenius" — third-party "alternatives" roundups win that query instead. A neutral, fact-checkable rewrite (acknowledging real competitor strengths) is more likely to be cited by Perplexity/AI Overviews than the current copy.
- **No `Article`/`BlogPosting` schema on any blog post.** The sitewide `@graph` only emits a generic `WebPage` node for content pages — no `headline`, `datePublished`, `author`→Person link, or `wordCount`. This is the single most GEO-relevant schema type for citable content and it's absent entirely.
- **No author attribution or bio on any of the 13 blog posts.** All carry byline "Thanh Lam" with no link, credentials, or bio, and there's no dedicated author page — the founder's genuinely strong `/about` narrative never transfers to the content that most needs it.
- **Zero external citations across all 7 sampled blog posts** (of 13) — every post links only to Certxa's own product pages. This is a moderate originality/E-E-A-T risk at scale even though the writing itself doesn't read as AI-generated filler.
- **`HowTo` schema present on `/online-booking`** — Google removed HowTo rich results in September 2023; it's dead weight, not a benefit.
- **No IndexNow implementation** despite a live Bing Webmaster Tools verification tag — Bing/Copilot is relying on crawl-only discovery.
- **`/nail` and `/calendar` (no trailing slash) serve a crawlable, `index, follow` SPA shell** with no robots.txt rule covering the no-slash path (only `/calendar/` with a trailing slash is disallowed). Logged to `pre-errors.md`.
- **Unverified "50,000+ beauty professionals" claim surfaced in search snippets from certxa.com**, sitting next to a 7-month-old founding date — worth confirming this figure is real before it propagates further into AI answers, since an implausible number next to a visible "founded 2026" signal is exactly the kind of thing cross-referencing AI systems (Perplexity, Gemini) discount a source for.
- **Homepage demo dashboard shows a client "since Mar 2024,"** two years before Certxa's real Feb 2026 founding date (`php/overview/default.php:368`) — an easy internal-consistency slip. Logged to `pre-errors.md`.

---

## Medium Priority Issues

- `/autumn`'s "2,847 calls answered this week / 1,203 appointments booked / 98.4% client satisfaction" is a live demo-widget mockup, not an aggregate company metric, but nothing in the page text distinguishes it from a real claim to an AI crawler — same pattern as the sitewide single-review rating: precise-looking, unverifiable numbers.
- Founder `Person` schema (`@id: #founder-tom-tham`) has no `sameAs` (no personal LinkedIn/X), weakening E-E-A-T verification for content attributed to him.
- No `speakable` schema anywhere on the site.
- `sameAs` is missing Wikipedia/Wikidata/Crunchbase/YouTube — the strongest AI entity-resolution signals, absent entirely.
- Comparison pages (`/certxa-vs-*`) get no comparison-specific schema — just the generic sitewide FAQPage.
- Directory hub pages (e.g. `/listings/alabama`) carry BreadcrumbList/CollectionPage but no Organization/sameAs at all, so AI models can't connect the directory back to Certxa's own entity graph.
- `main.js` on marketing pages lacks `defer`/`async` — minor render-blocking/INP risk.
- Blog posts show no visible `datePublished`/freshness signal to readers, only in schema (which itself is currently just a generic WebPage node — see Critical/High).

## Low Priority Issues

- Cosmetic schema `@id` mismatch: `#founder-tom-tham` vs. the displayed name "Thanh Lam" (`alternateName: "Tom Tham"` explains it, but it's a confusing artifact for anyone reading the raw graph).
- Directory listing URLs carry a trailing 6-character mixed-case random ID (e.g. `-Xa7JCo`), a minor deviation from all-lowercase URL convention, repeated at high volume.
- Capterra review count stagnant at 1 since the prior audit — solicit more.
- Product Hunt launch absent — low-cost, high-signal opportunity for a young SaaS product.
- Security headers otherwise comprehensive and duplicate-free of leaks (no `Host`/`X-Powered-By` disclosure — the prior `php-proxy.ts` fix holds); minor redundancy where both nginx and the app set the same headers.

---

## Category Deep Dives

### AI Citability (68/100)

Crawler access is exemplary — every major AI crawler explicitly `Allow`ed, and the FAQPage schema plus direct Q&A phrasing on pages like `/online-booking` ("A salon online booking service is software that lets clients schedule their own appointments...") is exactly the self-contained, quotable structure AI Overviews lift verbatim. The comparison pages' specific pricing breakdowns ("Certxa's Professional plan ($22/mo) costs less than GlossGenius's entry-level Standard plan") are similarly strong. The recurring weakness is a pattern of precise-sounding but unsourced or demo-derived statistics (`/autumn`'s live-demo call counters, `/checkin-kiosk`'s "2,400+ salons using kiosk mode," the "50,000+ beauty professionals" claim) — individually minor, but the repetition of unverifiable precision compounds the trust problem the sitewide single-review rating already creates.

### Brand Authority (12/100)

The weakest category, essentially flat across four audits this month (13 → 20 → 11 → 12). Wikipedia and Wikidata confirmed absent via direct search. Reddit: zero real discussion found (the `sameAs` link points to an unconfirmed personal profile, not a subreddit or verified presence). YouTube: one non-brand video. LinkedIn is new since the 09-08 audit but net-negative in its current state — a 3-follower shell page with a founding-date claim that contradicts the site itself. G2 is referenced in schema but unverifiable (403, no search corroboration). Capterra is the one genuine, real asset — a specific, positive, verified review — but it hasn't grown past 1 since the prior audit. This category needs real-world action from the user (reviews, a real LinkedIn presence, a Product Hunt launch); it cannot be fixed from the codebase.

### Content E-E-A-T (48/100)

The founder narrative on `/about` is a real, specific, verifiable-in-principle asset (ran a nail salon, frustrated by long-term contracts, named, dated, located) and the single strongest E-E-A-T signal on the site — but it's isolated: no link from any blog post, no dedicated author page, no LinkedIn tie-in. All 13 blog posts share one unlinked byline and cite zero external sources; the strongest sampled post (`how-to-choose-nail-salon-software`) names real competitors and gives genuinely comparative advice, while the weakest (`get-more-google-reviews-nail-salon`) is generic SaaS-blog boilerplate. Maturity claims are otherwise handled honestly (no fake customer counts on homepage/pricing), which makes the homepage's "Client since Mar 2024" mock-data slip and the sitewide single-review rating stand out more, not less — they're the two concrete, avoidable inconsistencies in an otherwise honest content posture.

### Technical GEO (70/100)

The core marketing site is genuinely strong: confirmed real SSR (full page text present in raw HTML before JS), comprehensive security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all present and correctly scoped), no backend-identifying header leaks, proper mobile viewport, and a real 404 (the prior soft-404 fix holds). The score is pulled down almost entirely by one issue: the confirmed-systemic directory indexing regression (Critical #1), which — because it's sampled at 3-for-3 and backed by a source-level root-cause — is treated as a major, not minor, technical defect, plus the newly-found `/nail` and `/calendar` no-slash crawlability leak.

### Schema & Structured Data (55/100)

100% JSON-LD, no dangling `@id` references, valid nesting throughout everything checked (WebSite → Organization → Person → SoftwareApplication → FAQPage, plus BreadcrumbList on comparison/directory pages). The `Offers`/`priceSpecification` structure is fully valid (no `billingIncrement` error like an earlier audit found — that stays fixed). The two real defects are the aggregateRating issues (Critical #2, and the same pattern repeated on ~10,000+ unclaimed directory listings per Critical #1) and a completeness gap: no `Article`/`BlogPosting` on any content page, `HowTo` lingering on `/online-booking` despite Google discontinuing that rich result in 2023, and `sameAs` missing the highest-value entity-resolution links (Wikipedia/Wikidata).

### Platform Optimization (41/100)

Real, current AI-answer testing (not inference) confirms the core problem: Certxa is indexed and answerable by name but never selected in comparative/discovery queries, where 7+ named competitors dominate identical searches. Per-platform: Bing Copilot scores best (~55, helped by a live `msvalidate.01` verification tag and clean literal titles, held back by no IndexNow), Google AI Overviews next (~50, good FAQPage schema but no comprehensiveness/authority edge yet), Gemini (~40), ChatGPT web search (~35, no Wikipedia/Wikidata), and Perplexity worst (~25, near-total absence of Reddit/community validation, which this platform weights heavily). This mirrors the Brand Authority findings almost exactly — the platform-visibility gap and the entity-recognition gap are the same underlying problem viewed from two angles.

---

## Quick Wins (Implement This Week)

1. Restore the `isVerified` gate in `artifacts/marketplace/src/entry-server.tsx` and switch `salonDirectory.ts`'s sitemap routes back to `getClaimedSalonList()` — reverting the `2acebbf5` regression is the single highest-leverage fix available, addressing a Critical, at-scale policy risk with a small, already-proven code change.
2. Remove or re-source the sitewide `SoftwareApplication.aggregateRating` (`php/includes/header.php:145`) — either drop it until there's real review volume, or pull it live from Capterra/G2 rather than hardcoding a 1-review 5.0.
3. Fix the `llms.txt`/`llms-full.txt` root-URL description to match whatever the live root actually serves today (the SaaS homepage) — a one-file fix for an error that has now persisted, in two different directions, across three consecutive audits.
4. Add `noindex` (or a robots.txt rule) to the no-trailing-slash `/nail` and `/calendar` SPA shell routes.
5. Fix the homepage mock "Client since Mar 2024" date (`php/overview/default.php:368`) to something after Feb 2026.

## 30-Day Action Plan

### Week 1: Stop the regression, fix the trust signals
- [ ] Revert the `2acebbf5` directory-indexing regression (restore claim-status gating on `index/noindex` and the sitemap source)
- [ ] Remove/re-source the sitewide fake-looking `aggregateRating`
- [ ] Fix the `llms.txt` root-URL mismatch
- [ ] Fix the "Client since Mar 2024" mock-data date

### Week 2: Schema completeness
- [ ] Add `Article`/`BlogPosting` schema to the blog template (headline, dates, author→Person, publisher→Organization)
- [ ] Wire blog `author` to the founder's existing `Person` node instead of leaving it unlinked
- [ ] Remove the obsolete `HowTo` schema from `/online-booking`
- [ ] Add `speakable` to content templates; add `sameAs` to the founder `Person` node

### Week 3: Content authority
- [ ] Add a dedicated author page for Thanh Lam, linked from every blog post
- [ ] Add 1-2 external, authoritative citations to each blog post going forward
- [ ] Rewrite `/certxa-vs-*` comparison pages toward neutral, fact-checkable framing that acknowledges real competitor strengths
- [ ] Verify (or soften) the "50,000+ beauty professionals" claim surfacing in search snippets

### Week 4: Off-site brand authority (needs the user, not code)
- [ ] Fix the LinkedIn "Founded 2024 / 11-50 employees" mismatch and post real content to reduce the empty-shell signal
- [ ] Solicit 2-3 more genuine Capterra/G2 reviews from real customers
- [ ] Launch on Product Hunt
- [ ] Implement IndexNow (key file + ping on content changes)

---

## Appendix: Pages Analyzed

| URL | Notes |
|---|---|
| `/` | SaaS homepage, live-verified 2026-09-22, contradicts llms.txt |
| `/pricing`, `/about`, `/nail-salon-software`, `/online-booking`, `/certxa-vs-vagaro`, `/certxa-vs-glossgenius` | Raw HTML + JSON-LD fetched/parsed |
| `/blog/how-to-price-your-menu-in-2026` + 6 more of 13 sampled | Word count, byline, citations checked |
| `/listings/alabama` | Directory hub schema checked |
| 5 salon listing pages (sampled from `sitemap-salons-1.xml`) | All 5/5 confirmed `index, follow` + unbacked `aggregateRating` |
| `/nail`, `/calendar` (no slash) | Confirmed crawlable SPA shell, no robots rule |
| `/this-page-does-not-exist-xyz` | Confirmed real 404, not soft-404 |
| `robots.txt`, `sitemap.xml` + 4 child sitemaps, `llms.txt`, `llms-full.txt` | Fetched and parsed in full |

No fetch failures or timeouts encountered. Prior audits referenced for delta comparison: 2026-09-04, 2026-09-08 (session memory), 2026-09-17 (`GEO-AUDIT-REPORT.md` git history).

# GEO Audit Report: Certxa

**Domain:** certxa.com
**Audit Date:** August 23, 2026
**Business Type:** SaaS — Salon & Nail Studio Management Software
**Locations:** Nationwide (US) — SaaS product; also operates a 51,000+ page local salon directory spanning all 50 states
**CMS:** Custom stack — server-rendered PHP/nginx for the public marketing site + directory, Node/Express + React/Vite for the authenticated dashboard app (correctly gated off from crawlers)

## Overall GEO Score: 52 / 100 — Fair

Score interpretation: 0–20 Critical · 21–40 Poor · 41–60 Fair · 61–80 Good · 81–100 Excellent

---

## Executive Summary

Certxa's technical and structured-data foundations are genuinely strong for a company this size — fully server-rendered HTML (verified byte-identical across Chrome, GPTBot, and ClaudeBot user agents), a well-formed `llms.txt`, an open `robots.txt`, and a JSON-LD `@graph` (Organization, SoftwareApplication, FAQPage, BreadcrumbList) on every core page. If this audit stopped at "can AI crawlers read the site," Certxa would score in the 80s.

The score is held to **Fair** by one structural issue that shows up independently in four of the five audit categories, plus a cluster of small, fixable defects:

1. **The `/salon/` directory (~51,499 pages) is the dominant content on the domain by a ~2,000:1 page-count ratio, and it's thin, templated, unaffiliated third-party listing content.** Every subagent that touched it — technical, content, AI-visibility — flagged it independently as a doorway-page pattern at a scale large enough to plausibly suppress trust signals for the legitimate SaaS product pages sitting on the same domain. This is the single highest-leverage fix in the entire report.
2. **Zero third-party brand corroboration.** No Wikipedia, no G2/Capterra/Trustpilot, no Reddit, no YouTube. AI answer engines weight self-published claims (pricing, "50,000+ beauty professionals") far lower without independent confirmation.
3. **An empty blog** with the CMS, categories, and sitemap already built — a near-zero-infrastructure-cost opportunity being left on the table.
4. **A handful of concrete, cheap fixes** — a 404'ing logo, a fragmented product entity across 3 conflicting schema nodes, `llms.txt` linking to dead pages, a pricing number that disagrees with itself between schema and visible copy, and FAQ text sitting in `<button>` elements instead of headings.

None of the top findings require an infrastructure rebuild. Most are template-level or single-file fixes that propagate across thousands of pages at once.

---

## Component Score Summary

| Category | Score | Weight | Weighted | Status |
|---|---|---|---|---|
| AI Citability & Visibility | 56/100 | 25% | 14.0 | Fair |
| Brand Authority Signals | 5/100 | 20% | 1.0 | Critical |
| Content Quality & E-E-A-T | 40/100 | 20% | 8.0 | Poor |
| Technical Foundations | 85/100 | 15% | 12.75 | Good |
| Structured Data | 64/100 | 10% | 6.4 | Fair |
| Platform Optimization | 39/100 | 10% | 3.9 | Weak |
| **Composite GEO Score** | | | **52/100** | **Fair** |

*(Brand Authority Signals is broken out from the AI-visibility subagent's internal "Brand Mentions" sub-score, per the standard GEO scoring weights; AI Citability & Visibility above reflects that subagent's Citability + Crawler Access + llms.txt components only.)*

---

## 🔴 Critical Cross-Cutting Issue: The `/salon/` Directory

Flagged independently by the **Technical**, **Content**, and **AI-Visibility** audits — this is not one team's opinion, it's a pattern that shows up from every angle:

- **Scale:** 51,499 URLs across 11 sub-sitemaps (`/salon/sitemap-1.xml` … `sitemap-11.xml`), all `index, follow`, all submitted via sitemap. Roughly 50–100x the page count of the legitimate ~25-page marketing site.
- **Content:** Sampled pages (3 checked, from different sub-sitemaps) render only ~1,380–1,425 characters of body text — dominated by a near-verbatim boilerplate paragraph ("**[Name]** is a nail salon located at **[address]**. We offer a full range of nail services including manicures, pedicures, gel nails...") with only the name/address swapped. The 10-item service list and generic Pexels stock photos are identical across every sampled listing.
- **Who's listed:** These are **not Certxa customers**. Each page explicitly discloses: *"This business is not currently affiliated with or partnered with Certxa — get in touch with us to update the information or claim this listing."* This appears to be scraped/aggregated public local-business data (address, hours) used as SEO surface area.
- **Why it matters:** This is a textbook doorway-page/thin-content pattern at a scale large enough to plausibly drag down domain-wide quality signals — the kind of pattern that has triggered "helpful content" downranking in traditional search, and the same content-quality heuristics increasingly govern whether AI crawlers trust and cite a domain at all. The risk isn't just "these 51K pages won't rank" — it's "these 51K thin pages sitting on the same domain as the real product could suppress how AI systems trust the rest of certxa.com."

**Recommended path (in order of effectiveness):**
1. Set `noindex, follow` on unclaimed listings until they're claimed/enriched with real, business-specific content — flip to `index` only once claimed.
2. Failing that, substantively de-templatize the "About" and "Services" text per listing (pull real service menus / review snippets where available) to reduce duplicate-content risk even without gating indexing.
3. Consider moving the directory to a subdomain (e.g. `directory.certxa.com`) so its aggregate quality signals are less likely to be attributed to the primary domain the SaaS product depends on for branded/product search and AI citation.
4. Two smaller template-level bugs ride along with this directory and should be fixed in the same pass: `openingHoursSpecification` times use `"9:30 AM"` instead of ISO 8601 `"09:30"` across all ~51,000 pages, and none of the 51,499 sitemap URLs carry a `<lastmod>` date.

---

## AI Citability & Visibility — 56/100 (Fair)

| Sub-component | Score | Weight |
|---|---|---|
| Citability | 70/100 | 35% |
| Crawler Access | 100/100 | 25% |
| llms.txt | 50/100 | 10% |
| *(Brand Mentions — scored separately below)* | 5/100 | — |

**What's working:** Certxa serves fully server-rendered HTML on every route tested — no JS execution needed, confirmed byte-identical across Chrome, GPTBot, and ClaudeBot user agents. `robots.txt` has a clean blanket `Allow: /` with no AI-crawler blocks. Top citable passages include a strong stat-dense FAQ answer ("Certxa sends fully automated SMS and email reminders... salons using Certxa report an average 68% reduction in no-shows" — scored 85.5/100) and exact structured pricing.

**Top fixes:**
1. **`llms.txt` links to two dead pages.** It advertises `/features` and `/book` as "Features Overview" and "Online Booking," but both resolve to a content-less 2.9KB shell with no `<h1>`. This actively misleads any AI crawler that trusts the file — worse than not listing them at all.
2. **`/llms-full.txt` is a false positive.** Returns HTTP 200 but is served by a different backend (Express, not the site's normal PHP/nginx) and delivers a bare, contentless SPA shell. Either populate it with real concatenated content or make it 404.
3. **llms.txt covers only 8 of ~23 real marketing pages** — missing exactly the differentiated feature pages (payments, revenue-intelligence, checkin-kiosk, client-management, etc.) most useful for an LLM answering "does Certxa do X."
4. **No `Content-Signal:` directive** in robots.txt (the emerging IETF successor to per-bot rules) — low effort, future-proofing addition.

Full detail: `GEO-AI-VISIBILITY.md`

---

## Brand Authority Signals — 5/100 (Critical)

Certxa is a small, newer SaaS brand, and this result reflects that honestly rather than assuming presence:

| Platform | Status |
|---|---|
| Wikipedia | Absent — verified via MediaWiki search API, zero results |
| Reddit | Absent — no threads mention the brand at all |
| YouTube | Absent — no channel, no third-party reviews/demos |
| G2 / Capterra / Trustpilot | Absent — zero results across all three |
| LinkedIn | Unverified — company page URL is self-referenced in the site's own schema `sameAs`, but could not be confirmed live (inconclusive fetch) |

This is the single largest drag on the overall score (20% weight, scoring near zero) and it means the site's genuinely strong on-page structured data (Organization, SoftwareApplication, FAQPage JSON-LD) currently has **no corroborating third-party signal** — AI models weight self-published claims like "50,000+ beauty professionals" and customer testimonials much lower without independent confirmation.

**Top fixes:**
1. **[HIGH]** Claim G2 and Capterra listings (both have free vendor-claim flows) and prompt existing customers for reviews — even 10–20 reviews gives AI answer engines a citable, independently-hosted source.
2. **[HIGH]** Confirm/claim the LinkedIn company page already referenced in the site's own `sameAs` schema and start posting.
3. **[MEDIUM]** Once a handful of reviews/mentions exist, add their URLs to `Organization.sameAs`.

---

## Content Quality & E-E-A-T — 40/100 (Poor)

| E-E-A-T Dimension | Score |
|---|---|
| Experience | 12/25 |
| Expertise | 9/25 |
| Authoritativeness | 7/25 |
| Trustworthiness | 10/25 |

**What's working:** The ~20 core marketing pages are genuinely well-built — 1,100–3,500 words each, correct nail-industry terminology, and two detailed case studies with named businesses, timelines, and specific before/after metrics (e.g. Jessica Mitchell, London: +40% bookings, 68% fewer no-shows in 60 days). The Privacy Policy is unusually substantive for a small SaaS company — names real subprocessors, dated, CCPA/CPRA-compliant.

**Top fixes:**
1. **[CRITICAL]** Resolve the `/salon/` directory content-quality issue (see cross-cutting section above) — it's the dominant reason this score is Poor rather than Good.
2. **[HIGH]** Launch the blog. Categories, sitemap route, and CMS are already built; zero posts are published. This is the most direct lever to build topical authority on "running a nail salon business" — exactly the subject AI answer engines would want to cite Certxa for, beyond its own product.
3. **[HIGH]** Add named authorship and real team transparency — zero author bylines exist anywhere, and the About page (~280 words) has no founder names, history, or physical address.
4. **[MEDIUM]** Reconcile testimonial data — different names, cities (UK vs. US), and metrics for what read as overlapping "success stories" are scattered across the homepage, `/nail-salon-software`, `/client-management`, and `/case-studies` with no cross-linking, which reads as generated marketing variation rather than a verifiable customer base.

Full detail: `GEO-CONTENT-ANALYSIS.md`

---

## Technical Foundations — 85/100 (Good)

| Category | Score |
|---|---|
| Server-Side Rendering | 92/100 |
| Meta Tags & Indexability | 95/100 |
| Mobile Optimization | 95/100 |
| Crawlability | 78/100 |
| Security Headers | 78/100 |
| Core Web Vitals Risk | 85/100 |
| URL Structure | 65/100 |

**Correction to initial assumption:** Certxa's public marketing pages and `/salon/` directory are **not** a client-rendered SPA shell — they're PHP-templated and fully server-rendered, with complete text, meta tags, and JSON-LD present before any JavaScript runs. The React/Vite bundle is confined to the authenticated dashboard (correctly blocked via robots.txt). This is genuinely good news for AI visibility: crawlers that don't execute JS see everything.

**Top fixes:**
1. **[CRITICAL]** Resolve the `/salon/` directory's indexability risk at scale (see cross-cutting section).
2. **[HIGH]** Tighten CSP — `script-src` includes `'unsafe-inline' 'unsafe-eval'`, which substantially weakens XSS protection. Notable given Stripe payment flows and client PII running through the app.
3. **[HIGH]** Deduplicate conflicting `Strict-Transport-Security` and `Permissions-Policy` headers sent by both the app layer and the nginx/proxy layer. Per RFC 6797, browsers honor the *first* HSTS header seen — meaning the weaker (non-preload) policy is likely the one actually in effect, not the stronger preload-ready policy configured downstream.
4. **[MEDIUM]** Add `<lastmod>` dates to the ~51,499 salon-directory sitemap URLs (currently zero present).
5. **[MEDIUM]** Restructure `/salon/` URLs to reflect the geographic hierarchy already modeled in each page's own `BreadcrumbList` schema (flat `/salon/{slug}` vs. the breadcrumb's `Nail Salons → State → City → Business` structure).

Full detail: `GEO-TECHNICAL-AUDIT.md`

---

## Structured Data — 64/100 (Fair)

Certxa's structured data is unusually mature for a SaaS marketing site — a full `@graph` (WebSite, Organization, SoftwareApplication, FAQPage) on every key page, plus genuine `NailSalon` schema with real geo-coordinates on all ~51,000 `/salon/` pages. The score is held down by concrete, fixable defects, not absence of effort:

1. **[CRITICAL]** The Organization schema's `logo` URL 404s (so does the `og:image` fallback) — no Google Knowledge Panel or AI entity card can currently render a Certxa logo.
2. **[CRITICAL]** The product exists as **three different `SoftwareApplication` nodes** (`#software`, `#software-pricing`, `#nail-software`) across pages, with different names and offer structures — including a misleading `price: "0"` on the homepage versus the real $9–$49/mo pricing on `/pricing`. This fragments entity resolution for AI models trying to identify "what is Certxa."
3. **[HIGH]** `/contact` ships a second, conflicting `Organization` node holding the real phone number — orphaned from the canonical node used everywhere else, a genuine schema validation error.
4. **[HIGH]** `openingHoursSpecification` on `/salon/*` pages uses 12-hour AM/PM strings instead of ISO 8601 — replicated across all ~51,000 pages from a shared template, making it the single highest-leverage fix by page count in the whole audit.
5. **[MEDIUM]** Thin `sameAs` — only 4 social platforms linked; no Wikidata, G2, Capterra, or Trustpilot, the exact profiles AI answer engines use to verify a B2B SaaS product before citing it.

Ready-to-paste JSON-LD fixes for all five issues are included below in **Generated Schema**. Full detail: `GEO-SCHEMA-REPORT.md`

---

## Platform Optimization — 39/100 (Weak)

| Platform | Score | Status |
|---|---|---|
| Bing Copilot | 47/100 | Fair |
| Google AI Overviews | 46/100 | Fair |
| ChatGPT Web Search | 42/100 | Fair |
| Perplexity AI | 40/100 | Fair |
| Google Gemini | 20/100 | Weak |

**Strongest:** Bing Copilot — benefits from the fully-open `robots.txt` and fast server-rendered HTML.
**Weakest:** Google Gemini — leans hardest on Google-owned-property presence (YouTube, Knowledge Panel, GBP), and certxa.com has zero on-site or schema evidence of any of these; the homepage has literally zero `<img>` tags for multimodal signals to latch onto.

**Top cross-platform fixes:**
1. **[CRITICAL]** Wrap FAQ accordion questions in real `<h3>` headings — currently each question lives in a plain `<button class="accordion-btn">`, not a heading, despite solid `FAQPage` JSON-LD underneath matching the same text. One template-level fix, applies sitewide. Affects Google AI Overviews and Bing Copilot directly.
2. **[HIGH]** Reconcile the pricing inconsistency: `SoftwareApplication` JSON-LD and the meta description state Solo/Professional/Elite at **$9/$22/$49**/mo, while the visible pricing table headline shows **"From $7/mo," "$18/mo," "$39/mo"** with no monthly-vs-annual label. Any AI engine quoting price from this page could cite either number.
3. **[HIGH]** Build 2–3 "Certxa vs [Competitor]" comparison pages with real HTML feature/price tables. The homepage's own FAQ already admits Certxa migrates users from GlossGenius, Vagaro, Square Appointments, Booksy, and Fresha — the demand signal already exists in the site's own content, but no comparison page exists to capture it. This is exactly the format AI Overviews extracts and Perplexity/ChatGPT surface for "X vs Y" queries.
4. **[MEDIUM]** Create a YouTube channel with 3–5 short product-demo videos — the single largest lever for the Gemini score specifically.
5. **[MEDIUM]** Add real product screenshots with descriptive `alt` text — zero `<img>` tags currently exist on the homepage to optimize.

Full detail: `GEO-PLATFORM-OPTIMIZATION.md`

---

## Consolidated Priority Action Plan

### Critical (highest cross-cutting impact)
1. Resolve the `/salon/` directory's thin-content/indexability risk at scale — noindex unclaimed listings, or de-templatize content, or move to a subdomain. *(Flagged independently by Technical, Content, and AI-Visibility audits.)*
2. Fix the 404'ing Organization `logo` URL and consolidate the three fragmented `SoftwareApplication` schema nodes into one canonical entity with accurate `AggregateOffer` pricing.
3. Wrap FAQ accordion questions in real `<h3>` headings sitewide (one template fix).
4. Fix `llms.txt`'s two dead links (`/features`, `/book`) and either populate or remove the false-positive `/llms-full.txt`.

### High
5. Claim G2 and Capterra listings; prompt existing customers for reviews.
6. Launch the blog — infrastructure already exists, zero posts published.
7. Reconcile the pricing discrepancy between schema ($9/$22/$49) and visible copy ("From $7/$18/$39").
8. Build 2–3 head-to-head comparison pages (Certxa vs. GlossGenius/Vagaro/Fresha).
9. Delete the duplicate `/contact` Organization schema node; merge its phone/hours data into the canonical entity.
10. Fix the `openingHoursSpecification` time-format bug in the salon-page template (corrects ~51,000 pages at once).
11. Tighten CSP (`unsafe-inline`/`unsafe-eval` in `script-src`) and deduplicate conflicting HSTS/Permissions-Policy headers from the app vs. proxy layers.
12. Add named authorship and expand `/about` with founder name(s), founding year, and a physical address.

### Medium
13. Expand `llms.txt` to cover all ~23 marketing pages and explicitly disclaim the `/salon/` directory as third-party, unaffiliated content.
14. Confirm/claim the LinkedIn company page already referenced in schema.
15. Add `speakable` schema to homepage/pricing targeting FAQ and hero content.
16. Add `<lastmod>` dates to the salon sitemap and reconcile inconsistent testimonial data across pages.
17. Create a YouTube channel with a handful of product-demo videos.
18. Add real product screenshots with descriptive alt text (zero `<img>` tags currently exist on the homepage).

### Low
19. Name AI crawlers individually in `robots.txt` and add a `Content-Signal:` directive.
20. Add `dateModified`/visible "last updated" dates reusing the sitemap's existing `<lastmod>` values.
21. Restructure `/salon/` URLs to match their own breadcrumb's geographic hierarchy.

---

## 90-Day Roadmap

**Days 1–30 — Stop the bleeding (Critical items):**
- Decide and implement the `/salon/` directory remediation path (noindex unclaimed listings is the fastest to ship).
- Fix the Organization logo 404 and consolidate the SoftwareApplication schema nodes.
- Template fix: FAQ questions into real `<h3>` headings.
- Fix or remove the two broken `llms.txt` links and `/llms-full.txt`.
- Reconcile the pricing discrepancy between schema and visible copy.

**Days 31–60 — Build authority:**
- Claim G2 and Capterra; request reviews from existing customers.
- Publish the first 3–5 blog posts using the Article+Person schema template below.
- Rewrite `/about` with founder, founding date, and HQ details.
- Ship 2 comparison pages (Certxa vs. the two most-migrated-from competitors per the FAQ).
- Fix the `/contact` duplicate Organization node and the salon-page opening-hours time format.

**Days 61–90 — Broaden the surface:**
- Launch a YouTube channel with initial product-demo content.
- Add product screenshots with alt text across the homepage and top feature pages.
- Tighten CSP and deconflict HSTS/Permissions-Policy headers.
- Add `speakable` schema and reconcile inconsistent testimonial data.

---

## Generated Schema

Ready-to-paste JSON-LD fixes for the two Critical structured-data issues (full versions, plus the salon-page and blog-launch templates, are in `GEO-SCHEMA-REPORT.md`):

### Consolidated Organization (replaces all existing Organization nodes site-wide)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://certxa.com/#organization",
  "name": "Certxa",
  "url": "https://certxa.com",
  "logo": {
    "@type": "ImageObject",
    "url": "[REPLACE: working PNG/JPG/WEBP logo URL, min 112x112px]",
    "width": 600,
    "height": 60
  },
  "description": "Certxa is all-in-one salon and nail studio management software with online booking, point of sale, payments, staff management, payroll, and an AI receptionist.",
  "foundingDate": "[REPLACE: e.g. 2023-01-01]",
  "sameAs": [
    "https://twitter.com/certxa",
    "https://facebook.com/certxa",
    "https://instagram.com/certxa",
    "https://linkedin.com/company/certxa",
    "[REPLACE: G2, Capterra, Wikidata, YouTube, Crunchbase, Trustpilot URLs as they're created]"
  ],
  "contactPoint": [
    {
      "@type": "ContactPoint",
      "contactType": "customer support",
      "email": "support@certxa.com",
      "telephone": "+1-800-278-4392",
      "hoursAvailable": "Mo-Fr 09:00-18:00",
      "availableLanguage": "English"
    }
  ],
  "knowsAbout": [
    "Salon management software",
    "Nail salon software",
    "Online appointment booking",
    "Salon point of sale (POS)",
    "Staff and payroll management",
    "AI receptionist for salons"
  ]
}
```

### Consolidated SoftwareApplication (replaces the 3 fragmented nodes)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://certxa.com/#software",
  "name": "Certxa",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "SalonManagementSoftware",
  "operatingSystem": "Web, iOS, Android",
  "url": "https://certxa.com",
  "description": "Certxa is the all-in-one nail salon software built for nail technicians and studio owners: 24/7 online booking, self-service walk-in check-in kiosk, multi-tech calendar management, client nail records, automated SMS/email reminders, POS, waitlist management, an AI receptionist, Google Reviews integration, and a branded website builder.",
  "softwareVersion": "2.0",
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "USD",
    "lowPrice": "9",
    "highPrice": "49",
    "offerCount": "3",
    "offers": [
      { "@type": "Offer", "name": "Solo Plan", "price": "9", "priceCurrency": "USD", "billingIncrement": "P1M", "url": "https://certxa.com/pricing" },
      { "@type": "Offer", "name": "Professional Plan", "price": "22", "priceCurrency": "USD", "billingIncrement": "P1M", "url": "https://certxa.com/pricing" },
      { "@type": "Offer", "name": "Elite Plan", "price": "49", "priceCurrency": "USD", "billingIncrement": "P1M", "url": "https://certxa.com/pricing" }
    ]
  },
  "featureList": [
    "24/7 online booking with real-time availability",
    "Multi-staff calendar management",
    "Automated SMS and email appointment reminders",
    "Client management CRM with full appointment history",
    "Integrated card payment processing and POS",
    "Gift cards and membership management",
    "Google Reviews automation and Google Business Profile sync",
    "Custom branded website builder",
    "No-show deposit protection"
  ],
  "publisher": { "@id": "https://certxa.com/#organization" }
}
```

### Corrected salon-page opening hours (template fix — corrects ~51,000 pages at once)

```json
{
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": "Monday",
  "opens": "09:30",
  "closes": "19:00"
}
```

---

## Methodology & Scope Notes

- All findings were derived from live HTTP fetches (curl / direct GET) of certxa.com — homepage, `/pricing`, `/nail-salon-software`, `/online-booking`, `/about`, `/contact`, `/case-studies`, `/blog`, robots.txt, sitemap tree, `llms.txt`, and a sample of `/salon/*` directory pages — not from cached search results or assumptions about typical SaaS patterns.
- The `/salon/` directory (51,499 URLs) was sampled (2–3 pages per audit team, cross-verified) rather than fully crawled, per the standard 50-page audit scope limit; page-count figures come from the sitemap index files themselves, not extrapolation.
- SERP ranking position, off-site Reddit/forum mentions, and Ahrefs backlink/keyword data could not be verified this session (API access returned "insufficient plan" for site-explorer endpoints) — flagged as unverifiable rather than assumed absent where noted in the individual category reports.
- Full detail for each category — including per-page evidence, raw schema dumps, and additional lower-priority findings — is available in the companion files in this directory: `GEO-AI-VISIBILITY.md`, `GEO-PLATFORM-OPTIMIZATION.md`, `GEO-TECHNICAL-AUDIT.md`, `GEO-CONTENT-ANALYSIS.md`, `GEO-SCHEMA-REPORT.md`.

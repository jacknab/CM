# GEO Schema & Structured Data Report — certxa.com
Date: 2026-08-23

## Schema Score: 64/100 — Fair

Certxa's structured data is **unusually mature for a SaaS marketing site** — it already ships a full `@graph` (WebSite, Organization, SoftwareApplication, FAQPage) on the homepage, `BreadcrumbList` + `WebPage` on inner pages, and genuine `NailSalon`/`LocalBusiness`-style markup with geo-coordinates on all 51,000+ programmatic `/salon/` directory pages. That puts it ahead of most SMB SaaS competitors. The score is held down by a handful of concrete, fixable defects rather than by absence of effort: **a 404'ing logo URL, a duplicate/conflicting Organization node on the Contact page, non-ISO time formats propagated across all 51k salon pages, a fragmented SoftwareApplication entity (3 different `@id`/name pairs for the same product), and zero `knowsAbout`/`speakable`/high-authority `sameAs` links.**

---

## Detected Schemas

| Page | Schema Type(s) | Format | Status | Issues |
|---|---|---|---|---|
| `/` (homepage) | WebSite, Organization, SoftwareApplication, FAQPage | JSON-LD (`@graph`) | Valid JSON, property errors | Broken `logo` URL; misleading `$0` offer price; no `description`/`foundingDate`/`knowsAbout` |
| `/pricing` | WebSite, Organization, BreadcrumbList, WebPage, SoftwareApplication (`#software-pricing`), FAQPage | JSON-LD (`@graph`) | Valid | Second, differently-`@id`'d SoftwareApplication entity (fragmentation) |
| `/nail-salon-software` | WebSite, Organization, BreadcrumbList, FAQPage, SoftwareApplication (`#nail-software`) | JSON-LD (`@graph`) | Valid | Third SoftwareApplication entity, different name ("Certxa Nail Salon Software") |
| `/online-booking` | WebSite, Organization, BreadcrumbList, WebPage, FAQPage | JSON-LD (`@graph`) | Valid | No page-specific business schema (acceptable — feature page) |
| `/google-business-profile` | WebSite, Organization, BreadcrumbList, WebPage | JSON-LD (`@graph`) | Valid | No FAQPage despite FAQ-shaped content on page |
| `/about` | WebSite, Organization, BreadcrumbList, AboutPage | JSON-LD (`@graph`) | Valid | No `founder`/`foundingDate`/team `Person` schema |
| `/contact` | WebSite, Organization (`#organization`), BreadcrumbList, ContactPage, **Organization (`#org`)** | JSON-LD (`@graph`) | **Invalid — duplicate entity** | Two distinct Organization nodes for the same brand, split contact data (see below) |
| `/case-studies` | WebSite, Organization, BreadcrumbList, ItemList | JSON-LD (`@graph`) | Valid | No `Review`/`AggregateRating` on testimonial content |
| `/blog` | WebSite, Organization, BreadcrumbList | JSON-LD (`@graph`) | Valid | No posts published yet; no Article/Person template ready for launch |
| `/salon/<slug>` (sampled x2) | NailSalon, BreadcrumbList | JSON-LD (2 separate `<script>` blocks) | Valid JSON, 1 format error | `openingHoursSpecification` times use `"9:30 AM"` instead of ISO 8601 `"09:30"` — replicated across ~51,000 pages |
| Microdata | None detected | — | — | — |
| RDFa | None detected | — | — | — |

**Total unique JSON-LD `@graph` blocks sampled:** 10 pages, all JSON-LD, zero Microdata/RDFa. All schema is present in the raw server-rendered HTML (confirmed via static, non-JS fetch), so there is **no JavaScript-injection risk** — GPTBot, ClaudeBot, and PerplexityBot will see identical markup to what a browser sees. This is a genuine strength.

---

## Validation Results

### Homepage `/` — `@graph` block

| Node | Property | Status | Value / Issue |
|---|---|---|---|
| WebSite | `@id`, `url`, `name`, `potentialAction` | OK | `SearchAction` target verified live — `GET /search?q=` returns HTTP 200 |
| Organization | `name`, `url` | OK | "Certxa" / `https://certxa.com` |
| Organization | `logo` | **FAIL** | `https://certxa.com/assets/images/logo.png` returns **HTTP 404**. So does the `og:image` fallback (`/assets/images/og-image.jpg`, also 404). The only resolvable brand image on the site is `/favicon.svg` (SVG — not accepted by Google's logo requirements, which need PNG/JPG/WEBP ≥112×112px). **AI models and Google's Knowledge Graph currently cannot fetch any logo for this entity.** |
| Organization | `sameAs` | Partial | 4 links (Twitter/X, Facebook, Instagram, LinkedIn), all return HTTP 200. No Wikipedia, Wikidata, YouTube, Crunchbase, G2, Capterra, or Trustpilot — all high-value for a SaaS entity graph |
| Organization | `contactPoint` | Partial | Has `email` only, no `telephone` — despite a toll-free number (`+1-800-278-4392`) being live and correctly marked up **on a separate, conflicting node** (see Contact page below) |
| Organization | `description`, `foundingDate`, `founder`, `address`, `knowsAbout` | Missing | None present — reduces entity-graph richness for AI citation |
| SoftwareApplication (`#software`) | `name`, `applicationCategory`, `operatingSystem`, `description`, `featureList` | OK | Description and 12-item `featureList` are strong GEO signals |
| SoftwareApplication (`#software`) | `offers` | **Questionable** | Single `Offer` at `price: "0"` described as "free trial" — doesn't reflect actual product cost ($9–$49/mo per the pricing page) and risks being flagged as a misleading price by Google's structured data policies |
| SoftwareApplication (`#software`) | `aggregateRating`, `screenshot`, `releaseNotes` | Missing | No rating despite `softwareVersion: "2.0"` implying a mature, versioned product |
| FAQPage | `mainEntity[].name/acceptedAnswer` | OK | 6 well-formed Q&A pairs, all with substantive answers — good for AI extraction even though FAQ rich results are Google-restricted to gov/health sites |

### `/pricing` — additional findings

- A **second, separate** `SoftwareApplication` node with `@id: "https://certxa.com/#software-pricing"` (distinct from the homepage's `#software`) carries the real `offers` array: Solo ($9/mo), Professional ($22/mo), Elite ($49/mo) — each a proper `Offer` with `price`, `priceCurrency`, `billingIncrement`. This part is well-built.
- **Problem:** because this node uses a different `@id` and omits `operatingSystem`, it reads to a schema parser as a *second, incomplete product entity* rather than an extension of the homepage's SoftwareApplication. Entity-resolution systems (including AI models building a knowledge graph) may treat "Certxa" (homepage) and "Certxa" (pricing) as two candidate matches instead of one canonical node.
- FAQPage here is topically distinct and correctly scoped to billing/trial questions — good practice, not a duplicate of the homepage FAQ.

### `/nail-salon-software` — additional findings

- A **third** SoftwareApplication node, `@id: "https://certxa.com/#nail-software"`, named **"Certxa Nail Salon Software"** — a different name from the other two ("Certxa"). Single `Offer` again shows `price: "0"` with pricing detail buried in the `description` string ("60-day free trial, then from $9/month") rather than structured `price`/`priceCurrency` fields.
- **Net effect across the 3 pages:** the SaaS product is represented by three non-identical SoftwareApplication entities (`#software`, `#software-pricing`, `#nail-software`) with two different names and three different offer structures. This is the single biggest structural defect in the file — see Priority Actions.

### `/contact` — duplicate Organization (validation failure)

```json
// Node 1 (same as every other page)
{ "@type": "Organization", "@id": "https://certxa.com/#organization",
  "contactPoint": { "contactType": "customer support", "email": "support@certxa.com" } }

// Node 2 (only on /contact)
{ "@type": "Organization", "@id": "https://certxa.com/#org",
  "contactPoint": { "telephone": "+1-800-278-4392", "contactType": "customer service",
                     "hoursAvailable": "Mo-Fr 09:00-18:00" } }
```
Both nodes have `name: "Certxa"` and `url: "https://certxa.com"` but different `@id`s and non-overlapping `contactPoint` data. Per Schema.org/Google guidance this is a **duplicate conflicting schema block** — a parser has no reliable way to know these represent the same entity. The telephone number, which is real, live, and prominently displayed on the page, is invisible to any consumer that dedupes by `@id` (which includes Google's own indexing pipeline).

### `/salon/*` location pages (sampled: Perris, CA / Rancho Cucamonga, CA)

| Property | Status | Notes |
|---|---|---|
| `@type: NailSalon` | OK | Valid Schema.org type (LocalBusiness → HealthAndBeautyBusiness → NailSalon) |
| `address` (PostalAddress) | OK | Complete: street, locality, region, postal code, country |
| `geo` (GeoCoordinates) | OK | Real lat/long, feeds a working `hasMap` Google Maps link |
| `openingHoursSpecification` | **FAIL (format)** | `"opens": "9:30 AM"`, `"closes": "7:00 PM"` — Schema.org/Google require ISO 8601 24-hour time (`"09:30"`, `"19:00"`). 12-hour AM/PM strings are non-conformant and may be silently dropped or misparsed by strict consumers. **This pattern repeats across all ~51,000 salon pages per the sitemap**, making it the highest-leverage single fix in this audit by page count. |
| `makesOffer` (Service list) | OK | 10 named services per salon, good topical signal |
| `priceRange`, `paymentAccepted`, `currenciesAccepted` | OK | Present and reasonable |
| `telephone` | Missing | Not present despite being a near-mandatory LocalBusiness field for local AI/voice search |
| `aggregateRating` / `review` | Missing | Correctly **not fabricated** — good practice, since Certxa likely doesn't hold verified review data for every scraped listing. Recommend adding only where real GBP rating data exists. |
| `sameAs` (salon's own GBP/social links, if known) | Missing | Optional but would strengthen the directory's own entity signals |
| Delivery | JSON in raw HTML | OK | Two separate `<script type="application/ld+json">` blocks (NailSalon, BreadcrumbList) rather than one `@graph` — functionally fine, minor style inconsistency vs. the rest of the site's `@graph` pattern |
| BreadcrumbList | OK | 5-level breadcrumb: Nail Salons → Country → State → City → Salon — excellent for AI understanding of the directory hierarchy |

---

## Google Rich Result Eligibility

| Rich Result Type | Eligible? | Notes |
|---|---|---|
| Sitelinks Search Box (WebSite+SearchAction) | Yes | Functional `/search` endpoint confirmed live |
| Organization Knowledge Panel | **No** | Blocked by broken `logo` URL |
| Software App | Partial | Present but `price: "0"` and fragmented entities undermine eligibility/trust |
| FAQ | No (by design) | Google restricts FAQ rich results to gov/health sites since Aug 2023 — schema still valuable for AI parsing, no action needed |
| Breadcrumb | Yes | Well-formed on all sampled inner and salon pages |
| Local Business (salon pages) | **No** | Missing `telephone`; `openingHoursSpecification` time format is non-conformant |
| Review/Rating | N/A | Not implemented anywhere; no fabricated data (correct restraint) |
| Article | N/A | No published blog posts yet |

---

## GEO-Critical Schema Assessment

| Schema | Status | GEO Impact | Notes |
|---|---|---|---|
| Organization + sameAs | Partial | Critical | 4 social links present and live; missing Wikipedia/Wikidata/G2/Capterra/YouTube; broken logo undermines entity card generation; split across 2 conflicting nodes on /contact |
| SoftwareApplication (product identity) | Partial/Fragmented | Critical | 3 non-identical entities for one product — needs consolidation to a single canonical `@id` |
| LocalBusiness (salon directory, 51k pages) | Partial | High (for directory traffic) | Strong on structure/geo, fails on time format and telephone at scale |
| Person (author) | Missing | High | No blog content live yet; no author entity exists to assess |
| Article + dateModified | Missing | High | No blog posts published; sitemap confirms zero live articles |
| speakable | Missing | Medium | Not implemented on any page, including FAQ-rich homepage/pricing where it would be highest-value |
| BreadcrumbList | Present | Low-Medium | Implemented well across inner pages and the full salon directory hierarchy |
| WebSite + SearchAction | Present | Low | Verified functional |
| knowsAbout | Missing | Medium | Would materially strengthen topical entity signals ("salon software," "online booking," "POS," "AI receptionist") |

---

## sameAs Entity Linking

**Current sameAs links found (on Organization, homepage and propagated site-wide):** 4

| Platform | Linked | URL | Status |
|---|---|---|---|
| Wikipedia | No | Not linked | — |
| Wikidata | No | Not linked | — |
| LinkedIn | Yes | `https://linkedin.com/company/certxa` | HTTP 200 |
| YouTube | No | Not linked | — |
| Crunchbase | No | Not linked | — |
| Twitter/X | Yes | `https://twitter.com/certxa` | HTTP 200 |
| Facebook | Yes | `https://facebook.com/certxa` | HTTP 200 |
| Instagram | Yes | `https://instagram.com/certxa` | HTTP 200 |
| G2 | No | Not linked | Should add if a G2 profile exists — high-trust SaaS review signal |
| Capterra | No | Not linked | Should add if a Capterra profile exists — high-trust SaaS review signal |
| Trustpilot | No | Not linked | Should add if a Trustpilot profile exists |
| GitHub | No | Not linked | Not required (not a dev tool) |

**Assessment:** The core consumer social graph is covered and verified live, but the platforms that matter most for a *B2B SaaS* entity graph — G2, Capterra, Crunchbase, and a Wikidata QID — are entirely absent. These are exactly the profiles AI answer engines (Perplexity, ChatGPT, Gemini) lean on to verify "is this a real, reviewed software product" before citing it in a recommendation.

---

## Deprecated/Restricted Schemas

| Schema | Status | Recommendation |
|---|---|---|
| FAQPage | Restricted (Aug 2023, gov/health only) | **Keep** — not deprecated, still valuable for AI Q&A parsing; correctly implemented in multiple topically-distinct blocks rather than one bloated block |
| HowTo | Not found | N/A |
| SpecialAnnouncement | Not found | N/A |
| CourseInfo | Not found | N/A |

No deprecated schemas present. Clean on this front.

---

## JavaScript Rendering Risk

**Schema Delivery Method: Server-rendered.**

All JSON-LD sampled (homepage, 4 key inner pages, about, contact, case-studies, blog, 2 salon pages) was retrieved via a plain HTTP GET with no JavaScript execution, and every block was present in that raw response. This means:
- Google can process the structured data immediately (no delayed-processing risk from the Dec 2025 JS-injection guidance).
- AI crawlers that don't execute JavaScript (GPTBot, ClaudeBot, PerplexityBot) see the exact same schema a browser would.

This is a genuine strength of the current implementation and should be preserved — any future migration to a client-rendered framework for these pages should keep JSON-LD injection server-side (or use static generation/SSR), not client-side `useEffect`/hydration-only injection.

---

## Recommended JSON-LD Templates

### 1. Consolidated Organization — replace ALL existing Organization nodes site-wide (CRITICAL)

Fixes: broken logo, split /contact entity, missing sameAs/description/knowsAbout/foundingDate. Use this **single** block (via the shared `@id`) on every page instead of the current homepage version and the conflicting `/contact` version.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://certxa.com/#organization",
  "name": "Certxa",
  "url": "https://certxa.com",
  "logo": {
    "@type": "ImageObject",
    "url": "[REPLACE: URL to a working PNG/JPG/WEBP logo, min 112x112px — current /assets/images/logo.png and /assets/images/og-image.jpg both 404]",
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
    "[REPLACE: Wikidata entity URL, if one exists or is created — https://www.wikidata.org/wiki/Qxxxxx]",
    "[REPLACE: YouTube channel URL, if one exists]",
    "[REPLACE: Crunchbase organization URL, if one exists]",
    "[REPLACE: G2 product profile URL, if one exists — high-trust SaaS review signal]",
    "[REPLACE: Capterra product profile URL, if one exists]",
    "[REPLACE: Trustpilot business profile URL, if one exists]"
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
    "AI receptionist for salons",
    "Google Business Profile booking integration"
  ]
}
```

**Implementation:** Replace the `Organization` node inside the existing `@graph` on every page with this version (same `@id`, so it merges cleanly). On `/contact`, **delete** the second `Organization` node (`@id: "https://certxa.com/#org"`) entirely — its telephone/hours data is now folded into the canonical node above.

---

### 2. Consolidated SoftwareApplication — single canonical product entity (CRITICAL)

Replaces the three fragmented nodes (`#software` on homepage, `#software-pricing` on /pricing, `#nail-software` on /nail-salon-software) with one entity referenced consistently by `@id`. Use `AggregateOffer` to represent the real $9–$49 price range instead of a flat `$0`.

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
  "description": "Certxa is the all-in-one nail salon software built for nail technicians and studio owners. Features include 24/7 online booking, self-service walk-in check-in kiosk, multi-tech calendar management, client nail records with product notes, automated SMS and email reminders, a POS system, waitlist management, Autumn AI receptionist, Google Reviews integration, and a branded website builder.",
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
    "Multi-staff calendar management with day view",
    "Automated SMS and email appointment reminders",
    "Client management CRM with full appointment history",
    "Integrated card payment processing",
    "Salon point of sale (POS) system with card reader",
    "Gift cards and membership management",
    "Google Reviews automation",
    "Google Business Profile booking link sync",
    "Custom branded website builder",
    "Business analytics and reporting dashboard",
    "No-show deposit protection"
  ],
  "aggregateRating": "[REPLACE: Only add if real, verifiable ratings exist — e.g. { \"@type\": \"AggregateRating\", \"ratingValue\": \"4.8\", \"reviewCount\": \"120\" }. Do not fabricate.]",
  "publisher": { "@id": "https://certxa.com/#organization" }
}
```

**Implementation:** Use this exact block (same `@id: "https://certxa.com/#software"`) on the homepage, `/pricing`, and `/nail-salon-software`. Delete the `#software-pricing` and `#nail-software` nodes. If a page needs page-specific framing (e.g., "Certxa Nail Salon Software" as marketing copy), keep that in the page's `<h1>`/visible content — not as a competing JSON-LD entity name.

---

### 3. speakable — add to homepage and /pricing Article/WebPage nodes (MEDIUM)

```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://certxa.com/#webpage",
  "url": "https://certxa.com/",
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": [
      "[REPLACE: CSS selector for the homepage hero/summary paragraph]",
      "[REPLACE: CSS selector for the FAQ answer text blocks]"
    ]
  }
}
```

**Implementation:** Add a `WebPage` node (or extend the existing one on inner pages) with `speakable.cssSelector` pointing at the hero summary and FAQ answers — these are already the most self-contained, factual passages on the site and ideal candidates for AI/voice citation.

---

### 4. Corrected NailSalon opening hours — fix for the salon directory template (HIGH, by page-count impact)

Change the template used to generate all `/salon/*` pages so `openingHoursSpecification` emits 24-hour ISO time instead of 12-hour AM/PM strings. Example corrected block for the sampled Perris, CA salon:

```json
{
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": "Monday",
  "opens": "09:30",
  "closes": "19:00"
}
```

Apply the same `HH:MM` (24-hour) conversion to every `dayOfWeek` entry and to the Sunday `"12:00 PM"`/`"5:00 PM"` pair (→ `"12:00"`/`"17:00"`). Since this is a generated template, fixing it once in the salon-page generator corrects all ~51,000 pages in the sitemap.

Also add `telephone` to the per-salon schema wherever the underlying GBP data includes a phone number:

```json
"telephone": "[REPLACE: salon's phone number from source data, if available]"
```

---

### 5. Article + Person template — ready for blog launch (HIGH, forward-looking)

The blog exists (`/blog`, correctly linked in `sitemap.xml` → `/blog/sitemap.xml`) but has zero published posts. Wire this template into the CMS now so the first post ships fully structured.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": "[REPLACE: https://certxa.com/blog/POST-SLUG#article]",
      "headline": "[REPLACE: Post title]",
      "description": "[REPLACE: 1-2 sentence summary]",
      "image": "[REPLACE: Featured image URL]",
      "datePublished": "[REPLACE: ISO 8601, e.g. 2026-08-23]",
      "dateModified": "[REPLACE: ISO 8601]",
      "mainEntityOfPage": "[REPLACE: https://certxa.com/blog/POST-SLUG]",
      "articleSection": "[REPLACE: e.g. Marketing, Operations, Growth]",
      "author": { "@id": "[REPLACE: https://certxa.com/blog/authors/AUTHOR-SLUG#person]" },
      "publisher": { "@id": "https://certxa.com/#organization" },
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": [".article-summary", ".key-takeaway"]
      }
    },
    {
      "@type": "Person",
      "@id": "[REPLACE: https://certxa.com/blog/authors/AUTHOR-SLUG#person]",
      "name": "[REPLACE: Author full name]",
      "url": "[REPLACE: https://certxa.com/blog/authors/AUTHOR-SLUG]",
      "jobTitle": "[REPLACE: e.g. Head of Content]",
      "worksFor": { "@id": "https://certxa.com/#organization" },
      "sameAs": [
        "[REPLACE: Author's LinkedIn profile URL]"
      ],
      "knowsAbout": [
        "[REPLACE: e.g. Salon business operations]",
        "[REPLACE: e.g. Nail salon marketing]"
      ]
    }
  ]
}
```

**Implementation:** Add `<script type="application/ld+json">` blocks like this to `<head>` of each blog post template, server-rendered at publish time (matches the site's existing SSR pattern for JSON-LD).

---

## Priority Actions

1. **[CRITICAL]** Fix the 404'ing `logo` URL in the Organization schema — host a real PNG/JPG/WEBP logo (min 112×112px) at a stable path and reference it in the JSON-LD, since currently no Google Knowledge Panel or AI entity card can render a Certxa logo.
2. **[CRITICAL]** Consolidate the three fragmented `SoftwareApplication` entities (`#software`, `#software-pricing`, `#nail-software`) into one canonical `@id` with a single name and an `AggregateOffer` reflecting the real $9–$49/mo pricing — the homepage's `price: "0"` framing is misleading relative to the actual product cost.
3. **[HIGH]** Delete the duplicate `Organization` node (`@id: "#org"`) on `/contact` and merge its telephone/hours data into the canonical `#organization` node so the phone number isn't orphaned from the entity Google and AI systems actually index.
4. **[HIGH]** Fix the `openingHoursSpecification` time format (`"9:30 AM"` → `"09:30"`) in the salon-page generator template — this single template fix corrects the format across all ~51,000 `/salon/*` pages at once.
5. **[MEDIUM]** Expand `sameAs` with Wikidata, G2, Capterra, Crunchbase, and/or Trustpilot profile URLs (whichever genuinely exist) and add a `knowsAbout` array to the Organization node — these are the signals AI answer engines use most to verify and cite a B2B SaaS product.
6. **[MEDIUM]** Add `speakable` to the homepage and `/pricing` WebPage nodes, targeting the hero summary and FAQ answer text — currently zero pages signal AI/voice-ready passages despite having strong FAQ content to point at.
7. **[LOW]** Pre-build the Article + Person JSON-LD template into the CMS before the first blog post publishes, so content launches with full author E-E-A-T markup from day one rather than retrofitting it later.

---

## Implementation Notes

- All templates above are ready to paste into `<script type="application/ld+json">` tags in `<head>`, matching the site's existing server-rendered `@graph` pattern — no client-side injection needed or recommended.
- After implementing, validate with Google's Rich Results Test (`https://search.google.com/test/rich-results`) and the Schema.org Validator (`https://validator.schema.org/`) on the homepage, `/pricing`, and one `/salon/*` page to confirm the `@id` merges resolve as single entities and the corrected time format parses cleanly.
- Because the Organization and SoftwareApplication fixes touch shared template partials, a single change should propagate correctly across all pages that currently repeat the (broken) versions — confirm this by re-checking `/`, `/pricing`, `/nail-salon-software`, `/about`, and `/contact` after deployment.

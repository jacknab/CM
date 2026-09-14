# GEO Schema & Structured Data Report — certxa.com
Date: 2026-09-13

## Schema Score: 83/100 (up from 81/100 — `speakable` added to blog articles during this run)

**Update:** `sameAs` now also carries a confirmed BBB listing (see below) and the Organization's `address` includes a real street address; the founder Person node also now has an `alternateName` reconciling the legal name "Thanh Lam" with the public "Tom Tham." These push the `sameAs`-breadth sub-score up further but weren't re-totaled into a new headline number in this file — see `GEO-AUDIT-REPORT.md`'s re-audit section for the latest composite.

Scored against this skill's rubric. Certxa's structured data is genuinely strong on completeness and correctness — one canonical `@graph` shared site-wide, valid JSON-LD everywhere, fully server-rendered, no deprecated schemas. The only real point-loss is `sameAs` (1 of 14 recommended platforms linked) and the blog's author schema (correctly typed as `Organization` rather than a fabricated `Person`, but that's a content gap — no named author exists yet — not a code defect).

## Detected Schemas

| Page | Schema Type | Format | Status | Issues |
|---|---|---|---|---|
| `/` | WebSite, Organization, Person, SoftwareApplication, WebPage, FAQPage | JSON-LD | Valid | `sameAs` has only 1 of 14 recommended platforms |
| `/pricing` | + BreadcrumbList, page-specific WebPage | JSON-LD | Valid | None |
| `/blog/:slug` | + BlogPosting, BreadcrumbList | JSON-LD | Valid | `author` is `Organization` (correct fallback — no real named author on this post) |

All schema is emitted server-side in the initial HTML response (confirmed via raw HTML fetch, not JS-rendered) — one shared `@graph` injected by `includes/header.php`, so every page carries the same canonical Organization/Person/SoftwareApplication/WebSite nodes via `@id` references rather than duplicating them.

## Validation Results

**Organization** (`#organization`) — all required properties present (`name`, `url`, `logo`), plus nearly every recommended one: `description`, `foundingDate`, `founder` (linked by `@id`), `address` (PostalAddress), `contactPoint`, `knowsAbout` (6 topics), `sameAs` (1 entry). Missing: `areaServed`, `numberOfEmployees`, `industry`, `award` — all optional and genuinely not applicable yet for a 7-month-old company.

**Person** (`#founder-tom-tham`) — `name`, `jobTitle`, `url` (added this session), `worksFor`, `knowsAbout` (3 topics) all present. Missing: `sameAs` (no LinkedIn yet), `image`.

**SoftwareApplication** (`#software`) — complete: `name`, `description`, `applicationCategory`, `operatingSystem`, `offers` (3 real `Offer`s with correct `UnitPriceSpecification`), `featureList` (12 items). No `aggregateRating` — correctly omitted per Schema.org guidance against asserting unverifiable ratings (no real third-party review data exists yet to source one from).

**WebSite** — `SearchAction`/`EntryPoint` present and valid.

**BlogPosting** — `headline`, `datePublished`, `dateModified`, `image`, `publisher` (with logo), `isPartOf` (Blog), and now `speakable` all present and valid. `author` correctly resolves to `Organization` when no real named author is set (fixed earlier this session — previously typed a nameless placeholder as `Person`, which Google/AI models flag).

**BreadcrumbList** — present and correct on `/pricing` and blog posts; correctly omitted on the homepage (nothing to break out at the root).

**FAQPage** — present on 15+ pages. Per this skill's own guidance, rich results are restricted to gov/health sites since Aug 2023, but the schema still aids AI Q&A parsing — kept as-is, not flagged as an issue.

No deprecated schemas found (no HowTo, no SpecialAnnouncement, no CourseInfo, no legacy VideoObject `contentUrl` misuse).

## Missing Recommended Schemas

None structurally — every business-type-relevant schema (Organization, SoftwareApplication, WebSite+SearchAction, BreadcrumbList, Article/BlogPosting) is already implemented. The gap is entirely in `sameAs` breadth (below) and eventual `AggregateRating`/`Review` once real third-party reviews exist to source them from — both correctly left out rather than faked.

## sameAs Audit

| Platform | URL | Status |
|---|---|---|
| Wikipedia | — | Missing (not yet notable enough for a real entry — don't create a self-promotional draft) |
| Wikidata | — | Missing |
| LinkedIn | — | Missing (no company page exists yet) |
| YouTube | — | Missing (one demo video exists but no channel to link) |
| Twitter/X | `https://x.com/certxa` | **Present** (added this session — the handle was already declared via a `twitter:site` meta tag, just never mirrored into schema) |
| Facebook | — | Missing |
| Crunchbase | — | Missing |
| GitHub | — | Not applicable (not a developer-facing product) |
| Google Scholar | — | Not applicable |
| ORCID | — | Not applicable |
| Instagram | — | Missing |
| App Store / Google Play | — | Not applicable (web-based product) |
| BBB | `https://www.bbb.org/us/az/phoenix/profile/software-consultants/certxa-llc-1126-1000175065` | **Present** (added after the user confirmed it; independently fetched and verified — real address, phone, and a link back to certxa.com) |
| Industry directories (Capterra) | `capterra.ca/software/1237764/Certxa-Booking-Software` | Confirmed to exist (found in earlier brand-mention research) but **not yet added to `sameAs`** — see below |

**Capterra:** a listing was found by a subagent earlier today (`capterra.ca/software/1237764/Certxa-Booking-Software`), but I could not independently re-verify it in this run — Capterra returns `403` to direct requests regardless of user agent (their bot-protection, not necessarily proof the page is down). I didn't add it to `sameAs` on that basis alone. If you can confirm the listing loads for you in a browser, it's the one safe, ready-to-add `sameAs` entry beyond what's already there — send me the confirmed URL and I'll add it.

Everything else requires creating a real profile first — the code already follows the correct principle here (a comment in `includes/header.php` explicitly says "asserting profiles that don't exist is worse than omitting sameAs"), so no placeholder URLs should be added for these until they're real.

## Generated JSON-LD Code

Once new profiles exist, add them to the `sameAs` array in `includes/header.php` (`#organization` node):

```json
"sameAs": [
  "https://x.com/certxa",
  "[Capterra listing URL — confirm it loads before adding]",
  "[LinkedIn company page URL once created]",
  "[Facebook page URL once created]",
  "[Instagram profile URL once created]"
]
```

For the founder Person node, once a LinkedIn profile exists:
```json
"sameAs": ["https://www.linkedin.com/in/[founder-profile]"]
```

## Implementation Notes

- All JSON-LD lives in `includes/header.php` (site-wide `@graph`) and `blog/article.php` (per-post `BlogPosting`) — both server-rendered, no JS injection risk.
- The `speakable` fix applied this session (`.blog-content` selector) is in the shared blog template, so it applies to every post automatically, not just the one checked.
- Test any future schema changes with Google's Rich Results Test and the Schema.org Validator before deploying, same as any JSON-LD edit.
- The `sameAs` array is the one property that should be revisited every time a new real profile (LinkedIn, G2, Capterra, YouTube channel) is created — it's a one-line addition each time, and it's the single highest-leverage schema change available once those profiles exist.

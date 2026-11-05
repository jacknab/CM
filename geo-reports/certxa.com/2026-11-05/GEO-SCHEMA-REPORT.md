# Schema & Structured Data: certxa.com (2026-11-05)

**Schema Score: 84/100** (Good). On 2026-10-24 it was 83.

**Method.** I parsed every `application/ld+json` block from the crawl of 2026-11-05 (46 URLs in the shared crawl folder). I rechecked referenced URLs live with curl, and read the emitters in the repo. No site code was changed.

- All blocks are valid JSON, and all are in the server-rendered HTML, so AI crawlers can see them.
- No page uses Microdata or RDFa.
- No deprecated types (HowTo, SpecialAnnouncement, CourseInfo).
- **No `aggregateRating`, `ratingValue` or `review` on any certxa.com page.** Salon-level pages do have them (see "Tenant sample").
- `url` matches the canonical on every WebPage node.

## Changes since 10-24

### Fixed

| 10-24 # | Item | Now |
|---|---|---|
| 1 | Stripe M2 marked `brand: Certxa` | `brand: Stripe` (`ACCESSORY_BRAND`, products.tsx:54). The tablet is `brand: T-Mobile`. |
| 2 | `/compare/*` breadcrumb level 2 was a 404 | The level is gone. All 4 pages are Home > Certxa vs X, and both URLs return 200. `/compare` itself still returns 404, but nothing in schema points to it. |
| 14 | `/products` FAQ and accessories not in schema | `FAQPage` with 5 questions added. ItemList now has all 5 products. |

### New since 10-24 (correct)

- `/nail-salon-turn-system` and `/vi/chia-tua-tiem-nail` have Article, FAQPage, breadcrumb, `about #software` and the right `inLanguage`.
- `/products` schema prices follow the admin price and match the visible page: Station $499, tablet $99, printer $89, drawer $59, M2 $69. The baseline recorded Station at $799, so the admin price changed.

### Regressions

None in schema logic. One new finding is a broken URL that the 10-24 audit did not test or that broke since: the founder image (#1).

## Open items you asked me to re-verify

| Item | Status | Evidence |
|---|---|---|
| `#software` has two shapes | **Still open** (#2) | `/` vs 22 PHP pages: 2 variants under one `@id`. |
| `/pricing` has no Offer schema | **Still open** (#3) | Graph is Organization, WebPage, FAQPage. `about` still points to `#organization` (pricing.tsx:465). |
| SearchAction `/blog?q=` doesn't filter | **Still open** (#4) | `?q=turn`, `?q=kiosk` and `?q=zzqq` all return 56,301 bytes and the same 16 posts as `/blog`. `php/blog/default.php` never reads `q`. |
| Founder Person has no LinkedIn `sameAs` | **Still open** (#5) | No Person node has `sameAs`. Needs the founder's URL. |

## Checks against the facts you gave me

**Legacy page prices: correct.** All 22 PHP pages, including /blog, /privacy, /terms and /data-transfer, carry the same AggregateOffer: lowPrice 0, highPrice 179, offerCount 4, with Solo $0, Starter $29, Professional $99, Enterprise $179. The home page has the same four prices.

**sameAs: all 7 official URLs are present, plus BBB, which is not on your list.** `same-as.json`, `php/includes/header.php` and `artifacts/marketplace/src/entry-server.tsx` agree with each other (8 URLs). See #6.

| Platform | Linked | URL |
|---|---|---|
| Capterra | Yes | https://www.capterra.com/p/10182349/Certxa-Booking-Software/ |
| G2 | Yes | https://www.g2.com/products/certxa-booking-software |
| Facebook | Yes | https://www.facebook.com/certxa |
| LinkedIn | Yes | https://www.linkedin.com/company/certxa |
| X | Yes | https://x.com/certxa |
| Instagram | Yes | https://www.instagram.com/certxa |
| Product Hunt | Yes | https://www.producthunt.com/products/certxa |
| BBB | Yes (**not official**) | https://www.bbb.org/us/az/phoenix/profile/software-consultants/certxa-llc-1126-1000175065 |
| Wikipedia, Wikidata, YouTube, Crunchbase | No | Brand-authority gap, not a code fix. |

**Schema vs visible content.** All 12 FAQPage blocks (67 questions) match the visible text exactly, 0 mismatches. All 18 Article and BlogPosting headlines are visible. All 5 product prices match.

## @id consistency

| @id | Variants | Pages | Differences |
|---|---|---|---|
| `#organization` | 2 | 20 marketing, 22 PHP | `url` with vs without trailing slash; `knowsAbout` in PHP only |
| `#founder-tom-tham` | 2 full, plus 16 author stubs | /about vs 22 PHP | /about has `description`; PHP has `image` and `knowsAbout` |
| `#website` | 2 | / vs 22 PHP | `publisher` and `description` in PHP only |
| `#software` | 2 | / vs 22 PHP | See #2 |

Every WebPage has `isPartOf #website`. Four pages use `about #software`: the 2 Vietnamese-audience pages and the 2 turn-system pages. The rest use `about #organization`.

---

## Issues by severity

No Critical issues.

### MEDIUM

**#1. NEW: the founder's `image` returns 404 on 22 pages.**
Evidence: `https://certxa.com/api/r2/site-assets/42d8d1f8-28a0-40ee-99fd-ca3217518624.webp` returned 404 on three separate requests.
Source: `php/includes/header.php:124`. Also `php/about/default.php:138`, which is not what `/about` serves now.
This node is the author of all 16 posts, so the broken image sits on the main E-E-A-T entity. `/about` displays a working photo at `https://certxa.com/airo-assets/images/team/thanh-lam-founder` (200, image/jpeg). Use that URL in the Person node.

**#2. `#software` has two definitions under one `@id`** (open from 10-21).
- `/` (`artifacts/marketing/src/pages/index.tsx`) is multi-vertical, with an `offers` array of four plain Offers, string prices, no `url` and no billing period. `"price": "179"` can be read as a one-time price.
- PHP (`header.php`) is nail-only, says `softwareVersion 2.0`, uses AggregateOffer with monthly `UnitPriceSpecification`, and names plans "Starter Plan" where the home page says "Starter".

Fix: one shared definition in both emitters.
```json
{
  "@type": "SoftwareApplication",
  "@id": "https://certxa.com/#software",
  "name": "Certxa",
  "url": "https://certxa.com/",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "Salon management software",
  "operatingSystem": "Web",
  "publisher": { "@id": "https://certxa.com/#organization" },
  "description": "[REPLACE: one multi-vertical description used by both emitters]",
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "USD",
    "lowPrice": 0,
    "highPrice": 179,
    "offerCount": 4,
    "offers": [
      { "@type": "Offer", "name": "Solo", "price": 0, "priceCurrency": "USD", "url": "https://certxa.com/pricing",
        "priceSpecification": { "@type": "UnitPriceSpecification", "price": 0, "priceCurrency": "USD", "unitCode": "MON", "referenceQuantity": { "@type": "QuantitativeValue", "value": 1, "unitCode": "MON" } } },
      { "@type": "Offer", "name": "Starter", "price": 29, "priceCurrency": "USD", "url": "https://certxa.com/pricing",
        "priceSpecification": { "@type": "UnitPriceSpecification", "price": 29, "priceCurrency": "USD", "unitCode": "MON", "referenceQuantity": { "@type": "QuantitativeValue", "value": 1, "unitCode": "MON" } } },
      { "@type": "Offer", "name": "Professional", "price": 99, "priceCurrency": "USD", "url": "https://certxa.com/pricing",
        "priceSpecification": { "@type": "UnitPriceSpecification", "price": 99, "priceCurrency": "USD", "unitCode": "MON", "referenceQuantity": { "@type": "QuantitativeValue", "value": 1, "unitCode": "MON" } } },
      { "@type": "Offer", "name": "Enterprise", "price": 179, "priceCurrency": "USD", "url": "https://certxa.com/pricing",
        "priceSpecification": { "@type": "UnitPriceSpecification", "price": 179, "priceCurrency": "USD", "unitCode": "MON", "referenceQuantity": { "@type": "QuantitativeValue", "value": 1, "unitCode": "MON" } } }
    ]
  }
}
```
Keep the live-plans override on the home page, mapped to this shape.

**#3. `/pricing`, the page that shows the prices, has no SoftwareApplication or Offer.** Add the #2 node to the `/pricing` graph, and set `about` to `#software` at `pricing.tsx:465`. Also switch `/features`, `/booking` and `/autumn` to `about #software`.

**#4. The SearchAction target does not search** (`header.php:50`, `index.tsx:45-47`). Google retired the sitelinks search box in Nov 2024, so the simplest fix is to remove `potentialAction` from both. Otherwise add `?q=` filtering to `php/blog/default.php`.
Also latent: the marketplace node targets `/search?q=` (`entry-server.tsx:171`), though that branch is not reached while `salons.certxa.com/` redirects.

**#5. Founder and team Person nodes are thin** (open from 10-21). No `sameAs` on any Person, because the founder's LinkedIn needs to come from the founder. `/about` and PHP define different fields. `#toby-benjamin` has no `url`, `image` or `sameAs`. Use one node in both emitters:
```json
{
  "@type": "Person",
  "@id": "https://certxa.com/#founder-tom-tham",
  "name": "Thanh Lam",
  "alternateName": "Tom Tham",
  "jobTitle": "Founder",
  "url": "https://certxa.com/about",
  "image": "https://certxa.com/airo-assets/images/team/thanh-lam-founder",
  "description": "Former nail salon owner and founder of Certxa. Built the platform after experiencing firsthand the limitations of existing salon software.",
  "worksFor": { "@id": "https://certxa.com/#organization" },
  "knowsAbout": ["Nail salon management", "Salon software", "Vietnamese-owned nail salon industry"],
  "sameAs": ["[REPLACE: founder LinkedIn URL]"]
}
```

**#6. BBB is in `sameAs` but not on the official list** (open from 10-21). It sits in `artifacts/marketing/src/config/same-as.json:6`, `header.php`, and `entry-server.tsx` L157. Note that a comment in `header.php` calls BBB confirmed live and cites it as the record of the founder's legal name. This needs a decision: add BBB to the official list, or remove it from all three files.

**#7. Products have no merchant fields.** All 5 lack `sku`, `seller`, `availability`, `shippingDetails` and `hasMerchantReturnPolicy`, and the Product node has no `url` or `@id`. Add `availability` only once the shop actually ships, since it was closed pending UPS setup at the last check. Google merchant listings stay ineligible until then. This is acceptable for now.

### LOW

**#8. Organization field drift** (`organization-json-ld.ts:19`, `header.php`). `url` trailing slash differs, `knowsAbout` is PHP-only, and `hoursAvailable: "Mo-Su 10:00-21:00"` is plain text (`organization-json-ld.ts:56`, `header.php`) where schema.org expects `OpeningHoursSpecification`. `entry-server.tsx:137` redefines `#organization` with a different description, but that branch is not reached.

**#9. `/blog` has no `Blog` node**, though all 16 posts declare `isPartOf https://certxa.com/blog#blog`. Add it through `PAGE_SCHEMA` in `php/blog/default.php`.

**#10. BlogPosting details.** All 16 use the same `og-image.jpg` and none has `wordCount`. `/blog/best-pos-systems-vietnamese-nail-salons` still shows "Updated October 15, 2026" while `dateModified` is 2026-10-22.

**#11. Home `dateModified` is still hard-coded to 2026-10-21** (`index.tsx:115`).

**#12. No breadcrumb on** `/contact`, `/careers`, `/changelog`, `/roadmap`.

**#13. New turn-system Articles** have an Organization as author, the generic OG image and no `speakable`. Blog posts use the founder Person and `speakable`.

**#14. Product `image` URLs are extensionless and return 302** to the real file (for example `/airo-assets/images/products/certxa-station` to `/_site/images/products/certxa-station.webp`). They resolve to images, but the final URL is safer for crawlers.

**#15. SoftwareApplication has no rating, so Google's Software App rich result stays ineligible.** This is the correct choice. Don't add one until there are real, visible reviews.

---

## Tenant sample (outside the main score)

Sample: Luxury Nails, slug `jims`, found through the public Certxa search. Both pages are live.

| | `https://jims.certxa.com/` | `https://certxa.com/book/jims` |
|---|---|---|
| Emitter | `lib/tenant-seo.ts` | `lib/salonSeo.ts` |
| Type | NailSalon | NailSalon in `@graph`, FAQPage with 6 questions |
| `@id` | `https://jims.certxa.com#business` | `https://jims.certxa.com/#business` |
| `aggregateRating` | **5.0 from 20** (own reviews) | **4.5 from 52** (Google) |
| Rating visible in raw HTML | **No.** The page is an empty `#root`; there is no `<Review>` array in schema either | Yes: "Rated 4.5/5 (52 Google reviews)" |
| FAQ matches visible text | n/a | 6 of 6 |

**HIGH (tenant): one salon publishes two different ratings under two near-identical `@id`s**, and `/book/jims` canonicalises to the page with the other rating. Source: `tenant-seo.ts:187` and `salonSeo.ts:118,253`. Three fixes:
1. Use the same rating source and the same `@id` in both emitters.
2. Google's review snippet rules do not accept ratings aggregated from another site, so publish only first-party reviews in `aggregateRating`. This is a policy matter for every salon that has Google reviews, not only this one.
3. Make sure the rating is visible to crawlers on the page that declares it. If the SPA shows it only after JavaScript, crawlers that don't run JavaScript see an unsupported rating.

**Low (tenant):** the sample's schema includes a personal Gmail as `email`, and `sameAs` includes `facebook.com/zopem`. The data looks like test data, but confirm that `email` in schema is meant to be the salon's public address.

**Directory:** `salons.certxa.com/salons` declares `isPartOf https://salons.certxa.com/#website`, a node that is not emitted on that page, because `/` redirects. Low.

---

## GEO-critical assessment

| Schema | Status | GEO impact | Notes |
|---|---|---|---|
| Organization + sameAs | Present | Critical | One @id, 8 sameAs, small field drift (#8). BBB off-list (#6). |
| Person (author) | Partial | High | jobTitle and knowsAbout in PHP. No sameAs (#5). Image 404 (#1). |
| Article + dateModified | Present | High | 16 BlogPosting, 2 Article. |
| speakable | Present | Medium | `.blog-content` on all posts. Not on the 2 turn guides. |
| BreadcrumbList | Present | Low | All targets return 200. Missing on 4 pages (#12). |
| WebSite + SearchAction | Partial | Low | Target doesn't filter (#4). |
| SoftwareApplication | Present | High | Prices correct. Two shapes (#2). Not on /pricing (#3). |
| Product | Partial | Medium | Prices, brand and images right. No merchant fields (#7). |
| FAQPage | Present ×12 | Low (Google), Medium (AI) | 67 questions, 0 mismatches. Restricted rich result, so kept for AI semantics. |

## JavaScript rendering risk

None on certxa.com. Every block is in the initial HTML. The tenant site `jims.certxa.com` also has its JSON-LD in the raw HTML, but its body is client-rendered.

## Score breakdown

| Component | 10-24 | 11-05 | Note |
|---|---|---|---|
| Organization + sameAs to 3+ platforms | 20/20 | 20/20 | |
| Article, author as Person, dateModified | 15/15 | 15/15 | |
| Person: no sameAs | 8/15 | 8/15 | |
| sameAs: 8 platforms, no Wikipedia | 10/15 | 10/15 | |
| speakable on posts | 10/10 | 10/10 | |
| BreadcrumbList | 5/5 | 5/5 | |
| WebSite + SearchAction | 3/5 | 3/5 | Valid URL, no search |
| No deprecated schema | 5/5 | 5/5 | |
| JSON-LD only | 5/5 | 5/5 | |
| Validation | 2/5 | 3/5 | Brand and breadcrumb fixed; founder image 404 and merchant fields remain |
| **Total** | **83** | **84** | |

## Priority actions

1. **[MEDIUM]** #1: replace the founder `image` URL (header.php:124). One line.
2. **[MEDIUM]** #2 and #3: unify `#software` with monthly pricing, and put it on `/pricing`.
3. **[MEDIUM]** #4: remove the SearchAction, or make `/blog?q=` filter.
4. **[HIGH, tenant]** One rating and one `@id` per salon; review how Google-sourced ratings are used.
5. **[LOW]** #8 to #14.
6. **[OWNER]** Get the founder's LinkedIn for #5, decide on BBB for #6, keep `aggregateRating` off certxa.com until there are real visible reviews.

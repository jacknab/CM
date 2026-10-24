# Schema & Structured Data: certxa.com (2026-10-24)

**Schema Score: 83/100** (Good). On 2026-10-21 it was 80.

**Method.** I fetched the raw HTML (no JavaScript, GPTBot user agent) of all 39 URLs in `sitemap-pages.xml` and `blog/sitemap.xml`, plus `/nail-salon-software`. That URL returns a 301 to `/vietnamese-nail-salon-software`, so it is the same page. `/vi/` and `/compare/` return 404. The only Vietnamese page is `/vi/phan-mem-tiem-nail`, and there is no compare hub page.

I parsed every `application/ld+json` block. All of them are valid JSON. All schema is in the server-rendered HTML, so AI crawlers can see it. No page uses Microdata or RDFa.

I checked all 10 FAQPage blocks (59 questions) against the visible page text. They match word for word.

No page has `aggregateRating`, `review` or `ratingValue`, so there is no fake-review or manual-action risk.

## Fixed since 10-21

| 10-21 # | Item | Now |
|---|---|---|
| 3 | Card reader `price: "0"` vs visible $149 | `/products` schema: Station $799, Stripe M2 $69. These match the visible prices and come from the same admin price (`livePriceCents`). |
| 2 (partly) | Product has no `image` | Both Products have absolute `image` URLs that return 200, plus `brand`. |
| 4 | `InStock` while the shop is closed | `availability` was removed (fa6bea41). This is no longer a false claim. |
| 5 | Plan prices $0/$22/$49 | Every emitter now says Solo $0, Starter $29, Professional $99, Enterprise $179: `/` (index.tsx, live admin plans), all 22 PHP pages (header.php AggregateOffer, highPrice 179), and the `/pricing` description and FAQ. No $22, $49 or "Elite" is left in schema or prose. The only such prices are competitor prices in the best-POS blog post. |
| 6 | PHP SearchAction pointed at `/search` (404) | Both emitters now use `https://certxa.com/blog?q={search_term_string}` (200). |
| 14 | `/pricing` cards were JavaScript-only, with placeholder FAQ answers | The cards are server-rendered ($29/$99/$179 are in the raw HTML), and the FAQ has real answers. |
| — | Certxa Kiosk | It was removed from the `/products` ItemList on purpose. It is not in the default visible page either (only visitors with the nail cookie see it), so schema and page agree for crawlers. |

## Regressions since 10-21

**None.** No score component went down, and nothing that was correct on 10-21 is broken now.

The new findings below (#1, #2, #8, #9, #14) are either new content (the Stripe M2 node is from today, commit f7fd0801) or issues the 10-21 audit didn't catch (the compare breadcrumb). They are not things that worked before and broke.

## Detected structured data

| Emitter | Pages | Nodes |
|---|---|---|
| Marketing React (`artifacts/marketing/src/lib/organization-json-ld.ts` + `pages/*.tsx`) | /, about, autumn, booking, features, pricing, products, contact, careers, changelog, roadmap, compare ×4, vietnamese-nail-salon-software, vi/phan-mem-tiem-nail | Block 1: Organization. Block 2: a page graph with WebPage, AboutPage or ContactPage, plus BreadcrumbList, FAQPage, ItemList/Product, and on `/` only, WebSite and SoftwareApplication. |
| PHP (`php/includes/header.php`, `php/blog/article.php`, `php/blog/default.php`) | /blog, 16 posts, /data-transfer, /privacy, /terms, /sms-terms, /google-data-policy | One `@graph` with WebSite, Organization, Person (founder), SoftwareApplication (AggregateOffer), BreadcrumbList, and BlogPosting on posts |
| Marketplace (`artifacts/marketplace/src/entry-server.tsx` L124-176) | Marketplace `/` only. `salons.certxa.com/` redirects to `/salons`, so this is not emitted in practice. | Organization and WebSite |

**@id linking:** there is one `#organization`, one `#website`, one `#founder-tom-tham` and one `#software` across the site. Every WebPage has `isPartOf #website`. The two Vietnamese-audience pages use `about #software`; the rest use `about #organization`.

**sameAs** is identical in all three emitters: 8 URLs, in `same-as.json`, `header.php` L83-92 and `entry-server.tsx` L153-162.

| Platform | Linked | URL |
|---|---|---|
| Capterra | Yes | https://www.capterra.com/p/10182349/Certxa-Booking-Software/ |
| G2 | Yes | https://www.g2.com/products/certxa-booking-software |
| Facebook | Yes | https://www.facebook.com/certxa |
| LinkedIn | Yes | https://www.linkedin.com/company/certxa |
| X | Yes | https://x.com/certxa |
| Instagram | Yes | https://www.instagram.com/certxa |
| Product Hunt | Yes | https://www.producthunt.com/products/certxa |
| BBB | Yes (**not on the official list**) | https://www.bbb.org/us/az/phoenix/profile/software-consultants/certxa-llc-1126-1000175065 |
| Wikipedia / Wikidata / YouTube / Crunchbase | No | Not linked. This is a brand-authority gap, not a code fix. |

---

## Issues by severity

### HIGH

**#1. `/products`: the Stripe M2 Card Reader is marked `brand: Certxa`.** It is a Stripe device, and the visible copy says "powered by Stripe". Google's merchant-listing guidelines need accurate brand data, and AI models will learn that "Certxa makes the M2".
Source: `artifacts/marketing/src/pages/products.tsx:98`. It was added today in f7fd0801, copied from the old "Wireless Card Reader" node.
```json
"name": "Stripe M2 Card Reader",
"brand": { "@type": "Brand", "name": "Certxa" },
```
Fixed node. It also adds the merchant-listing fields that are still missing on both products: `url`, `sku`, `seller`, `availability`, `shippingDetails` and `hasMerchantReturnPolicy`.
```json
{
  "@type": "Product",
  "@id": "https://certxa.com/products#stripe-m2",
  "name": "Stripe M2 Card Reader",
  "description": "Stripe M2 wireless card reader. Chip, tap, and swipe.",
  "image": "https://certxa.com/_site/images/products/stripe-m2-reader.webp",
  "url": "https://certxa.com/products",
  "sku": "[REPLACE: internal SKU, e.g. CX-M2]",
  "brand": { "@type": "Brand", "name": "Stripe" },
  "manufacturer": { "@type": "Organization", "name": "Stripe" },
  "offers": {
    "@type": "Offer",
    "price": "69",
    "priceCurrency": "USD",
    "url": "https://certxa.com/products",
    "seller": { "@id": "https://certxa.com/#organization" },
    "availability": "https://schema.org/[REPLACE: InStock once checkout ships, else PreOrder or OutOfStock]",
    "shippingDetails": {
      "@type": "OfferShippingDetails",
      "shippingRate": { "@type": "MonetaryAmount", "value": "[REPLACE: UPS Ground rate or 0]", "currency": "USD" },
      "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "US" },
      "deliveryTime": {
        "@type": "ShippingDeliveryTime",
        "handlingTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 2, "unitCode": "DAY" },
        "transitTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 5, "unitCode": "DAY" }
      }
    },
    "hasMerchantReturnPolicy": {
      "@type": "MerchantReturnPolicy",
      "applicableCountry": "US",
      "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays": "[REPLACE: e.g. 30]",
      "returnMethod": "https://schema.org/ReturnByMail",
      "returnFees": "https://schema.org/[REPLACE: FreeReturn or ReturnShippingFees]"
    }
  }
}
```
For the Certxa Station (products.tsx:82-88), keep `brand: Certxa` and add the same `url`, `sku`, `seller`, `availability`, `shippingDetails` and `hasMerchantReturnPolicy`. Only set `availability` to `InStock` once the hardware shop actually ships (it is closed until UPS credentials, the ship-from address and product weights are set).

**#2. `/compare/*`: the breadcrumb's level-2 item is `https://certxa.com/compare/`, which returns 404.** This affects all 4 compare pages.
Source: `artifacts/marketing/src/pages/compare/{fresha,glossgenius,square,vagaro}.tsx:26`.
```json
{ "@type": "ListItem", "position": 2, "name": "Compare", "item": "https://certxa.com/compare/" }
```
Fix A: build a `/compare` hub page (useful for "Certxa vs …" queries anyway). Fix B: drop the level:
```json
"breadcrumb": {
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://certxa.com/" },
    { "@type": "ListItem", "position": 2, "name": "Certxa vs Square", "item": "https://certxa.com/compare/certxa-vs-square" }
  ]
}
```

**#3. The SoftwareApplication can't get a rich result because it has no `aggregateRating` or `review`.** This affects `/` and the 22 PHP pages. This is still the main source of Google "Software App" errors (carried over from 10-21 #1).
**Do not add a rating.** header.php L143-150 explains why it was removed: there is one 5.0 review on Capterra. Accept the error until there are 5 or more real reviews, shown on the page with a source link. This is a policy choice, not a bug, so it is listed here only for completeness.

### MEDIUM

**#4. `#software` is defined two different ways under the same `@id`** (carried over from 10-21 #7):
- `/` (`pages/index.tsx:52-105`, live offers at L129-136) is multi-vertical, has an `offers` array of four plain Offers with **no billing period and no `url`**, and has `inLanguage`.
- PHP (`php/includes/header.php:134-183`) is nail-only, says `softwareVersion "2.0"`, uses an AggregateOffer with monthly `UnitPriceSpecification`, and has a different featureList.

On `/`, `"price": "179"` with no unit can be read as a one-time price. Make one shared definition in both emitters, and use the monthly priceSpecification everywhere:
```json
{
  "@type": "SoftwareApplication",
  "@id": "https://certxa.com/#software",
  "name": "Certxa",
  "url": "https://certxa.com/",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "Salon management software",
  "operatingSystem": "Web, Android, iOS",
  "inLanguage": ["en", "vi", "es"],
  "publisher": { "@id": "https://certxa.com/#organization" },
  "description": "All-in-one salon booking software and POS for nail salons, hair salons, barbershops, spas and massage studios: online booking, self check-in kiosk, turn rotation, loyalty, payroll and the Autumn AI receptionist.",
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
Keep the live-plans override in index.tsx L129-136, but map it to this shape: add `url` and `priceSpecification`. Use the same plan names in PHP: today PHP says "Starter Plan" and the home page says "Starter".

Two other notes on the shared definition:
- The `billingDuration` property PHP uses currently is meant for a recurring price's *term*. `unitCode: "MON"` plus `referenceQuantity` is the clearer way to say "per month". Either one validates.
- Only use `"operatingSystem": "Web, Android, iOS"` if the apps are public. Otherwise keep `"Web"`.

**#5. `/pricing`, the page that shows the prices, has no SoftwareApplication or Offer node.** Its graph is only WebPage, BreadcrumbList and FAQPage (`pages/pricing.tsx:457-480`). Add `"about": {"@id":"https://certxa.com/#software"}` to the WebPage, and include the #4 node in the `/pricing` graph. Then the offers sit on the page whose visible cards they describe. Also add `about #software` on `/features`, `/booking` and `/autumn`, which currently point to `#organization`.

**#6. The founder Person node differs between emitters** (carried over from 10-21 #8):
- `/about` (`pages/about.tsx:31-39`) has `description` but no `image` or `knowsAbout`.
- PHP (`header.php:113-127`) has `image` and `knowsAbout` but no `description`.
- Neither has `sameAs`.
- The second Person, `#toby-benjamin` (about.tsx:41-46), has no `url`, `image` or `sameAs`.

Use one node in both files:
```json
{
  "@type": "Person",
  "@id": "https://certxa.com/#founder-tom-tham",
  "name": "Thanh Lam",
  "alternateName": "Tom Tham",
  "jobTitle": "Founder",
  "url": "https://certxa.com/about",
  "image": "https://certxa.com/api/r2/site-assets/42d8d1f8-28a0-40ee-99fd-ca3217518624.webp",
  "description": "Former nail salon owner and founder of Certxa. Built the platform after experiencing firsthand the limitations of existing salon software.",
  "worksFor": { "@id": "https://certxa.com/#organization" },
  "knowsAbout": ["Nail salon management", "Salon software", "Vietnamese-owned nail salon industry"],
  "sameAs": ["[REPLACE: founder LinkedIn URL — needs the founder]"]
}
```
All 16 BlogPostings name Thanh Lam as the author. Confirm with the owner that this is accurate for every post (E-E-A-T authenticity).

**#7. The Organization node differs between emitters** (carried over from 10-21 #9 and #11):
- `url` is `https://certxa.com/` in marketing (`organization-json-ld.ts:19`) and `https://certxa.com` in PHP (`header.php:58`).
- `knowsAbout` is in PHP only (`header.php:101-108`).
- Both use `hoursAvailable: "Mo-Su 10:00-21:00"`, which is plain text (`organization-json-ld.ts:56`, `header.php:98`). Schema.org expects an `OpeningHoursSpecification`.
- The marketplace node (`entry-server.tsx:137`) uses the same `#organization` @id with a different description ("a considered local guide…"). It is latent today because `/` redirects, but make it reference `#organization` instead of redefining it.

Fixed shared fields:
```json
"url": "https://certxa.com/",
"knowsAbout": ["Salon management software", "Nail salon software", "Online appointment booking", "Salon point of sale (POS)", "Staff and payroll management", "AI receptionist for salons"],
"contactPoint": {
  "@type": "ContactPoint",
  "contactType": "customer support",
  "email": "support@certxa.com",
  "telephone": "+1-800-278-4392",
  "availableLanguage": ["English", "Vietnamese"],
  "hoursAvailable": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    "opens": "10:00",
    "closes": "21:00"
  }
}
```
Only add `"Vietnamese"` to `availableLanguage` if support is actually offered in Vietnamese.

**#8. The WebSite SearchAction target does not search.** `/blog?q=turn` returns the same 16 posts as `/blog` (`header.php:50`, home graph). The sitelinks search box was retired in Nov 2024, so the SearchAction gains nothing, and the target is now invalid in practice. Either add `?q=` filtering to `php/blog/default.php`, or remove `potentialAction` from both emitters:
```json
{ "@type": "WebSite", "@id": "https://certxa.com/#website", "url": "https://certxa.com/", "name": "Certxa", "publisher": { "@id": "https://certxa.com/#organization" }, "inLanguage": ["en", "vi"] }
```

### LOW

**#9. The BBB URL is in `sameAs` but not on the official list** (carried over from 10-21 #10). `same-as.json:6`, `header.php:87` and `entry-server.tsx:157`. It is a real profile, so I recommend adding it to the official list. Otherwise remove it from all three files.

**#10. `/blog` has no `Blog` node**, but every post declares `isPartOf https://certxa.com/blog#blog` (carried over from 10-21 #13). Add it through `PAGE_SCHEMA` in `php/blog/default.php`:
```json
{
  "@type": "Blog",
  "@id": "https://certxa.com/blog#blog",
  "name": "The Certxa Blog",
  "url": "https://certxa.com/blog",
  "inLanguage": "en-US",
  "publisher": { "@id": "https://certxa.com/#organization" },
  "blogPost": [ { "@id": "https://certxa.com/blog/best-pos-systems-vietnamese-nail-salons#article" } ]
}
```
List all 16 post `#article` @ids in `blogPost`.

**#11. BlogPosting details** (carried over from 10-21 #12):
- All 16 posts use `image` = `/assets/images/og-image.jpg` (`php/blog/article.php:108`).
- None has `wordCount`.
- `mainEntityOfPage.@id` is the bare URL, while the marketing pages use `…#webpage`.
- New: `/blog/best-pos-systems-vietnamese-nail-salons` has `dateModified 2026-10-22` in schema, but the body says "Updated October 15, 2026". Update the visible line whenever the post is edited, or set `dateModified` from the same value.

Per-post fix:
```json
"image": ["[REPLACE: per-post 1200x675 image]", "[REPLACE: 1200x900]", "[REPLACE: 1200x1200]"],
"wordCount": "[REPLACE: computed from post body]"
```

**#12. No breadcrumb on** `/contact` (`pages/contact.tsx:14`), `/careers` (`careers.tsx:12`), `/changelog` (`changelog.tsx:11`) or `/roadmap` (`roadmap.tsx:13`) (carried over from 10-21 #15). Add the same two-level `breadcrumb` used on `/features` (`features.tsx:46-52`).

**#13. The home WebPage has a hard-coded `dateModified: "2026-10-21"`** (`pages/index.tsx:115`). The home page changed after that date (5892317e, 968b2345). Use the build date or the content date instead of a constant.

**#14. `/products` has a visible "Hardware FAQ" (5 questions) with no FAQPage**, and the accessories shown on the page (customer-facing tablet $99, IP thermal printer $199, cash drawer $99) are not in the ItemList. Both are optional. If you add the accessories, give each one an accurate `brand` (the tablet is a T-Mobile REVVL TAB 2 → `brand: "T-Mobile"`). As with the Kiosk, keep anything that is hidden from crawlers out of the schema.

**#15. Vietnamese entry points:** `/vi/` returns 404, so the only Vietnamese URL is `/vi/phan-mem-tiem-nail`, which has `inLanguage: "vi"` and a Vietnamese breadcrumb. This is not a schema error. If you want a `/vi/` landing page, redirect it to the existing page. The Organization's `contactPoint.availableLanguage` should list Vietnamese only if support is offered in Vietnamese (see #7).

---

## GEO-critical assessment

| Schema | Status | GEO impact | Notes |
|---|---|---|---|
| Organization + sameAs | Present | Critical | One @id site-wide, 8 sameAs. Small field drift (#7). |
| Person (author) | Partial | High | Founder present with jobTitle and knowsAbout (PHP). No sameAs. Two different definitions (#6). |
| Article + dateModified | Present | High | 16 BlogPostings, author as a Person @id, publisher, dateModified, speakable. Same image on every post (#11). |
| speakable | Present | Medium | `.blog-content` on all posts. Not used on marketing pages. |
| BreadcrumbList | Present | Low | On most pages. The compare level-2 item is a 404 (#2). Missing on 4 pages (#12). |
| WebSite + SearchAction | Present | Low | Target returns 200 but doesn't filter (#8). |
| SoftwareApplication | Present | High | Prices correct everywhere. Two shapes (#4). Not on /pricing (#5). No rating, which is correct for now (#3). |
| Product (/products) | Partial | Medium | Prices and images correct. Wrong brand on the M2 (#1). No merchant fields. |
| FAQPage | Present ×10 | Low (Google) / Medium (AI) | All 59 Q&As match the visible text. Restricted rich result, so keep it for AI semantics. |
| Deprecated (HowTo, SpecialAnnouncement, CourseInfo) | None | — | — |

## JavaScript rendering risk

None. Every JSON-LD block is in the initial HTML: the React marketing pages are server-rendered and the PHP pages are server-side. `/products` and `/` build their offers at server-render time from admin prices, and the raw HTML prices match.

## Score breakdown

| Component | Points |
|---|---|
| Organization + sameAs to 3+ platforms | 20/20 |
| Article present, author as a Person, dateModified | 15/15 |
| Person present, but no sameAs | 8/15 |
| sameAs: 8 platforms, no Wikipedia | 10/15 |
| speakable on posts | 10/10 |
| BreadcrumbList | 5/5 |
| WebSite + SearchAction: valid URL, but no search function (#8) | 3/5 |
| No deprecated schema | 5/5 |
| JSON-LD only | 5/5 |
| Validation: #1 brand, #2 breadcrumb 404, Product merchant fields, #3 SoftwareApp rating error | 2/5 |
| **Total** | **83** |

## Priority actions

1. **[HIGH]** #1: change the Stripe M2 `brand` to Stripe, and add the merchant fields to both Products (products.tsx:82-100).
2. **[HIGH]** #2: fix the `/compare/` breadcrumb 404 (compare/*.tsx:26), either by building a hub page or by dropping the level.
3. **[MEDIUM]** #4 and #5: unify `#software` (index.tsx vs header.php) with monthly priceSpecification, and put it on `/pricing`.
4. **[MEDIUM]** #6 and #7: unify the founder Person and the Organization fields (url, knowsAbout, OpeningHoursSpecification).
5. **[MEDIUM]** #8: make `/blog?q=` filter, or remove the SearchAction.
6. **[LOW]** #9–#15.
7. **[USER/OWNER]** Get the founder's LinkedIn for Person `sameAs`, decide whether BBB is on the official list, and keep `aggregateRating` off until there are 5 or more real reviews.

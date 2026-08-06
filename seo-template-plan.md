# SEO Template Review & Optimization Plan
## Template: `nail-salon-bloom`
**Date:** July 26, 2026
**Author:** Replit Agent

---

## Part 1 — Template Review

### What's working well

- **Image priority chain** in `getBestServiceImage()` is the right call — Google review media → review photo → service image → placeholder means real client results always surface first.
- **"✨ Verified Client Result" badge** correctly gated behind `isCustomerImage()` — it only appears for actual customer photos, not stock images. That's honest and trust-building.
- **Inline matched review per service card** is a strong conversion pattern. Seeing a face, a name, and a review next to a specific service is much more persuasive than a generic testimonials section.
- **Mobile sticky bar** is clean — `pb-safe` handles notched phones, `md:hidden` prevents it interfering on desktop.
- **CSS masonry + keyboard lightbox** in the gallery is solid. Arrow key + Escape navigation is properly wired.
- **`fetchPriority="high"`** on the desktop hero image is correct.
- **Canonical URL + OG URL** are replaced server-side at request time by `template-serve.ts`. That part works.

---

### Issues & Recommendations

#### 🔴 Critical — SEO-breaking

**1. The `<script type="application/ld+json">` block is never updated.**

The `template-serve.ts` serving layer replaces `<title>`, description, OG tags, and canonical — but it does **not** touch the LD+JSON. Every salon that uses this template will have Google reading schema that says:

```json
"name": "Bloom Nail Studio",
"url": "https://bloom.example.com",
"telephone": "+1-212-555-0100",
"address": { "streetAddress": "123 Main Street", "addressLocality": "New York" }
```

...regardless of the actual business. This is a local SEO disaster — it actively misleads Google about the business identity, address, and contact information.

**File:** `templates-storage/nail-salon-bloom/project/index.html` (lines 41–92)
**Fix:** Generate LD+JSON dynamically from live store data at serve time in `template-serve.ts` and replace the static block.

---

**2. The `<h1>` in `Hero.tsx` is just the salon name.**

For local SEO, the single most important on-page signal is the H1. Currently it outputs `{salonName}` only. It should be `{salonName} — Nail Salon in {city}` when city data is available. That's the exact phrase people type into Google.

**File:** `templates-storage/nail-salon-bloom/project/src/components/Hero.tsx`
**Fix:** Append city to H1 when available, styled smaller/lighter so it doesn't visually dominate.

---

**3. Keywords meta tag is generic.**

`"nail salon, manicure, pedicure..."` — no city, no neighbourhood, no specific service names from the salon's actual menu. The same tag appears for every salon using this template, providing no local relevance signal.

**File:** `templates-storage/nail-salon-bloom/project/index.html` (line 15)
**Fix:** Build dynamically at serve time: `"{city} nail salon, {city} manicure, {city} gel nails, {serviceName1}, {serviceName2}..."`.

---

**4. `AUTO_MODE_SITEMAP_SECTIONS` in `template-serve.ts` doesn't match this template's anchor IDs.**

The shared sitemap code includes `/#team`, `/#hours`, `/#reviews`, `/#contact` — but this template's sections are `#services`, `#gallery`, `#about`, `#visit`. The sitemap either emits wrong anchors or misses sections entirely.

**File:** `artifacts/api-server/src/lib/template-serve.ts` (line 888–894)
**Fix:** Add a template-aware section list for Bloom, or make the section map configurable per template.

---

#### 🟡 Performance

**5. Google Fonts are render-blocking.**

The two `<link>` tags for Playfair Display + Inter in `<head>` are synchronous — they delay First Contentful Paint on every page load. The browser must wait for both font stylesheets to download before rendering anything.

**File:** `templates-storage/nail-salon-bloom/project/index.html` (lines 36–38)
**Fix:** Use the `media="print" onload="this.media='all'"` async loading pattern plus a `<noscript>` fallback. Keep `font-display: swap` in the URL parameter.

---

**6. No `<link rel="preload">` for the above-fold image.**

The desktop hero image has `fetchPriority="high"` set on the `<img>` element, but that only works after the JS bundle mounts and renders the component. Without a `<link rel="preload">` in `<head>`, the browser doesn't discover the image until React renders, adding 200–800ms to Largest Contentful Paint.

**Fix:** Inject a `<link rel="preload" as="image">` hint from the serving layer (since the image URL may be dynamic — e.g. a gallery photo). On mobile, skip this since the hero image is `hidden lg:block`.

---

#### 🟡 Structured Data Gaps

**7. No `hasMap` or `geo` coordinates on the NailSalon schema.**

Google uses these for the local Knowledge Panel. `tenant-data.ts` already fetches `store_latitude` and `store_longitude` from the DB — they just aren't used in the template's schema.

**Fix:** Include in the dynamic LD+JSON block:
```json
"geo": { "@type": "GeoCoordinates", "latitude": "...", "longitude": "..." },
"hasMap": "https://www.google.com/maps?q=..."
```

---

**8. No `Review` schema for the matched Google reviews.**

The service cards display real Google reviews — those could also be emitted as LD+JSON `Review` objects inside the `NailSalon` schema's `review` array, giving Google rich snippet eligibility for star ratings in organic results.

**Fix:** Include the top 3–5 Google reviews (name, rating, text, date) in the dynamic LD+JSON as `review` array items.

---

**9. The OG image stays as a stock Pexels photo for every salon.**

Every time this page is shared on WhatsApp, Facebook, or iMessage, the preview card shows a generic stock nail photo — not the actual salon's work. This is a missed trust signal and brand opportunity.

**Fix:** Serving layer picks OG image dynamically: first gallery photo → first staff avatar → stock fallback.

---

#### 🟢 Minor

**10. `ServiceCard` image `onError` leaves an empty `bg-cream-100` void.**

When an image fails to load, the handler hides the `<img>` but the container div is still full-height and empty. A small nail-polish SVG icon fallback would be cleaner UX.

**File:** `templates-storage/nail-salon-bloom/project/src/components/ServiceCard.tsx`

---

**11. `Hero.tsx` section has `aria-label="Welcome"` — too vague.**

Screen readers and Google both read this. `aria-label={`Hero — ${salonName}`}` or simply `aria-labelledby` pointing to the H1 would be more meaningful.

**File:** `templates-storage/nail-salon-bloom/project/src/components/Hero.tsx`

---

## Part 2 — SEO Optimization Plan

The work splits across three layers. Changes in the serving layer take effect immediately for all published salons with no rebuild required. Changes to the template itself require a rebuild and re-screenshot.

---

### Layer 1 — Server-side injection in `template-serve.ts`
*Highest impact. Affects all published salons using this template immediately on next request.*

#### 1a. Dynamic LD+JSON from live store data

`serveTenantSite()` currently has access to `website.id`, `website.slug`, `website.templateId`, and the store ID. The fix is: call `buildTenantData(storeId, website)` at serve time and generate a NailSalon LD+JSON block that replaces the static one in the HTML using a regex on `<script type="application/ld+json">`.

The generated schema includes:
- Real salon name, address (street, city, state, postcode), phone, email, URL
- Real `openingHoursSpecification` from the DB `business_hours` rows
- Real `aggregateRating` from review count and average
- Real `makesOffer` from the first 6–8 services (with name and price)
- `geo` coordinates + `hasMap` link from `store_latitude`/`store_longitude`
- `review` array from the top 3–5 Google reviews (author, rating, reviewBody, datePublished)
- `image` pointing to the first gallery photo or staff avatar

**Key function to add:** `buildNailSalonLdJson(tenantData: TenantData, siteUrl: string): string`

---

#### 1b. City-aware auto-generated title, description, and keywords

Currently the `seoMeta` injected by the serving layer only fires when the website owner has manually filled in SEO fields in the builder editor. The fix: if `seo.title` is empty/missing, generate a smart fallback from live data.

**Title fallback:**
```
{salonName} | Nail Salon in {city}
```

**Description fallback:**
```
{salonName} offers gel manicures, pedicures, nail extensions & nail art in {city}.
Rated {avgRating}/5 from {reviewCount} Google reviews. Book your appointment online in seconds.
```

**Keywords fallback:**
```
{city} nail salon, {city} manicure, {city} pedicure, gel nails {city}, nail extensions {city},
{serviceName1}, {serviceName2}, {serviceName3}, nail art {city}, book nail appointment {city}
```

This runs in the existing `buildSeoHeadTags()` path — no new route needed.

---

#### 1c. Dynamic OG image from gallery or staff photos

In `buildSeoHeadTags()` (or just before it in `serveTenantSite()`), check:
1. `tenantData.galleryPhotos[0]?.image_url` → use as OG image
2. `tenantData.staff[0]?.avatar_url` → fallback
3. Static Pexels hero image → last resort

Then replace:
```html
<meta property="og:image" content="...">
```
...with the selected URL.

---

#### 1d. Fix `AUTO_MODE_SITEMAP_SECTIONS` for Bloom template

The current shared list:
```typescript
const AUTO_MODE_SITEMAP_SECTIONS = [
  "/#services", "/#team", "/#hours", "/#reviews", "/#contact"
];
```

The Bloom template uses: `#services`, `#gallery`, `#about`, `#visit`.

Fix: make this a per-template map keyed by template name (or ID), falling back to the shared list. E.g.:
```typescript
const TEMPLATE_SECTIONS: Record<string, string[]> = {
  "Nail Salon — Bloom": ["/#services", "/#gallery", "/#about", "/#visit"],
  "default": ["/#services", "/#team", "/#hours", "/#reviews", "/#contact"],
};
```

---

#### 1e. Geo meta tags injection

Inject from live `business.latitude` / `business.longitude` / `business.city` + `business.state`:
```html
<meta name="geo.region" content="US-{state}">
<meta name="geo.placename" content="{city}">
<meta name="geo.position" content="{lat};{lng}">
<meta name="ICBM" content="{lat}, {lng}">
```

These are minor signals but reinforce every other local SEO element.

---

### Layer 2 — Template `index.html`
*Requires a rebuild + re-screenshot of the template. One-time effort.*

#### 2a. Async Google Fonts loading

Replace:
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:..." rel="stylesheet" />
```

With:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
  media="print"
  onload="this.media='all'"
/>
<noscript>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" />
</noscript>
```

Eliminates a render-blocking resource. Saves 200–600ms on FCP for first-time visitors.

---

#### 2b. Remove hardcoded placeholder meta values

The static `index.html` contains placeholder values that will never be correct for any real salon:
- `<title>Bloom Nail Studio | ...` → replaced at serve time anyway, but confusing as source truth
- `<link rel="canonical" href="https://bloom.example.com/">` → already replaced at serve time ✓
- LD+JSON block with `bloom.example.com` → will be replaced once Layer 1 is done ✓

The static values should be clearly marked as build-time placeholders (comments) so future developers don't mistake them for real values.

---

### Layer 3 — Template components
*Requires rebuild. Medium effort, meaningful SEO gains.*

#### 3a. `Hero.tsx` — City-aware H1

Change:
```tsx
<h1 className="font-serif text-[2.4rem] ...">
  {salonName}
</h1>
```

To:
```tsx
<h1 className="font-serif text-[2.4rem] ...">
  {salonName}
  {city && (
    <span className="block text-2xl font-normal text-ink-600 mt-1 sm:inline sm:text-4xl sm:ml-2">
      — Nail Salon in {city.split(',')[0]}
    </span>
  )}
</h1>
```

This keeps the visual hierarchy clean while giving Google the full local intent signal in a single H1.

---

#### 3b. `VisitUs.tsx` — Machine-readable microdata on address

Wrap the `<address>` element with `itemscope itemtype="https://schema.org/LocalBusiness"` and add `itemprop` attributes to street, city, phone, and name. This gives Google a second, independent structured data signal (beyond the LD+JSON) and is parsed by the HTML parser, not the JS runtime — so it works even if JS is slow.

```tsx
<address
  itemscope
  itemtype="https://schema.org/NailSalon"
  className="mt-1 text-sm not-italic leading-relaxed text-ink-600"
>
  <span itemprop="name" className="sr-only">{salonName}</span>
  <span itemprop="streetAddress">{address}</span>
  {city && <><br /><span itemprop="addressLocality">{city.split(',')[0]}</span></>}
</address>
```

---

#### 3c. `FeaturedServices.tsx` and `Gallery.tsx` — Descriptive `aria-label` on sections

```tsx
// FeaturedServices
aria-label={`Services at ${salonName}`}

// Gallery
aria-label={`${salonName} client gallery`}
```

Google reads these as supplementary context for section headings.

---

#### 3d. `Hero.tsx` — Fix section `aria-label`

Change `aria-label="Welcome"` to `aria-labelledby="hero-heading"` and add `id="hero-heading"` to the H1. This is semantically correct and lets both screen readers and Google connect the section to its heading.

---

## Execution Roadmap

| # | Priority | What | Layer | Rebuild needed? | Est. effort |
|---|---|---|---|---|---|
| 1 | 🔴 Critical | Dynamic LD+JSON from live store data | `template-serve.ts` | No | Medium |
| 2 | 🔴 Critical | City-aware title + description auto-generation | `template-serve.ts` | No | Small |
| 3 | 🔴 Critical | City-aware H1 in Hero | `Hero.tsx` | Yes | Small |
| 4 | 🟡 High | Fix sitemap sections for Bloom template | `template-serve.ts` | No | Small |
| 5 | 🟡 High | Dynamic OG image from gallery/staff | `template-serve.ts` | No | Small |
| 6 | 🟡 High | City-aware keywords | `template-serve.ts` | No | Small |
| 7 | 🟡 Medium | Async Google Fonts loading | `index.html` | Yes | Small |
| 8 | 🟢 Low | Geo meta tag injection | `template-serve.ts` | No | Small |
| 9 | 🟢 Low | `itemprop` microdata on address | `VisitUs.tsx` | Yes | Small |
| 10 | 🟢 Low | `Review` LD+JSON array in schema | `template-serve.ts` | No | Small |
| 11 | 🟢 Low | Fix Hero `aria-label` + descriptive section labels | Components | Yes | Small |
| 12 | 🟢 Low | ServiceCard image `onError` SVG fallback | `ServiceCard.tsx` | Yes | Small |

---

## Key Architectural Note

All Layer 1 changes share a single prerequisite: `serveTenantSite()` must call `buildTenantData()` at request time so it has the live store data available for injection. Currently it only reads `website.content.seo` (user-edited fields) and doesn't query the business data. Once that query is added, all 6 serving-layer improvements (items 1, 2, 5, 6, 8, 10) flow from that single change.

The `buildTenantData()` call should be cached (e.g. 10-minute in-memory TTL keyed by `storeId`) to avoid a DB hit on every page request. The cache is already used elsewhere in the codebase for tenant data.

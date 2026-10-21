# Salon directory: build it once, to Google's rules

Written 2026-10-15. This plan replaces the directory's piecemeal fixes (Sep 4, Sep 8, Sep 22, Oct 7) with a single design. Those fixes kept reopening because they patched individual pages. The problems are in the data and the page model.

## Why the directory keeps failing

| Problem | Evidence (live, 2026-10-15) | Google policy it hits |
|---|---|---|
| A keyword list on every hub page | `/listings/dixon--california` shows "Popular local searches: union nails in union missouri, brookfield nail salons wi, paris nail salon oxford ms…". The same block appears on all 5,190 city and state pages. | Spam policies: keyword stuffing |
| City pages with nothing on them | The Dixon page has 214 words, mostly navigation, plus 5 names and ratings. 5,148 city pages like it are all `index, follow`. | Spam policies: doorway pages ("pages created to rank for specific regional searches") |
| Invented copy in the salon's voice | 47,369 of 47,511 salons have AI-written "About" text that speaks as the salon ("our skilled technicians…"). The salons never wrote or approved it. | Scaled content abuse; misrepresentation |
| A copy of Google Maps | Names, addresses, phone numbers, ratings, review counts and hours (`salon_google_hours`) come from the Google Places API and are stored in `nail_salons`. | Adds no value over the source. Google Maps Platform terms allow storing only the `place_id` long-term (see Decisions). |
| Third-party ratings in schema | Claimed salons emit `aggregateRating` built from Google's numbers. | Review snippet rules: ratings must be collected by the site itself |
| A sales-lead table used as a public directory | `nail_salons` holds `lead_score`, `contract_risk`, `opportunity_score` and `has_vagaro`. Listed salons never opted in and can't opt out. | Trust; also a legal and business risk |
| Uneven coverage | Texas has 1 salon. Nine states have 0. About 2,800 salons have addresses no state page can use. | Weak as a directory; looks auto-generated |

None of this can be fixed with tags alone. The directory needs its own data, and pages that show something nobody else has.

## The principle

**A directory page may be indexed only if a searcher learns something there that Google Maps can't tell them.** Every other page can exist for people and for the claim flow, but it is `noindex, follow` and left out of sitemaps. One function decides this, and the page `robots` tag, the sitemaps and the schema all read from it, so they can't drift apart again.

Certxa has information no one else has:

1. **Live menus, prices and availability** for salons that run on Certxa: real services, real prices, the next open slot, and booking.
2. **Owner-supplied information** for claimed salons: their own description, menu, photos and hours.
3. **Verified reviews** collected after a completed Certxa appointment. These are first-party, so they can legitimately carry `aggregateRating`.
4. **State license records** (public data). Nail salons and technicians are licensed in every state, and boards publish the license number, status and expiry date. Texas TDLR, the California BBC and the Florida DBPR publish this data (bulk download terms to be confirmed per state). This gives each salon a useful fact ("Licensed by TDLR, active through 2027") that Google Maps doesn't show. It's also the legitimate way to fill the coverage gaps, Texas first.

## Data model

A new `directory_listings` table, separate from the `nail_salons` lead table:

- The salon's facts: name, street address split into parts, city, state, postal code, phone in +1 format, lat/lng, and website.
- **Where each field came from** (`license_board` | `owner` | `certxa_store`) and when it was last checked.
- `license_number`, `license_status`, `license_expires`, `license_source_url`.
- `store_id` once the salon is on Certxa, and `claimed_at` and `claimed_by` once it's claimed.
- `place_id` only (allowed to be stored), used to match records. No Google ratings, review counts, hours or summaries.
- `opted_out_at`: every listing gets a "Remove this listing" link, and removal is honoured within a day.

`nail_salons` stays as the sales team's lead list and is no longer read by public pages.

## Listing tiers

| Tier | Who | Page shows | Indexed? | Schema |
|---|---|---|---|---|
| **A: Books on Certxa** | Salons with a live Certxa store | Live menu with prices, next available times, Book button, owner photos and description, staff, hours, verified reviews, license status | Yes | `NailSalon` with `@id`, split `PostalAddress`, `geo`, `telephone`, `openingHoursSpecification`, `makesOffer` (priced services), and `aggregateRating` + `review` only from verified Certxa reviews shown on the page |
| **B: Claimed** | Owner has verified the listing but doesn't book through Certxa | Owner's description, menu with prices, photos, hours, license status | Yes, once complete: owner-written description of 80+ words, 5+ priced services, hours and 3+ photos. Until then, no. | Same as A, without ratings |
| **C: Listed** | License-record salons nobody has claimed | Name, address, phone, map, license status, "Is this your salon? Claim it free" | **No** (`noindex, follow`, not in sitemaps) | Minimal `NailSalon` (name, address, phone, geo), no ratings |

No page shows generated prose written as the salon. If a tier C page needs a sentence, it is third person, built from facts, and plain: "Pink Nails is a licensed nail salon at 123 Main St, Dixon, CA. License #12345, active."

## Hub pages (city and state)

**A city page is indexed only when** it has **3 or more tier A/B salons**. Its content comes from real data, not filler:

- **An answer-first summary** generated from the data, e.g. "12 licensed nail salons in Dixon, CA. 4 take online booking on Certxa. A gel manicure costs $30–$45 at the salons that publish prices (October 2026)." AI answers quote passages like this.
- The tier A/B salons, each with a starting price, the next open time and license status. Tier C salons follow as a plain list.
- Price ranges per service, computed from real menus.
- A map, neighbourhoods, and links to nearby cities that are also indexed.
- `ItemList` + `BreadcrumbList` schema, and a real `dateModified` (when a listing in the city last changed).

City pages below the threshold stay up for visitors and internal links but are `noindex, follow` and left out of `sitemap-listings.xml`. A city is promoted automatically when it reaches the threshold.

**State pages** are indexed when the state has at least one indexed city. They hold the state's licensing rules in plain language, e.g. "Texas: salons are licensed by TDLR; check a license at…", which is useful and quotable. Below that come the indexed cities, then the rest.

**A `/salons/` root page** lists states, so the bare folder address works.

Removed everywhere: "Popular local searches", any keyword list, and links to pages that 404.

## URLs

Recommended, done once with 301s from every current address:

- `/salons/` (all states)
- `/salons/texas/` (state)
- `/salons/texas/houston/` (city)
- `/salons/texas/houston/pink-nails-a1b2/` (salon)

The current scheme has three problems:
- Salon pages sit at the site root (`/:slug`), mixed in with the software pages.
- City pages use `/listings/city--state`.
- Two moves in two months have already happened.

A single folder makes the directory a clear section: easy to measure in Search Console, easy to manage, and kept apart from the software pages' topic. If you'd rather not move URLs again, the tiers, gates and content rules all work on the current addresses too.

## How Google, AI search and answer engines are each served

- **SEO:**
  - Only pages with unique value are indexed.
  - Real titles and descriptions come from the data ("Pink Nails, Houston TX: gel manicure from $35, book online").
  - Self-canonical URLs, sitemaps listing only indexable pages with true `lastmod`, image width and height set, and fast server rendering (it's already SSR).
- **GEO and AEO:**
  - Answer-first summaries and price ranges with dates.
  - License facts with their source linked.
  - Every claim comes from a dataset, so AI systems can quote it safely.
  - `llms.txt` gets a short "Salon directory" section explaining the tiers and the data sources.
- **Trust:**
  - Each page has a visible "How this directory works" link: sources, how listings are verified, how reviews are collected, and how to remove a listing.
  - Each listing shows "Last updated".

## Rollout

**Phase 0: stop the damage. Done 2026-10-15** (commit after `eff09243`; live after the deploy step). The gate lives in `getIndexableHubs()` in `artifacts/api-server/src/lib/salonData.ts`. With 1 Certxa salon on the site, no hub page qualifies yet.
- Remove "Popular local searches".
- Stop rendering the generated first-person "About" text.
- Remove Google ratings from page schema and display.
- Apply the hub-page gate using today's data: noindex hubs with fewer than 3 claimed or Certxa salons, and drop them from the sitemap. In practice that's nearly all of them for now. Indexed pages fall sharply at first; that's intended.

**Status 2026-10-17: Phases 1 and 2 are built.** The public directory is hosted at `salons.certxa.com`; the old `certxa.com/salons/...` URLs redirect there. The directory's existing SSR bundle must be rebuilt when directory frontend source changes. The importer supports CA, CO, DE, FL, IL, NY and TX state records. Summary:
- `directory_listings` holds 32,683 salons: 10,314 TX, 8,637 CA, 6,454 FL, 5,063 NY, 1,163 IL, 877 CO and 174 DE from license records, plus TLuxxe from its Certxa store. About 84% are geocoded by the US Census Geocoder; Delaware, Colorado and Illinois' sources do not provide street addresses.
- The importer is `scripts/import-license-records.py`; its NY source is the NYS Department of State's public active Appearance Enhancement Business dataset. The NY import matched 79 license records to existing listings and added 4,984 from nail-related business names.
- Delaware is available from the [Division of Professional Regulation's active Cosmetology/Barbering Establishment dataset](https://data.delaware.gov/d/pjnv-eaih). It publishes city and ZIP but not street addresses; only active records with nail-related names are included. The import added 174 listings.
- Colorado is available from DORA's [Professional and Occupational Licenses dataset](https://data.colorado.gov/Regulations/Professional-and-Occupational-Licenses-in-Colorado/7s5z-vewr), limited to active business-level Shop Registration licenses (`REG`), not individual cosmetology or nail-technician licenses. The feed publishes mailing city and ZIP but not street addresses; deduplicating repeated source rows and filtering to nail-related names added 877 listings.
- Illinois is available from IDFPR's [Professional Licensing dataset](https://data.illinois.gov/d/pzzh-kp68), limited to active business-level `BCENT SALON/SHOP REGISTRATION` records, not individual professionals or schools. The feed publishes city and ZIP but not street addresses; filtering to nail-related business/DBA names added 1,163 listings.
- The public pages read only `directory_listings` (`lib/salonData.ts`).
- Pages live at `https://salons.certxa.com/salons/...`. The subdomain root redirects to `/salons`; the old `certxa.com/salons/...`, `/listings/*`, `/:slug` and `/salon/*` URLs redirect there, or answer 410 when the salon isn't listed.
- `/salons/about` and the removal form (`POST /api/directory/:slug/removal`) are live.
- No Google ratings, reviews, hours, attributes or generated text are published.
- Not done yet:
  - the weekly import schedule (needs the owner's go-ahead)
  - the remaining states' license data
  - price ranges per city
  - verified-review collection

**Phase 1: data (1–2 weeks).**
- Create the `directory_listings` table.
- Import state license records, starting with Texas, California and Florida, then the remaining states. Match them to existing rows by phone, address and `place_id`.
- Add the "Remove this listing" flow.
- Stop reading `nail_salons` from public pages.

**Phase 2: pages (1–2 weeks).**
- Build the tier A/B/C salon template, the city and state hubs, the `/salons/` root and the "How this directory works" page.
- Add the new URL scheme with 301s, the schema above, the sitemaps and one indexability function.

**Phase 3: content that compounds (ongoing).**
- Verified reviews after Certxa appointments.
- A claim-and-complete push to listed salons (email or SMS through the existing lead tools), since each completed claim can lift its city over the threshold.
- A weekly report: indexable salons and cities by tier, plus Search Console coverage for `/salons/`.

**After this:** the directory only grows when real data arrives, and nothing becomes indexable unless it passes the gate. There's nothing to revisit except the weekly numbers.

## Decisions for the owner

1. **Google Places data.** Recommendation: stop publishing it (ratings, hours, review counts) and stop storing anything but `place_id`. Google Maps Platform's terms prohibit caching or storing Places content beyond `place_id` (and lat/lng for up to 30 days), and continuing risks the API key and the account. Have someone read the current terms to confirm before relying on this summary.
2. **The generated "About" text** for all 47,511 salons. Recommendation: delete it from public pages (Phase 0) and stop generating it.
3. **The URL move to `/salons/…`.** Recommended, but optional.
4. **License-board data as the base dataset.** Recommended. Some states charge a small fee or require a records request; Texas, California and Florida appear to offer bulk downloads; confirm each one before Phase 1.

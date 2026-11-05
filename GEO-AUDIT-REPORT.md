# GEO Audit — certxa.com

**Date:** 2026-11-05 · **Previous:** 2026-10-24 (60/100) · **Business type:** SaaS (nail-salon POS, booking, turn rotation, Autumn AI receptionist) · **Pages analyzed:** 24 sitemap pages + 17 blog/sitemap URLs + 5 extra paths (46), plus 9 salon subdomains

## GEO Score: 62/100 (Fair)

| Category | Weight | Score | 10-24 | Weighted |
|---|---|---|---|---|
| AI Citability | 25% | 87/100 | 84 | 21.75 |
| Brand Authority | 20% | 13/100 | 12 | 2.60 |
| Content E-E-A-T | 20% | 53/100 | 50 | 10.60 |
| Technical GEO | 15% | 85/100 | 84 | 12.75 |
| Schema & Structured Data | 10% | 84/100 | 83 | 8.40 |
| Platform Optimization | 10% | 61/100 | 57 | 6.10 |
| **Overall** | | | | **62.2** |

Platforms: Bing Copilot 73, ChatGPT 69, Google AI Overviews 68, Perplexity 56, Gemini 38. Crawler access 100/100. llms.txt 83/100 before today's fixes.

The 10-24 fixes held: one price list everywhere, Autumn calls at 20/50/100, "no card for the trial" on every page, Most popular = Professional, all 5 products in the /products schema. The new turn-system guide (EN + VI) is now the most citable page on the site (90). Brand authority (13) is still the biggest drag. Certxa wasn't named in any of 4 discovery queries, and only 1 of 18 roundup pages (iTechGuides) mentions it.

Detail reports in this folder: `GEO-AI-VISIBILITY.md`, `GEO-PLATFORM-OPTIMIZATION.md`, `GEO-TECHNICAL-AUDIT.md`, `GEO-CONTENT-ANALYSIS.md`, `GEO-SCHEMA-REPORT.md`.

## Fixed on 2026-11-05 (live)

| # | Fix | Where |
|---|---|---|
| 1 | llms.txt priced the Station at $799; /products and its schema say $499 → now lists all 5 prices ($499 / $99 / $89 / $59 / $69) | `artifacts/booking/public/llms.txt` |
| 2 | llms.txt listed 4 of the 6 MCP tools → added `check_walk_in_wait` and `join_walk_in_line` | same |
| 3 | Founder Person `image` (author of all 16 posts) was a 404 R2 file on 22 pages, and was also the /about photo on the PHP page → working founder photo | `php/includes/header.php:124`, `php/about/default.php:138` |
| 4 | Blog said "Autumn … is included in every plan" (Solo has none) → Starter 20, Professional 50, Enterprise 100 calls | `blog_posts` id 18 |
| 5 | llms-full.txt was stale since 10-24 and lacked the turn guides → regenerated (40 pages) and deployed | `scripts/gen-llms-full.py` → `api-server/dist/public/` |

## Critical / High — open

1. **Offline card copy may now be wrong (owner, test first).** /products, /vietnamese-nail-salon-software and /vi/phan-mem-tiem-nail say card payments need the internet, and /roadmap lists offline cards as "In progress". The M2 now supports Stripe offline mode ($300 / $1,500 limits), but it hasn't been tested on a device. Update the copy once a real offline card sale works.
2. **Salons with a published website get no salon SEO files.** `<slug>.certxa.com/llms.txt`, robots.txt and sitemap.xml return the website HTML (7 of 9 sampled; live-confirmed on bella-nails and jims) because `subdomain.ts:353` returns before the salonSeo block. Logged in `pre-errors.md`.
3. **Retired PHP pages answer on every `*.certxa.com` host.** `salons.certxa.com/pricing` is `index, follow` with old $18/$39 Elite prices (`marketing-site.ts:331`). Search still shows old $22/$49/$79 prices from 301'd pages.
4. **X account in `sameAs` looks like someone else's.** `x.com/certxa` shows "체르타", Seoul, joined 2022, 0 followers. Confirm it or remove it from `sameAs`.
5. **Wrong third-party facts.** iTechGuides lists "SalonOS by Certxa" at $7/mo with no free plan, and Capterra's snippet still says US$9. Update or ask for a correction.
6. **Compare pages are unsourced and undated.** Vagaro "60-day free trial" (sources say 30); "Certxa does not operate a consumer marketplace" contradicts /salons and llms.txt; GlossGenius "Limited to solo providers".
7. **/data-transfer stats** ("0 data lost", "24 h average") are unsupported. **/terms** never states the 74-day maximum or that there's no grace period.
8. **Images send `no-store`** (`marketing-site.ts:294`) and the home hero preload has no `media`, so phones fetch a 208 KB 2560 px JPEG they never show.
9. **One salon, two ratings:** `jims.certxa.com` says 5.0 / 20 while `/book/jims` says 4.5 / 52, under `@id`s that differ by a slash (`tenant-seo.ts:187` vs `salonSeo.ts:253`).

## Medium / Low — open

- No general "nail salon software" page: `/nail-salon-software` 301s to the Vietnamese page and `/nail-salon-pos` is 404.
- /mcp isn't linked from any page or listed in the MCP registry, and a test salon shows up in `search_salons`.
- `#software` has two shapes; /pricing has no Offer; SearchAction `/blog?q=` doesn't filter; BBB is an 8th `sameAs` not on the official list.
- The pricing compare table is icon-only; the changelog has nothing since 10-24 although /about says "we ship updates every week"; /google-data-policy's "Last updated" is always today; the sitemap index lastmod is always today.
- JS bundle is 1.32 MB (373 KB gzip). The legacy nav is missing /products and the turn guides.
- API reflects any Origin with credentials (`CORS_ALLOW_ALL`). Not a GEO issue, but it's in the technical report and pre-errors.md.

## Needs the owner

1. Brand authority: Wikidata item, YouTube channel with 2–3 demos, Capterra/G2 pricing update + review requests, check the X account, founder LinkedIn URL for the Person `sameAs`.
2. Confirm hardware prices $499 / $99 / $89 / $59 / $69 (llms.txt now follows /products).
3. Test an offline M2 card sale, then fix the "card payments need internet" copy.
4. Decide whether the broad "nail salon software" term should get its own page instead of the Vietnamese redirect.

## Quick wins for this week

1. Serve salonSeo's robots/sitemap/llms.txt before the published-website return in `subdomain.ts`.
2. Put the new marketing site on all `*.certxa.com` hosts (or 301 the PHP pages) so old prices stop being indexed.
3. Add an "Updated <date>" line and a short sources list to the four /compare pages; fix the Vagaro trial and "no marketplace" lines.
4. Add a changelog entry for 10-25 → 11-05 (turn guide, MCP server, offline M2, Pro Plus).
5. Link /mcp from the footer and the features page, list it in the MCP registry, and hide test salons from search.

# GEO Platform Optimization: certxa.com

**Date:** 2026-11-05 · **Previous (2026-10-24):** Platform 57/100
**Method:** Same as 10-24. I used the supplied crawl, which is raw server-rendered HTML with no JS execution: 45 URLs, robots.txt, sitemaps, llms.txt and llms-full.txt. I parsed JSON-LD and headings with Python. Live checks added here: the Wikidata and Wikipedia APIs, YouTube and GitHub by direct URL, the official MCP registry API, `POST https://certxa.com/mcp` (initialize, tools/list and read-only search_salons only, nothing booked), 9 tenant subdomains, and the salons.certxa.com robots, sitemaps and sample pages. G2, Capterra, LinkedIn, Facebook, Instagram, Product Hunt and BBB block fetchers from here, so anything about them is **unverified**. A brand's absence from WebSearch's thin index is not evidence that it is absent from the web.

## Platform Readiness Analysis

**Platform Readiness Average: 61/100** (+4 vs 10-24; 60.8 rounded)

### Platform Scores Overview

| Platform | Score | Δ vs 10-24 | Status |
|---|---|---|---|
| Google AI Overviews | 68/100 | +6 | Fair |
| ChatGPT Web Search | 69/100 | +3 | Fair |
| Perplexity AI | 56/100 | +4 | Fair |
| Google Gemini | 38/100 | +2 | Poor |
| Bing Copilot | 73/100 | +3 | Good |

**Strongest platform: Bing Copilot.** `msvalidate.01` is present (`261005E6A952E6B004A337B7532827B4`), and the IndexNow key file returns 200. The sitemap index shows lastmod 2026-11-05. /products now has all 5 products with Offers that match the visible prices. Crawled pages answered in about 0.08 to 0.14 s.

**Weakest platform: Google Gemini.** `youtube.com/@certxa` still returns 404, and there are 0 `<video>`/`<iframe>` elements across the crawl. The Wikidata API still returns no item for "Certxa". Google Business Profile and a Knowledge Panel cannot be verified from outside.

**Outside the rubric:** the MCP server is a real ChatGPT and Claude action surface, but none of the five rubrics has a category for it, so I did not score it. It is covered under H3 and in the ChatGPT section.

---

## What changed since 10-24

**Fixed or improved (all re-verified):**
1. **The /pricing Autumn contradiction (old H1) is fixed.** Cards, the comparison table, the FAQ, /autumn, llms.txt and llms-full all say 20 / 50 / 100 on Starter / Professional / Enterprise. Solo is no longer promised calls. A residue remains, see M1.
2. **The /products schema regression (old M2) is mostly fixed.** FAQPage is back, and all 5 products now have Product + Offer (Station 499, tablet 99, printer 89, drawer 59, M2 69), which matches the visible page. The meta description no longer promises kiosks. `availability` is still absent from every Offer.
3. **New citable asset:** `/nail-salon-turn-system` and `/vi/chia-tua-tiem-nail` (Article + 8-question FAQPage, 2 tables, calculator, valid en/vi/x-default hreflang, 1,452 and 1,603 words, dated 2026-10-30). The opening paragraph is a clean definition of a turn system. 21 crawled pages link to the English guide.
4. **llms-full.txt hardware is corrected.** There is no "Barcode Scanner" or "two main devices", and it carries $499/$89/$59. llms.txt no longer lists "Certxa Kiosk".
5. **llms.txt now documents `/mcp`,** the turn guide and the directory rules.
6. **"Most popular" is on Professional on both** home and /pricing (old L1).
7. **The trial message is one line everywhere:** "No credit card is needed" on /pricing and /data-transfer.
8. **Changelog** gained a 10-24 entry and now flags the old 10-12 Autumn numbers as changed.

**Regressed or new:**
1. **llms.txt quotes the Station at $799; the live page says $499** (H1). Hardware prices were cut, and the summary file was missed.
2. **New tenant SEO is missing on most salons sampled** (H2). `/llms.txt` returns HTML on 7 of 9 sampled.
3. **MCP gaps** (H3): nothing on the site links to it, it is not in the official registry, and a test salon comes back in search results.

**Unchanged (re-verified):** compare pages are uncited, Wikidata, Wikipedia, YouTube and GitHub are all still empty, the founder Person has no `sameAs`, there is no "What is Certxa?" block, marketing pages are undated, and the pricing table has unlabeled icons.

---

## Issues by severity

### CRITICAL
None. No crawler blocks, no pricing rendered client-side only.

### HIGH

**H1. llms.txt gives a wrong Station price, the file AI assistants are told to read first.** URLs: https://certxa.com/llms.txt and its copy at https://salons.certxa.com/llms.txt
- llms.txt: "Certxa Station all-in-one POS terminal ($799)".
- https://certxa.com/products: visible "$499 Buy now", Product Offer `499`. llms-full.txt also says $499.
- $799 appears on no crawled page; llms.txt is the only source. The same line gives no prices for the tablet, printer or cash drawer, although it ends "with prices".
- **Fix:** change the line to Station $499, tablet $99, printer $89, drawer $59, Stripe M2 $69. Better, generate this line from the same data as /products so it cannot drift.

**H2. Per-tenant SEO reaches only 2 of 9 sampled salons.** Evidence, from 9 slugs returned by the MCP search:

| Tenant | /llms.txt | robots.txt | FAQPage on home |
|---|---|---|---|
| tobys, tom-nails | text/markdown | 34 lines | Yes |
| bella-nails, jims, kims-nails, tluxxe-nail-studio, beautybar, floyds99, test-salon-evaluation-only | **text/html, the homepage shell** (200) | 3 lines (no named AI crawlers) | No |

- The 7 still have a `NailSalon` or similar JSON-LD node, a title and a description, but a sampled shell has an empty `<div id="root"></div>` and 0 server-rendered body words (checked on jims, kims-nails, tluxxe-nail-studio).
- **Likely cause (code reading, not confirmed against the database):** `artifacts/api-server/src/middleware/subdomain.ts:353-356` returns `handleTenantSiteBySlug` for any published website before the `salonSeo` branch at line 392 runs. So salons with a published website get none of it.
- **Fix:** serve salonSeo's robots, sitemap and llms.txt before the published-site return, and add its FAQ, summary and JSON-LD to the template-serve output.

**H3. The MCP server works but is hard to discover and returns a test salon.** URL: https://certxa.com/mcp
- **Working:** `initialize` and `tools/list` succeed, and the server exposes 6 tools with read-only annotations. Protocol version 2025-06-18.
- **Discovery:** 0 of 45 crawled pages link to it. `registry.modelcontextprotocol.io/v0/servers?search=certxa` returns 0 servers. `/.well-known/mcp.json`, `/.well-known/mcp` and `/.well-known/ai-plugin.json` all return 404. `GET /mcp` is a 405 JSON message, so there is no human or crawler-readable page. Absent from llms-full.txt. ChatGPT app directory listing: unverified; the owner submission is noted as pending.
- **llms.txt lists 4 of 6 tools,** omitting `check_walk_in_wait` and `join_walk_in_line`.
- **Data quality:** `search_salons` with `query: "salon"`-style terms returned "Test Salon — Evaluation Only" (123 Test Avenue, Las Vegas, (702) 555-0100), which an assistant could offer to a real client. Also: Bella Nails has type "Hair Salon", and Toby's has no address.
- **Thin coverage for the real use case:** six query terms surfaced 9 distinct salons (not a total count). `city: Phoenix, AZ` and `service: pedicure, TX` each returned 0.
- **Fix:** exclude test accounts from `search_salons`. Add a public `/ai` or `/mcp` docs page (keeping POST at `/mcp`) and link it from the footer. Publish to the official MCP registry. List all 6 tools in llms.txt.

**H4. Entity layer still missing (ChatGPT, Gemini, Copilot).**
- **Verified absent:** Wikidata `wbsearchentities?search=Certxa` returns `[]`, Wikipedia search has 0 hits, `youtube.com/@certxa` and `github.com/certxa` return 404.
- The Organization has 8 `sameAs` entries. Neither Person on /about (Thanh Lam, Toby Benjamin) has `sameAs`, and neither has an image there.
- **Unverified (thin index):** Capterra snippets still say "$9 per month for the Solo Plan", and G2 snippets still mention Solo and Elite plans. Live pricing is Solo free / $29 / $99 / $179.
- **Fix:** create the Wikidata item and add it to `sameAs`. Have the listing owner correct Capterra and G2. Add LinkedIn `sameAs` and a headshot to the founder Person.

**H5. Community validation is near zero (Perplexity).** This tool found no Reddit or forum threads (unverified). Snippets show a single 5.0 Capterra rating and a G2 line saying the product "hasn't been reviewed yet" (both unverified). Certxa did not appear in this tool's results for "best nail salon software 2026 turn rotation check-in kiosk" or for "nail salon turn system how it works calculator half turn" (unverified, thin index); the guide is 6 days old.
- **Fix:** run a review drive (target 10+ G2/Capterra reviews in 60 days) and post disclosed answers in nail-tech and small-business communities. Link the calculator where it actually helps.

**H6. Comparison claims are still uncited and undated.** URLs: https://certxa.com/compare/certxa-vs-glossgenius, -vagaro, -fresha, -square. Each has 1 external link (the Launchpadly footer badge), and no "verified", "as of" or "sources" text. `/blog/best-pos-systems-vietnamese-nail-salons` (11 external links) remains the only sourced comparison. It is 1 of 16 posts with more than the footer link.
- **Fix:** add a disclosure line, "Verified November 2026" and a Sources list to `ComparisonLayout.tsx`, and soften borderline "No" cells to "Add-on" or "Not listed on site".

### MEDIUM

**M1. "Every plan" remains for Autumn, while plans now say paid only.**
- https://certxa.com/autumn: meta "Available 24/7 on every Certxa plan", body "Autumn is available on every Certxa plan".
- `/blog/best-pos-systems-vietnamese-nail-salons`: "included in every plan".
- /pricing and the /autumn FAQ say "paid plans", and the Solo plan gets no calls per the 20/50/100 lines.
- **Fix:** say "paid plans" on all three. /changelog's "every plan" line is a dated record with its correction, so it can stay.

**M2. The turn guide and MCP are missing from llms-full.txt.** llms-full lists 38 sources, none of them `/nail-salon-turn-system`, `/vi/chia-tua-tiem-nail` or `/mcp`, and "turn calculator" has 0 hits. Its header says it holds the pages listed in llms.txt, so the newest and best asset is left out.
- **Fix:** add them to `scripts/gen-llms-full.py` and regenerate.

**M3. The turn guide has no named author or sources.** URLs: https://certxa.com/nail-salon-turn-system, /vi/chia-tua-tiem-nail. Article `author` is the Organization, and there are no outbound links except the footer badge. A Vietnamese founder who ran a salon is the strongest possible E-E-A-T signal here, and it is not used.
- **Fix:** set the author to the founder Person with a visible byline, and add a "How we compiled this" note.

**M4. Salon directory: 32,683 listings, almost none indexable.** salons.certxa.com
- `noindex, follow` on every sample: `/salons/texas`, `/salons/california`, `/salons/michigan`, `/salons/texas/houston` and a Houston listing.
- `sitemap-salons.xml` has 1 URL, and `sitemap-listings.xml` has 0.
- This follows a stated rule in llms.txt (city and state pages index only with 3+ Certxa-booking salons), so it is a product decision, not a bug. The effect is that the directory gives AI engines almost nothing to cite today.
- **Decide:** whether license-backed state pages should be indexable. If they stay noindex, this is expected.

**M5. Money pages still lack a definition answer.** Home has 0 of 10 question H2s, and "What is Certxa?" appears on neither home, /features, /about nor /pricing. **Fix:** as on 10-24, add the H2 with a 40–60 word answer to home, and 2–3 question H2s to /features.

**M6. Freshness is thin outside the blog and the turn guide.**
- /pricing, /features, /products, /autumn and /compare/* have no visible date and no `dateModified`. Home's is 2026-10-21.
- Posts show the publish date only: `/blog/reduce-no-shows-nail-salon` shows August 25, 2026 while `dateModified` is 2026-10-15.
- The changelog's latest entry is 2026-10-24, so the turn guide and MCP are not in it.
- **Fix:** emit `dateModified` plus visible "Updated" dates, and add the 10-30 and later releases to /changelog.

**M7. The generic head term has no page.** `https://certxa.com/nail-salon-software` 301-redirects to `/vietnamese-nail-salon-software`. English-speaking owners searching the core category land on a page scoped to Vietnamese-owned salons, and no generic nail-salon-software page is in the sitemap.
- **Fix:** build a generic nail-salon software page, or at minimum point this URL at home or /features.

**M8. /products Offers have no `availability`.** 0 occurrences. The hardware shop is noted as closed pending UPS setup, while the page shows "Buy now" and "Order". **Fix:** add `availability` to all 5 Offers and align the buttons with the real shop state.

### LOW

- **L1.** The pricing comparison table still has 0 `sr-only` labels on check/x icons, raw category keys ("staff", "pos", "ai", "general") and no Solo column.
- **L2.** /data-transfer still jumps h2→h4 (`12244444422`).
- **L3.** IndexNow success is still unverifiable: there are no IndexNow lines in `/root/.pm2/logs`.
- **L4.** Directory footer on https://salons.certxa.com/salons shows placeholder-looking links "Featured deal #2", "Featured deal #8" and the tagline "Made for good hair days". Nearby cards on a Houston listing read "0.0 mi 0.0".
- **L5.** llms.txt names 3 license sources (TX, CA, FL) while /salons/about names 7 boards and the index says 8 states. It also says the salons "root URL" is the SaaS homepage on a copy served from the subdomain.
- **L6.** `/pro` 301s to `/overview`, which 301s to `/`. A Pro-specific landing page does not exist at that address, and `/solo` returns 404.
- **L7.** /booking says deposits are "Not yet" and /roadmap lists them as Planned, while the codebase has Solo deposits. Confirm which is right for the public line.

---

### Google AI Overviews: 68/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Content Structure | 31/40 | Turn guide has a definition lead, 8 question H3s + FAQPage and 2 tables, en and vi. /products FAQ restored. /pricing consistent. Home and /features still have no question H2s or definition block. |
| Source Authority | 12/30 | Compare pages have 0 citations and no as-of date. Turn guide is original but has no named author. Only 1 of 16 posts is sourced. Absent from this tool's discovery results (unverified). |
| Technical Signals | 25/30 | /products schema complete bar `availability`. Article schema on guides. Valid hreflang. Marketing pages undated, pricing icons unlabeled, /data-transfer heading skip. |

**Optimization Actions:**
1. Add the founder byline and sources to the turn guide (M3).
2. Add Sources, disclosure and "Verified November 2026" to `ComparisonLayout.tsx` (H6).
3. Add "What is Certxa?" plus a 40–60 word answer to home and question H2s to /features (M5).

### ChatGPT Web Search: 69/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Entity Recognition | 12/35 | No Wikidata item, 0 Wikipedia hits (both verified via API). 8 Organization `sameAs`. Founder Person has no `sameAs`. Capterra $9 and G2 Elite still in snippets (unverified). |
| Content Preferences | 32/40 | Autumn numbers and the trial line are consistent. Literal prices and rates throughout. Lost points for llms.txt $799 and "every plan" on /autumn. Marketing pages undated. |
| Crawler Access | 25/25 | GPTBot, OAI-SearchBot and ChatGPT-User explicitly allowed. `Content-Signal: ai-train=yes, search=yes, ai-retrieval=yes`. |

**Optimization Actions:**
1. Fix the llms.txt Station price and "every plan" wording (H1, M1). These are the most likely misquotes today.
2. Remove test accounts from `search_salons`, add a docs page and complete the ChatGPT app submission (H3).
3. Create the Wikidata item and correct Capterra and G2 (H4).

### Perplexity AI: 56/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Community Validation | 4/30 | No Reddit, Quora or forum mentions found (unverified). 1 Capterra rating, G2 unreviewed (both unverified). |
| Source Directness | 20/30 | Turn guide with worked examples and a calculator is a true primary source. /pricing and /products are literal. Still no original data. Compare claims uncited. |
| Content Freshness | 13/20 | Sitemap 11-05, guide dated 10-30. Changelog stops at 10-24. Posts show publish dates only. llms.txt Station price is stale. |
| Technical Access | 19/20 | PerplexityBot and Perplexity-User allowed. SSR on marketing pages. Tenant pages sampled render no body without JS (H2). |

**Optimization Actions:**
1. Run the review drive and disclosed community answers, linking the calculator (H5).
2. Publish one original-data post, e.g. anonymised Autumn call timing, with a table.
3. Add "Updated" dates to posts and marketing pages, and bring /changelog current (M6).

### Google Gemini: 38/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Google Ecosystem | 5/35 | `youtube.com/@certxa` returns 404. 0 videos or iframes across the crawl. GBP, News and Scholar unverifiable. |
| Knowledge Graph | 10/30 | Organization has address, phone, logo, founder and 8 `sameAs`. No Wikidata. Knowledge Panel unverifiable. |
| Content Quality | 23/35 | Turn guide + calculator adds real depth to the 16-post nail cluster, in en and vi. Still 1 image per post and no video. |

**Optimization Actions:**
1. Create @certxa on YouTube with 3 demos (turn rotation, kiosk check-in, Autumn on a call). Embed them with `VideoObject` on /nail-salon-turn-system, /autumn and /features, and add the channel to `sameAs`.
2. Claim the Google Business Profile for Certxa LLC with the same Phoenix NAP as the schema.
3. Create the Wikidata item (shared with ChatGPT).

### Bing Copilot: 73/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Bing Index Signals | 25/30 | msvalidate.01 present, IndexNow key 200, sitemap index current (11-05). Ping success unverifiable (no log lines). |
| Content Preferences | 24/30 | Consistent, literal, professional. Comparison sourcing and the hardware line in llms.txt are the gaps. |
| Microsoft Ecosystem | 7/20 | LinkedIn in `sameAs` (403 to fetchers; completeness unverified). `github.com/certxa` returns 404. |
| Technical Signals | 17/20 | Fast SSR, full Product coverage. Missing `availability`, minor heading skip. |

**Optimization Actions:**
1. Add `availability` to all 5 Offers (M8).
2. In Bing Webmaster Tools, confirm sitemap and IndexNow "URLs received", and log each ping response (L3).
3. Have the founder complete the LinkedIn company page.

### Cross-Platform Synergies

1. **One source of truth for hardware and plan facts, feeding /products, /pricing, /autumn, llms.txt and llms-full.txt.** Impacts: all 5.
2. **Wikidata item, corrected Capterra/G2 and founder `sameAs`.** Impacts: ChatGPT, Gemini, Copilot, Perplexity.
3. **Cited, dated comparison pages and an authored turn guide.** Impacts: AIO, Perplexity, Copilot, ChatGPT.
4. **Tenant SEO on published websites.** Impacts: all 5, on local salon queries.
5. **YouTube demos with `VideoObject`.** Impacts: Gemini, AIO.
6. **Visible "Updated" dates plus `dateModified`.** Impacts: Perplexity, AIO, ChatGPT.

### Priority Actions (All Platforms)

1. **[HIGH]** Fix llms.txt hardware prices, and generate them from the /products data. Affects: all 5. Effort: Low.
2. **[HIGH]** Apply salonSeo to salons with published websites. Affects: all 5, locally. Effort: Medium.
3. **[HIGH]** Remove test accounts from MCP search, add a docs page, list all 6 tools and publish to the registry. Affects: ChatGPT, plus Claude clients. Effort: Low–Medium.
4. **[HIGH]** Add sources and a verified date to the four /compare pages. Affects: AIO, Perplexity, Copilot, ChatGPT. Effort: Low.
5. **[HIGH]** Create the Wikidata item, correct Capterra and G2, add founder `sameAs`. Affects: ChatGPT, Gemini, Copilot. Effort: Medium (owner/founder access).
6. **[MEDIUM]** Fix "every plan", add the guide to llms-full, add a guide byline, add `availability`. Affects: all 5. Effort: Low.
7. **[MEDIUM]** Add "What is Certxa?", a generic nail-salon-software page, and Updated dates; bring /changelog current. Affects: AIO, Perplexity, ChatGPT. Effort: Low–Medium.
8. **[MEDIUM]** YouTube channel with 3 embedded demos, plus the Google Business Profile. Affects: Gemini, AIO. Effort: Medium.
9. **[MEDIUM]** Review drive and disclosed community answers. Affects: Perplexity, ChatGPT. Effort: Medium–High (ongoing).

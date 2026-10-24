# GEO Platform Optimization: certxa.com

**Date:** 2026-10-24 · **Previous (2026-10-21):** Platform 53/100
**Method:** I fetched the raw server-rendered HTML with `curl`, sending OAI-SearchBot and PerplexityBot user agents with no JS execution. That covered 15 marketing URLs, all 16 blog posts, robots.txt, the sitemap index plus pages and blog sitemaps, llms.txt, llms-full.txt and the IndexNow key file. JSON-LD and headings were parsed with Python. Wikidata and Wikipedia were checked through their public APIs, and YouTube and GitHub by direct URL. Every other off-site claim comes from a thin WebSearch index and is labelled **unverified**. A brand's absence from that index is not evidence that it is absent from the web.

## Platform Readiness Analysis

**Platform Readiness Average: 57/100** (+4 vs 10-21)

### Platform Scores Overview

| Platform | Score | Δ vs 10-21 | Status |
|---|---|---|---|
| Google AI Overviews | 62/100 | +6 | Fair |
| ChatGPT Web Search | 66/100 | +5 | Fair |
| Perplexity AI | 52/100 | +4 | Poor/Fair |
| Google Gemini | 36/100 | +1 | Poor |
| Bing Copilot | 70/100 | +5 | Good |

**Strongest platform: Bing Copilot.** The site carries a `msvalidate.01` meta tag (`261005E6A952E6B004A337B7532827B4`). The IndexNow key `https://certxa.com/7b38e41964b7464d87071d9c66f87649.txt` returns 200. All of these load fast (73–110 ms): the sitemap index (lastmod 2026-10-24), the SSR pages, and the pricing page, which now renders its prices on the server. The blog SearchAction now targets `/blog?q=`, so the 10-21 404 is fixed.

**Weakest platform: Google Gemini.** There is still no Google-ecosystem footprint. `https://www.youtube.com/@certxa` returns 404, there are 0 `<video>`/`<iframe>` elements across all 31 pages fetched, and the Wikidata API search for "Certxa" returns no item. Google Business Profile and a Knowledge Panel cannot be verified from outside.

---

## What changed since 10-21

**Fixed or improved:**
1. **/pricing now ships prices in the server HTML.** Visible SSR text has Starter $29.00, Professional $99.00 and Enterprise $179.00 cards, a per-plan comparison table and a "Solo free" line. The FAQPage answer to "How much does Certxa cost?" is now literal: *"Starter is $29.00 a month … Professional is $99.00 … Enterprise is $179.00 … The Solo plan … is free."* The free-trial answer is also literal (60 days, card required). The meta and WebPage description match. This was the #1 issue on 10-21.
2. **Prices are consistent across the site.** The home Offers (0/29/99/179), the blog and data-transfer AggregateOffer (low 0, high 179, 4 offers), llms.txt, llms-full.txt, the VN pages and the compare FAQs all say Solo free / $29 / $99 / $179. The old $22/$49 "Elite" figures appear nowhere. The only "Elite" text left is a competitor's tier in the best-POS post, which is correct.
3. **Compare tables are machine-readable.** On `/compare/certxa-vs-{glossgenius,vagaro,fresha,square}`, each of the 12 feature rows now has literal "Yes"/"No" text.
4. **The blog WebSite SearchAction is fixed.** It is now `https://certxa.com/blog?q={search_term_string}` on blog pages too.
5. **/products was redesigned** with a Station hero at $799 and accessories: REVVL TAB 2 $99, IP printer $199, cash drawer $99, Stripe M2 $69. Prices are visible in SSR, and processing rates are stated literally.

**Regressed or new:**
1. **The /products FAQPage schema is gone.** The page still shows 5 Q&As visibly, but the JSON-LD types are now only Product, Offer, ItemList, Brand, BreadcrumbList, WebPage and Organization (`grep -c FAQPage` = 0). On 10-21 it had a matching FAQPage.
2. **The /products Product ItemList covers 2 of 5 items:** Certxa Station `799` and the card reader `69`. The tablet, printer and cash drawer have no Product/Offer. No Offer carries `availability` (the shop is closed pending UPS setup, so `availability` matters).
3. **llms-full.txt is stale on hardware.** It was last modified 2026-10-24 16:21 GMT, but its /products section still lists a "Barcode Scanner $89" and the "two main devices" FAQ wording, which today's commit replaced with the Stripe M2 reader. llms.txt line 12 advertises "Certxa Station, **Certxa Kiosk**, wireless card reader". The SSR /products page fetched without the nail cookie shows no Kiosk, yet its meta description still promises "self check-in kiosks … same-day ready".
4. **New contradiction on /pricing about Autumn calls** (see Issue H1).

---

## Issues by severity

### CRITICAL
None remaining on-site. The 10-21 critical issue (pricing not rendered server-side) is fixed.

### HIGH

**H1. /pricing contradicts itself (and the rest of the site) on included Autumn calls.** URL: https://certxa.com/pricing
- Plan cards: the Starter card has **no** AI Receptionist line, Professional has "AI Receptionist (100 calls)", Enterprise has "AI Receptionist (200 calls)".
- The FAQ on the same page says *"20 calls a month are included on Solo, 50 on Starter and 100 on Professional."* It does not mention Enterprise.
- /autumn, llms.txt line 11 and llms-full say 20/50/100 for Solo/Starter/Professional.
- An answer engine asked "Does Certxa Starter include the AI receptionist?" gets opposite answers from the same page.
- **Fix:** make the plan-card feature list and the FAQ come from one source. Either add "AI Receptionist (50 calls)" to the Starter card and "(200 calls)" to the FAQ, /autumn and llms.txt, or remove 200 from Enterprise. The owner must confirm the Enterprise number.

**H2. Comparison claims are uncited and undated.** URLs: https://certxa.com/compare/certxa-vs-glossgenius, -vagaro, -fresha, -square
- There are 0 outbound links on each compare page and no "as of"/"verified" line, although the titles say "(2026)".
- Absolute "No" claims about competitors, e.g. GlossGenius "Loyalty programs: No" and "Team payroll and commissions: No", and Fresha "Self check-in kiosk: No", are the kind of claim Perplexity and AIO discount or cross-check.
- The pattern already exists in `/blog/best-pos-systems-vietnamese-nail-salons`: *"Updated October 15, 2026 … linked our sources at the end"*, with 10 external links and a real table.
- **Fix:** add the same disclosure line, a "Verified October 2026" date and a Sources list linking each competitor's pricing and feature pages to `ComparisonLayout.tsx`. Turn borderline "No" cells into "Add-on" or "Not listed on site".

**H3. Entity layer missing (ChatGPT, Gemini, Copilot).**
- **Verified absent:** the Wikidata API `wbsearchentities?search=Certxa` returns `[]`, Wikipedia search returns 0 hits, `youtube.com/@certxa` returns 404 and `github.com/certxa` returns 404.
- The founder `Person` (`#founder-tom-tham`, name "Thanh Lam", alternateName "Tom Tham") still has no `sameAs` on /about or the blog. The blog node has an image but the /about node does not.
- **Unverified (thin index):** the Capterra listing still shows "starting price $9 per month" and a single 5.0 review. Capterra returned 403 to a direct fetch.
- **Fix:** create a Wikidata item for Certxa (software; developer Certxa LLC; official website; Capterra/G2/LinkedIn/Product Hunt identifiers) and add its URL to Organization `sameAs`. Have the account owner correct the Capterra starting price to "Free (Solo); $29/mo". Add LinkedIn `sameAs` and the headshot `image` to the founder Person on /about.

**H4. Community validation is near zero (Perplexity).** This tool found no Reddit, Quora or forum threads (unverified; Reddit's API was not reachable from here). Review volume is one Capterra review (unverified). For "best nail salon software 2026 turn rotation check-in kiosk", this tool's results were Zenoti guides and The Edinburgh Reporter, with no certxa.com.
- **Fix:** run a review drive (target 10+ G2/Capterra reviews in 60 days) and post disclosed founder answers in r/Nailtech and r/smallbusiness threads about turn rotation and check-in.

### MEDIUM

**M1. Money pages have no question headings or definition answer.**
- Home `https://certxa.com/` has 0/10 question H2s and /features has 0 question H2s (its only question H3s are in the footer). Neither has a "What is Certxa?" answer block.
- /autumn (12), /booking (6), /products (6), the VN page (7) and /blog (11) do follow the pattern.
- **Fix:** add to home: H2 "What is Certxa?" followed by a 40–60 word answer, e.g. *"Certxa is salon software for nail salons, barbershops and spas that combines online booking, a POS, a self check-in kiosk, turn rotation, payroll and Autumn, an AI phone receptionist. Solo is free; team plans are $29, $99 or $179 a month with a 60-day trial."* Add to /features: "How does turn rotation work?" and "Does Certxa work offline?".

**M2. /products schema regression.** URL: https://certxa.com/products
- **Fix:** restore FAQPage for the 5 visible Q&As.
- Add Product nodes for the REVVL TAB 2 ($99), IP Thermal Receipt Printer ($199) and Cash Drawer ($99).
- Add `availability` to every Offer (`PreOrder`/`OutOfStock` while the shop is closed, `InStock` later).
- Rewrite the meta and WebPage descriptions so they don't promise "self check-in kiosks … same-day ready" when non-nail visitors see no kiosk.

**M3. Hardware facts disagree between llms files and the live page.** URLs: https://certxa.com/llms-full.txt (Barcode Scanner $89, "two main devices") and https://certxa.com/llms.txt (Certxa Kiosk).
- **Fix:** regenerate with `scripts/gen-llms-full.py` after deploy. Change llms.txt line 12 to the current lineup: Station $799, Stripe M2 $69, customer screen $99, printer $199, cash drawer $99, plus a kiosk for nail salons if that is intended.

**M4. Freshness signals are thin outside the blog.**
- /pricing, /features, /products, /autumn and /compare/* have no visible date and no `dateModified`. Home has `dateModified 2026-10-21`, while the sitemap lastmod is 10-22.
- Blog posts still show only the publish date. For example, `/blog/reduce-no-shows-nail-salon` shows "August 25, 2026" while BlogPosting `dateModified` is 2026-10-15.
- The changelog's latest entry is October 12 although the hardware and pricing changes shipped on 10-21 and 10-24.
- **Fix:** emit `dateModified` in WebPage schema plus a visible "Updated <date>" on these pages. Render "Updated <dateModified>" on posts when it differs from the publish date. Add the 10-21 pricing and 10-24 hardware changes to /changelog.

**M5. The pricing comparison table has unlabeled icon cells.** On https://certxa.com/pricing, the "Compare plans" table uses bare lucide `check`/`x` SVGs with 0 `aria-label`/`sr-only` text. Category rows render raw keys ("staff", "pos", "ai", "general"). Solo has no column.
- **Fix:** add `<span class="sr-only">Included</span>`/`Not included`, add title-case category labels and add a Solo column.

### LOW

- **L1.** "Most popular" is on Professional on the homepage pricing block but on Starter on /pricing. Pick one.
- **L2.** /data-transfer heading levels jump h2→h4 (`12244444422`).
- **L3.** Blog posts carry an empty `WebPage` node (no name or description) alongside BlogPosting.
- **L4.** IndexNow submission success is unverifiable: there are no IndexNow lines in `/root/.pm2/logs`. Add a log line on each ping response.

---

### Google AI Overviews: 62/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Content Structure | 28/40 | /pricing has SSR cards, a table and a literal FAQ, and the compare tables have Yes/No text (both new). Question H3 + FAQPage pattern on /autumn, /booking, /products, VN pages and blog. Home and /features have 0 question H2s and no definition answer. The Autumn calls contradiction is on /pricing. |
| Source Authority | 11/30 | Compare pages have 0 outbound citations and no as-of date. The best-POS post is the only well-sourced comparison (10 external links). certxa.com did not appear in this tool's discovery results (unverified). |
| Technical Signals | 23/30 | Clean h1→h2→h3 on most pages and canonicals everywhere. /products lost FAQPage schema. Marketing pages are undated. The pricing table has unlabeled icons. |

**Optimization Actions:**
1. Add the "What is Certxa?" H2 plus a 40–60 word answer to home, and 2–3 question H2s to /features (M1).
2. Add Sources, a disclosure line and "Verified October 2026" to `ComparisonLayout.tsx` (H2).
3. Restore FAQPage on /products and give the pricing table text labels (M2, M5).

### ChatGPT Web Search: 66/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Entity Recognition | 12/35 | No Wikidata item and 0 Wikipedia hits (both verified via API). There are 8 Organization `sameAs` entries, all official profiles. The founder Person has no sameAs. Capterra "$9 starting price" is still shown (unverified). |
| Content Preferences | 29/40 | Highly quotable facts: plan prices, trial terms, processing rates (2.7%+5¢ / 2.9%+30¢ + $0.60), Autumn $0.50/call and $15 setup, hardware prices. There is a blog author byline. The Autumn included-calls contradiction and undated marketing pages pull it down. |
| Crawler Access | 25/25 | GPTBot, OAI-SearchBot and ChatGPT-User are explicitly allowed. `Content-Signal: ai-train=yes, search=yes, ai-retrieval=yes`. |

**Optimization Actions:**
1. Resolve the /pricing Autumn-calls contradiction (H1). It is the most likely misquote today.
2. Create the Wikidata item and add it to `sameAs`. Add LinkedIn `sameAs` and the image to the founder Person.
3. Have the Capterra and G2 owner set the starting price to Free / $29 and remove deposit claims (deposits are not built).

### Perplexity AI: 52/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Community Validation | 4/30 | No Reddit, Quora or forum mentions found (unverified). One Capterra review (unverified). |
| Source Directness | 17/30 | /pricing and /products are now primary sources with literal numbers. Changelog and roadmap exist. No original research. Compare claims are readable but uncited. |
| Content Freshness | 12/20 | Sitemap lastmod 2026-10-24 and blog dateModified exist. Visible dates show publish only. The changelog stops at Oct 12. llms-full hardware is stale. |
| Technical Access | 19/20 | PerplexityBot and Perplexity-User are allowed. Pricing no longer depends on JS. SSR loads in about 80 ms. |

**Optimization Actions:**
1. Run the review drive and disclosed Reddit participation (H4).
2. Publish one original-data post, e.g. anonymised Autumn call logs showing the share of salon calls that come after hours, with a table.
3. Show "Updated" dates on posts and marketing pages, and log the 10-21/10-24 changes in /changelog (M4).

### Google Gemini: 36/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Google Ecosystem | 5/35 | `youtube.com/@certxa` returns 404. 0 videos or iframes on 31 pages. GBP, News and Scholar are unverifiable. |
| Knowledge Graph | 10/30 | Organization has address, phone, logo, founder and 8 sameAs. No Wikidata. Knowledge Panel unverifiable. |
| Content Quality | 21/35 | Topical cluster of 16 nail-ops posts, VN landing pages in en/vi with valid hreflang, compare pages and the hardware page. 1 image per post, no video. |

**Optimization Actions:**
1. Create the YouTube channel @certxa with 3 demos (turn rotation, kiosk check-in, Autumn taking a call). Embed them on /features, /autumn and the matching posts with `VideoObject`, and add the channel to `sameAs`.
2. Claim and verify the Google Business Profile for Certxa LLC with the same Phoenix NAP as the schema.
3. Create the Wikidata item (shared with ChatGPT).

### Bing Copilot: 70/100

| Signal Category | Score | Key Findings |
|---|---|---|
| Bing Index Signals | 25/30 | msvalidate.01 present, IndexNow key returns 200, sitemap index current. Ping success is unverifiable (no log lines). |
| Content Preferences | 22/30 | Professional tone with literal prices and rates everywhere. Comparison sourcing and the Autumn contradiction are the gaps. |
| Microsoft Ecosystem | 7/20 | LinkedIn company page is in sameAs (completeness unverified; founder-owned). No public GitHub org (`github.com/certxa` returns 404). |
| Technical Signals | 16/20 | Fast SSR, mobile viewport, semantic headings. SearchAction fixed. Minor h2→h4 skip on /data-transfer. |

**Optimization Actions:**
1. In Bing Webmaster Tools, confirm the sitemap and IndexNow "URLs received", and add a ping result log line (L4).
2. Add `availability` and complete Product coverage on /products. Copilot surfaces shopping answers from Offer data (M2).
3. Have the founder complete the LinkedIn company page: industry, size, specialties, website.

### Cross-Platform Synergies

1. **One source of truth for plan features, Autumn calls and hardware lineup, feeding /pricing, /autumn, /products, llms.txt and llms-full.txt.** Impacts: all 5.
2. **Cited, dated comparison pages.** Impacts: AIO, Perplexity, Copilot, ChatGPT.
3. **Wikidata item, aligned Capterra/G2 facts and founder Person sameAs.** Impacts: ChatGPT, Gemini, Copilot, Perplexity.
4. **YouTube demos with VideoObject.** Impacts: Gemini, AIO.
5. **Visible "Updated" dates plus `dateModified` on marketing pages and posts.** Impacts: Perplexity, AIO, ChatGPT.

### Priority Actions (All Platforms)

1. **[HIGH]** Fix the /pricing Autumn included-calls contradiction (Starter card vs FAQ; Enterprise 200). Affects: all 5. Effort: Low (needs owner to confirm numbers).
2. **[HIGH]** Add sources, a disclosure and "Verified Oct 2026" to the four /compare pages. Affects: AIO, Perplexity, Copilot, ChatGPT. Effort: Low.
3. **[HIGH]** Create the Wikidata item, correct Capterra's $9 price and add founder sameAs. Affects: ChatGPT, Gemini, Copilot. Effort: Medium (owner/founder access).
4. **[MEDIUM]** On /products, restore FAQPage, add the 3 missing Products and `availability`, and fix the kiosk meta. Then regenerate llms-full.txt and fix llms.txt hardware line 12. Affects: AIO, Copilot, ChatGPT, Perplexity. Effort: Low.
5. **[MEDIUM]** Add "What is Certxa?" and question H2s on home and /features. Add visible Updated dates and `dateModified` to marketing pages and posts. Bring /changelog up to date. Affects: AIO, Perplexity, ChatGPT. Effort: Low–Medium.
6. **[MEDIUM]** YouTube channel with 3 embedded demos, plus the Google Business Profile. Affects: Gemini, AIO. Effort: Medium.
7. **[MEDIUM]** Review drive (10+ G2/Capterra) and disclosed Reddit answers. Affects: Perplexity, ChatGPT. Effort: Medium–High (ongoing).

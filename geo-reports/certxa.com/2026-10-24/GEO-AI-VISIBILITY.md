# AI Visibility Analysis: certxa.com

**Date:** 2026-10-24 · **Target:** https://certxa.com · **Brand:** Certxa (AI receptionist: Autumn)
**Method:**
- Fetched with live `curl` using a GPTBot user agent, about 2 requests per second:
  - robots.txt, llms.txt and llms-full.txt
  - the sitemap index and both child sitemaps
  - all 39 sitemap URLs (22 pages, the blog index and 16 posts)
  - 4 city landing pages
- Compared the live llms files with the source in `artifacts/booking/public/` and the deployed copy in `artifacts/api-server/dist/public/`.
- Brand checks:
  - Wikipedia and Wikidata through their APIs.
  - Profile pages fetched with curl and WebFetch.
  - WebSearch, which has a thin index.

This was an audit only. No site files were changed.
**Previous audit (2026-10-21):** Citability 82, Brand 13, Crawler 100, llms.txt 85, so AI Visibility was 66.

## Headline scores

| Score | 2026-10-24 | 2026-10-21 | Change |
|---|---|---|---|
| **AI Citability** | **84/100** | 82 | +2 |
| **Brand Authority** | **12/100** | 13 | −1 (the LinkedIn score is now based on verified data; the brand did not actually decline) |
| Crawler Access | 100/100 | 100 | 0 |
| llms.txt | 85/100 | 85 | 0 (pricing fixed; new hardware staleness) |
| **AI Visibility (composite)** | **67/100 (Good)** | 66 | +1 |

Composite = 84×0.35 + 12×0.30 + 100×0.25 + 85×0.10 = 29.4 + 3.6 + 25.0 + 8.5 = **66.5**

### Fixed since 10-21 (verified live today)
- **Prices now agree across the site.** These pages now say Solo free / Starter $29 / Professional $99 / Enterprise $179:
  - the homepage cards and `SoftwareApplication.offers` (0/29/99/179)
  - `/pricing`
  - `/vietnamese-nail-salon-software`
  - the compare pages
  - the comparison blog post
  - llms.txt

  A grep of every sitemap page for `$22`, `$49` and Certxa "Elite" found nothing. The only "Elite" left is Tilavon's competitor tier, which is correct.
- **`/pricing` now renders on the server.** The plan cards, the prices and a real FAQ are in the HTML and in the `FAQPage` JSON-LD. The FAQ answers say, for example, "Starter is $29.00 a month… Paying yearly costs ten months instead of twelve. The Solo plan… is free." The "Loading pricing plans…" placeholder is gone.
- **The comparison tables on `/compare/certxa-vs-*` now contain text.** Cells read "Yes" or "No" instead of bare SVG icons.
- **llms.txt points the salon directory at `salons.certxa.com`.**
- **The deposit claim on `/dallas-tx-booking` has been corrected.** It now reads "…a deposit or payment when a client books online is in development."

---

## Citability Assessment

**Page Citability Score: 84/100** (the average of the top 5 blocks across the site)

### Top citation-ready passages (>70)

| # | Passage (URL) | Ans 25 | Self 20 | Struct 20 | Stats 20 | Uniq 15 | Score |
|---|---|---|---|---|---|---|---|
| 1 | "Short answer: the POS systems built for Vietnamese-owned nail salons in the United States in 2026 are Certxa, Go POS…, Tilavon, Zota POS, SICUS and POS Nail Store…" plus the 7-column table and the "Updated October 15, 2026… linked our sources" line, at https://certxa.com/blog/best-pos-systems-vietnamese-nail-salons | 95 | 90 | 95 | 80 | 85 | **89** |
| 2 | Autumn FAQ: "20 calls a month on Solo, 50 on Starter and 100 on Professional. Additional calls are $0.50 each… one-time $15 activation fee", at https://certxa.com/autumn | 95 | 85 | 70 | 95 | 70 | **84** (but it conflicts with the /pricing cards; see Issue M1) |
| 3 | Competitor prices: "Go POS $50, $99 or $149 a month (5, 20 or unlimited staff), $25 a month per extra device, $200 setup…", in the same blog post | 80 | 85 | 65 | 100 | 85 | **83** |
| 4 | `/pricing` FAQ "How much does Certxa cost?": "Starter is $29.00 a month (Up to 3 staff…); Professional is $99.00 a month (Up to 12 staff…); Enterprise is $179.00 a month… Paying yearly costs ten months instead of twelve. The Solo plan… is free.", at https://certxa.com/pricing | 95 | 90 | 65 | 95 | 55 | **82** (new; scored 12 on 10-21) |
| 5 | FAQ "How much does Certxa cost for a nail salon?": "free for one technician… Starter at $29 a month for up to 3 staff, Professional at $99… Enterprise at $179… no setup fee", at https://certxa.com/vietnamese-nail-salon-software | 95 | 90 | 60 | 90 | 60 | **82** |

Other strong blocks (70–80):
- The `/pricing` card-processing FAQ: "2.7% + $0.05… 2.9% + $0.30… plus a $0.60 Certxa fee per card transaction" (80).
- The `/products` FAQ "How much is the card reader? The Stripe M2 Card Reader is $69. It works with every Certxa plan, and there is no minimum processing volume." (76).
- The Vietnamese-page FAQ on what happens when the internet goes down (73).
- The founding sentence on `/about` (72).
- The blog post's "Watch-outs: Certxa is a newer company…" (72).

### Citation-unlikely or weak areas

- **The `/pricing` "Compare plans" table (about 25).**
  - Boolean rows such as "Commission Tracking | | |" are still bare `<svg>` icons with no text: `Commission Tracking</td><td class="px-4 py-3.5 text-center"><span class="flex justify-center"><svg …`.
  - A model reads these as empty cells, which is the same defect that was fixed on the compare pages.
- **https://certxa.com/blog/vietnamese-nail-salon-pos-system (about 30).**
  - A 10-minute "Complete Guide" with no numbers, no prices and no Certxa specifics. The closing section is "Certxa combines salon management, POS, appointments…" and nothing more.
  - It targets the same query as the much stronger comparison post.
- **The homepage hero and feature cards (45–60).**
  - The H2s are slogans: "Run your salon. Effortlessly.", "Fair turns, automatically."
  - The phone mock-up still leaks noise text into the HTML: "0 Missed calls", "Fabulous Nails +1 (619) 604-6886", "mute # keypad 🔊 speaker".
  - The homepage has no FAQ.
- **The `/compare/certxa-vs-*` pages (prose about 60, tables about 55).**
  - The tables are now readable, but they have no "as of" date or sources line.
  - Only Vagaro and Fresha quote Certxa prices. Square and GlossGenius carry no $ figures at all, and no page gives the competitor's price.
- **`/careers` (97 words).** Thin, as expected for its purpose.

---

## AI Crawler Access

**Crawler Access Score: 100/100** (unchanged)

robots.txt is unchanged in substance. The AI group names GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-Web, Claude-SearchBot, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, GoogleOther, Applebot-Extended, Amazonbot, CCBot, Cohere-ai and FacebookBot. That group has `Allow: /`, with only the app and API paths disallowed.

| Crawler | Status | Notes |
|---|---|---|
| GPTBot / OAI-SearchBot / ChatGPT-User | Allowed | Named group |
| ClaudeBot / Claude-User / Claude-SearchBot / anthropic-ai / Claude-Web | Allowed | Named group |
| PerplexityBot / Perplexity-User | Allowed | Named group |
| Google-Extended / GoogleOther | Allowed | Named group; Googlebot falls under `*` `Allow: /` |
| Applebot-Extended, Amazonbot, CCBot, Cohere-ai, FacebookBot | Allowed | Named group |
| Bytespider | Restricted | Only `/salons/` and `/listings/` are disallowed (which now do nothing; see below) |

- All 39 sitemap URLs returned 200 to GPTBot.
- `Sitemap: https://certxa.com/sitemap.xml` points to a sitemap index (lastmod 2026-10-24) covering `sitemap-pages.xml` (22 URLs) and `blog/sitemap.xml` (17 URLs).
- No `Crawl-delay` is set.
- **Content Signals:** `Content-Signal: ai-train=yes, search=yes, ai-retrieval=yes`, in both the `*` group and the AI group. This permits training, search indexing and retrieval for AI answers.
- **Still open (LOW, carried over):**
  - The scraper `Disallow: /salons/` and `/listings/` groups have no effect, because `https://certxa.com/salons` now returns 301 to `https://salons.certxa.com/salons`. Move them to `salons.certxa.com/robots.txt`.
  - The comment "~50k salon pages" is out of date.

---

## llms.txt Status

**Status:** Present.
- `/llms.txt`: 6,277 bytes, identical to `artifacts/booking/public/llms.txt`.
- `/llms-full.txt`: 209,565 bytes live, 38 pages.

**Score:** 85/100. The format is valid: an H1, a blockquote, H2 sections, and links written as `- [Title](url): desc`.

**What's right:** the prices ("Starter $29/month (up to 3 staff), Professional $99/month (up to 12 staff) and Enterprise $179/month, each with a 60-day free trial"), the salons subdomain, the support hours and the founding facts.

**Problems:**
1. **The live llms-full.txt is older than the /products redesign (HIGH).**
   - The deployed file `artifacts/api-server/dist/public/llms-full.txt` (mtime 16:21:51) is what https://certxa.com/llms-full.txt serves (`Last-Modified: Sat, 24 Oct 2026 16:21:51 GMT`).
   - The regenerated source `artifacts/booking/public/llms-full.txt` (mtime 16:23:00) was never deployed.
   - The live file still says:
     - "Certxa offers two main devices — Certxa Station… and the Wireless Card Reader…"
     - "Accessories include … cash drawer, and barcode scanner."
     - "### Barcode Scanner … $89 Order"
     - a "## Choose your setup." section
   - None of this is on the live /products page any more.
2. **The llms.txt Hardware line still lists the Certxa Kiosk (MEDIUM).** It reads "[Hardware](https://certxa.com/products): Certxa Station, Certxa Kiosk, wireless card reader and accessories, with prices." The Kiosk is no longer shown on /products to general visitors, and the line omits the $799 / $69 / $99 / $199 / $99 prices it promises.
3. **Autumn allowances conflict with the /pricing cards (MEDIUM).** llms.txt says "Solo (20 a month), Starter (50) and Professional (100)", but the /pricing cards say Professional "AI Receptionist (100 calls)", Enterprise "AI Receptionist (200 calls)", and Starter lists no AI receptionist at all. See M1.
4. **Still open from 10-21 (LOW):**
   - `/careers` and `/sms-terms` are still missing from llms-full.txt, which also includes `/launchsite`, a page that is not in the sitemap.
   - Only 1 of the 16 blog posts is linked in llms.txt; there is no `## Blog` section.
   - The "Instructions for LLMs" text still describes "The salon directory (`/salons/...`)" as a relative path on certxa.com.

---

## Brand Mention Presence

**Brand Authority Score: 12/100**

| Platform | Status | Points | Evidence |
|---|---|---|---|
| Wikipedia | Absent | 0/30 | The API returned `"totalhits":0` (suggestion "cernua"). `https://en.wikipedia.org/wiki/Certxa` returns 404. Wikidata `wbsearchentities` returns `"search":[]`. |
| Reddit | Not found (unverified) | 0/20 | `reddit.com/search.json?q=certxa` returned 403. WebSearch found no thread. |
| YouTube | Absent | 0/15 | `youtube.com/@certxa` and `@Certxa` both return 404. WebSearch found no video. |
| LinkedIn | Minimal (**verified today**) | 3/10 | https://www.linkedin.com/company/certxa returned 200: "Certxa \| **4 followers** on LinkedIn. Powerful Software. Simple Experience. \| Certxa is a technology company focused on creating simple, modern solutions that help businesses work smarter…"; Industry Software Development; 2-10 employees; Phoenix, AZ; **"Founded 2025"**. |
| Industry sources | Minimal | 9/25 | **Product Hunt** (WebFetch): 1 upvote, 0 reviews ("No reviews yet"), 1 follower, tagline "all in one salon software". **Capterra**: listings in 6 regions; a search snippet reports a single 5.0 review and filing under an "account-based marketing" category. **G2**: "has limited features". Capterra, G2, BBB and Trustpilot all returned 403, so their counts are **unverified**. No third-party 2026 roundup found by this tool mentions Certxa (Zenoti, Gitnux, iTechGuides, Edinburgh Reporter, Guideflow, Booksy). |
| X / Facebook / Instagram | Present (owner-confirmed) | not scored | x.com returned 200, but the content is JS-gated; Facebook returned 400 and Instagram 429. Activity was **not verified**. |

**New entity conflicts found today:**
- **Founding year.** LinkedIn says "Founded 2025". The site's `Organization.foundingDate` is `2026-02-01`, and llms.txt says "Founded February 2026". AI models merge these sources, so one of them must change.
- **LinkedIn description.** It describes a generic "technology company", with no mention of salons, nail-salon POS, booking or Autumn. The entity therefore does not reinforce the category.
- **Third-party pricing (unverified, but consistent across two search snippets).** Capterra and G2 summaries say "Pricing starts at $9 flat rate per month… no free version". The site says Solo is free and Starter is $29. If an AI tool answers from the review sites, it will quote the wrong price.

The site's own schema is unchanged and in good shape: `Organization.sameAs` lists X, Facebook, Instagram, BBB, LinkedIn, G2, Capterra and Product Hunt, and the founder Person `@id #founder-tom-tham` is still in place.

---

## Issues by severity

### HIGH

**H1. The live llms-full.txt describes hardware the site no longer sells.**
- URL: https://certxa.com/llms-full.txt (lines 625–675).
- Evidence: "### Barcode Scanner … $89 Order" and "Certxa offers two main devices — Certxa Station… and the Wireless Card Reader". The live https://certxa.com/products shows neither.
- Cause: the regenerated `artifacts/booking/public/llms-full.txt` (16:23) was never copied to `artifacts/api-server/dist/public/` (16:21).
- **Fix:** deploy the booking public files again (rsync without `--delete`, per the usual deploy). Then confirm with `curl -s https://certxa.com/llms-full.txt | grep -c Barcode`, which should return 0. Make `gen-llms-full.py` part of the deploy step so the generated file can never be older than the deploy.

**H2. Review sites quote a different price and lack reviews (owner action).**
- URLs: https://www.capterra.com/p/10182349/Certxa-Booking-Software/ and https://www.g2.com/products/certxa-booking-software.
- Evidence (search snippets; the pages themselves returned 403): "Pricing starts at $9 flat rate per month… no free version"; "5.0/5 from 1 user"; Capterra files the product under account-based marketing.
- **Fix:** in both vendor dashboards:
  - Set the pricing to Free (Solo) / $29 / $99 / $179 and mark "free version: yes".
  - Ask Capterra to move the product to Salon / Nail Salon / Spa software.
  - Collect 10 or more reviews from active salons.

**H3. Brand authority is still 12/100, the biggest gap in the score (owner action).**
- Evidence: no Wikipedia or Wikidata entity; YouTube `@certxa` returns 404; Product Hunt shows 1 upvote; LinkedIn has 4 followers.
- **Fix:**
  - Create a Wikidata item: instance of software company, inception February 2026, HQ Phoenix, official website https://certxa.com, plus the sameAs IDs.
  - Claim YouTube `@certxa` and post 3–5 demos (turns, the Vietnamese POS, Autumn answering a call), then add the channel to `sameAs`.
  - Pitch the comparison post's data to NailPro, Nails Magazine and Vietnamese-American salon communities.
  - Hunt a proper Product Hunt launch day.

### MEDIUM

**M1. Autumn call allowances contradict each other on /pricing.**
- URL: https://certxa.com/pricing.
- Evidence:
  - The plan cards say Professional "AI Receptionist (100 calls)" and Enterprise "AI Receptionist (200 calls)"; the Starter card has no AI receptionist line.
  - The same page's FAQ says "Autumn answers calls on every plan: 20 calls a month are included on Solo, 50 on Starter and 100 on Professional."
  - `/autumn`, `/changelog` and llms.txt also say 20/50/100 and never mention Enterprise.
- **Fix:** confirm the real allowances with the owner. Add "AI Receptionist (50 calls)" to the Starter card if that is true. State Enterprise's allowance in the FAQ, on /autumn and in llms.txt (for example "…and 200 on Enterprise").

**M2. The Certxa Kiosk is still described as a product, but it is hidden from /products.**
- Evidence:
  - The `/products` `<title>` reads "Salon POS Hardware — Certxa | Terminals, **Kiosks** & Card Readers".
  - The meta description reads "…all-in-one terminals, **self check-in kiosks**, wireless card readers, receipt printers…".
  - https://certxa.com/compare/certxa-vs-square says "Certxa uses its own hardware ecosystem — the Certxa Station, **Certxa Kiosk**, and Stripe-powered card readers."
  - llms.txt's Hardware line also lists the Certxa Kiosk.
- **Fix:** remove "Certxa Kiosk" and "kiosks" from those four places, or state where the Kiosk is available (for example "Certxa Kiosk, offered to nail salons on request").

**M3. The `/products` schema covers 2 of 5 products and gives one the wrong brand.**
- URL: https://certxa.com/products.
- Evidence: the `ItemList` contains only "Certxa Station" ($799) and "Stripe M2 Card Reader" ($69). The latter has `"brand":{"name":"Certxa"}`, although it is a Stripe device. The tablet ($99), the IP thermal printer ($199) and the cash drawer ($99) are missing. No offer has `availability`.
- **Fix:**
  - Add all five products.
  - Set the M2's brand to Stripe and the tablet's brand to T-Mobile REVVL.
  - Add `availability` to each offer (for example `PreOrder` or `InStock`, matching whether the hardware shop is actually open).

**M4. The `/pricing` "Compare plans" boolean cells are icon-only.**
- Evidence: `Commission Tracking</td><td …><span class="flex justify-center"><svg …` — the cell has no text.
- **Fix:** apply the same fix as the compare pages: use "Yes" or "—" text, or a visually-hidden `<span>`.

**M5. LinkedIn conflicts with the site's entity facts (owner action).**
- URL: https://www.linkedin.com/company/certxa.
- Evidence: "Founded 2025" versus the site's `foundingDate` "2026-02-01"; the LinkedIn description is a generic "technology company"; 4 followers.
- **Fix:** set Founded to 2026. Rewrite the tagline and About text to say "Certxa is salon and nail-salon software: online booking, POS, turn rotation, payroll and the Autumn AI receptionist. Founded in Phoenix, AZ in 2026 by Thanh Lam." Then post regularly.

### LOW

- **L1. The "Complete Guide" blog post has no facts to cite.** URL: https://certxa.com/blog/vietnamese-nail-salon-pos-system. **Fix:** add Certxa specifics (six turn methods, the languages, prices, offline behaviour), a 2–3 sentence answer at the top and an FAQ, or merge it into the comparison post.
- **L2. The compare pages have no date or sources.** URLs: https://certxa.com/compare/certxa-vs-glossgenius and https://certxa.com/compare/certxa-vs-square, which also quote no prices. **Fix:** add an "Updated October 2026 · sources" line and a price row for each side.
- **L3. The homepage has no FAQ or numbers, and the phone mock-up leaks noise text.** URL: https://certxa.com/. **Fix:** add a 4–5 question FAQ, and mark the mock-up `aria-hidden` (or render it as an image).
- **L4. llms coverage gaps (carried over).** **Fix:** add `/careers` and `/sms-terms` to llms-full.txt and add a `## Blog` section listing all 16 posts to llms.txt.
- **L5. robots.txt has dead scraper rules.** **Fix:** move the `/salons/` rules to `salons.certxa.com`.
- **L6. City pages are live but in neither the sitemap nor llms.txt (carried over).** `/dallas-tx-booking`, `/phoenix-az-nail-salons`, `/houston-tx-nail-salons` and `/tempe-az-nail-salons` still return 200. Their deposit text has been fixed.
- **L7. `/roadmap` and `/products` disagree on whether hardware can be ordered.** `/roadmap` lists "Order hardware online" as *In progress*, while `/products` shows "Buy now" and "Order" buttons. **Fix:** make them agree once the shop is open (the project memory says it is closed until UPS is set up).

---

## Regressions since 10-21

All of these come from today's `/products` redesign; nothing that was fixed on 10-21 has come back.
1. The live llms-full.txt now contradicts `/products` (barcode scanner $89, "two main devices") because the regenerated file was not deployed. (H1)
2. The Kiosk is hidden on `/products`, but the `/products` title and meta, `/compare/certxa-vs-square` and llms.txt still advertise it. (M2)
3. The new `/products` `ItemList` lists only 2 of the 5 items and labels the Stripe M2 as brand "Certxa". (M3)
4. The Autumn allowance conflict on `/pricing` (M1) was not visible to crawlers on 10-21, because the cards loaded client-side. Now that `/pricing` renders on the server, crawlers read the conflict.

No regressions were found in robots.txt, Content Signals, the prices or the compare tables.

## Not verified

- Capterra, G2, BBB, Trustpilot, Facebook, Instagram and Reddit blocked automated requests (403/400/429). Their figures come from search snippets or are unknown.
- WebSearch has a thin index. "Not found" means not found by this tool, not that the brand is absent.
- The rendered (JS) state of the /products "Order" buttons and whether the hardware shop is open were not checked.
- `salons.certxa.com` was out of scope.

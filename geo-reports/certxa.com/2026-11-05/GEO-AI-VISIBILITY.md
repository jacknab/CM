# AI Visibility Analysis: certxa.com

**Date:** 2026-11-05 · **Target:** https://certxa.com · **Brand:** Certxa (AI receptionist: Autumn)

**Method:**
- Used the 2026-11-05 crawl: 46 URLs, 41 sitemap URLs, robots.txt, llms.txt, llms-full.txt.
- Fetched live only what the crawl lacked: the MCP endpoint, legacy paths, profile pages, and 18 third-party roundup pages (checked for the word "certxa").
- Compared the live llms files with `artifacts/booking/public/`.
- Ran discovery searches through WebSearch, which has a thin index. Not being found there is marked "unverified", never "absent".

This was an audit only. No site files were changed.

**Baseline:** 2026-10-24: Citability 84, Brand 12, Crawlers 100, llms.txt 85.

## AI Visibility Score: 68/100 (Good)

| Component | 11-05 | 10-24 | Change | Weight | Weighted |
|---|---|---|---|---|---|
| **AI Citability** | **87** | 84 | +3 | 35% | 30.45 |
| **Brand Authority** | **13** | 12 | +1 (a correction, not growth) | 30% | 3.90 |
| Crawler Access | 100 | 100 | 0 | 25% | 25.00 |
| llms.txt | 83 | 85 | −2 | 10% | 8.30 |
| **Composite** | **67.65, rounded to 68** | 66.5 (reported as 67) | +1.15 | | |

**The main point:** the site is easy for AI systems to read and quote, but outside sources barely know the company. Certxa was named in none of the 4 discovery queries. The content is ready. Entity and third-party presence are what hold the score back.

## What changed since 10-24

### Fixed (re-verified today)

| 10-24 item | Status | Evidence |
|---|---|---|
| H1: llms-full.txt described hardware no longer sold | **Fixed** | `Barcode` and "two main devices" each return 0 matches. The /products section matches the live page ($499 / $99 / $89 / $59 / $69). |
| M1: Autumn allowances conflicted on /pricing | **Fixed** | Cards, compare table, FAQ, /autumn, /changelog and llms.txt all say Starter 20 / Professional 50 / Enterprise 100, then $0.50. The only "every plan" wording left is a 10-12 changelog entry, and it is annotated with the 10-24 change. |
| M2: Certxa Kiosk advertised but hidden | **Fixed** | "Certxa Kiosk" appears on 0 pages and in neither llms file. The /products title is now "POS Terminal, Card Reader & Accessories". |
| M3: /products schema covered 2 of 5 products | **Mostly fixed** | The ItemList has all 5 products, and M2 has brand Stripe and the tablet T-Mobile. `availability` is still missing on every offer. |
| L4 (part): /careers missing | **Part fixed** | /careers is now listed in llms.txt, but not in llms-full.txt. |

### New since 10-24
- **/nail-salon-turn-system (published 10-30)** is now the most citable page on the site, with `Article` + `FAQPage` schema and a Vietnamese twin at /vi/chia-tua-tiem-nail. It is linked from about 20 crawled pages, mainly through the footer.
- **The MCP server at /mcp is live.** `tools/list` returns 6 tools, and `search_salons` returned a real salon (Luxury Nails, Tucson).

### New problems
- llms.txt gives the wrong hardware price (F1).
- The search index used for this audit still serves old Certxa prices from retired pages (F2).
- @certxa on X does not look like Certxa's account (F3).

### Correction to the 10-24 report
That report listed iTechGuides as a roundup that does not mention Certxa. It does: "SalonOS by Certxa" is #9 of 25 (F4). Its facts were checked on 20 Sep and the page is dated 2026-10-07, so the listing was already there on 10-24. The +1 on Brand reflects that correction, not new growth.

---

## Citability Assessment

**Page Citability Score: 87/100** (average of the top 5 blocks across the site, same method as 10-24)

| # | Passage (URL) | Ans 25 | Self 20 | Struct 20 | Stats 20 | Uniq 15 | Score |
|---|---|---|---|---|---|---|---|
| 1 | Turn system definition plus the six-methods table: "A turn system is how a nail salon decides which technician gets the next walk-in client…" https://certxa.com/nail-salon-turn-system | 95 | 90 | 95 | 85 | 85 | **90** (new) |
| 2 | "Short answer: the POS systems built for Vietnamese-owned nail salons…" plus the 7-column table and sources. https://certxa.com/blog/best-pos-systems-vietnamese-nail-salons | 95 | 90 | 95 | 80 | 85 | **89** |
| 3 | Worked example: "$20 ½ ½ ⅔ … $65 1 2½ 2.17 … $90 1 3 3" at $30 a turn. https://certxa.com/nail-salon-turn-system | 85 | 85 | 95 | 100 | 80 | **89** (new) |
| 4 | Autumn FAQ: "20 calls a month on Starter, 50 on Professional and 100 on Enterprise… $0.50… one-time $15 activation fee." https://certxa.com/autumn | 95 | 90 | 70 | 95 | 70 | **85** (was 84; the conflict is gone) |
| 5 | Competitor prices: "Go POS $50, $99 or $149 a month…" in the comparison post | 80 | 85 | 65 | 100 | 85 | **83** |

(90 + 89 + 89 + 85 + 83) / 5 = **87**

Other blocks above the 70 line: the /pricing FAQ "How much does Certxa cost?" (82), the /vietnamese-nail-salon-software cost FAQ (82), and the turn-page rule blocks on requested technicians and ties (about 78).

**This score measures how quotable the content is, not how often it is cited.** No discovery query surfaced these passages.

### Weak areas (all re-verified today)

| Area | Score | Evidence |
|---|---|---|
| /pricing "Compare plans" table | about 25 | Still open (M4). `Commission Tracking</td><td…><span…><svg…`. The text reads "Commission Tracking Contractor Management booking…" with no values, so a model sees empty cells. |
| https://certxa.com/blog/vietnamese-nail-salon-pos-system | about 30 | Still open (L1). 1,707 words, 0 dollar figures, dated October 4. |
| Homepage | 45–60 | Still open (L3). No FAQ, and the mock-up still leaks "0 Missed calls", "Fabulous Nails +1 (619) 604-6886", "mute # keypad 🔊 speaker". |
| /compare/certxa-vs-glossgenius and -square | about 55–60 | Still open (L2). 0 dollar figures, no date, no sources. |
| /careers | not scored | 111 words. Thin, as expected. |

---

## AI Crawler Access

**Crawler Access Score: 100/100** (no deductions)

| Crawler | robots.txt | Live test |
|---|---|---|
| GPTBot, OAI-SearchBot, ChatGPT-User | Allowed (named group) | 200 / 200 |
| ClaudeBot, Claude-User | Allowed (named group) | 200 / 200 |
| Claude-Web, anthropic-ai, Claude-SearchBot | Allowed (named group) | not tested |
| PerplexityBot | Allowed (named group) | 200 / 200 |
| Perplexity-User, GoogleOther | Allowed (named group) | not tested |
| Google-Extended, Applebot-Extended, Amazonbot, CCBot, Cohere-ai, FacebookBot | Allowed (named group) | 200 / 200 |
| Bytespider | Restricted (only `/salons/`, `/listings/`) | 200 / 200 |

"Live test" means /pricing and the comparison post, requested with that crawler's name in the user agent. It tests whether the server blocks by user agent. It does not prove which rules a real bot applied.

- All 41 sitemap URLs returned 200.
- `Sitemap:` is present and there is no `Crawl-delay`.
- Sitemap index lastmod is 2026-11-05. The child sitemaps list 24 pages and 17 blog URLs. Both turn guides are included.

**Content Signals:** present in both the `*` and AI groups: `ai-train=yes, search=yes, ai-retrieval=yes`. Training, search indexing and retrieval for AI answers are all permitted. `ai-personalization` is not declared.

**Still open (Low):** the scraper `Disallow: /salons/` rules do nothing, because /salons 301s to salons.certxa.com. The "~50k salon pages" comment is out of date (the directory shows 32,683).

**Crawlable, but with nothing to read (Low):** /help, /help/booking, /pos, /waitlist, /how-it-works, /pro-plus and /openapi.json return 200 with an empty app shell (2,916 bytes, title "Certxa - Online Booking Service", canonical to the homepage). The shell's description also mentions inventory tracking, which is not how the site positions itself elsewhere. `/openapi.json` serves HTML, not JSON. A crawler gets no help content, and the blog nav's "Help Centre" link is `href="#"`.

---

## llms.txt Status

**Status:** Present and valid (H1, blockquote, H2 sections, markdown links). `/llms.txt` is 7,398 bytes and `/llms-full.txt` is 209,294 bytes. Both match `artifacts/booking/public/`.

**Score: 83/100** (90 for a valid index plus full-content file, minus 7 for the issues below)

| # | Issue | Severity | Points |
|---|---|---|---|
| 1 | Wrong Station price, $799 against a live $499 (F1) | High | −3 |
| 2 | llms-full.txt is out of date: generated 10-24, llms.txt last changed 10-30. No section exists for /nail-salon-turn-system, /vi/chia-tua-tiem-nail, /mcp, /careers or /sms-terms, yet it says "Complete page text for every link above" | Medium | −2 |
| 3 | MCP line lists 4 tools; the live server has 6. `check_walk_in_wait` and `join_walk_in_line` are missing | Medium | −1 |
| 4 | Directory text is out of date: names 3 sources (Texas, California, Florida) while the live page shows 8 states, and still calls the path `/salons/...` | Low | −1 |

Still open, not deducted again:
- No `## Blog` section; 1 of 16 posts is linked.
- /launchsite is listed but not in the sitemap.
- `/mcp` has no human-readable page: GET returns 405, and no crawled page links to it.

Also missing: there is no `/.well-known/mcp.json` or `/.well-known/mcp/server-card.json` (both 404). These are optional, but they would help agents find the server.

---

## Brand Mention Presence

**Brand Authority Score: 13/100**

| Platform | Status | Points | Evidence |
|---|---|---|---|
| Wikipedia | Absent (verified) | 0/30 | API `"totalhits":0`, suggestion "cernua". /wiki/Certxa returns 404. Wikidata `wbsearchentities` returns `"search":[]`. |
| Reddit | Unverified | 0/20 | `search.json` returned 403. Not evidence of absence. Scored 0 as on 10-24. |
| YouTube | Handle not found | 0/15 | `@certxa` and `@Certxa` both returned 404. Other channel names were not tested. |
| LinkedIn | Minimal (not re-verified) | 3/10 | Returned 403 to curl and WebFetch today. The 10-24 data is carried over: 4 followers, "Founded 2025", generic description. |
| Industry sources | Minimal | 10/25 | See below. |

**Industry sources:**
- **iTechGuides:** ranks "SalonOS by Certxa" #9 of 25, 8.6/10, in "Best Nail Salon Software in 2026". Its data is wrong (F4). The site sells paid placements, so treat the rank as low authority.
- **Capterra:** a search snippet shows 5.0/5 from 1 user and a starting price of US$9.00 flat rate a month. The direct fetch returned 403, so the numbers are from snippets.
- **G2:** a snippet says "hasn't been reviewed yet" and that the profile "has limited features". The direct fetch returned 403.
- **Product Hunt:** WebFetch shows 1 point, "No reviews yet", 1 follower, tagline "all in one salon software", "Launched 23d ago".
- **BBB:** the sameAs URL returned 403 (bot check). Unverified.
- **Facebook:** the page is live as "Certxa LLC | Phoenix AZ". Activity not verified.
- **Instagram:** no data returned. Unverified.

### Discovery queries (WebSearch, 2026-11-05)

| Query | Named in the results | Certxa? |
|---|---|---|
| best nail salon booking software 2026 | Fresha, Booksy, GlossGenius, Boulevard, Zenoti, Acuity, Bookify, Booqinq, DaySmart, Velora; own-brand lists from Anolla, Calendall, Zoca | Not named in the answer. The iTechGuides list that contains it was in the results. |
| nail salon POS | Clover, Zenoti, Moneris, SumUp, Epos Now, Pospal, Shopify POS, Wellyx; domains SpotOn, Heartland, Qashier, ConnectPOS | Not named |
| nail salon turn software | Smart Turn Tracker, Tribe nail Turn Manager, Turns Tracker (Nails 123), Zenoti, Zota POS, Vagaro | Not named |
| AI receptionist nail salon | My AI Front Desk ($44.99/mo per its blog), ElevenLabs, SchedulingKit | Not named |
| best POS for Vietnamese nail salons 2026 turn tracking (extra) | Zota, Galaxy Access, Astra POS, Tilavon, Vagaro, GlossGenius, Square Appointments | Not named |

**Roundup check:** of the 18 ranking pages fetched, only iTechGuides contains "certxa". 16 have 0 mentions and 1 returned 410 (Wellyx). These pages are Zenoti (2), Galaxy Access, Hayven, Astra, Tilavon, Rich Payment Solutions, Minjcode, goFTX, Edinburgh Reporter, Zoca, Guideflow, Toolradar, My AI Front Desk, ElevenLabs and SchedulingKit. This is a sample from one search tool, not the whole web.

---

## Findings by severity

There are no Critical findings: nothing blocks crawling or breaks the site. F2 and F3 are the most urgent to act on.

### HIGH

**F1. llms.txt gives the wrong Certxa Station price.**
- URL: https://certxa.com/llms.txt line 14: "Certxa Station all-in-one POS terminal ($799)".
- Live: https://certxa.com/products shows "$499", and its Product schema has `"price":"499"`. llms-full.txt also says $499.
- $799 appears only in llms.txt. The accessory prices were dropped from the line, even though it still ends "with prices".
- **Fix:** change line 14 of `artifacts/booking/public/llms.txt` to $499 and add the printer ($89), drawer ($59) and tablet ($99), once the owner confirms $499 is correct.

**F2. Old Certxa prices are still being served from a search index.**
- WebSearch returned https://certxa.com/payments, /certxa-vs-gocheckin and /checkin-kiosk with old content:
  - Elite $49 ($39 annual)
  - a structured-data Elite price of $79
  - Professional $22 ($18 annual)
  - a "Certxa Free – $49/mo" range
  - Autumn "available on all Certxa plans — Solo, Professional, and Elite"
  - Autumn billing of $0.0041 per second
- One search answer concluded that $49 was "the most likely current Elite price" and called the correct $29/$99/$179 compare page "outdated".
- The live site is fine: all three URLs 301 correctly, and `$22`, `$49`, `$79` as Certxa prices appear on no crawled page.
- Which AI products use this index is unknown. The risk is that an AI answer quotes retired prices.
- **Fix:** resubmit these URLs through Bing Webmaster Tools and Google Search Console. `marketing-site.ts` already pings IndexNow per build, so confirm that the legacy URLs are included.

**F3. @certxa on X does not look like Certxa.**
- URL: https://x.com/certxa. Page metadata: name "체르타 (@certxa)", "0 followers · 2 following. 대한민국 송파구. Joined Mar 2022." That is a Korean location, and it predates the February 2026 founding.
- The handle is in `Organization.sameAs` on every page, so the site tells AI systems this account is Certxa.
- The brief lists it as official, so **the owner should confirm**. If it isn't the company's account, remove it from `sameAs` and the brief, and get a real handle.

**F4. Third parties carry wrong facts about Certxa.**
- iTechGuides (https://www.itechguides.com/products/salonos-by-certxa/): old name "SalonOS", "Free plan No", "Paid from $7/mo", "Facts checked 20 Sep 2026". No Autumn mention on the review page. Its "Best for" line calls it a low-cost marketing and booking option.
- Capterra (snippet): US$9.00 a month, no free version shown.
- The site says Solo is free and team plans start at $29.
- **Fix:** ask iTechGuides for a correction (name, Solo free, $29, Autumn, turns). Update Capterra and G2 pricing in their vendor dashboards. These need owner access.

**F5. Brand authority remains the biggest gap (owner action).**
- Evidence: the 5 discovery queries and the roundup check above; Wikidata has no item; YouTube handle returns 404; Product Hunt shows 1 point.
- **Fix:** create a Wikidata item, launch a YouTube channel with 3–5 demos, collect 10+ Capterra/G2 reviews, and pitch the turn guide and POS comparison to nail trade press and to the roundup authors above.

### MEDIUM

**M1. No general English nail-salon page exists.**
- https://certxa.com/nail-salon-software 301s to /vietnamese-nail-salon-software, and /nail-salon-pos returns 404. The homepage title says "Beauty Businesses" and lists seven business types.
- The general queries above have no matching page, while llms.txt says "Built specifically for nail studios".
- **Fix:** add a general nail salon software/POS page, or broaden the Vietnamese page's targeting, then pick one positioning.

**M2. The llms-full.txt gap and MCP tool list** (llms.txt issues 2 and 3). **Fix:** update the MCP line, then re-run `scripts/gen-llms-full.py`. Check its page selection, since /careers is linked in llms.txt but not in the output, and GET on /mcp returns 405.

**M3. /mcp has no discoverable page.** It has 0 inbound links from the crawled pages, a 405 on GET and no `.well-known` file. Only llms.txt mentions it. **Fix:** add a short public page explaining it, linked from the footer.

**M4. /pricing compare cells are icon-only** (carried over, re-verified). **Fix:** use "Yes" and "—" text, as on the compare pages.

**M5. /certxa-vs-gocheckin now redirects to /pricing.** The direct competitor comparison is gone, and /compare has no GoCheckin page. The URL's old content is still in the index (F2). **Fix:** publish /compare/certxa-vs-gocheckin with current facts, or redirect to the comparison post, which covers it.

**M6. LinkedIn entity conflict: not re-verified.** The profile returned 403 today. On 10-24 it said "Founded 2025" against the site's `foundingDate` 2026-02-01. **Fix:** the owner should check it.

### LOW

- **L1.** /blog/vietnamese-nail-salon-pos-system has no figures. It still overlaps the stronger comparison post.
- **L2.** Compare pages have no date or sources, and the Square and GlossGenius pages quote no prices.
- **L3.** Homepage has no FAQ, and the mock-up leaks noise text.
- **L4.** `availability` is missing on /products offers.
- **L5.** /changelog's latest entry is 10-24, though /about says "We ship updates every week". The MCP server and turn calculator (10-30) aren't there.
- **L6.** /roadmap lists "Order hardware online" as In progress, while /products shows "Buy now" and "Order".
- **L7.** The Certxa Pro app and Plus plan have no public page: /solo and /certxa-pro return 404, /pro 301s to the homepage, and /pro-plus is an empty shell.
- **L8.** robots.txt dead rules, the empty-shell URLs and the `href="#"` Help Centre link (see Crawler Access).
- **L9.** The 4 city pages return 200, but they are still in neither the sitemap nor llms.txt.

---

## Priority actions

1. **[HIGH]** Fix the $799 line in llms.txt (F1), the MCP tools and the directory text, then regenerate llms-full.txt.
2. **[HIGH]** Owner confirms the X account (F3).
3. **[HIGH]** Request recrawls of the retired URLs (F2).
4. **[HIGH]** Correct iTechGuides, Capterra and G2 facts (F4).
5. **[HIGH]** Start the entity work: Wikidata, YouTube, reviews, press (F5).
6. **[MEDIUM]** Add a general nail-salon page, a /mcp page and a GoCheckin comparison; fix the /pricing cells.

## Not verified

- **Blocked:** Capterra, G2, BBB, LinkedIn, Reddit and Crunchbase returned 403. Instagram returned no usable data, and Facebook only returned metadata to a link-preview user agent.
- **Search limits:** WebSearch has a thin index. Results show what this tool saw, not what ChatGPT, Perplexity, Gemini or Claude answer. No live AI product was queried.
- **Citations:** no citation counts are reported, because none were measured.
- **Hardware:** $499 is what the live page shows. Whether it is the intended price was not confirmed, and neither was whether the hardware shop is open.
- **Out of scope:** `salons.certxa.com`.

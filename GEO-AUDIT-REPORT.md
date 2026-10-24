# GEO Audit — certxa.com

**Date:** 2026-10-24 · **Previous:** 2026-10-21 (58/100) · **Business type:** SaaS (nail-salon POS, booking and the Autumn AI receptionist) · **Pages analyzed:** 39 sitemap URLs + 11 extra paths

## GEO Score: 60/100 (Fair)

| Category | Weight | Score | 10-21 | Weighted |
|---|---|---|---|---|
| AI Citability | 25% | 84/100 | 82 | 21.0 |
| Brand Authority | 20% | 12/100 | 13 | 2.4 |
| Content E-E-A-T | 20% | 50/100 | 47 | 10.0 |
| Technical GEO | 15% | 84/100 | 80 | 12.6 |
| Schema & Structured Data | 10% | 83/100 | 80 | 8.3 |
| Platform Optimization | 10% | 57/100 | 53 | 5.7 |
| **Overall** | | | | **60.0** |

Platforms: Bing Copilot 70, ChatGPT 66, Google AI Overviews 62, Perplexity 52, Gemini 36. Crawler access 100/100 (every AI and search crawler gets 200). llms.txt 85/100.

The 10-21 fixes held: one price list everywhere (Solo free, Starter $29, Professional $99, Enterprise $179), /pricing server-rendered, compare tables have text, share image works. Brand authority (12) is still the single biggest drag and still needs the owner. Most new problems came from today's /products redesign and were fixed the same day.

Detail reports: `GEO-AI-VISIBILITY.md`, `GEO-PLATFORM-OPTIMIZATION.md`, `GEO-TECHNICAL-AUDIT.md`, `GEO-CONTENT-ANALYSIS.md`, `GEO-SCHEMA-REPORT.md` in this folder.

## Fixed on 2026-10-24 (live)

| # | Fix | Where |
|---|---|---|
| 1 | Placeholder "V3" favicon on every marketing page → the real Certxa icon (.ico + .svg) | `artifacts/marketing/public/favicon.*`, `index.html` |
| 2 | Largest image hidden until JavaScript ran (opacity 0) on /products hero, home hero and About founder photo → visible in the server HTML | `pages/products.tsx`, `pages/index.tsx`, `pages/about.tsx` |
| 3 | /products schema listed 2 of 5 products and gave the Stripe M2 the brand "Certxa" → all 5 products (Station, REVVL tablet = T-Mobile, printer, cash drawer, M2 = Stripe) with the admin's prices; FAQPage added for the visible Hardware FAQ | `pages/products.tsx` |
| 4 | Hidden Certxa Kiosk still advertised → removed from /products title/description, llms.txt, compare-vs-Square answer; "same-day ready" removed (shop is closed) | `products.tsx`, `llms.txt`, `comparisons.json` |
| 5 | /products FAQ said all hardware takes cards, and offline means "no lost sales" → the M2 takes cards; offline covers tickets, check-ins and cash sales, card payments need internet; Station spec no longer says "USB hub for printer" (printer is IP) | `content/pages/products.json` |
| 6 | Blog said "unlimited staff on the Professional plan" → up to 12 on Professional, unlimited on Enterprise | `blog_posts` id 12 |
| 7 | /autumn "enable Autumn from day one" (trial) → adds that trial calls are $0.50 each | `content/pages/autumn.json` |
| 8 | Compare-page breadcrumbs pointed at /compare/ (404) → Home › Certxa vs X | `pages/compare/*.tsx` |
| 9 | llms-full.txt / llms.txt regenerated for the new hardware line-up and deployed | `artifacts/booking/public/` → `api-server/dist/public/` |

## Needs the owner

1. **Autumn calls on the /pricing plan cards.** The admin Plans page gives Professional "100 calls", Enterprise "200 calls" and Starter none; billing (`autumnCallBilling.ts`) and every other page say Solo 20 / Starter 50 / Professional 100, and Enterprise gets 0 in code. Decide Enterprise's number, then make the admin plan lines and billing match (Starter should show 50).
2. **Brand authority (12/100).** No Wikipedia/Wikidata entry, no YouTube channel, LinkedIn 4 followers ("Founded 2025" vs the site's Feb 2026), Product Hunt 1 upvote, Capterra/G2 snippets reportedly still say "$9 flat rate" (unverified — pages return 403 to the checker). Update Capterra/G2 pricing, collect reviews, fix the LinkedIn founding year.
3. **/terms** says no payment information is needed during the trial; /pricing and /data-transfer say a card is required. No hardware warranty/returns section. Legal text — owner/lawyer.
4. **/data-transfer stats** ("0 data lost", "24h average", "end-to-end encryption… GDPR") are unsupported and /terms disclaims data loss.
5. **"Most popular"** is Professional on the home page but Starter on /pricing — pick one.
6. **/nail-salon-software 301s to the Vietnamese-salon page** (since 10-15) — is the broad keyword meant to land there?
7. **Founder's LinkedIn URL** for the Person schema `sameAs`, and confirm all 16 blog posts are by Thanh Lam.

## Still open (technical / content, not fixed today)

- One 1.28 MB (364 KB gzip) JavaScript bundle on every marketing page; home hero is a 2560 px JPEG with no smaller/WebP version.
- Compare pages cite no sources and carry no date; Vagaro page says Vagaro has a "60-day free trial" (unsourced, likely wrong) and contradicts itself on waitlists.
- /pricing "Compare plans" table cells are icons with no text; Solo (free) has no card.
- `#software` has two different shapes (marketing vs PHP header); /pricing has no Offer schema; WebSite SearchAction `/blog?q=` doesn't filter.
- Duplicate security headers from nginx (`certxa.conf:77-80`); sitemap index lastmod always today.
- No author bios / first-hand experience in founder-bylined posts; changelog stops at 10-12 (six turn methods not listed).

## Quick wins for this week

1. Settle the Enterprise Autumn number and fix the plan cards (owner + 5 minutes of admin edits).
2. Update Capterra and G2 pricing to the current plans and ask five customers for reviews.
3. Add an "Updated <date>" line and a short sources list to the four /compare pages.
4. Add a changelog entry for the six turn-rotation methods and today's hardware changes.
5. Give the founder Person schema a LinkedIn `sameAs` once the URL is known.

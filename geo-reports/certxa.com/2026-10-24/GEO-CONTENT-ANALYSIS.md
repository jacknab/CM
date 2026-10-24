# Content Quality Analysis — certxa.com

**Audit date:** 2026-10-24 · **Scope:** the 22 pages in `sitemap-pages.xml` (incl. `/`, `/about`, `/pricing`, `/features`, `/products`, `/autumn`, `/booking`, `/vietnamese-nail-salon-software` (`/nail-salon-software` redirects there), `/vi/phan-mem-tiem-nail`, 4 × `/compare/*`, `/data-transfer`, `/contact`, `/changelog`, `/roadmap`, `/careers`, legal pages), `/blog` and all 16 posts, `llms.txt`, `llms-full.txt`. Live HTML fetched with curl. `/vi/` and `/vi` return 404; the only Vietnamese page is `/vi/phan-mem-tiem-nail`.
**Previous:** 2026-10-21 = 47/100

## Content Score: 50/100 — Fair (+3 since 10-21)

### What changed since 10-21
- **Fixed — prices are now the same everywhere.** Solo free / Starter $29 / Professional $99 / Enterprise $179 appear on `/`, `/pricing` (now server-rendered, 1,020 words, FAQ answers the questions directly), `/compare/*`, both nail pages, the comparison post, schema `AggregateOffer` and `llms.txt`. Yearly prices ($290/$990/$1,790 = "ten months instead of twelve") also match.
- **Fixed — card rate is the same everywhere:** 2.7% + 5¢ in person / 2.9% + 30¢ online + $0.60 Certxa fee (`/pricing`, `/products`, two blog posts).
- **Fixed — Autumn billing:** `/features` now says "Calls included with your plan, then $0.50 per call". `/autumn`, `/pricing` FAQ, changelog and `llms.txt` all say 20 (Solo) / 50 (Starter) / 100 (Professional), then $0.50.
- **Fixed — review gating copy:** `/` and `/features` now say "Every client gets the same link".
- **Fixed — hardware:** `/products` shows Station $799, REVVL TAB 2 customer screen $99, IP printer $199, cash drawer $99 and Stripe M2 $69 as an accessory. The barcode scanner is gone. Every Buy/Order button goes to `/contact`. Nothing says the reader is free. `llms-full.txt` was regenerated at 19:44 GMT and now matches. (The 16:21 copy still listed "Barcode Scanner … $89" and a separate "Wireless Card Reader … Buy now" block.)
- **Fixed:** the homepage says "Find us on" (not "As seen on").
- **Still open:** made-up-looking stats on `/data-transfer`, the AI-disguise brag on `/autumn`, the unsourced and undated compare pages, no first-hand experience in posts, and the "Success Story" filter on `/blog` with no posts behind it.
- **New this audit:** Autumn allowance on the `/pricing` plan cards (Starter shows none, Enterprise shows 200), `/terms` says no card is needed for a trial, a blog post says "unlimited staff on the Professional plan", the `/products` offline FAQ over-promises, "Most popular" is on a different plan on `/` and `/pricing`, and the changelog and roadmap describe the turn system differently from the nail pages.

---

## E-E-A-T Assessment

**Overall E-E-A-T Score: 44/100**

| Dimension | Score | Key Evidence |
|---|---|---|
| Experience | 8/25 | The founder story and nail-salon operating detail (Tech ID, half turns, check/cash payroll split) are real. But there are no case studies, no customer quotes or testimonials, no real screenshots in posts and no Certxa data. |
| Expertise | 12/25 | "Thanh Lam" byline and `Person` schema on all 16 posts, with a schema image. Deep, correct turn and payroll vocabulary. But there's no bio box, no author page, no credentials (which salon, how many years) and only a letter avatar "T" on `/about`. |
| Authoritativeness | 8/25 | One post (`best-pos-systems-vietnamese-nail-salons`) has a Sources section and 10 external links. The other 15 posts, 4 compare pages and every landing page cite nothing. No press. sameAs covers BBB, G2, Capterra and LinkedIn, but these are listings, not recognition. |
| Trustworthiness | 16/25 | One set of prices, one card rate, consistent support hours ("Every day, 10am – 9pm ET" on `/contact`, schema `Mo-Su 10:00-21:00`, nail pages), deposits marked "not yet" everywhere, a public dated changelog and roadmap, hardware buttons going to contact. Still wrong: the contradictions listed below, unproven stats on `/data-transfer`, and no hardware warranty/returns terms for a $799 device. |

#### Experience
- **Present:** `/about`: "founded in Phoenix, Arizona in 2026 by Thanh Lam, a Vietnamese nail salon owner…". `/vietnamese-nail-salon-software`: "Technicians sign in with their Tech ID… pay part by check and part in cash… print their own daily or weekly pay slip". The comparison post lists Certxa's own "Watch-outs: Certxa is a newer company with fewer salons using it".
- **Missing:** no post tells a first-hand story ("at my salon…"), and none has a before/after number or a customer quote. The only numbers are hypothetical, e.g. `/blog/hidden-revenue-nail-salon-leakage`: "we lose 11% of Friday afternoon bookings to no-shows, worth about $340 a week". Every post is credited to a salon owner, but none uses that experience.

#### Expertise
- Byline plus Person schema on every post, but the byline doesn't link anywhere and there's no bio.
- The Person entity is `@id …#founder-tom-tham`, `name "Thanh Lam"`, `alternateName "Tom Tham"`. Two names for one founder can confuse entity matching. Decide whether "Tom Tham" should be public.
- `/about` meta description says "built by a **former** nail salon owner", while the body says "a Vietnamese nail salon owner" (present tense). Pick one.

#### Authoritativeness
- The compare pages make flat claims about competitors with no date and no source. Examples: `/compare/certxa-vs-square` "Square for Beauty — No AI receptionist or automated phone answering"; `/compare/certxa-vs-glossgenius` "GlossGenius … Limited to solo providers. No built-in team payroll or commission tracking"; `/compare/certxa-vs-fresha` "Team payroll and commissions | Yes | No". Competitors change fast, so these need "checked on" dates and sources (the 10-15 comparison post shows how).
- `/blog/how-to-choose-nail-salon-software` says "See the honest, numbers-based breakdowns on our GlossGenius, Vagaro, and Fresha comparison pages — including where those platforms do things well". The compare pages don't say where competitors do well.

#### Trustworthiness
- Good: HTTPS, email, phone, hours, privacy (updated 2026-09-12), terms, SMS terms, Google data policy, "Certxa LLC" named in privacy, changelog, roadmap.
- `/contact` shows no street address (it's only in schema: "2325 E Camelback Rd, Ste 400, Phoenix").
- `/terms` was last updated 2026-06-27, before Solo became free (10-09). It doesn't cover hardware sales (warranty, returns, shipping) or the Autumn per-call balance.

---

## Factual contradictions (owner-confirmed facts are the reference)

| # | URL | Quote | Correct fact / problem |
|---|---|---|---|
| C1 | https://certxa.com/pricing (plan cards + compare table) | Starter card has no AI Receptionist line; Professional "AI Receptionist (100 calls)"; Enterprise "AI Receptionist (200 calls)"; table row "AI Receptionist \| (blank) \| 100 calls \| 200 calls" | Owner: 20/50/100 included. The same page's FAQ says "20 calls a month are included on Solo, 50 on Starter and 100 on Professional". The Starter card should show 50 calls. Enterprise "200" appears nowhere else (`/autumn` says "Your plan covers 20, 50 or 100 calls"). The owner needs to confirm Enterprise's allowance, then one number should be used on every page. |
| C2 | https://certxa.com/blog/how-to-choose-nail-salon-software | "flat monthly pricing with no per-seat markup up to unlimited staff on the Professional plan and above" | Professional is "Up to 12 staff" (`/pricing`, `/`, nail pages). Only Enterprise has no staff cap. |
| C3 | https://certxa.com/terms (Trial Period) | "No payment information is required during the trial unless otherwise stated." | `/pricing`: "A credit card is required to start a paid plan, but you are not charged until the trial ends"; `/data-transfer`: "Credit card required · No charge until trial ends". The terms also don't state the 60-day length or the one 14-day extension (max 74 days). |
| C4 | https://certxa.com/products (FAQ) | "Does the hardware work if the internet goes down? Yes. … No lost sales, no interruptions." | `/vietnamese-nail-salon-software`: "Card payments need the internet." `/roadmap` lists "Card payments during an outage" as **In progress** and "Tablets that keep working together offline … In testing". Only tickets, check-ins and cash sales work offline today. |
| C5 | https://certxa.com/products (FAQ) | "All Certxa hardware supports chip (EMV), contactless tap-to-pay (NFC), and major digital wallets … Swipe and keyed-in transactions are also supported." | Only the Stripe M2 takes cards. The Station, tablet, printer and drawer do not. Keyed-in entry isn't stated anywhere else. Change it to "The Stripe M2 reader accepts…". |
| C6 | https://certxa.com/products (Station spec vs printer) | Station: "USB hub for printer and cash drawer"; printer: "IP Thermal Receipt Printer … network (IP) connectivity" | The only printer sold is IP/network. Say "USB for the cash drawer; network printer". |
| C7 | https://certxa.com/products (JSON-LD) | `"name":"Stripe M2 Card Reader" … "brand":{"@type":"Brand","name":"Certxa"}` | The M2 is a Stripe product. Use brand "Stripe". |
| C8 | https://certxa.com/products (meta description) + https://certxa.com/llms.txt | "self check-in kiosks, wireless card readers … Plug-and-play, same-day ready"; llms.txt: "Certxa Station, Certxa Kiosk, wireless card reader and accessories, with prices." | Certxa Kiosk is shown only to nail salons, so crawlers and AI never see it or its price on `/products`. Either remove "Kiosk" from the meta description and llms.txt, or say "Certxa Kiosk (nail salons — ask us)". "Same-day ready" sits awkwardly next to a closed shop (Buy → contact). |
| C9 | https://certxa.com/compare/certxa-vs-square | "Certxa uses its own hardware ecosystem — the Certxa Station, Certxa Kiosk, and Stripe-powered card readers." | Same Kiosk visibility issue as C8. Also "Certxa runs on touchscreen tablets and computers you may already have" (nail page), so "own ecosystem … Square hardware is not compatible" overstates what's required. |
| C10 | https://certxa.com/vietnamese-nail-salon-software (+ `/vi/phan-mem-tiem-nail`) | "No setup fee on any plan" / "Không có phí cài đặt ở bất kỳ gói nào" | Autumn has "a one-time $15 activation fee for your dedicated phone number" (`/autumn`, `/pricing`). Say "No setup fee (Autumn's phone number: one-time $15)". |
| C11 | https://certxa.com/autumn | "Start your free 60-day trial and enable Autumn from day one." | The same page says "Free trials don't include calls; a trial's calls are $0.50 each." The CTA should mention that calls during a trial are paid. |
| C12 | https://certxa.com/roadmap + https://certxa.com/changelog | Roadmap: "Turn rotation — Walk-ins are given to the next technician in line, by counted or dollar-based turns." Changelog 10-05: "Dollar-Based Turns: a second way to run the turn rotation" | `/vietnamese-nail-salon-software`, `/vi/…` and the comparison post say "Six turn methods" (correct: round robin, client count, counted, dollar-based, brackets, proportional, shipped 10-13). The changelog has no 10-13 entry and the roadmap text is out of date. |
| C13 | https://certxa.com/roadmap | Planned: "Kiosk check-in with no internet" vs Shipped: "Offline mode for the POS — Check-ins, tickets and cash sales keep working without internet" | Readers will think check-in works offline when kiosk check-in does not. Say "front-desk check-ins". |
| C14 | https://certxa.com/ vs https://certxa.com/pricing | Home: "Most popular" on **Professional**; `/pricing`: "Most popular" on **Starter** | Pick one plan. |
| C15 | https://certxa.com/pricing and https://certxa.com/ | Plan cards show only Starter/Professional/Enterprise; Solo appears only in text ("or Solo free for one professional") | Solo free is a confirmed plan. Give it a card. |
| C16 | https://certxa.com/compare/certxa-vs-vagaro | Body: "Vagaro — Basic waitlist functionality." Table: "Walk-in waitlist management \| Yes \| No". Table: "60-day free trial \| Yes \| Yes" | The page contradicts itself on the waitlist. The claim that Vagaro has a 60-day free trial is unsourced and probably wrong. Check Vagaro's current trial and cite it. |
| C17 | https://certxa.com/about | Meta: "built by a former nail salon owner"; body: "a Vietnamese nail salon owner" | The brief says "former" nail-salon owner. Use one wording. |
| C18 | https://certxa.com/data-transfer | "24h Average transfer time · 100% Free · 0 Data lost in transfers · 7+ Platforms supported"; "All transfers use end-to-end encryption … in compliance with GDPR" | `/terms` disclaims "Data loss caused by hardware failure, software bugs, or user error". An 8-month-old company has no basis for an "average" or "0 lost". There's no security page backing E2E or GDPR. |

Checked and consistent (no contradiction found): plan prices; yearly prices; 60-day trial (every mention says 60); deposits ("Not yet" on `/booking`, Planned on `/roadmap`, "on Certxa's roadmap and aren't available yet" in two posts); support hours; card rates; M2 $69 with no "free"/"included" claim anywhere; no barcode scanner anywhere (live pages and the regenerated `llms-full.txt`); hardware prices $799/$99/$199/$99/$69; Buy/Order → `/contact`, and `/roadmap` says "Order hardware online — In progress" (no page promises online checkout).

---

## Content Metrics

| Metric | Value | Assessment |
|---|---|---|
| Word count (body, approx.) | `/features` 1,660 · `/autumn` 1,600 · `/pricing` ~950 · `/vietnamese-nail-salon-software` 980 · `/vi/…` 1,120 · `/` 720 · compare pages 900–960 · `/products` 570 · `/about` 480 · `/careers` ~140. Posts: 13 Aug posts 780–1,040; Oct posts 1,500–1,840 | Standard. `/about` and `/products` are thin for trust-critical pages. |
| Readability (Flesch, approx.) | Landing pages 55–77 (`/pricing` 77, `/products` 70, `/autumn` 70, nail page 71, `/` 57). Aug posts **41–62** (hidden-revenue 41, 29–34 words/sentence in several). Oct posts 50–66 | Landing pages are good. Aug posts are too dense for ESL owners. Estimate is from a syllable heuristic over body paragraphs. |
| Avg paragraph length | Landing pages 20–37 words. Aug posts 47–74 (max 127 `reduce-no-shows`, 114 `google-business-profile`, 112 `how-to-price`). `/about` has one 161-word paragraph | Split anything over 100 words. |
| Headings | One H1 per page. The blog H1 renders with leading whitespace. `vietnamese-nail-salon-pos-system` has 19 headings in 1,790 words and an H1 in lower case | Mostly fine. |
| Internal links | Landing pages 25–40, posts 55–65, mostly nav/footer. Blog uses a different nav template ("Help Centre", "Launchit! Builder", "Payments & Billing") from the marketing site | Few in-body contextual links. Two nav systems. |
| External links / citations | 1 of 16 posts (10 links). 0 on every landing and compare page | Under-sourced. |
| Images | `/features` 13, `/` 9, `/products` 6, all with alt text. Posts: 1 cover each | No product screenshots in posts. |

## AI Content Assessment

**Assessment:** Likely human-edited AI (Aug posts and landing pages); likely AI with light editing (the two Oct-4 posts).

| Indicator | Found? | Evidence |
|---|---|---|
| Generic phrasing | Some | Oct-4 `vietnamese-nail-salon-pos-system`: "That is why choosing the right Vietnamese nail salon POS system can make a major difference." "Certxa gives busy nail salons the simple, fast tools they need". `salon-turn-system…` names Certxa in 27 sentences. |
| Lack of specifics | Yes (Oct-4 posts) | Long generic lists ("Manicures, Pedicures, Acrylic nails, Gel-X…") that could describe any vendor. |
| No original data | Yes | No Certxa-derived number in any post. |
| Bulk publication | Yes | 12 posts have `datePublished` 2026-08-25 at 02:32:05 or 02:34:17. |
| Hedging overload | No | Posts take positions. |
| No authorial voice | Partial | Consistent editorial voice, but not the voice of the named founder. |

## Topical Authority

**Assessment:** Moderate within one niche (nail salons / Vietnamese-owned salons). 16 posts plus EN and VI landing pages, 4 compare pages and the comparison post. Hub structure is partial: the nail landing page links to the comparison post, but most posts only link back to `/features`-type pages. The Oct-4 posts overlap heavily with `/vietnamese-nail-salon-software`.
**Gaps:** payroll/1099 for nail techs, the turn-method explainer (six methods are a differentiator, but there's no post on them), hardware setup guide, offline mode explainer, the Autumn Vietnamese-calls page, no VI blog posts, no customer stories.

## Content Freshness

- **Publication dates:** visible on all posts (Aug 25–26, Oct 4, Oct 15). `dateModified` 2026-10-15/22 on 5 posts.
- **Stale:** `/changelog` latest entry 2026-10-12. It misses the 10-13 turn methods, the 10-21 pricing change and the 10-24 hardware change. `/terms` dated 2026-06-27. Compare pages have no date. `/products` has no "prices as of" line.
- **Time sensitivity:** High (pricing, competitor facts, hardware).
- **Assessment:** Aging on pricing and hardware support content; blog is current.

---

## Issues by severity

### CRITICAL
1. **Autumn allowance differs on the same page** — https://certxa.com/pricing: Starter card lists no AI Receptionist and Enterprise lists "AI Receptionist (200 calls)", while the FAQ says "50 on Starter and 100 on Professional". **Fix:** in the `pricing_plans` data behind the cards, add "AI Receptionist (50 calls)" to Starter and confirm Enterprise with the owner. Mirror the number in `/autumn` ("20, 50 or 100") and the FAQ (add Enterprise).
2. **Offline-payments overpromise** — https://certxa.com/products: "No lost sales, no interruptions." **Fix:** "Tickets, check-ins and cash sales keep working offline and sync later. Card payments need the internet (offline card payments are in progress)."

### HIGH
3. **Wrong staff limit in a blog post** — https://certxa.com/blog/how-to-choose-nail-salon-software: "up to unlimited staff on the Professional plan and above". **Fix:** "Professional covers up to 12 staff; Enterprise has no staff limit."
4. **Terms vs pricing on trial card** — https://certxa.com/terms: "No payment information is required during the trial unless otherwise stated." **Fix:** "A card is required to start a paid-plan trial; you're not charged until it ends. Trials last 60 days, with one optional 14-day extension." Update "Last updated". Add a hardware sale/returns/warranty section.
5. **Unproven stats and security claims** — https://certxa.com/data-transfer: "0 Data lost in transfers", "24h Average transfer time", "end-to-end encryption … compliance with GDPR". **Fix:** remove the stat strip or replace it with process facts ("Most transfers finish within 24 hours"). Label the "Vagaro → Certxa … 76% complete" mock as "Example". Drop E2E/GDPR unless a security page backs them.
6. **Hardware FAQ accuracy** — https://certxa.com/products: "All Certxa hardware supports chip (EMV)…keyed-in"; "USB hub for printer"; schema brand "Certxa" for the Stripe M2. **Fix:** see C5–C7.
7. **Compare pages are unsourced, undated and partly contradictory** — https://certxa.com/compare/certxa-vs-vagaro "Basic waitlist functionality" vs "Walk-in waitlist management | Yes | No"; "60-day free trial | Yes | Yes" for Vagaro; https://certxa.com/compare/certxa-vs-glossgenius "Limited to solo providers". **Fix:** add "Checked 2026-10-xx", a Sources list and a "Where [competitor] is stronger" block, and re-verify each "No".
8. **No first-hand experience in founder-bylined posts** — every post is credited to "Thanh Lam", with no bio and no story. **Fix:** add an author box (salon, city, years), a photo and a LinkedIn link on `/about`, and one real anecdote or anonymized Certxa metric in 3–4 Aug posts.

### MEDIUM
9. **Turn-method story out of date** — https://certxa.com/roadmap "by counted or dollar-based turns"; https://certxa.com/changelog "a second way". **Fix:** add a 10-13 changelog entry ("Six turn methods…") and update the roadmap card. Also add changelog entries for 10-21 pricing and 10-24 hardware.
10. **"Most popular" differs** — `/` (Professional) vs `/pricing` (Starter). **Fix:** use one plan.
11. **Solo has no plan card** on `/pricing` or `/`. **Fix:** add a "Solo — Free" card.
12. **"No setup fee on any plan"** on both nail pages vs the $15 Autumn number fee. **Fix:** add "(Autumn number: one-time $15)".
13. **Kiosk mentioned where crawlers can't see it** — `/products` meta ("self check-in kiosks"), `llms.txt` ("Certxa Kiosk"), `/compare/certxa-vs-square`. **Fix:** make the text match what the page shows.
14. **AI disguise brag** — https://certxa.com/autumn: "Callers routinely can't tell she isn't your front-desk team" and "Many callers don't realise she isn't your front-desk team." **Fix:** remove. Keep "If a caller asks… Autumn will answer honestly."
15. **Absolutes** — `/` "0 Missed calls", "Autumn answers every call — in under 2 seconds"; `/features` "Every walk-in is captured, every slot is filled"; `/features` "Next-day payouts to your bank" (verify against the Stripe Connect payout schedule). **Fix:** soften or substantiate.
16. **Readability of the 13 Aug posts** (Flesch 41–62, up to 34 words/sentence). **Fix:** sentences under 20 words, paragraphs under 80 words.

### LOW
17. `/about` "former" vs current salon owner (C17). The `Person` alternateName "Tom Tham" vs "Thanh Lam".
18. `/blog` has a "Success Story" filter with no posts behind it. Remove it or publish a customer story.
19. The demo call card "Fabulous Nails +1 (619) 604-6886" on `/` is not labelled as an example.
20. `/vi/phan-mem-tiem-nail` has English nav and footer, and `/vi/` returns 404. Add a `/vi/` index or redirect it to `/vi/phan-mem-tiem-nail`.
21. Show the street address on `/contact`, not only in schema.

---

## Score calculation

| Component | Max | Score |
|---|---|---|
| Experience (8/25) | 15 | 4.8 |
| Expertise (12/25) | 15 | 7.2 |
| Authoritativeness (8/25) | 15 | 4.8 |
| Trustworthiness (16/25) | 15 | 9.6 |
| Content metrics | 15 | 10 |
| AI content assessment | 10 | 6 |
| Topical authority | 10 | 5 |
| Freshness | 5 | 3 |
| **Total** | 100 | **50** |

*Readability is estimated from body-paragraph samples with a syllable heuristic. Topical authority covers only the sitemap pages and posts. Competitor facts on compare pages were not re-verified against competitor sites in this audit.*

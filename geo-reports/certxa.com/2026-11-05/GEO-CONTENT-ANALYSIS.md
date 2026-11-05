# Content Quality Analysis — certxa.com

**Audit date:** 2026-11-05 · **Scope:** crawl of 2026-11-05: 24 sitemap pages, `/blog` and all 16 posts, `/nail-salon-turn-system`, `/vi/chia-tua-tiem-nail`, `/salons`, `/pro-plus`, `llms.txt`, `llms-full.txt`.
**Previous:** 2026-10-24 = 50/100 · 2026-10-21 = 47/100

## Content Score: 53/100 — Fair (+3 since 10-24)

The commercial facts are now almost entirely right, and the 10-24 pricing contradictions are gone. The score is held down by the same things as before: no sources on compare pages, no first-hand experience in posts, no author bios. A new problem has appeared: the site now trails the product. Offline card payments, the local hub and French on the POS shipped, but the public pages and changelog do not show them.

### What changed since 10-24 (baseline items)

| Baseline item | Status 11-05 | Evidence |
|---|---|---|
| Compare pages cite no sources, carry no date | **Open** | 0 external citations on all 4. No "checked on" date. Only "(2026)" in the title. |
| Vagaro "60-day free trial" unsourced | **Open, now likely wrong** | Table still says `60-day free trial | Yes | Yes`. Third-party sources report 30 days, no card (see F3). |
| `/terms` no payment info vs `/pricing` card required | **Fixed by correcting the other pages** | `/terms` was right all along under the "no card" rule. `/pricing` and `/data-transfer` now both say no card. `/terms` text is unchanged and no page is wrong on this point. |
| `/data-transfer` stats unsupported | **Open** | "24 h Average transfer time", "0 Data lost in transfers" unchanged. |
| "Most popular" conflict | **Fixed** | Professional on `/` and `/pricing`. |
| Starter/Enterprise Autumn calls on plan cards | **Fixed** | Cards and table show 20 / 50 / 100. FAQ, `/autumn`, `llms.txt` match. |
| No author bios | **Open** | 16 of 16 posts have a "Thanh Lam" byline and `Person` schema but no bio box, no author page, no linked byline. Two short bios on `/about`. New turn guides are credited to the Organization. |
| Changelog stopped at 10-12 | **Partly fixed, stopped again** | One entry, 10-24 (Autumn calls). Nothing since, and no entry for six turn methods, offline cards, the hub or French. |

**Other baseline items now fixed:**
- C2: `how-to-choose-nail-salon-software` now says "up to 12 staff on Professional, unlimited on Enterprise".
- C4: `/products` offline FAQ says "Mostly", no longer "No lost sales". It has since gone stale in the other direction, see F1.
- C5: FAQ now says "The Stripe M2 card reader takes chip…".
- C6: Station spec no longer says "USB hub for printer".
- C7: M2 schema brand is now Stripe.
- C8/C9: "Certxa Kiosk" is off `/products` meta, `llms.txt` and `/compare/certxa-vs-square`.
- C11: `/autumn` CTA now says "Calls during the trial are $0.50 each."

**Still open from the baseline:**
- C10: "No setup fee on any plan" vs the $15 Autumn fee.
- C12: roadmap turn text.
- C13: roadmap kiosk wording.
- C15: no Solo card.
- C16: Vagaro waitlist contradiction.
- C17: "former" salon owner.
- The Autumn AI-disguise brag, the absolutes ("0 Missed calls"), the "Success Story" filter, and no street address on `/contact`.

**New content since 10-24:** `/nail-salon-turn-system` (1,452 words) and `/vi/chia-tua-tiem-nail` (1,603 words), both 10-30. Six methods, worked examples and a calculator. They are the best content on the site and the main reason for the small rise. No new blog posts.

---

## Fact check against the source of truth

| Fact | Result |
|---|---|
| Solo free / $29 / $99 / $179 | Consistent everywhere |
| Autumn 20/50/100 then $0.50 | Consistent. Solo wording has two problems (F5) |
| No card for trial | Consistent: `/pricing`, `/data-transfer`, `/terms` |
| Trial 60 days | All mentions say 60. **74-day maximum, the 14-day extensions and no grace period appear on no page** (F6) |
| Most popular = Professional | Consistent |
| M2 takes cards | Correct on `/products` |
| Offline cards on M2 | **Stale on 4 pages + llms** (F1) |
| Certxa Kiosk hidden | Clean. The name appears on no crawled page or in `llms.txt` |
| Hardware shop closed | Consistent: every Buy/Order button goes to `/contact`, roadmap says in progress. The "Buy now" label is slightly misleading |
| Brand, founder, Feb 2026, Autumn | Consistent. Schema `foundingDate` 2026-02-01, `llms.txt` "February 2026". `/about` says only "2026" |

---

## Findings

### CRITICAL

**F1. Offline card payments are shown as unavailable.** Stripe offline mode on the M2 has been supported since 11-02 ($300 per payment, $1,500 waiting). These pages say otherwise:

| URL | Quote |
|---|---|
| https://certxa.com/products | "Does the hardware work if the internet goes down? Mostly. … Card payments need the internet." |
| https://certxa.com/vietnamese-nail-salon-software | "Tickets, check-ins and cash sales are saved on the tablet and sent to the server when the connection comes back. Card payments need the internet." |
| https://certxa.com/vi/phan-mem-tiem-nail | "Quẹt thẻ thì cần có internet." |
| https://certxa.com/roadmap | In progress: "Card payments during an outage — Take chip and contactless cards on the card reader with no internet" |
| `llms.txt` | "offline tickets and cash sales" |
| `llms-full.txt` | Repeats all of the above |

Partial wording that omits cards and should be reviewed at the same time:
- `/products`: "Offline mode for tickets, check-ins and cash sales"
- `/roadmap`: "Offline mode for the POS"
- `/blog/best-pos-systems-vietnamese-nail-salons`: "Tickets, check-ins and cash sales keep working when the internet drops."
- `/features`: "Offline mode — saves tickets when internet is down"

**Fix:** use honest wording with the limits, because the salon carries the decline risk: "The Stripe M2 can take chip and tap cards offline, up to $300 a payment and $1,500 waiting to send. If a card declines when the connection returns, the salon carries that loss." Project notes say this is **not yet device-tested**, swipe does not work offline, and the reader must have connected online at the location within 30 days. Confirm it works on a real M2 before publishing, otherwise this finding becomes an overpromise.

**F2. `llms.txt` gives the wrong Station price.** https://certxa.com/llms.txt: "Certxa Station all-in-one POS terminal ($799)". `/products` visible text, `Product` schema and `llms-full.txt` all say **$499**. AI systems read this file directly, so this is the wrong number they are most likely to quote. The source is `artifacts/booking/public/llms.txt`.

Note: `/products` printer ($89) and drawer ($59) also differ from the 10-24 prices ($199, $99). The prices come from the admin database, and `products.json` still holds the old defaults. The owner should confirm $499 / $89 / $59 are intended, not test values.

### HIGH

**F3. Vagaro facts contradict themselves and look wrong.** https://certxa.com/compare/certxa-vs-vagaro:
- "60-day free trial | Yes | Yes". Third-party sources report a 30-day Vagaro trial ([SoftwareAdvice](https://www.softwareadvice.com/salon/vagaro-profile), [subscribed.fyi](https://subscribed.fyi/vagaro//deals), [SchedulingKit](https://schedulingkit.com/reviews/vagaro-review)). Vagaro's own page was not checked, so confirm there first.
- "Basic waitlist functionality." vs table "Walk-in waitlist management | Yes | No".

**F4. New: "no marketplace" claims conflict with Certxa's own directory.** https://certxa.com/compare/certxa-vs-vagaro:
- "Does Certxa have a marketplace like Vagaro? No. Certxa does not operate a consumer marketplace. Your booking page is your own — clients book directly with your business, and you are never listed alongside competitors."
- "No marketplace competition | Yes | No"

But `llms.txt` has a "## Marketplace" section saying Certxa "runs … a consumer-facing directory of licensed nail salons". `https://certxa.com/salons` lists 32,683 salons with "Today's deals" and "Find and book independent salons and spas, powered by Certxa". `/mcp` lets AI assistants search and book across salons. An AI reading both sources sees a direct contradiction. **Fix:** say "No commission on bookings, and no marketplace fees", not "no marketplace". This needs an owner decision on positioning.

**F5. Autumn on Solo is stated wrongly or unclearly.**
- https://certxa.com/blog/best-pos-systems-vietnamese-nail-salons: "Autumn, the AI receptionist, is included in every plan." Wrong: Solo has none.
- Same post, table: "Included (20 to 100 calls a month)", beside "Free solo".
- https://certxa.com/autumn: "Autumn is available on every Certxa plan." The same page says "Autumn comes with Certxa's paid plans". Say what Solo gets.
- https://certxa.com/changelog (10-12): "now included in every plan: 20 calls a month on Solo…". The dated correction does not say Solo now has none.

**F6. Trial rules are not published.** No page gives the 74-day maximum, the 14-day extensions or the absence of a grace period. https://certxa.com/terms: "New accounts may be eligible for a free trial period as displayed at sign-up. … At the end of the trial, you will be prompted to select a paid plan to continue using the Service." In practice `/nail`, the calendar and the booking page stop at once, which the terms should state. `/terms` is still dated June 27, 2026, before Solo became free, and covers only "paid subscription plans". It has no hardware sales, returns or warranty terms.

**F7. `/data-transfer` stats still unsupported.** https://certxa.com/data-transfer: "24 h Average transfer time", "0 Data lost in transfers", "Transfer completed in 24 hours". `/terms` disclaims "Data loss caused by hardware failure, software bugs, or user error". The "Importing from Vagaro → Certxa … 76% complete" mock is unlabelled. The stat strip also says "7 + Platforms supported" while the page lists 9 sources.

**F8. Compare pages: no sources, no dates, no concessions.**
- https://certxa.com/compare/certxa-vs-glossgenius: "GlossGenius Limited to solo providers. No built-in team payroll or commission tracking for multi-staff businesses."
- All 4 pages: "Built-in POS with offline mode | Yes | Yes" states a competitor fact with no source.
- https://certxa.com/blog/how-to-choose-nail-salon-software promises "honest, numbers-based breakdowns … including where those platforms do things well". The pages have no such section.

The 10-15 comparison post, with its Sources section and "reported" labels, is the model to copy.

**F9. No first-hand experience, no author depth.** 16 posts are credited to a salon owner, yet the first-person pattern check found almost nothing (0 hits in 14 posts, 1–2 incidental hits in 2). There are no customer quotes, case studies or Certxa-derived numbers. The founder bio is 2 sentences with a letter avatar. Turn guides, the strongest expertise content, name only the Organization as author.

### MEDIUM

| # | URL | Quote | Issue / fix |
|---|---|---|---|
| F10 | https://certxa.com/changelog | Latest entry "October 24, 2026" | `/about` says "We ship updates every week." Nothing logged since 10-24 although offline cards, the hub, /barber, online check-in line and French shipped. Backfill. |
| F11 | https://certxa.com/roadmap | "Tablets that keep working together offline … In testing."; "Kiosk check-in with no internet" (Planned); "Turn rotation … by counted or dollar-based turns" | Project notes show the hub has run since 11-01 and covers `/kiosk`. Update statuses after confirming on a device. Turn text should say six methods. |
| F12 | https://certxa.com/vietnamese-nail-salon-software, `/vi/phan-mem-tiem-nail`, `/nail-salon-turn-system`, `/vi/chia-tua-tiem-nail`, `llms.txt`, best-POS post | "Each POS tablet switches between English, Vietnamese and Spanish" | `/nail` also has French since 10-29. Add it if it is ready for customers. |
| F13 | https://certxa.com/vietnamese-nail-salon-software + `/vi/phan-mem-tiem-nail` | "No setup fee on any plan" / "Không có phí cài đặt ở bất kỳ gói nào" | Autumn number has a one-time $15 fee. |
| F14 | https://certxa.com/booking, `llms.txt`, `/roadmap`, 2 posts | "Can I require a deposit or card on file? Not yet." | Project notes show Solo booking deposits exist (not yet real-card tested). Decide if the statement needs "(team plans)". Verify. |
| F15 | https://certxa.com/autumn | "Callers routinely can't tell she isn't your front-desk team"; "Many callers don't realise…" | AI-disguise brag. Conflicts with `/features` "without implying anyone is in the building". Remove. |
| F16 | https://certxa.com/ | "0 Missed calls"; "Autumn answers every call — in under 2 seconds" | Unproven absolutes. `/features`: "Every walk-in is captured, every slot is filled". "Next-day payouts to your bank" needs checking. |
| F17 | https://certxa.com/google-data-policy | "Last updated: November 5, 2026" | The date is generated at page view (`date('F j, Y')` in `php/google-data-policy/default.php`), so it always shows today. A false freshness signal on a legal page. Hard-code the real date. Sitemap says 10-21. |
| F18 | https://certxa.com/pricing, https://certxa.com/ | "Compare Starter, Professional and Enterprise above." | Solo still has no plan card or table column. |
| F19 | https://certxa.com/products | "It also takes swiped cards, and card numbers can be keyed in at the front desk." | The sentence order suggests the reader does this. Confirm keyed entry is available in the POS. Also "out of the box, same day" next to a contact-only shop. |
| F20 | 13 Aug posts | e.g. `hidden-revenue` Flesch ~41 | Dense for ESL owners, and no revision since 10-24. |

### LOW

- https://certxa.com/about: meta "built by a former nail salon owner" vs body "a Vietnamese nail salon owner"; schema `alternateName` "Tom Tham".
- `/compare/certxa-vs-square`: "Certxa uses its own hardware" vs nail page "tablets and computers you may already have", and the kiosk post "any iPad or Android tablet — no proprietary hardware".
- `/blog`: "Success Story" filter with no posts.
- `/` demo call card "Fabulous Nails +1 (619) 604-6886" is not labelled as an example.
- `/contact`: no street address on the page, only in schema.
- `/salons`: "Michigan 1" looks like a data artefact on a "by state" list; `llms.txt` names only TX, CA and FL as sources while the page shows 8 states.
- `/pro-plus`: 5 words of crawlable text, and not in the sitemap. Check whether it should be crawlable.
- Sitemap `lastmod` for `/terms` and `/privacy` is 10-12, while the visible dates are June 27 and Sept 12.

---

## E-E-A-T Assessment

**Overall E-E-A-T Score: 47/100** (+3)

| Dimension | Score | Change | Key Evidence |
|---|---|---|---|
| Experience | 9/25 | +1 | Turn guides show real operating knowledge ($30 turn, half-turn rules, disputes). No case study, customer quote or Certxa data. |
| Expertise | 13/25 | +1 | Six-method turn guide is deep and correct. Byline + Person schema on posts. No bio box or credentials. Guides are not credited to a person. |
| Authoritativeness | 8/25 | 0 | 1 of 16 posts has Sources, 0 of 4 compare pages do. No press. sameAs covers listings only. |
| Trustworthiness | 17/25 | +1 | Prices, calls, card and popular plan now agree. Lost ground on offline staleness, `llms.txt` $799, the auto-updating policy date and unsupported migration stats. |

## Content Metrics

| Metric | Value | Assessment |
|---|---|---|
| Word count | `/nail-salon-turn-system` 1,452 · `/vi/chia-tua-tiem-nail` 1,603 · `/features` 1,596 · `/autumn` 1,461 · `/pricing` 690 · `/products` 583 · `/about` 481 · compare 676–726 · posts 756–1,729 | Standard, with thin `/about` and `/products` |
| Readability (Flesch, approx.) | Turn guide 76 · `/products` 68 · nail page 64 · `/autumn` 62 · `/about` 58 · best-POS 55 · hidden-revenue 41 · google-business 48 · turn post 45 | Landing pages good, Aug posts dense |
| Avg paragraph | Landing 25–39 words; Aug posts 58–74; max 127 (`reduce-no-shows`); `/about` max 161 | Split anything over 100 |
| Headings | One H1 on every 200 page | Good |
| External citations | 1 of 16 posts; 0 on landing, compare and turn guide pages | Under-sourced |
| Images | No missing alt in crawl data. Posts have 1 cover each, no product screenshots | Fair |

## AI Content Assessment

**Assessment:** Likely human-edited AI for most posts and landing pages; likely AI with light editing for `vietnamese-nail-salon-pos-system`. This is a signal reading, not proof.

| Indicator | Found? | Evidence |
|---|---|---|
| Generic phrasing | Some | `vietnamese-nail-salon-pos-system`: "can make a major difference" |
| Lack of specifics | Partly | Generic lists in the Oct-4 posts. Turn guides are specific. |
| No original data | Yes | No Certxa-derived number anywhere |
| Bulk publication | Yes | 12 posts dated 2026-08-25 |
| Hedging overload | No | Posts take positions |
| No authorial voice | Partial | Consistent voice, not the named founder's |

## Topical Authority

**Assessment:** Moderate, rising in one niche. Turn system now has an EN/VI guide pair, a post, the nail landing page and a calculator: a near-complete cluster.

**Gaps:** payroll and 1099 for nail techs, offline-mode explainer (now a differentiator), hardware setup guide, customer stories, VI blog posts, and no public content for barber features (/barber, online check-in line) or Certxa Pro.

## Content Freshness

- **Posts:** dates visible. 8 of 16 have not been revised since August; newest `dateModified` 2026-10-30.
- **Stale:** `/terms` (June 27), `/changelog` (10-24), `/roadmap` (10-21 sitemap date), compare pages (undated), `/products` (no "prices as of" line).
- **Time sensitivity:** High.
- **Assessment:** Aging. The product is moving faster than the site.

---

## Priority Actions

1. **[CRITICAL]** Change the Station price in `llms.txt` after the owner confirms $499; regenerate `llms-full.txt` if needed.
2. **[CRITICAL]** Device-test M2 offline, then update F1's 4 pages and `llms.txt` with limits and decline risk.
3. **[HIGH]** Fix `/compare/certxa-vs-vagaro` trial and waitlist rows. Replace "no marketplace" wording (owner decision).
4. **[HIGH]** Fix "included in every plan" and say what Solo gets.
5. **[HIGH]** Update `/terms`: trial length, no grace, Solo, hardware.
6. **[HIGH]** Add dates, sources and "where they are stronger" blocks to all compare pages.
7. **[HIGH]** Remove or restate the `/data-transfer` stat strip.
8. **[HIGH]** Add an author box and real salon anecdotes (needs Thanh Lam's input); credit turn guides to a person.
9. **[MEDIUM]** Backfill the changelog, update the roadmap, fix the auto-updating date, remove the Autumn disguise lines.

---

## Score calculation

| Component | Max | 10-24 | 11-05 |
|---|---|---|---|
| Experience (9/25) | 15 | 4.8 | 5.4 |
| Expertise (13/25) | 15 | 7.2 | 7.8 |
| Authoritativeness (8/25) | 15 | 4.8 | 4.8 |
| Trustworthiness (17/25) | 15 | 9.6 | 10.2 |
| Content metrics | 15 | 10 | 10.5 |
| AI content assessment | 10 | 6 | 6 |
| Topical authority | 10 | 5 | 6 |
| Freshness | 5 | 3 | 2.5 |
| **Total** | 100 | **50** | **53** |

*Readability is estimated with a syllable heuristic over body paragraphs; `/` and `/pricing` were not re-measured because extraction was unreliable. Competitor facts were not re-verified on competitors' own sites; the Vagaro trial length comes from third-party pages. Statements about what shipped come from the brief and project notes, not from device tests.*

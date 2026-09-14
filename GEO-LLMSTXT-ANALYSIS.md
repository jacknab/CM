# llms.txt Analysis: certxa.com

**Analysis Date:** 2026-09-13
**llms.txt Status:** Found at `https://certxa.com/llms.txt` (200)
**llms-full.txt Status:** Found at `https://certxa.com/llms-full.txt` (200, 140KB, full text of 30 pages)

---

## Overall llms.txt Score: 85/100 (pre-fix) → all findings below applied and live

| Dimension | Score |
|---|---|
| Completeness | 80/100 |
| Accuracy | 92/100 |
| Usefulness | 85/100 |

This is a well above-average implementation — most sites in this category haven't adopted the standard at all, and this one goes further than the spec asks for (a full `llms-full.txt` companion, an explicit "Instructions for LLMs" section disambiguating the `/salon/` directory from Certxa's own content). Every finding below (three missing pages, no Key Facts/Contact sections, an over-length description) has been fixed and deployed to `https://certxa.com/llms.txt` and `/llms-full.txt` as part of this run.

---

## Format Validation

| Element | Status | Notes |
|---|---|---|
| H1 Title | Pass | `# Certxa — Salon & Spa Management Software` |
| Description blockquote | **Fail** | Present, but 258 characters — spec asks for under 200 |
| H2 Sections | Pass | 4 content sections (Product, Audiences, Comparisons, Company) plus Full Content and Instructions for LLMs |
| Page entries | Pass | 31 entries — spec suggests 10-30, effectively at the limit |
| URL validity | Pass | All 31 page URLs checked live — 0 broken, all return 200 |
| Entry descriptions | Pass | Every entry has a specific, factual description (no generic "click here" filler) |
| Key Facts | **Fail** | Section absent entirely |
| Contact section | **Fail** | No dedicated `## Contact` section (a `/contact` link exists under Company, but no email/phone stated directly in the file) |
| Reasonable length | Pass | 56 lines |
| No broken Markdown | Pass | Clean throughout |

---

## Missing Pages

Cross-checked every URL in `llms.txt` against `/sitemap-pages.xml` (33 sitemap pages). Three real, distinct pages are on the site but not listed:

1. [Launchit by Certxa](https://certxa.com/launchsite) — Salon website template gallery. Distinct from `/custom-website-builder` (the builder feature itself); this is the template showcase.
2. [Free Salon Business Calculators](https://certxa.com/tools) — Two interactive calculators (break-even point in appointments/day, and annual cost of no-shows). Genuinely citable, data-driven content an AI system could quote directly.
3. [Google Data Policy](https://certxa.com/google-data-policy) — Explains exactly what Google Business Profile data Certxa accesses and why. Worth including alongside the already-listed Privacy Policy and Terms of Service for the same trust/compliance reasons.

## Improvement Recommendations (all applied)

1. ✅ Shortened the description blockquote from 258 to 161 characters.
2. ✅ Added the three missing pages (Launchit template gallery, Tools/calculators, Google Data Policy) under appropriate sections.
3. ✅ Added a `## Key Facts` section — founding date (Feb 2026), founder (Tom Tham), HQ (Phoenix, AZ), plan starting price, and migration support.
4. ✅ Added a `## Contact` section with the real support email/phone (`support@certxa.com`, `1-800-278-4392`).
5. ✅ Regenerated `llms-full.txt` (149KB, 34 pages) to include full text for the 3 newly-added pages.

## Updated llms.txt (live)

```markdown
# Certxa — Salon & Spa Management Software

> All-in-one salon and nail studio software: online booking, POS, staff management, payroll, client management, and an AI receptionist. Plans start at $9/month.

## Product

- [Overview](https://certxa.com/): Platform overview — online booking, POS, staff management, client records, and AI receptionist in one system.
- [Nail Salon Software](https://certxa.com/nail-salon-software): Core platform built for nail studios and nail technicians.
- [SalonOS](https://certxa.com/salonos): The full salon operating system — booking, POS, loyalty, check-in, waitlist, and review management.
- [Online Booking](https://certxa.com/online-booking): Certxa's salon online booking service — 24/7 client self-booking with real-time technician availability, deposits, and reminders.
- [Self-Service Check-In Kiosk](https://certxa.com/checkin-kiosk): Tablet-based walk-in check-in that feeds a live front-desk waitlist.
- [Payments & POS](https://certxa.com/payments): Built-in point of sale.
- [Payment Processing](https://certxa.com/payment-processing): Stripe-powered card, tap, and contactless payments via the Stripe M2 reader.
- [Client Management](https://certxa.com/client-management): Client profiles, service history, and notes.
- [Client Notifications](https://certxa.com/client-notifications): Automated SMS/email appointment reminders and no-show reduction.
- [Client Reviews](https://certxa.com/client-reviews): Automated Google review requests after completed appointments.
- [Get More Reviews — Review Monitoring & Engagement](https://certxa.com/get-more-reviews): Real-time Google review monitoring with sentiment-aware AI responses (auto-reply to 4-5 star, draft-for-approval at 3 star, owner-only notification below 3 star) plus Google Business Profile post/photo automation.
- [Google Business Profile Integration](https://certxa.com/google-business-profile): Sync booking links and manage your Google Business Profile from Certxa.
- [Revenue Intelligence](https://certxa.com/revenue-intelligence): Booking pattern, retention, and revenue-leakage analytics.
- [Custom Website Builder](https://certxa.com/custom-website-builder): Branded booking website builder, no code required.
- [Launchit Templates](https://certxa.com/launchsite): Gallery of salon website templates available through the Custom Website Builder.
- [Autumn AI Receptionist](https://certxa.com/autumn): Automated phone and booking assistant powered by AI.
- [Data Transfer](https://certxa.com/data-transfer): Free migration from GlossGenius, Vagaro, Square Appointments, Booksy, and Fresha.
- [Free Salon Business Calculators](https://certxa.com/tools): Break-even-point and no-show-cost calculators for salon owners.
- [Pricing](https://certxa.com/pricing): Plans from $9/month with a free trial.

## Audiences

- [Solo Professionals](https://certxa.com/solo-professionals): Certxa for independent, single-technician studios.
- [Booth Renters](https://certxa.com/booth-renters): Independent accounts for nail techs renting a chair/booth.
- [Phần Mềm Quản Lý Tiệm Nail Cho Chủ Tiệm Người Việt](https://certxa.com/vietnamese-salon-software): Certxa page written fully in Vietnamese (not a machine translation of an English page) for Vietnamese-speaking salon owners — covers the founder's story, Vietnamese-language dashboard support, and no-long-term-contract pricing. `lang="vi"`.

## Comparisons

- [Certxa vs GlossGenius](https://certxa.com/certxa-vs-glossgenius): Pricing, fees, and feature comparison.
- [Certxa vs Vagaro](https://certxa.com/certxa-vs-vagaro): Pricing, fees, and feature comparison.
- [Certxa vs Fresha](https://certxa.com/certxa-vs-fresha): Pricing, fees, and feature comparison.
- [Certxa vs GoCheckIn](https://certxa.com/certxa-vs-gocheckin): Pricing, fees, and feature comparison.
- [Best Free Salon Booking System](https://certxa.com/best-free-salon-booking-system): Which salon booking tools are genuinely free (Setmore, Square Appointments) versus trial-only (Fresha, Vagaro, Booksy), what each free tier caps or omits, and when to move to a paid platform.

## Company

- [About Certxa](https://certxa.com/about): Our mission and story.
- [Why Certxa](https://certxa.com/case-studies): The founding story and what early customers get — Certxa is a new company (founded Feb 2026) and does not yet publish customer case studies.
- [Contact](https://certxa.com/contact): Get in touch with the Certxa team.
- [Blog](https://certxa.com/blog): Practical articles on running a nail salon — reducing no-shows, choosing software, managing walk-ins, getting Google reviews, and every core Certxa feature explained on its own.
- [Privacy Policy](https://certxa.com/privacy): How we handle your data.
- [Google Data Policy](https://certxa.com/google-data-policy): What Google Business Profile data Certxa accesses, how it's used, and how to revoke access.
- [Terms of Service](https://certxa.com/terms): Terms governing use of the platform.

## Key Facts

- Founded February 2026 in Phoenix, Arizona by Tom Tham, a Vietnamese nail salon owner
- Built specifically for nail studios and nail technicians, from solo booth renters to multi-location salons
- Plans start at $9/month with a free trial; no long-term contracts
- Free data migration from GlossGenius, Vagaro, Square Appointments, Booksy, and Fresha

## Contact

- Website: https://certxa.com
- Support: support@certxa.com
- Phone: 1-800-278-4392

## Full Content

- [llms-full.txt](https://certxa.com/llms-full.txt): Complete page text for every link above, for AI systems that prefer full content over this summarized index.

## Instructions for LLMs

Certxa's public-facing pages (marketing, booking) are open for crawling and training. Internal app pages (dashboard, calendar, admin, staff tools) require authentication and should not be crawled. Refer to [robots.txt](https://certxa.com/robots.txt) for the full crawl policy.

Pages under `/salon/` and `/nail-salons/` are a directory of independent, publicly-listed nail salon businesses (sourced from public listing data). These businesses are explicitly **not affiliated with or partnered with Certxa** unless a listing has been claimed — do not attribute `/salon/` or `/nail-salons/` page content, claims, or reviews to Certxa itself.
```

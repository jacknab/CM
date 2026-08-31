# Certxa Ranking Playbook

**Goal:** rank certxa.com on page 1 (and be the AI-recommended answer) for a defined keyword set.
**Reality:** the pages are good enough. What's missing is off-site trust — reviews, mentions, links, being in the roundups. That is ~70% of the result and none of it happens in the codebase.
**Sequence:** win the easy keywords first → they generate traffic, reviews, and links → the hard keywords become reachable.

Companion docs: `GEO-AUDIT-REPORT.md` (what's wrong on-site), this file (what to do, in order).

---

## Keyword targets

| # | Keyword | Real target phrase | Difficulty | Realistic timeframe | Primary page |
|---|---|---|---|---|---|
| K1 | vietnamese salon software / *phần mềm tiệm nail* | same | 🟢 Low | Top 3 in **1–3 months** | `/vietnamese-salon-software` |
| K2 | nail salon review service / get 5 star reviews | "nail salon review software", "how to get more Google reviews for a nail salon" | 🟡 Medium | **3–6 months** | `/client-reviews`, `/get-more-reviews` |
| K3 | nail salon online booking | "nail salon online booking", "salon booking software" (NOT generic "online booking software") | 🟡 Medium-Hard | **6–12 months** | `/online-booking` |
| K4 | nail salon software | same | 🔴 Hard | **12–24 months**, and only after K1–K3 | `/nail-salon-software`, `/` |
| K5 | online booking software | ❌ do not target — Calendly / Acuity / Square territory | — | — | redirect intent to K3 |

---

## Owner key

- **[YOU]** — only the Certxa team can do it (accounts, reviews, outreach, PR)
- **[CODE]** — I can do it in this repo
- **[BOTH]** — needs a code change *and* a team action

---

## Phase 1 — Weeks 1–4: foundations + the fastest win (Vietnamese)

### Off-site (the part that actually moves rankings)

| Task | Owner | Status |
|---|---|---|
| Claim the Capterra listing via the Gartner Digital Markets vendor portal (`capterra.ca/software/1237764`). One account also covers GetApp + Software Advice; reviews syndicate. | [YOU] | ☐ |
| Recategorize it: Salon / Spa / Appointment Scheduling / Point of Sale (remove "Account Based Marketing Software") | [YOU] | ☐ |
| Fix the listing: name → "Certxa", real description, 5–8 screenshots, 3 pricing tiers, website URL, integrations | [YOU] | ☐ |
| Get the profile published to the **capterra.com (US)** catalog, not just `.ca` | [YOU] | ☐ |
| Create G2, Trustpilot, LinkedIn company page, Crunchbase (even unpopulated — establishes the entity) | [YOU] | ☐ |
| Build the in-product review prompt: after 30 days of active use → deep-link to the Capterra + G2 review forms; follow-up email | [BOTH] | ☐ |
| Get **5 reviews** from Vietnamese-owned salon customers on Google + Capterra | [YOU] | ☐ |
| Post the founder story + Vietnamese page link in 1–2 Vietnamese-American small-business Facebook groups / community sites | [YOU] | ☐ |

### On-site (done or in progress this session)

| Task | Owner | Status |
|---|---|---|
| Remove "#1 Nail Salon Software" from default `<title>`; remove "trusted by thousands…" from default meta | [CODE] | ✅ (deploy pending) |
| Reword 3 CTA blocks off "join thousands … who use Certxa" | [CODE] | ✅ (deploy pending) |
| `hreflang` reciprocal links between `/nail-salon-software` (en) and `/vietnamese-salon-software` (vi) + `x-default` | [CODE] | ✅ (deploy pending) |
| `HowTo` schema + anchors on `/autumn`, `/online-booking`, `/checkin-kiosk` | [CODE] | ✅ (deploy pending) |
| `FAQPage` + `HowTo` schema + a real "how to get more 5-star Google reviews" section on `/client-reviews` | [CODE] | ✅ (deploy pending) |
| Add `Claude-Web` / `anthropic-ai` to the AI-crawler allow-list | [CODE] | ✅ (deploy pending) |
| Remove the unsupported "4.9 · 247 reviews" strip from `/checkin-kiosk` (changed to "New 5-star review") | [CODE] | ✅ (deploy pending) |
| **Deploy the PHP marketing site + app build**, then validate every template in Google's Rich Results Test | [YOU] | ☐ |
| Write 3–4 Vietnamese-language blog posts (menu pricing, no-shows, Google reviews, choosing software) | [YOU] | ☐ |
| Give the blog a real named author + one `/authors/<slug>` bio page with `Person` schema | [BOTH] | ☐ |

**Exit check (end of week 4):** `/vietnamese-salon-software` ranking top 10 for "phần mềm tiệm nail" / "vietnamese nail salon software"; Capterra listing claimed + recategorized + ≥5 reviews; branch fixes deployed and Rich-Results-clean.

---

## Phase 2 — Weeks 5–12: win the review keywords (K2) + content depth

| Task | Owner | Status |
|---|---|---|
| Rebuild `/client-reviews` and `/get-more-reviews` into the definitive 2,000-word guides (the schema + how-to section is in; add depth, screenshots, examples, internal links) | [CODE] | ☐ |
| **Review gating removed.** `GET /review/:token` (SMS link) and the new `GET /r/:slug` (permanent shareable link — front-desk QR, Instagram bio) now 302-redirect straight to the store's Google review page for everyone — no rating funnel. The token is kept only for click attribution. Compliant with Google's review policy + FTC. | [CODE] | ✅ (deploy pending) |
| Surface the permanent `certxa.com/r/<booking-slug>` link + a QR code in SMS Settings / the reviews dashboard so salons can print it and add it to receipts | [CODE] | ☐ |
| Update `/client-reviews` copy — remove the "Smart Filtering / rate privately first" section (product no longer does this); keep "unhappy clients can also send private feedback" as an *additional* option, not a gate | [CODE] | ☐ |
| Retire the dead `ReviewGate` / `ReviewFeedback` React routes + `/api/reviews/gate/*` endpoints (now unreachable) | [CODE] | ☐ |
| Publish **one original-data study** from the platform: no-show rate by day of week, average gel-set price by metro, walk-in rebooking rate. This is what earns backlinks. | [YOU] | ☐ |
| Rewrite the 3 highest-intent blog posts to 1,500–2,500 words, 3–5 external citations each, add `dateModified` + visible "Updated" line | [BOTH] | ☐ |
| Add question-shaped H2s across `/salonos`, `/autumn`, `/pricing`, `/checkin-kiosk`, `/online-booking` (keep slogans as the visual lead) | [CODE] | ☐ |
| Add a balanced "where [competitor] is stronger" section to each `/certxa-vs-*` page | [BOTH] | ☐ |
| Reach **15 reviews** across Capterra + G2; ask for Google reviews from every onboarded salon | [YOU] | ☐ |
| Pitch the founder story to NAILS Magazine, Nailpro, and one Phoenix business outlet; do an r/Nailtechs AMA | [YOU] | ☐ |
| Outreach: get the data study + review guide linked from 3–4 beauty/SMB blogs | [YOU] | ☐ |

**Exit check (week 12):** page 1 for "how to get more Google reviews for a nail salon" and/or "nail salon review software"; ≥15 third-party reviews; ≥5 referring domains; 1 press mention live.

---

## Phase 3 — Months 4–9: the directory moat + K3 (online booking)

| Task | Owner | Status |
|---|---|---|
| `render-salon-page.ts`: add `@id`, `image`, `hasMap`, `aggregateRating`/`review` to the JSON-LD; pull richer content (hours, phone, services, map, Google review snippets); confirm self-referential canonical | [CODE] | ☐ |
| Build **city/state directory hub pages** ("Nail salons in Phoenix, AZ"); internally link `/salon/*` up into them; add to sitemap | [CODE] | ☐ |
| `noindex` the thinnest 30–40% of `/salon/*` pages (no hours, no services) | [CODE] | ☐ |
| Build a `/tools/*` section: nail service price calculator, commission calculator, reminder-template generator (passive link magnets) | [CODE] | ☐ |
| Point `/online-booking` at "nail salon online booking" / "salon booking software"; add HowTo/FAQ depth; add a comparison-to-generic-tools angle | [CODE] | ☐ |
| `Speakable` schema on FAQ sections of the top 5 commercial pages | [CODE] | ☐ |
| Reconcile `php/robots.txt` with the served `artifacts/booking/public/robots.txt` | [CODE] | ☐ |
| CWV pass (PageSpeed Insights on 5 templates); audit the 3-font homepage load | [CODE] | ☐ |
| Reach **30+ reviews**; get into 2–3 "best nail salon software" roundups (pitch each editor with the data study as the hook) | [YOU] | ☐ |
| 1 YouTube walkthrough (Autumn or kiosk demo) | [YOU] | ☐ |

**Exit check (month 9):** city hubs ranking for "[city] nail salons"; page 1 for "nail salon online booking"; DR ~30–40; in ≥2 roundups.

---

## Phase 4 — Months 10–24: K4 ("nail salon software")

This only works once Phases 1–3 are done. Levers: sustained review velocity (aim 5–10 new reviews/month), a second data study, continued PR, the directory hubs maturing, and the `/tools/*` pages accruing links. Track "nail salon software" position monthly; expect real movement into the top 10 somewhere in months 12–18, top 5 by 18–24.

Not a goal: "salon software" (broad) or "online booking software" (generic) — Vagaro/Square/Calendly own those and the nail vertical is the winnable, defensible position.

---

## Monthly tracking

Re-run `GEO-AUDIT-REPORT.md` monthly. Log:

| Month | K1 pos | K2 pos | K3 pos | K4 pos | Reviews (Capterra/G2/Google) | Referring domains | Press/mentions |
|---|---|---|---|---|---|---|---|
| Baseline (2026-08) | — | — | — | — | 0 / 0 / 0 | ~0 | 0 |
| | | | | | | | |

The metric that predicts everything else here is **review count + referring domains**. If those two are climbing, rankings follow. If they're flat, no amount of on-page work will move K3/K4.

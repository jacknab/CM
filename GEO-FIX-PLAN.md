# Certxa GEO — Internal Fix Plan & Cost

**Date:** 2026-09-12
**Current score:** 58/100 (Poor–Fair). See [GEO-AUDIT-REPORT.md](GEO-AUDIT-REPORT.md).
**Realistic ceiling with this plan:** ~78–82/100 in ~90 days.

The audit is unambiguous about where the points are: the site is **technically excellent
already** (Technical 80, Schema 88, Citability 78). The score is capped by **Brand Authority
(20)** and **Platform Optimization (25)** — both off-site — plus one structural code risk
(51k indexable thin directory pages). So the plan is 80% marketing/content effort and
20% engineering.

---

## Bucket 1 — Engineering (in-house, ~3–4 dev-days total)

Cheap, fast, fully in our control. Do these first — they protect the domain and stop
working against ourselves.

| # | Task | Where | Effort | Score effect |
|---|---|---|---|---|
| 1 | `noindex, follow` on unclaimed (`!isVerified`) `/salon/:slug` pages; drop them from `salon/sitemap.xml` | `routes/salonDirectory.ts:649` + sitemap builder | 0.5 d | Removes a sitewide quality drag — lifts **all** categories a few points |
| 2 | Regenerate sitemap `<lastmod>` on every deploy; add real `<lastmod>` to the blog child in the index | sitemap generators | 0.5 d | Technical +3 |
| 3 | Canonicalize product facts (trial length, "50k+ professionals", `softwareVersion`) — one config source, grep-replace the rest | `php/` + `includes/settings.php` | 0.5 d | Citability +4 (removes contradiction risk) |
| 4 | Add `sameAs` to the `Organization` + founder `Person` nodes (LinkedIn company, `@certxa` X, Capterra URL — add G2/Product Hunt once live) | `includes/header.php` | 0.25 d | Schema +2, feeds Brand Authority |
| 5 | Named `Person` author on every blog post (reuse `#founder-tom-tham` `@id` where it fits) + a 2–3 sentence credentialed bio block in the article template | `blog/article.php`, `blog_posts` data | 1 d | E-E-A-T +6 |
| 6 | Verify homepage `Common Questions` copy matches the `overview` `FAQPage` `mainEntity` verbatim | `overview/default.php` | 0.25 d | Citability +2 |

**Bucket 1 total: ~3.5 dev-days. Expected: 58 → ~64.**

---

## Bucket 2 — Content (founder + 1 writer, ~2–3 weeks elapsed)

The citation magnets. This is what makes AI *quote* Certxa rather than just tolerate it.

| # | Task | Owner | Effort | Score effect |
|---|---|---|---|---|
| 7 | **"State of Nail-Salon No-Shows 2026"** — one data page built from real platform aggregates (backs the "35–40% drop" claim with methodology + a chart). This is the single highest-value content asset for a SaaS. | Founder (data) + writer | 3–4 d | Citability +6, E-E-A-T +5, becomes an external citation target |
| 8 | 2–3 head-query answer pages: "best nail salon software for a solo tech", "…for a Vietnamese-owned salon", "…for multi-location" — direct-answer format, own `FAQPage` | Writer | 3–4 d | Citability +4, Platform +3 |
| 9 | Founder LinkedIn article on the nail-salon-software problem, linking the research page | Founder | 0.5 d | Brand +2 |

**Bucket 2 total: ~1.5–2 weeks of writer time + ~1 week founder input. Expected: 64 → ~70.**

---

## Bucket 3 — Off-site brand authority (the real lever, ongoing)

This is 40% of the missing score and the slowest to move. Nothing here is code.

| # | Task | Owner options | Effort / cost |
|---|---|---|---|
| 10 | **G2 product listing** + seed 5+ reviews from existing happy customers | Founder / marketing | Free; ~2 h setup + outreach |
| 11 | **Product Hunt launch** (prep assets, schedule, work the comments day-of) | Founder / marketing | ~1 day prep + launch day |
| 12 | **Capterra reviews** — listing exists, needs volume (target 5–10) | Same customer outreach as #10 | Free |
| 13 | **Trustpilot** profile + review drive | Marketing | Free–low |
| 14 | **Reddit** — genuine, non-spammy answers in r/Nails, r/nailtech, r/smallbusiness where salon software comes up (2–3/week) | Founder or a community person | ~2 h/week ongoing |
| 15 | **YouTube** — one 3–5 min booking + kiosk walkthrough (creates a YouTube entity), then 1/month | Founder / contractor | ~0.5 d each |
| 16 | **LinkedIn company page** built out + weekly posts | Marketing | ~1 h/week |
| 17 | Get into the "best nail salon software 2026" listicles that don't list Certxa yet (outreach to zoca/zipdo-type publishers) | Marketing / PR | ~1 d outreach |

**Do-it-in-house:** ~4–6 h/week of founder/marketing time for the first 8 weeks, then ~2–3 h/week maintenance. No cash cost beyond time.

**Outsource option:** a fractional GEO/PR contractor to run Bucket 3 (listings, review drives, Reddit/community, outreach) runs roughly **$2,000–4,000/month**, typically a 3-month minimum. Worth it only if founder/marketing bandwidth is the blocker — the tasks themselves are straightforward.

**Bucket 3 expected over 90 days: Brand Authority 20 → ~40, Platform 25 → ~45. Score 70 → ~78–82.**

---

## 90-day trajectory

| Week | Focus | Score |
|---|---|---|
| 0 | Baseline | 58 |
| 1–2 | Bucket 1 (all 6 eng tasks) | ~64 |
| 3–5 | Bucket 2 (research page + answer pages) | ~70 |
| 4–12 | Bucket 3 (G2, Product Hunt, Capterra, Reddit, YouTube — overlapping) | ~78–82 |

## Cost summary

| | In-house | Outsourced |
|---|---|---|
| Engineering (Bucket 1) | ~3.5 dev-days | n/a — keep in-house |
| Content (Bucket 2) | founder ~1 wk + writer ~2 wks | writer contract ~$1.5–3k one-off |
| Brand authority (Bucket 3) | ~5 h/wk founder/marketing for 8 wks, then ~2–3 h/wk | GEO/PR contractor ~$2–4k/mo, 3-mo min |
| **Total to reach ~80/100** | mostly time, ~$0–3k cash | ~$8–15k over the quarter |

## What NOT to do

- Don't add real content to all 51k directory pages — `noindex` the weak ones instead (#1).
- Don't buy reviews or astroturf Reddit — AI-citation platforms and Google both detect and penalize it; the whole point is genuine third-party signal.
- Don't chase traditional-SEO tactics (link building, keyword pages) as a GEO fix — the gap here is entity recognition and citability, not rankings.
- Don't over-invest in more schema/technical work — those categories are already at 80–88; marginal points there are expensive.

## Blocked on the user / founder

Everything in Bucket 3, plus the data for #7, plus author identities for #5. Engineering (Bucket 1) can start immediately.

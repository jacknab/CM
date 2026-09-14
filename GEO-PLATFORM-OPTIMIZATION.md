# GEO Platform Optimization Report — certxa.com
Date: 2026-09-13

## Overall Platform Readiness
- Combined GEO Score: **49/100** (up from an initial 39/100 same-day baseline)

This reflects the site's state after a full day of fixes (Organization `sameAs`, `speakable` schema, `llms.txt` Key Facts/Contact sections, `/nail-salons` directory discoverability, IndexNow) plus one correction: a Google Business Profile for Certxa turned out to already exist (confirmed by the user), which this report had originally — incorrectly — scored as absent. On-site technical readiness is consistently strong across every platform; the remaining ceiling is **near-zero off-site entity presence beyond Google** (no Wikipedia, Wikidata, LinkedIn, active YouTube, Reddit, or Bing verification). That's a business-development gap, not a code gap.

## Platform Scores

| Platform | Score | Status |
|---|---|---|
| Google AI Overviews | 69/100 | Moderate |
| ChatGPT Web Search | 24/100 | Weak |
| Perplexity AI | 29/100 | Weak |
| Google Gemini | 48/100 | Moderate |
| Bing Copilot | 76/100 | Strong |

Status thresholds: Strong = 70+, Moderate = 40-69, Weak = 0-39

---

## Platform Details

### Google AI Overviews — 69/100 (Moderate)

| Criterion | Score | Notes |
|---|---|---|
| Top-10 ranking for target queries | 5/20 | Certxa previously ranked (and got AIO inclusion) for "nail salon booking software" and has since dropped out — a real, confirmed regression from the prior full audit, not a starting-from-zero situation |
| Question-based headings | 10/10 | Homepage FAQ: 6 real question headings ("What is Certxa?", "How much does Certxa cost?", etc.) |
| Direct answers after headings | 12/15 | FAQ answers are direct and concise; feature sections outside the FAQ aren't in Q&A format |
| Tables for comparisons | 10/10 | The 4 comparison pages (vs GlossGenius/Vagaro/Fresha/GoCheckIn) all use real pricing/feature tables |
| Lists for processes/features | 10/10 | Consistent bullet/feature lists throughout |
| FAQ section, 5+ questions | 10/10 | 6 questions on the homepage |
| Statistics with citations | 4/10 | Specific numbers exist ("68% fewer no-shows") but aren't attributed to a source or methodology page |
| Publication/updated date visible | 3/5 | Blog posts are dated; core marketing pages (homepage, pricing) show no visible date |
| Author byline with credentials | 0/5 | No visible on-page byline anywhere (backend schema now correctly types the Organization as author when no real person is set, but that's invisible to a reader) |
| Clean heading hierarchy | 5/5 | Confirmed H1>H2>H3, semantic HTML, SSR |

**Gap:** the lost keyword ranking is the single biggest lever here — everything else is already solid.

### ChatGPT Web Search — 24/100 (Weak, up from an initial 20/100)

| Criterion | Score | Notes |
|---|---|---|
| Wikipedia article | 0/20 | Confirmed absent (checked directly against the MediaWiki API earlier this session) |
| Wikidata entity | 0/10 | Absent — see the Brand Authority Playbook for a lower-notability-bar option |
| Bing index coverage | 6/10 | Unverified without Bing Webmaster access, but nothing blocks Bingbot and the site is fast/crawlable |
| Reddit brand mentions | 0/10 | Zero organic presence found |
| YouTube presence | 3/10 | One "Certxa SalonOS" demo video exists; no active channel |
| Authoritative backlinks (.edu/.gov/press) | 0/15 | None found |
| Entity consistency | 7/10 | Founding date/founder/HQ are now consistent across `/about`, the Organization schema, and `llms.txt` Key Facts — but there's nothing external yet to cross-check against |
| Content comprehensiveness (2000+ words) | 4/10 | Individual pages run 900-1,400 words; solid but short of the threshold |
| Bing Webmaster Tools | 0/5 | Not verified — no `BingSiteAuth.xml`, no `msvalidate.01` tag |

**Gap:** ChatGPT weights entity recognition (Wikipedia/Wikidata) above almost everything else, and that's entirely absent.

### Perplexity AI — 29/100 (Weak)

| Criterion | Score | Notes |
|---|---|---|
| Active Reddit presence | 0/20 | Absent |
| Forum/community mentions | 0/10 | No Hacker News/Stack Overflow/Quora mentions found |
| Content freshness | 10/10 | All 12 blog posts published within the last ~3 weeks |
| Original research/data | 5/15 | Real numbers exist but aren't published as a dated, methodology-backed data asset yet |
| YouTube with transcripts | 3/10 | Same single video as above |
| Quotable standalone paragraphs | 8/10 | FAQ and pricing copy score well for this independently (matches the 78/100 citability score from the earlier full audit) |
| Multi-source claim validation | 2/10 | Most stats are unsourced |
| Discussion-generating content | 0/10 | No evidence of external sharing/discussion |
| Wikipedia/Wikidata | 0/5 | Absent |

**Gap:** Perplexity over-indexes community discussion (Reddit especially) more than any other platform here — zero presence is the dominant factor.

### Google Gemini — 48/100 (Moderate — corrected from an initial 34/100)

| Criterion | Score | Notes |
|---|---|---|
| Google Knowledge Panel | 0/15 | None confirmed |
| Google Business Profile | 8/10 | **Correction: this already exists** — the user confirmed a live listing (`share.google/2wSjvp1TLOJNGoEWa`, references "Certxa LLC"). Not a full 10 since NAP-field completeness against the facts block wasn't independently verified (Maps listings don't expose details to a plain fetch). |
| YouTube with chapters | 3/20 | One video, no channel, no chapters |
| Schema.org structured data | 15/15 | Comprehensive: Organization (with `sameAs`), Person (with `url`), SoftwareApplication, WebPage (with `speakable`), FAQPage, WebSite |
| Google ecosystem (Scholar/News/Maps) | 4/10 | Maps presence now confirmed via the Business Profile; still no Scholar/News presence (neither applicable yet for this business) |
| Image optimization | 5/10 | Homepage is mostly SVG/icon-based rather than raster images, which sidesteps a lot of alt-text risk but also means little multi-modal content for Gemini to reference |
| E-E-A-T signals | 4/10 | Founder story on `/about` is genuine and specific, but no author pages or editorial policy (matches the 48/100 overall content score from the same-day content re-audit) |
| Google Merchant Center | N/A | Not an e-commerce business |
| Multi-modal content | 2/5 | Text-heavy; minimal image/video variety |

**Gap:** schema work moved the needle the most today (15/15), and Google Business Profile turned out to already be covered — but Knowledge Panel and YouTube (the other two legs of Gemini's Google-ecosystem weighting) are still absent.

### Bing Copilot — 76/100 (Strong, up from an initial 46/100)

| Criterion | Score | Notes |
|---|---|---|
| Bing Webmaster Tools verified | 15/15 | **Verified** — `msvalidate.01` meta tag added to `includes/header.php` (site-wide) with the real value Bing generated, confirmed live in the homepage `<head>` |
| IndexNow protocol | 15/15 | **Implemented and confirmed live** — key file serves at `certxa.com/d891ccc8faff12c38f43fe7f1701056e.txt` (HTTP 200, body matches), 49 URLs submitted to `api.indexnow.org`, received `202 Accepted` |
| Bing index coverage | 6/10 | Unverified but plausible given full crawl access |
| LinkedIn company page | 0/10 | Absent |
| GitHub presence | N/A | Not a developer-facing product |
| Meta descriptions | 10/10 | Confirmed well-written, keyword-rich on every page checked |
| Social engagement signals | 2/10 | An X/Twitter handle is declared (and now in schema `sameAs`), but no visible follower/engagement activity |
| Exact-match keywords | 8/10 | Titles are well-optimized ("Nail Salon Software \| Certxa", etc.) |
| Page load speed | 10/10 | ~80ms total response time on both homepage and `/pricing` — excellent |
| Bing Places | N/A | Business type is SaaS, not a local-service listing |

**Gap:** IndexNow is the one gap here that doesn't need a business decision or an external account — it's a self-serve protocol. Implemented below.

---

## Prioritized Action Plan

### Quick Wins (this week)
1. **Implemented today:** IndexNow protocol — see below. Helps Bing Copilot indexing speed with zero ongoing cost.
2. Add a visible "Last updated" date to the homepage and `/pricing` (AIO deprioritizes undated content on time-sensitive queries) — small template change.
3. Publish a dated, methodology-backed "State of Nail Salon No-Shows" data page turning the existing 68%/94% stats into a real, citable source — helps AIO, Perplexity, and ChatGPT simultaneously (flagged repeatedly across today's audits as the single highest-leverage content asset).

### Medium-Term (this month)
1. ~~Claim and build out a Google Business Profile~~ — **already done**, confirmed by the user (`share.google/2wSjvp1TLOJNGoEWa`). Worth double-checking every field matches the facts block exactly (name, address, phone, category).
2. Create a LinkedIn company page — helps ChatGPT, Bing Copilot, and Gemini simultaneously; matches Certxa's B2B positioning. Direct link + ready-to-paste copy in the Brand Authority Playbook.
3. ~~Verify the site in Bing Webmaster Tools~~ — **done**, `msvalidate.01` tag confirmed live. Bing Copilot is now the strongest platform on the board (76/100).
4. Publish 2-3 short screen-capture demo videos to the existing "Certxa SalonOS" YouTube presence with real chapters/timestamps.

### Strategic (this quarter)
1. Pursue a Wikipedia entry once there's enough independent press/review coverage to pass notability review (don't attempt a self-promotional draft before then).
2. Build authentic Reddit/community presence (r/Nails, r/smallbusiness, r/nailtechnician) — the single highest-leverage lever for Perplexity specifically.
3. Grow third-party review volume (G2, Capterra) — feeds ChatGPT, Perplexity, and Bing Copilot's community-validation signals all at once.

---

## IndexNow — implemented this session

Unlike every other gap above, IndexNow needs no account signup or business decision — it's a decentralized, self-serve protocol (any site can generate its own key and submit URLs; Bing/Yandex/Seznam trust the key-file itself as proof of ownership). Implemented:

- Generated a key and hosted it at `https://certxa.com/d891ccc8faff12c38f43fe7f1701056e.txt` (returns the key, 200 OK) — source file at `artifacts/booking/public/d891ccc8faff12c38f43fe7f1701056e.txt`.
- Submitted 49 URLs (all marketing pages, all blog posts, the `/nail-salons` hub and state pages) to `https://api.indexnow.org/indexnow` — received `202 Accepted`, confirming the key was validated and the submission queued.

**Not yet automated:** this was a one-time manual submission covering everything live today. To get ongoing value, a future submission should fire whenever a page is published or meaningfully edited (new blog post, pricing change, etc.) — e.g. a small POST to the IndexNow API from wherever blog posts get published, reusing the same key file already in place. That wiring wasn't built in this pass since it touches the publishing pipeline rather than being a standalone fix.

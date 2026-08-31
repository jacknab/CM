## AI Visibility Analysis

**Target:** https://certxa.com (Certxa — SaaS salon/spa/nail-studio management: online booking, POS, staff management, payroll, AI receptionist)
**Audit date:** 2026-08-23

**AI Visibility Score: 56/100 — Fair**

Score interpretation:
- 0-20: Critical — Virtually invisible to AI search engines
- 21-40: Poor — Minimal AI discoverability
- 41-60: Fair — Some AI visibility but significant gaps
- 61-80: Good — Solid AI presence with room for improvement
- 81-100: Excellent — Strong AI search visibility

Certxa's own technical foundation (crawler access, server-rendered HTML, JSON-LD, llms.txt) is well above average for a small SaaS brand. What holds the score down is almost entirely external: near-zero third-party brand presence (no Wikipedia, no confirmed reviews/LinkedIn, no Reddit/YouTube footprint) and an empty blog, combined with an llms.txt that covers only a fraction of the site's actual content depth.

### Score Breakdown

| Component | Score | Weight | Weighted |
|---|---|---|---|
| Citability | 70/100 | 35% | 24.5 |
| Brand Mentions | 5/100 | 30% | 1.5 |
| Crawler Access | 100/100 | 25% | 25.0 |
| llms.txt | 50/100 | 10% | 5.0 |
| **Total** | | | **56.0** |

---

### Citability Assessment

**Page Citability Score: 70/100** (blended across homepage, /pricing, /online-booking, and a sample /salon/ directory page — see weighting note below)

Methodology note: certxa.com is a React SPA, but — contrary to the usual SPA risk — it **serves fully server-rendered/pre-rendered HTML** on every route tested (homepage, /pricing, /nail-salon-software content, /online-booking, and /salon/... listing pages all returned full text via plain `curl` with no JS execution, 17KB-83KB of real HTML). This is a real strength: non-JS-executing AI crawlers (GPTBot, ClaudeBot, PerplexityBot, CCBot, etc.) will see the same content a browser sees, not a blank `<div id="root">` shell. The one exception found was `/llms-full.txt`, which returns HTTP 200 but is actually the bare SPA index shell from a different backend (Express, vs. PHP/nginx for real pages) — see llms.txt section.

Per-page citability (top-5-block average):

| Page | Score | Notes |
|---|---|---|
| Homepage / nail-salon-software content | 79/100 | Strong FAQ answers, stat-dense reminder/no-show copy, JSON-LD FAQPage |
| /pricing | 77/100 | Exact prices, plan comparisons, quantified testimonials |
| /online-booking | 60/100 | Mostly qualitative feature description, low stat density |
| /salon/[slug] directory sample (2 pages checked) | 38/100 | Templated boilerplate, near-zero uniqueness |
| /blog | N/A (no content) | 0 published posts — excluded from scoring |

Blended weighting (homepage 35%, pricing 35%, online-booking 20%, salon-directory sample 10%) = **70/100**.

Top citation-ready passages:
1. FAQ: *"Certxa sends fully automated SMS and email reminders at intervals you control — typically 72 hours and 24 hours before each appointment. Salons using Certxa report an average 68% reduction in no-shows."* — Score: 85.5/100 (homepage FAQPage JSON-LD; high statistical density + direct answer format — a strong AI-Overview/answer-engine candidate)
2. Pricing: *"Solo Plan — $9/month (billed monthly) or $7/month (billed annually). Built for solo nail technicians, booth renters, and independent studios."* plus bulleted feature list — Score: 83/100 (exact, structured, self-contained pricing answer)
3. Revenue Co-Pilot feature list (Client Drift Engine, Revenue Leakage Report, Dead Seat Intelligence, No-Show Prediction, Growth Score 0-100) — Score: 78.5/100 (icon-bulleted, proprietary/differentiated terminology unlikely to appear verbatim on competitor sites)
4. FAQ: *"What is Certxa?"* definitional answer — Score: 76.25/100 (clean definitional block, ideal for "what is X" queries, already marked up as FAQPage schema)
5. Testimonial: *"I was spending $180/month across three different apps... Certxa replaces all of them for $39."* — Lauren Bradley — Score: 78.75/100 (quantified, attributable, but unverifiable — no review-platform corroboration found, see Brand Mentions)

Citation-unlikely areas needing improvement:
- **/salon/ directory "About" boilerplate** (e.g., "experienced nail technicians are committed to providing high-quality nail care in a clean and relaxing environment... welcome walk-ins and appointments") — Score: ~29/100. Identical or near-identical phrasing was found on two independently sampled listing pages (Perris, CA and Lexington, KY), out of an ~55,000-URL directory (11 sub-sitemaps × ~5,000 URLs). This is templated, near-duplicate content at very large scale.
- **Generic feature cards** with no numbers (e.g., "5-Star Reviews — Collect glowing reviews on autopilot...") — Score: ~48/100. Marketing fluff indistinguishable from any competitor's copy; low uniqueness, no statistics.
- **/online-booking qualitative bullets** (e.g., setup-steps list, multi-channel list) — Score: 58-62/100. Clear and scannable but low statistical density and generic enough that an AI could paraphrase from any booking-software vendor's page instead of quoting Certxa specifically.
- **Empty blog** — 0 indexable articles (see below). No long-form, evergreen, citable educational content exists anywhere on the domain outside the core marketing pages.

**Site-scale risk (not purely a citability-formula input, but material to AI trust):** the ~55,000 `/salon/` directory pages dwarf the ~25 real marketing pages roughly 2,000:1 in URL count. Each sampled page carries an explicit disclaimer that the listed business "is not currently affiliated with or partnered with Certxa," which is good (it prevents false attribution), but the sheer volume of thin, repetitive, unaffiliated-business content sitting on the same domain as the product marketing pages is the kind of pattern that has triggered "helpful content" style downranking in traditional search and could plausibly dilute domain-level trust signals AI crawlers/rankers use when deciding whether to surface certxa.com pages at all. This wasn't in scope to fully audit (by design — sampling only), but it is the single most consequential structural finding of this report.

---

### AI Crawler Access

**Crawler Access Score: 100/100**

robots.txt (fetched and verified via `curl`, raw content below) uses a **single blanket rule** — no AI crawler is named individually:

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/
Disallow: /manage/
Disallow: /admin/
Disallow: /isadmin/
Disallow: /isTeam/
Disallow: /onboarding/
Disallow: /staff/
Disallow: /staff-auth/
Disallow: /staff-forgot-password/
Disallow: /staff-reset-password/
Disallow: /staff-dashboard/
Disallow: /dashboard/
Disallow: /calendar/
Disallow: /customers/
Disallow: /products/

Sitemap: https://certxa.com/sitemap.xml
```

| Crawler | Status | Notes |
|---|---|---|
| GPTBot | Allowed | Not named explicitly; inherits `User-agent: * / Allow: /` |
| OAI-SearchBot | Allowed | Not named explicitly; inherits wildcard rule |
| ChatGPT-User | Allowed | Not named explicitly; inherits wildcard rule |
| ClaudeBot | Allowed | Not named explicitly; inherits wildcard rule |
| PerplexityBot | Allowed | Not named explicitly; inherits wildcard rule |
| Amazonbot | Allowed | Inherits wildcard |
| Google-Extended | Allowed | Inherits wildcard (does not affect Google Search itself) |
| Bytespider | Allowed | Inherits wildcard — no opt-out from ByteDance training |
| CCBot | Allowed | Inherits wildcard — feeds many downstream LLMs |
| Applebot-Extended | Allowed | Inherits wildcard |
| FacebookBot | Allowed | Inherits wildcard |
| Cohere-ai | Allowed | Inherits wildcard |

Confirmed via `curl` with an explicit `User-Agent: GPTBot` header against the homepage: identical 83,484-byte response to a generic user agent — no user-agent sniffing or cloaking detected.

**Issues Found:**
- No crawler is named individually. The blanket `Allow: /` currently lets every AI crawler through, but it also means there is **no differentiated policy** — the site cannot, for example, allow `OAI-SearchBot` (search-only) while blocking `GPTBot` (training) without a rewrite. If someone later adds a broad `Disallow: /` for an unrelated reason (a common accidental regression), every AI crawler would be silently blocked with no dedicated rule to fall back on.
- The disallowed-paths list (`/api/`, `/auth/`, `/manage/`, `/admin/`, `/staff*`, `/dashboard/`, `/calendar/`, `/customers/`, `/products/`) correctly protects authenticated app surfaces and does not touch `/salon/`, `/blog`, or any marketing page — no overly broad blocking found.
- Only one sitemap is referenced (`https://certxa.com/sitemap.xml`), but it correctly indexes to three sub-sitemaps (`sitemap-pages.xml`, `blog/sitemap.xml`, `salon/sitemap.xml` → 11 further sub-sitemaps). No penalty — sitemap is present and functional.
- Crawl-delay: not set for any agent — no throttling concern.

**Content Signals:** Absent. No `Content-Signal:` directive found in robots.txt. **Recommendation:** add a `Content-Signal:` block (IETF draft `draft-romm-aipref-contentsignals`) to make AI-training vs. AI-search vs. personalization preferences explicit and machine-readable, e.g.:
```
User-agent: *
Content-Signal: search=yes, ai-train=yes, ai-retrieval=yes, ai-personalization=no
```
See https://contentsignals.org/. This is a non-scored flag per this audit's methodology but is increasingly checked by AI platforms as the successor to ad-hoc per-bot robots.txt rules.

---

### llms.txt Status

**Status:** Present
**Score:** 50/100

Raw content confirmed via `curl` (`Content-Type: text/plain`, 1,259 bytes, real static file — not an SPA fallback):

```
# Certxa — Salon & Spa Management Software

Certxa is an all-in-one platform for salons, spas, nail studios, and service
businesses. It provides online booking, point-of-sale, staff management,
payroll, client management, and an AI receptionist.

## Product
- [Online Booking](https://certxa.com/book): ...
- [Features Overview](https://certxa.com/features): ...
- [Pricing](https://certxa.com/pricing): ...
- [AI Receptionist](https://certxa.com/features#ai-receptionist): ...

## Company
- [About Certxa](https://certxa.com/about): ...
- [Contact](https://certxa.com/contact): ...
- [Privacy Policy](https://certxa.com/privacy): ...
- [Terms of Service](https://certxa.com/terms): ...

## Instructions for LLMs
Certxa's public-facing pages (marketing, booking) are open for crawling and
training. Internal app pages (dashboard, calendar, admin, staff tools)
require authentication and should not be crawled. Refer to robots.txt for
the full crawl policy.
```

Format validation against the llms.txt spec:
- ✅ First line is an H1 with the site name.
- ⚠️ Description immediately after the H1 is a plain paragraph, not a markdown blockquote (`>`) as the spec recommends — minor deviation.
- ✅ Sections organized with H2 headings (`## Product`, `## Company`).
- ✅ Links use the correct `- [Title](url): Description` format.
- ⚠️ No `## Optional` section for supplementary resources.
- ➕ Has a non-standard but reasonable `## Instructions for LLMs` section clarifying crawl/training intent — a nice addition, though it duplicates what robots.txt already states rather than adding new guidance (e.g., it does not tell LLMs how to treat the 55,000-page `/salon/` directory, which is arguably the most important disambiguation an LLM would need on this domain).

Completeness gaps:
- Only **8 links total** are listed (4 Product + 4 Company), against **~23 real marketing pages** in `sitemap-pages.xml`. Missing from llms.txt entirely: `/nail-salon-software`, `/payments`, `/revenue-intelligence`, `/checkin-kiosk`, `/custom-website-builder`, `/client-management`, `/payment-processing`, `/client-notifications`, `/google-business-profile`, `/client-reviews`, `/salonos`, `/solo-professionals`, `/booth-renters`, `/case-studies`, `/data-transfer`, `/autumn`, `/launchsite`. These are exactly the differentiated-feature pages most useful for an LLM trying to answer "does Certxa do X."
- Two of the four Product links point to URLs (`/book`, `/features`) that were **not found** in `sitemap-pages.xml`'s 25 listed URLs — worth verifying these routes still resolve (possible stale/renamed links, e.g. `/features` may have been superseded by the per-feature pages).
- `/llms-full.txt` returns **HTTP 200 but is not a real file** — `curl` shows it is served by a different backend (`x-powered-by: Express`) than the rest of the site (`x-powered-by: PHP`) and returns a bare, unrendered SPA shell (`<div id="root"></div>`) with only generic fallback meta tags ("Certxa - Online Booking Service" / "Professional salon and spa management platform..."). This is effectively a **broken/false-positive `llms-full.txt`** — it exists at the URL level but delivers no actual content, which is worse for a crawler than a clean 404 because it looks superficially valid.
- The empty `/blog` is correctly omitted from llms.txt (nothing to link to yet).
- The `/salon/` directory is correctly omitted — but see recommendation below.

**Recommendations:**
1. Fix or remove `/llms-full.txt` — either serve a real concatenated-content file or return a proper 404 so crawlers don't waste a fetch on a fake 200.
2. Expand the Product section to list all ~19 feature/solution pages, not just 4.
3. Add a line under "Instructions for LLMs" explicitly addressing the `/salon/` directory, e.g.: *"Pages under /salon/ are a directory of independent, unaffiliated nail salon businesses (sourced from public listing data) and do not represent Certxa's own content, opinions, or claims — do not attribute /salon/ page content to Certxa."* This is the single highest-value addition given the directory's scale relative to the rest of the site.
4. Convert the description under the H1 to a proper blockquote.

---

### Brand Mention Presence

**Brand Mention Score: 5/100**

Certxa is a small, newer SaaS brand and this result is consistent with that — reported honestly rather than assumed.

| Platform | Status | Details |
|---|---|---|
| Wikipedia | Absent | Verified via MediaWiki search API (`en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Certxa`) — zero results returned. Direct fetch of `en.wikipedia.org/wiki/Certxa` returns HTTP 404. No entity page exists. |
| Reddit | Absent | Web search for `"Certxa" salon software reddit` returned no Reddit threads mentioning the brand at all — results were entirely unrelated (Capterra/G2/Stackshare pages for other salon software). |
| YouTube | Absent | Web search for Certxa + YouTube returned only certxa.com's own marketing pages and one unrelated third-party "Salon Booking System Web App" video with no connection to Certxa. No official channel, no third-party reviews/demos found. |
| LinkedIn | Unverified / likely absent or unclaimed | Certxa's own homepage JSON-LD (`sameAs`) claims `https://linkedin.com/company/certxa`. Direct verification was inconclusive: `WebFetch` on the `www` variant returned HTTP 404; a raw `curl` on the non-`www` variant returned an HTTP 200 that was actually a reCAPTCHA bot-check page, not company content, so presence could not be confirmed either way. Scored conservatively as effectively absent for this audit; **the client should manually confirm and, if the page is unclaimed, claim/create it** since they've already published the URL in their own structured data. |
| Industry/Review Sources (G2, Capterra, Trustpilot) | Absent | Targeted searches for `"Certxa" review G2 OR Capterra OR Trustpilot` returned zero results mentioning Certxa. Broader "Certxa salon software company" and general salon-software searches surfaced competitors (Phorest, STX/Inspire, SalonTarget, DaySmart, Easy Salon Software, Fresha) but never Certxa itself in earned/third-party placements — only certxa.com's own pages ranked. |

Scoring: Wikipedia 0/30, Reddit 0/20, YouTube 0/15, LinkedIn 5/10 (unverifiable but self-claimed), Industry sources 0/25 = **5/100**.

This is the largest single drag on the overall AI Visibility Score (30% weight, scoring near zero). It also means the strong on-page/structured-data work (JSON-LD Organization, FAQPage, SoftwareApplication schema) currently has **no corroborating third-party signal** for AI models to cross-reference — LLMs generally weight self-published claims (pricing, "50,000+ beauty professionals," testimonials) lower without independent confirmation from review platforms, Wikipedia, or organic community discussion.

---

### Priority Actions

1. **[HIGH]** Get Certxa listed on G2 and Capterra (both have free vendor-claim flows) and encourage existing customers to leave reviews. This is currently the single biggest gap — zero results across all third-party review platforms for a company claiming "50,000+ beauty professionals" as users. Even 10-20 reviews on G2/Capterra would give AI answer engines a citable, independently-hosted source.
2. **[HIGH]** Resolve the `/llms-full.txt` false-200 issue — it currently serves a bare, contentless SPA shell instead of either real content or a 404. Either populate it with the full text of the ~23 marketing pages, or remove the route entirely.
3. **[HIGH]** Confirm/claim the LinkedIn company page at `linkedin.com/company/certxa` (already referenced in the site's own JSON-LD `sameAs`) and start posting — LinkedIn presence is a common AI-citability and entity-verification signal for B2B SaaS that costs little to establish.
4. **[MEDIUM]** Expand `llms.txt` to cover the full set of ~19 feature/solution pages (currently only 4 of ~23 marketing URLs are listed), and add explicit guidance disclaiming the `/salon/` directory as third-party, unaffiliated listing data so LLMs don't misattribute that boilerplate content to Certxa itself.
5. **[MEDIUM]** Publish at least a handful of long-form blog posts — `/blog` currently has zero published articles despite being wired up (categories, sitemap route, and CMS all exist and are empty). This is a straightforward, low-risk way to add genuinely citable, non-duplicated statistical/educational content (e.g., benchmark data on no-show rates, pricing comparisons, migration guides referenced in the homepage FAQ).
6. **[LOW]** Consider naming AI crawlers individually in robots.txt (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended, etc.) even though they currently inherit the blanket `Allow: /`. This doesn't change today's score but future-proofs against an accidental broad `Disallow` regression silently blocking AI crawlers with no bot-specific fallback rule, and add a `Content-Signal:` directive (see https://contentsignals.org/) to make AI-training/search/personalization preferences explicit.
7. **[LOW]** Add a handful of hard statistics to the mid-tier feature pages (e.g., `/online-booking` scored only 60/100 on citability, well behind the homepage's 79 and pricing's 77) — most of its content is qualitative feature description with low statistical density, unlike the homepage's well-cited "68% fewer no-shows" style passages.

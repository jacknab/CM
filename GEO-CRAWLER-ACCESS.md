# AI Crawler Access Report: certxa.com

**Analysis Date:** 2026-09-12
**Domain:** certxa.com
**robots.txt Status:** Found (well-structured, per-bot directives)

---

## Crawler Access Summary

| Crawler | Operator | Tier | Status | Impact |
|---|---|---|---|---|
| GPTBot | OpenAI | 1 | **Allowed** | Explicit `Allow: /` — content eligible for ChatGPT Search and model training |
| OAI-SearchBot | OpenAI | 1 | **Allowed** | Explicit `Allow: /` — content eligible for ChatGPT Search results |
| ChatGPT-User | OpenAI | 1 | **Allowed** | Explicit `Allow: /` — users can ask ChatGPT to browse certxa.com directly |
| ClaudeBot | Anthropic | 1 | **Allowed** | Explicit `Allow: /` — content eligible for Claude web search/analysis |
| PerplexityBot | Perplexity | 1 | **Allowed** | Explicit `Allow: /` — content eligible for Perplexity's cited search results |
| Google-Extended | Google | 2 | **Allowed** | Explicit `Allow: /` — content eligible for Gemini training / AI Overviews improvement |
| GoogleOther | Google | 2 | **Allowed** (via wildcard) | No dedicated block; inherits `User-agent: * / Allow: /` |
| Applebot-Extended | Apple | 2 | **Allowed** | Explicit `Allow: /` — content eligible for Apple Intelligence |
| Amazonbot | Amazon | 2 | **Allowed** | Explicit `Allow: /` — content eligible for Alexa/Amazon AI answers |
| FacebookBot | Meta | 2 | **Allowed** (via wildcard) | No dedicated block; inherits `User-agent: * / Allow: /` |
| CCBot | Common Crawl | 3 | **Allowed** | Explicit `Allow: /` — content included in the public Common Crawl training dataset |
| anthropic-ai | Anthropic | 3 | **Allowed** | Explicit `Allow: /` — content eligible for Claude training (separate from live ClaudeBot) |
| Bytespider | ByteDance | 3 | **Partially Blocked** | `Disallow: /salon/`, `/nail-salons/` only — blocked from the 51k-page directory, allowed on all marketing/blog content |
| cohere-ai | Cohere | 3 | **Allowed** | Explicit `Allow: /` (matched case-insensitively as `Cohere-ai`) |

**Bonus coverage beyond the standard checklist:** the robots.txt also explicitly allows `Claude-User` and `Claude-Web` (Anthropic's user-initiated-browsing agents, analogous to `ChatGPT-User`) and `Perplexity-User` — both correctly anticipated even though not required.

## AI Visibility Score: 100/100

**Tier 1 Access:** 5/5 crawlers allowed
**Tier 2 Access:** 5/5 crawlers allowed
**Tier 3 Access:** 4/4 crawlers allowed (one, Bytespider, scoped-blocked from low-value pages only — not a blanket block)

---

## Critical Issues

None. No Tier 1 crawler is blocked.

---

## Recommendations

### Immediate Actions

None required for crawler access — this is a model configuration. Two small, low-priority polish items:

1. **`/.well-known/ai-plugin.json` and `/ai.txt` return no real file.** `ai-plugin.json` returns HTTP 200 but with `content-type: text/html` — it's the SPA/PHP catch-all shell being served for an unmatched path, not an actual plugin manifest (confirmed by diffing against a real 404). `/ai.txt` returns a clean 404. Neither standard is required (ai-plugin.json is a largely-superseded OpenAI-specific format, `ai.txt` is a non-standardized proposal), so this is cosmetic, not a visibility blocker. If addressed, make the catch-all route return a real 404 for `.well-known/*` paths that don't exist, to avoid soft-404 confusion for any bot that treats a 200 response as "found."
2. **Re-verify the unclaimed-`/salon/`-listing `noindex` fix from the prior full GEO audit (issue #2 in `GEO-AUDIT-REPORT.md`).** This report only sampled one `/salon/:slug` page (a verified paying customer, correctly `index, follow`) — it did not re-check an unclaimed listing. Crawler *access* to `/salon/` is intentionally open (only data-scraper bots like Ahrefs/Semrush/Bytespider are blocked there); whether unclaimed pages should be `noindex` is an indexability-quality question, not a crawler-access one, so it's flagged here for follow-up rather than re-scored.

### robots.txt Recommendation

No changes needed. The current configuration already matches (and exceeds) the "Maximum AI Visibility" reference configuration:

- Every Tier 1 and Tier 2 crawler is either explicitly allowed or allowed via a permissive wildcard default.
- Tier 3's only scraper-adjacent bot (Bytespider) is blocked with surgical precision — from the 51k-page low-value salon directory only, not from the marketing/blog content that actually benefits from AI training exposure. This is arguably a *better* pattern than the skill's blanket "BLOCK Bytespider" default, since it keeps the content worth being trained on eligible while denying the directory pages that are a pure scraping/duplication liability.
- Legitimate data-scraper SEO-tool bots (AhrefsBot, SemrushBot, MJ12bot, DotBot, BLEXBot, DataForSeoBot, PetalBot) are correctly scoped to the same `/salon/` + `/nail-salons/` exclusion, not blocked site-wide.
- A `Sitemap:` directive is present and points to a live, 200-OK sitemap index.

### Additional Technical Findings

- **Meta Robots Tags:** Consistent, favorable directives across all sampled pages (homepage, pricing, blog, salon directory): `index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1`. No `noai`, `noimageai`, or bot-specific `noindex` tags found anywhere.
- **X-Robots-Tag Headers:** None present on any sampled page (homepage, pricing, blog article, salon listing) — no HTTP-header-level blocks of any kind. Only `x-content-type-options: nosniff` is set.
- **JavaScript Rendering:** No risk. The marketing/blog/directory site is server-rendered PHP (confirmed in the prior full audit and re-confirmed here — page content is present in the raw HTML response, not injected client-side).
- **llms.txt:** Present and valid at `/llms.txt` (HTTP 200, correct `text/...` content, well-structured with a product summary and categorized page links).
- **Sitemap Accessibility:** `/sitemap.xml` returns a valid sitemap index (200 OK) fanning out to `sitemap-pages.xml`, `blog/sitemap.xml`, and `salon/sitemap.xml`, all dated `lastmod: 2026-09-12` (today) — the stale-`lastmod` issue flagged in the prior full GEO audit (2026-09-08) appears to have since been resolved.

### Content Signals (IETF Draft)

**Status:** Present

| Signal Key | Value | Meaning |
|---|---|---|
| search | yes | Permits use of this content in AI-powered search results |
| ai-train | yes | Permits this content to be used for AI model training |
| ai-retrieval | yes | Permits AI systems to retrieve this content live (e.g. RAG/browsing) |
| ai-personalization | no | Opts out of using this content to personalize AI responses to individual users |

All four keys are from the known set and both value tokens used (`yes`/`no`) are valid — no warnings. This is a deliberate, fully-specified stance rather than an omission, sitting on the wildcard `User-agent: *` line rather than duplicated per-bot. Certxa is ahead of the curve here — this IETF draft (`draft-romm-aipref-contentsignals`) is not yet widely adopted, and declaring it removes ambiguity for any crawler that respects it.

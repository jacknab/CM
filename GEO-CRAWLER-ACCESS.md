# AI Crawler Access Report: certxa.com

**Analysis Date:** 2026-09-13
**Domain:** certxa.com
**robots.txt Status:** Found (`https://certxa.com/robots.txt`)

---

## Crawler Access Summary

| Crawler | Operator | Tier | Status | Impact |
|---|---|---|---|---|
| GPTBot | OpenAI | 1 | **Allowed** (explicit) | Full content access for ChatGPT Search |
| OAI-SearchBot | OpenAI | 1 | **Allowed** (explicit) | Appears in ChatGPT's search results |
| ChatGPT-User | OpenAI | 1 | **Allowed** (explicit) | ChatGPT can browse pages a user asks it to visit |
| ClaudeBot | Anthropic | 1 | **Allowed** (explicit, plus `Claude-User` and `Claude-Web` also explicitly allowed) | Full access for Claude web search/analysis |
| PerplexityBot | Perplexity | 1 | **Allowed** (explicit, plus `Perplexity-User` also explicitly allowed) | Eligible for Perplexity's sourced answers with citation links |
| Google-Extended | Google | 2 | **Allowed** (explicit) | Content eligible for Gemini training / AI Overviews improvement |
| GoogleOther | Google | 2 | **Allowed** (explicit) | Eligible for Google's AI research / experimental features |
| Applebot-Extended | Apple | 2 | **Allowed** (explicit) | Eligible for Apple Intelligence features |
| Amazonbot | Amazon | 2 | **Allowed** (explicit) | Eligible for Alexa answers |
| FacebookBot | Meta | 2 | **Allowed** (explicit) | Eligible for Meta AI |
| CCBot | Common Crawl | 3 | **Allowed** (explicit) | Included in the open training dataset used by many AI labs |
| anthropic-ai | Anthropic | 3 | **Allowed** (explicit) | Eligible for Claude training data |
| Bytespider | ByteDance | 3 | **Restricted** | Blocked only from `/salon/` and `/nail-salons/` (the unclaimed third-party salon directory); full access to all marketing/blog content |
| cohere-ai | Cohere | 3 | **Allowed** (explicit, as `Cohere-ai`) | Eligible for Cohere training data |

## AI Visibility Score: 100/100

**Tier 1 Access:** 5/5 crawlers allowed
**Tier 2 Access:** 5/5 crawlers allowed
**Tier 3 Access:** 4/4 crawlers allowed (with one, Bytespider, sensibly scoped away from a low-value directory rather than blocked outright)

---

## Critical Issues

None. No Tier 1 crawler is blocked, restricted, or missing an explicit rule.

## Recommendations

### Immediate Actions

None outstanding. The one optional refinement identified in this audit — explicitly naming `FacebookBot` and `GoogleOther` rather than relying on the wildcard `Allow: /` — has been applied to `artifacts/booking/public/robots.txt` and is live. Both already had access before this change (inherited from the wildcard); this just brings them under the same "explicitly named so a future accidental broad Disallow can't silently catch them" protection the file's own header comment describes for the other crawlers.

The Bytespider scoping to `/salon/`/`/nail-salons/` (alongside the same treatment for AhrefsBot, SemrushBot, MJ12bot, DotBot, BLEXBot, DataForSeoBot, PetalBot) needs no change — it's a deliberate, sensible choice that keeps scraper/low-value bots off a large directory of unclaimed third-party listings without touching AI crawler access to the site's actual content.

### robots.txt Recommendation

Already applied — `artifacts/booking/public/robots.txt` now includes:

```
User-agent: FacebookBot
Allow: /

User-agent: GoogleOther
Allow: /
```

### Additional Technical Findings

- **Meta Robots Tags:** Sampled `/`, `/pricing`, `/blog`, `/nail-salons` — all `index, follow`, with `max-snippet:-1, max-image-preview:large, max-video-preview:-1` on the marketing/blog pages (explicitly removes any snippet-length cap, which is favorable for AI Overviews and chat assistants quoting the page). No `noai`/`noimageai` tags anywhere sampled.
- **X-Robots-Tag Headers:** None present on any sampled page (checked via response headers on `/`, `/pricing`, `/blog`, `/nail-salons`) — nothing overriding the permissive meta-tag/robots.txt posture.
- **JavaScript Rendering:** Low risk. The marketing site, blog, and salon directory (`/salon/`, `/nail-salons/`) are all server-rendered PHP/Node — full content is present in the initial HTML response, so GPTBot/ClaudeBot/PerplexityBot's limited JS execution isn't a barrier. (The booking app itself, `/calendar`, `/booking`, etc., is a client-rendered React SPA, but those paths are already disallowed in robots.txt as internal app routes, so this doesn't affect public AI-crawler visibility.)
- **llms.txt:** Present and well-formed at `/llms.txt`, plus a full-content companion at `/llms-full.txt` (140KB, covers all 30 primary marketing pages) — above the norm for this standard, which most sites haven't adopted at all yet.
- **Sitemap Accessibility:** `/sitemap.xml` is a valid, publicly accessible sitemap index (no auth, no bot-blocking), referencing `/sitemap-pages.xml`, `/blog/sitemap.xml`, `/salon/sitemap.xml`, and `/nail-salons/sitemap.xml` — all four confirmed reachable.
- **Other AI-specific files:** `/.well-known/ai-plugin.json` and `/ai.txt` were checked. `/ai.txt` returns a real 404. `/.well-known/ai-plugin.json` returns HTTP 200, but the response is the React app's catch-all `index.html` shell (`content-type: text/html`), not an actual plugin manifest — the SPA's routing serves that page for any unmatched path rather than a true 404. Not a meaningful gap (the OpenAI plugin manifest standard it would represent was deprecated in 2024), but worth knowing it's a soft-200 rather than a real 404 if anyone later checks for that file's presence.

### Content Signals (IETF Draft)

**Status:** Present

| Signal Key | Value | Meaning |
|---|---|---|
| search | yes | Permits use in AI-powered search results |
| ai-train | yes | Opts in to AI model training on this content |
| ai-retrieval | yes | Permits retrieval/quoting in AI-generated answers |
| ai-personalization | no | Does not permit use for personalizing responses to individual users |

All four keys and values validate against the current draft spec (`draft-romm-aipref-contentsignals`) — no unknown keys, no invalid values. This is a rare, forward-leaning adoption; very few sites in this vertical have declared Content-Signal preferences yet.

# AI Crawler Access Report: certxa.com

**Analysis Date:** 2026-10-13
**Domain:** https://certxa.com
**robots.txt Status:** Found (200, valid)

---

## Crawler Access Summary

| Crawler | Operator | Tier | Status | Impact |
|---|---|---|---|---|
| GPTBot | OpenAI | 1 | Allowed (named) | Pages can appear in ChatGPT search and browsing |
| OAI-SearchBot | OpenAI | 1 | Allowed (named) | Pages can appear in ChatGPT search results |
| ChatGPT-User | OpenAI | 1 | Allowed (named) | ChatGPT can open a page a user asks about |
| ClaudeBot | Anthropic | 1 | Allowed (named) | Claude can search and read pages |
| PerplexityBot | Perplexity | 1 | Allowed (named) | Pages can be cited in Perplexity answers |
| Google-Extended | Google | 2 | Allowed (named) | Content can be used by Gemini and AI features |
| GoogleOther | Google | 2 | Allowed (named) | Google's other crawls can read pages |
| Applebot-Extended | Apple | 2 | Allowed (named) | Content can be used by Apple Intelligence |
| Amazonbot | Amazon | 2 | Allowed (named) | Content can be used in Alexa answers |
| FacebookBot | Meta | 2 | Allowed (named) | Content can be read by Meta AI |
| CCBot | Common Crawl | 3 | Allowed (named) | Content enters Common Crawl training data |
| anthropic-ai | Anthropic | 3 | Allowed (named) | Content may be used for Claude training |
| Bytespider | ByteDance | 3 | Allowed, except `/listings/` | Can read marketing pages; kept out of the directory hubs |
| cohere-ai | Cohere | 3 | Allowed (named) | Content may be used for Cohere training |

Also named and allowed: Claude-User, Claude-Web, Perplexity-User.

## AI Visibility Score: 100/100

**Tier 1 Access:** 5/5 crawlers allowed
**Tier 2 Access:** 5/5 crawlers allowed
**Tier 3 Access:** 4/4 crawlers allowed (Bytespider limited to non-directory pages)

| Component | Weight | Result |
|---|---|---|
| Tier 1 crawlers allowed | 50 | 50 |
| Tier 2 crawlers allowed | 25 | 25 |
| No blanket AI blocks | 15 | 15 |
| AI-specific files present | 10 | 10 (`llms.txt` and the sitemap both answer) |

The score measures access only. It says nothing about whether AI systems choose to cite the site; the 2026-10-12 audit put overall GEO at 51/100, held down by brand authority.

---

## Critical Issues

None. No Tier 1 crawler is blocked.

## Fixed during this analysis

**Named AI crawlers were allowed into the app and API paths.** The file listed each AI crawler in its own group with only `Allow: /`. A crawler that finds a group with its own name ignores the `*` group, so the internal-path rules there (`/api/`, `/auth/`, `/manage/`, `/admin/`, `/dashboard/` and the rest) did not apply to GPTBot, ClaudeBot, PerplexityBot or the other thirteen. They are now one group that repeats the same exclusions, with `/api/r2/` (salon photos) still allowed. Public pages are unaffected. Source: `artifacts/booking/public/robots.txt`.

## Recommendations

### Immediate Actions

Nothing is required for access.

### Worth doing

1. **Declare AI usage preferences** with a `Content-Signal:` line (see below). This is a decision about whether Certxa's content may be used to train models, so it has not been added.
2. **`/.well-known/ai-plugin.json` answers 200 with an HTML page** (3 KB app shell) where it should be a 404. No crawler is harmed by it; it is an untidy soft-404.
3. **`Disallow: /products/`** is left over from an old app path. The new Hardware page is `/products` with no trailing slash and is not blocked, but anything later placed under `/products/…` would be.
4. **Bytespider** is only kept out of `/listings/`. Block it fully (`Disallow: /`) if there is no interest in ByteDance's products.

### robots.txt Recommendation

The live file already matches the recommended configuration. The AI section now reads:

```
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-Web
User-agent: anthropic-ai
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: Amazonbot
User-agent: CCBot
User-agent: Cohere-ai
User-agent: FacebookBot
User-agent: GoogleOther
Allow: /
Allow: /api/r2/
Disallow: /api/
Disallow: /auth/
Disallow: /manage/
... (the same internal paths as the * group)
```

### Additional Technical Findings

- **Meta Robots Tags:** none restrictive on the ten pages sampled. The blog sets `index, follow` with large-preview permissions; the new marketing pages set no robots tag, which means index and follow. No `noai` or `noimageai` anywhere.
- **X-Robots-Tag Headers:** none on any sampled page.
- **Crawler parity:** all ten pages returned 200 to a GPTBot user agent.
- **JavaScript Rendering:** not required. Every sampled page carries its text in the raw HTML, including the pages now served by the new marketing app:

  | Page | Words in raw HTML |
  |---|---|
  | `/` | 728 |
  | `/pricing` | 737 |
  | `/features` | 1,558 |
  | `/booking` | 536 |
  | `/autumn` | 1,424 |
  | `/products` | 752 |
  | `/compare/certxa-vs-vagaro` | 583 |
  | `/about` | 455 |
  | `/contact` | 169 |
  | `/blog` | 723 |

- **llms.txt:** present (5 KB), links current. `llms-full.txt` (150 KB) still holds the text of the old PHP pages and needs regenerating.
- **ai.txt:** absent (404). Optional; no major crawler requires it.
- **Sitemap Accessibility:** `Sitemap:` is declared in robots.txt; `/sitemap.xml` and `/sitemap-pages.xml` answer 200 with XML.
- **Crawl-delay:** none set.

### Content Signals (IETF Draft)

**Status:** Absent

**Recommendation:** Add a `Content-Signal:` directive to robots.txt to declare AI usage preferences explicitly. Example:

`Content-Signal: ai-train=no, search=yes, ai-retrieval=yes`

That example allows AI search and retrieval while opting out of model training. For a site whose problem is that AI systems don't know it exists, allowing training as well (`ai-train=yes`) is the choice that maximises exposure. See https://contentsignals.org/ for the full specification.

---

**Method:** robots.txt, six AI and sitemap files and ten pages were fetched on 2026-10-13, pages with a GPTBot user agent, one second apart. Whether each crawler actually visits was not checked; that needs the server's access logs.

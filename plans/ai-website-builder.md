# AI Website Builder — plan (owner, 2026-11-09)

> **Removed 2026-11-11 (owner):** the AI Website Builder was taken out of the Certxa Pro app, the salon dashboard,
> the public websites and the server; websites are the regular designs again (Pick a design). Kept here as history.
> Its database tables (ai_site_*) and locations.ai_site_live_version_id were left in place, unused.

**Goal.** Every Certxa account (Certxa Pro *and* salons) can have Claude design a complete booking website for them:
it learns the business, sketches **6 ideas**, the owner marks each **Love it / Not this**, and Claude builds the full site
from the ideas they loved. Afterwards they change it by chatting ("make the header pink"), every change is a saved
version, and nothing is public until they tap **Put it online**. Inspired by InPops' builder; our own design and words.

**Decisions (owner, 2026-11-09)**
- For Certxa Pro and Certxa salons.
- **Building blocks** (my recommendation, accepted): Claude chooses, orders, styles and writes the sections; our own
  code draws them. Booking is always Certxa's real booking flow, never AI-written.
- **Credits**: every account gets **200 free AI credits**; each AI step costs credits.
- **Sources**: Certxa's own data first; when it isn't enough for a good site, fill gaps from the linked Google Business
  Profile and other public sources (Google, Yelp, Nextdoor, the old website), including what reviews say.

---

## How it works (owner's view)

1. **"Here's your business as I know it."** A short summary card built from everything we found, plus 1–3 quick
   questions only where something important is missing or unclear ("Which number should clients call?", "Your prices
   aren't set — use the ones from your old site?").
2. **6 ideas at once.** Six small, phone-shaped mockups, each a different angle (the signature service, the price list,
   the location people know, what reviews praise, walk-ins, the pro themselves…). Under each: **Not this / Love it**, an
   optional note, and chips: *Colours · Letters · Layout · Words*. **More ideas** makes 6 new ones using the feedback.
3. **Build my site.** Progress shown step by step (Reading the ideas you loved → Writing your home page → Choosing your
   colours and letters → Making your Menu and Book pages → Checking it on a phone and a computer).
4. **Preview.** Pages Home / Menu / Book (+ About when there's enough), phone and computer view, full screen.
5. **Describe a change…** chat box. Each change is a new version; **Versions** list with "Restore"; undo.
6. **Put it online** → becomes the live site at `<slug>.certxa.com`.

---

## Stages

### Stage 0 — Foundations
- Anthropic API key in `/etc/certxa.env` (`ANTHROPIC_API_KEY`) — **owner to create** in the Anthropic Console.
- `@anthropic-ai/sdk` in api-server. Model `claude-opus-5-5`, adaptive thinking, effort set per step, streaming for long
  steps, server-side refusal fallback on. Prompt caching on the fixed instructions + block catalogue.
- **AI credits ledger** (new table `ai_credit_ledger`: store, change, reason, step, run id, balance after) — 200 granted
  once per account on first open; every charge is atomic and idempotent (same pattern as SMS credits). Separate from
  text-message credits.
- Credit prices (adjustable in /isAdmin): business summary 0 · 6 ideas 10 · more ideas 10 · build site 15 · each chat
  change 2 · (owner: packs to buy more — later stage). Real AI cost ≈ $0.02–0.04 per credit.
- Usage log per run (tokens in/out, cache reads, cost) for isAdmin.

### Stage 1 — Learn the business ("Here's X as I know it")
Fact sheet assembled server-side, each fact tagged with its source:
- **Certxa** (always first): name, type, services + prices + durations, add-ons, hours, phone, address (city only when
  private), house calls, About text, portfolio photos, Certxa reviews, booking link, policies.
- **Enough-check**: services with real prices, hours, a phone or booking path, location/area, ≥1 photo. If a gap remains:
- **Google Business Profile** (linked accounts, existing OAuth in `google-business-api.ts`): description, categories,
  hours, phone, website, photos, reviews.
- **Google Places API** (public listing, by name + address): hours, phone, website, rating, recent reviews. Needs Places
  API enabled on a Google key — **owner/admin step**.
- **Yelp Fusion API**: business details, rating, review excerpts. Needs a Yelp API key — **owner step**. Yelp's terms:
  shown with attribution, not stored longer than allowed → used only as "insight", never copied onto the site.
- **Old website + other public pages (Nextdoor recommendations etc.)**: Claude's web search / web fetch tools, limited
  to the business's own pages and listing sites. Nextdoor has no API; only what's publicly visible.
- **Reviews → insight only**: Claude turns reviews into themes ("friendly staff", "great prices", "ask for Tom"). The
  site may say *what people praise*; it quotes word-for-word only Certxa's own reviews (Solo rule: never Google reviews).
- **Truth rules**: prices only from the Certxa catalogue or confirmed by the owner (else "Ask"); phone, address and
  hours only from Certxa or the owner's own Google profile; nothing invented. Questions go to the owner instead.

### Stage 2 — 6 ideas, Love it / Not this
- One Claude call (structured output) → 6 **idea specs**: angle, headline, short supporting line, which facts it
  features, colour palette, letter style (from our vetted font list), layout family, sample section.
- `IdeaCard` renders each spec as a phone-shaped mini page (same block code as the real site, scaled down).
- Feedback saved per idea (love / not / note / chips). **More ideas** → 6 new ones conditioned on feedback.

### Stage 3 — Build the site
- One Claude run (streaming, tool use with strict schemas) → a **site spec**: theme tokens (colours, fonts, corner
  radius, image treatment), pages, and for each page an ordered list of blocks from the **block catalogue** with their
  words and settings. Validated with zod; anything invalid is rejected and re-asked, never shown.
- **Block catalogue** (v1, ~15 blocks, each with 2–4 variants): big name hero · open-now / hours strip · price list ·
  signature service · featured person ("Ask for Tom") · what people say (themes / Certxa reviews) · gallery ·
  location & map · house-call area · policies · about · gift cards / packages · FAQ · call / book bar · footer.
- Booking: every Book button opens Certxa's real flow (Solo booking panel for Pro, salon flow for salons), with house
  calls, deposits, Padded time, approval, personal links.
- New public theme `ai` in the booking app (`public-booking/AiSiteTheme.tsx`) renders the spec; SEO/JSON-LD,
  llms.txt, share card keep working (salonSeo).

### Stage 4 — Preview, versions, Put it online
- Tables `ai_sites` (store, status) and `ai_site_versions` (spec, made by: build / change / restore, note, credits).
- Draft preview at a private link; phone/computer toggle; full screen.
- **Put it online** switches the store's site to theme `ai` + that version. The old design stays one tap away.

### Stage 5 — Change by chat
- "Describe a change…" → Claude edits the spec with small tools (set text, restyle theme, add/remove/move block,
  swap variant), strict schemas, then a check pass. 2 credits. New version each time; undo/restore.

### Stage 6 — Where it lives
- **Certxa Pro app**: Settings › Website › *Design my site with AI* (ideas, preview, chat, versions, Put it online).
- **Salon dashboard**: Settings › Website (same screens, web).
- **/isAdmin**: credit grants, credit prices, usage and cost per account.

---

## Progress
- **2026-11-09 — Stages 0–2 LIVE (development on OpenRouter):** provider switch `lib/aiProvider.ts` (OpenRouter free model
  `nvidia/nemotron-3.5-super-vl:free` now; Claude `claude-opus-5-5` automatically once `ANTHROPIC_API_KEY` is set),
  credits `lib/aiCredits.ts` (200 free, idempotent charge, refund on failure), facts `lib/aiSiteFacts.ts`, ideas
  `lib/aiSiteIdeas.ts`, API `routes/aiSite.ts` (migration 0331). Pro app: Settings › Website › Design my website with AI
  (`app/website-designer.tsx`, build label Nov 9 · M). A free-model round of 6 ideas takes ~75 s.
- **2026-11-09 — Stage 3 LIVE:** AI steps are background jobs (`lib/aiSiteJobs.ts`, migration 0332; nginx cuts /api at
  60 s) polled from the app; `lib/aiSiteBuild.ts` writes the site spec (block catalogue, `tidy()` drops blocks the facts
  can't support); versions in `ai_site_versions`; booking app `public-booking/AiSiteTheme.tsx` draws it with live
  Certxa facts, Book = the store's normal design in the site's accent; private preview `<slug>.certxa.com/?aiPreview=<token>`.
  App: Build my site (15 credits) + Preview my site (build label Nov 9 · N). Free model: build ≈ 55–65 s.
- **2026-11-09 — Stage 4 LIVE:** `locations.ai_site_live_version_id` (migration 0333); routes versions / publish /
  unpublish; public store JSON `aiSiteLive` → PublicBooking renders the live AI site (no token) via AiSitePreview;
  `?previewTheme=` still shows regular designs. App: Put it online (confirm), Versions (Preview / Put online), Use my
  old design (build label Nov 9 · O). Tested on tobys: online ↔ old design both ways; left on the old design.
- **2026-11-09 — Stage 5 LIVE:** change by chat (`lib/aiSiteChange.ts`, 2 credits, refunded when nothing changed;
  price/hours/phone requests point to Settings); messages in `ai_site_messages` (migration 0334); app composer
  "Describe a change" (build label Nov 9 · P).
- **2026-11-09 — Foundation LIVE (owner):** AI sites now run on a copy of the Solo template,
  `public-booking/AiFoundationTheme.tsx` (loaded by `AiSite.tsx`), so they are wired to Certxa: real services, booking,
  shop, messages, reviews, legal, personal links. The AI controls colours (CSS vars `--ai-*`), fonts and the blocks on
  the About tab (opens first); Services/booking is Solo's own flow. Solo changes do NOT reach the copy automatically.
  Home price list capped at 8 unless the design says. `AiSiteTheme.tsx` keeps the block renderer (`AiBlocks`);
  its standalone page is no longer used.
- **2026-11-09 — Research LIVE ("Look me up online", 5 credits):** `lib/aiSiteResearch.ts` + migration 0335
  (`ai_site_research`: found + answers). Google Places (GOOGLE_MAPS_API_KEY) listing + nearby salons, old website read
  directly (public addresses only, own Certxa site skipped), web search via Claude `web_search`/`web_fetch`
  (`researchWeb` in aiProvider; skipped on OpenRouter). A Google result is used only if name, street or phone matches
  (`sameBusiness`; 11-09 it first picked Bonnie Brae Nails for Nails By Toby). Phone/name/address/hours conflicts are
  computed by code; AI adds ≤3 fact questions. A picked phone is saved to `locations.phone`; answers + cards feed the
  ideas and build prompts. App: What I found cards + "I need you for a moment" questions (build label Nov 9 · Q).
- **2026-11-10 — Salon screen LIVE:** `artifacts/booking/src/pages/WebsiteDesigner.tsx` at `/website-designer`
  (owner only), same API with `?storeId=` from the store switcher; opened from Settings › Online Booking (desktop
  card + mobile "Website" row). Idea mockups load the real Google fonts (`useFontFamilies` in AiSiteTheme.tsx).
  Committed 995a7c09 (server + site) and the salon screen after it.
- Next: Anthropic switch-on test + cost per account, "Add anything" uploads, Anthropic fallbacks param.

## Needs from the owner
1. Anthropic API key (Console → API keys) for `/etc/certxa.env`.
2. Yelp Fusion API key (free) — optional; without it we skip Yelp.
3. Google Places API enabled on a Google Cloud key — optional; GBP-linked accounts work without it.
4. Later: prices for credit packs.

## Build order
Stage 0 → 1 → 2 (first visible result: summary + 6 ideas) → 3 → 4 → 5 → 6. Pro app and salon web screens are built
alongside each stage so both can be tried at every step.

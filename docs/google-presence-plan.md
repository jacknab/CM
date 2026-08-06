# "Get Found on Google" — Redesigned GBP Experience

> Plan authored: 2026-07-12  
> Screenshot reference: attached_assets/image_1783827606627.png (service sync INVALID_ARGUMENT error)

---

## The Core Idea

Most salon software asks owners to "Connect your Google Business Profile." Owners don't know what that is. They skip it. Later never comes.

Certxa should sell the **benefit**, not the technology.

Instead of: *Connect Google Business Profile*  
Say: **Get Found on Google**  
*"We'll help customers find your salon on Google and let them book appointments directly from your Google listing."*

---

## What Exists Today

- `/google-business` page with 4 tabs: Connection, Reviews, Services, Hours
- `GoogleBusinessProfileSetup` component — jumps straight to OAuth, then pick from existing GBP accounts
- Steps: `initial → loading → select-account → select-location → syncing → success → connected`
- No Places API search, no claim guidance, no verification tracking, no dashboard widget
- GBP is **not** in the onboarding flow (currently 7 steps) — it's a separate page
- Backend has: GBP OAuth, reviews sync, hours sync, services sync

---

## The 6 Pieces of Work

---

### 1 · Rename the Entry Point + Add to Onboarding

**What changes:**
- Add new **Step 8** to the onboarding flow (currently 7 steps)
- Headline: *"Get Found on Google"*
- Subtext: *"We'll help customers find your salon on Google and let them book directly from your listing"*
- Two buttons: **✦ Yes, Let's Do It (Recommended)** and **I'll Do This Later** (sets `google_setup_skipped = true`)
- Rename `/google-business` page header: *"Google Business Profile"* → *"Google Presence"*
- Sidebar nav label: *"Google Business"* → *"Google Presence"*

**Files:** `Onboarding.tsx`, `GoogleBusiness.tsx`, sidebar nav

---

### 2 · Pre-Search Flow (Before OAuth)

Instead of jumping straight to OAuth, owner first describes their salon so Certxa can find it on Google.

**New step sequence inside `GoogleBusinessProfileSetup`:**
```
search-form → searching → found / not-found → confirm-match → [existing OAuth flow]
```

**`search-form` step:**
- Three fields pre-filled from store data (name, address, phone) — owner reviews and hits **Search Google**
- *"We already have your salon info from setup — just confirm it's correct"*

**`found` step — card design:**
```
★★★★☆  Lavender Nails
        123 Main Street, Denver CO
        92 Google Reviews
        [This Is My Salon]   [That's Not Me →]
```
- **This Is My Salon** → proceeds to OAuth
- **That's Not Me** → cycles through other results or falls to `not-found`

**`not-found` step:**
```
We couldn't find your salon on Google.
Let's create one together.
[Create My Google Listing]   [I'll Do This Later]
```
"Create My Google Listing" links to Google Business creation.

**Backend:** New endpoint `GET /api/google-business/search?name=&address=&phone=`  
Calls Google Places Text Search API → returns `{ found, place: { name, address, rating, userRatingsTotal, placeId } }`

---

### 3 · Claim & Verification Guidance

When OAuth returns an **unverified** location (`metadata.isVerified === false`), instead of silent pass-through:

**`needs-verification` step:**
```
Your salon is already on Google!

Customers can already find your salon.
The only thing left is proving you're the owner.
This usually takes just a few minutes.

[Start Verification →]
```

**`verification-steps` step — Certxa becomes the guide:**
```
Step 1 — Click Continue
Step 2 — Sign into Google
Step 3 — Google may ask to verify ownership
Step 4 — We'll bring you right back
```

**"Why do I need this?"** expandable answer (static copy):
> *"When someone searches 'nail salon near me,' Google decides which salons to show. Verifying your business lets customers call you, get directions, leave reviews, and book appointments through Certxa."*

**`postcard-pending` step:**
```
📬 Verification In Progress
Google is mailing a verification code to: 123 Main Street, Denver CO
Estimated arrival: 5–7 days
We'll remind you when it's time to finish.
[Enter Code When It Arrives]
```

**Backend changes:**
- New columns on `google_business_profiles`:
  - `verification_status` (enum: `verified | pending_postcard | pending_phone | needs_verification`)
  - `postcard_sent_at` (timestamp)
  - `postcard_address` (text)
- New migration for these columns
- Scheduler: 5 days after `postcard_sent_at`, sends an email reminder:  
  *"Your Google verification code should be arriving soon!"*

---

### 4 · Celebration / Completion Screen

Replaces the current plain `success` step:

```
🎉 Your salon is now verified on Google!

✓ Adding your booking link        ← animated in sequence (600ms stagger)
✓ Syncing your services
✓ Importing your reviews
✓ Syncing your business hours

Estimated time: 30 seconds
```

Each checkmark: spinner → green checkmark as API calls resolve.  
Sync jobs are already built — this screen shows them happening sequentially.

---

### 5 · Dashboard Status Widget

Small card on the main dashboard (and inside `/google-business` page header) tracking incomplete setup:

| State | Widget shows |
|---|---|
| Never started | *"⚡ Get found on Google — set up your Google listing"* + CTA button |
| Postcard pending | *"Google Setup · Step 3 of 4 · Waiting for verification code · ~3 days remaining"* + progress bar |
| Connected, not synced | *"Google connected — services and hours not yet synced"* + quick-action links |
| Fully set up | No widget (subtle green badge on sidebar nav item) |

Days remaining calculated from `postcard_sent_at + 7 days`.

---

### 6 · Post-Connection Auto-Sync on Verification

When verification completes, automatically fire all four sync jobs in sequence:
1. Add booking URL to GBP listing
2. Push services to GBP
3. Sync business hours to GBP
4. Import Google reviews

Existing endpoints already handle each — new part is chaining them automatically on verification complete.

---

## Build Order (Dependencies)

```
1. Backend: Places search endpoint + verification_status columns (migration)
2. Backend: Postcard reminder scheduler
3. Frontend: search-form → found/not-found steps          (needs #1)
4. Frontend: claim/verification guidance steps            (needs #1)
5. Frontend: postcard-pending step                        (needs #1 + #2)
6. Frontend: Celebration screen                           (independent)
7. Frontend: Onboarding Step 8                            (independent)
8. Frontend: Dashboard status widget                      (needs #1)
9. Frontend: Auto-sync chain on verification complete     (needs #1)
```

---

## What Does NOT Change

- OAuth callback URL and token storage
- Reviews, Services, and Hours tabs on `/google-business` (manual control stays)
- Existing connected stores — the `connected` step still shows for already-linked stores

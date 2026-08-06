# Certxa Conversational Onboarding — Implementation Plan

## Status: Ready for development
## Audit completed: 2026-07-28

---

## 1. Existing Onboarding Architecture (Audit Summary)

### 1a. Initial Setup Wizard — `Onboarding.tsx` (1,809 lines)

A 5-step full-page form wizard triggered immediately after user signup.

| Step | Title | Fields / Actions |
|------|-------|-----------------|
| 1 | Find your salon | Google Places search OR manual: name, address, city, state, zip, phone, timezone |
| 2 | Review details & hours | Edit all fields from step 1 + 7-day business hours (open/close per day) |
| 3 | Booking link | Choose `bookingSlug` → **fires `POST /api/onboarding`** → creates store record, seeds default services, sets `users.onboarding_completed = true` |
| 4 | Connect Google | Optional Google Business Profile OAuth (skippable) |
| 5 | You're ready | Success screen → redirects to `/` |

### 1b. Post-Signup Setup Hub — `SetupHub.tsx` + `OnboardingChecklist.tsx`

A Stripe-style checklist of 9 flows, each a separate page under `/setup/*`.

| # | Route | Flow key | Category | Sub-steps |
|---|-------|----------|----------|-----------|
| 1 | — | `business_setup` | Required | Completed by wizard above |
| 2 | `/setup/services` | `services_menu` | Required | Create category → add services → assign staff |
| 3 | `/setup/team` | `team_members` | Recommended | Add member → set hours → assign services |
| 4 | `/setup/booking` | `booking_calendar` | Recommended | Slot interval/buffer → online booking/advance window → cancellation/deposit |
| 5 | `/setup/website` | `website_setup` | Recommended | Claim `*.certxa.com` subdomain |
| 6 | `/setup/pos` | `pos_payments` | Recommended | Connect Stripe, tax rate, tips |
| 7 | `/setup/payroll` | `commission_payroll` | Optional | Pay structure, deductions |
| 8 | `/setup/marketing` | `marketing_growth` | Optional | Google, reminders, reviews |
| 9 | `/setup/ai-receptionist` | `ai_receptionist` | Optional | AI phone agent |

### 1c. API Endpoints (existing — must not be replaced)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/onboarding` | Create store, seed services, set `onboarding_completed = true` |
| `GET` | `/api/setup/progress` | All 9 flow statuses for current store |
| `PATCH` | `/api/setup/progress/:flowKey` | Mark a flow complete |
| `POST` | `/api/setup/website-launch` | Claim subdomain, publish Bloom template |
| `GET` | `/api/google-business/search` | Google Places search |
| `GET` | `/api/google-business/check-slug` | Slug availability check |
| `POST` | `/api/staff` | Create staff member |
| `POST` | `/api/staff/:id/hours` | Save staff working hours |
| `POST` | `/api/calendar-settings` | Save booking calendar config |
| `POST` | `/api/setup/dismiss` | Dismiss checklist |

### 1d. Database Tables Involved

| Table | Purpose |
|-------|---------|
| `users` | `onboarding_completed` boolean gates main app access |
| `onboarding_progress` | `(store_id, flow_key, status, completed_at)` per-flow tracking |
| `locations` | All salon data (name, address, booking_slug, hours, timezone) |
| `services` / `service_categories` | Seeded at onboarding, extended in ServicesFlow |
| `staff` | Created in TeamFlow or at onboarding |
| `calendar_settings` | Set in BookingCalendarFlow |

### 1e. Validation Rules (`POST /api/onboarding` Zod schema)

- `businessType`: enum (Hair Salon, Nail Salon, Spa, Barbershop, Esthetician, Pet Groomer, Tattoo Studio, Other)
- `businessName`: 1–100 chars, required
- `phone`: 10 digits (no formatting), optional
- `state`: US state code (2 letters), optional
- `postcode`: exactly 5 digits, optional
- `address`: alphanumeric + `,#-/.` (no SQL chars), optional
- `bookingSlug`: 3–50 chars, lowercase alphanumeric + hyphens, required
- `businessHours`: array of 7 `{dayOfWeek, openTime, closeTime, isClosed}`, optional
- `staff`: `[{name, color}]`, optional

---

## 2. What Is Being Built

A **chat-style onboarding shell** that presents the same required fields as the existing wizard through a conversational interface — one question at a time, with inline input widgets (buttons, pickers, toggles), automatic progress saving, and a final review screen before submission.

**This is NOT an AI chatbot.** The conversation is fully scripted and deterministic. No OpenAI calls in the initial implementation. The architecture has clear extension points where AI can be added later.

### Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Temporary state storage | `localStorage` (`certxa_ob_<userId>`) | No server roundtrip needed; cross-device resume is a future enhancement |
| When to create the store | Only at the final "Complete Setup" click | Matches spec: "do not create permanent records until completed" |
| Feature flag | `VITE_AI_ONBOARDING` env var | Defaults to `false`; existing wizard stays on by default |
| Hours natural language | Rule-based regex parser | No API key required; handles the common "Mon–Sat 9am–6pm" pattern |
| Services upload | File picker UI stub | No backend processing yet; hook is present for future AI extraction |
| Team members | Collect in session, POST to `/api/staff` after store is created | Staff require a `storeId` foreign key |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────┐
│  OnboardingChat.tsx  (mobile-first chat shell)  │
│                                                 │
│  • Renders message bubbles (AI + user)          │
│  • Shows inline input widgets per step          │
│  • Progress bar at top                          │
│  • Back / edit previous answers                 │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  useOnboardingSession()  (state manager hook)   │
│                                                 │
│  • Holds all collected answers in React state   │
│  • Persists to localStorage on every change     │
│  • Restores from localStorage on mount          │
│  • Exposes: currentStep, answers, goTo,         │
│             setAnswer, reset, submit            │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  onboarding-script.ts  (conversation definition)│
│                                                 │
│  • Array of Step objects                        │
│  • Each step: id, message, inputType,           │
│    options, validation, apiFlowKey              │
└────────────────────┬────────────────────────────┘
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
  /api/onboarding  /api/staff  /api/calendar-settings
  (existing)       (existing)  (existing)
       │
       ▼
  Database (unchanged schema)
```

---

## 4. New Files

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `artifacts/booking/src/pages/OnboardingChat.tsx` | ~500 | Main chat UI shell |
| `artifacts/booking/src/hooks/use-onboarding-session.ts` | ~180 | State manager + localStorage persistence |
| `artifacts/booking/src/lib/onboarding-script.ts` | ~200 | Conversation script — all steps defined here |
| `artifacts/booking/src/lib/hours-parser.ts` | ~100 | Natural language → structured hours converter |

### Modified Files

| File | Change |
|------|--------|
| `artifacts/booking/src/App.tsx` | ~10 lines: read `VITE_AI_ONBOARDING` flag, route `/onboarding` to `OnboardingChat` when true |

**No new DB tables.** No migrations required. No new API routes.

---

## 5. Conversation Script (All Steps)

The script is defined as a typed array in `onboarding-script.ts`. Each step produces one AI message bubble and one input widget.

### Phase A — Business Info  *(maps to wizard Steps 1–2)*

| # | Step ID | AI message | Input widget | Validation | Maps to |
|---|---------|-----------|-------------|------------|---------|
| 1 | `business_type` | "Welcome to Certxa! Let's get your business set up. What type of business do you run?" | Button chips (Hair Salon, Nail Salon, Spa, Barbershop, Esthetician, Pet Groomer, Tattoo Studio, Other) | Required | `businessType` |
| 2 | `salon_name` | "Great! What's the name of your [businessType]?" | Large text input, placeholder "Bella Nails" | 1–100 chars | `businessName` |
| 3 | `address` | "What's your street address?" | Text input + optional Google Places autocomplete chip | Optional | `address` |
| 4 | `city_state` | "Which city and state are you in?" | City text + State dropdown | State must be valid US code | `city`, `state` |
| 5 | `postcode` | "And your zip code?" | Numeric input, max 5 digits | 5 digits or skip | `postcode` |
| 6 | `phone` | "What's your business phone number?" | Phone-masked input (auto-formats to (555) 555-5555) | 10 digits or skip | `phone` |
| 7 | `timezone` | "One more thing — we detected you're in [detected tz]. Is that right?" | Confirm button + "Change" → timezone dropdown | Required | `timezone` |
| 8 | `hours` | "What are your business hours? You can type them naturally or set them day by day." | Text input ("Mon–Sat 9am–6pm") + **[Set day by day]** fallback toggle → 7-row day picker | Parser or manual fallback | `businessHours` |
| 9 | `booking_slug` | "Almost there! Choose a booking link for your salon. We suggest: [auto-slug]" | Slug text input + live availability indicator | 3–50 chars, slug format, available | `bookingSlug` |

### Phase B — Services  *(maps to `services_menu` flow)*

| # | Step ID | AI message | Input widget |
|---|---------|-----------|-------------|
| 10 | `services_intro` | "Your salon is set up! Now let's add your services so clients know what you offer." | — (display only, auto-advance) |
| 11 | `services_method` | "How would you like to add your services?" | Buttons: **[Upload Menu]** / **[Add Manually]** / **[Skip for Now]** |
| 11a | `services_upload` *(if Upload)* | "Upload your service menu — a photo, PDF, or image works great." | File picker (accepts PDF, JPG, PNG) → stores file reference; shows "Uploaded! We'll process this." placeholder |
| 11b | `services_manual` *(if Manual)* | "Let's add your first service category. What would you call it?" | Text input → loops through category name → service name/price/duration until "Done adding" |

### Phase C — Team Members  *(maps to `team_members` flow)*

| # | Step ID | AI message | Input widget |
|---|---------|-----------|-------------|
| 12 | `team_intro` | "Great! Do you have a team working with you, or is it just you for now?" | Buttons: **[I have a team]** / **[Just me]** / **[Skip for now]** |
| 13 | `team_member_name` *(if has team)* | "What's the first team member's name?" | First name + Last name inputs |
| 14 | `team_member_email` | "What's [name]'s email address? We'll send them an invite." | Email input |
| 15 | `team_member_role` | "What is [name]'s role?" | Buttons: Nail Technician / Esthetician / Hair Stylist / Manager / Other |
| 16 | `team_member_hours` | "What days does [name] work?" | Day-of-week toggle buttons + time range per active day |
| 17 | `team_add_more` | "[name] is ready! Would you like to add another team member?" | Buttons: **[Add Another]** / **[I'm done]** |

### Phase D — Booking Settings  *(maps to `booking_calendar` flow)*

| # | Step ID | AI message | Input widget |
|---|---------|-----------|-------------|
| 18 | `slot_interval` | "How long should appointment slots be? This sets how your calendar divides time." | Buttons: 15 min / 30 min / 45 min / 60 min |
| 19 | `buffer_time` | "Do you want a buffer between appointments to clean up or prepare?" | Buttons: None / 5 min / 10 min / 15 min |
| 20 | `online_booking` | "Do you want clients to book appointments online?" | Toggle: Yes / No |
| 21 | `advance_window` | "How far in advance can clients book?" | Buttons: 1 week / 2 weeks / 1 month / 3 months |
| 22 | `cancellation_policy` | "What's your cancellation policy?" | Buttons: No cancellations / 24-hour notice / 48-hour notice |
| 23 | `deposit` | "Do you require a deposit to hold appointments?" | Toggle: Yes / No → if Yes: % slider (10–50%) |

### Phase E — Final Review + Submit

| # | Step ID | AI message | Input widget |
|---|---------|-----------|-------------|
| 24 | `review` | "You're all set! Here's a summary of what you've told me." | Review card showing all collected data with **[Edit]** links per section |
| 25 | `submit` | *(shown after review card)* | **[Complete Setup]** primary button + **[Review Changes]** secondary |

**Total steps: 25 (some conditional)**. With skipped optional steps, a minimal flow takes ~10 steps.

---

## 6. State Manager Design (`use-onboarding-session.ts`)

```typescript
// Shape of the persisted session
interface OnboardingSession {
  userId: string;
  version: 1;                    // bump if script changes break old sessions
  currentStepId: string;
  completedStepIds: string[];
  answers: {
    businessType?: string;
    businessName?: string;
    address?: string;
    city?: string;
    state?: string;
    postcode?: string;
    phone?: string;
    timezone?: string;
    businessHours?: DayHours[];
    bookingSlug?: string;
    servicesMethod?: "upload" | "manual" | "skip";
    servicesUploadRef?: string;   // filename, not processed yet
    services?: ServiceDraft[];
    teamMembers?: TeamMemberDraft[];
    teamSize?: "myself" | "team";
    slotInterval?: number;
    bufferTime?: number;
    onlineBooking?: boolean;
    maxAdvanceDays?: number;
    cancellationPolicy?: string;
    depositRequired?: boolean;
    depositPct?: number;
  };
  savedAt: string;               // ISO timestamp
}

// Hook interface
function useOnboardingSession(userId: string): {
  session: OnboardingSession;
  currentStep: StepDefinition;
  progressPct: number;           // 0–100
  setAnswer: (key: keyof Answers, value: unknown) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (id: string) => void;
  submit: () => Promise<void>;   // calls existing APIs
  reset: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}
```

**Persistence:** `localStorage.setItem('certxa_ob_' + userId, JSON.stringify(session))` called inside a `useEffect` on every state change. On mount, reads and restores — user resumes exactly where they left off.

---

## 7. Hours Natural Language Parser (`hours-parser.ts`)

Handles the most common patterns without AI:

```
"Monday through Saturday 9am to 6pm"
  → Mon–Sat: open 09:00–18:00, Sun: closed

"Mon-Fri 10-8, Sat 10-6, Sun closed"
  → Mon–Fri: 10:00–20:00, Sat: 10:00–18:00, Sun: closed

"We're open daily 9am to 7pm"
  → All 7 days: 09:00–19:00

"Closed Sundays and Mondays, Tue-Sat 9-6"
  → Tue–Sat: 09:00–18:00, Sun+Mon: closed
```

**Fallback:** if the input doesn't match any pattern, the chat shows the day-by-day picker widget automatically with the message "Let me help you set those individually."

**Future AI extension point:** `hours-parser.ts` exports a `parseHours(text: string): ParseResult` function. The implementation can be swapped for an OpenAI call without changing any of the chat UI code.

---

## 8. Feature Flag

Environment variable: `VITE_AI_ONBOARDING`

```typescript
// App.tsx — ~10 line change
const useConversationalOnboarding = import.meta.env.VITE_AI_ONBOARDING === "true";

// In the router:
<Route
  path="/onboarding"
  element={useConversationalOnboarding ? <OnboardingChat /> : <Onboarding />}
/>
```

- **Default (`false`):** existing `Onboarding.tsx` wizard unchanged, no users affected
- **`true`:** new `OnboardingChat.tsx` served to new users

To test the new flow during development without touching the env var, append `?mode=chat` to the URL — the chat component checks `useSearchParams()` for this override.

---

## 9. Submission Flow

When the owner taps **[Complete Setup]**:

```
1. Client-side: validate all required fields (businessName, bookingSlug, timezone)
   → show inline error in review card if missing

2. POST /api/onboarding  {
     businessType, businessName, phone, address, city, state,
     postcode, timezone, businessHours, bookingSlug,
     staff: teamMembers.map(m => ({ name: m.firstName + ' ' + m.lastName, color: randomColor }))
   }
   → creates store, seeds services, sets onboarding_completed = true
   → returns { storeId }

3. If teamMembers.length > 0:
   POST /api/staff (once per member)  { firstName, lastName, email, role }
   POST /api/staff/:id/hours          { hours }

4. POST /api/calendar-settings  {
     slotInterval, bufferTime, allowOnlineBooking,
     maxAdvanceDays, cancellationPolicy, depositRequired, depositPct
   }

5. PATCH /api/setup/progress/business_setup   { status: "complete" }
6. PATCH /api/setup/progress/team_members     { status: "complete" }  (if team added)
7. PATCH /api/setup/progress/booking_calendar { status: "complete" }  (if booking configured)

8. Clear localStorage session

9. navigate("/")  → dashboard
```

**Error handling:** if any API call fails, show the error inline in the chat with a "Try again" button. The session is preserved so no data is lost.

**Duplicate submission guard:** once `POST /api/onboarding` succeeds, the `storeId` is stored in session state. Re-submission is blocked — the existing API already handles partial onboarding recovery (`onboardingCompleted` guard on line 6109 of routes.ts).

---

## 10. UI Design Spec (Mobile-First)

```
┌─────────────────────────────┐
│  ✨ Certxa Setup             │ ← Header (sticky)
│  ██████████░░░░░  64%       │ ← Progress bar
├─────────────────────────────┤
│                             │
│  ┌──────────────────────┐   │
│  │ What type of business│   │ ← AI bubble (left-aligned)
│  │ do you run?          │   │
│  └──────────────────────┘   │
│                             │
│  ┌──────────────────────┐   │
│  │ 💅 Nail Salon  ✓     │   │ ← User answer bubble (right-aligned)
│  └──────────────────────┘   │
│                             │
│  ┌──────────────────────┐   │
│  │ Great! What's the    │   │ ← Next AI bubble
│  │ name of your         │   │
│  │ nail salon?          │   │
│  └──────────────────────┘   │
│                             │
├─────────────────────────────┤
│  ┌──────────────────────┐   │ ← Active input area (sticky bottom)
│  │  Bella Nails         │   │
│  └──────────────────────┘   │
│         [ Continue → ]      │
│  ← Back                     │
└─────────────────────────────┘
```

**Component rules:**
- Background: `#FAFAFA` (off-white)
- AI bubble: white card, left-aligned, max-width 85%, rounded-2xl
- User answer bubble: `#1A0333` (Certxa plum), white text, right-aligned
- Progress bar: `#C97B2B` (Certxa gold) on `#F3F4F6`
- Button chips: large (min 44px touch target), border `#1A0333`, selected = filled plum
- Input area: sticky to bottom, white bg, slight top shadow
- Transitions: new bubble slides in from bottom, 300ms ease-out
- Previous answers are visible in the chat history (scrollable), each with an [Edit] pen icon

---

## 11. Future AI Extension Points

These are **designed but not implemented**. Clear interfaces exist so AI can be plugged in without refactoring.

| Extension Point | Location | Future AI action |
|----------------|----------|-----------------|
| `parseHours(text)` | `lib/hours-parser.ts` | Swap regex for GPT-4o-mini structured output |
| `extractServices(file)` | `lib/service-extractor.ts` (stub) | GPT-4o vision PDF/image → service list |
| `suggestSlug(name)` | inline in script | GPT-4o-mini → creative slug suggestions |
| `validateAddress(text)` | inline in script | Maps Geocoding or AI address normalization |
| Chat message text | `onboarding-script.ts` `message` fields | Generate personalized messages per salon type |

Each extension point is a standalone function call. The chat UI and state manager don't need to change.

---

## 12. Testing Plan

| Scenario | How to test | Expected result |
|----------|------------|-----------------|
| New signup, full flow | Register → `?mode=chat` | All 25 steps complete, store created, redirect to `/` |
| Leave halfway, return | Complete 10 steps → close tab → reopen | Resumes at step 10 with all previous answers visible |
| Edit previous answer | Tap [Edit] on "Salon Name" in review | Returns to step 2, answer pre-filled, later steps preserved |
| Skip all optional steps | Hit [Skip for Now] on services, team, booking | Only `POST /api/onboarding` called, minimal store created |
| Duplicate submission | Double-tap [Complete Setup] | Second call blocked by `storeId` guard, no duplicate store |
| Slug already taken | Enter taken slug | Live indicator shows "Taken", Continue disabled |
| Invalid phone | Enter "123" | Inline error, Continue disabled |
| Hours natural language | Type "Mon-Sat 9am-7pm, closed Sunday" | 7-row preview updates correctly |
| Hours parse failure | Type gibberish | Fallback day-by-day picker appears |
| API submission failure | Simulate network error | Error shown in chat, session preserved, retry button |
| Mobile viewport | iPhone SE (375px) | No horizontal scroll, all touch targets ≥ 44px |
| Feature flag off | `VITE_AI_ONBOARDING=false` | Existing `Onboarding.tsx` renders, no change |

---

## 13. Rollout Plan

1. **Phase 1 (this build):** Feature flag off by default. New files added alongside existing wizard. Zero user impact.
2. **Phase 2 (testing):** Enable flag in dev with `?mode=chat` URL override. Internal testing.
3. **Phase 3 (opt-in):** Set `VITE_AI_ONBOARDING=true` in Replit env. All new signups get the conversational flow.
4. **Phase 4 (cleanup):** After 30 days with no issues, remove the old `Onboarding.tsx` and the feature flag.

---

## 14. Build Order

To keep the build reviewable and mergeable in pieces:

1. `hours-parser.ts` — pure utility, no dependencies, easy to unit-test
2. `onboarding-script.ts` — typed script definition, no UI
3. `use-onboarding-session.ts` — hook with localStorage, no rendering
4. `OnboardingChat.tsx` — UI shell wired to hook
5. App.tsx flag routing — one-line change
6. End-to-end test of the full submission flow
7. Documentation update

**Estimated scope:** ~980 lines of new code across 4 files + 10-line App.tsx change.

---

*Plan authored: 2026-07-28. Ready to begin implementation on approval.*

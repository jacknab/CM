/**
 * onboarding-script.ts — Conversational onboarding conversation definition
 *
 * Each StepDefinition describes one turn in the conversation:
 * - The AI message to display
 * - The input widget type
 * - Validation rules
 * - Navigation logic (next step, skip targets)
 *
 * AI extension point: the `message` field can be made dynamic (fn that receives
 * answers) to generate personalised text via GPT-4o-mini without changing the UI.
 */

export type InputType =
  | "chips"                // button chip grid
  | "text"                 // single-line text
  | "phone"                // phone-masked input
  | "address_places"       // address text-search → auto-fill business name from Places
  | "name_confirm"         // "Is your [type] '[name]'?" yes / no chips
  | "zip_lookup"           // zip code → auto-fill city + state
  | "postcode"             // 5-digit numeric (legacy)
  | "timezone"             // timezone confirm + optional change
  | "hours_natural"        // free-text + day-by-day fallback toggle
  | "hours_manual"         // 7-row day picker
  | "display_only"         // no input — auto-advances after delay
  | "services_method"      // upload / manual / skip
  | "file_upload"          // file picker
  | "services_manual"      // iterative service add loop
  | "team_size"            // I have a team / just me / skip
  | "staff_name"           // first + last name
  | "staff_email"          // email
  | "staff_role"           // role chips
  | "staff_hours"          // working days + time ranges
  | "team_add_more"        // add another / done
  | "slot_interval"        // 15/30/45/60 min chips
  | "buffer_time"          // none/5/10/15 min chips
  | "yes_no"               // yes / no toggle chips
  | "advance_window"       // 1wk/2wk/1mo/3mo chips
  | "cancellation"         // no cancellations / 24hr / 48hr chips
  | "deposit"              // yes/no + percent slider
  | "google_setup"         // post-creation Google discovery / ownership flow
  | "website_name"         // website subdomain slug input ([name].certxa.com)
  | "website_template_pick"// 2-card visual template selector (auto-advances)
  | "services_review"      // extracted-service review + edit before publish
  | "review";              // final review card

export interface ChipOption {
  value: string;
  label: string;
  emoji?: string;
}

export interface StepDefinition {
  id: string;
  /** Answer key this step writes to (may be undefined for display-only steps) */
  answerKey?: string;
  /** AI message — can be a static string or a function of current answers */
  message: string | ((answers: Partial<OnboardingAnswers>) => string);
  inputType: InputType;
  options?: ChipOption[];
  placeholder?: string;
  required?: boolean;
  /** Validation function — returns error string or null */
  validate?: (value: unknown, answers: Partial<OnboardingAnswers>) => string | null;
  /** Which step ID to go to next (defaults to next in array) */
  nextStep?: string | ((answers: Partial<OnboardingAnswers>) => string);
  /** If true, show a "Skip" link below the input */
  skippable?: boolean;
  /** Step ID to jump to when skipped */
  skipTo?: string;
  /** Phase label for the progress bar */
  phase?: string;
}

// ── Answer types ──────────────────────────────────────────────────────────────

export interface DayHoursAnswer {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface ServiceDraft {
  id: string;
  categoryName: string;
  name: string;
  price: string;
  duration: number; // minutes
}

export interface TeamMemberDraft {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  workDays: number[]; // 0=Sun
  workStart: string;  // "HH:MM"
  workEnd: string;    // "HH:MM"
}

export interface OnboardingAnswers {
  businessType: string;
  businessName: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  phone: string;
  timezone: string;
  businessHours: DayHoursAnswer[];
  bookingSlug: string;
  servicesMethod: "upload" | "manual" | "skip";
  servicesUploadRef: string;
  services: ServiceDraft[];
  teamSize: "team" | "solo" | "skip";
  teamMembers: TeamMemberDraft[];
  slotInterval: number;
  bufferTime: number;
  onlineBooking: boolean;
  maxAdvanceDays: number;
  cancellationPolicy: string;
  depositRequired: boolean;
  depositPct: number;
  /** Google Places ID found during address lookup — used to fetch hours + phone */
  placeId: string;
  /** Business website URL from Google Places */
  website: string;
  /** Latitude from Google Places geometry */
  latitude: string;
  /** Longitude from Google Places geometry */
  longitude: string;
  /** True when timezone was derived from Google Places — auto-skips the timezone confirm step */
  timezoneAutoConfirmed: boolean;
  /** Free website subdomain chosen during onboarding: [websiteName].certxa.com */
  websiteName: string;
  /** Template style chosen: "bloom" | "aria" */
  websiteTemplateId: string;
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

const BUSINESS_TYPES: ChipOption[] = [
  { value: "Nail Salon",    label: "Nail Salon",    emoji: "💅" },
  { value: "Hair Salon",    label: "Hair Salon",    emoji: "✂️" },
  { value: "Spa",           label: "Spa",           emoji: "🧖" },
  { value: "Barbershop",    label: "Barbershop",    emoji: "💈" },
  { value: "Esthetician",  label: "Esthetician",   emoji: "🌸" },
  { value: "Pet Groomer",   label: "Pet Groomer",   emoji: "🐾" },
  { value: "Tattoo Studio", label: "Tattoo Studio", emoji: "🎨" },
  { value: "Other",         label: "Other",         emoji: "✨" },
];

const STAFF_ROLES: ChipOption[] = [
  { value: "Nail Technician", label: "Nail Technician", emoji: "💅" },
  { value: "Esthetician",     label: "Esthetician",     emoji: "🌸" },
  { value: "Hair Stylist",    label: "Hair Stylist",     emoji: "✂️" },
  { value: "Manager",         label: "Manager",          emoji: "🗂️" },
  { value: "Front Desk",      label: "Front Desk",       emoji: "🖥️" },
  { value: "Other",           label: "Other",            emoji: "👤" },
];

// ── Phone validation ──────────────────────────────────────────────────────────

function validatePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!raw.trim()) return null; // optional
  if (digits.length !== 10) return "Please enter a 10-digit phone number.";
  return null;
}

// ── Slug validation ───────────────────────────────────────────────────────────

function validateSlug(value: string): string | null {
  if (!value || value.length < 3) return "Booking link must be at least 3 characters.";
  if (value.length > 50) return "Booking link must be 50 characters or less.";
  if (!/^[a-z0-9-]+$/.test(value)) return "Only lowercase letters, numbers, and hyphens.";
  return null;
}

// ── The conversation script ───────────────────────────────────────────────────

export const ONBOARDING_STEPS: StepDefinition[] = [
  // ── Phase A: Business Info ────────────────────────────────────────────────

  {
    id: "business_type",
    answerKey: "businessType",
    phase: "Business",
    message: "Welcome to Certxa! 👋 Let's get your business set up in just a few minutes. First — what type of business do you run?",
    inputType: "chips",
    options: BUSINESS_TYPES,
    required: true,
    validate: (v) => (v ? null : "Please select a business type."),
  },

  {
    id: "salon_name",
    answerKey: "businessName",
    phase: "Business",
    message: (a) => {
      switch (a.businessType) {
        case "Nail Salon":
          return "Love it! Michelangelo had ceilings—you've got fingernails. 😄 What's your nail salon called?";
        case "Hair Salon":
          return "Confidence begins in the chair. What's your hair salon called?";
        case "Barbershop":
          return "Got it! Sharp fades, clean shaves. What's your barbershop called?";
        default:
          return `What's the name of your ${a.businessType ?? "business"}?`;
      }
    },
    inputType: "text",
    placeholder: "e.g. Bella Nails",
    required: true,
    nextStep: "address",
    validate: (v) => {
      const s = String(v ?? "").trim();
      if (!s) return "Business name is required.";
      if (s.length > 100) return "Name must be 100 characters or less.";
      return null;
    },
  },

  {
    id: "address",
    answerKey: "address",
    phase: "Business",
    message: (a) => `What's the street address of ${a.businessName ? `**${a.businessName}**` : `your ${a.businessType ?? "business"}`}?`,
    inputType: "text",
    placeholder: "e.g. 123 Main St",
    skippable: true,
    skipTo: "zip_lookup",
    nextStep: "zip_lookup",
  },

  {
    id: "zip_lookup",
    phase: "Business",
    message: "And the zip code?",
    inputType: "zip_lookup",
    required: true,
    validate: (v) => {
      const obj = v as { zip?: string; city?: string; state?: string } | null;
      const zip = String(obj?.zip ?? "").replace(/\D/g, "");
      if (!zip) return "Zip code is required.";
      if (zip.length !== 5) return "Zip code must be 5 digits.";
      if (!obj?.city?.trim()) return "Couldn't find that zip code — please try another.";
      return null;
    },
    // Navigation handled imperatively after Places lookup: → name_confirm or phone
  },

  {
    id: "name_confirm",
    phase: "Business",
    message: (a) => {
      const type = a.businessType ?? "business";
      const name = a.businessName ?? "";
      return `We found **"${name}"** on Google at that address — is that your ${type}?`;
    },
    inputType: "name_confirm",
    // Navigation handled imperatively:
    //   Yes → fetch place-details (hours + phone), store them, → phone
    //   No  → keep user-entered name, → phone
  },

  {
    id: "phone",
    answerKey: "phone",
    phase: "Business",
    message: "What's your business phone number?",
    inputType: "phone",
    placeholder: "(555) 555-5555",
    validate: (v) => validatePhone(String(v ?? "")),
  },

  {
    id: "timezone",
    answerKey: "timezone",
    phase: "Business",
    message: (a) =>
      `Almost there on the basics! We detected you're in the **${friendlyTz(a.timezone ?? "")}** timezone. Is that right?`,
    inputType: "timezone",
    required: true,
    // Skip the hours step if Google Places already provided business hours
    nextStep: (a) => (a.businessHours?.length ? "services_intro" : "hours"),
  },

  {
    id: "hours",
    answerKey: "businessHours",
    phase: "Business",
    message: 'What are your business hours? You can type them naturally — like "Mon\u2013Sat 9am\u20136pm, closed Sunday" — or set them day by day.',
    inputType: "hours_natural",
    skippable: true,
    skipTo: "services_intro",
    placeholder: 'e.g. Mon–Sat 9am–7pm, closed Sunday',
  },

  // ── Phase B: Services ─────────────────────────────────────────────────────

  {
    id: "services_intro",
    phase: "Services",
    message: (a) => {
      const name = a.businessName ?? "Your salon";
      return `${name} is all set! 🎉\n\nNow we need to add your **services and pricing** to your account. Don't worry — this is super simple!\n\n📸 **The fastest way:** Just take a photo of your price list, menu board, or any sign on your wall that shows your services and prices. Upload the photo and we'll handle adding everything for you. Most salon owners are done in under 2 minutes!\n\nYou can also type your services in manually, or skip this step for now — but keep in mind:\n\n⚠️ **Your online booking page won't go live until at least one service is added.** Clients won't be able to find or book you online until your menu is set up.`;
    },
    inputType: "chips",
    options: [{ value: "ready", label: "Got it — let's add my services!", emoji: "📸" }],
    nextStep: "services_method",
  },

  {
    id: "services_method",
    answerKey: "servicesMethod",
    phase: "Services",
    message: "How would you like to add your services? The photo upload is the quickest — just snap a picture of your price list or menu!",
    inputType: "services_method",
    skippable: true,
    skipTo: "google_setup",
  },

  {
    id: "services_upload",
    answerKey: "servicesUploadRef",
    phase: "Services",
    message: "Upload your service menu — a photo, PDF, or image of your menu works great!",
    inputType: "file_upload",
    skippable: true,
    skipTo: "google_setup",
    nextStep: "services_review",
  },

  {
    id: "services_review",
    phase: "Services",
    message: "Here's what we found! 🎉 Review your services below — you can edit names, prices, or durations, and remove anything that doesn't look right. When you're happy, tap **Publish Services** to add them to your account.",
    inputType: "services_review",
    skippable: true,
    skipTo: "google_setup",
    nextStep: "google_setup",
  },

  {
    id: "services_manual",
    answerKey: "services",
    phase: "Services",
    message: "Let's add your services. Start with a category name (e.g. Manicure, Pedicure) then add services to it.",
    inputType: "services_manual",
    skippable: true,
    skipTo: "google_setup",
    nextStep: "google_setup",
  },

  {
    id: "google_setup",
    phase: "Google",
    message: "Great! Your salon services are ready 🎉\n\nThe next step helps more customers find your salon on Google and helps you get more 5-star reviews.\n\nI'll check if your salon is already listed on Google and help you connect it.",
    inputType: "google_setup",
    required: false,
    nextStep: "team_intro",
  },

  // ── Phase C: Team ─────────────────────────────────────────────────────────

  {
    id: "team_intro",
    answerKey: "teamSize",
    phase: "Team",
    message: "Do you have a team working with you, or is it just you for now?",
    inputType: "team_size",
    options: [
      { value: "team", label: "I have a team", emoji: "👥" },
      { value: "solo", label: "Just me",       emoji: "🙋" },
    ],
    skippable: true,
    skipTo: "slot_interval",
    nextStep: (a) => (a.teamSize === "team" ? "team_member_name" : "slot_interval"),
  },

  {
    id: "team_member_name",
    phase: "Team",
    message: "What's your first team member's name?",
    inputType: "staff_name",
    required: true,
    nextStep: "team_member_email",
  },

  {
    id: "team_member_email",
    phase: "Team",
    message: (a) => {
      const lastName = (a as any)._currentMember?.firstName ?? "your team member";
      return `What's ${lastName}'s email address? We'll send them an invite.`;
    },
    inputType: "staff_email",
    placeholder: "name@example.com",
    skippable: true,
    skipTo: "team_member_role",
    validate: (v) => {
      const s = String(v ?? "").trim();
      if (!s) return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "Please enter a valid email.";
      return null;
    },
  },

  {
    id: "team_member_role",
    phase: "Team",
    message: (a) => {
      const name = (a as any)._currentMember?.firstName ?? "them";
      return `What is ${name}'s role?`;
    },
    inputType: "staff_role",
    options: STAFF_ROLES,
    required: true,
    nextStep: "team_member_hours",
  },

  {
    id: "team_member_hours",
    phase: "Team",
    message: (a) => {
      const name = (a as any)._currentMember?.firstName ?? "them";
      return `What days does ${name} work?`;
    },
    inputType: "staff_hours",
    skippable: true,
    skipTo: "team_add_more",
    nextStep: "team_add_more",
  },

  {
    id: "team_add_more",
    phase: "Team",
    message: (a) => {
      const name = (a as any)._currentMember?.firstName ?? "Your team member";
      return `${name} is ready! Would you like to add another team member?`;
    },
    inputType: "team_add_more",
    nextStep: (a) => ((a as any)._addMore ? "team_member_name" : "slot_interval"),
  },

  // ── Phase D: Booking Settings ─────────────────────────────────────────────

  {
    id: "slot_interval",
    answerKey: "slotInterval",
    phase: "Booking",
    message: "How long should appointment slots be? This sets how your calendar divides time.",
    inputType: "slot_interval",
    options: [
      { value: "15", label: "15 min" },
      { value: "30", label: "30 min" },
      { value: "45", label: "45 min" },
      { value: "60", label: "60 min" },
    ],
    required: true,
  },

  {
    id: "buffer_time",
    answerKey: "bufferTime",
    phase: "Booking",
    message: "Do you want a buffer between appointments to clean up or prepare?",
    inputType: "buffer_time",
    options: [
      { value: "0",  label: "None" },
      { value: "5",  label: "5 min" },
      { value: "10", label: "10 min" },
      { value: "15", label: "15 min" },
    ],
    required: true,
  },

  {
    id: "online_booking",
    answerKey: "onlineBooking",
    phase: "Booking",
    message: "Do you want clients to be able to book appointments online?",
    inputType: "yes_no",
    required: true,
  },

  {
    id: "advance_window",
    answerKey: "maxAdvanceDays",
    phase: "Booking",
    message: "How far in advance can clients book?",
    inputType: "advance_window",
    options: [
      { value: "7",  label: "1 week" },
      { value: "14", label: "2 weeks" },
      { value: "30", label: "1 month" },
      { value: "90", label: "3 months" },
    ],
    required: true,
  },

  {
    id: "cancellation_policy",
    answerKey: "cancellationPolicy",
    phase: "Booking",
    message: "What's your cancellation policy?",
    inputType: "cancellation",
    options: [
      { value: "none",  label: "No cancellations",    emoji: "🚫" },
      { value: "24h",   label: "24-hour notice",       emoji: "📅" },
      { value: "48h",   label: "48-hour notice",       emoji: "📅" },
    ],
    required: true,
  },

  {
    id: "deposit",
    answerKey: "depositRequired",
    phase: "Booking",
    message: "Do you require a deposit to hold appointments?",
    inputType: "deposit",
    required: true,
  },

  // ── Phase E: Your Free Website ───────────────────────────────────────────

  {
    id: "website_name",
    answerKey: "websiteName",
    phase: "Review",
    message: (a) => {
      const suggested = a.businessName ? slugify(a.businessName) : "your-salon";
      return `Almost done! 🎉 Choose a name for your **free booking website**. We suggest: **${suggested}**\n\nYour website will be live at: **[name].certxa.com**`;
    },
    inputType: "website_name",
    required: true,
    validate: (v) => validateSlug(String(v ?? "")),
  },

  {
    id: "website_template_pick",
    answerKey: "websiteTemplateId",
    phase: "Review",
    message: "Pick a style for your free website. You can always change it later from your dashboard.",
    inputType: "website_template_pick",
    required: true,
  },

  // ── Phase F: Review + Submit ──────────────────────────────────────────────

  {
    id: "review",
    phase: "Review",
    message: "Here's a summary of everything — take a look and make any changes before we go live! 🚀",
    inputType: "review",
    required: false,
  },
];

// ── Helper: friendly timezone name ───────────────────────────────────────────

function friendlyTz(tz: string): string {
  const map: Record<string, string> = {
    "America/New_York":    "Eastern (ET)",
    "America/Chicago":     "Central (CT)",
    "America/Denver":      "Mountain (MT)",
    "America/Los_Angeles": "Pacific (PT)",
    "America/Anchorage":   "Alaska (AKT)",
    "Pacific/Honolulu":    "Hawaii (HT)",
    "America/Phoenix":     "Arizona (MST)",
  };
  return map[tz] ?? tz;
}

// ── Step index helpers ────────────────────────────────────────────────────────

export function getStepById(id: string): StepDefinition | undefined {
  return ONBOARDING_STEPS.find((s) => s.id === id);
}

export function getStepIndex(id: string): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === id);
}

export const FIRST_STEP_ID = ONBOARDING_STEPS[0].id;

// All steps that are "required" for the final submission check
export const REQUIRED_STEP_IDS = ["business_type", "salon_name", "timezone", "website_name", "website_template_pick"];

// Phase order for progress bar
export const PHASES = ["Business", "Services", "Google", "Team", "Booking", "Review"];

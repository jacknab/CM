/**
 * OnboardingChat.tsx — Conversational onboarding shell
 *
 * Mobile-first chat UI that walks new salon owners through setup one question
 * at a time. Fully scripted — no AI calls in this implementation.
 *
 * Activate via: ?mode=chat  OR  VITE_AI_ONBOARDING=true
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useOnboardingSession } from "@/hooks/use-onboarding-session";
import {
  ONBOARDING_STEPS,
  PHASES,
  type DayHoursAnswer,
  type TeamMemberDraft,
  type ServiceDraft,
  type ChipOption,
  slugify,
} from "@/lib/onboarding-script";
import { parseHours, summariseHours, formatTime12h, type DayHours } from "@/lib/hours-parser";
import { apiRequest } from "@/lib/queryClient";
import { OnboardingGoogleStep } from "@/components/OnboardingGoogleStep";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Upload,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Sparkles,
} from "lucide-react";

// ── Brand constants ──────────────────────────────────────────────────────────
const PLUM  = "#1A0333";
const GOLD  = "#C97B2B";
const LIGHT = "#FAFAFA";

// ── US States ────────────────────────────────────────────────────────────────
const US_STATES = [
  {v:"AL",l:"Alabama"},{v:"AK",l:"Alaska"},{v:"AZ",l:"Arizona"},{v:"AR",l:"Arkansas"},
  {v:"CA",l:"California"},{v:"CO",l:"Colorado"},{v:"CT",l:"Connecticut"},{v:"DE",l:"Delaware"},
  {v:"FL",l:"Florida"},{v:"GA",l:"Georgia"},{v:"HI",l:"Hawaii"},{v:"ID",l:"Idaho"},
  {v:"IL",l:"Illinois"},{v:"IN",l:"Indiana"},{v:"IA",l:"Iowa"},{v:"KS",l:"Kansas"},
  {v:"KY",l:"Kentucky"},{v:"LA",l:"Louisiana"},{v:"ME",l:"Maine"},{v:"MD",l:"Maryland"},
  {v:"MA",l:"Massachusetts"},{v:"MI",l:"Michigan"},{v:"MN",l:"Minnesota"},{v:"MS",l:"Mississippi"},
  {v:"MO",l:"Missouri"},{v:"MT",l:"Montana"},{v:"NE",l:"Nebraska"},{v:"NV",l:"Nevada"},
  {v:"NH",l:"New Hampshire"},{v:"NJ",l:"New Jersey"},{v:"NM",l:"New Mexico"},{v:"NY",l:"New York"},
  {v:"NC",l:"North Carolina"},{v:"ND",l:"North Dakota"},{v:"OH",l:"Ohio"},{v:"OK",l:"Oklahoma"},
  {v:"OR",l:"Oregon"},{v:"PA",l:"Pennsylvania"},{v:"RI",l:"Rhode Island"},{v:"SC",l:"South Carolina"},
  {v:"SD",l:"South Dakota"},{v:"TN",l:"Tennessee"},{v:"TX",l:"Texas"},{v:"UT",l:"Utah"},
  {v:"VT",l:"Vermont"},{v:"VA",l:"Virginia"},{v:"WA",l:"Washington"},{v:"WV",l:"West Virginia"},
  {v:"WI",l:"Wisconsin"},{v:"WY",l:"Wyoming"},
];

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)" },
  { value: "America/Phoenix",     label: "Arizona (MST)" },
];

const STATE_TZ: Record<string, string> = {
  CT:"America/New_York",DC:"America/New_York",DE:"America/New_York",FL:"America/New_York",
  GA:"America/New_York",IN:"America/New_York",KY:"America/New_York",MA:"America/New_York",
  MD:"America/New_York",ME:"America/New_York",MI:"America/New_York",NC:"America/New_York",
  NH:"America/New_York",NJ:"America/New_York",NY:"America/New_York",OH:"America/New_York",
  PA:"America/New_York",RI:"America/New_York",SC:"America/New_York",TN:"America/New_York",
  VA:"America/New_York",VT:"America/New_York",WV:"America/New_York",
  AL:"America/Chicago",AR:"America/Chicago",IA:"America/Chicago",IL:"America/Chicago",
  KS:"America/Chicago",LA:"America/Chicago",MN:"America/Chicago",MO:"America/Chicago",
  MS:"America/Chicago",ND:"America/Chicago",NE:"America/Chicago",OK:"America/Chicago",
  SD:"America/Chicago",TX:"America/Chicago",WI:"America/Chicago",
  CO:"America/Denver",ID:"America/Denver",MT:"America/Denver",NM:"America/Denver",
  UT:"America/Denver",WY:"America/Denver",
  AZ:"America/Phoenix",CA:"America/Los_Angeles",NV:"America/Los_Angeles",
  OR:"America/Los_Angeles",WA:"America/Los_Angeles",
  AK:"America/Anchorage",HI:"Pacific/Honolulu",
};

const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const hh = String(h).padStart(2,"0");
    const mm = String(m).padStart(2,"0");
    TIME_OPTIONS.push({ value:`${hh}:${mm}`, label: formatTime12h(`${hh}:${mm}`) });
  }
}

// ── Markdown-lite renderer (bold + newlines only) ────────────────────────────
function renderMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2,-2)}</strong>;
    }
    return part.split("\n").map((line, j) => (
      <span key={`${i}-${j}`}>{line}{j < part.split("\n").length - 1 && <br />}</span>
    ));
  });
}

// ── Animated AI bubble ────────────────────────────────────────────────────────
function AiBubble({ text, isNew }: { text: string; isNew?: boolean }) {
  return (
    <div
      className={`flex gap-3 items-start ${isNew ? "animate-slide-in" : ""}`}
      style={{ maxWidth: "85%" }}
    >
      <div className="flex-shrink-0 w-8 h-8 mt-0.5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32">
          <rect width="64" height="64" rx="14" fill="#3B0764"/>
          <rect width="64" height="64" rx="14" fill="url(#ob-shine)" opacity=".18"/>
          <text x="35" y="48" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif" fontSize="46" fontWeight="700" fontStyle="italic" fill="#ffffff" letterSpacing="-2">C</text>
          <circle cx="52" cy="46" r="5.5" fill="#F59E0B"/>
          <defs>
            <linearGradient id="ob-shine" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff"/>
              <stop offset="100%" stopColor="#000000"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-sm"
        style={{ background: "#FFFFFF", color: "#111827", border: "1px solid #E5E7EB" }}
      >
        {renderMessage(text)}
      </div>
    </div>
  );
}

// ── User answer bubble ────────────────────────────────────────────────────────
function UserBubble({ text, onEdit }: { text: string; onEdit?: () => void }) {
  return (
    <div className="flex justify-end items-end gap-2 self-end" style={{ maxWidth: "85%" }}>
      {onEdit && (
        <button
          onClick={onEdit}
          className="p-1 rounded-full opacity-40 hover:opacity-100 transition-opacity"
          style={{ color: PLUM }}
          title="Edit this answer"
        >
          <Pencil size={13} />
        </button>
      )}
      <div
        className="rounded-2xl rounded-br-sm px-4 py-3 text-sm font-medium shadow-sm"
        style={{ background: PLUM, color: "#FFFFFF" }}
      >
        {text}
      </div>
    </div>
  );
}

// ── Chip button ───────────────────────────────────────────────────────────────
function Chip({
  option, selected, onClick
}: { option: ChipOption; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-150 min-h-[44px]"
      style={
        selected
          ? { background: PLUM, borderColor: PLUM, color: "#fff" }
          : { background: "#fff", borderColor: "#D1D5DB", color: "#111827" }
      }
    >
      {option.emoji && <span>{option.emoji}</span>}
      {option.label}
      {selected && <Check size={14} className="ml-auto" />}
    </button>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, phase }: { pct: number; phase?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: GOLD }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums" style={{ color: GOLD, minWidth: 36 }}>
        {pct}%
      </span>
      {phase && (
        <span className="text-xs text-gray-400 font-medium hidden sm:block">{phase}</span>
      )}
    </div>
  );
}

// ── Slug availability hook ────────────────────────────────────────────────────
function useSlugCheck(slug: string) {
  const [status, setStatus] = useState<"idle"|"checking"|"available"|"taken"|"error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!slug || slug.length < 3) { setStatus("idle"); return; }
    setStatus("checking");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/google-business/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        setStatus(data.available ? "available" : "taken");
      } catch {
        setStatus("error");
      }
    }, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [slug]);

  return status;
}

// ── Input widgets ─────────────────────────────────────────────────────────────

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function format(raw: string) {
    const d = raw.replace(/\D/g,"").slice(0,10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  }
  return (
    <input
      type="tel"
      inputMode="numeric"
      value={format(value)}
      onChange={e => onChange(e.target.value.replace(/\D/g,""))}
      placeholder="(555) 555-5555"
      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-purple-600 transition-colors"
    />
  );
}

function SlugInput({
  value, onChange, suggestedSlug
}: { value: string; onChange: (v: string) => void; suggestedSlug: string }) {
  const [touched, setTouched] = useState(false);
  const slug = touched ? value : (value || suggestedSlug);
  const slugStatus = useSlugCheck(slug);

  const statusEl = () => {
    if (!slug || slug.length < 3) return null;
    if (slugStatus === "checking") return (
      <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin"/>Checking…</span>
    );
    if (slugStatus === "available") return (
      <span className="text-xs text-green-600 flex items-center gap-1"><Check size={11}/>Available</span>
    );
    if (slugStatus === "taken") return (
      <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11}/>Already taken</span>
    );
    return null;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-purple-600 transition-colors">
        <span className="px-3 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 py-3 whitespace-nowrap">certxa.com/book/</span>
        <input
          type="text"
          value={slug}
          onChange={e => { setTouched(true); onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-")); }}
          className="flex-1 px-3 py-3 text-sm focus:outline-none bg-white"
          placeholder={suggestedSlug}
        />
      </div>
      <div className="flex justify-end">{statusEl()}</div>
    </div>
  );
}

// ── Website name input ([name].certxa.com) ────────────────────────────────────
function WebsiteNameInput({
  value, onChange, suggestedSlug
}: { value: string; onChange: (v: string) => void; suggestedSlug: string }) {
  const [touched, setTouched] = useState(false);
  const slug = touched ? value : (value || suggestedSlug);
  const slugStatus = useSlugCheck(slug);

  const statusEl = () => {
    if (!slug || slug.length < 3) return null;
    if (slugStatus === "checking") return (
      <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin"/>Checking…</span>
    );
    if (slugStatus === "available") return (
      <span className="text-xs text-green-600 flex items-center gap-1"><Check size={11}/>Available ✓</span>
    );
    if (slugStatus === "taken") return (
      <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11}/>Already taken — try another</span>
    );
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-purple-600 transition-colors">
        <input
          type="text"
          value={slug}
          onChange={e => { setTouched(true); onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-")); }}
          className="flex-1 px-4 py-3 text-sm font-medium focus:outline-none bg-white"
          placeholder={suggestedSlug}
          autoFocus
        />
        <span className="px-3 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 py-3 whitespace-nowrap">.certxa.com</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">Your free booking website address</span>
        {statusEl()}
      </div>
    </div>
  );
}

// ── Website template picker (2 visual cards) ──────────────────────────────────
function WebsiteTemplatePick({
  selected, onSelect
}: { selected: string; onSelect: (v: string) => void }) {
  const PLUM_LOCAL = "#5B2D8E";

  const templates = [
    {
      id: "bloom",
      name: "Bloom",
      tagline: "Elegant & Modern",
      desc: "Lush, feminine, beauty-forward",
      preview: (
        <div className="relative w-full h-36 overflow-hidden rounded-t-xl" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #db2777 100%)" }}>
          {/* Decorative circles */}
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-20" style={{ background: "white" }} />
          <div className="absolute -bottom-6 -left-4 w-24 h-24 rounded-full opacity-10" style={{ background: "white" }} />
          {/* Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4">
            <div className="w-6 h-6 rounded-full bg-white/30 mb-1" />
            <div className="text-white text-sm font-bold tracking-wide text-center" style={{ fontFamily: "Georgia, serif" }}>Lux Nails</div>
            <div className="text-white/80 text-[9px] tracking-widest uppercase">Nail & Beauty Studio</div>
            <div className="mt-2 px-4 py-1 rounded-full text-[10px] font-semibold text-purple-900 bg-white/90">Book Now</div>
          </div>
          {/* Mini service chips */}
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 px-2">
            {["Manicure","Pedicure","Gel"].map(s => (
              <div key={s} className="px-1.5 py-0.5 rounded-full text-[8px] text-white border border-white/40">{s}</div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "aria",
      name: "Aria",
      tagline: "Clean & Minimal",
      desc: "Modern, professional, versatile",
      preview: (
        <div className="relative w-full h-36 overflow-hidden rounded-t-xl bg-white border-b border-gray-100">
          {/* Top nav bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <div className="text-[10px] font-bold text-gray-900 tracking-wider uppercase">LUX NAILS</div>
            <div className="text-[8px] text-gray-400">Menu · About · Book</div>
          </div>
          {/* Hero area */}
          <div className="flex flex-col items-center justify-center h-[calc(100%-32px)] gap-2 px-4">
            <div className="text-center">
              <div className="text-xs font-light text-gray-400 tracking-widest uppercase mb-1">Nail & Beauty</div>
              <div className="text-base font-bold text-gray-900 tracking-tight leading-none">Beautiful Nails,</div>
              <div className="text-base font-bold text-gray-900 tracking-tight leading-none">Flawlessly Done.</div>
            </div>
            <div className="px-4 py-1 text-[10px] font-semibold text-white rounded" style={{ background: "#1a1a1a" }}>Book an Appointment</div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {templates.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`relative flex flex-col rounded-xl border-2 overflow-hidden text-left transition-all duration-200 ${
            selected === t.id
              ? "border-purple-600 shadow-lg shadow-purple-100"
              : "border-gray-200 hover:border-purple-300"
          }`}
        >
          {/* Selected badge */}
          {selected === t.id && (
            <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: PLUM_LOCAL }}>
              <Check size={10} color="white" strokeWidth={3} />
            </div>
          )}
          {/* Mini preview */}
          {t.preview}
          {/* Info */}
          <div className="px-3 py-2.5 bg-white">
            <div className="text-xs font-bold text-gray-900">{t.name}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t.tagline}</div>
            <div className="text-[9px] text-gray-400 mt-0.5">{t.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function TimezoneWidget({
  value, onChange
}: { value: string; onChange: (v: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const label = TIMEZONES.find(t => t.value === value)?.label ?? value;

  return (
    <div className="space-y-3">
      {!showPicker ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white transition-colors min-h-[44px]"
            style={{ background: PLUM }}
            onClick={() => {}}
          >
            ✓ Yes, {label}
          </button>
          <button
            type="button"
            className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-700 transition-colors min-h-[44px]"
            onClick={() => setShowPicker(true)}
          >
            Change timezone
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={e => { onChange(e.target.value); setShowPicker(false); }}
          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-purple-600"
        >
          {TIMEZONES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── Convert Google Places opening_hours.periods → DayHoursAnswer[] ───────────
function convertPlacesHours(
  periods: Array<{ open: { day: number; time: string }; close?: { day: number; time: string } }>
): DayHoursAnswer[] {
  const result: DayHoursAnswer[] = [];
  for (let day = 0; day < 7; day++) {
    const period = periods.find((p) => p.open?.day === day);
    if (period) {
      const openRaw = String(period.open.time ?? "0900").padStart(4, "0");
      const closeRaw = String(period.close?.time ?? "1800").padStart(4, "0");
      result.push({
        dayOfWeek: day,
        openTime: `${openRaw.slice(0, 2)}:${openRaw.slice(2)}`,
        closeTime: `${closeRaw.slice(0, 2)}:${closeRaw.slice(2)}`,
        isClosed: false,
      });
    } else {
      result.push({ dayOfWeek: day, openTime: "09:00", closeTime: "18:00", isClosed: true });
    }
  }
  return result;
}

// ── Derive IANA timezone from Google Places utc_offset_minutes + state ───────
function deriveTimezoneFromPlaces(offsetMinutes: number, state?: string): string | null {
  if (state === "AZ") return "America/Phoenix";
  if (state === "HI") return "Pacific/Honolulu";

  // Each zone with both standard (winter) and daylight (summer) offset
  const zones: { iana: string; std: number; dst: number; states: string[] }[] = [
    { iana: "America/New_York",    std: -300, dst: -240, states: ["CT","DC","DE","FL","GA","IN","KY","MA","MD","ME","MI","NC","NH","NJ","NY","OH","PA","RI","SC","TN","VA","VT","WV"] },
    { iana: "America/Chicago",     std: -360, dst: -300, states: ["AL","AR","IA","IL","KS","LA","MN","MO","MS","ND","NE","OK","SD","TX","WI"] },
    { iana: "America/Denver",      std: -420, dst: -360, states: ["CO","ID","MT","NM","UT","WY"] },
    { iana: "America/Los_Angeles", std: -480, dst: -420, states: ["CA","NV","OR","WA"] },
    { iana: "America/Anchorage",   std: -540, dst: -480, states: ["AK"] },
    { iana: "Pacific/Honolulu",    std: -600, dst: -600, states: ["HI"] },
  ];

  // State is the most reliable signal — use it first
  if (state) {
    const byState = zones.find(z => z.states.includes(state));
    if (byState) return byState.iana;
  }

  // Fall back to offset — try both std and dst; prefer std match
  const stdMatch = zones.find(z => z.std === offsetMinutes);
  if (stdMatch) return stdMatch.iana;
  const dstMatch = zones.find(z => z.dst === offsetMinutes);
  return dstMatch?.iana ?? null;
}

// ── Address match guard for Places results ────────────────────────────────────
// Returns true only if the Google result's formatted_address shares the same
// street number AND at least one street-name word as the address the user typed.
// This prevents showing "We found Luxe Nail Society nearby — is that you?" when
// the user's business simply isn't on Google yet (wrong building returned).
const STREET_TYPE_WORDS = new Set([
  "st","ave","blvd","rd","dr","ln","way","ct","pl","ter","hwy","pkwy",
  "n","s","e","w","ne","nw","se","sw","north","south","east","west",
]);
function addressesLikelySameLocation(userStreet: string, googleFormatted: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const userNorm   = norm(userStreet);
  const googleNorm = norm(googleFormatted);

  // Street numbers must match exactly
  const userNum   = userNorm.match(/^\d+/)?.[0];
  const googleNum = googleNorm.match(/^\d+/)?.[0];
  if (!userNum || !googleNum || userNum !== googleNum) return false;

  // At least one meaningful street-name word must also match
  const streetWords = (s: string) =>
    s.replace(/^\d+\s*/, "")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STREET_TYPE_WORDS.has(w));

  const userWords   = streetWords(userNorm);
  const googleWords = streetWords(googleNorm);
  return userWords.some(w => googleWords.includes(w));
}

// ── Address → Places business name lookup ─────────────────────────────────────
interface AddressPlacesValue {
  typed: string;
  address: string;
  businessName: string;
  placeId: string;
}

function AddressPlacesInput({
  value,
  onChange,
}: {
  value: AddressPlacesValue;
  onChange: (v: AddressPlacesValue) => void;
}) {
  const [results, setResults] = useState<{ placeId: string; name: string; address: string }[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleType(raw: string) {
    onChange({ typed: raw, address: raw, businessName: "", placeId: "" });
    setLocked(false);
    setResults([]);
    setStatus("idle");

    if (timerRef.current) clearTimeout(timerRef.current);
    if (raw.trim().length < 5) return;

    setStatus("loading");
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/google-business/address-lookup?address=${encodeURIComponent(raw.trim())}`);
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        setResults(data.results ?? []);
        setStatus("done");
      } catch {
        setStatus("error");
        setResults([]);
      }
    }, 500);
  }

  function pick(r: { placeId: string; name: string; address: string }) {
    onChange({ typed: r.address, address: r.address, businessName: r.name, placeId: r.placeId });
    setResults([]);
    setLocked(true);
    setStatus("idle");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          type="text"
          autoFocus
          value={value.typed}
          onChange={e => handleType(e.target.value)}
          placeholder="e.g. 4635 E Speedway Blvd, Tucson"
          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          style={locked ? { borderColor: "#16a34a" } : undefined}
        />
        {locked && value.businessName && (
          <button
            type="button"
            onClick={() => { setLocked(false); onChange({ ...value, businessName: "", placeId: "" }); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Status hints */}
      {status === "loading" && (
        <div className="flex items-center gap-1.5 text-xs text-purple-600 font-medium px-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Searching…
        </div>
      )}
      {locked && value.businessName && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold px-1">
          <Check className="w-3.5 h-3.5" /> Found: <span className="font-bold">{value.businessName}</span>
        </div>
      )}

      {/* Dropdown results */}
      {!locked && results.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {results.map((r, i) => (
            <button
              key={r.placeId}
              type="button"
              onClick={() => pick(r)}
              className="w-full flex flex-col items-start px-4 py-3 text-left hover:bg-purple-50 transition-colors text-sm"
              style={{ borderBottom: i < results.length - 1 ? "1px solid #F3F4F6" : "none" }}
            >
              <span className="font-semibold text-gray-900">{r.name}</span>
              <span className="text-gray-400 text-xs mt-0.5 leading-snug">{r.address}</span>
            </button>
          ))}
        </div>
      )}
      {!locked && status === "done" && results.length === 0 && value.typed.trim().length >= 5 && (
        <p className="text-xs text-gray-400 px-1">No matches found — you can still continue and enter your name manually.</p>
      )}
    </div>
  );
}

function ZipLookupInput({
  value,
  onChange,
}: {
  value: { zip: string; city: string; state: string };
  onChange: (v: { zip: string; city: string; state: string }) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleZipChange(raw: string) {
    const zip = raw.replace(/\D/g, "").slice(0, 5);
    onChange({ zip, city: "", state: "" });
    setStatus("idle");

    if (timerRef.current) clearTimeout(timerRef.current);
    if (zip.length !== 5) return;

    setStatus("loading");
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        const place = data.places?.[0];
        if (!place) throw new Error("no places");
        const city = place["place name"] as string;
        const state = place["state abbreviation"] as string;
        onChange({ zip, city, state });
        setStatus("found");
        // Auto-set timezone from state
        if (STATE_TZ[state]) {
          // signal to parent via a side-channel on the value object
          (onChange as unknown as (v: { zip: string; city: string; state: string; _tz?: string }) => void)(
            { zip, city, state, _tz: STATE_TZ[state] }
          );
        }
      } catch {
        setStatus("error");
        onChange({ zip, city: "", state: "" });
      }
    }, 400);
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={value.zip}
        onChange={e => handleZipChange(e.target.value)}
        placeholder="e.g. 85716"
        maxLength={5}
        autoFocus
        className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-purple-600 transition-colors"
      />
      {status === "loading" && (
        <div className="flex items-center gap-2 text-xs text-purple-600 font-medium px-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Looking up zip code…
        </div>
      )}
      {status === "found" && value.city && (
        <div className="flex items-center gap-2 text-xs text-green-700 font-semibold px-1">
          <Check className="w-3.5 h-3.5" />
          {value.city}, {value.state}
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-2 text-xs text-red-500 font-medium px-1">
          <AlertCircle className="w-3.5 h-3.5" />
          Zip code not found — please check and try again.
        </div>
      )}
    </div>
  );
}

function HoursNaturalInput({
  hours, onHours
}: { hours: DayHoursAnswer[]; onHours: (h: DayHoursAnswer[]) => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"natural"|"manual">("natural");
  const [parseError, setParseError] = useState(false);
  const [parsed, setParsed] = useState(false);

  function tryParse() {
    const result = parseHours(text);
    if (result.success) {
      onHours(result.hours as DayHoursAnswer[]);
      setParsed(true);
      setParseError(false);
    } else {
      setParseError(true);
      setMode("manual");
    }
  }

  if (mode === "manual") {
    return <HoursManualInput hours={hours} onHours={onHours} />;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={e => { setText(e.target.value); setParsed(false); setParseError(false); }}
          placeholder='e.g. Mon–Sat 9am–7pm, closed Sunday'
          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 pr-10 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          onKeyDown={e => { if (e.key === "Enter") tryParse(); }}
        />
        {parsed && <Check size={16} className="absolute right-3 top-3.5 text-green-500" />}
      </div>
      {parseError && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle size={13} /> Couldn't parse that — switching to day-by-day setup.
        </p>
      )}
      {parsed && hours && (
        <p className="text-xs text-green-600">{summariseHours(hours as DayHours[])}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={tryParse}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors min-h-[44px]"
          style={{ background: PLUM }}
        >
          Parse hours
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-600 transition-colors min-h-[44px]"
        >
          Set day by day
        </button>
      </div>
    </div>
  );
}

function HoursManualInput({
  hours, onHours
}: { hours: DayHoursAnswer[]; onHours: (h: DayHoursAnswer[]) => void }) {
  const rows = hours.length === 7 ? hours : Array.from({length:7},(_,i) => ({
    dayOfWeek: i, openTime:"09:00", closeTime:"18:00", isClosed: i === 0
  }));

  function update(idx: number, field: Partial<DayHoursAnswer>) {
    const next = rows.map((r,i) => i === idx ? {...r,...field} : r);
    onHours(next);
  }

  return (
    <div className="space-y-2">
      {rows.map((day,i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 px-3 rounded-xl border border-gray-100 bg-white">
          <button
            type="button"
            onClick={() => update(i, {isClosed: !day.isClosed})}
            className="flex items-center gap-2 min-w-[60px]"
          >
            <div
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0"
              style={!day.isClosed ? {background: PLUM, borderColor: PLUM} : {borderColor:"#D1D5DB"}}
            >
              {!day.isClosed && <Check size={11} color="white" />}
            </div>
            <span className="text-sm font-medium w-8">{DAY_LABELS[i]}</span>
          </button>
          {day.isClosed ? (
            <span className="text-xs text-gray-400 ml-2">Closed</span>
          ) : (
            <div className="flex items-center gap-1.5 ml-auto">
              <select
                value={day.openTime}
                onChange={e => update(i,{openTime:e.target.value})}
                className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none"
              >
                {TIME_OPTIONS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <span className="text-xs text-gray-400">–</span>
              <select
                value={day.closeTime}
                onChange={e => update(i,{closeTime:e.target.value})}
                className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none"
              >
                {TIME_OPTIONS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ServicesManualInput({
  services, onChange
}: { services: ServiceDraft[]; onChange: (s: ServiceDraft[]) => void }) {
  const [catName, setCatName] = useState("");
  const [svcName, setSvcName] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const [svcDuration, setSvcDuration] = useState("60");

  function addService() {
    if (!catName.trim() || !svcName.trim()) return;
    const s: ServiceDraft = {
      id: `s-${Date.now()}`,
      categoryName: catName.trim(),
      name: svcName.trim(),
      price: svcPrice,
      duration: parseInt(svcDuration,10) || 60,
    };
    onChange([...services, s]);
    setSvcName(""); setSvcPrice("");
  }

  function removeService(id: string) {
    onChange(services.filter(s => s.id !== id));
  }

  const byCategory = services.reduce<Record<string,ServiceDraft[]>>((acc, s) => {
    (acc[s.categoryName] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byCategory).map(([cat, svcs]) => (
        <div key={cat} className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">{cat}</div>
          {svcs.map(s => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2 border-t border-gray-100">
              <span className="flex-1 text-sm">{s.name}</span>
              <span className="text-sm text-gray-500">{s.price ? `$${s.price}` : ""}</span>
              <span className="text-xs text-gray-400">{s.duration}m</span>
              <button type="button" onClick={() => removeService(s.id)} className="text-gray-300 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ))}
      <div className="space-y-2 pt-1">
        <input
          type="text"
          value={catName}
          onChange={e => setCatName(e.target.value)}
          placeholder="Category (e.g. Manicure)"
          className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-purple-600"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={svcName}
            onChange={e => setSvcName(e.target.value)}
            placeholder="Service name"
            className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-purple-600"
          />
          <input
            type="text"
            inputMode="decimal"
            value={svcPrice}
            onChange={e => setSvcPrice(e.target.value)}
            placeholder="$0"
            className="w-20 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-purple-600"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={svcDuration}
            onChange={e => setSvcDuration(e.target.value)}
            className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:outline-none"
          >
            {[15,30,45,60,75,90,120].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
          <button
            type="button"
            onClick={addService}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px]"
            style={{ background: PLUM }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffHoursInput({
  workDays, workStart, workEnd, onChange
}: {
  workDays: number[]; workStart: string; workEnd: string;
  onChange: (days: number[], start: string, end: string) => void;
}) {
  function toggleDay(d: number) {
    const next = workDays.includes(d) ? workDays.filter(x=>x!==d) : [...workDays,d];
    onChange(next.sort(), workStart, workEnd);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {DAY_LABELS.map((label,i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggleDay(i)}
            className="w-10 h-10 rounded-full text-xs font-medium border-2 transition-all"
            style={workDays.includes(i)
              ? {background:PLUM,borderColor:PLUM,color:"#fff"}
              : {background:"#fff",borderColor:"#D1D5DB",color:"#374151"}}
          >
            {label.slice(0,1)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select value={workStart} onChange={e=>onChange(workDays,e.target.value,workEnd)}
          className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:outline-none">
          {TIME_OPTIONS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span className="text-sm text-gray-400">to</span>
        <select value={workEnd} onChange={e=>onChange(workDays,workStart,e.target.value)}
          className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:outline-none">
          {TIME_OPTIONS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function DepositInput({
  required, pct, onRequired, onPct
}: { required: boolean; pct: number; onRequired: (v:boolean)=>void; onPct: (v:number)=>void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {[{v:true,l:"Yes, require deposit"},{v:false,l:"No deposit"}].map(opt => (
          <button
            key={String(opt.v)}
            type="button"
            onClick={() => onRequired(opt.v)}
            className="flex-1 py-3 px-3 rounded-xl border-2 text-sm font-medium transition-all min-h-[44px]"
            style={required === opt.v
              ? {background:PLUM,borderColor:PLUM,color:"#fff"}
              : {background:"#fff",borderColor:"#D1D5DB",color:"#374151"}}
          >
            {opt.l}
          </button>
        ))}
      </div>
      {required && (
        <div className="space-y-2 pt-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Deposit percentage</span>
            <span className="font-semibold" style={{color:PLUM}}>{pct}%</span>
          </div>
          <input
            type="range" min={5} max={50} step={5} value={pct}
            onChange={e => onPct(parseInt(e.target.value,10))}
            className="w-full accent-purple-700"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>5%</span><span>50%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Review Card ───────────────────────────────────────────────────────────────
function ReviewCard({
  session, onEdit
}: {
  session: ReturnType<typeof useOnboardingSession>["session"];
  onEdit: (stepId: string) => void;
}) {
  const a = session.answers;
  const tzLabel = TIMEZONES.find(t => t.value === a.timezone)?.label ?? a.timezone ?? "";

  const sections = [
    {
      title: "Business Info",
      stepId: "salon_name",
      items: [
        ["Type", a.businessType],
        ["Name", a.businessName],
        ["Address", [a.address, a.city, a.state, a.postcode].filter(Boolean).join(", ") || "—"],
        ["Phone", a.phone ? `(${a.phone.slice(0,3)}) ${a.phone.slice(3,6)}-${a.phone.slice(6)}` : "—"],
        ["Timezone", tzLabel],
      ],
    },
    {
      title: "Free Website",
      stepId: "website_name",
      items: [
        ["URL", (a as any).websiteName ? `${(a as any).websiteName}.certxa.com` : "—"],
        ["Style", (a as any).websiteTemplateId === "aria" ? "Clean & Minimal (Aria)" : (a as any).websiteTemplateId === "bloom" ? "Elegant & Modern (Bloom)" : "—"],
      ],
    },
    {
      title: "Hours",
      stepId: "hours",
      items: a.businessHours
        ? [["Schedule", summariseHours(a.businessHours as DayHours[])]]
        : [["Schedule", "Default hours (Mon–Sat 9am–6pm)"]],
    },
    {
      title: "Services",
      stepId: "services_method",
      items: a.servicesMethod === "upload"
        ? [["Menu", "Uploaded"]]
        : a.servicesMethod === "manual" && (a.services ?? []).length > 0
        ? (a.services ?? []).slice(0,3).map(s => [s.categoryName, s.name])
        : [["Services", "Will add later"]],
    },
    {
      title: "Team",
      stepId: "team_intro",
      items: (a.teamMembers ?? []).length > 0
        ? (a.teamMembers ?? []).map(m => [`${m.firstName} ${m.lastName}`.trim(), m.role])
        : [["Team", a.teamSize === "solo" ? "Just me" : "Will add later"]],
    },
    {
      title: "Booking Settings",
      stepId: "slot_interval",
      items: [
        ["Slot interval", a.slotInterval ? `${a.slotInterval} min` : "30 min"],
        ["Buffer", a.bufferTime != null ? (a.bufferTime === 0 ? "None" : `${a.bufferTime} min`) : "None"],
        ["Online booking", a.onlineBooking !== false ? "Enabled" : "Disabled"],
        ["Advance window", a.maxAdvanceDays ? `${a.maxAdvanceDays} days` : "30 days"],
        ["Cancellation", a.cancellationPolicy ?? "None"],
        ["Deposit", a.depositRequired ? `${a.depositPct ?? 20}%` : "None"],
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {sections.map(sec => (
        <div key={sec.title} className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{sec.title}</span>
            <button
              type="button"
              onClick={() => onEdit(sec.stepId)}
              className="flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: PLUM }}
            >
              <Pencil size={11} /> Edit
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {sec.items.map(([k,v],i) => (
              <div key={i} className="flex justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-500">{k}</span>
                <span className="font-medium text-right ml-4 text-gray-900 max-w-[60%] truncate">{v || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingChat() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const hook = useOnboardingSession(user?.id ?? "guest");
  const {
    session, currentStep, progressPct, chatHistory,
    setAnswer, setAnswers, setCurrentMember, commitCurrentMember,
    goNext, goBack, goToStep,
    submit, prepareGoogle, isSubmitting, submitError, clearSubmitError,
  } = hook;

  const { answers } = session;

  // Local widget state for the current step's input
  const [localValue, setLocalValue] = useState<unknown>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [addMore, setAddMore] = useState(false);
  // Places lookup state — shown while doing async Google lookup after zip entry
  const [placesLookupPending, setPlacesLookupPending] = useState(false);
  // Place-details fetch state — shown while fetching hours/phone on name confirm
  const [placesDetailsPending, setPlacesDetailsPending] = useState(false);
  // The name the user typed before we potentially overwrite it with a Places result
  const [userEnteredName, setUserEnteredName] = useState<string>("");

  // ── Service upload / extraction / review state ───────────────────────────
  const [svcFile, setSvcFile] = useState<File | null>(null);
  const [svcUploading, setSvcUploading] = useState(false);
  const [svcJobId, setSvcJobId] = useState<number | null>(null);
  const [svcJobStatus, setSvcJobStatus] = useState<string>("pending");
  const [svcJobError, setSvcJobError] = useState<string | null>(null);
  const [svcCategories, setSvcCategories] = useState<Array<{ name: string; services: Array<{ name: string; price: number; duration: number; description?: string }> }>>([]);
  const [svcPublishing, setSvcPublishing] = useState(false);
  const [svcEditingService, setSvcEditingService] = useState<{ catIdx: number; svcIdx: number } | null>(null);
  const [svcEditForm, setSvcEditForm] = useState<{ name: string; price: number; duration: number }>({ name: "", price: 0, duration: 60 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-advance timezone step when it was confirmed from Google Places
  useEffect(() => {
    if (currentStep?.id !== "timezone") return;
    if (!(answers as Record<string, unknown>).timezoneAutoConfirmed) return;
    const t = setTimeout(() => goNext(), 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id, (answers as Record<string, unknown>).timezoneAutoConfirmed]);

  // Auto-scroll to bottom when new bubbles appear
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatHistory]);

  // Focus input when step changes
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 350);
  }, [currentStep?.id]);

  // Seed local value from existing answers when step changes
  useEffect(() => {
    if (!currentStep) return;
    const key = currentStep.answerKey as keyof typeof answers | undefined;
    if (key && answers[key] !== undefined) {
      setLocalValue(answers[key]);
    } else {
      // Set intelligent defaults
      switch (currentStep.id) {
        case "timezone": setLocalValue(answers.timezone ?? "America/New_York"); break;
        case "website_name": setLocalValue((answers as any).websiteName ?? slugify(answers.businessName ?? "")); break;
        case "hours": setLocalValue(answers.businessHours ?? []); break;
        case "deposit": setLocalValue({ required: answers.depositRequired ?? false, pct: answers.depositPct ?? 20 }); break;
        // Pre-fill zip_lookup from answers if they were already populated (e.g. from Places)
        case "zip_lookup":
          if (answers.postcode && answers.city && answers.state) {
            setLocalValue({ zip: answers.postcode, city: answers.city, state: answers.state });
          } else {
            setLocalValue({ zip: "", city: "", state: "" });
          }
          break;
        case "team_member_hours":
          setLocalValue({
            workDays: session.currentMember?.workDays ?? [1,2,3,4,5],
            workStart: session.currentMember?.workStart ?? "09:00",
            workEnd: session.currentMember?.workEnd ?? "18:00",
          });
          break;
        default: setLocalValue(""); break;
      }
    }
    setValidationError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id]);

  // Provision the already-collected salon foundation when the Google phase begins.
  // Existing Google ownership APIs require the persisted store ID.
  useEffect(() => {
    if (currentStep?.id === "google_setup" && !session.createdStoreId && !isSubmitting) {
      void prepareGoogle();
    }
  }, [currentStep?.id, session.createdStoreId, isSubmitting, prepareGoogle]);

  // Auto-advance display-only steps
  useEffect(() => {
    if (currentStep?.inputType === "display_only") {
      const t = setTimeout(() => goNext(), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [currentStep?.id]); // eslint-disable-line

  // Poll service-import job while on the services_upload step
  useEffect(() => {
    if (currentStep?.id !== "services_upload" || !svcJobId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/service-import/jobs/${svcJobId}`, { credentials: "include" });
        if (!res.ok) return;
        const { job } = await res.json();
        setSvcJobStatus(job.status);
        if (job.status === "completed" && job.ai_result) {
          const result = typeof job.ai_result === "string" ? JSON.parse(job.ai_result) : job.ai_result;
          setSvcCategories(result.categories ?? []);
          goNext("services_review");
        } else if (job.status === "failed") {
          setSvcJobError(job.error_message ?? "Processing failed. Please try again.");
          setSvcJobId(null);
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id, svcJobId]);

  // ── Commit current step answer and advance ────────────────────────────────

  async function commitAndAdvance(overrideNext?: string) {
    if (!currentStep) return;

    // Run validation
    const err = currentStep.validate?.(localValue, answers) ?? null;
    if (err) { setValidationError(err); return; }

    // Write answer to session
    const key = currentStep.answerKey as keyof typeof answers | undefined;
    if (key) {
      setAnswer(key, localValue);
    }

    // For zip_lookup: save city/state/zip, then do Places lookup with full address
    if (currentStep.id === "zip_lookup") {
      const zv = localValue as { zip?: string; city?: string; state?: string } | unknown;
      if (zv && typeof zv === "object") {
        const obj = zv as { zip?: string; city?: string; state?: string };
        const city     = obj.city  ?? "";
        const state    = obj.state ?? "";
        const zip      = obj.zip   ?? "";
        setAnswers({ city, state, postcode: zip });
        if (state && STATE_TZ[state]) {
          setAnswers({ timezone: STATE_TZ[state], timezoneAutoConfirmed: true });
        }

        // Build full address and look up on Google Places (include business name for accuracy)
        const streetAddr = (answers.address ?? "").trim();
        if (streetAddr && city && zip) {
          const fullAddr = `${streetAddr}, ${city}, ${state} ${zip}`;
          // Remember what the user typed so we can restore it if they decline the Places match
          const originalName = (answers.businessName ?? "").trim();
          setUserEnteredName(originalName);
          setPlacesLookupPending(true);
          try {
            const bizType = encodeURIComponent(answers.businessType ?? "");
            const bizName = encodeURIComponent(originalName);
            const res = await fetch(
              `/api/google-business/address-lookup?address=${encodeURIComponent(fullAddr)}&businessType=${bizType}&businessName=${bizName}`
            );
            const data = await res.json();
            // Filter out results whose name looks like just a street address (starts with a digit),
            // then require the name to meaningfully match what the user entered so we never show
            // a nearby stranger's salon as "is this your business?".
            const match = (data.results ?? []).find(
              (r: { name: string }) => r.name && !/^\d/.test(r.name.trim())
            );
            const isAddressMatch = match?.address
              ? addressesLikelySameLocation(streetAddr, match.address)
              : false;
            if (match?.name && isAddressMatch) {
              // Google returned a business at exactly this address — confirm with user
              setAnswers({ businessName: match.name, placeId: match.placeId ?? "" });
              goNext("name_confirm");
            } else {
              // Address didn't match (nearby result, not this building) — business is likely
              // new or not yet on Google; keep the name the user entered and move on
              goNext("phone");
            }
          } catch {
            goNext("phone");
          } finally {
            setPlacesLookupPending(false);
          }
          return;
        } else {
          // No street address entered — skip Places lookup entirely
          goNext("phone");
          return;
        }
      }
    }

    // For deposit
    if (currentStep.id === "deposit") {
      const dv = localValue as { required: boolean; pct: number } | unknown;
      if (dv && typeof dv === "object") {
        const obj = dv as { required?: boolean; pct?: number };
        setAnswers({ depositRequired: obj.required ?? false, depositPct: obj.pct ?? 20 });
      }
    }

    // For team member steps
    if (currentStep.id === "team_member_name") {
      const nv = localValue as { firstName: string; lastName: string } | unknown;
      if (nv && typeof nv === "object") {
        const obj = nv as { firstName?: string; lastName?: string };
        setCurrentMember({ firstName: obj.firstName ?? "", lastName: obj.lastName ?? "" });
      }
    }
    if (currentStep.id === "team_member_email") {
      setCurrentMember({ email: String(localValue ?? "") });
    }
    if (currentStep.id === "team_member_role") {
      setCurrentMember({ role: String(localValue ?? "") });
    }
    if (currentStep.id === "team_member_hours") {
      const hv = localValue as { workDays: number[]; workStart: string; workEnd: string } | unknown;
      if (hv && typeof hv === "object") {
        const obj = hv as { workDays?: number[]; workStart?: string; workEnd?: string };
        setCurrentMember({ workDays: obj.workDays, workStart: obj.workStart, workEnd: obj.workEnd });
      }
    }
    if (currentStep.id === "team_add_more") {
      commitCurrentMember();
      if (addMore) {
        setAddMore(false);
        setCurrentMember(null);
        goNext("team_member_name");
        return;
      }
    }

    // For website_name, sync the suggested slug if user hasn't typed
    if (currentStep.id === "website_name" && !localValue) {
      const suggested = slugify(answers.businessName ?? "");
      setAnswer("websiteName" as keyof typeof answers, suggested as unknown as string);
    }

    goNext(overrideNext);
  }

  async function skipStep() {
    if (!currentStep?.skippable) return;

    // On services_review: publish extracted services silently before navigating
    // so skipping doesn't discard the AI's work.
    if (currentStep.id === "services_review" && svcJobId && svcCategories.length > 0) {
      const nonEmpty = svcCategories.filter(c => c.services.length > 0);
      if (nonEmpty.length > 0) {
        try {
          await fetch("/api/service-import/publish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ jobId: svcJobId, categories: nonEmpty }),
          });
        } catch {
          // Best-effort — don't block navigation on failure
        }
      }
    }

    goNext(currentStep.skipTo);
  }

  // ── Keyboard shortcut (Enter to advance) ─────────────────────────────────
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitAndAdvance();
    }
  }

  // ── Render input widget for current step ─────────────────────────────────
  function renderInput() {
    if (!currentStep) return null;

    switch (currentStep.inputType) {
      // ── Button chips ────────────────────────────────────────────────────
      case "chips":
      case "slot_interval":
      case "buffer_time":
      case "advance_window":
      case "cancellation": {
        const opts = currentStep.options ?? [];
        const selected = String(localValue ?? "");
        return (
          <div className={`grid gap-2 ${opts.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {opts.map(opt => (
              <Chip
                key={opt.value}
                option={opt}
                selected={selected === opt.value}
                onClick={() => {
                  setLocalValue(opt.value);
                  // For these simple chips, auto-advance after a short delay
                  if (["slot_interval","buffer_time","advance_window","cancellation","chips"].includes(currentStep.inputType)) {
                    setTimeout(() => {
                      // Only save to answers if this step has an answer key
                      if (currentStep.answerKey) {
                        setAnswer(currentStep.answerKey as keyof typeof answers, opt.value);
                      }
                      goNext();
                    }, 200);
                  }
                }}
              />
            ))}
          </div>
        );
      }

      // ── Yes/No ──────────────────────────────────────────────────────────
      case "yes_no": {
        const current = localValue === true || localValue === "true";
        return (
          <div className="flex gap-3">
            {[{v:true,l:"Yes ✓"},{v:false,l:"No"}].map(opt => (
              <button
                key={String(opt.v)}
                type="button"
                onClick={() => {
                  setLocalValue(opt.v);
                  setTimeout(() => {
                    setAnswer(currentStep.answerKey as keyof typeof answers, opt.v);
                    goNext();
                  }, 200);
                }}
                className="flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all min-h-[44px]"
                style={current === opt.v && localValue !== ""
                  ? {background:PLUM,borderColor:PLUM,color:"#fff"}
                  : {background:"#fff",borderColor:"#D1D5DB",color:"#374151"}}
              >
                {opt.l}
              </button>
            ))}
          </div>
        );
      }

      // ── Text inputs ─────────────────────────────────────────────────────
      case "text":
      case "postcode": {
        return (
          <input
            ref={inputRef}
            type={currentStep.inputType === "postcode" ? "text" : "text"}
            inputMode={currentStep.inputType === "postcode" ? "numeric" : "text"}
            value={String(localValue ?? "")}
            onChange={e => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentStep.placeholder ?? ""}
            maxLength={currentStep.inputType === "postcode" ? 5 : 100}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
        );
      }

      // ── Phone ───────────────────────────────────────────────────────────
      case "phone":
        return <PhoneInput value={String(localValue ?? "")} onChange={setLocalValue} />;

      // ── Address → Places business name lookup ──────────────────────────
      case "address_places": {
        const av = (localValue as AddressPlacesValue | null) ?? { typed: "", address: "", businessName: "", placeId: "" };
        return (
          <AddressPlacesInput
            value={av}
            onChange={v => setLocalValue(v)}
          />
        );
      }

      // ── Name confirmation (Yes / No) ────────────────────────────────────
      case "name_confirm": {
        if (placesDetailsPending) {
          return (
            <div className="flex items-center justify-center gap-2 py-5 text-sm font-medium" style={{ color: PLUM }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching your business details from Google…
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white transition-colors min-h-[44px]"
              style={{ background: PLUM }}
              onClick={async () => {
                // Fetch place-details: hours, phone, website, lat/lng, timezone from Google Places
                const placeId = (answers as Record<string, unknown>).placeId as string | undefined;
                if (placeId) {
                  setPlacesDetailsPending(true);
                  try {
                    const res = await fetch(
                      `/api/google-business/place-details?placeId=${encodeURIComponent(placeId)}`
                    );
                    const data = await res.json();
                    const updates: Record<string, unknown> = {};

                    // Business hours
                    if (Array.isArray(data.openingHours) && data.openingHours.length) {
                      updates.businessHours = convertPlacesHours(data.openingHours);
                    }
                    // Phone
                    if (data.phone) {
                      const digits = String(data.phone).replace(/\D/g, "").slice(-10);
                      if (digits.length === 10) updates.phone = digits;
                    }
                    // Website
                    if (data.website) updates.website = data.website;
                    // Lat / Lng
                    if (data.latitude)  updates.latitude  = data.latitude;
                    if (data.longitude) updates.longitude = data.longitude;
                    // Timezone — derive from utcOffset + known state for accuracy
                    if (typeof data.utcOffset === "number") {
                      const tz = deriveTimezoneFromPlaces(data.utcOffset, answers.state);
                      if (tz) {
                        updates.timezone = tz;
                        updates.timezoneAutoConfirmed = true;
                      }
                    }

                    if (Object.keys(updates).length) {
                      setAnswers(updates as Partial<typeof answers>);
                    }
                  } catch {
                    // Non-fatal — proceed without details
                  } finally {
                    setPlacesDetailsPending(false);
                  }
                }
                goNext("phone");
              }}
            >
              ✓ Yes, that's us!
            </button>
            <button
              type="button"
              className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-700 transition-colors min-h-[44px]"
              onClick={() => {
                // No — restore the name the user originally typed and continue
                setAnswers({ businessName: userEnteredName || answers.businessName, placeId: "" });
                goNext("phone");
              }}
            >
              That's not right — use the name I entered
            </button>
          </div>
        );
      }

      // ── Zip lookup → auto-fill city + state ────────────────────────────
      case "zip_lookup": {
        const zv = (localValue as { zip?: string; city?: string; state?: string; _tz?: string }) ?? {};
        return (
          <ZipLookupInput
            value={{ zip: zv.zip ?? "", city: zv.city ?? "", state: zv.state ?? "" }}
            onChange={v => {
              setLocalValue(v);
              // Auto-set timezone when state resolves
              if ((v as { _tz?: string })._tz) {
                setAnswers({ timezone: (v as { _tz?: string })._tz! });
              }
            }}
          />
        );
      }

      // ── Timezone ────────────────────────────────────────────────────────
      case "timezone":
        if ((answers as Record<string, unknown>).timezoneAutoConfirmed) {
          const tzLabel = TIMEZONES.find(t => t.value === answers.timezone)?.label ?? answers.timezone ?? "";
          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-green-50 border border-green-200" style={{ color: "#15803d" }}>
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>Timezone confirmed from Google Maps — <strong>{tzLabel}</strong></span>
              </div>
              <button
                type="button"
                className="text-xs underline text-gray-400 self-start px-1"
                onClick={() => {
                  setAnswers({ timezoneAutoConfirmed: false } as Partial<typeof answers>);
                }}
              >
                Change timezone
              </button>
            </div>
          );
        }
        return (
          <TimezoneWidget
            value={String(localValue ?? answers.timezone ?? "America/New_York")}
            onChange={v => {
              setLocalValue(v);
              setAnswer("timezone", v);
              setTimeout(() => goNext(), 200);
            }}
          />
        );

      // ── Hours natural language ──────────────────────────────────────────
      case "hours_natural":
        return (
          <HoursNaturalInput
            hours={(localValue as DayHoursAnswer[]) ?? []}
            onHours={v => setLocalValue(v)}
          />
        );

      // ── Hours manual ────────────────────────────────────────────────────
      case "hours_manual":
        return (
          <HoursManualInput
            hours={(localValue as DayHoursAnswer[]) ?? []}
            onHours={v => setLocalValue(v)}
          />
        );

      // ── Website name (subdomain slug) ───────────────────────────────────
      case "website_name":
        return (
          <WebsiteNameInput
            value={String(localValue ?? "")}
            onChange={v => setLocalValue(v)}
            suggestedSlug={slugify(answers.businessName ?? "my-salon")}
          />
        );

      // ── Website template picker ──────────────────────────────────────────
      case "website_template_pick":
        return (
          <WebsiteTemplatePick
            selected={String(localValue ?? "")}
            onSelect={v => {
              setLocalValue(v);
              setAnswer("websiteTemplateId" as keyof typeof answers, v as unknown as string);
              commitAndAdvance();
            }}
          />
        );

      // ── Services method ─────────────────────────────────────────────────
      case "services_method": {
        const opts: ChipOption[] = [
          { value: "upload", label: "Upload my menu", emoji: "📷" },
          { value: "manual", label: "Add manually",   emoji: "✏️" },
          { value: "skip",   label: "Skip for now",   emoji: "⏭️" },
        ];
        return (
          <div className="flex flex-col gap-2">
            {opts.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setLocalValue(opt.value);
                  setAnswer("servicesMethod", opt.value);
                  if (opt.value === "upload") goNext("services_upload");
                  else if (opt.value === "manual") goNext("services_manual");
                  else goNext("google_setup");
                }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-left hover:border-purple-400 transition-colors min-h-[44px]"
              >
                <span className="text-lg">{opt.emoji}</span>
                {opt.label}
              </button>
            ))}
          </div>
        );
      }

      // ── File upload (with real extraction) ─────────────────────────────
      case "file_upload": {
        // Processing state — job submitted, waiting on AI
        if (svcJobId && svcJobStatus !== "failed") {
          return (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-5 text-center space-y-3">
              <Loader2 size={28} className="mx-auto animate-spin text-purple-600" />
              <p className="text-sm font-medium text-purple-800">Extracting your services…</p>
              <p className="text-xs text-purple-600">This usually takes 10–20 seconds. Hang tight!</p>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            {svcJobError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                <AlertCircle size={14} /> {svcJobError}
              </div>
            )}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center space-y-2">
              <Upload size={24} className="mx-auto text-gray-400" />
              <p className="text-sm text-gray-600">Drop a photo, PDF, or image of your price list</p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { setSvcFile(f); setLocalValue(f.name); setSvcJobError(null); }
                }}
                className="hidden"
                id="svc-file"
              />
              <label
                htmlFor="svc-file"
                className="inline-block cursor-pointer px-4 py-2 rounded-xl text-sm font-medium text-white"
                style={{background: PLUM}}
              >
                Browse files
              </label>
              {svcFile && (
                <p className="text-xs text-green-600 flex items-center justify-center gap-1">
                  <Check size={12} /> {svcFile.name}
                </p>
              )}
            </div>
            {svcFile && (
              <button
                type="button"
                disabled={svcUploading}
                onClick={async () => {
                  setSvcUploading(true);
                  setSvcJobError(null);
                  try {
                    const fd = new FormData();
                    fd.append("importType", svcFile.type === "application/pdf" ? "pdf" : "photos");
                    fd.append("files", svcFile);
                    const res = await fetch("/api/service-import/upload", {
                      method: "POST",
                      credentials: "include",
                      body: fd,
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error((err as any).error ?? "Upload failed");
                    }
                    const data = await res.json();
                    setSvcJobId(data.jobId);
                    setSvcJobStatus("pending");
                  } catch (e: any) {
                    setSvcJobError(e.message ?? "Upload failed. Please try again.");
                    setSvcUploading(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{background: PLUM}}
              >
                {svcUploading ? <><Loader2 size={16} className="animate-spin" /> Uploading…</> : <><Sparkles size={16} /> Extract My Services</>}
              </button>
            )}
          </div>
        );
      }

      // ── Services manual ─────────────────────────────────────────────────
      case "services_manual":
        return (
          <ServicesManualInput
            services={(answers.services ?? []) as ServiceDraft[]}
            onChange={svcs => setAnswer("services", svcs)}
          />
        );

      // ── Services review (after AI extraction) ───────────────────────────
      case "services_review": {
        const totalSvcs = svcCategories.reduce((acc, c) => acc + c.services.length, 0);

        const updateService = (catIdx: number, svcIdx: number, field: string, val: string | number) => {
          setSvcCategories(prev => prev.map((cat, ci) =>
            ci !== catIdx ? cat : {
              ...cat,
              services: cat.services.map((s, si) =>
                si !== svcIdx ? s : { ...s, [field]: val }
              ),
            }
          ));
        };

        const removeService = (catIdx: number, svcIdx: number) => {
          setSvcCategories(prev =>
            prev.map((cat, ci) =>
              ci !== catIdx ? cat : { ...cat, services: cat.services.filter((_, si) => si !== svcIdx) }
            ).filter(cat => cat.services.length > 0)
          );
        };

        return (
          <div className="space-y-3">
            {svcCategories.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
                <AlertCircle size={16} /> No services were detected. Try uploading a clearer image or add them manually.
              </div>
            )}

            {svcCategories.map((cat, ci) => (
              <div key={ci} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-800">{cat.name}</span>
                  <button
                    type="button"
                    onClick={() => setSvcCategories(prev => prev.filter((_, i) => i !== ci))}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {cat.services.map((svc, si) => {
                    const isEditing = svcEditingService?.catIdx === ci && svcEditingService?.svcIdx === si;
                    if (isEditing) {
                      return (
                        <div key={si} className="p-3 space-y-2 bg-purple-50">
                          <input
                            className="w-full rounded-lg border border-purple-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                            value={svcEditForm.name}
                            onChange={e => setSvcEditForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Service name"
                          />
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-full rounded-lg border border-purple-300 pl-6 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                value={svcEditForm.price}
                                onChange={e => setSvcEditForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                                placeholder="Price"
                              />
                            </div>
                            <div className="flex-1 relative">
                              <input
                                type="number"
                                min="5"
                                step="5"
                                className="w-full rounded-lg border border-purple-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                value={svcEditForm.duration}
                                onChange={e => setSvcEditForm(f => ({ ...f, duration: parseInt(e.target.value) || 60 }))}
                                placeholder="Mins"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">min</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                updateService(ci, si, "name", svcEditForm.name);
                                updateService(ci, si, "price", svcEditForm.price);
                                updateService(ci, si, "duration", svcEditForm.duration);
                                setSvcEditingService(null);
                              }}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white"
                              style={{ background: PLUM }}
                            >
                              <Check size={12} className="inline mr-1" />Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setSvcEditingService(null)}
                              className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={si} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{svc.name}</p>
                          <p className="text-xs text-gray-500">${Number(svc.price).toFixed(2)} · {svc.duration} min</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => { setSvcEditingService({ catIdx: ci, svcIdx: si }); setSvcEditForm({ name: svc.name, price: svc.price, duration: svc.duration }); }}
                            className="text-gray-400 hover:text-purple-600 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeService(ci, si)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              type="button"
              disabled={svcPublishing || totalSvcs === 0}
              onClick={async () => {
                const nonEmpty = svcCategories.filter(c => c.services.length > 0);
                if (nonEmpty.length === 0) return;
                setSvcPublishing(true);
                try {
                  const res = await fetch("/api/service-import/publish", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ jobId: svcJobId, categories: nonEmpty }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error((err as any).error ?? "Publish failed");
                  }
                  goNext("google_setup");
                } catch (e: any) {
                  setSvcPublishing(false);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: PLUM }}
            >
              {svcPublishing
                ? <><Loader2 size={16} className="animate-spin" /> Publishing…</>
                : <><Check size={16} /> Publish {totalSvcs} Service{totalSvcs !== 1 ? "s" : ""}</>
              }
            </button>
          </div>
        );
      }

      // ── Team size ───────────────────────────────────────────────────────
      case "team_size": {
        const opts = currentStep.options ?? [];
        return (
          <div className="flex flex-col gap-2">
            {opts.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setLocalValue(opt.value);
                  setAnswer("teamSize", opt.value);
                  setTimeout(() => {
                    if (opt.value === "team") goNext("team_member_name");
                    else goNext("slot_interval");
                  }, 200);
                }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-left hover:border-purple-400 transition-colors min-h-[44px]"
              >
                {opt.emoji && <span className="text-lg">{opt.emoji}</span>}
                {opt.label}
              </button>
            ))}
          </div>
        );
      }

      // ── Staff name ──────────────────────────────────────────────────────
      case "staff_name": {
        const nv = (localValue as { firstName?: string; lastName?: string }) ?? {};
        return (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={nv.firstName ?? ""}
              onChange={e => setLocalValue({...nv, firstName: e.target.value})}
              placeholder="First name"
              className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-purple-600"
            />
            <input
              type="text"
              value={nv.lastName ?? ""}
              onChange={e => setLocalValue({...nv, lastName: e.target.value})}
              placeholder="Last name"
              className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-purple-600"
            />
          </div>
        );
      }

      // ── Staff email ─────────────────────────────────────────────────────
      case "staff_email":
        return (
          <input
            ref={inputRef}
            type="email"
            value={String(localValue ?? "")}
            onChange={e => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentStep.placeholder ?? ""}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-purple-600"
          />
        );

      // ── Staff role ──────────────────────────────────────────────────────
      case "staff_role": {
        const opts = currentStep.options ?? [];
        const selected = String(localValue ?? "");
        return (
          <div className="grid grid-cols-2 gap-2">
            {opts.map(opt => (
              <Chip
                key={opt.value}
                option={opt}
                selected={selected === opt.value}
                onClick={() => {
                  setLocalValue(opt.value);
                  setTimeout(() => {
                    setCurrentMember({ role: opt.value });
                    goNext("team_member_hours");
                  }, 200);
                }}
              />
            ))}
          </div>
        );
      }

      // ── Staff hours ─────────────────────────────────────────────────────
      case "staff_hours": {
        const hv = (localValue as { workDays?: number[]; workStart?: string; workEnd?: string }) ?? {};
        return (
          <StaffHoursInput
            workDays={hv.workDays ?? [1,2,3,4,5]}
            workStart={hv.workStart ?? "09:00"}
            workEnd={hv.workEnd ?? "18:00"}
            onChange={(days,start,end) => setLocalValue({workDays:days,workStart:start,workEnd:end})}
          />
        );
      }

      // ── Team add more ───────────────────────────────────────────────────
      case "team_add_more": {
        const memberName = session.currentMember?.firstName ?? "Your team member";
        return (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => { setAddMore(true); commitCurrentMember(); goNext("team_member_name"); }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-sm font-medium hover:border-purple-400 transition-colors min-h-[44px]"
            >
              <span className="text-lg">➕</span> Add another team member
            </button>
            <button
              type="button"
              onClick={() => { commitCurrentMember(); goNext("slot_interval"); }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-white transition-colors min-h-[44px]"
              style={{background:PLUM}}
            >
              <span className="text-lg">✓</span> I'm done — {answers.teamMembers && answers.teamMembers.length > 0 ? `${answers.teamMembers.length + 1} member${answers.teamMembers.length > 0 ? 's' : ''}` : `just ${memberName}`}
            </button>
          </div>
        );
      }

      // ── Deposit ─────────────────────────────────────────────────────────
      case "deposit": {
        const dv = (localValue as { required?: boolean; pct?: number }) ?? {};
        return (
          <DepositInput
            required={dv.required ?? false}
            pct={dv.pct ?? 20}
            onRequired={v => setLocalValue({...(dv as object),required:v})}
            onPct={v => setLocalValue({...(dv as object),pct:v})}
          />
        );
      }

      // ── Review ──────────────────────────────────────────────────────────
      case "review":
        return (
          <ReviewCard
            session={session}
            onEdit={stepId => {
              goToStep(stepId);
            }}
          />
        );

      case "google_setup": {
        const storeId = session.createdStoreId;
        if (!storeId) {
          return (
            <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: PLUM }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Finishing your business setup…
            </div>
          );
        }
        return (
          <OnboardingGoogleStep
            storeId={storeId}
            salonName={answers.businessName ?? ""}
            salonAddress={[answers.address, answers.city, answers.state, answers.postcode].filter(Boolean).join(", ")}
            salonPhone={answers.phone ?? ""}
            placeId={(answers as Record<string, unknown>).placeId as string | undefined}
            onSkip={() => goNext("team_intro")}
            onComplete={() => goNext("team_intro")}
          />
        );
      }

      default:
        return null;
    }
  }

  // ── Show "Continue" button logic ──────────────────────────────────────────
  function shouldShowContinueButton(): boolean {
    if (!currentStep) return false;
    const noButton: typeof currentStep.inputType[] = [
      "display_only","chips","slot_interval","buffer_time",
      "advance_window","cancellation","yes_no","services_method",
      "team_size","staff_role","team_add_more","timezone","name_confirm","google_setup",
      "website_template_pick",
    ];
    return !noButton.includes(currentStep.inputType);
  }

  const isReviewStep = currentStep?.inputType === "review";
  const isGoogleStep = currentStep?.inputType === "google_setup";
  const currentPhase = currentStep?.phase;

  // Phase index for the phase dots
  const phaseIdx = PHASES.indexOf(currentPhase ?? "");

  if (!user) return null;

  return (
    <div
      className="flex flex-col h-screen max-w-lg mx-auto"
      style={{ background: LIGHT, fontFamily: "system-ui, sans-serif" }}
    >
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: PLUM }}
            >
              <Sparkles size={14} color={GOLD} />
            </div>
            <span className="font-bold text-sm" style={{ color: PLUM }}>Certxa Setup</span>
          </div>
          <div className="flex items-center gap-1">
            {PHASES.map((phase, i) => (
              <div
                key={phase}
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  background: i < phaseIdx ? GOLD
                    : i === phaseIdx ? PLUM
                    : "#E5E7EB",
                  transform: i === phaseIdx ? "scale(1.25)" : "scale(1)",
                }}
                title={phase}
              />
            ))}
          </div>
        </div>
        <ProgressBar pct={progressPct} phase={currentPhase} />
      </div>

      {/* ── Chat history ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-2"
      >
        {chatHistory.map((entry, idx) => (
          <div
            key={entry.id}
            className={`flex ${entry.type === "ai" ? "justify-start" : "justify-end"}`}
          >
            {entry.type === "ai" ? (
              <AiBubble
                text={entry.content}
                isNew={idx === chatHistory.length - 1 && entry.type === "ai"}
              />
            ) : (
              <UserBubble
                text={entry.content}
                onEdit={() => goToStep(entry.stepId)}
              />
            )}
          </div>
        ))}

        {/* Typing indicator while submitting */}
        {isSubmitting && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-200">
              <div className="flex gap-1.5 items-center">
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay:"0ms"}}/>
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay:"150ms"}}/>
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay:"300ms"}}/>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky input area ── */}
      <div
        className="sticky bottom-0 bg-white border-t border-gray-200 px-4 pt-4 pb-6"
        style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}
      >
        {/* Submit error */}
        {submitError && (
          <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{submitError}</p>
              <button onClick={clearSubmitError} className="text-xs text-red-500 underline mt-1">Dismiss</button>
            </div>
          </div>
        )}

        {/* Input widget */}
        {currentStep && currentStep.inputType !== "display_only" && (
          <div className="mb-3">
            {validationError && (
              <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
                <AlertCircle size={12} /> {validationError}
              </p>
            )}
            {renderInput()}
          </div>
        )}

        {/* Continue / Submit / Skip buttons */}
        <div className="space-y-2">
          {isReviewStep ? (
            <button
              type="button"
              onClick={submit}
              disabled={isSubmitting}
              className="w-full py-4 rounded-xl text-base font-bold text-white transition-opacity flex items-center justify-center gap-2 min-h-[52px]"
              style={{ background: isSubmitting ? "#9CA3AF" : PLUM }}
            >
              {isSubmitting ? (
                <><Loader2 size={18} className="animate-spin"/> Setting up your salon…</>
              ) : (
                <><Sparkles size={18} /> Complete Setup</>
              )}
            </button>
          ) : isGoogleStep ? null : placesLookupPending ? (
            <div
              className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 min-h-[44px]"
              style={{ background: "#F3F4F6", color: PLUM }}
            >
              <Loader2 size={16} className="animate-spin" />
              Looking up your business on Google…
            </div>
          ) : shouldShowContinueButton() ? (
            <button
              type="button"
              onClick={() => commitAndAdvance()}
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-colors flex items-center justify-center gap-2 min-h-[44px]"
              style={{ background: PLUM }}
            >
              Continue <ChevronRight size={16} />
            </button>
          ) : null}

          {/* Skip + Back + Exit row */}
          {!isGoogleStep && <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1 min-h-[44px]"
            >
              <ChevronLeft size={15} /> Back
            </button>
            <div className="flex items-center gap-4">
              {currentStep?.skippable && (
                <button
                  type="button"
                  onClick={skipStep}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors py-1 min-h-[44px]"
                >
                  Skip for now →
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate("/manage")}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors py-1 min-h-[44px]"
              >
                Exit
              </button>
            </div>
          </div>}
        </div>
      </div>

      <style>{`
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}

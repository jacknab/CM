/**
 * SoloTheme — the "Solo" website for Certxa Pro app accounts (owner, 2026-11-04): a copy of Bloom (BloomTheme.tsx), made
 * its own so it can be shaped for one independent pro without changing Bloom for full-platform salons. Picked in the
 * app's "Pick a design" step; every Certxa Pro account on Bloom was moved to it (migration 0304).
 *
 * Started from BloomTheme — public booking page built to match the nail-salon-bloom website template.
 *
 * Sections (in order):
 *   Header → tabs (About · Services · [Portfolio]) → Footer
 *   One tab shows at a time, so the page is not one long scroll (owner, 2026-11-04). The tab is in the address
 *   (#about, #services, #portfolio), so the menu links, the footer links and shared links open the right one.
 *   About holds the rating, the pro's about text, business hours, cancellation policy, contact details and reviews.
 *
 * Booking flow opens as a slide-in panel from the right, matching the
 * BookingPanel in templates-storage/nail-salon-bloom/project/src/components/BookingPanel.tsx
 */
import { storeAddressLine } from "@/lib/storeAddress";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Facebook,
  Instagram,
  Loader2,
  MapPin,
  Menu,
  ShoppingCart,
  Phone,
  Star,
  Users,
  X,
  ZoomIn,
} from "lucide-react";
import { formatInTz } from "@/lib/timezone";
import { TimeZoneNote } from "./TimeZoneNote";
import { facebookUrl, instagramUrl, siteStyle } from "./SiteLook";
import { useCancellationPolicy } from "@/hooks/use-public-booking";
import { CancellationPolicyConsent } from "./CancellationPolicyConsent";
import SoloShop, { type ShopData, type ShopView } from "./SoloShop";
import SiteLegal from "./SiteLegal";
import SiteMessage from "./SiteMessage";
import { SoloCart, type CartLine } from "./SoloCart";
import { SoloPay, SoloSaveCard, type DepositHold } from "./SoloPay";
import { toast } from "@/hooks/use-toast";
import { MAX_VISIT_MINUTES, bookingServiceFields, canAddService, extraServiceQuery } from "./twoServices";
import type { AddonData, ServiceAddonData, StoreData } from "./types";
import { useHouseCall, HouseCallFields } from "./houseCall";

// ── Color tokens (mapped from nail-salon-bloom tailwind.config.js) ─────────────
const C = {
  // The business's accent colour when it picked one (SiteLook.tsx siteStyle), else Bloom's gold.
  gold700: "var(--site-accent, #B45309)",
  gold600: "var(--site-accent, #D97706)",
  gold50:  "#FFFBEB",
  rose600: "#f39aad",
  rose700: "#e9839d",
  rose50:  "#FFF1F2",
  rose100: "#FFE4E6",
  cream50:  "#FDFCFA",
  cream100: "#F8F5F0",
  cream200: "#EDE8DF",
  cream300: "#D8D0C4",
  ink900:  "#1A1814",
  ink800:  "#2C2925",
  ink700:  "#4A4540",
  ink600:  "#6B6560",
  ink500:  "#8C8680",
  ink400:  "#B0ABA5",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceEntry {
  id: number;
  name: string;
  price: string | number;
  duration?: number;
  description?: string;
  category?: string;
  categoryId?: number;
  imageUrl?: string | null;
  offeredAt?: string | null;
}

interface ServiceCategoryEntry {
  id: number;
  name: string;
}

/** The chosen colour, faintly: a selected service. */
const TINT = "color-mix(in srgb, var(--site-accent, #B45309) 12%, white)";

function CheckDot({ on, small }: { on: boolean; small?: boolean }) {
  const size = small ? "h-5 w-5" : "h-6 w-6";
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full border`} style={{ background: on ? C.gold700 : "transparent", borderColor: on ? C.gold700 : C.cream300 }} aria-hidden="true">
      {on && <Check className={small ? "h-3 w-3" : "h-3.5 w-3.5"} color="#fff" strokeWidth={3} />}
    </span>
  );
}

/** The photos a client added to their review, tap to see one full size. */
function ReviewPhotos({ urls, large }: { urls?: string[] | string | null; large?: boolean }) {
  const list = Array.isArray(urls) ? urls : urls ? [urls] : [];
  if (list.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="solo-review-photos">
      {list.map((url) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the review photo" className={large ? "block w-full" : undefined}>
          <img src={url} alt="Photo from the client's review" loading="lazy" className={large ? "aspect-[4/3] w-full rounded-xl object-cover" : "h-40 w-40 rounded-xl object-cover"} />
        </a>
      ))}
    </div>
  );
}

interface GoogleReviewEntry {
  id: number;
  customerName?: string | null;
  rating?: number | null;
  reviewText?: string | null;
  /** The business owner's reply — only Certxa's own reviews have one. */
  ownerResponse?: string | null;
  reviewImageUrls?: string[] | string | null;
  reviewerPhotoUrl?: string | null;
  reviewMediaItems?: Array<Record<string, unknown>> | null;
  /** Only present on Certxa's own native reviews — a synced Google review never has this. */
  serviceName?: string | null;
  staffName?: string | null;
  reviewCreateTime?: string | null;
}

/** Mirrors ServiceReviewResult from serviceReviewMatcher.ts — one per service, keyed by service ID */
interface ServiceReviewEntry {
  serviceId: number;
  customerName: string | null;
  rating: number;
  comment: string;
  createdAt: string | null;
  /** Client-uploaded nail-work photo (never a reviewer headshot) */
  photoUrl: string | null;
  /** Google reviewer profile picture — safe to use as avatar */
  reviewerAvatarUrl: string | null;
  reviewMediaItems: Array<Record<string, unknown>>;
  ownerReply: Record<string, unknown> | null;
}

interface TimeSlot {
  time: string;
  staffId: number;
  staffName: string;
}

type SoloTab = "about" | "services" | "portfolio";
const SOLO_TABS: { id: SoloTab; label: string }[] = [
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "portfolio", label: "Portfolio" },
];

interface GalleryPhoto {
  /** "Book this look": the service this photo shows, when the pro chose one. */
  service_id?: number | null;
  image_url: string;
  caption?: string | null;
}

type BookingStep = "date" | "details" | "card" | "payment" | "success";

interface BloomThemeProps {
  store: StoreData;
  slug: string;
  preselectedStaffId?: number;
  preselectedServiceId?: number;
}

// ── Static fallbacks ──────────────────────────────────────────────────────────

// Per-service-type Pexels fallback images — keyed to match the template's categoryKey buckets.
const FALLBACK_IMAGES: Record<string, string> = {
  manicure:  "https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=800",
  pedicure:  "https://images.pexels.com/photos/3997388/pexels-photo-3997388.jpeg?auto=compress&cs=tinysrgb&w=800",
  extension: "https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=800",
  art:       "https://images.pexels.com/photos/3997387/pexels-photo-3997387.jpeg?auto=compress&cs=tinysrgb&w=800",
  addon:     "https://images.pexels.com/photos/3997392/pexels-photo-3997392.jpeg?auto=compress&cs=tinysrgb&w=800",
};

/** Pick the most relevant Pexels fallback for a service based on its name + category. */
function pickFallbackImage(svc: ServiceEntry, categoryName?: string): string {
  const lc = `${svc.name ?? ""} ${categoryName ?? svc.category ?? ""}`.toLowerCase();
  if (lc.includes("pedicure") || lc.includes(" pedi") || lc.includes("foot service") || lc.includes("toenail"))
    return FALLBACK_IMAGES.pedicure;
  if (
    lc.includes("acrylic") || lc.includes("full set") || lc.includes("new set") ||
    lc.includes("extension") || lc.includes("gel-x") || lc.includes("gelx") ||
    lc.includes("hard gel") || lc.includes("builder gel") || lc.includes("gel set") ||
    lc.includes("dip powder") || lc.includes(" dip") || lc.includes("sns") ||
    lc.includes("nexgen") || lc.includes("nail overlay")
  ) return FALLBACK_IMAGES.extension;
  if (
    lc.includes("nail art") || lc.includes("nail design") || lc.includes("chrome") ||
    lc.includes("ombre") || lc.includes("glitter") || lc.includes("3d nail") ||
    lc.includes("rhinestone") || lc.includes("encapsulated")
  ) return FALLBACK_IMAGES.art;
  if (
    lc.includes("add-on") || lc.includes("addon") || lc.includes("add on") ||
    lc.includes("extra") || lc.includes("paraffin") || lc.includes("hot stone") ||
    lc.includes("callus") || lc.includes("cuticle") || lc.includes("nail repair")
  ) return FALLBACK_IMAGES.addon;
  return FALLBACK_IMAGES.manicure;
}

const DAY_NAMES   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getWeekStart(baseOffset: number): Date {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(today);
  d.setDate(today.getDate() + baseOffset * 7);
  return d;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function isPast(d: Date): boolean {
  const t = new Date();
  t.setHours(0,0,0,0);
  return d < t;
}

function formatSlotTime(isoStr: string, timezone: string): string {
  try { return formatInTz(isoStr, timezone, "h:mm a"); }
  catch { return isoStr; }
}

function formatPrice(price: string | number): string {
  const n = typeof price === "string" ? parseFloat(price) : price;
  return isNaN(n) || n === 0 ? "POA" : `$${n}`;
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour   = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2,"0")} ${period}`;
}

function parseReviewImageUrls(input?: string | null): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === "string") : [];
  } catch { return []; }
}

function extractMediaPhotoUrl(media?: Array<Record<string, unknown>> | null): string | null {
  if (!Array.isArray(media)) return null;
  for (const item of media) {
    const direct = item?.googleUrl ?? item?.sourceUrl ?? item?.url ?? item?.thumbnailUrl;
    if (typeof direct === "string" && direct.trim()) return direct;
  }
  return null;
}

function extractCity(address?: string): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim());
  // "123 Main St, Houston, TX 77001" → parts[1] = "Houston"
  if (parts.length >= 3) return parts[parts.length - 3] || "";
  if (parts.length === 2) return parts[1] || "";
  return "";
}

function formatBusinessHours(businessHours?: StoreData["businessHours"]): { day: string; time: string }[] {
  if (!businessHours?.length) return [];
  return [...businessHours]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((h) => ({
      day: DAY_NAMES[h.dayOfWeek],
      time: h.isClosed
        ? "Closed"
        : `${formatTime12h(h.openTime)} – ${formatTime12h(h.closeTime)}`,
    }));
}

function buildDirectionsUrl(address?: string): string {
  if (!address) return "https://maps.google.com";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// ── StarRow ───────────────────────────────────────────────────────────────────
function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

// ── Slide-in Booking Panel ────────────────────────────────────────────────────
interface BookingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  store: StoreData;
  slug: string;
  /** The services and add-ons chosen on the page: the panel starts at the date. */
  chosen: ServiceEntry[];
  chosenAddons: AddonData[];
  onBooked: () => void;
  preselectedStaffId?: number;
  timezone: string;
}

function BookingPanel({
  isOpen,
  onClose,
  store,
  slug,
  chosen: selected,
  chosenAddons,
  onBooked,
  preselectedStaffId,
  timezone,
}: BookingPanelProps) {
  const [step, setStep]                 = useState<BookingStep>("date");
  // Up to two services on one visit (twoServices.ts); the first decides the visit's start.
  const selectedService = selected[0] ?? null;
  const picked = selected.map((x) => ({ id: x.id, duration: x.duration ?? 60 }));
  const totalMinutes = picked.reduce((sum, x) => sum + x.duration, 0) + chosenAddons.reduce((sum, a) => sum + (Number(a.duration) || 0), 0);
  const totalPrice = selected.reduce((sum, x) => sum + Number(x.price ?? 0), 0) + chosenAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const summary = [...selected.map((x) => x.name), ...chosenAddons.map((a) => a.name)].join(" + ");
  const visitLength = totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)} hr${totalMinutes % 60 ? ` ${totalMinutes % 60} min` : ""}` : `${totalMinutes} min`;
  const hc = useHouseCall(store, slug, selected);
  const [weekOffset, setWeekOffset]     = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots]               = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError]     = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cancellationAccepted, setCancellationAccepted] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  // A business that reviews each booking first answers by text, so the box is needed there.
  const smsConsentNeeded = store.bookingApproval === "manual";
  const smsConsentText = `Text me appointment confirmations, reminders and follow-ups from ${store.name}. Message frequency varies. Msg & data rates may apply. Reply STOP to stop or HELP for help.`;
  const [payPolicy, setPayPolicy] = useState<{ policy: string; depositType?: string | null; depositValue?: number | null; depositIncludeTravelFee?: boolean; stripePublishableKey?: string | null; stripeConnectedAccountId?: string | null } | null>(null);
  const [hold, setHold] = useState<DepositHold | null>(null);
  const [cardAttempt, setCardAttempt] = useState(0);
  useEffect(() => {
    if (!isOpen || !slug) return;
    fetch(`/api/public/booking-payment-policy/${slug}`).then((r) => (r.ok ? r.json() : null)).then(setPayPolicy).catch(() => setPayPolicy(null));
  }, [isOpen, slug]);
  // Shown to the client; the server works out the amount itself (lib/bookingPaymentLinks.ts depositFromRule).
  const depositBase = totalPrice + (payPolicy?.depositIncludeTravelFee ? hc.travelFee : 0);
  const depositDue = payPolicy?.policy !== "deposit" ? 0
    : payPolicy.depositType === "full" ? depositBase
    : payPolicy.depositType === "percentage" ? (depositBase * (payPolicy.depositValue ?? 0)) / 100
    : Math.min(depositBase, payPolicy.depositValue ?? 0);
  const paysInFull = depositDue > 0 && depositDue >= totalPrice + hc.travelFee;
  const payOnPage = !!payPolicy?.stripePublishableKey && !!payPolicy.stripeConnectedAccountId;
  const savesCard = payPolicy?.policy === "card_on_file";
  const cancelPolicy = useCancellationPolicy(slug);
  const cancelAckNeeded = !!cancelPolicy.data?.required && !!cancelPolicy.data?.text;


  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setStep("date");
    setHold(null);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate(today);
    setSlots([]);
    setSelectedSlot(null);
    setWeekOffset(0);
    setName(""); setPhone(""); setEmail(""); setSmsConsent(false);
    setSubmitError(null); setSlotsError(null);
  }, [isOpen]);

  // Auto-select today whenever we enter the date step and nothing is selected
  useEffect(() => {
    if (step === "date" && selectedDate === null) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setSelectedDate(today);
    }
  }, [step, selectedDate]);

  // Keyboard close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Fetch slots when date selected
  useEffect(() => {
    if (!selectedDate || !selectedService || !slug || !hc.ready) return;
    setSlotsLoading(true); setSlotsError(null); setSlots([]); setSelectedSlot(null);
    const params = new URLSearchParams({
      serviceId: String(selectedService.id),
      date: toDateKey(selectedDate),
      duration: String(totalMinutes),
      ...extraServiceQuery(picked),
    });
    if (preselectedStaffId) params.set("staffId", String(preselectedStaffId));
    hc.applyParams(params);
    fetch(`/api/public/store/${slug}/availability?${params}`)
      .then((r) => r.ok ? r.json() : Promise.reject("error"))
      .then((d) => { setSlots(Array.isArray(d) ? d : []); })
      .catch(() => setSlotsError("Could not load availability. Please try another date."))
      .finally(() => setSlotsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selected, slug, preselectedStaffId, hc.ready, hc.timesKey]);

  const handleBook = useCallback(async (card?: { setupIntentId: string; paymentMethodId?: string; customerId: string }) => {
    if (!selectedService || !selectedSlot || !name.trim() || !phone.trim()) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await fetch(`/api/public/store/${slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          serviceId: selectedService.id,
          staffId: selectedSlot.staffId,
          date: selectedSlot.time,
          ...bookingServiceFields(picked),
          addonIds: chosenAddons.map((a) => a.id),
          payStep: payOnPage ? "page" : "link",
          ...(card ? { stripeSetupIntentId: card.setupIntentId, stripePaymentMethodId: card.paymentMethodId, stripeCustomerId: card.customerId } : {}),
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim() || undefined,
          cancellationPolicyAccepted: cancellationAccepted,
          smsConsent,
          smsConsentText,
          ...hc.bookFields,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? "Booking failed. Please try again.");
      }
      // A deposit is due (the business takes one and this page can't): go straight to paying it.
      const booked = await res.json().catch(() => null);
      if (booked?.depositHold?.token && payOnPage) { setHold(booked.depositHold); setStep("payment"); return; }
      if (booked?.depositHold?.paymentUrl) { window.location.assign(booked.depositHold.paymentUrl); return; }
      setStep("success");
      onBooked();
    } catch (err: any) {
      setSubmitError(err.message ?? "Something went wrong. Please try again.");
      if (card) setCardAttempt((n) => n + 1); // that card is used: a fresh form for another try
    } finally {
      setSubmitting(false);
    }
  }, [selected, chosenAddons, onBooked, selectedService, selectedSlot, name, phone, email, slug, cancellationAccepted, smsConsent, hc.bookFields]);

  const weekStart = getWeekStart(weekOffset);
  const weekDays  = getWeekDays(weekStart);

  // By the business's clock, like the times shown: a visitor elsewhere still sees 9 AM under Morning.
  const slotGroups = useMemo(() => {
    const hourOf = (iso: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
    return {
      Morning:   slots.filter((s) => hourOf(s.time) < 12),
      Afternoon: slots.filter((s) => { const h = hourOf(s.time); return h >= 12 && h < 17; }),
      Evening:   slots.filter((s) => hourOf(s.time) >= 17),
    };
  }, [slots, timezone]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex"
      role="dialog"
      aria-modal="true"
      aria-label="Book an appointment"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel slides in from right */}
      <div
        className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-hidden shadow-2xl"
        style={{ background: C.cream50, animation: "bloomSlideIn 0.3s ease-out" }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: C.cream200, background: "#fff" }}
        >
          <div className="flex items-center gap-3">
            {(step === "details" || step === "date" || step === "card") && (
              <button
                type="button"
                onClick={() => { if (step === "card") setStep("details"); else if (step === "details") setStep("date"); else onClose(); }}
                className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-gray-100"
                aria-label="Go back"
              >
                <ArrowLeft className="h-4 w-4" style={{ color: C.ink600 }} />
              </button>
            )}
            <div>
              <h2
                className="text-lg font-semibold leading-tight"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              >
                {step === "success" ? (store.bookingApproval === "manual" ? "Request sent" : "You're booked!") : "Book an Appointment"}
              </h2>
              {selectedService && step !== "success" && (
                <p className="mt-0.5 max-w-[240px] truncate text-xs" style={{ color: C.ink500 }}>
                  {summary} · {formatPrice(totalPrice + hc.travelFee)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" style={{ color: C.ink500 }} />
          </button>
        </div>

        {/* Progress bar */}
        {step !== "success" && (
          <div className="flex gap-2 px-5 pt-3">
            {([["service", "Service"], ["date", "Date & time"], ["details", "Your details"]] as [BookingStep, string][]).map(([key, label], i) => {
              const reached = (["service", "date", "details", step === "card" ? "card" : "payment"] as BookingStep[]).indexOf(step) >= i;
              return (
                <div key={key} className="flex-1">
                  <div className="h-1 rounded-full transition-colors duration-300" style={{ background: reached ? C.gold700 : C.cream200 }} />
                  <p className="mt-1 text-[11px] font-medium" style={{ color: reached ? C.ink800 : C.ink400 }}>{label}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* STEP: date */}
          {step === "date" && (
            <div className="px-5 py-5">
              <h3
                className="mb-4 flex items-center gap-2 text-base font-semibold"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              >
                <Calendar className="h-4 w-4" style={{ color: C.gold700 }} />
                Pick a Date
              </h3>
              <HouseCallFields hc={hc} className="mb-5" />
              <div className={hc.ready ? "" : "hidden"}>
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
                  disabled={weekOffset === 0}
                  className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-gray-100 disabled:opacity-30"
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-4 w-4" style={{ color: C.ink500 }} />
                </button>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.ink600 }}>
                  {MONTH_SHORT[weekStart.getMonth()]} {weekStart.getFullYear()}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-gray-100"
                  aria-label="Next week"
                >
                  <ChevronRight className="h-4 w-4" style={{ color: C.ink500 }} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((day) => {
                  const past     = isPast(day);
                  const today    = isToday(day);
                  const selected = selectedDate && toDateKey(day) === toDateKey(selectedDate);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      disabled={past}
                      onClick={() => setSelectedDate(day)}
                      className="flex flex-col items-center rounded-xl py-2.5 text-center transition-all focus:outline-none"
                      style={{
                        background: selected ? C.gold700 : undefined,
                        color: selected ? "#fff" : past ? C.cream300 : today ? C.gold700 : C.ink700,
                        border: today && !selected ? `2px solid ${C.gold700}` : undefined,
                        cursor: past ? "not-allowed" : "pointer",
                      }}
                    >
                      <span className="text-[10px] font-semibold uppercase">{DAY_SHORT[day.getDay()]}</span>
                      <span className="mt-0.5 text-base font-semibold leading-none">{day.getDate()}</span>
                    </button>
                  );
                })}
              </div>

              {selectedDate && (
                <div className="mt-5 rounded-2xl border bg-white p-4" style={{ borderColor: C.cream200 }}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: C.ink900 }}>
                        {DAY_SHORT[selectedDate.getDay()]}, {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getDate()}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: C.ink500 }}>
                        Select a time slot
                      </p>
                      <TimeZoneNote timezone={timezone} at={slots[0]?.time} className="mt-1 text-xs" style={{ color: C.ink500 }} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(null)}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: C.gold700 }}
                    >
                      Change date
                    </button>
                  </div>

                  {slotsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin" style={{ color: C.gold700 }} />
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-sm font-semibold" style={{ color: C.ink700 }}>No availability on this day</p>
                      <p className="mt-1 text-xs" style={{ color: C.ink400 }}>Try a different date</p>
                      <button
                        type="button"
                        onClick={() => setSelectedDate(null)}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-white"
                        style={{ background: C.gold700 }}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Pick another date
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      {(Object.entries(slotGroups) as [string, TimeSlot[]][]).map(([group, groupSlots]) => {
                        if (groupSlots.length === 0) return null;
                        return (
                          <div key={group}>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink400 }}>
                              {group}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {groupSlots.map((slot) => {
                                const isSel = selectedSlot?.time === slot.time && selectedSlot?.staffId === slot.staffId;
                                return (
                                  <button
                                    key={`${slot.time}-${slot.staffId}`}
                                    type="button"
                                    onClick={() => { setSelectedSlot(slot); setStep("details"); }}
                                    className="rounded-xl border py-2.5 text-center text-sm font-semibold transition-all focus:outline-none"
                                    style={{
                                      background: isSel ? C.gold700 : "#fff",
                                      borderColor: isSel ? C.gold700 : C.cream200,
                                      color: isSel ? "#fff" : C.ink800,
                                    }}
                                  >
                                    {formatSlotTime(slot.time, timezone)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {slotsLoading && (
                <div className="mt-6 flex items-center justify-center gap-2 text-sm" style={{ color: C.ink500 }}>
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: C.gold700 }} />
                  Loading availability…
                </div>
              )}
              {slotsError && (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{slotsError}</p>
              )}
              </div>
            </div>
          )}

          {/* STEP: details */}
          {step === "details" && (
            <div className="px-5 py-5">
              {/* Booking summary card */}
              {selectedService && selectedSlot && selectedDate && (
                <div className="mb-5 rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: C.cream200 }}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold" style={{ color: C.ink900 }}>{summary}</p>
                    <p className="shrink-0 text-sm font-semibold" style={{ color: C.ink900 }}>{formatPrice(totalPrice + hc.travelFee)}</p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: C.ink500 }}>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" style={{ color: C.gold700 }} />
                      {DAY_SHORT[selectedDate.getDay()]}, {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getDate()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" style={{ color: C.gold700 }} />
                      {formatSlotTime(selectedSlot.time, timezone)}
                      {selectedSlot.staffName && ` · with ${selectedSlot.staffName}`}
                      {` · ${visitLength}`}
                    </span>
                  </div>
                </div>
              )}

              <h3
                className="mb-4 text-base font-semibold"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              >
                Your Details
              </h3>

              <div className="flex flex-col gap-3">
                {[
                  { id: "bp-name",  label: "Full Name", required: true,  type: "text",  value: name,  onChange: setName,  placeholder: "Jane Smith",        autoComplete: "name" },
                  { id: "bp-phone", label: "Phone",     required: true,  type: "tel",   value: phone, onChange: setPhone, placeholder: "(555) 000-0000",     autoComplete: "tel" },
                  { id: "bp-email", label: "Email",     required: false, type: "email", value: email, onChange: setEmail, placeholder: "jane@example.com",   autoComplete: "email" },
                ].map(({ id, label, required, type, value, onChange, placeholder, autoComplete }) => (
                  <div key={id}>
                    <label htmlFor={id} className="mb-1 block text-xs font-semibold" style={{ color: C.ink700 }}>
                      {label}{" "}
                      {required
                        ? <span className="text-red-500">*</span>
                        : <span className="font-normal" style={{ color: C.ink400 }}>(optional)</span>}
                    </label>
                    <input
                      id={id}
                      type={type}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder={placeholder}
                      autoComplete={autoComplete}
                      className="w-full rounded-xl border bg-white px-4 py-3 text-sm placeholder-gray-400 focus:outline-none"
                      style={{ borderColor: C.cream300, color: C.ink900 }}
                    />
                  </div>
                ))}
              </div>

              {submitError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              {cancelAckNeeded && (
                <div className="mt-4">
                  <CancellationPolicyConsent
                    text={cancelPolicy.data!.text}
                    accepted={cancellationAccepted}
                    onChange={setCancellationAccepted}
                  />
                </div>
              )}

              {/* Text consent: the client's own agreement, never ticked for them (saved in sms_consents). */}
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3.5" style={{ borderColor: C.cream200 }}>
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  data-testid="solo-sms-consent"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ accentColor: C.gold700 }}
                />
                <span className="text-xs leading-relaxed" style={{ color: C.ink600 }}>
                  {smsConsentText}{" "}
                  <a href="#terms" className="underline">Terms</a>
                  {" & "}
                  <a href="#privacy" className="underline">Privacy</a>.
                  {smsConsentNeeded ? ` ${store.name} replies to booking requests by text, so this is needed to book online.${store.phone ? " You can also call to book." : ""}` : ""}
                </span>
              </label>

              {savesCard && (
                <p className="mt-4 rounded-xl border p-3.5 text-xs leading-relaxed" style={{ borderColor: C.cream200, background: C.cream50, color: C.ink700 }}>
                  {store.name} asks for a card on file. Nothing is charged now. A $1 hold checks the card and is released right away.
                </p>
              )}

              {/* What paying now means, before the client gets to the card form. */}
              {depositDue > 0 && (
                <div className="mt-4 rounded-xl border p-3.5 text-xs leading-relaxed" style={{ borderColor: C.cream200, background: C.cream50, color: C.ink700 }} data-testid="solo-deposit-note">
                  <p className="text-sm font-semibold" style={{ color: C.ink900 }}>{paysInFull ? `${formatPrice(depositDue)} due to book` : `${formatPrice(depositDue)} deposit to book`}</p>
                  <p className="mt-1"><b>Charged now?</b> Yes, on the next screen, to confirm your time.</p>
                  {paysInFull ? <p><b>Anything left to pay?</b> No, this covers your visit.</p> : <p><b>Does it come off my total?</b> Yes, you pay the rest at your visit.</p>}
                  <p><b>If I cancel or don't show?</b> {cancelPolicy.data?.text ? "It follows the cancellation policy." : `Please contact ${store.name}.`}</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => { if (savesCard && payOnPage) { setSubmitError(null); setStep("card"); } else void handleBook(); }}
                disabled={submitting || !name.trim() || !phone.trim() || (cancelAckNeeded && !cancellationAccepted) || (smsConsentNeeded && !smsConsent)}
                className="mt-5 w-full rounded-full px-6 py-4 text-base font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:transform-none disabled:opacity-50"
                style={{ background: C.gold700 }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
                  </span>
                ) : depositDue > 0 ? "Continue to payment" : savesCard ? "Continue to add your card" : "Confirm Booking"}
              </button>
              <p className="mt-2.5 text-center text-xs" style={{ color: C.ink400 }}>
                No account needed · No booking fees
              </p>
            </div>
          )}

          {/* STEP: the card on file, before the booking or request is made */}
          {step === "card" && payPolicy?.stripePublishableKey && payPolicy.stripeConnectedAccountId && (
            <SoloSaveCard slug={slug} client={{ name: name.trim(), phone: phone.trim(), email: email.trim() }} businessName={store.name}
              publishableKey={payPolicy.stripePublishableKey} account={payPolicy.stripeConnectedAccountId}
              label={store.bookingApproval === "manual" ? "Save card and send request" : "Save card and book"} busy={submitting} error={submitError} attempt={cardAttempt}
              onSaved={(card) => void handleBook(card)} />
          )}

          {/* STEP: pay on the page; the booking is already held */}
          {step === "payment" && hold && payPolicy?.stripePublishableKey && payPolicy.stripeConnectedAccountId && (
            <SoloPay hold={hold} publishableKey={payPolicy.stripePublishableKey} account={payPolicy.stripeConnectedAccountId} businessName={store.name}
              onDone={() => { setStep("success"); onBooked(); }} />
          )}

          {/* STEP: success */}
          {step === "success" && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <div className="mb-5 grid h-20 w-20 place-items-center rounded-full bg-green-50">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <h3
                className="text-2xl font-semibold"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              >
                {store.bookingApproval === "manual" ? "Request sent" : "You're all set!"}
              </h3>
              <p className="mt-3 max-w-xs text-sm leading-relaxed" style={{ color: C.ink600 }}>
                {store.bookingApproval === "manual" ? (
                  <>{store.name} reviews each booking and will reply by text. Your time isn't booked until they confirm.</>
                ) : (
                  <>Your appointment has been confirmed.{email.trim() && " A confirmation has been sent to your email."}</>
                )}
              </p>

              {selectedService && selectedSlot && selectedDate && (
                <div className="mt-6 w-full rounded-2xl border bg-white p-5 text-left shadow-sm" style={{ borderColor: C.cream200 }}>
                  <p className="font-semibold" style={{ color: C.ink900 }}>{summary}</p>
                  <div className="mt-2 flex flex-col gap-1.5 text-sm" style={{ color: C.ink600 }}>
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" style={{ color: C.gold700 }} />
                      {DAY_SHORT[selectedDate.getDay()]}, {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getDate()}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" style={{ color: C.gold700 }} />
                      {formatSlotTime(selectedSlot.time, timezone)}
                      {selectedSlot.staffName && ` · with ${selectedSlot.staffName}`}
                      {` · ${visitLength}`}
                    </span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-7 rounded-full border bg-white px-8 py-3 text-sm font-semibold shadow-sm transition-all"
                style={{ borderColor: C.cream300, color: C.ink800 }}
              >
                Back to website
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Slide-in animation */}
      <style>{`
        @keyframes bloomSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SoloTheme({ store, slug, preselectedStaffId, preselectedServiceId }: BloomThemeProps) {
  // Page data
  const [services, setServices]   = useState<ServiceEntry[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryEntry[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [reviews, setReviews]     = useState<GoogleReviewEntry[]>([]);
  const [gallery, setGallery]     = useState<GalleryPhoto[]>([]);
  // The menu links to Portfolio only when there are photos to show.
  const portfolioLink = gallery.length > 0 ? [{ label: "Portfolio", href: "#portfolio" }] : [];
  // Gift cards and packages: in the menu only when the pro offers them (api-server routes/siteShop.ts).
  const [shop, setShop] = useState<ShopData | null>(null);
  const [shopView, setShopView] = useState<ShopView | null>(null);
  useEffect(() => {
    fetch(`/api/public/store/${slug}/shop`).then((r) => (r.ok ? r.json() : null)).then(setShop).catch(() => setShop(null));
  }, [slug]);
  const shopLinks = [
    ...(shop?.giftCards ? [{ label: "Gift Cards", href: "#gift-cards" }] : []),
    ...(shop?.packages?.length ? [{ label: "Packages", href: "#packages" }] : []),
  ];
  const closeShop = () => { setShopView(null); window.history.replaceState(null, "", window.location.pathname + window.location.search); };

  // Tabs under the header. Sections stay on the page when hidden, so a chosen category or form isn't lost.
  const tabFromHash = (): SoloTab | null => {
    const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (h === "visit") return "about"; // links shared before About replaced Visit Us
    return SOLO_TABS.some((t) => t.id === h) ? (h as SoloTab) : null;
  };
  const [pickedTab, setPickedTab] = useState<SoloTab>(() => tabFromHash() ?? "services");
  const tab: SoloTab = pickedTab === "portfolio" && gallery.length === 0 ? "services" : pickedTab;
  const tabsTop = useRef<HTMLDivElement>(null);
  /** Where the tab bar sits under the fixed header. */
  const tabsY = () => (tabsTop.current?.getBoundingClientRect().top ?? 0) + window.scrollY - (document.querySelector("header")?.offsetHeight ?? 64);
  const pickTab = (id: SoloTab) => {
    setPickedTab(id);
    window.history.replaceState(null, "", `#${id}`);
    // Scrolled down a long tab: start the new one from its top.
    if (window.scrollY > tabsY()) window.scrollTo({ top: tabsY() });
  };
  // A menu or footer link (or a shared link) changes the address: open that tab and bring it into view.
  useEffect(() => {
    const open = () => {
      const h = window.location.hash.slice(1);
      if (h === "gift-cards" || h === "packages") { setShopView(h); setMenuOpen(false); return; }
      const id = tabFromHash();
      if (!id) return;
      setPickedTab(id);
      requestAnimationFrame(() => window.scrollTo({ top: tabsY(), behavior: "smooth" }));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  /** Backend AI-matched service reviews — keyed by service ID (string or number) */
  const [serviceReviews, setServiceReviews] = useState<Record<string, ServiceReviewEntry>>({});
  const [activeCategory, setActiveCategory] = useState("All");

  // Header state
  const [scrolled, setScrolled]   = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);

  // Booking panel state
  const [bookingOpen, setBookingOpen]                       = useState(false);
  // Services picked on the Services tab (up to two), booked together from the bar at the bottom.
  const [cart, setCart]                                     = useState<ServiceEntry[]>([]);
  const barShown = tab === "services" || cart.length > 0;
  const [cartAddons, setCartAddons]                         = useState<Record<number, number[]>>({});
  const [cartOpen, setCartOpen]                             = useState(false);
  /** The one service showing its add-ons. */
  const [expandedId, setExpandedId]                         = useState<number | null>(null);
  const [addons, setAddons]                                 = useState<AddonData[]>([]);
  const [serviceAddons, setServiceAddons]                   = useState<ServiceAddonData[]>([]);
  const addonsFor = (serviceId: number) => {
    const linked = new Set(serviceAddons.filter((x) => Number(x.serviceId) === Number(serviceId)).map((x) => Number(x.addonId)));
    return addons.filter((a) => linked.has(Number(a.id)));
  };
  const chosenFor = (serviceId: number) => addons.filter((a) => (cartAddons[serviceId] ?? []).includes(a.id));
  const chosenAddons = cart.flatMap((x) => chosenFor(x.id));
  const cartTotal = cart.reduce((sum, x) => sum + Number(x.price ?? 0), 0) + chosenAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const cartCount = cart.length + chosenAddons.length;
  const cartLines: CartLine[] = cart.map((x) => ({ id: x.id, name: x.name, price: Number(x.price ?? 0), addons: chosenFor(x.id) }));
  /** A service with its add-ons, for the limit on two services together (twoServices.ts). */
  const visitPart = (x: ServiceEntry) => ({ id: x.id, duration: (x.duration ?? 60) + chosenFor(x.id).reduce((sum, a) => sum + (Number(a.duration) || 0), 0) });
  const removeService = (id: number) => {
    setCart((list) => list.filter((x) => x.id !== id));
    setCartAddons((map) => { const { [id]: _gone, ...rest } = map; return rest; });
    setExpandedId((open) => (open === id ? null : open));
  };
  /** Open this service's add-ons and close the other's; the card that was tapped stays in view as that one closes. */
  const expandService = (id: number) => {
    const moved = expandedId != null && expandedId !== id;
    setExpandedId(id);
    if (moved) requestAnimationFrame(() => document.getElementById(`service-${id}`)?.scrollIntoView({ block: "start" }));
  };
  /** Not chosen: choose it. Chosen with its add-ons closed: open them. Otherwise: remove it. */
  const tapService = (svc: ServiceEntry) => {
    if (!cart.some((x) => x.id === svc.id)) {
      if (canAddService(cart.map(visitPart), { id: svc.id, duration: svc.duration ?? 60 })) { setCart([...cart, svc]); expandService(svc.id); }
    } else if (expandedId === svc.id || addonsFor(svc.id).length === 0) removeService(svc.id);
    else expandService(svc.id);
  };
  const toggleAddon = (serviceId: number, addon: AddonData) => {
    const on = (cartAddons[serviceId] ?? []).includes(addon.id);
    if (!on && cart.length > 1 && cart.reduce((sum, x) => sum + visitPart(x).duration, 0) + (Number(addon.duration) || 0) > MAX_VISIT_MINUTES) {
      toast({ title: "Two services can be booked together for up to 2½ hours. Remove something to add this." });
      return;
    }
    setCartAddons((map) => ({ ...map, [serviceId]: on ? (map[serviceId] ?? []).filter((id) => id !== addon.id) : [...(map[serviceId] ?? []), addon.id] }));
  };

  // Gallery lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Service card photo lightbox
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null);

  const salonName      = store.name || "Your Salon";
  const city           = extractCity(store.address);
  const phoneHref      = store.phone ? `tel:${store.phone}` : undefined;
  // (720) 243-6886, however it was saved.
  const phoneDigits    = (store.phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const phoneLabel     = phoneDigits.length === 10 ? `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}` : store.phone;
  const directionsUrl  = buildDirectionsUrl(store.address);
  const reviewCount    = store.displayReviewCount ?? store.googleReviewCount ?? reviews.length;
  // Certxa Pro accounts have Certxa's own reviews only, never Google (owner, 2026-10-30). The stored rating can be empty
  // for them, so it falls back to the reviews themselves.
  const ratedReviews   = reviews.filter((r) => Number(r.rating) > 0);
  const avgRating      = typeof store.displayRating === "number" && store.displayRating > 0 ? store.displayRating
                        : ratedReviews.length ? ratedReviews.reduce((sum, r) => sum + Number(r.rating), 0) / ratedReviews.length : 0;
  const isGoogleSourced = false;
  const hours          = formatBusinessHours(store.businessHours);
  const cancelPolicyText = useCancellationPolicy(slug).data?.text?.trim() ?? "";

  // Scroll detection
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on resize
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Mobile menu scroll lock
  useEffect(() => {
    if (!bookingOpen) document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { if (!bookingOpen) document.body.style.overflow = ""; };
  }, [menuOpen, bookingOpen]);

  // Fetch services
  useEffect(() => {
    if (!slug) return;
    setServicesLoading(true);
    fetch(`/api/public/store/${slug}/services`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (Array.isArray(d?.addons)) setAddons(d.addons);
        if (Array.isArray(d?.serviceAddons)) setServiceAddons(d.serviceAddons);
        if (d?.services) setServices(d.services);
        const incoming = Array.isArray(d?.categories) ? d.categories : [];
        // Defensive: only keep categories that belong to this store
        const filtered = incoming.filter((c: any) => Number(c.storeId) === Number(store.id));
        setServiceCategories(filtered);
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, [slug]);

  // Fetch reviews
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/store/${slug}/reviews`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setReviews(Array.isArray(d) ? d : []))
      .catch(() => setReviews([]));
  }, [slug]);

  // Fetch gallery (optional — gracefully skipped if endpoint doesn't exist)
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/store/${slug}/gallery`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setGallery(Array.isArray(d) ? d : []))
      .catch(() => setGallery([]));
  }, [slug]);

  // Fetch backend AI-matched service reviews (one best review per service, keyed by service ID)
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/store/${slug}/service-reviews`)
      .then((r) => r.ok ? r.json() : {})
      .then((d: unknown) => {
        if (!d || typeof d !== "object" || Array.isArray(d)) {
          setServiceReviews({});
          return;
        }
        setServiceReviews(d as Record<string, ServiceReviewEntry>);
      })
      .catch(() => setServiceReviews({}));
  }, [slug]);

  // Pre-select on page load from URL param
  const preselectionApplied = useRef<number | null>(null);
  useEffect(() => {
    const id = Number(preselectedServiceId);
    if (!Number.isFinite(id) || id <= 0 || services.length === 0) return;
    if (preselectionApplied.current === id) return;
    preselectionApplied.current = id;
    const match = services.find((s) => Number(s.id) === id);
    if (match) chooseService(id);
  }, [preselectedServiceId, services]);

  const selectTime = () => {
    setMenuOpen(false);
    setCartOpen(false);
    setBookingOpen(true);
  };
  /** Book Now: on to the time with what's chosen; with nothing chosen, to the services. */
  const bookNow = () => {
    if (cart.length > 0) { selectTime(); return; }
    setMenuOpen(false);
    pickTab("services");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  /** One service from a link or a portfolio photo: its add-ons are offered first when it has any. */
  const chooseService = (id: number) => {
    const svc = services.find((x) => Number(x.id) === id);
    if (!svc) return;
    setCart([svc]);
    setCartAddons({});
    setExpandedId(svc.id);
    if (addonsFor(svc.id).length === 0) { setBookingOpen(true); return; }
    setActiveCategory("All");
    pickTab("services");
    requestAnimationFrame(() => document.getElementById(`service-${svc.id}`)?.scrollIntoView({ block: "center" }));
  };
  const finishedBooking = useRef(false);

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIndex === null) return;
    const total = gallery.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft")  setLightboxIndex((i) => i === null ? null : (i - 1 + total) % total);
      if (e.key === "ArrowRight") setLightboxIndex((i) => i === null ? null : (i + 1) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, gallery.length]);

  // Categories
  const categories = useMemo(() => {
    // Use only the canonical service category names supplied by the API
    // (already filtered server-side). Do not invent extra labels from the
    // free-text `service.category` field — that causes duplicate/incorrect
    // items like "Spa Services" vs "Spa" to appear.
    const names = new Set<string>();
    for (const c of serviceCategories) {
      const n = (c?.name ?? "").trim();
      if (n) names.add(n);
    }
    const cats = Array.from(names);
    return ["All", ...cats];
  }, [services, serviceCategories]);

  const serviceCategoryNameById = useMemo(
    () => new Map(serviceCategories.map((category) => [category.id, category.name])),
    [serviceCategories],
  );

  const filteredServices = useMemo(() => {
    const categoryName = (service: ServiceEntry) =>
      serviceCategoryNameById.get(service.categoryId ?? -1) ?? service.category ?? "";
    const visible = activeCategory === "All"
      ? services
      : services.filter((service) => categoryName(service) === activeCategory);
    const categoryOrder = new Map(serviceCategories.map((category, index) => [category.name, index]));

    return [...visible].sort((a, b) => {
      const categoryDifference =
        (categoryOrder.get(categoryName(a)) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(categoryName(b)) ?? Number.MAX_SAFE_INTEGER);
      if (categoryDifference !== 0) return categoryDifference;
      return a.name.localeCompare(b.name);
    });
  }, [services, serviceCategories, serviceCategoryNameById, activeCategory]);

  // Helper: look up the backend-matched review for a service (keyed by ID as number or string)
  function getServiceReview(serviceId: number): ServiceReviewEntry | null {
    return serviceReviews[serviceId] ?? serviceReviews[String(serviceId)] ?? null;
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ ...siteStyle(store.bookingSite), background: C.cream50, color: C.ink900 }}>

      <SiteLegal store={store} />
      {/* Send a message (#message): to the pro's inbox in the app (SiteMessage.tsx). */}
      <SiteMessage store={store} slug={slug} />
      {/* ── BOOKING PANEL ─────────────────────────────────────────────────── */}
      <BookingPanel
        isOpen={bookingOpen}
        onClose={() => {
          setBookingOpen(false);
          if (finishedBooking.current) { finishedBooking.current = false; setCart([]); setCartAddons({}); }
        }}
        store={store}
        slug={slug}
        chosen={cart}
        chosenAddons={chosenAddons}
        onBooked={() => { finishedBooking.current = true; }}
        preselectedStaffId={preselectedStaffId}
        timezone={store.timezone || "UTC"}
      />

      {cartOpen && (
        <SoloCart
          store={store} lines={cartLines} total={cartTotal} directionsUrl={directionsUrl} phoneHref={phoneHref} phoneLabel={phoneLabel}
          onRemoveService={removeService}
          onRemoveAddon={(serviceId, addonId) => setCartAddons((map) => ({ ...map, [serviceId]: (map[serviceId] ?? []).filter((id) => id !== addonId) }))}
          onSelectTime={selectTime}
          onClose={() => setCartOpen(false)}
        />
      )}

      {shop && shopView && (
        <SoloShop slug={slug} shop={shop} view={shopView} businessName={salonName} onClose={closeShop} onBook={() => { closeShop(); bookNow(); }} />
      )}

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header
        className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.90)",
          boxShadow: scrolled ? "0 1px 8px rgba(0,0,0,0.08)" : "none",
          backdropFilter: "blur(8px)",
        }}
      >
        <nav
          className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:h-16 sm:px-8 lg:h-[72px] lg:px-10"
          aria-label="Primary navigation"
        >
          <div className="flex min-w-0 items-center gap-1.5 lg:gap-6">
            {/* Menu, on the left */}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-gray-100 lg:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen
                ? <X className="h-5 w-5" style={{ color: C.ink800 }} />
                : <Menu className="h-5 w-5" style={{ color: C.ink800 }} />}
            </button>
            {/* Salon name, and the page links on large screens */}
            <a
              href="#top"
              className="min-w-0 text-xl font-semibold sm:text-2xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              aria-label={`${salonName} — home`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {store.bookingSite?.logoImage ? <img src={store.bookingSite.logoImage} alt="" className="h-9 w-9 rounded-full object-cover" /> : null}
                <span className="truncate">{salonName}</span>
              </span>
            </a>
            <div className="hidden shrink-0 items-center gap-6 lg:flex">
              {[
                ...shopLinks,
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-semibold tracking-wide transition-colors hover:opacity-80"
                  style={{ color: C.ink700 }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-1 sm:gap-3">
            {store.phone && (
              <a
                href={phoneHref}
                className="hidden items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold lg:inline-flex"
                style={{ borderColor: C.cream300, color: C.ink700 }}
                aria-label={`Call ${store.phone}`}
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {phoneLabel}
              </a>
            )}
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setCartOpen(true); }}
              data-testid="solo-header-cart"
              aria-label={`Your booking, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
              className="relative grid h-9 w-9 place-items-center rounded-lg"
            >
              <ShoppingCart className="h-5 w-5" style={{ color: C.ink800 }} aria-hidden="true" />
              {cartCount > 0 && <span data-testid="solo-cart-count" className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: C.gold700 }}>{cartCount}</span>}
            </button>

            {/* Book Now, far right on every screen */}
            <button
              type="button"
              onClick={bookNow}
              data-testid="solo-header-book"
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
              style={{ background: C.gold700 }}
              aria-label="Book an appointment"
            >
              Book Now
              <ArrowRight className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
            </button>
          </div>
        </nav>

        {/* Mobile drawer */}
        {menuOpen && (
          <div
            className="fixed inset-0 top-14 z-40 sm:top-16"
            onClick={() => setMenuOpen(false)}
          >
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" aria-hidden="true" />
            <nav
              className="relative border-t bg-white shadow-xl"
              style={{ borderColor: C.cream200 }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Mobile navigation"
            >
              <ul className="flex flex-col gap-1 px-5 py-4" style={{ maxHeight: "calc(100vh - 3.5rem)", overflowY: "auto" }}>
                {[
                  { label: "About", href: "#about" },
                  { label: "Services", href: "#services" },
                  ...portfolioLink,
                  ...shopLinks,
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-xl px-4 py-3.5 text-lg font-medium transition-colors hover:bg-gray-50"
                      style={{ color: C.ink800 }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                {store.phone && (
                  <li className="mt-2 px-4">
                    <a
                      href={phoneHref}
                      className="flex items-center gap-2 py-2 text-base font-medium"
                      style={{ color: C.ink600 }}
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {phoneLabel}
                    </a>
                  </li>
                )}
              </ul>
            </nav>
          </div>
        )}
      </header>

      {/* The site opens on the tabs (owner, 2026-11-04: phones first, no hero). This keeps them clear of the fixed header;
          on phones the body's own 56px top padding (index.css) already does. */}
      <div id="top" className="sm:h-2 md:h-16 lg:h-[72px]" aria-hidden="true" />
      <h1 className="sr-only">{store.byLabel || salonName}{store.city ? ` in ${store.city}` : ""}</h1>

      {/* ── TABS: stay under the header while scrolling ──────────────────── */}
      <div ref={tabsTop} aria-hidden="true" />
      <div className="sticky top-14 z-40 border-b bg-white sm:top-16 lg:top-[72px]" style={{ borderColor: "#eee7e1" }}>
        <div role="tablist" aria-label={`${salonName} sections`} className="mx-auto flex w-full max-w-3xl">
          {SOLO_TABS.filter((t) => t.id !== "portfolio" || gallery.length > 0).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={t.id}
              onClick={() => pickTab(t.id)}
              data-testid={`solo-tab-${t.id}`}
              className="flex-1 px-3 py-3.5 text-sm font-semibold transition-colors sm:text-base"
              style={{ color: tab === t.id ? C.gold700 : C.ink600, borderBottom: `2px solid ${tab === t.id ? C.gold700 : "transparent"}`, marginBottom: -1 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SERVICES ──────────────────────────────────────────────────────── */}
      <section
        id="services"
        hidden={tab !== "services"}
        aria-labelledby="services-heading"
        className="px-4 py-10 sm:px-6 sm:py-14"
        style={{ background: "#f4ede8" }}
      >
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-5">
            <h2
              id="services-heading"
              className="text-[28px] font-bold leading-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
            >
              Services
            </h2>
            <p className="mt-1 text-[14px]" style={{ color: C.ink600 }}>
              Pick up to two services, then choose your time.
            </p>
          </div>

          {/* Categories: one row that scrolls sideways */}
          {categories.length > 1 && (
            <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" role="group" aria-label="Filter by category" data-testid="solo-categories">
              {categories.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    aria-pressed={isActive}
                    className="shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold"
                    style={{ borderColor: isActive ? C.gold700 : C.cream300, background: isActive ? C.gold700 : "#fff", color: isActive ? "#fff" : C.ink700 }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}

          {/* Service cards */}
        {servicesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.gold700 }} />
          </div>
        ) : (
          <div className="bloom-service-grid grid grid-cols-1 gap-4">
            {filteredServices.map((svc) => {
              const on = cart.some((x) => x.id === svc.id);
              const open = on && expandedId === svc.id;
              const offers = open ? addonsFor(svc.id) : [];
              const chosen = cartAddons[svc.id] ?? [];
              const photo = typeof svc.imageUrl === "string" && svc.imageUrl.trim() ? svc.imageUrl : null;
              return (
                <article
                  key={svc.id}
                  id={`service-${svc.id}`}
                  className="scroll-mt-28 overflow-hidden rounded-xl bg-white sm:scroll-mt-32"
                  style={{ boxShadow: on ? `0 0 0 2px ${C.gold700}` : "0 1px 2px rgba(0,0,0,0.08)" }}
                >
                  <button
                    type="button"
                    onClick={() => tapService(svc)}
                    aria-pressed={on}
                    aria-expanded={offers.length > 0}
                    aria-label={`${on ? (open || addonsFor(svc.id).length === 0 ? "Remove" : "Show add-ons for") : "Select"} ${svc.name}`}
                    data-testid={`solo-select-${svc.id}`}
                    className="flex w-full items-start gap-3 p-3.5 text-left"
                  >
                    {photo && <img src={photo} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold leading-snug" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>{svc.name}</span>
                      <span className="mt-0.5 block text-[14px] font-bold" style={{ color: C.ink800 }}>{formatPrice(svc.price)}</span>
                      {svc.description && <span className={`mt-1 block text-[13px] leading-snug ${open ? "" : "line-clamp-2"}`} style={{ color: C.ink600 }}>{svc.description}</span>}
                      {on && !open && chosen.length > 0 && <span className="mt-1 block text-[13px] font-semibold leading-snug" style={{ color: C.ink800 }}>+ {chosenFor(svc.id).map((a) => a.name).join(", ")}</span>}
                    </span>
                    <CheckDot on={on} />
                  </button>
                  {offers.length > 0 && (
                    <div data-testid={`solo-addons-${svc.id}`}>
                      {/* The question stands out: a solid band in the business's colour, edge to edge. */}
                      <p className="px-3.5 py-3 text-center text-[16px] font-bold leading-snug text-white" style={{ background: C.gold700 }}>Would you like to add to your<span className="block">{svc.name}?</span></p>
                      <div className="divide-y divide-gray-100">
                        {offers.map((addon) => {
                          const added = chosen.includes(addon.id);
                          return (
                            <button
                              key={addon.id}
                              type="button"
                              onClick={() => toggleAddon(svc.id, addon)}
                              aria-pressed={added}
                              aria-label={`${added ? "Remove" : "Add"} ${addon.name}`}
                              data-testid={`solo-addon-${addon.id}`}
                              className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                              style={{ background: added ? TINT : "#fff" }}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-semibold leading-snug" style={{ color: C.ink900 }}>{addon.name}</span>
                                {addon.description && <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: C.ink600 }}>{addon.description}</span>}
                              </span>
                              <span className="shrink-0 text-[14px] font-bold" style={{ color: C.ink800 }}>{Number(addon.price) > 0 ? `+${formatPrice(addon.price)}` : "Included"}</span>
                              <CheckDot on={added} small />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {services.length > 0 && filteredServices.length === 0 && (
              <p className="col-span-full py-10 text-center text-[14px]" style={{ color: C.ink500 }}>
                No services in this category.
              </p>
            )}
          </div>
        )}

        {/* Review cards — real review text with the service/staff the client
            actually received, when known (only ever present on Certxa's own
            native reviews; synced Google reviews never carry this). */}
        {reviews.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {reviews.slice(0, 2).map((r) => (
              <div key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold" style={{ color: C.ink900 }}>{r.customerName || "Certxa customer"}</p>
                  {typeof r.rating === "number" && (
                    <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold" style={{ color: "#F59E0B" }}>
                      <Star className="h-3 w-3 fill-current" aria-hidden="true" /> {r.rating}
                    </span>
                  )}
                </div>
                {(r.serviceName || r.staffName) && (
                  <p className="mt-0.5 text-[11px]" style={{ color: C.ink500 }}>
                    {[r.serviceName, r.staffName ? `with ${r.staffName}` : null].filter(Boolean).join(" · ")}
                  </p>
                )}
                {r.reviewText && (
                  <p className="mt-2 text-[13px] leading-5" style={{ color: C.ink700 }}>{r.reviewText}</p>
                )}
                <ReviewPhotos urls={r.reviewImageUrls} />
                {r.ownerResponse && (
                  <div className="mt-3 border-l-2 pl-3" style={{ borderColor: C.ink500 }}>
                    <p className="text-[11px] font-semibold" style={{ color: C.ink500 }}>Reply from {store.name}</p>
                    <p className="mt-1 text-[13px] leading-5" style={{ color: C.ink700 }}>{r.ownerResponse}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* "See more reviews" banner */}
        {reviewCount > 0 && (
          <a
            href="#about"
            className="mt-5 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none"
            aria-label={isGoogleSourced ? "View all Google reviews" : "View all reviews"}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: C.rose50 }}>
                <Users className="h-5 w-5" style={{ color: C.rose600 }} aria-hidden="true" />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: C.ink900 }}>See what my clients say</p>
                <p className="text-[12px]" style={{ color: C.ink500 }}>{isGoogleSourced ? "View all reviews on Google" : "View all reviews"}</p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 -rotate-90" style={{ color: C.ink400 }} aria-hidden="true" />
          </a>
        )}
        </div>
      </section>

      {/* ── PORTFOLIO: the pro's photos from the app's Portfolio screen (only shown if there are any) ── */}
      {gallery.length > 0 && (
        <>
          <section
            id="portfolio"
            hidden={tab !== "portfolio"}
            aria-labelledby="portfolio-heading"
            className="bg-white py-14 sm:py-20"
          >
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12">
              <div className="text-center">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: C.gold700 }}>My Work</p>
                <h2
                  id="portfolio-heading"
                  className="text-3xl font-semibold sm:text-4xl"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
                >
                  Portfolio
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed" style={{ color: C.ink600 }}>
                  Every photo is real client work. Tap any photo to view it larger.
                </p>
              </div>

              {/* Masonry grid */}
              <div className="bloom-masonry mt-10 sm:mt-12">
                {gallery.map((photo, index) => (
                  <button
                    key={`${photo.image_url}-${index}`}
                    type="button"
                    onClick={() => setLightboxIndex(index)}
                    className="bloom-masonry-item group relative block w-full overflow-hidden rounded-2xl focus:outline-none"
                    style={{ background: C.cream100 }}
                    aria-label={`View ${photo.caption ?? `portfolio photo ${index + 1}`} larger`}
                  >
                    <img
                      src={photo.image_url}
                      alt={photo.caption ?? `${salonName} nail art — photo ${index + 1}`}
                      loading="lazy"
                      className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { e.currentTarget.closest("button")?.remove(); }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all duration-300 group-hover:bg-black/30 group-hover:opacity-100">
                      <ZoomIn className="h-7 w-7 drop-shadow-lg" aria-hidden="true" />
                    </span>
                    {photo.caption && (
                      <span className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-3 py-2 text-xs text-white transition-transform duration-300 group-hover:translate-y-0">
                        {photo.caption}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Lightbox */}
          {lightboxIndex !== null && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
              style={{ background: "rgba(26,24,20,0.92)" }}
              role="dialog"
              aria-modal="true"
              onClick={() => setLightboxIndex(null)}
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Close lightbox"
              >
                <X className="h-6 w-6" />
              </button>
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i === null ? null : (i - 1 + gallery.length) % gallery.length); }}
                    className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i === null ? null : (i + 1) % gallery.length); }}
                    className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
              <figure
                className="flex max-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={gallery[lightboxIndex].image_url}
                  alt={gallery[lightboxIndex].caption ?? `${salonName} portfolio photo ${lightboxIndex + 1}`}
                  className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
                />
                {gallery[lightboxIndex].caption && (
                  <figcaption className="max-w-xl text-center text-sm text-white/75">
                    {gallery[lightboxIndex].caption}
                  </figcaption>
                )}
                <p className="text-xs text-white/40">{lightboxIndex + 1} / {gallery.length}</p>
                {(() => {
                  const look = services.find((x) => x.id === gallery[lightboxIndex].service_id);
                  return look ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); chooseService(look.id); }}
                      data-testid="solo-book-look"
                      className="mt-1 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold"
                      style={{ color: C.ink900 }}
                    >
                      Book this look · {look.name}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null;
                })()}
              </figure>
            </div>
          )}
        </>
      )}

      {/* ── ABOUT: rating, the pro's own words, hours, policy, contact and reviews ─────────────── */}
      <section
        id="about"
        hidden={tab !== "about"}
        aria-labelledby="about-heading"
        className="bg-white py-10 sm:py-14"
        itemScope
        itemType="https://schema.org/LocalBusiness"
      >
        <div className="mx-auto w-full max-w-2xl px-5 text-center sm:px-8">
          {store.bookingSite?.aboutImage && (
            <img src={store.bookingSite.aboutImage} alt={salonName} data-testid="solo-about-photo" className="mx-auto mb-4 h-36 w-36 rounded-full object-cover" />
          )}
          <h2 id="about-heading" className="text-3xl font-semibold sm:text-4xl" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }} itemProp="name">
            {salonName}
          </h2>

          {reviewCount > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-center gap-1" role="img" aria-label={`${Number(avgRating.toFixed(1))} stars from ${reviewCount} reviews`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className="h-5 w-5" aria-hidden="true" style={{ color: "#F59E0B", fill: n <= Math.round(avgRating) ? "#F59E0B" : "none" }} />
                ))}
                <span className="ml-1.5 text-sm" style={{ color: C.ink600 }}>({reviewCount.toLocaleString()} {reviewCount === 1 ? "Review" : "Reviews"})</span>
              </div>
              {reviews.length > 0 && (
                <button
                  type="button"
                  onClick={() => document.getElementById("about-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="mt-1.5 text-sm font-medium underline underline-offset-2"
                  style={{ color: C.ink800 }}
                >
                  See all reviews
                </button>
              )}
            </div>
          )}

          {store.bookingSite?.about && (
            <p className="mt-6 whitespace-pre-line border-t pt-6 text-base leading-relaxed" style={{ color: C.ink700, borderColor: C.cream200 }} itemProp="description">
              {store.bookingSite.about}
            </p>
          )}

          {hours.length > 0 && (
            <div className="mt-8 border-t pt-7" style={{ borderColor: C.cream200 }}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Business Hours</h3>
              <dl className="mx-auto mt-4 max-w-xs space-y-2">
                {hours.map((row) => (
                  <div key={row.day} className="flex justify-between gap-6 text-sm">
                    <dt style={{ color: row.time === "Closed" ? C.ink400 : C.ink800 }}>{row.day}</dt>
                    <dd style={{ color: row.time === "Closed" ? C.ink400 : C.ink800 }}>{row.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {cancelPolicyText && (
            <div className="mt-8 border-t pt-7" style={{ borderColor: C.cream200 }}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Cancellation Policy</h3>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed" style={{ color: C.ink700 }}>{cancelPolicyText}</p>
            </div>
          )}

          {/* Contact: always shown, for "Send a message" (owner, 2026-11-07). */}
          {(
            <div className="mt-8 space-y-2 border-t pt-7 text-sm" style={{ borderColor: C.cream200 }}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Contact</h3>
              {store.address && (
                <>
                  <address className="not-italic leading-relaxed" style={{ color: C.ink700 }} itemProp="address">{store.address}</address>
                  <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: C.gold700 }}>
                    Get directions
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </>
              )}
              {store.phone && <a href={phoneHref} className="block" style={{ color: C.ink700 }} itemProp="telephone">{phoneLabel}</a>}
              <a href="#message" className="inline-block pt-1 font-semibold" style={{ color: C.gold700 }} data-testid="solo-send-message">Send a message</a>
            </div>
          )}

          {reviews.length > 0 && (
            <div id="about-reviews" className="mt-8 scroll-mt-32 border-t pt-7 text-left" style={{ borderColor: C.cream200 }}>
              <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Ratings &amp; Reviews</h3>
              <div className="mt-2 divide-y" style={{ borderColor: C.cream200 }}>
                {reviews.map((r) => {
                  const rating = Number(r.rating ?? 5);
                  const who = r.customerName?.trim() || "Verified client";
                  const when = r.reviewCreateTime
                    ? new Date(r.reviewCreateTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: store.timezone || "UTC" })
                    : null;
                  return (
                    <article key={r.id} className="py-5" data-testid="solo-review">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-semibold text-white" style={{ background: C.gold700 }} aria-hidden="true">{who.charAt(0).toUpperCase()}</span>
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold" style={{ color: C.ink900 }}>{who}</p>
                          {r.serviceName && <p className="truncate text-[13px]" style={{ color: C.ink600 }}>{r.serviceName}</p>}
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2 text-[13px]" style={{ color: C.ink600 }}>
                        <span className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className="h-4 w-4" aria-hidden="true" style={{ color: "#F59E0B", fill: n <= rating ? "#F59E0B" : "none" }} />
                          ))}
                        </span>
                        <span className="font-semibold" style={{ color: C.ink900 }}>{rating.toFixed(1)}</span>
                        {when && <span>· {when}</span>}
                      </div>
                      {r.reviewText && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed" style={{ color: C.ink800 }}>{r.reviewText}</p>}
                      <ReviewPhotos urls={r.reviewImageUrls} large />
                      {r.ownerResponse && (
                        <p className="mt-3 rounded-xl px-3 py-2 text-sm leading-relaxed" style={{ background: C.cream50, color: C.ink700 }}>
                          <span className="font-semibold">Reply from {salonName}: </span>{r.ownerResponse}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── CHOSEN SERVICES: book them together ──────────────────────────── */}
      {/* What's chosen, always in reach on the Services tab. */}
      {barShown && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]" style={{ borderColor: C.cream200 }} data-testid="solo-cart-bar">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <button type="button" onClick={() => setCartOpen(true)} className="min-w-0 flex-1 text-left" data-testid="solo-bar-summary">
              <span className="block truncate text-sm font-semibold" style={{ color: C.ink900 }}>{cart.length === 0 ? "Choose a service" : formatPrice(cartTotal)}</span>
              {cart.length > 0 && <span className="block text-xs" style={{ color: C.ink500 }}>{cartCount} {cartCount === 1 ? "item" : "items"} · View</span>}
            </button>
            <button
              type="button"
              onClick={selectTime}
              disabled={cart.length === 0}
              data-testid="solo-cart-book"
              className="flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: C.gold700 }}
            >
              Select Time
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="mt-auto" style={{ background: C.ink900, color: C.ink400, paddingBottom: barShown ? 76 : 0 }} role="contentinfo">
        <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-12 lg:px-12">
          <div className="flex flex-col items-center gap-6 text-center sm:gap-8">
            {/* Brand */}
            <div>
              <p
                className="text-xl font-semibold text-white"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {salonName}
              </p>
              <p className="mt-1 text-sm" style={{ color: C.ink500 }}>{store.byLabel || store.category || "Beauty Professional"}</p>
            </div>

            {/* Nav links */}
            <nav aria-label="Footer navigation">
              <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                {[
                  { label: "About", href: "#about" },
                  { label: "Services", href: "#services" },
                  ...portfolioLink,
                  ...shopLinks,
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm transition-colors hover:text-white focus:text-white focus:outline-none"
                      style={{ color: C.ink400 }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={bookNow}
                    className="text-sm font-semibold transition-colors focus:outline-none"
                    style={{ color: "#FCD34D" }}
                  >
                    Book Now
                  </button>
                </li>
              </ul>
            </nav>

            {/* Social */}
            <div className="flex gap-3" aria-label="Social media links">
              {[
                { Icon: Instagram, label: "Instagram", href: instagramUrl(store.bookingSite) },
                { Icon: Facebook,  label: "Facebook",  href: facebookUrl(store.bookingSite) },
              ].filter((x) => x.href).map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid h-10 w-10 place-items-center rounded-full transition-all focus:outline-none"
                  style={{ background: C.ink800, color: C.ink400 }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>

            <div className="w-full border-t" style={{ borderColor: C.ink800 }} />

            {/* Terms and Privacy (SiteLegal.tsx). */}
            <nav aria-label="Legal" className="flex gap-5 text-xs">
              <a href="#terms" className="underline" style={{ color: C.ink400 }}>Terms of Service</a>
              <a href="#privacy" className="underline" style={{ color: C.ink400 }}>Privacy Policy</a>
            </nav>

            {/* Copyright */}
            <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-between sm:gap-0">
              <p className="text-xs" style={{ color: C.ink500 }}>
                &copy; {new Date().getFullYear()} {salonName}. All rights reserved.
              </p>
              <p className="text-xs" style={{ color: C.ink500 }}>
                Powered by{" "}
                <span className="font-semibold text-white">Certxa</span>
                <span className="font-bold" style={{ color: "#FCD34D" }}>.</span>
              </p>
            </div>
          </div>
        </div>
      </footer>
      

      {/* Masonry gallery CSS */}
      <style>{`
        .bloom-service-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 640px) {
          .bloom-service-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 1.5rem;
          }
        }
        .bloom-masonry {
          columns: 2;
          column-gap: 0.75rem;
        }
        @media (min-width: 640px) {
          .bloom-masonry { columns: 3; column-gap: 1rem; }
        }
        @media (min-width: 1024px) {
          .bloom-masonry { columns: 4; column-gap: 1rem; }
        }
        .bloom-masonry-item {
          break-inside: avoid;
          margin-bottom: 0.75rem;
        }
        @media (min-width: 640px) {
          .bloom-masonry-item { margin-bottom: 1rem; }
        }
      `}</style>

      {/* ── SERVICE CARD PHOTO LIGHTBOX ──────────────────────────────────────── */}
      {photoLightbox && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={() => setPhotoLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Client photo full screen"
        >
          <img
            src={photoLightbox}
            alt="Client result photo"
            className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors focus:outline-none"
            style={{ background: "rgba(255,255,255,0.15)" }}
            onClick={() => setPhotoLightbox(null)}
            aria-label="Close photo"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

    </div>
  );
}

/**
 * BloomTheme — public booking page built to match the nail-salon-bloom website template.
 *
 * Sections (in order):
 *   Header → Hero → Services → [Gallery] → Visit Us → Footer
 *
 * Booking flow opens as a slide-in panel from the right, matching the
 * BookingPanel in templates-storage/nail-salon-bloom/project/src/components/BookingPanel.tsx
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
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
  Phone,
  Star,
  Users,
  X,
  ZoomIn,
} from "lucide-react";
import { formatInTz } from "@/lib/timezone";
import type { StoreData } from "./types";

// ── Color tokens (mapped from nail-salon-bloom tailwind.config.js) ─────────────
const C = {
  gold700: "#B45309",
  gold600: "#D97706",
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
}

interface ServiceCategoryEntry {
  id: number;
  name: string;
}

interface GoogleReviewEntry {
  id: number;
  customerName?: string | null;
  rating?: number | null;
  reviewText?: string | null;
  reviewImageUrls?: string | null;
  reviewerPhotoUrl?: string | null;
  reviewMediaItems?: Array<Record<string, unknown>> | null;
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

interface GalleryPhoto {
  image_url: string;
  caption?: string | null;
}

type BookingStep = "service" | "date" | "details" | "success";

interface BloomThemeProps {
  store: StoreData;
  slug: string;
  preselectedStaffId?: number;
  preselectedServiceId?: number;
}

// ── Static fallbacks ──────────────────────────────────────────────────────────
const HERO_IMAGE = "/images/bloom-hero.jpg";

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
  slug: string;
  preselectedServiceId?: number | null;
  preselectedStaffId?: number;
  timezone: string;
}

function BookingPanel({
  isOpen,
  onClose,
  slug,
  preselectedServiceId,
  preselectedStaffId,
  timezone,
}: BookingPanelProps) {
  const [step, setStep]                 = useState<BookingStep>("service");
  const [services, setServices]         = useState<ServiceEntry[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceEntry | null>(null);
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

  const preselectionApplied = useRef<number | null>(null);

  // Reset on open
  useEffect(() => {
    if (!isOpen) {
      preselectionApplied.current = null;
      setSelectedService(null);
      return;
    }
    setStep("service");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate(today);
    setSlots([]);
    setSelectedSlot(null);
    setWeekOffset(0);
    setName(""); setPhone(""); setEmail("");
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

  // Fetch services
  useEffect(() => {
    if (!isOpen || !slug) return;
    setServicesLoading(true);
    fetch(`/api/public/store/${slug}/services`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.services) setServices(d.services); })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, [isOpen, slug]);

  // Pre-select service
  useEffect(() => {
    const id = Number(preselectedServiceId);
    if (!Number.isFinite(id) || id <= 0 || services.length === 0) return;
    if (preselectionApplied.current === id) return;
    preselectionApplied.current = id;
    const match = services.find((s) => Number(s.id) === id);
    if (match) { setSelectedService(match); setStep("date"); }
  }, [preselectedServiceId, services]);

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
    if (!selectedDate || !selectedService || !slug) return;
    setSlotsLoading(true); setSlotsError(null); setSlots([]); setSelectedSlot(null);
    const params = new URLSearchParams({
      serviceId: String(selectedService.id),
      date: toDateKey(selectedDate),
      duration: String(selectedService.duration ?? 60),
    });
    if (preselectedStaffId) params.set("staffId", String(preselectedStaffId));
    fetch(`/api/public/store/${slug}/availability?${params}`)
      .then((r) => r.ok ? r.json() : Promise.reject("error"))
      .then((d) => { setSlots(Array.isArray(d) ? d : []); })
      .catch(() => setSlotsError("Could not load availability. Please try another date."))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, selectedService, slug, preselectedStaffId]);

  const handleBook = useCallback(async () => {
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
          duration: selectedService.duration ?? 60,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? "Booking failed. Please try again.");
      }
      setStep("success");
    } catch (err: any) {
      setSubmitError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedService, selectedSlot, name, phone, email, slug]);

  const weekStart = getWeekStart(weekOffset);
  const weekDays  = getWeekDays(weekStart);

  const slotGroups = useMemo(() => ({
    Morning:   slots.filter((s) => new Date(s.time).getHours() < 12),
    Afternoon: slots.filter((s) => { const h = new Date(s.time).getHours(); return h >= 12 && h < 17; }),
    Evening:   slots.filter((s) => new Date(s.time).getHours() >= 17),
  }), [slots]);

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
            {step === "details" && (
              <button
                type="button"
                onClick={() => { setStep("date"); }}
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
                {step === "success" ? "You're booked!" : "Book an Appointment"}
              </h2>
              {selectedService && step !== "success" && (
                <p className="mt-0.5 max-w-[200px] truncate text-xs" style={{ color: C.ink500 }}>
                  {selectedService.name} · {formatPrice(selectedService.price)}
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
          <div className="flex gap-1 px-5 pt-3">
            {(["service","date","details"] as BookingStep[]).map((s, i) => (
              <div
                key={s}
                className="h-1 flex-1 rounded-full transition-colors duration-300"
                style={{
                  background:
                    (["service","date","details"] as BookingStep[]).indexOf(step) >= i
                      ? C.gold700
                      : C.cream200,
                }}
              />
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* STEP: service */}
          {step === "service" && (
            <div className="px-5 py-5">
              <h3
                className="mb-3 text-base font-semibold"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              >
                Choose a Service
              </h3>
              {servicesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.gold700 }} />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {services.map((svc) => (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => { setSelectedService(svc); setStep("date"); }}
                      className="flex items-center justify-between rounded-2xl border bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:shadow-md focus:outline-none"
                      style={{ borderColor: C.cream200 }}
                    >
                      <div>
                        <p className="text-sm font-semibold" style={{ color: C.ink900 }}>{svc.name}</p>
                        {svc.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: C.ink500 }}>{svc.description}</p>
                        )}
                        {svc.duration && (
                          <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: C.ink400 }}>
                            <Clock className="h-3 w-3" />
                            {svc.duration} min
                          </p>
                        )}
                      </div>
                      <span
                        className="ml-4 shrink-0 text-base font-semibold"
                        style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.gold700 }}
                      >
                        {formatPrice(svc.price)}
                      </span>
                    </button>
                  ))}
                  {!servicesLoading && services.length === 0 && (
                    <p className="py-8 text-center text-sm" style={{ color: C.ink500 }}>
                      No services available at the moment.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

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
          )}

          {/* STEP: details */}
          {step === "details" && (
            <div className="px-5 py-5">
              {/* Booking summary card */}
              {selectedService && selectedSlot && selectedDate && (
                <div className="mb-5 rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: C.cream200 }}>
                  <p className="text-sm font-semibold" style={{ color: C.ink900 }}>{selectedService.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: C.ink500 }}>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" style={{ color: C.gold700 }} />
                      {DAY_SHORT[selectedDate.getDay()]}, {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getDate()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" style={{ color: C.gold700 }} />
                      {formatSlotTime(selectedSlot.time, timezone)}
                      {selectedSlot.staffName && ` · with ${selectedSlot.staffName}`}
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

              <button
                type="button"
                onClick={handleBook}
                disabled={submitting || !name.trim() || !phone.trim()}
                className="mt-5 w-full rounded-full px-6 py-4 text-base font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:transform-none disabled:opacity-50"
                style={{ background: C.gold700 }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
                  </span>
                ) : "Confirm Booking"}
              </button>
              <p className="mt-2.5 text-center text-xs" style={{ color: C.ink400 }}>
                No account needed · Free to book
              </p>
            </div>
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
                You're all set!
              </h3>
              <p className="mt-3 max-w-xs text-sm leading-relaxed" style={{ color: C.ink600 }}>
                Your appointment has been confirmed.
                {email.trim() && " A confirmation has been sent to your email."}
              </p>

              {selectedService && selectedSlot && selectedDate && (
                <div className="mt-6 w-full rounded-2xl border bg-white p-5 text-left shadow-sm" style={{ borderColor: C.cream200 }}>
                  <p className="font-semibold" style={{ color: C.ink900 }}>{selectedService.name}</p>
                  <div className="mt-2 flex flex-col gap-1.5 text-sm" style={{ color: C.ink600 }}>
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" style={{ color: C.gold700 }} />
                      {DAY_SHORT[selectedDate.getDay()]}, {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getDate()}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" style={{ color: C.gold700 }} />
                      {formatSlotTime(selectedSlot.time, timezone)}
                      {selectedSlot.staffName && ` · with ${selectedSlot.staffName}`}
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

export default function BloomTheme({ store, slug, preselectedStaffId, preselectedServiceId }: BloomThemeProps) {
  // Page data
  const [services, setServices]   = useState<ServiceEntry[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryEntry[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [reviews, setReviews]     = useState<GoogleReviewEntry[]>([]);
  const [gallery, setGallery]     = useState<GalleryPhoto[]>([]);
  /** Backend AI-matched service reviews — keyed by service ID (string or number) */
  const [serviceReviews, setServiceReviews] = useState<Record<string, ServiceReviewEntry>>({});
  const [activeCategory, setActiveCategory] = useState("All");

  // Header state
  const [scrolled, setScrolled]   = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);

  // Booking panel state
  const [bookingOpen, setBookingOpen]                       = useState(false);
  const [bookingPreselectedId, setBookingPreselectedId]     = useState<number | null>(null);

  // Gallery lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Service card photo lightbox
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null);

  const salonName      = store.name || "Your Salon";
  const city           = extractCity(store.address);
  const phoneHref      = store.phone ? `tel:${store.phone}` : undefined;
  const directionsUrl  = buildDirectionsUrl(store.address);
  const reviewCount    = store.googleReviewCount ?? reviews.length;
  const avgRating      = typeof store.googleRating === "number" ? store.googleRating : 0;
  const filledStars    = Math.round(avgRating);
  const hours          = formatBusinessHours(store.businessHours);

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
    if (match) openBookingFor(id);
  }, [preselectedServiceId, services]);

  const openBookingFor = useCallback((serviceId?: number) => {
    setBookingPreselectedId(serviceId ?? null);
    setBookingOpen(true);
    setMenuOpen(false);
  }, []);

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
    <div className="min-h-screen" style={{ background: C.cream50, color: C.ink900 }}>

      {/* ── BOOKING PANEL ─────────────────────────────────────────────────── */}
      <BookingPanel
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        slug={slug}
        preselectedServiceId={bookingPreselectedId}
        preselectedStaffId={preselectedStaffId}
        timezone={store.timezone || "UTC"}
      />

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
          className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-5 sm:h-16 sm:px-8 lg:h-[72px] lg:px-10"
          aria-label="Primary navigation"
        >
          {/* Salon name */}
          <a
            href="#top"
            className="text-xl font-semibold sm:text-2xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
            aria-label={`${salonName} — home`}
          >
            {salonName}
          </a>

          {/* Desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            {[
              { label: "Services", href: "#services" },
              { label: "Gallery", href: "#gallery" },
              { label: "Visit Us", href: "#visit" },
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

          {/* Desktop actions */}
          <div className="hidden items-center gap-3 md:flex">
            {store.phone && (
              <a
                href={phoneHref}
                className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold"
                style={{ borderColor: C.cream300, color: C.ink700 }}
                aria-label={`Call ${store.phone}`}
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {store.phone}
              </a>
            )}
            <button
              type="button"
              onClick={() => openBookingFor()}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors"
              style={{ background: C.rose600 }}
              aria-label="Book an appointment"
            >
              Book Now
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg transition-colors hover:bg-gray-100 md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen
              ? <X className="h-5 w-5" style={{ color: C.ink800 }} />
              : <Menu className="h-5 w-5" style={{ color: C.ink800 }} />}
          </button>
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
                  { label: "Services", href: "#services" },
                  { label: "Gallery",  href: "#gallery"  },
                  { label: "Visit Us", href: "#visit"    },
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
                      {store.phone}
                    </a>
                  </li>
                )}
              </ul>
            </nav>
          </div>
        )}
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section id="top" aria-label="Welcome" className="relative overflow-hidden pt-14 sm:pt-16 lg:pt-[72px]" style={{ background: C.cream100 }}>
        {/* Gold accent bar */}
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: C.gold700 }} aria-hidden="true" />

        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:min-h-[580px] lg:grid-cols-2 lg:gap-16 lg:py-24">
          {/* Left: content */}
          <div className="flex flex-col">
            {/* Rating pill */}
            {reviewCount > 0 && (
              <div
                className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5"
                style={{ borderColor: "#FDE68A", background: C.gold50 }}
                aria-label={`${avgRating} stars from ${reviewCount} reviews`}
              >
                <span className="flex gap-0.5" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className="h-3.5 w-3.5"
                      style={{
                        fill: i < filledStars ? "#F59E0B" : C.cream200,
                        color: i < filledStars ? "#F59E0B" : C.cream200,
                      }}
                    />
                  ))}
                </span>
                <span className="text-xs font-semibold" style={{ color: "#92400E" }}>
                  {avgRating > 0 ? Number(avgRating).toFixed(1) : "★★★★★"} — {reviewCount.toLocaleString()} Google Reviews
                </span>
              </div>
            )}

            {/* Salon name + city */}
            <h1
              className="text-balance text-[2.4rem] font-semibold leading-[1.05] sm:text-5xl lg:text-6xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
            >
              {salonName}
              {city && (
                <span
                  className="mt-1 block text-[1.6rem] font-normal leading-snug sm:text-3xl lg:text-[2rem]"
                  style={{ color: C.ink400 }}
                >
                  Nail Salon in {city}
                </span>
              )}
            </h1>

            <p className="mt-4 max-w-lg text-base leading-relaxed sm:mt-5 sm:text-lg" style={{ color: C.ink600 }}>
              Luxury nail services crafted by master technicians. See real client results below and book your appointment in seconds — no account needed.
            </p>

            {/* Contact CTA */}
            <div className="mt-7 flex flex-wrap gap-3 sm:mt-8">
              {store.phone && (
                <a
                  href={phoneHref}
                  className="inline-flex items-center justify-center gap-2 rounded-full border bg-white px-6 py-3.5 text-base font-semibold shadow-sm transition-all"
                  style={{ borderColor: C.cream300, color: C.ink800 }}
                  aria-label={`Call ${store.phone}`}
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call
                </a>
              )}
              {store.address && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border bg-white px-6 py-3.5 text-base font-semibold shadow-sm transition-all"
                  style={{ borderColor: C.cream300, color: C.ink800 }}
                  aria-label="Get directions"
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  Directions
                </a>
              )}
            </div>

            {/* Quick stats */}
            <dl
              className="mt-8 flex flex-wrap gap-6 border-t pt-6 sm:mt-10 sm:gap-8 sm:pt-8"
              style={{ borderColor: C.cream200 }}
            >
              <div>
                <dt className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.gold700 }}>Same-Day</dt>
                <dd className="mt-1 text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>Booking</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.gold700 }}>Reviews</dt>
                <dd className="mt-1 text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>
                  {reviewCount > 0 ? `${reviewCount}+` : "★★★★★"}
                </dd>
              </div>
              {avgRating > 0 && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.gold700 }}>Rating</dt>
                  <dd className="mt-1 text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>{Number(avgRating).toFixed(1)} / 5</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Right: hero image (desktop only) */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="relative overflow-hidden rounded-3xl shadow-2xl">
              <img
                src={HERO_IMAGE}
                alt={`Professional nail technician at ${salonName}`}
                className="h-[520px] w-full object-cover"
                width={640}
                height={520}
              />
              <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10" />
            </div>
          </div>
        </div>

        {/* Wave separator */}
        <div className="overflow-hidden" aria-hidden="true">
          <svg viewBox="0 0 1440 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" style={{ color: C.cream50 }}>
            <path d="M0 0 Q360 28 720 14 Q1080 0 1440 20 L1440 28 L0 28 Z" fill={C.cream50} />
          </svg>
        </div>
      </section>

      {/* ── SERVICES ──────────────────────────────────────────────────────── */}
      <section
        id="services"
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
              Our Services
            </h2>
            <p className="mt-1 text-[14px]" style={{ color: C.ink600 }}>
              Real results from real clients{" "}
              <span aria-hidden="true" style={{ color: C.rose600 }}>♥</span>
            </p>
          </div>

          {/* Category filter — mobile select + desktop chips */}
          {categories.length > 1 && (
            <>
              <div className="mb-5 max-w-xs lg:hidden">
                <label htmlFor="service-category" className="mb-2 block text-sm font-semibold" style={{ color: C.ink700 }}>
                  Filter by category
                </label>
                <select
                  id="service-category"
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value)}
                  className="w-full rounded-full border bg-white px-4 py-3 text-sm shadow-sm focus:border-gold-600 focus:outline-none"
                  style={{ borderColor: C.cream200, color: C.ink900 }}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === "All" ? "All Services" : cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-7 hidden flex-wrap items-center gap-2 lg:flex">
                {categories.map((cat) => {
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
                      style={{
                        borderColor: isActive ? C.rose600 : C.cream300,
                        background: isActive ? C.rose600 : "#fff",
                        color: isActive ? "#fff" : C.ink700,
                      }}
                      aria-pressed={isActive}
                    >
                      {cat === "All" ? "All Services" : cat}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Service cards */}
        {servicesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.gold700 }} />
          </div>
        ) : (
          <div className="bloom-service-grid grid grid-cols-1 gap-4">
            {filteredServices.map((svc) => {
              const svcReview        = getServiceReview(svc.id);
              // Service-card image priority:
              // 1) Google review media photo
              // 2) Service image saved on the service record (owner upload or auto-assigned from Service Images tab)
              // 3) Static placeholder
              const serviceCategory  = serviceCategoryNameById.get(svc.categoryId ?? -1) ?? svc.category;
              const mediaUrl         = extractMediaPhotoUrl(svcReview?.reviewMediaItems ?? null);
              const customerPhotoUrl = typeof svcReview?.photoUrl === "string" && svcReview.photoUrl.trim() ? svcReview.photoUrl : null;
              const serviceImageUrl  = typeof svc.imageUrl === "string" && svc.imageUrl.trim() ? svc.imageUrl : null;
              // Priority: Google review media → customer-uploaded photo → service image → placeholder
              const imageUrl         = mediaUrl || customerPhotoUrl || serviceImageUrl || pickFallbackImage(svc, serviceCategory);
              const isGooglePhoto    = Boolean(mediaUrl);
              const isCustomerPhoto  = !isGooglePhoto && Boolean(customerPhotoUrl);
              const hasReview        = Boolean(svcReview?.comment);
              const avatarUrl        = svcReview?.reviewerAvatarUrl ?? null;
              const avatarInitial    = (svcReview?.customerName ?? "V").charAt(0).toUpperCase();
              const displayName      = svcReview?.customerName ?? "Verified Client";
              const quote            = (svcReview?.comment ?? "").slice(0, 120);
              const starRating       = svcReview ? Number(svcReview.rating) : avgRating;
              const svcReviewCount   = reviewCount > 0 ? Math.min(reviewCount, 87) : 24;

              return (
                <article key={svc.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  <div className="flex min-h-[180px] flex-col">
                    {/* Image */}
                    <div
                      className="relative h-44 w-full flex-shrink-0 overflow-hidden sm:h-auto"
                      style={{ background: C.cream100 }}
                    >
                      <img
                        src={imageUrl}
                        alt={isGooglePhoto ? `Google review photo for ${svc.name}` : `${svc.name} at our nail salon`}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 hover:scale-105 sm:relative sm:inset-auto sm:h-auto sm:w-full"
                        style={isGooglePhoto ? { cursor: "zoom-in" } : undefined}
                        onClick={isGooglePhoto ? () => setPhotoLightbox(imageUrl) : undefined}
                      />
                      {isGooglePhoto && (
                        <button
                          type="button"
                          className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm focus:outline-none"
                          style={{ color: C.ink800 }}
                          onClick={() => setPhotoLightbox(imageUrl)}
                          aria-label="View client photo full screen"
                        >
                          ✨ Client photo
                        </button>
                      )}
                      {isCustomerPhoto && (
                        <div
                          className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm"
                          style={{ color: C.ink800 }}
                        >
                          ✨ Client photo
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col gap-1.5 px-3.5 py-3 md:px-5 md:py-4">
                      <h3
                        className="text-[17px] font-semibold leading-snug"
                        style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
                      >
                        {svc.name}
                      </h3>

                      {/* Price + Duration row */}
                      <div className="flex items-center gap-3">
                        <span
                          className="text-[22px] font-bold"
                          style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#374151" }}
                        >
                          {formatPrice(svc.price)}
                        </span>
                        {(svc.duration ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-[14px]" style={{ color: C.ink500 }}>
                            <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                            {svc.duration} min
                          </div>
                        )}
                      </div>

                      {svc.description && (
                        <p className="line-clamp-2 text-[12px] leading-relaxed" style={{ color: C.ink500 }}>
                          {svc.description}
                        </p>
                      )}

                      <div className="my-0.5 h-px" style={{ background: "#f3f4f6" }} />

                      {serviceCategory && (
                        <span
                          className="mb-1 w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: C.rose50, borderColor: C.rose100, color: C.rose700 }}
                        >
                          {serviceCategory}
                        </span>
                      )}

                      {/* Rating summary */}
                      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: C.ink600 }}>
                        <Star className="h-3.5 w-3.5 flex-shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
                        <span className="font-semibold" style={{ color: C.ink800 }}>{starRating.toFixed(1)}</span>
                        <span style={{ color: C.ink400 }}>({svcReviewCount} reviews)</span>
                      </div>

                      {/* Reviewer */}
                      {hasReview && (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {avatarUrl ? (
                              <img src={avatarUrl} alt={displayName} className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
                            ) : (
                              <div
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                style={{ background: C.rose100, color: C.rose600 }}
                                aria-hidden="true"
                              >
                                {avatarInitial}
                              </div>
                            )}
                            <span className="text-[12px] font-semibold" style={{ color: C.ink800 }}>{displayName}</span>
                          </div>
                          <StarRow rating={Number(svcReview?.rating ?? 5)} size={12} />
                          <p className="text-[11px] italic leading-relaxed" style={{ color: C.ink600 }}>
                            &ldquo;{quote}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Book button */}
                  <div className="flex items-center justify-end border-t px-4 py-3 md:px-5 md:py-3.5" style={{ borderColor: "#f3f4f6" }}>
                    <button
                      type="button"
                      onClick={() => openBookingFor(svc.id)}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors focus:outline-none"
                      style={{ background: "#374151" }}
                      aria-label={`Book ${svc.name}`}
                    >
                      Book Now
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}

            {filteredServices.length === 0 && (
              <p className="col-span-full py-10 text-center text-[14px]" style={{ color: C.ink500 }}>
                No services in this category.
              </p>
            )}
          </div>
        )}

        {/* "See more reviews" banner */}
        {reviewCount > 0 && (
          <a
            href="#visit"
            className="mt-5 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none"
            aria-label="View all Google reviews"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: C.rose50 }}>
                <Users className="h-5 w-5" style={{ color: C.rose600 }} aria-hidden="true" />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: C.ink900 }}>See more real results from our clients!</p>
                <p className="text-[12px]" style={{ color: C.ink500 }}>View all reviews on Google</p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 -rotate-90" style={{ color: C.ink400 }} aria-hidden="true" />
          </a>
        )}
        </div>
      </section>

      {/* ── GALLERY (conditional — only shown if photos exist) ────────────── */}
      {gallery.length > 0 && (
        <>
          <section
            id="gallery"
            aria-labelledby="gallery-heading"
            className="bg-white py-14 sm:py-20"
          >
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12">
              <div className="text-center">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: C.gold700 }}>Our Work</p>
                <h2
                  id="gallery-heading"
                  className="text-3xl font-semibold sm:text-4xl"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
                >
                  Client Gallery
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed" style={{ color: C.ink600 }}>
                  Every photo is a real client result from our studio. Tap any photo to view it larger.
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
                    aria-label={`View ${photo.caption ?? `gallery photo ${index + 1}`} larger`}
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
                  alt={gallery[lightboxIndex].caption ?? `${salonName} gallery photo ${lightboxIndex + 1}`}
                  className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
                />
                {gallery[lightboxIndex].caption && (
                  <figcaption className="max-w-xl text-center text-sm text-white/75">
                    {gallery[lightboxIndex].caption}
                  </figcaption>
                )}
                <p className="text-xs text-white/40">{lightboxIndex + 1} / {gallery.length}</p>
              </figure>
            </div>
          )}
        </>
      )}

      {/* ── VISIT US ──────────────────────────────────────────────────────── */}
      <section
        id="visit"
        aria-labelledby="visit-heading"
        className="bg-white py-14 sm:py-20"
        itemScope
        itemType="https://schema.org/LocalBusiness"
      >
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: C.gold700 }}>Visit Us</p>
            <h2
              id="visit-heading"
              className="text-3xl font-semibold sm:text-4xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              itemProp="name"
            >
              Find {salonName}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed" style={{ color: C.ink600 }}>
              Walk-ins welcome based on availability. Book ahead to guarantee your spot.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:mt-12 lg:grid-cols-2 lg:gap-8">
            {/* Info card */}
            <div
              className="flex flex-col gap-5 rounded-3xl border p-6 sm:p-8"
              style={{ borderColor: C.cream200, background: C.cream50 }}
            >
              {store.address && (
                <div className="flex gap-4">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                    style={{ background: C.gold50, color: C.gold700 }}
                  >
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>Address</h3>
                    <address className="mt-1 text-sm not-italic leading-relaxed" style={{ color: C.ink600 }} itemProp="address">
                      {store.address}
                    </address>
                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold"
                      style={{ color: C.gold700 }}
                    >
                      Get directions
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              )}

              {store.phone && (
                <div className="flex gap-4">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                    style={{ background: C.gold50, color: C.gold700 }}
                  >
                    <Phone className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>Phone</h3>
                    <a
                      href={phoneHref}
                      className="mt-1 block text-sm transition-colors"
                      style={{ color: C.ink600 }}
                      itemProp="telephone"
                    >
                      {store.phone}
                    </a>
                  </div>
                </div>
              )}

              {hours.length > 0 && (
                <div className="flex gap-4">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                    style={{ background: C.gold50, color: C.gold700 }}
                  >
                    <Clock className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>Opening Hours</h3>
                    <dl className="mt-2 divide-y" style={{ borderColor: C.cream200 }}>
                      {hours.map((row) => (
                        <div key={row.day} className="flex justify-between py-1.5 text-sm">
                          <dt style={{ color: C.ink600 }}>{row.day}</dt>
                          <dd
                            className={row.time === "Closed" ? "font-medium" : "font-semibold"}
                            style={{ color: row.time === "Closed" ? C.ink400 : C.ink800 }}
                          >
                            {row.time}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}
            </div>

            {/* Map placeholder card */}
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${salonName} in Google Maps`}
              className="group relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-3xl border shadow-sm transition-colors lg:min-h-0"
              style={{ borderColor: C.cream200, background: C.cream50 }}
            >
              {/* Grid pattern */}
              <svg
                className="absolute inset-0 h-full w-full opacity-[0.07]"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke={C.ink700} strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#map-grid)" />
              </svg>

              <div className="relative z-10 flex flex-col items-center gap-4 px-8 text-center">
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-transform duration-200 group-hover:scale-110"
                  style={{ background: C.gold700 }}
                >
                  <MapPin className="h-8 w-8 text-white" aria-hidden="true" />
                </span>
                {store.address && (
                  <p className="text-sm font-medium" style={{ color: C.ink700 }}>
                    {store.address}
                  </p>
                )}
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 transition-colors group-hover:text-white"
                  style={{
                    color: C.gold700,
                  }}
                >
                  Open in Google Maps
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ background: C.ink900, color: C.ink400 }} role="contentinfo">
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
              <p className="mt-1 text-sm" style={{ color: C.ink500 }}>Nail Studio</p>
            </div>

            {/* Nav links */}
            <nav aria-label="Footer navigation">
              <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                {[
                  { label: "Services", href: "#services" },
                  { label: "Gallery",  href: "#gallery"  },
                  { label: "Visit Us", href: "#visit"    },
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
                    onClick={() => openBookingFor()}
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
                { Icon: Instagram, label: "Instagram", href: "#" },
                { Icon: Facebook,  label: "Facebook",  href: "#" },
              ].map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="grid h-10 w-10 place-items-center rounded-full transition-all focus:outline-none"
                  style={{ background: C.ink800, color: C.ink400 }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>

            <div className="w-full border-t" style={{ borderColor: C.ink800 }} />

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

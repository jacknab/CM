/**
 * Solo website widgets (owner, 2026-11-11; plans/ai-site-widgets.md): what every widget shares — colours, types,
 * small parts and the booking panel. Moved here unchanged from SoloTheme.tsx.
 */
import { BusyError, getPublicJson } from "../publicFetch";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, MapPin, Phone, Star, X } from "lucide-react";
import { formatInTz } from "@/lib/timezone";
import { TimeZoneNote } from "../TimeZoneNote";
import { useCancellationPolicy } from "@/hooks/use-public-booking";
import { CancellationPolicyConsent } from "../CancellationPolicyConsent";
import { bookingClosed } from "../bookingClosed";
import { SoloPay, SoloSaveCard, type DepositHold } from "../SoloPay";
import { bookingServiceFields, extraServiceQuery } from "../twoServices";
import { AddonData, StoreData } from "../types";
import { useHouseCall, HouseCallFields } from "../houseCall";

// ── Color tokens (mapped from nail-salon-bloom tailwind.config.js) ─────────────
export const C = {
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

export interface ServiceEntry {
  id: number;
  name: string;
  price: string | number;
  duration?: number;
  description?: string;
  category?: string;
  categoryId?: number;
  imageUrl?: string | null;
  offeredAt?: string | null;
  allowQuantity?: boolean;
  maxQuantity?: number;
  /** How many on this visit; `price` and `duration` here are then for all of them. */
  quantity?: number;
}

export interface ServiceCategoryEntry {
  id: number;
  name: string;
}

/** The chosen colour, faintly: a selected service. */
/** − 1 + for a service or add-on sold by quantity. */
export function QtyStepper({ value, max, onChange, name }: { value: number; max: number; onChange: (next: number) => void; name: string }) {
  const button = "grid h-9 w-9 place-items-center rounded-full border text-lg font-semibold leading-none disabled:opacity-30";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={`How many ${name}`} data-testid={`solo-qty-${name}`}>
      <button type="button" onClick={() => onChange(value - 1)} className={button} style={{ borderColor: C.cream300, color: C.ink800 }} aria-label={`One less ${name}`}>−</button>
      <span className="min-w-[1.5rem] text-center text-[15px] font-bold" style={{ color: C.ink900 }} aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} className={button} style={{ borderColor: C.cream300, color: C.ink800 }} aria-label={`One more ${name}`}>+</button>
    </div>
  );
}

export const TINT = "color-mix(in srgb, var(--site-accent, #B45309) 12%, white)";

export function CheckDot({ on, small }: { on: boolean; small?: boolean }) {
  const size = small ? "h-5 w-5" : "h-6 w-6";
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full border`} style={{ background: on ? C.gold700 : "transparent", borderColor: on ? C.gold700 : C.cream300 }} aria-hidden="true">
      {on && <Check className={small ? "h-3 w-3" : "h-3.5 w-3.5"} color="#fff" strokeWidth={3} />}
    </span>
  );
}

/** The client's profile photo on their review, or their first initial when there is none. */
export function ReviewerAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [photoUrl]);
  if (photoUrl && !broken) {
    return <img src={photoUrl} alt="" loading="lazy" onError={() => setBroken(true)} className="h-10 w-10 shrink-0 rounded-full object-cover" data-testid="solo-review-avatar" />;
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-semibold text-white" style={{ background: C.gold700 }} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
  );
}

/** The photos a client added to their review, tap to see one full size. */
export function ReviewPhotos({ urls, large }: { urls?: string[] | string | null; large?: boolean }) {
  const list = parseReviewImageUrls(urls);
  if (list.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="solo-review-photos">
      {list.map((url) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the review photo" className={large ? "block w-full" : undefined}>
          <img src={url} alt="Photo from the client's review" loading="lazy"
            // A Google review photo link that no longer loads (they expire) is hidden, never shown broken (2026-11-11).
            onError={(e) => { const box = e.currentTarget.closest("a") as HTMLElement | null; (box ?? e.currentTarget).style.display = "none"; }} className={large ? "aspect-[4/3] w-full rounded-xl object-cover" : "h-40 w-40 rounded-xl object-cover"} />
        </a>
      ))}
    </div>
  );
}

export interface GoogleReviewEntry {
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
  /** Where the review was written: a Google review is always named as Google's. */
  source?: "google" | "certxa";
}

/** Mirrors ServiceReviewResult from serviceReviewMatcher.ts — one per service, keyed by service ID */
export interface ServiceReviewEntry {
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

export interface TimeSlot {
  time: string;
  staffId: number;
  staffName: string;
  /** Who does the second service, when another professional does it. */
  extraStaffId?: number;
}

/** A professional clients can book (GET /api/public/store/:slug/team). */
export interface TeamMember {
  id: number;
  name: string;
  role: string | null;
  bio: string | null;
  avatarUrl: string | null;
  serviceIds: number[];
  /** Barbershops and hair salons: this professional's own price for each service they do. */
  prices?: Record<string, number>;
}

/** A service's price with this professional (their own price at a barbershop or hair salon), for however many. */
export function proPrice(svc: ServiceEntry, team: TeamMember[], staffId: number | null | undefined): number {
  const own = staffId != null ? team.find((m) => m.id === staffId)?.prices?.[String(svc.id)] : undefined;
  const quantity = Number((svc as { quantity?: number }).quantity) || 1;
  if (own != null) return own * quantity;
  // No one chosen yet: the lowest price a professional who does it charges ("from").
  const all = team.map((m) => m.prices?.[String(svc.id)]).filter((x): x is number => x != null);
  return all.length ? Math.min(...all) * quantity : Number(svc.price ?? 0);
}
/** True when the professionals who do this service charge different prices for it. */
export function pricesVary(svc: ServiceEntry, team: TeamMember[]): boolean {
  const all = team.map((m) => m.prices?.[String(svc.id)]).filter((x): x is number => x != null);
  return all.length > 1 && Math.min(...all) !== Math.max(...all);
}
export const firstName = (name: string) => name.trim().split(/\s+/)[0];

export type SoloTab = "about" | "services" | "portfolio";
export const SOLO_TABS: { id: SoloTab; label: string }[] = [
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "portfolio", label: "Portfolio" },
];

export interface GalleryPhoto {
  /** "Book this look": the service this photo shows, when the pro chose one. */
  service_id?: number | null;
  image_url: string;
  caption?: string | null;
}

// place, date and time are steps of their own (owner, 2026-11-07): where, then the month, then the times.
export type BookingStep = "place" | "date" | "time" | "details" | "card" | "payment" | "success";

export interface BloomThemeProps {
  store: StoreData;
  slug: string;
  preselectedStaffId?: number;
  preselectedServiceId?: number;
}

// ── Static fallbacks ──────────────────────────────────────────────────────────

// Per-service-type Pexels fallback images — keyed to match the template's categoryKey buckets.
export const FALLBACK_IMAGES: Record<string, string> = {
  manicure:  "https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=800",
  pedicure:  "https://images.pexels.com/photos/3997388/pexels-photo-3997388.jpeg?auto=compress&cs=tinysrgb&w=800",
  extension: "https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=800",
  art:       "https://images.pexels.com/photos/3997387/pexels-photo-3997387.jpeg?auto=compress&cs=tinysrgb&w=800",
  addon:     "https://images.pexels.com/photos/3997392/pexels-photo-3997392.jpeg?auto=compress&cs=tinysrgb&w=800",
};

/** Pick the most relevant Pexels fallback for a service based on its name + category. */
export function pickFallbackImage(svc: ServiceEntry, categoryName?: string): string {
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

export const DAY_NAMES   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const DAY_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export function isPast(d: Date): boolean {
  const t = new Date();
  t.setHours(0,0,0,0);
  return d < t;
}

export function formatSlotTime(isoStr: string, timezone: string): string {
  try { return formatInTz(isoStr, timezone, "h:mm a"); }
  catch { return isoStr; }
}

export function formatPrice(price: string | number): string {
  const n = typeof price === "string" ? parseFloat(price) : price;
  return isNaN(n) || n === 0 ? "POA" : `$${n}`;
}

export function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 && h < 24 ? "PM" : "AM"; // 24:00 is the midnight a day ends on
  const hour   = h === 24 ? 12 : h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2,"0")} ${period}`;
}

export function parseReviewImageUrls(input?: string[] | string | null): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter((u) => typeof u === "string");
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === "string") : [];
  } catch { return []; }
}

export function extractMediaPhotoUrl(media?: Array<Record<string, unknown>> | null): string | null {
  if (!Array.isArray(media)) return null;
  for (const item of media) {
    const direct = item?.googleUrl ?? item?.sourceUrl ?? item?.url ?? item?.thumbnailUrl;
    if (typeof direct === "string" && direct.trim()) return direct;
  }
  return null;
}

/**
 * Visit Us (owner, 2026-11-07: copied from the Lacquer website template, placed right before the footer). The city
 * line: the business's own city, state and ZIP; else read from an address saved on one line
 * ("840 The City Dr S, Orange, CA 92868, USA" → "Orange, CA 92868").
 */
export function visitCityLine(store: StoreData): string {
  const own = [(store as any).city, (store as any).state, (store as any).postcode].filter(Boolean).join(", ");
  if (own) return own;
  const parts = String(store.address ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(usa|us|united states( of america)?)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length >= 3 ? parts.slice(-2).join(", ") : "";
}

/** One of a few equivalent Visit Us sentences, picked by the salon's name (owner, 2026-11-07): not the same on every site. */
export function visitSentence(salonName: string, canBookOnline: boolean): string {
  const on = [
    "Walk-ins welcome based on availability, but booking ahead guarantees your spot.",
    "Book online to hold your time, or stop by and we will fit you in when we can.",
    "Plan your visit with the hours and map below, then book a time that suits you.",
    "Use the map for directions, and book ahead online to skip the wait.",
    "Stop in when you are nearby, or book online in a few taps.",
  ];
  const off = [
    "Online booking is not available here, so please call ahead to confirm services and opening times.",
    "Call before you visit to check today\u2019s openings and the services you would like.",
    "Give us a call to confirm details, or use the map below to find your way.",
    "Questions about a service or today\u2019s hours? Call before you stop by.",
    "Use the map below for directions, and call ahead to confirm the services you need.",
  ];
  const list = canBookOnline ? on : off;
  let h = 0;
  for (const ch of salonName) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export function VisitUs({ store, phoneHref, phoneLabel, hours }: { store: StoreData; phoneHref?: string; phoneLabel?: string | null; hours: { day: string; time: string }[] }) {
  const address = String(store.address ?? "").trim();
  const city = visitCityLine(store);
  // An address saved on one line already holds the city: don't repeat it.
  const cityLine = city && !address.includes(city) ? city : "";
  const mapSrc = address ? `https://www.google.com/maps?q=${encodeURIComponent([address, cityLine].filter(Boolean).join(", "))}&z=15&hl=en&output=embed` : null;
  const heading = "'Playfair Display', Georgia, serif";
  const iconBox = "grid h-12 w-12 shrink-0 place-items-center rounded-xl";
  return (
    <section id="visit" className="px-4 py-12 sm:px-6 sm:py-16 lg:py-24" style={{ background: C.cream100 }} data-testid="solo-visit-us">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: C.gold700 }}>
            <span className="h-px w-6" style={{ background: C.gold700 }} />Visit Us<span className="h-px w-6" style={{ background: C.gold700 }} />
          </span>
          <h2 className="mt-3 text-3xl font-medium leading-tight sm:mt-4 sm:text-5xl" style={{ fontFamily: heading, color: C.ink900 }}>Find the Studio</h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: C.ink600 }}>
            {city ? `Conveniently located in ${city}. ` : ""}{visitSentence(store.name ?? "", !bookingClosed(store))}
          </p>
        </div>
        <div className={`mt-8 grid gap-5 sm:mt-12 sm:gap-8 ${mapSrc ? "lg:grid-cols-2" : "mx-auto max-w-xl"}`}>
          <div className="flex flex-col gap-5 rounded-3xl border bg-white p-5 shadow-sm sm:gap-6 sm:p-8" style={{ borderColor: C.cream200 }}>
            {(address || city) && (
              <div className="flex gap-4">
                <span className={iconBox} style={{ background: C.cream100 }}><MapPin className="h-6 w-6" style={{ color: C.gold700 }} aria-hidden="true" /></span>
                <div>
                  <h3 className="text-lg font-semibold" style={{ fontFamily: heading, color: C.ink900 }}>Address</h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: C.ink600 }}>
                    {address || city}
                    {address && cityLine && <><br />{cityLine}</>}
                  </p>
                </div>
              </div>
            )}
            {phoneLabel && (
              <div className="flex gap-4">
                <span className={iconBox} style={{ background: C.cream100 }}><Phone className="h-6 w-6" style={{ color: C.gold700 }} aria-hidden="true" /></span>
                <div>
                  <h3 className="text-lg font-semibold" style={{ fontFamily: heading, color: C.ink900 }}>Phone</h3>
                  <a href={phoneHref} className="mt-1 block text-sm" style={{ color: C.ink600 }}>{phoneLabel}</a>
                </div>
              </div>
            )}
            {hours.length > 0 && (
              <div className="flex gap-4">
                <span className={iconBox} style={{ background: C.cream100 }}><Clock className="h-6 w-6" style={{ color: C.gold700 }} aria-hidden="true" /></span>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold" style={{ fontFamily: heading, color: C.ink900 }}>Opening Hours</h3>
                  <dl className="mt-2 divide-y" style={{ borderColor: C.cream200 }}>
                    {hours.map((row) => (
                      <div key={row.day} className="flex justify-between py-1.5 text-sm" style={{ borderColor: C.cream200 }}>
                        <dt style={{ color: C.ink600 }}>{row.day}</dt>
                        <dd className="font-medium" style={{ color: row.time === "Closed" ? C.ink400 : C.ink800 }}>{row.time}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </div>
          {mapSrc && (
            <div className="min-h-[280px] overflow-hidden rounded-3xl border shadow-sm sm:min-h-[400px] lg:min-h-0" style={{ borderColor: C.cream200 }}>
              <iframe title={`Map to ${store.name}`} src={mapSrc} className="h-full min-h-[280px] w-full border-0 sm:min-h-[400px]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function extractCity(address?: string): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim());
  // "123 Main St, Houston, TX 77001" → parts[1] = "Houston"
  if (parts.length >= 3) return parts[parts.length - 3] || "";
  if (parts.length === 2) return parts[1] || "";
  return "";
}

export function formatBusinessHours(businessHours?: StoreData["businessHours"]): { day: string; time: string }[] {
  if (!businessHours?.length) return [];
  return [...businessHours]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((h) => ({
      day: DAY_NAMES[h.dayOfWeek],
      time: h.isClosed
        ? "Closed"
        : h.openTime === "00:00" && h.closeTime === "24:00"
          ? "Open 24 hours"
          : `${formatTime12h(h.openTime)} – ${formatTime12h(h.closeTime)}`,
    }));
}

export function buildDirectionsUrl(address?: string): string {
  if (!address) return "https://maps.google.com";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// ── StarRow ───────────────────────────────────────────────────────────────────
export function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
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
export interface BookingPanelProps {
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
  /** The professionals clients can book; with two or more, the client may choose one or leave it open. */
  team: TeamMember[];
  staffChoice: number | null;
  onStaffChoice: (staffId: number | null) => void;
  /** From a personal booking link (?c=…) the pro texted: the client's details, filled in on the form. */
  knownClient?: { name: string; phone: string; email: string } | null;
}

export function BookingPanel({
  isOpen,
  onClose,
  store,
  slug,
  chosen: selected,
  chosenAddons,
  onBooked,
  preselectedStaffId,
  timezone,
  team,
  staffChoice,
  onStaffChoice,
  knownClient,
}: BookingPanelProps) {
  const [step, setStep]                 = useState<BookingStep>("date");
  // Up to two services on one visit (twoServices.ts); the first decides the visit's start.
  const selectedService = selected[0] ?? null;
  const picked = selected.map((x) => ({ id: x.id, duration: x.duration ?? 60 }));
  const totalMinutes = picked.reduce((sum, x) => sum + x.duration, 0) + chosenAddons.reduce((sum, a) => sum + (Number(a.duration) || 0), 0);
  // A barbershop or hair salon prices by professional: the one taking the time (or the one chosen), else the lowest.
  const priced = team.some((m) => m.prices);
  const [selectedSlotForPrice, setSelectedSlotForPrice] = useState<TimeSlot | null>(null);
  const pricedBy = (index: number) => index === 1 ? (selectedSlotForPrice?.extraStaffId ?? selectedSlotForPrice?.staffId ?? staffChoice) : (selectedSlotForPrice?.staffId ?? staffChoice);
  const totalPrice = selected.reduce((sum, x, i) => sum + (priced ? proPrice(x, team, pricedBy(i)) : Number(x.price ?? 0)), 0) + chosenAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const priceIsFrom = priced && !selectedSlotForPrice && staffChoice == null && selected.some((x) => pricesVary(x, team));
  // Who can be chosen: the professionals who do the first service (another may do the second, as before).
  const choosable = selectedService ? team.filter((m) => m.serviceIds.includes(Number(selectedService.id))) : [];
  const staffFilter = staffChoice ?? preselectedStaffId;
  const addonCounts = chosenAddons.reduce((map, a) => map.set(a.name, (map.get(a.name) ?? 0) + 1), new Map<string, number>());
  const summary = [...selected.map((x) => x.name), ...[...addonCounts].map(([label, n]) => (n > 1 ? `${label} × ${n}` : label))].join(" + ");
  const visitLength = totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)} hr${totalMinutes % 60 ? ` ${totalMinutes % 60} min` : ""}` : `${totalMinutes} min`;
  const hc = useHouseCall(store, slug, selected);
  /** Months on from this one, for the Date step's calendar. */
  const [monthOffset, setMonthOffset]   = useState(0);
  // Where the visit is: a step of its own only when there is something to choose or an address to give.
  const needsPlace = hc.offered && (hc.showChoice || hc.visitAt === "client");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots]               = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError]     = useState<string | null>(null);
  const [selectedSlot, setSelectedSlotState] = useState<TimeSlot | null>(null);
  const setSelectedSlot = (slot: TimeSlot | null) => { setSelectedSlotState(slot); setSelectedSlotForPrice(slot); };
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
    getPublicJson<typeof payPolicy>(`/api/public/booking-payment-policy/${slug}`).then(setPayPolicy).catch(() => setPayPolicy(null));
  }, [isOpen, slug]);
  // Shown to the client; the server works out the amount itself (lib/bookingPaymentLinks.ts depositFromRule).
  const depositBase = totalPrice + (payPolicy?.depositIncludeTravelFee ? hc.travelFee : 0);
  const depositDue = payPolicy?.policy !== "deposit" ? 0
    : payPolicy.depositType === "full" ? depositBase
    : payPolicy.depositType === "percentage" ? (depositBase * (payPolicy.depositValue ?? 0)) / 100
    : Math.min(depositBase, payPolicy.depositValue ?? 0);
  const visitPlace = [hc.address.line1.trim(), hc.address.city.trim()].filter(Boolean).join(", ");
  const paysInFull = depositDue > 0 && depositDue >= totalPrice + hc.travelFee;
  const payOnPage = !!payPolicy?.stripePublishableKey && !!payPolicy.stripeConnectedAccountId;
  const savesCard = payPolicy?.policy === "card_on_file";
  const cancelPolicy = useCancellationPolicy(slug);
  const cancelAckNeeded = !!cancelPolicy.data?.required && !!cancelPolicy.data?.text;


  // The days they work: business hours.
  const week = store.businessHours ?? [];
  const isDayOff = (day: Date) => !!week.find((d) => d.dayOfWeek === day.getDay())?.isClosed;
  /** The first day from `from` that they work (at most a week on, in case nothing is set). */
  const firstWorkingDay = (from?: Date) => {
    const day = from ? new Date(from) : new Date();
    day.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7 && isDayOff(day); i++) day.setDate(day.getDate() + 1);
    return day;
  };
  /** Moves the calendar along too, so the day picked is in the month shown. */
  const goToDay = (day: Date) => {
    setSelectedDate(day);
    const today = new Date();
    setMonthOffset((day.getFullYear() - today.getFullYear()) * 12 + day.getMonth() - today.getMonth());
  };

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setStep(needsPlace ? "place" : "date");
    setHold(null);
    setSelectedDate(firstWorkingDay());
    setSlots([]);
    setSelectedSlot(null);
    setMonthOffset(0);
    setName(knownClient?.name ?? ""); setPhone(knownClient?.phone ?? ""); setEmail(knownClient?.email ?? ""); setSmsConsent(false);
    setSubmitError(null); setSlotsError(null);
  }, [isOpen]);

  // Auto-select the first day they work whenever we enter the date step and nothing is selected
  useEffect(() => {
    if (step === "date" && selectedDate === null) setSelectedDate(firstWorkingDay());
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (staffFilter) params.set("staffId", String(staffFilter));
    hc.applyParams(params);
    let live = true;
    getPublicJson<TimeSlot[]>(`/api/public/store/${slug}/availability?${params}`, { isLive: () => live })
      .then((d) => { if (!live) return; if (d === null) throw new Error("error"); setSlots(Array.isArray(d) ? d : []); })
      .catch((err) => {
        if (!live) return;
        setSlotsError(err instanceof BusyError ? "Lots of people are booking right now. Please try again in a moment." : "Could not load availability. Please try another date.");
      })
      .finally(() => { if (live) setSlotsLoading(false); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selected, slug, staffFilter, hc.ready, hc.timesKey]);

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
          serviceQuantities: Object.fromEntries(selected.filter((x) => (x.quantity ?? 1) > 1).map((x) => [String(x.id), x.quantity])),
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

  // The Date step's month: leading blanks so the 1st sits under its weekday, then every day of the month.
  const monthStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() + monthOffset); return d; })();
  const monthCells: (Date | null)[] = [
    ...Array.from({ length: monthStart.getDay() }, () => null),
    ...Array.from({ length: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate() }, (_, i) => new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1)),
  ];
  /** "12:15 PM - 1:00 PM": the time and when the visit ends (owner, 2026-11-07). */
  // The time range ends after the visit and the business's Padded time, which the booking keeps (owner, 2026-11-09).
  const slotRange = (iso: string) => `${formatSlotTime(iso, timezone)} - ${formatSlotTime(new Date(new Date(iso).getTime() + (totalMinutes + (Number(store.paddedMinutes) || 0)) * 60_000).toISOString(), timezone)}`;

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
            {(step === "place" || step === "date" || step === "time" || step === "details" || step === "card") && (
              <button
                type="button"
                onClick={() => {
                  if (step === "card") setStep("details");
                  else if (step === "details") setStep("time");
                  else if (step === "time") setStep("date");
                  else if (step === "date" && needsPlace) setStep("place");
                  else onClose();
                }}
                data-testid="solo-booking-back"
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
                  {summary} · {priceIsFrom ? "from " : ""}{formatPrice(totalPrice + hc.travelFee)}
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
            {(() => {
              const shown: [BookingStep | "service", string][] = [["service", "Service"], ...(needsPlace ? [["place", "Location"] as [BookingStep, string]] : []), ["date", "Date"], ["time", "Time"], ["details", "Your details"]];
              const order = [...shown.map(([k]) => k), step === "card" ? "card" : "payment"];
              return shown.map(([key, label], i) => ({ key, label, reached: order.indexOf(step) >= i }));
            })().map(({ key, label, reached }) => {
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

          {/* STEP: place — where the visit is (owner, 2026-11-07: a step of its own) */}
          {step === "place" && (
            <div className="px-5 py-5" data-testid="solo-step-place">
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>
                <MapPin className="h-4 w-4" style={{ color: C.gold700 }} />
                Where would you like your appointment?
              </h3>
              <HouseCallFields hc={hc} />
              {hc.ready && (
                <button
                  type="button"
                  onClick={() => setStep("date")}
                  data-testid="solo-place-continue"
                  className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold text-white"
                  style={{ background: C.gold700 }}
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* STEP: date — the month's calendar (owner, 2026-11-07: a step of its own) */}
          {step === "date" && (
            <div className="px-5 py-5" data-testid="solo-step-date">
              <h3
                className="mb-4 flex items-center gap-2 text-base font-semibold"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              >
                <Calendar className="h-4 w-4" style={{ color: C.gold700 }} />
                Pick a Date
              </h3>
              {choosable.length >= 2 && (
                <div className="mb-5" data-testid="solo-pro-choice">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink400 }}>Professional</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose a professional">
                    {[{ id: null as number | null, label: "Any professional", price: null as number | null }, ...choosable.map((m) => ({
                      id: m.id as number | null, label: firstName(m.name),
                      price: priced ? selected.reduce((sum, x) => sum + proPrice(x, team, m.id), 0) + chosenAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0) : null,
                    }))].map((o) => {
                      const on = (staffChoice ?? null) === o.id;
                      return (
                        <button
                          key={o.id ?? "any"}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => onStaffChoice(o.id)}
                          data-testid={`solo-pro-${o.id ?? "any"}`}
                          className="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
                          style={{ background: on ? C.gold700 : "#fff", borderColor: on ? C.gold700 : C.cream200, color: on ? "#fff" : C.ink800 }}
                        >
                          {o.label}{o.price != null ? ` · ${formatPrice(o.price + hc.travelFee)}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.cream200 }} data-testid="solo-month">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
                    disabled={monthOffset === 0}
                    className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-gray-100 disabled:opacity-30"
                    aria-label="Previous month"
                    data-testid="solo-month-prev"
                  >
                    <ChevronLeft className="h-4 w-4" style={{ color: C.ink500 }} />
                  </button>
                  <span className="text-sm font-semibold" style={{ color: C.ink800 }} data-testid="solo-month-title">
                    {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMonthOffset((m) => Math.min(11, m + 1))}
                    disabled={monthOffset >= 11}
                    className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-gray-100 disabled:opacity-30"
                    aria-label="Next month"
                    data-testid="solo-month-next"
                  >
                    <ChevronRight className="h-4 w-4" style={{ color: C.ink500 }} />
                  </button>
                </div>
                <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase" style={{ color: C.ink400 }}>
                  {DAY_SHORT.map((d) => <span key={d} className="py-1">{d.slice(0, 2)}</span>)}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {monthCells.map((day, i) => {
                    if (!day) return <span key={`blank-${i}`} aria-hidden="true" />;
                    const off = isPast(day) || isDayOff(day);
                    const today = isToday(day);
                    const on = !!selectedDate && toDateKey(day) === toDateKey(selectedDate);
                    return (
                      <button
                        key={toDateKey(day)}
                        type="button"
                        disabled={off}
                        onClick={() => { setSelectedDate(day); setSelectedSlot(null); setStep("time"); }}
                        data-testid={`solo-day-${toDateKey(day)}`}
                        aria-label={day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                        className="grid aspect-square place-items-center rounded-full text-sm font-semibold transition-colors focus:outline-none"
                        style={{
                          background: on ? C.gold700 : undefined,
                          color: on ? "#fff" : off ? C.cream300 : today ? C.gold700 : C.ink800,
                          border: today && !on ? `2px solid ${C.gold700}` : undefined,
                          cursor: off ? "not-allowed" : "pointer",
                        }}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP: time — the open times on the chosen day, start and end (owner, 2026-11-07) */}
          {step === "time" && selectedDate && (
            <div className="px-5 py-5" data-testid="solo-step-time">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>
                    <Clock className="h-4 w-4" style={{ color: C.gold700 }} />
                    Pick a Time
                  </h3>
                  <p className="mt-1 text-sm font-semibold" style={{ color: C.ink800 }} data-testid="solo-time-day">
                    {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                  <TimeZoneNote timezone={timezone} at={slots[0]?.time} className="mt-1 text-xs" style={{ color: C.ink500 }} />
                </div>
                <button
                  type="button"
                  onClick={() => setStep("date")}
                  className="shrink-0 text-xs font-semibold hover:underline"
                  style={{ color: C.gold700 }}
                  data-testid="solo-change-date"
                >
                  Change date
                </button>
              </div>

              {slotsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: C.ink500 }}>
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: C.gold700 }} />
                  Loading availability…
                </div>
              ) : slotsError ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{slotsError}</p>
              ) : slots.length === 0 ? (
                <div className="rounded-2xl border bg-white py-8 text-center" style={{ borderColor: C.cream200 }}>
                  <p className="text-sm font-semibold" style={{ color: C.ink700 }}>No times left on this day</p>
                  <p className="mt-1 text-xs" style={{ color: C.ink400 }}>Try the next day</p>
                  <button
                    type="button"
                    data-testid="solo-next-day"
                    onClick={() => { const next = new Date(selectedDate); next.setDate(next.getDate() + 1); goToDay(firstWorkingDay(next)); }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-white"
                    style={{ background: C.gold700 }}
                  >
                    Next day <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-5" data-testid="solo-time-slots">
                  {(Object.entries(slotGroups) as [string, TimeSlot[]][]).map(([group, groupSlots]) => {
                    if (groupSlots.length === 0) return null;
                    return (
                      <div key={group}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink400 }}>
                          {group}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {groupSlots.map((slot) => {
                            const isSel = selectedSlot?.time === slot.time && selectedSlot?.staffId === slot.staffId;
                            return (
                              <button
                                key={`${slot.time}-${slot.staffId}`}
                                type="button"
                                onClick={() => { setSelectedSlot(slot); setStep("details"); }}
                                className="rounded-xl border px-2 py-3 text-center text-sm font-semibold transition-all focus:outline-none"
                                style={{
                                  background: isSel ? C.gold700 : "#fff",
                                  borderColor: isSel ? C.gold700 : C.cream200,
                                  color: isSel ? "#fff" : C.ink800,
                                }}
                              >
                                {slotRange(slot.time)}
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
                      {selectedSlot.staffName && ` · with ${selectedSlot.staffName.trim().split(/\s+/)[0]}`}
                      {` · ${visitLength}`}
                    </span>
                  </div>
                  {/* Where the visit is, and the travel fee that's in the total. */}
                  {hc.visitAt === "client" && visitPlace && (
                    <p className="mt-1.5 flex items-start gap-1 text-xs" style={{ color: C.ink500 }} data-testid="solo-house-call-line">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" style={{ color: C.gold700 }} />
                      <span>{visitPlace}{hc.travelFee > 0 ? ` · ${formatPrice(hc.travelFee)} travel fee` : ""}</span>
                    </p>
                  )}
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
                      {selectedSlot.staffName && ` · with ${selectedSlot.staffName.trim().split(/\s+/)[0]}`}
                      {` · ${visitLength}`}
                    </span>
                  </div>
                  {/* Where the visit is, and the travel fee that's in the total. */}
                  {hc.visitAt === "client" && visitPlace && (
                    <p className="mt-1.5 flex items-start gap-1 text-xs" style={{ color: C.ink500 }} data-testid="solo-house-call-line">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" style={{ color: C.gold700 }} />
                      <span>{visitPlace}{hc.travelFee > 0 ? ` · ${formatPrice(hc.travelFee)} travel fee` : ""}</span>
                    </p>
                  )}
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


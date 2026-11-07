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
import { BusyError, getPublicJson } from "./publicFetch";
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
// import SiteChat from "./SiteChat"; // chat bubble hidden on Solo for now (owner, 2026-11-07)
import { bookingClosed } from "./bookingClosed";
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
  allowQuantity?: boolean;
  maxQuantity?: number;
  /** How many on this visit; `price` and `duration` here are then for all of them. */
  quantity?: number;
}

interface ServiceCategoryEntry {
  id: number;
  name: string;
}

/** The chosen colour, faintly: a selected service. */
/** − 1 + for a service or add-on sold by quantity. */
function QtyStepper({ value, max, onChange, name }: { value: number; max: number; onChange: (next: number) => void; name: string }) {
  const button = "grid h-9 w-9 place-items-center rounded-full border text-lg font-semibold leading-none disabled:opacity-30";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={`How many ${name}`} data-testid={`solo-qty-${name}`}>
      <button type="button" onClick={() => onChange(value - 1)} className={button} style={{ borderColor: C.cream300, color: C.ink800 }} aria-label={`One less ${name}`}>−</button>
      <span className="min-w-[1.5rem] text-center text-[15px] font-bold" style={{ color: C.ink900 }} aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} className={button} style={{ borderColor: C.cream300, color: C.ink800 }} aria-label={`One more ${name}`}>+</button>
    </div>
  );
}

const TINT = "color-mix(in srgb, var(--site-accent, #B45309) 12%, white)";

function CheckDot({ on, small }: { on: boolean; small?: boolean }) {
  const size = small ? "h-5 w-5" : "h-6 w-6";
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full border`} style={{ background: on ? C.gold700 : "transparent", borderColor: on ? C.gold700 : C.cream300 }} aria-hidden="true">
      {on && <Check className={small ? "h-3 w-3" : "h-3.5 w-3.5"} color="#fff" strokeWidth={3} />}
    </span>
  );
}

/** The client's profile photo on their review, or their first initial when there is none. */
function ReviewerAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
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
  /** Where the review was written: a Google review is always named as Google's. */
  source?: "google" | "certxa";
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
  /** Who does the second service, when another professional does it. */
  extraStaffId?: number;
}

/** A professional clients can book (GET /api/public/store/:slug/team). */
interface TeamMember {
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
function proPrice(svc: ServiceEntry, team: TeamMember[], staffId: number | null | undefined): number {
  const own = staffId != null ? team.find((m) => m.id === staffId)?.prices?.[String(svc.id)] : undefined;
  const quantity = Number((svc as { quantity?: number }).quantity) || 1;
  if (own != null) return own * quantity;
  // No one chosen yet: the lowest price a professional who does it charges ("from").
  const all = team.map((m) => m.prices?.[String(svc.id)]).filter((x): x is number => x != null);
  return all.length ? Math.min(...all) * quantity : Number(svc.price ?? 0);
}
/** True when the professionals who do this service charge different prices for it. */
function pricesVary(svc: ServiceEntry, team: TeamMember[]): boolean {
  const all = team.map((m) => m.prices?.[String(svc.id)]).filter((x): x is number => x != null);
  return all.length > 1 && Math.min(...all) !== Math.max(...all);
}
const firstName = (name: string) => name.trim().split(/\s+/)[0];

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

// place, date and time are steps of their own (owner, 2026-11-07): where, then the month, then the times.
type BookingStep = "place" | "date" | "time" | "details" | "card" | "payment" | "success";

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
  const period = h >= 12 && h < 24 ? "PM" : "AM"; // 24:00 is the midnight a day ends on
  const hour   = h === 24 ? 12 : h > 12 ? h - 12 : h === 0 ? 12 : h;
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

/**
 * Visit Us (owner, 2026-11-07: copied from the Lacquer website template, placed right before the footer). The city
 * line: the business's own city, state and ZIP; else read from an address saved on one line
 * ("840 The City Dr S, Orange, CA 92868, USA" → "Orange, CA 92868").
 */
function visitCityLine(store: StoreData): string {
  const own = [(store as any).city, (store as any).state, (store as any).postcode].filter(Boolean).join(", ");
  if (own) return own;
  const parts = String(store.address ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(usa|us|united states( of america)?)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length >= 3 ? parts.slice(-2).join(", ") : "";
}

function VisitUs({ store, phoneHref, phoneLabel, hours }: { store: StoreData; phoneHref?: string; phoneLabel?: string | null; hours: { day: string; time: string }[] }) {
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
            {city ? `Conveniently located in ${city}. ` : ""}Walk-ins welcome based on availability, but booking ahead guarantees your spot.
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
        : h.openTime === "00:00" && h.closeTime === "24:00"
          ? "Open 24 hours"
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
  /** The professionals clients can book; with two or more, the client may choose one or leave it open. */
  team: TeamMember[];
  staffChoice: number | null;
  onStaffChoice: (staffId: number | null) => void;
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
  team,
  staffChoice,
  onStaffChoice,
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
    setName(""); setPhone(""); setEmail(""); setSmsConsent(false);
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
  const slotRange = (iso: string) => `${formatSlotTime(iso, timezone)} - ${formatSlotTime(new Date(new Date(iso).getTime() + totalMinutes * 60_000).toISOString(), timezone)}`;

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
    getPublicJson<ShopData>(`/api/public/store/${slug}/shop`).then(setShop).catch(() => setShop(null));
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
  // The professionals clients can book. With two or more: the team on the About tab, and a choice when booking.
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [staffChoice, setStaffChoice] = useState<number | null>(preselectedStaffId ?? null);
  const teamShown = team.length >= 2;
  const priced = team.some((m) => m.prices);
  /** The business switched its booking system off: the website stays, its booking controls go. */
  // Booking System off, or "Who can book online" set to Nobody (bookingClosed.tsx).
  const bookingOff = bookingClosed(store);
  const [activeCategory, setActiveCategory] = useState("All");

  // Header state
  const [scrolled, setScrolled]   = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);

  // Booking panel state
  const [bookingOpen, setBookingOpen]                       = useState(false);
  // Services picked on the Services tab (up to two), booked together from the bar at the bottom.
  const [cart, setCart]                                     = useState<ServiceEntry[]>([]);
  const barShown = !bookingOff && (tab === "services" || cart.length > 0);
  const [cartAddons, setCartAddons]                         = useState<Record<number, number[]>>({});
  const [cartOpen, setCartOpen]                             = useState(false);
  /** The one service showing its add-ons. */
  const [expandedId, setExpandedId]                         = useState<number | null>(null);
  const [addons, setAddons]                                 = useState<AddonData[]>([]);
  const [serviceAddons, setServiceAddons]                   = useState<ServiceAddonData[]>([]);
  // Only add-ons that reach the service through an Add-on Group are offered, in the group's order.
  const addonsFor = (serviceId: number) => {
    const byId = new Map(addons.map((a) => [Number(a.id), a]));
    return serviceAddons
      .filter((x) => Number(x.serviceId) === Number(serviceId))
      .map((x) => byId.get(Number(x.addonId)))
      .filter((a): a is AddonData => !!a);
  };
  // An add-on chosen three times is in the list three times, which is how the booking carries a quantity.
  const chosenFor = (serviceId: number) => (cartAddons[serviceId] ?? []).map((id) => addons.find((a) => a.id === id)).filter((a): a is AddonData => !!a);
  const [serviceQty, setServiceQty] = useState<Record<number, number>>({});
  const qtyOf = (x: ServiceEntry) => serviceQty[x.id] ?? 1;
  /** A service as the visit sees it: its whole price and time for however many. */
  const inVisit = (x: ServiceEntry): ServiceEntry => {
    const quantity = qtyOf(x);
    return quantity > 1 ? { ...x, name: `${x.name} × ${quantity}`, price: Number(x.price ?? 0) * quantity, duration: (x.duration ?? 60) * quantity, quantity } : x;
  };
  /** What the page shows for a service: at a barbershop or hair salon, the chosen professional's price (else "from"). */
  const shownPrice = (x: ServiceEntry) => (priced ? proPrice(inVisit(x), team, staffChoice) : Number(inVisit(x).price ?? 0));
  const fromPrice = (x: ServiceEntry) => priced && staffChoice == null && pricesVary(x, team);
  const chosenAddons = cart.flatMap((x) => chosenFor(x.id));
  const cartTotal = cart.reduce((sum, x) => sum + shownPrice(x), 0) + chosenAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const cartFrom = cart.some(fromPrice);
  const cartCount = cart.length + chosenAddons.length;
  const cartLines: CartLine[] = cart.map((x) => ({ id: x.id, name: inVisit(x).name, price: shownPrice(x), addons: chosenFor(x.id) }));
  /** A service with its add-ons, for the limit on two services together (twoServices.ts). */
  const visitPart = (x: ServiceEntry) => ({ id: x.id, duration: (x.duration ?? 60) * qtyOf(x) + chosenFor(x.id).reduce((sum, a) => sum + (Number(a.duration) || 0), 0) });
  const removeService = (id: number) => {
    setCart((list) => list.filter((x) => x.id !== id));
    setCartAddons((map) => { const { [id]: _gone, ...rest } = map; return rest; });
    setExpandedId((open) => (open === id ? null : open));
    setServiceQty((map) => { const { [id]: _gone, ...rest } = map; return rest; });
  };
  /** Would these minutes more go past the limit on two services together? */
  const tooLong = (more: number) => {
    if (cart.length < 2 || cart.reduce((sum, x) => sum + visitPart(x).duration, 0) + more <= MAX_VISIT_MINUTES) return false;
    toast({ title: "Two services can be booked together for up to 2½ hours. Remove something to add this." });
    return true;
  };
  /** − 1 + on an add-on: taking the last one off removes it. */
  const setAddonQty = (serviceId: number, addon: AddonData, quantity: number) => {
    const others = (cartAddons[serviceId] ?? []).filter((id) => id !== addon.id);
    const now = (cartAddons[serviceId] ?? []).length - others.length;
    if (quantity > now && tooLong(Number(addon.duration) || 0)) return;
    setCartAddons((map) => ({ ...map, [serviceId]: [...others, ...Array(Math.max(0, quantity)).fill(addon.id)] }));
  };
  /** − 1 + on a service: taking the last one off removes it. */
  const setServiceQuantity = (svc: ServiceEntry, quantity: number) => {
    if (quantity < 1) { removeService(svc.id); return; }
    if (quantity > qtyOf(svc) && tooLong(svc.duration ?? 60)) return;
    setServiceQty((map) => ({ ...map, [svc.id]: quantity }));
  };
  /** Open this service's add-ons and close the other's; the card that was tapped stays in view as that one closes. */
  const expandService = (id: number) => {
    const moved = expandedId != null && expandedId !== id;
    setExpandedId(id);
    if (moved) requestAnimationFrame(() => document.getElementById(`service-${id}`)?.scrollIntoView({ block: "start" }));
  };
  /** Not chosen: choose it. Chosen with its add-ons closed: open them. Otherwise: remove it. */
  const tapService = (svc: ServiceEntry) => {
    if (bookingOff) return;
    if (!cart.some((x) => x.id === svc.id)) {
      const clash = cart.find((x) => (x.offeredAt === "place" && svc.offeredAt === "client") || (x.offeredAt === "client" && svc.offeredAt === "place"));
      if (clash) { toast({ title: `${clash.name} and ${svc.name} can't be done on the same visit. Please book them separately.` }); return; }
      if (canAddService(cart.map(visitPart), { id: svc.id, duration: svc.duration ?? 60 })) { setCart([...cart, svc]); expandService(svc.id); }
    } else if (expandedId === svc.id || addonsFor(svc.id).length === 0) removeService(svc.id);
    else expandService(svc.id);
  };
  const toggleAddon = (serviceId: number, addon: AddonData) => {
    const on = (cartAddons[serviceId] ?? []).includes(addon.id);
    if (!on && tooLong(Number(addon.duration) || 0)) return;
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
  // Google's reviews are named as Google's, with Google's own count and average (owner, 2026-11-05).
  const isGoogleSourced = reviews.length > 0 && reviews.every((r) => r.source === "google");
  const reviewCount    = isGoogleSourced ? (store.googleReviews?.count || reviews.length) : store.displayReviewCount ?? store.googleReviewCount ?? reviews.length;
  // Certxa Pro accounts have Certxa's own reviews only, never Google (owner, 2026-10-30). The stored rating can be empty
  // for them, so it falls back to the reviews themselves.
  const ratedReviews   = reviews.filter((r) => Number(r.rating) > 0);
  const avgRating      = isGoogleSourced && store.googleReviews?.rating ? store.googleReviews.rating
                        : typeof store.displayRating === "number" && store.displayRating > 0 ? store.displayRating
                        : ratedReviews.length ? ratedReviews.reduce((sum, r) => sum + Number(r.rating), 0) / ratedReviews.length : 0;
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

  // Fetch services. Busy (429): the menu says so and tries again when the server allows, never an empty menu.
  const [servicesBusy, setServicesBusy] = useState<"waiting" | "failed" | null>(null);
  const [servicesTry, setServicesTry] = useState(0);
  useEffect(() => {
    if (!slug) return;
    let live = true;
    setServicesLoading(true);
    setServicesBusy(null);
    getPublicJson<any>(`/api/public/store/${slug}/services`, { onWait: () => { if (live) setServicesBusy("waiting"); }, isLive: () => live })
      .then((d) => {
        if (!live) return;
        setServicesBusy(null);
        if (Array.isArray(d?.addons)) setAddons(d.addons);
        if (Array.isArray(d?.serviceGroupAddons)) setServiceAddons(d.serviceGroupAddons);
        if (d?.services) setServices(d.services);
        const incoming = Array.isArray(d?.categories) ? d.categories : [];
        // Defensive: only keep categories that belong to this store
        const filtered = incoming.filter((c: any) => Number(c.storeId) === Number(store.id));
        setServiceCategories(filtered);
      })
      .catch((err) => { if (live && err instanceof BusyError) setServicesBusy("failed"); })
      .finally(() => { if (live) setServicesLoading(false); });
    return () => { live = false; };
  }, [slug, servicesTry]);

  // The website's service category pages (api-server lib/soloCategoryPages.ts): links under the service list.
  const [servicePages, setServicePages] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => {
    if (!slug) return;
    getPublicJson<any>(`/api/public/store/${slug}/service-pages`)
      .then((d) => setServicePages(Array.isArray(d) ? d : []))
      .catch(() => setServicePages([]));
  }, [slug]);

  // Fetch the team
  useEffect(() => {
    if (!slug) return;
    getPublicJson<any>(`/api/public/store/${slug}/team`)
      .then((d) => setTeam(Array.isArray(d) ? d : []))
      .catch(() => setTeam([]));
  }, [slug]);

  // Fetch reviews
  useEffect(() => {
    if (!slug) return;
    getPublicJson<any>(`/api/public/store/${slug}/reviews`)
      .then((d) => setReviews(Array.isArray(d) ? d : []))
      .catch(() => setReviews([]));
  }, [slug]);

  // Fetch gallery (optional — gracefully skipped if endpoint doesn't exist)
  useEffect(() => {
    if (!slug) return;
    getPublicJson<any>(`/api/public/store/${slug}/gallery`)
      .then((d) => setGallery(Array.isArray(d) ? d : []))
      .catch(() => setGallery([]));
  }, [slug]);

  // Fetch backend AI-matched service reviews (one best review per service, keyed by service ID)
  useEffect(() => {
    if (!slug) return;
    getPublicJson<unknown>(`/api/public/store/${slug}/service-reviews`)
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
    if (!svc || bookingOff) return;
    setCart([svc]);
    setCartAddons({});
    setServiceQty({});
    setExpandedId(svc.id);
    if (addonsFor(svc.id).length === 0) { setBookingOpen(true); return; }
    setActiveCategory("All");
    pickTab("services");
    requestAnimationFrame(() => document.getElementById(`service-${svc.id}`)?.scrollIntoView({ block: "center" }));
  };
  const finishedBooking = useRef(false);
  /** Only with both a place of their own and house calls does a service need to say where it's done. */
  const whereLabel = (svc: ServiceEntry) => {
    const own = (store as any).ownPlace;
    if (!(store as any).houseCalls || !own || own === "none") return null;
    return svc.offeredAt === "place" ? `${own === "home" ? "Home studio" : "In the salon"} only` : svc.offeredAt === "client" ? "House calls only" : null;
  };

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
    // Nowhere to do it: a studio-only service with no studio, a house-call-only one with no house calls.
    const offered = services.filter((service) => !(service.offeredAt === "place" && (store as any).ownPlace === "none")
      && !(service.offeredAt === "client" && !(store as any).houseCalls));
    const visible = activeCategory === "All"
      ? offered
      : offered.filter((service) => categoryName(service) === activeCategory);
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
      {/* Chat with the pro, while they're available for live chat (SiteChat.tsx); above the booking bar when it shows.
          Hidden on Solo for now (owner, 2026-11-07): put the line below back to show it again.
      <SiteChat store={store} slug={slug} raised={barShown} /> */}
      {/* ── BOOKING PANEL ─────────────────────────────────────────────────── */}
      <BookingPanel
        isOpen={bookingOpen}
        onClose={() => {
          setBookingOpen(false);
          if (finishedBooking.current) { finishedBooking.current = false; setCart([]); setCartAddons({}); setServiceQty({}); }
        }}
        store={store}
        slug={slug}
        chosen={cart.map(inVisit)}
        chosenAddons={chosenAddons}
        onBooked={() => { finishedBooking.current = true; }}
        preselectedStaffId={preselectedStaffId}
        timezone={store.timezone || "UTC"}
        team={team}
        staffChoice={staffChoice}
        onStaffChoice={setStaffChoice}
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
            {!bookingOff && (<>
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
            </>)}
            {bookingOff && store.phone && (
              <a
                href={phoneHref}
                data-testid="solo-header-call"
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm lg:hidden"
                style={{ background: C.gold700 }}
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                Call
              </a>
            )}
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
                  { label: "Contact", href: "#message" },
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
          {/* Contact, right after Portfolio (owner, 2026-11-07): opens the message page (SiteMessage.tsx), not a tab. */}
          <button
            type="button"
            onClick={() => { window.location.hash = "message"; }}
            data-testid="solo-tab-contact"
            className="flex-1 px-3 py-3.5 text-sm font-semibold transition-colors sm:text-base"
            style={{ color: C.ink600, borderBottom: "2px solid transparent", marginBottom: -1 }}
          >
            Contact
          </button>
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
            {!bookingOff && (
              <p className="mt-1 text-[14px]" style={{ color: C.ink600 }}>
                Pick up to two services, then choose your time.
              </p>
            )}
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
        {servicesBusy === "failed" ? (
          <div className="py-12 text-center" role="status" data-testid="solo-services-busy">
            <p className="text-[15px] font-semibold" style={{ color: C.ink800 }}>We couldn't load the services just now.</p>
            <p className="mt-1 text-[14px]" style={{ color: C.ink600 }}>Lots of people are looking at the moment. Please try again in a minute.</p>
            <button type="button" onClick={() => setServicesTry((n) => n + 1)} className="mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ background: C.gold700 }} data-testid="solo-services-retry">
              Try again
            </button>
          </div>
        ) : servicesLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.gold700 }} />
            {servicesBusy === "waiting" && (
              <p className="text-center text-[14px]" style={{ color: C.ink600 }} role="status" data-testid="solo-services-waiting">Lots of people are looking right now. Loading the services again in a moment…</p>
            )}
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
                    disabled={bookingOff}
                    aria-pressed={on}
                    aria-expanded={offers.length > 0}
                    aria-label={`${on ? (open || addonsFor(svc.id).length === 0 ? "Remove" : "Show add-ons for") : "Select"} ${svc.name}`}
                    data-testid={`solo-select-${svc.id}`}
                    className="flex w-full items-start gap-3 p-3.5 text-left"
                  >
                    {photo && <img src={photo} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold leading-snug" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}>{svc.name}</span>
                      <span className="mt-0.5 block text-[14px] font-bold" style={{ color: C.ink800 }}>{fromPrice(svc) ? "from " : ""}{formatPrice(priced ? proPrice(svc, team, staffChoice) : svc.price)}</span>
                      {whereLabel(svc) && <span className="mt-0.5 block text-[12px] font-semibold" style={{ color: C.ink600 }} data-testid={`solo-where-${svc.id}`}>{whereLabel(svc)}</span>}
                      {svc.description && <span className={`mt-1 block text-[13px] leading-snug ${open ? "" : "line-clamp-2"}`} style={{ color: C.ink600 }}>{svc.description}</span>}
                      {on && !open && chosen.length > 0 && <span className="mt-1 block text-[13px] font-semibold leading-snug" style={{ color: C.ink800 }}>+ {chosenFor(svc.id).map((a) => a.name).join(", ")}</span>}
                    </span>
                    {!bookingOff && <CheckDot on={on} />}
                  </button>
                  {on && svc.allowQuantity && (
                    <div className="flex items-center justify-between px-3.5 pb-3.5">
                      <span className="text-[14px] font-bold" style={{ color: C.ink800 }}>{formatPrice(shownPrice(svc))}</span>
                      <QtyStepper value={qtyOf(svc)} max={svc.maxQuantity ?? 10} name={svc.name} onChange={(n) => setServiceQuantity(svc, n)} />
                    </div>
                  )}
                  {offers.length > 0 && (
                    <div data-testid={`solo-addons-${svc.id}`}>
                      {/* The question stands out: a solid band in the business's colour, edge to edge. */}
                      <p className="px-3.5 py-3 text-center text-[16px] font-bold leading-snug text-white" style={{ background: C.gold700 }}>Would you like to add to your<span className="block">{svc.name}?</span></p>
                      <div className="divide-y divide-gray-100">
                        {offers.map((addon) => {
                          const count = chosen.filter((id) => id === addon.id).length;
                          const added = count > 0;
                          return (
                            <div key={addon.id} style={{ background: added ? TINT : "#fff" }}>
                              <button
                                type="button"
                                onClick={() => toggleAddon(svc.id, addon)}
                                aria-pressed={added}
                                aria-label={`${added ? "Remove" : "Add"} ${addon.name}`}
                                data-testid={`solo-addon-${addon.id}`}
                                className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[14px] font-semibold leading-snug" style={{ color: C.ink900 }}>{addon.name}</span>
                                  {addon.description && <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: C.ink600 }}>{addon.description}</span>}
                                </span>
                                <span className="shrink-0 text-[14px] font-bold" style={{ color: C.ink800 }}>{Number(addon.price) > 0 ? `+${formatPrice(Number(addon.price) * Math.max(1, count))}` : "Included"}</span>
                                <CheckDot on={added} small />
                              </button>
                              {added && addon.allowQuantity && (
                                <div className="flex justify-end px-3.5 pb-3">
                                  <QtyStepper value={count} max={addon.maxQuantity ?? 10} name={addon.name} onChange={(n) => setAddonQty(svc.id, addon, n)} />
                                </div>
                              )}
                            </div>
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

        {servicePages.length > 0 && (
          <nav aria-labelledby="solo-service-pages-heading" className="mt-10 border-t pt-7" style={{ borderColor: C.cream200 }} data-testid="solo-service-pages">
            <h3 id="solo-service-pages-heading" className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Explore by category</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {servicePages.map((page) => (
                <li key={page.url}>
                  <a href={page.url} className="inline-block rounded-lg border bg-white px-4 py-2 text-sm font-semibold" style={{ borderColor: C.cream300, color: C.ink700 }}>
                    {page.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
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
                  return look && !bookingOff ? (
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
              <div className="flex items-center justify-center gap-1" role="img" aria-label={`${Number(avgRating.toFixed(1))} stars from ${reviewCount} ${isGoogleSourced ? "Google " : ""}reviews`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className="h-5 w-5" aria-hidden="true" style={{ color: "#F59E0B", fill: n <= Math.round(avgRating) ? "#F59E0B" : "none" }} />
                ))}
                <span className="ml-1.5 text-sm" style={{ color: C.ink600 }}>({reviewCount.toLocaleString()} {isGoogleSourced ? "Google " : ""}{reviewCount === 1 ? "Review" : "Reviews"})</span>
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

          {teamShown && (
            <div className="mt-8 border-t pt-7" style={{ borderColor: C.cream200 }} data-testid="solo-team">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Our Team</h3>
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
                {team.map((m) => (
                  <div key={m.id} className="flex flex-col items-center text-center" data-testid={`solo-team-${m.id}`}>
                    {m.avatarUrl
                      ? <img src={m.avatarUrl} alt={m.name} loading="lazy" className="h-20 w-20 rounded-full object-cover" />
                      : <span className="grid h-20 w-20 place-items-center rounded-full text-2xl font-semibold" style={{ background: C.cream100, color: C.ink700 }} aria-hidden="true">{m.name.trim().charAt(0).toUpperCase()}</span>}
                    <p className="mt-2 text-[15px] font-semibold" style={{ color: C.ink900 }}>{m.name}</p>
                    {m.role && <p className="text-xs" style={{ color: C.ink500 }}>{m.role}</p>}
                    {m.bio && <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug" style={{ color: C.ink600 }}>{m.bio}</p>}
                    {!bookingOff && (
                      <button
                        type="button"
                        onClick={() => { setStaffChoice(m.id); bookNow(); }}
                        data-testid={`solo-book-with-${m.id}`}
                        className="mt-2.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
                        style={{ borderColor: C.gold700, color: C.gold700 }}
                      >
                        Book with {firstName(m.name)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
              <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>{isGoogleSourced ? "Reviews from Google" : <>Ratings &amp; Reviews</>}</h3>
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
                        <ReviewerAvatar name={who} photoUrl={r.reviewerPhotoUrl} />
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
                        {r.source === "google" && <span data-testid="solo-review-google">· Posted on Google</span>}
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
              <span className="block truncate text-sm font-semibold" style={{ color: C.ink900 }}>{cart.length === 0 ? "Choose a service" : `${cartFrom ? "from " : ""}${formatPrice(cartTotal)}`}</span>
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

      {/* ── VISIT US (copied from the Lacquer template, owner 2026-11-07) ──── */}
      <VisitUs store={store} phoneHref={phoneHref} phoneLabel={phoneLabel} hours={hours} />

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
                  { label: "Contact", href: "#message" },
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
                {!bookingOff && (
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
                )}
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

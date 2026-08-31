/**
 * render-salon-page.ts
 *
 * GlossGenius-style server-side HTML renderer for auto-mode salon websites.
 * Accepts tenant data + auto_settings and returns a complete HTML document.
 * Pure template literals — zero framework JS, sub-1s loads, perfect Core Web Vitals.
 */

import type { TenantData, BusinessData, HoursEntry, ServiceEntry, StaffEntry, ReviewEntry, GalleryPhotoEntry } from "./tenant-data";

export interface AutoSettings {
  brandColor?: string;
  tagline?: string;
  announcementBar?: string;
  googleVerification?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  yelpUrl?: string;
  showServices?: boolean;
  showStaff?: boolean;
  showHours?: boolean;
  showReviews?: boolean;
  showGallery?: boolean;
  showContact?: boolean;
}


const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt12(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

// Schema.org / Google require ISO 8601 24-hour time ("09:30"), not "9:30 AM".
// Normalizes either stored format so OpeningHoursSpecification always validates.
function to24h(time: string): string {
  const ampm = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2];
    const suffix = ampm[3].toUpperCase();
    if (suffix === "PM" && h !== 12) h += 12;
    if (suffix === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const iso = time.match(/^(\d{1,2}):(\d{2})/);
  if (iso) return `${iso[1].padStart(2, "0")}:${iso[2]}`;
  return time;
}

function formatPrice(price: string | number | null): string {
  if (price === null || price === undefined || price === "") return "";
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(n)) return String(price);
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

function hoursRow(entry: HoursEntry): string {
  return `
    <tr>
      <td class="hours-day">${esc(DAY_NAMES[entry.day_of_week])}</td>
      <td class="hours-time">${entry.is_closed ? '<span class="closed-badge">Closed</span>' : `${esc(fmt12(entry.open_time))} – ${esc(fmt12(entry.close_time))}`}</td>
    </tr>`;
}

function stars(rating: number): string {
  const full = Math.round(rating);
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="star${i < full ? " filled" : ""}">★</span>`
  ).join("");
}

function extractReviewMediaPhotoUrl(mediaItems: unknown): string | null {
  if (!Array.isArray(mediaItems)) return null;
  for (const raw of mediaItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const candidate = item.googleUrl ?? item.sourceUrl ?? item.url ?? item.thumbnailUrl;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function buildMetaDescription(business: BusinessData | null, services: ServiceEntry[]): string {
  const name = business?.name ?? "Salon";
  const city = business?.city ?? "";
  const top = services.slice(0, 3).map((s) => s.name).join(", ");
  const cityPart = city ? ` in ${city}` : "";
  const svcPart = top ? `. Specializing in ${top}.` : ".";
  return `${name}${cityPart} — book online 24/7${svcPart} View our services, team, and hours.`;
}

const CATEGORY_SCHEMA_TYPE: Record<string, string> = {
  nail_salon: "NailSalon",
  nails: "NailSalon",
  nail: "NailSalon",
  hair_salon: "HairSalon",
  hair: "HairSalon",
  salon: "HairSalon",
  barbershop: "Barber",
  barber: "Barber",
  spa: "DaySpa",
  day_spa: "DaySpa",
  massage: "MassageTherapist",
  beauty: "BeautySalon",
  beauty_salon: "BeautySalon",
  lash: "BeautySalon",
  brow: "BeautySalon",
  waxing: "BeautySalon",
};

function schemaType(category: string | null): string {
  if (!category) return "BeautySalon";
  const key = category.toLowerCase().replace(/\s+/g, "_");
  return CATEGORY_SCHEMA_TYPE[key] ?? "BeautySalon";
}

function toE164(phone: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  let candidate: string;
  if (digits.length === 10) candidate = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) candidate = `+${digits}`;
  else if (phone.startsWith("+") && /^\+[1-9]\d{1,14}$/.test(phone.replace(/\s/g, ""))) candidate = phone.replace(/\s/g, "");
  else return undefined;
  return /^\+[1-9]\d{1,14}$/.test(candidate) ? candidate : undefined;
}

function buildJsonLd(business: BusinessData | null, hours: HoursEntry[], canonicalUrl: string, socialUrls: { yelp?: string; facebook?: string }): string {
  if (!business) return "";

  const openingHoursSpec = hours
    .filter((h) => !h.is_closed)
    .map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_NAMES[h.day_of_week],
      opens: to24h(h.open_time),
      closes: to24h(h.close_time),
    }));

  const sameAs = [socialUrls.yelp, socialUrls.facebook].filter(Boolean);

  const latParsed = business.latitude != null ? parseFloat(business.latitude) : NaN;
  const lngParsed = business.longitude != null ? parseFloat(business.longitude) : NaN;
  const lat = Number.isFinite(latParsed) ? latParsed : null;
  const lng = Number.isFinite(lngParsed) ? lngParsed : null;

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType(business.category),
    name: business.name,
    url: canonicalUrl,
    telephone: toE164(business.phone),
    email: business.email ?? undefined,
    priceRange: "$",
    address: business.address ? {
      "@type": "PostalAddress",
      streetAddress: business.address,
      addressLocality: business.city ?? undefined,
      addressRegion: business.state ?? undefined,
      postalCode: business.postcode ?? undefined,
      addressCountry: "US",
    } : undefined,
    areaServed: business.city ? {
      "@type": "City",
      name: business.city,
    } : undefined,
    openingHoursSpecification: openingHoursSpec.length ? openingHoursSpec : undefined,
    geo: lat !== null && lng !== null ? {
      "@type": "GeoCoordinates",
      latitude: lat,
      longitude: lng,
    } : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };

  // Escape </script> sequences so tenant-controlled data can't break out of the script tag
  const safeJson = JSON.stringify(ld, null, 2).replace(/<\/script/gi, "<\\/script");
  return `<script type="application/ld+json">${safeJson}</script>`;
}

function buildBookingPanel(bookingSlug: string | null | undefined, appUrl: string): string {
  const slug = bookingSlug ?? "";
  if (!slug) return "";
  const bookingBase = appUrl.replace(/\/$/, "");
  const iframeSrc = `${bookingBase}/${slug}?embed=true`;
  return `
<div id="certxa-booking-panel" aria-hidden="true">
  <div id="certxa-booking-backdrop"></div>
  <div id="certxa-booking-drawer">
    <button id="certxa-booking-close" aria-label="Close booking panel">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <iframe id="certxa-booking-iframe" src="" data-src="${esc(iframeSrc)}" title="Book an appointment" allow="payment" loading="lazy"></iframe>
  </div>
</div>
<script>
(function(){
  var panel=document.getElementById('certxa-booking-panel');
  var drawer=document.getElementById('certxa-booking-drawer');
  var backdrop=document.getElementById('certxa-booking-backdrop');
  var closeBtn=document.getElementById('certxa-booking-close');
  var iframe=document.getElementById('certxa-booking-iframe');
  var opened=false;
  function open(){
    if(!opened){iframe.src=iframe.dataset.src;opened=true;}
    panel.classList.add('open');
    panel.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function close(){
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  }
  document.querySelectorAll('.book-now-btn').forEach(function(btn){btn.addEventListener('click',open);});
  backdrop.addEventListener('click',close);
  closeBtn.addEventListener('click',close);
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();
</script>`;
}

export function renderSalonPage(
  tenantData: TenantData,
  settings: AutoSettings,
  canonicalUrl: string,
  appUrl: string
): string {
  const { business, hours, services, staff, reviews, serviceReviews = {}, galleryPhotos = [] } = tenantData as TenantData & { galleryPhotos?: GalleryPhotoEntry[] };
  const brand = settings.brandColor ?? "#3B0764";
  const tagline = settings.tagline ?? (business?.city ? `${business.city}'s favorite salon` : "Book your next appointment online");
  const showServices = settings.showServices !== false;
  const showStaff = settings.showStaff !== false;
  const showHours = settings.showHours !== false;
  const showReviews = settings.showReviews !== false && reviews.length > 0;
  const showGallery = settings.showGallery !== false && galleryPhotos.length > 0;
  const showContact = settings.showContact !== false;
  const announcement = settings.announcementBar ?? "";
  // Social links: auto-derive from business profile; autoSettings overrides if explicitly set
  const ig = settings.instagramUrl ?? "";
  const fb = settings.facebookUrl
    ?? (business?.facebook_page_id ? `https://facebook.com/${encodeURIComponent(business.facebook_page_id)}` : "");
  const tt = settings.tiktokUrl ?? "";
  const yelp = settings.yelpUrl
    ?? (business?.yelp_alias ? `https://yelp.com/biz/${encodeURIComponent(business.yelp_alias)}` : "");
  const googleVerification = settings.googleVerification ?? "";

  // Amenities pulled from business profile
  const parking = Array.isArray(business?.parking_options) ? business.parking_options : [];
  const accessibility = Array.isArray(business?.accessibility_features) ? business.accessibility_features : [];

  const businessName = esc(business?.name ?? "Our Salon");
  const metaDesc = esc(buildMetaDescription(business, services));
  const city = esc(business?.city ?? "");
  const rawState = business?.state ?? "";
  const phone = esc(business?.phone ?? "");
  const email = esc(business?.email ?? "");
  const address = esc(business?.address ?? "");

  const topServices = services.slice(0, 3).map((s) => s.name).join(", ");
  const salonTypeLabel = business?.category
    ? business.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Salon";
  const pageTitle = business?.city
    ? `${businessName} | ${salonTypeLabel} in ${business.city}, ${rawState}`
    : `${businessName} | Book Online`;

  const highRatings = reviews.filter((r) => r.rating >= 4).slice(0, 5);

  const latNum = business?.latitude != null ? parseFloat(business.latitude) : NaN;
  const lngNum = business?.longitude != null ? parseFloat(business.longitude) : NaN;
  const hasGeo = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const lat = hasGeo ? String(latNum) : "";
  const lng = hasGeo ? String(lngNum) : "";
  const geoRegion = rawState ? `US-${rawState.toUpperCase()}` : "";

  const socialUrls = { yelp, facebook: fb };

  // Build keyword list from category + top services
  const keywords = ["salon", "book online", "beauty", salonTypeLabel.toLowerCase(), city]
    .concat(services.slice(0, 5).map((s) => s.name.toLowerCase()))
    .filter(Boolean)
    .join(", ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${metaDesc}">
  <meta name="keywords" content="${esc(keywords)}">
  <link rel="canonical" href="${esc(canonicalUrl)}">
  <link rel="alternate" hrefLang="en-US" href="${esc(canonicalUrl)}">
  <link rel="alternate" hrefLang="x-default" href="${esc(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${businessName}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${businessName}">
  <meta name="twitter:description" content="${metaDesc}">
  ${lat && lng ? `<meta name="geo.position" content="${esc(lat)};${esc(lng)}">` : ""}
  ${lat && lng ? `<meta name="ICBM" content="${esc(lat)}, ${esc(lng)}">` : ""}
  ${geoRegion ? `<meta name="geo.region" content="${esc(geoRegion)}">` : ""}
  ${city ? `<meta name="geo.placename" content="${city}">` : ""}
  ${googleVerification ? `<meta name="google-site-verification" content="${esc(googleVerification)}">` : ""}
  ${buildJsonLd(business, hours, canonicalUrl, socialUrls)}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --brand: ${esc(brand)};
      --brand-light: ${esc(brand)}18;
      --brand-mid: ${esc(brand)}40;
      --text: #1a1a2e;
      --muted: #6b7280;
      --border: #e5e7eb;
      --bg: #ffffff;
      --bg2: #f9fafb;
      --radius: 14px;
      --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      --serif: Georgia, 'Times New Roman', serif;
    }
    html { scroll-behavior: smooth; }
    body { font-family: var(--font); color: var(--text); background: var(--bg); line-height: 1.6; }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }

    /* ── Announcement bar ── */
    .announce-bar {
      background: var(--brand); color: #fff; text-align: center;
      padding: 10px 20px; font-size: 14px; font-weight: 500; letter-spacing: 0.01em;
    }

    /* ── Sticky nav ── */
    .nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(255,255,255,0.95); backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
      padding: 0 24px; height: 68px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
    }
    .nav-brand { font-size: 20px; font-weight: 800; color: var(--brand); letter-spacing: -0.02em; }
    .nav-links { display: flex; gap: 28px; }
    .nav-links a { font-size: 14px; font-weight: 500; color: var(--muted); transition: color .15s; }
    .nav-links a:hover { color: var(--text); }
    @media(max-width:640px){ .nav-links { display: none; } }
    .btn-primary {
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--brand); color: #fff; border: none; cursor: pointer;
      font-family: var(--font); font-size: 15px; font-weight: 600;
      padding: 12px 26px; border-radius: 50px; transition: opacity .15s, transform .1s;
      white-space: nowrap; line-height: 1;
    }
    .btn-primary:hover { opacity: .9; transform: translateY(-1px); }
    .btn-primary:active { opacity: 1; transform: none; }
    .btn-outline {
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; color: var(--brand);
      border: 2px solid var(--brand); cursor: pointer;
      font-family: var(--font); font-size: 15px; font-weight: 600;
      padding: 10px 26px; border-radius: 50px; transition: all .15s;
      white-space: nowrap; line-height: 1;
    }
    .btn-outline:hover { background: var(--brand-light); }

    /* ── Hero ── */
    .hero {
      min-height: 560px; display: flex; align-items: center;
      background: linear-gradient(135deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 70%, #000) 100%);
      padding: 80px 24px; text-align: center; position: relative; overflow: hidden;
    }
    .hero::before {
      content: ''; position: absolute; inset: 0;
      background: radial-gradient(ellipse at 60% 40%, rgba(255,255,255,.08) 0%, transparent 70%);
    }
    .hero-inner { max-width: 760px; margin: 0 auto; position: relative; }
    .hero h1 {
      font-family: var(--serif); font-size: clamp(2.4rem, 6vw, 4.2rem);
      font-weight: 700; color: #fff; line-height: 1.12; letter-spacing: -0.02em; margin-bottom: 20px;
    }
    .hero-tagline { font-size: clamp(1rem, 2.5vw, 1.25rem); color: rgba(255,255,255,.80); margin-bottom: 36px; max-width: 540px; margin-left: auto; margin-right: auto; }
    .hero-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .hero-btns .btn-primary { background: #fff; color: var(--brand); font-size: 16px; padding: 14px 32px; }
    .hero-btns .btn-primary:hover { opacity: .92; }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.25);
      border-radius: 50px; padding: 6px 16px; margin-bottom: 28px;
      font-size: 13px; color: rgba(255,255,255,.85); font-weight: 500;
    }
    .hero-badge .stars-inline { color: #fbbf24; letter-spacing: 1px; font-size: 12px; }

    /* ── Section shell ── */
    .section { padding: 80px 24px; }
    .section-alt { background: var(--bg2); }
    .container { max-width: 1060px; margin: 0 auto; }
    .section-label {
      font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      color: var(--brand); margin-bottom: 10px;
    }
    .section-title {
      font-family: var(--serif); font-size: clamp(1.6rem, 3.5vw, 2.4rem);
      font-weight: 700; color: var(--text); line-height: 1.2; margin-bottom: 12px;
    }
    .section-sub { font-size: 16px; color: var(--muted); max-width: 520px; margin-bottom: 48px; }

    /* ── Services ── */
    .services-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px;
    }
    .service-card {
      background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 22px 24px; display: flex; flex-direction: column; gap: 8px;
      transition: box-shadow .15s, border-color .15s;
    }
    .service-card-image-wrap {
      margin: -22px -24px 10px;
      border-radius: calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0 0;
      overflow: hidden;
      aspect-ratio: 4 / 3;
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
    }
    .service-card-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .service-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.06); border-color: var(--brand-mid); }
    .service-name { font-size: 16px; font-weight: 600; color: var(--text); }
    .service-desc { font-size: 13px; color: var(--muted); line-height: 1.5; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .service-meta { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
    .service-price { font-size: 18px; font-weight: 700; color: var(--brand); }
    .service-duration { font-size: 13px; color: var(--muted); }
    .service-book { margin-top: auto; padding-top: 12px; }
    /* ── Service review snippet ── */
    .svc-review {
      margin-top: 10px; padding: 10px 12px;
      background: var(--brand-light); border-radius: 10px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .svc-review-header { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .svc-review-photo {
      width: 36px; height: 36px; border-radius: 8px; object-fit: cover;
      flex-shrink: 0; border: 1px solid rgba(0,0,0,0.08);
    }
    .svc-review-meta { display: flex; flex-direction: column; gap: 2px; }
    .svc-review-stars { display: flex; gap: 2px; }
    .svc-review-star { font-size: 11px; color: #d1d5db; }
    .svc-review-star.filled { color: #f59e0b; }
    .svc-review-author { font-size: 11px; font-weight: 600; color: var(--muted); }
    .svc-review-quote { font-size: 12px; color: var(--text); line-height: 1.5; font-style: italic; }

    /* ── Staff ── */
    .staff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; }
    .staff-card { text-align: center; }
    .staff-avatar {
      width: 100px; height: 100px; border-radius: 50%; margin: 0 auto 16px;
      object-fit: cover; background: var(--brand-light);
      display: flex; align-items: center; justify-content: center;
      font-size: 32px; font-weight: 700; color: var(--brand);
      border: 3px solid var(--bg); box-shadow: 0 0 0 2px var(--brand-mid);
    }
    .staff-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
    .staff-name { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
    .staff-role { font-size: 13px; color: var(--brand); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
    .staff-bio { font-size: 14px; color: var(--muted); line-height: 1.5; }

    /* ── Hours ── */
    .hours-table { width: 100%; max-width: 480px; border-collapse: collapse; }
    .hours-table tr { border-bottom: 1px solid var(--border); }
    .hours-table tr:last-child { border-bottom: none; }
    .hours-day { padding: 12px 0; font-weight: 600; font-size: 15px; width: 48%; }
    .hours-time { padding: 12px 0; font-size: 15px; color: var(--muted); }
    .closed-badge { background: #fee2e2; color: #b91c1c; border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 600; }

    /* ── Gallery ── */
    .gallery-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;
    }
    .gallery-item {
      position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden;
      background: var(--brand-light); cursor: default;
    }
    .gallery-item img {
      width: 100%; height: 100%; object-fit: cover;
      transition: transform .35s cubic-bezier(.4,0,.2,1);
    }
    .gallery-item:hover img { transform: scale(1.05); }
    .gallery-caption {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 100%);
      color: #fff; padding: 24px 12px 10px;
      font-size: 12px; font-weight: 500;
      opacity: 0; transition: opacity .2s;
    }
    .gallery-item:hover .gallery-caption { opacity: 1; }
    @media(max-width:640px){ .gallery-grid { grid-template-columns: repeat(2, 1fr); } }

    /* ── Reviews ── */
    .reviews-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
    .review-card {
      background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 24px; display: flex; flex-direction: column; gap: 12px;
    }
    .review-stars { display: flex; gap: 2px; }
    .star { font-size: 16px; color: #d1d5db; }
    .star.filled { color: #f59e0b; }
    .review-text { font-size: 15px; color: var(--text); line-height: 1.6; font-style: italic; flex: 1; }
    .review-author { font-size: 13px; font-weight: 600; color: var(--muted); margin-top: auto; }

    /* ── Contact ── */
    .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
    @media(max-width: 640px) { .contact-grid { grid-template-columns: 1fr; gap: 32px; } }
    .contact-info { display: flex; flex-direction: column; gap: 16px; }
    .contact-row { display: flex; gap: 14px; align-items: flex-start; }
    .contact-icon { width: 38px; height: 38px; border-radius: 10px; background: var(--brand-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .contact-icon svg { color: var(--brand); }
    .contact-label { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
    .contact-value { font-size: 15px; font-weight: 500; }
    .contact-form { display: flex; flex-direction: column; gap: 14px; }
    .contact-form input, .contact-form textarea {
      width: 100%; padding: 12px 16px; border: 1px solid var(--border);
      border-radius: 10px; font-family: var(--font); font-size: 15px;
      background: var(--bg2); color: var(--text); outline: none;
      transition: border-color .15s;
    }
    .contact-form input:focus, .contact-form textarea:focus { border-color: var(--brand); }
    .contact-form textarea { min-height: 110px; resize: vertical; }
    .contact-form .btn-primary { width: 100%; }

    /* ── Footer ── */
    .footer {
      background: var(--text); color: rgba(255,255,255,.65);
      padding: 48px 24px 32px; text-align: center;
    }
    .footer-name { font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 16px; letter-spacing: -0.01em; }
    .footer-links { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px; }
    .footer-links a { font-size: 14px; color: rgba(255,255,255,.55); transition: color .15s; }
    .footer-links a:hover { color: #fff; }
    .footer-social { display: flex; gap: 16px; justify-content: center; margin-bottom: 24px; }
    .footer-social a { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.1); display: flex; align-items: center; justify-content: center; transition: background .15s; }
    .footer-social a:hover { background: rgba(255,255,255,.2); }
    .footer-copy { font-size: 13px; color: rgba(255,255,255,.35); }

    /* ── Salon Status Bar ── */
    .salon-status-bar {
      background: #fafaf9; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
      padding: 10px 24px; display: none; flex-wrap: wrap; align-items: center; gap: 10px;
      justify-content: center;
    }
    .salon-status-bar.ssb-visible { display: flex; }
    .ssb-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 14px; border-radius: 50px; border: 1px solid;
      font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
    }
    .ssb-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .ssb-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 50px;
      background: #fff; border: 1px solid var(--border);
      font-size: 11px; color: var(--muted);
    }
    .ssb-badge strong { color: var(--text); font-weight: 600; }
    @keyframes ssb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
    .ssb-pulse { animation: ssb-pulse 2s ease-in-out infinite; }

    /* ── Booking panel ── */
    #certxa-booking-panel { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
    #certxa-booking-panel.open { pointer-events: all; }
    #certxa-booking-backdrop {
      position: absolute; inset: 0; background: rgba(0,0,0,.5);
      opacity: 0; transition: opacity .3s;
    }
    #certxa-booking-panel.open #certxa-booking-backdrop { opacity: 1; }
    #certxa-booking-drawer {
      position: absolute; right: 0; top: 0; bottom: 0;
      width: min(480px, 100vw); background: #fff;
      transform: translateX(100%); transition: transform .35s cubic-bezier(.4,0,.2,1);
      display: flex; flex-direction: column;
    }
    @media(max-width: 640px) {
      #certxa-booking-drawer { right: 0; left: 0; top: auto; width: 100%; height: 92vh; transform: translateY(100%); }
      #certxa-booking-panel.open #certxa-booking-drawer { transform: translateY(0); }
    }
    #certxa-booking-panel.open #certxa-booking-drawer { transform: translateX(0); }
    #certxa-booking-close {
      position: absolute; top: 14px; right: 14px; z-index: 10;
      background: rgba(0,0,0,.06); border: none; cursor: pointer;
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s; color: var(--text);
    }
    #certxa-booking-close:hover { background: rgba(0,0,0,.12); }
    #certxa-booking-iframe { flex: 1; border: none; width: 100%; height: 100%; }
  </style>
</head>
<body>

${announcement ? `<div class="announce-bar">${esc(announcement)}</div>` : ""}

<!-- Nav -->
<nav class="nav">
  <span class="nav-brand">${businessName}</span>
  <div class="nav-links">
    ${showServices ? '<a href="#services">Services</a>' : ""}
    ${showStaff ? '<a href="#team">Team</a>' : ""}
    ${showGallery ? '<a href="#gallery">Gallery</a>' : ""}
    ${showHours ? '<a href="#hours">Hours</a>' : ""}
    ${showContact ? '<a href="#contact">Contact</a>' : ""}
  </div>
  ${business?.booking_slug ? '<button class="btn-primary book-now-btn">Book Now</button>' : ""}
</nav>

<!-- Hero -->
<section class="hero">
  <div class="hero-inner">
    ${highRatings.length > 0 ? `
    <div class="hero-badge">
      <span class="stars-inline">★★★★★</span>
      <span>${highRatings.length}+ 5-star reviews</span>
    </div>` : ""}
    <h1>${businessName}</h1>
    <p class="hero-tagline">${esc(tagline)}</p>
    <div class="hero-btns">
      ${business?.booking_slug ? '<button class="btn-primary book-now-btn">Book Appointment</button>' : ""}
      ${showServices ? '<a href="#services" class="btn-outline" style="color:#fff;border-color:rgba(255,255,255,.5);">See Services</a>' : ""}
    </div>
  </div>
</section>

<!-- Salon Status Bar — populated in real-time by JS below -->
<div id="salon-status-bar" class="salon-status-bar"></div>

${showServices && services.length > 0 ? `
<!-- Services -->
<section class="section" id="services">
  <div class="container">
    <p class="section-label">What We Offer</p>
    <h2 class="section-title">Our Services</h2>
    <p class="section-sub">Professional services tailored just for you.</p>
    <div class="services-grid">
      ${(() => {
        return services.map((s) => {
        const serviceImageUrl = typeof (s as any)?.image_url === "string" && (s as any).image_url.trim()
          ? (s as any).image_url.trim()
          : (typeof (s as any)?.imageUrl === "string" && (s as any).imageUrl.trim()
            ? (s as any).imageUrl.trim()
            : null);
        const serviceCardFallbackImage = "https://images.pexels.com/photos/3997383/pexels-photo-3997383.jpeg?auto=compress&cs=tinysrgb&w=800";
        const aiMatch = (serviceReviews as Record<string | number, { customerName?: string | null; rating: number; comment: string; photoUrl?: string | null; reviewMediaItems?: Array<Record<string, unknown>> }>)[s.id]
          ?? (serviceReviews as Record<string | number, { customerName?: string | null; rating: number; comment: string; photoUrl?: string | null; reviewMediaItems?: Array<Record<string, unknown>> }>)[String(s.id)];
        const reviewMediaUrl = extractReviewMediaPhotoUrl(aiMatch?.reviewMediaItems ?? null);
        const cardImageUrl = reviewMediaUrl || serviceImageUrl || serviceCardFallbackImage;
        const cardImageAlt = reviewMediaUrl
          ? `Google review photo for ${s.name}`
          : `${s.name} at ${business?.name ?? "our salon"}`;
        const hasCustomerResult = Boolean(
          aiMatch?.photoUrl ||
          aiMatch?.reviewMediaItems?.some((item) => typeof item?.thumbnailUrl === "string" && item.thumbnailUrl),
        );
        // Do not display text, avatars, or a customer-result block for a
        // featured review that has no actual customer-result media.
        const svcReview = hasCustomerResult ? aiMatch : null;
        const reviewSnippet = svcReview?.comment ? (() => {
          const stars = Array.from({ length: 5 }, (_, i) =>
            `<span class="svc-review-star${i < svcReview.rating ? ' filled' : ''}">★</span>`
          ).join('');
          const quote = svcReview.comment.length > 100
            ? svcReview.comment.slice(0, 100).replace(/\s+\S*$/, '') + '…'
            : svcReview.comment;
          const photoHtml = svcReview.photoUrl
            ? `<img class="svc-review-photo" src="${esc(svcReview.photoUrl)}" alt="Review photo" loading="lazy" />`
            : "";
          return `
          <div class="svc-review">
            <div class="svc-review-header">
              ${photoHtml}
              <div class="svc-review-meta">
                <div class="svc-review-stars">${stars}</div>
                ${svcReview.customerName ? `<span class="svc-review-author">${esc(svcReview.customerName)}</span>` : ""}
              </div>
            </div>
            <p class="svc-review-quote">"${esc(quote)}"</p>
          </div>`;
        })() : "";
        return `
      <div class="service-card">
        <div class="service-card-image-wrap">
          <img class="service-card-image" src="${esc(cardImageUrl)}" alt="${esc(cardImageAlt)}" loading="lazy" />
        </div>
        <div class="service-name">${esc(s.name)}</div>
        ${s.description ? `<p class="service-desc">${esc(s.description)}</p>` : ""}
        <div class="service-meta">
          ${s.price ? `<span class="service-price">${esc(formatPrice(s.price))}</span>` : ""}
          ${s.duration ? `<span class="service-duration">${s.duration} min</span>` : ""}
        </div>
        ${reviewSnippet}
        ${business?.booking_slug ? `<div class="service-book"><button class="btn-primary book-now-btn" style="font-size:13px;padding:8px 18px;">Book</button></div>` : ""}
      </div>`;
        }).join("") // close services.map
      })()}
    </div>
  </div>
</section>` : ""}

${showStaff && staff.length > 0 ? `
<!-- Team -->
<section class="section section-alt" id="team">
  <div class="container">
    <p class="section-label">Meet the Team</p>
    <h2 class="section-title">Your Stylists</h2>
    <p class="section-sub">Experienced professionals dedicated to making you look and feel your best.</p>
    <div class="staff-grid">
      ${staff.map((m) => {
        const initials = (m.name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
        return `
      <div class="staff-card">
        <div class="staff-avatar">
          ${m.avatar_url ? `<img src="${esc(m.avatar_url)}" alt="${esc(m.name ?? "")}" loading="lazy">` : initials}
        </div>
        <div class="staff-name">${esc(m.name ?? "")}</div>
        ${m.role ? `<div class="staff-role">${esc(m.role)}</div>` : ""}
        ${m.bio ? `<p class="staff-bio">${esc(m.bio)}</p>` : ""}
      </div>`;
      }).join("")}
    </div>
  </div>
</section>` : ""}

${showHours && hours.length > 0 ? `
<!-- Hours -->
<section class="section" id="hours">
  <div class="container">
    <p class="section-label">When We're Open</p>
    <h2 class="section-title">Business Hours</h2>
    <table class="hours-table" aria-label="Business hours">
      <tbody>
        ${hours.map(hoursRow).join("")}
      </tbody>
    </table>
  </div>
</section>` : ""}

${showGallery && galleryPhotos.length > 0 ? `
<!-- Gallery -->
<section class="section section-alt" id="gallery">
  <div class="container">
    <p class="section-label">Our Work</p>
    <h2 class="section-title">Photo Gallery</h2>
    <p class="section-sub">A glimpse of the work we do every day.</p>
    <div class="gallery-grid">
      ${galleryPhotos.map((p) => `
      <div class="gallery-item">
        <img src="${esc(p.image_url)}" alt="${esc(p.caption ?? "Salon photo")}" loading="lazy">
        ${p.caption ? `<div class="gallery-caption">${esc(p.caption)}</div>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>` : ""}

${showReviews && highRatings.length > 0 ? `
<!-- Reviews -->
<section class="section section-alt" id="reviews">
  <div class="container">
    <p class="section-label">Happy Clients</p>
    <h2 class="section-title">What They Say</h2>
    <div class="reviews-grid">
      ${highRatings.map((r) => `
      <div class="review-card">
        <div class="review-stars">${stars(r.rating)}</div>
        ${r.comment ? `<p class="review-text">"${esc(r.comment)}"</p>` : ""}
        ${r.customer_name ? `<div class="review-author">— ${esc(r.customer_name)}</div>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>` : ""}

${showContact ? `
<!-- Contact -->
<section class="section" id="contact">
  <div class="container">
    <p class="section-label">Get in Touch</p>
    <h2 class="section-title">Find Us</h2>
    <div class="contact-grid">
      <div class="contact-info">
        ${address ? `
        <div class="contact-row">
          <div class="contact-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
          <div>
            <div class="contact-label">Address</div>
            <div class="contact-value"><a href="https://maps.google.com/?q=${encodeURIComponent(address)}" target="_blank" rel="noopener">${address}</a></div>
          </div>
        </div>` : ""}
        ${phone ? `
        <div class="contact-row">
          <div class="contact-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.1 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/></svg></div>
          <div>
            <div class="contact-label">Phone</div>
            <div class="contact-value"><a href="tel:${esc(phone)}">${phone}</a></div>
          </div>
        </div>` : ""}
        ${email ? `
        <div class="contact-row">
          <div class="contact-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div>
          <div>
            <div class="contact-label">Email</div>
            <div class="contact-value"><a href="mailto:${esc(email)}">${email}</a></div>
          </div>
        </div>` : ""}
        ${parking.length > 0 ? `
        <div class="contact-row">
          <div class="contact-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M9 17V7h4a3 3 0 010 6H9"/></svg></div>
          <div>
            <div class="contact-label">Parking</div>
            <div class="contact-value">${parking.map(p => esc(p)).join(", ")}</div>
          </div>
        </div>` : ""}
        ${accessibility.length > 0 ? `
        <div class="contact-row">
          <div class="contact-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3"/><path d="M9 20l-3-6h12l-3 6"/><line x1="12" y1="10" x2="12" y2="14"/></svg></div>
          <div>
            <div class="contact-label">Accessibility</div>
            <div class="contact-value">${accessibility.map(a => esc(a)).join(", ")}</div>
          </div>
        </div>` : ""}
        ${business?.booking_slug ? `
        <div style="margin-top:8px;">
          <button class="btn-primary book-now-btn">Book an Appointment</button>
        </div>` : ""}
      </div>
      <form class="contact-form" onsubmit="return false;">
        <input type="text" placeholder="Your name" name="name" autocomplete="name">
        <input type="email" placeholder="Email address" name="email" autocomplete="email">
        <textarea placeholder="Your message…" name="message"></textarea>
        <button type="submit" class="btn-primary" onclick="this.textContent='Message sent!';this.disabled=true;">Send Message</button>
      </form>
    </div>
  </div>
</section>` : ""}

<!-- Footer -->
<footer class="footer">
  <div class="footer-name">${businessName}</div>
  ${ig || fb || tt || yelp ? `
  <div class="footer-social">
    ${ig ? `<a href="${esc(ig)}" target="_blank" rel="noopener" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>` : ""}
    ${fb ? `<a href="${esc(fb)}" target="_blank" rel="noopener" aria-label="Facebook"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg></a>` : ""}
    ${tt ? `<a href="${esc(tt)}" target="_blank" rel="noopener" aria-label="TikTok"><svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,.7)"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.95a8.16 8.16 0 004.79 1.54V7.04a4.85 4.85 0 01-1.02-.35z"/></svg></a>` : ""}
    ${yelp ? `<a href="${esc(yelp)}" target="_blank" rel="noopener" aria-label="Yelp"><svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,.7)"><path d="M20.16 12.59l-4.83-1.1a.87.87 0 00-.89.42.85.85 0 00.07.97l3.06 3.85a.87.87 0 00.69.33.91.91 0 00.54-.18 6.9 6.9 0 001.83-2.87.87.87 0 00-.47-.97v-.45zM8.93 15.76L5.7 17.3a.87.87 0 00-.43 1.08 7 7 0 001.56 2.5.87.87 0 00.62.27.9.9 0 00.35-.07l4.64-1.78a.87.87 0 00.48-1.13.86.86 0 00-.92-.55l-.07-.01-2.07-.47-.02-.02.09-.36zm7.7-8.35a.87.87 0 00-1.02.66l-1.09 4.83a.86.86 0 00.47.97.88.88 0 00.97-.07l3.84-3.07a.87.87 0 00.15-1.21 6.86 6.86 0 00-2.87-1.82.9.9 0 00-.45-.29zM9.8 9.2l-.03.01L5.17 7.44a.87.87 0 00-1.07.48 6.93 6.93 0 00-.42 3.34.87.87 0 00.89.77h.09l4.96-.54a.87.87 0 00.76-.9.86.86 0 00-.58-.82V9.2zM12 2a1.48 1.48 0 00-1.47 1.34L9.85 8.7a.87.87 0 00.58.93.88.88 0 001.04-.45l2.42-4.47A1.48 1.48 0 0012 2z"/></svg></a>` : ""}
  </div>` : ""}
  <div class="footer-links">
    ${showServices ? '<a href="#services">Services</a>' : ""}
    ${showStaff ? '<a href="#team">Team</a>' : ""}
    ${showGallery ? '<a href="#gallery">Gallery</a>' : ""}
    ${showHours ? '<a href="#hours">Hours</a>' : ""}
    ${showContact ? '<a href="#contact">Contact</a>' : ""}
    ${business?.booking_slug ? `<button class="book-now-btn" style="background:none;border:none;cursor:pointer;font-size:14px;color:rgba(255,255,255,.55);font-family:inherit;padding:0;transition:color .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.55)'">Book Online</button>` : ""}
  </div>
  <p class="footer-copy">&copy; ${new Date().getFullYear()} ${businessName}. All rights reserved.</p>
</footer>

${buildBookingPanel(business?.booking_slug, appUrl)}

<script>
(function(){
  var slug='${esc(tenantData.website.slug)}';
  var bar=document.getElementById('salon-status-bar');
  if(!bar||!slug)return;
  function render(d){
    if(!d)return;
    var C={
      accepting_walkins:{dot:'#34d399',bg:'#ecfdf5',color:'#065f46',border:'#a7f3d0',label:'Accepting Walk-ins'},
      appointment_recommended:{dot:'#fbbf24',bg:'#fffbeb',color:'#92400e',border:'#fde68a',label:'Book an Appointment'},
      closed:{dot:'#9ca3af',bg:'#f9fafb',color:'#6b7280',border:'#e5e7eb',label:'Currently Closed'}
    };
    var c=C[d.status]||C.closed;
    var html='<span class="ssb-pill ssb-pulse" style="background:'+c.bg+';color:'+c.color+';border-color:'+c.border+'">'
      +'<span class="ssb-dot ssb-pulse" style="background:'+c.dot+'"></span>'+c.label+'</span>';
    if(d.isOpen&&d.staffWorking>0){
      html+='<span class="ssb-badge"><strong>'+d.staffWorking+'</strong> staff working today</span>';
      if(d.staffAvailable>0){
        html+='<span class="ssb-badge" style="background:#ecfdf5;border-color:#a7f3d0;color:#065f46">'
          +'<span class="ssb-dot" style="background:#34d399;margin-right:2px"></span>'+d.staffAvailable+' available now</span>';
      }else{
        html+='<span class="ssb-badge" style="background:#fffbeb;border-color:#fde68a;color:#92400e">'
          +'<span class="ssb-dot" style="background:#fbbf24;margin-right:2px"></span>All staff currently busy</span>';
      }
    }
    if(d.isOpen&&d.upcomingCount>0){
      html+='<span class="ssb-badge"><strong>'+d.upcomingCount+'</strong> upcoming booking'+(d.upcomingCount!==1?'s':'')+' in next 2 hrs</span>';
    }
    bar.innerHTML=html;
    bar.classList.add('ssb-visible');
  }
  function load(){
    fetch('/api/tenant/'+slug+'/status')
      .then(function(r){return r.ok?r.json():null;})
      .then(render).catch(function(){});
  }
  load();
  setInterval(load,60000);
})();
</script>

</body>
</html>`;
}

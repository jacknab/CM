import { craftFor, craftTitle, placesSentence, soloKeywords } from "./proCraft";
import type { BusinessData, HoursEntry, TenantData } from "./tenant-data";

export interface TenantSeoOverrides {
  title?: string | null;
  description?: string | null;
  keywords?: string | null;
  googleVerification?: string | null;
}

export interface TenantSeoMeta extends TenantSeoOverrides {
  canonical: string;
  ogImage?: string | null;
  jsonLd?: Record<string, unknown> | null;
  geoPosition?: string | null;
  geoRegion?: string | null;
  geoPlacename?: string | null;
  robots?: string | null;
  preloadImage?: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CATEGORY_LABELS: Record<string, string> = {
  nail_salon: "Nail Salon",
  nails: "Nail Salon",
  nail: "Nail Salon",
  hair_salon: "Hair Salon",
  hair: "Hair Salon",
  salon: "Salon",
  barbershop: "Barbershop",
  barber: "Barbershop",
  spa: "Day Spa",
  day_spa: "Day Spa",
  massage: "Massage Therapist",
  beauty: "Beauty Salon",
  beauty_salon: "Beauty Salon",
  lash: "Lash Studio",
  brow: "Brow Studio",
  waxing: "Waxing Salon",
};

const CATEGORY_SCHEMA_TYPES: Record<string, string> = {
  nail_salon: "NailSalon",
  nails: "NailSalon",
  nail: "NailSalon",
  hair_salon: "HairSalon",
  hair: "HairSalon",
  salon: "BeautySalon",
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

function categoryKey(category: string | null | undefined): string {
  return (category ?? "").toLowerCase().trim().replace(/\s+/g, "_");
}

function categoryLabel(category: string | null | undefined): string {
  const key = categoryKey(category);
  return CATEGORY_LABELS[key] ?? (category
    ? category.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    : "Salon");
}

function schemaType(category: string | null | undefined): string {
  return CATEGORY_SCHEMA_TYPES[categoryKey(category)] ?? "BeautySalon";
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

/** "(720) 243-6886" for a US number; anything else as it was typed. */
export function displayPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return phone?.trim() || null;
}

function trimText(value: string, max: number): string {
  if (value.length <= max) return value;
  const shortened = value.slice(0, max - 1).replace(/\s+\S*$/, "").trim();
  return `${shortened}…`;
}

export function toE164(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const compact = phone.replace(/\s/g, "");
  if (/^\+[1-9]\d{1,14}$/.test(compact)) return compact;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}

function buildAddress(business: BusinessData): Record<string, unknown> | undefined {
  if (!business.address && !business.city && !business.state && !business.postcode) return undefined;
  return {
    "@type": "PostalAddress",
    ...(business.address ? { streetAddress: business.address } : {}),
    ...(business.city ? { addressLocality: business.city } : {}),
    ...(business.state ? { addressRegion: business.state } : {}),
    ...(business.postcode ? { postalCode: business.postcode } : {}),
    addressCountry: "US",
  };
}

/**
 * Business-level LocalBusiness-subtype JSON-LD, shared by the homepage and
 * every auto-mode subpage so structured data is consistent across the site.
 *
 * `includeReviews` attaches the actual visible reviews as `review` entries —
 * only pass true from the page that genuinely renders those reviews (the
 * /reviews/ page), per Google's guideline that review markup must correspond
 * to review content that's actually visible on the page.
 */
export function buildBusinessJsonLd(
  data: TenantData,
  canonical: string,
  image?: string | null,
  options: { includeReviews?: boolean } = {},
): Record<string, unknown> | null {
  const business = data.business;
  if (!business) return null;

  const hours = data.hours
    .filter((entry) => !entry.is_closed && entry.open_time && entry.close_time)
    .map((entry: HoursEntry) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_NAMES[entry.day_of_week] ?? undefined,
      opens: to24h(entry.open_time),
      closes: to24h(entry.close_time),
    }));

  const reviews = data.reviews.filter((review) => Number.isFinite(Number(review.rating)));
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length
    : 0;
  const latitude = business.latitude == null ? NaN : Number(business.latitude);
  const longitude = business.longitude == null ? NaN : Number(business.longitude);
  const sameAs = [
    business.facebook_page_id ? `https://facebook.com/${encodeURIComponent(business.facebook_page_id)}` : null,
    business.yelp_alias ? `https://yelp.com/biz/${encodeURIComponent(business.yelp_alias)}` : null,
  ].filter((url): url is string => Boolean(url));

  return {
    "@context": "https://schema.org",
    "@type": data.solo ? "HealthAndBeautyBusiness" : schemaType(business.category),
    "@id": `${canonical.replace(/\/$/, "")}#business`,
    name: business.name,
    ...(data.solo?.byLabel ? { alternateName: data.solo.byLabel } : {}),
    url: canonical,
    ...(image ? { image } : {}),
    ...(toE164(business.phone) ? { telephone: toE164(business.phone) } : {}),
    ...(business.email ? { email: business.email } : {}),
    ...(buildAddress(business) ? { address: buildAddress(business) } : {}),
    ...(business.city ? { areaServed: { "@type": "City", name: business.city } } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { geo: { "@type": "GeoCoordinates", latitude, longitude } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(reviews.length
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(averageRating.toFixed(1)),
            reviewCount: reviews.length,
          },
        }
      : {}),
    ...(options.includeReviews && reviews.length
      ? {
          review: reviews.slice(0, 20).map((r) => ({
            "@type": "Review",
            reviewRating: { "@type": "Rating", ratingValue: Number(r.rating) },
            ...(r.customer_name ? { author: { "@type": "Person", name: r.customer_name } } : {}),
            ...(r.comment ? { reviewBody: r.comment } : {}),
          })),
        }
      : {}),
    ...(data.services.length
      ? {
          makesOffer: data.services.slice(0, 24).map((service) => {
            const priceNum = typeof service.price === "string" ? parseFloat(service.price) : service.price;
            const hasPrice = typeof priceNum === "number" && Number.isFinite(priceNum);
            return {
              "@type": "Offer",
              ...(hasPrice ? { price: priceNum, priceCurrency: "USD" } : {}),
              itemOffered: {
                "@type": "Service",
                name: service.name,
                ...(service.description ? { description: service.description } : {}),
              },
            };
          }),
        }
      : {}),
  };
}

/** Breadcrumb JSON-LD for a real subpage (Home > Services > Gel-X, etc). */
export function buildBreadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> | null {
  if (items.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Single-service JSON-LD for a real /services/{slug} detail page. Only real, present fields are included. */
export function buildServiceJsonLd(
  service: { name: string; description: string | null; price: string | number; duration: number },
  business: BusinessData,
  serviceUrl: string,
): Record<string, unknown> {
  const priceNum = typeof service.price === "string" ? parseFloat(service.price) : service.price;
  const hasPrice = typeof priceNum === "number" && Number.isFinite(priceNum);
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    url: serviceUrl,
    ...(service.description ? { description: service.description } : {}),
    provider: {
      "@type": schemaType(business.category),
      name: business.name,
    },
    ...(hasPrice
      ? {
          offers: {
            "@type": "Offer",
            price: priceNum,
            priceCurrency: "USD",
            url: serviceUrl,
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };
}

export function buildTenantSeo(
  data: TenantData,
  canonical: string,
  overrides: TenantSeoOverrides = {},
  options: { noindex?: boolean } = {},
): TenantSeoMeta {
  const business = data.business;
  const name = business?.name || data.website.name || "Salon";
  // A Solo-plan pro isn't a salon: "Nails", "Buzzcuts", "Haircuts" (lib/proCraft.ts).
  const craft = data.solo ? craftFor(business?.category) : null;
  const type = craft ? craftTitle(craft) : categoryLabel(business?.category);
  const city = business?.city || "";
  const location = [city, business?.state].filter(Boolean).join(", ");
  const topServices = data.services.slice(0, 3).map((service) => service.name).filter(Boolean);
  const serviceList = topServices.length > 1 ? `${topServices.slice(0, -1).join(", ")}, and ${topServices[topServices.length - 1]}` : topServices[0] ?? "";
  const phone = displayPhone(business?.phone);

  // The salon's name first, as in "Nail Saints | Nail Salon in Lakewood, CO" (owner, 2026-11-02).
  // A Solo pro's label first, as in "Nails by Toby in Denver, CO" (owner, 2026-11-04).
  const byLabel = data.solo?.byLabel ?? null;
  const fallbackTitle = trimText(
    byLabel ? `${byLabel}${location ? ` in ${location}` : ""}` : location ? `${name} | ${type} in ${location}` : `${name} | ${type}`,
    60,
  );
  // "Toby's offers Gel Manicure, Pedicure, and Acrylic Fill in Denver, CO. Book online or call (720) 243-6886."
  // (Used to read "… Book Basic Manicure, Spa Manicure, Deluxe Manicure. online, view services …".)
  const soloPlaces = data.solo ? placesSentence(data.solo) : "";
  const fallbackDescription = trimText(
    craft
      // "Toby’s nails in Denver, CO: Basic Manicure, …. Home studio and house calls. Book online or call …"
      ? `${byLabel ?? (/['’]s$/i.test(name.trim()) ? `${name} ${craft.work}` : `${name} — ${craft.work}`)}${location ? ` in ${location}` : ""}${serviceList ? `: ${serviceList}` : ""}.${soloPlaces ? ` ${soloPlaces}` : ""} Book online${phone ? ` or call ${phone}` : ""}.`
      : `${serviceList ? `${name} offers ${serviceList}` : `${name} is a ${type.toLowerCase()}`}${location ? ` in ${location}` : ""}. Book online${phone ? ` or call ${phone}` : ""}.`,
    160,
  );
  const fallbackKeywords = (craft && data.solo
    ? [...(byLabel ? [byLabel] : []), ...soloKeywords(craft, city || null, data.solo), "book online", ...data.services.slice(0, 8).map((service) => service.name.toLowerCase())]
    : [
      type.toLowerCase(),
      city,
      "book online",
      ...data.services.slice(0, 8).map((service) => service.name.toLowerCase()),
    ]).filter(Boolean).join(", ");
  const ogImage = data.galleryPhotos.find((photo) => photo.image_url)?.image_url ?? null;
  const latitude = business?.latitude == null ? NaN : Number(business.latitude);
  const longitude = business?.longitude == null ? NaN : Number(business.longitude);

  return {
    title: overrides.title?.trim() || fallbackTitle,
    description: overrides.description?.trim() || fallbackDescription,
    keywords: overrides.keywords?.trim() || fallbackKeywords,
    googleVerification: overrides.googleVerification?.trim() || undefined,
    canonical,
    ogImage,
    jsonLd: buildBusinessJsonLd(data, canonical, ogImage),
    geoPosition: Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude};${longitude}` : null,
    geoRegion: business?.state ? `US-${business.state.toUpperCase()}` : null,
    geoPlacename: business?.city || null,
    robots: options.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
    preloadImage: ogImage,
  };
}
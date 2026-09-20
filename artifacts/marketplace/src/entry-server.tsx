import { renderToString } from 'react-dom/server';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import type { SsrContext } from 'wouter';

import App from './App';
import {
  setApiBaseUrl,
  getFeaturedSalons, getGetFeaturedSalonsQueryKey,
  getSalonBySlug, getGetSalonBySlugQueryKey,
  getStateListing, getStateListingQueryKey,
  getCityListing, getCityListingQueryKey,
  getGeoCityQueryKey,
  listDeals, getListDealsQueryKey,
  getDeal, getGetDealQueryKey,
  type SalonProfile, type GeoCity, type MarketplaceDealDetail,
} from '@/lib/api';
import { STATE_NAMES, toSlug } from '@/lib/states';

export interface RenderResult {
  html: string;
  headTags: string;
  statusCode: number;
  redirectTo?: string;
  dehydratedState: unknown;
}

const SITE_NAME = 'Certxa';

// getSalonBySlug() rejects with a plain Error("API 404: <json body>") on a
// 404 — when the API found a cleaned-up-slug redirect (see
// scripts/regenerate-promo-slugs.ts), that JSON body carries a `redirectTo`
// field. Parsed from the error message rather than a richer return type so
// the success path (every other caller of getSalonBySlug) stays untouched.
function parseRedirectSlug(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  try {
    const body = JSON.parse(err.message.replace(/^API \d+:\s*/, ''));
    return typeof body?.redirectTo === 'string' ? body.redirectTo : null;
  } catch {
    return null;
  }
}

const pluralize = (count: number, singular: string, plural = `${singular}s`) => (count === 1 ? singular : plural);

/** "9:00 AM" -> "09:00" (24-hour, for schema.org openingHoursSpecification). Returns null if unparseable/closed. */
function to24Hour(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'AM' && h === 12) h = 0;
  else if (ampm === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${min}`;
}

// Derives a schema.org priceRange ("$".."$$$$") from a salon's own real,
// priced service list (the average price of what they actually charge) —
// never a flat constant, so it's always backed by real data.
function priceRangeFromServices(services: { price: number }[]): string | null {
  const prices = services.map((s) => s.price).filter((p) => p > 0);
  if (!prices.length) return null;
  const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  if (avg < 25) return '$';
  if (avg < 50) return '$$';
  if (avg < 100) return '$$$';
  return '$$$$';
}

// Fallback for the ~90%+ of the salon corpus with no real service/price data
// of our own: Google Places' price_level field, already collected into
// salon_google_places but previously never wired into priceRange. Handles
// the modern Places API's PRICE_LEVEL_* enum, the legacy 0-4 numeric scale,
// and an already-$-formatted value, in that order. Returns null (omit the
// property) rather than guess when the value is missing or unrecognized —
// consistent with priceRangeFromServices never asserting a flat constant.
function priceRangeFromPriceLevel(priceLevel: string | null | undefined): string | null {
  if (!priceLevel) return null;
  const v = priceLevel.trim().toUpperCase();
  const enumMap: Record<string, string> = {
    PRICE_LEVEL_FREE: '$',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
  };
  if (enumMap[v]) return enumMap[v];
  const numericMap: Record<string, string> = { '0': '$', '1': '$', '2': '$$', '3': '$$$', '4': '$$$$' };
  if (numericMap[v]) return numericMap[v];
  if (/^\${1,4}$/.test(priceLevel.trim())) return priceLevel.trim();
  return null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function baseHead(title: string, description: string, canonical: string, robots = 'index, follow'): string {
  return `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">`;
}

function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/**
 * Per-request server render. Prefetches real data (via the same plain fetch
 * functions the client hooks wrap) for the three SEO-critical page types —
 * home, listings, salon profile — and computes real <head> tags/JSON-LD from
 * that data synchronously, before renderToString ever runs. /search, /saved,
 * /for-business still render a real shell (via wouter's SSR path) without a
 * data prefetch — they're not pages that need to rank or be cited.
 */
export async function render(url: string, apiOrigin: string, publicOrigin: string, geo: GeoCity | null = null): Promise<RenderResult> {
  setApiBaseUrl(apiOrigin);
  const queryClient = new QueryClient();
  const [rawPathname, search = ''] = url.split('?');
  const pathname = rawPathname === '' ? '/' : rawPathname;
  const canonicalPath = pathname === '/' ? '/' : pathname;
  const canonical = `${publicOrigin}${canonicalPath}`;
  let headTags = '';
  let statusCode = 200;
  let redirectTo: string | undefined;

  try {
    if (pathname === '/') {
      queryClient.setQueryData(getGeoCityQueryKey(), geo);
      const featuredParams = geo ? { citySlug: geo.citySlug, stateSlug: geo.stateSlug } : {};
      const featured = await getFeaturedSalons(featuredParams);
      queryClient.setQueryData(getGetFeaturedSalonsQueryKey(featuredParams), featured);
      headTags = baseHead(
        `Nail salon deals near you — ${SITE_NAME}`,
        geo
          ? `Limited-time nail care deals and independent nail salons in ${geo.city}, ${geo.state}, curated by Certxa.`
          : 'Shop limited-time nail care deals and discover independent nail salons near you, curated by Certxa.',
        canonical,
      );
      headTags += jsonLdScript([
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          // Same @id + sameAs set as php/includes/header.php's Organization
          // node — the two halves of the site used to declare two
          // non-overlapping sameAs arrays with no shared @id, which meant
          // AI entity resolution saw two different "Certxa" organizations.
          // Reddit is deliberately omitted: the linked account has no
          // independently-verifiable activity.
          '@id': `${publicOrigin}/#organization`,
          name: SITE_NAME,
          url: publicOrigin,
          description: 'Certxa is a considered local guide to independent salons, studios, and beauty people worth knowing.',
          logo: {
            '@type': 'ImageObject',
            url: `${publicOrigin}/assets/images/logo.png`,
            width: 512,
            height: 512,
          },
          foundingDate: '2026-02-01',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '2325 E Camelback Rd, Ste 400',
            addressLocality: 'Phoenix',
            addressRegion: 'AZ',
            postalCode: '85016',
            addressCountry: 'US',
          },
          sameAs: [
            'https://x.com/certxa',
            'https://www.facebook.com/certxa',
            'https://www.instagram.com/certxa',
            'https://www.bbb.org/us/az/phoenix/profile/software-consultants/certxa-llc-1126-1000175065',
            'https://www.linkedin.com/company/certxa',
            'https://www.g2.com/products/certxa-booking-software',
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          '@id': `${publicOrigin}/#website`,
          name: SITE_NAME,
          url: publicOrigin,
          publisher: { '@id': `${publicOrigin}/#organization` },
          potentialAction: {
            '@type': 'SearchAction',
            target: `${publicOrigin}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ]);
    } else if (pathname.startsWith('/listings/')) {
      const param = decodeURIComponent(pathname.slice('/listings/'.length));
      const sep = param.lastIndexOf('--');
      if (sep === -1) {
        try {
          const state = await getStateListing(param);
          queryClient.setQueryData(getStateListingQueryKey(param), state);
          headTags = baseHead(
            `Nail salons in ${state.name} | ${SITE_NAME}`,
            `Find ${state.count.toLocaleString()} nail ${pluralize(state.count, 'salon')} across ${state.name}. Browse by city and get in touch.`,
            canonical,
          );
          headTags += jsonLdScript([
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${publicOrigin}/` },
                { '@type': 'ListItem', position: 2, name: state.name },
              ],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `Nail salons in ${state.name}`,
              url: canonical,
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: state.cities.length,
                itemListElement: state.cities.map((c, i) => ({
                  '@type': 'ListItem', position: i + 1, name: c.name,
                  url: `${publicOrigin}/listings/${c.slug}--${state.slug}`,
                })),
              },
            },
          ]);
        } catch {
          statusCode = 404;
          headTags = baseHead('State not found', 'That state could not be found.', canonical, 'noindex, follow');
        }
      } else {
        const citySlug = param.slice(0, sep);
        const stateSlug = param.slice(sep + 2);
        try {
          const city = await getCityListing(citySlug, stateSlug);
          queryClient.setQueryData(getCityListingQueryKey(citySlug, stateSlug), city);
          headTags = baseHead(
            `Nail salons in ${city.cityName}, ${city.stateName} | ${SITE_NAME}`,
            `${city.salons.length.toLocaleString()} nail ${pluralize(city.salons.length, 'salon')} in ${city.cityName}, ${city.stateName}.`,
            canonical,
          );
          headTags += jsonLdScript([
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${publicOrigin}/` },
                { '@type': 'ListItem', position: 2, name: city.stateName, item: `${publicOrigin}/listings/${city.stateSlug}` },
                { '@type': 'ListItem', position: 3, name: city.cityName },
              ],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `Nail salons in ${city.cityName}, ${city.stateName}`,
              url: canonical,
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: city.salons.length,
                itemListElement: city.salons.map((s, i) => ({
                  '@type': 'ListItem', position: i + 1, name: s.name,
                  url: `${publicOrigin}/${s.slug}`,
                })),
              },
            },
          ]);
        } catch {
          statusCode = 404;
          headTags = baseHead('City not found', 'That city could not be found.', canonical, 'noindex, follow');
        }
      }
    } else if (pathname === '/deals') {
      const deals = await listDeals({ limit: 48 });
      queryClient.setQueryData(getListDealsQueryKey({ limit: 48 }), deals);
      headTags = baseHead(
        `Deals | ${SITE_NAME}`,
        'Limited-time deals from independent salons near you. Real offers from real businesses, no fine print surprises.',
        canonical,
      );
      if (deals.length) {
        headTags += jsonLdScript([{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Deals — ${SITE_NAME}`,
          numberOfItems: deals.length,
          itemListElement: deals.map((d, i) => ({
            '@type': 'ListItem', position: i + 1, name: d.title,
            url: `${publicOrigin}/deals/${d.id}`,
          })),
        }]);
      }
    } else if (pathname.startsWith('/deals/')) {
      const id = pathname.slice('/deals/'.length);
      try {
        const deal: MarketplaceDealDetail = await getDeal(id);
        queryClient.setQueryData(getGetDealQueryKey(id), deal);
        headTags = baseHead(
          `${deal.title} — ${deal.salon.name} | ${SITE_NAME}`,
          deal.description || `${deal.title} at ${deal.salon.name}.`,
          canonical,
        );
        headTags += jsonLdScript([
          {
            '@context': 'https://schema.org',
            '@type': 'Offer',
            name: deal.title,
            description: deal.description || undefined,
            price: deal.dealPrice,
            priceCurrency: 'USD',
            availability: deal.availability === 'active'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/SoldOut',
            url: canonical,
            // A LocalBusiness (BeautySalon) requires an address to validate —
            // name alone isn't enough. Real data only: address/phone are
            // omitted individually when the store hasn't set them, and the
            // whole address block is left out if there's nothing real to put
            // in it, rather than asserting an incomplete PostalAddress.
            seller: {
              '@type': 'BeautySalon',
              name: deal.salon.name,
              ...(deal.salon.address || deal.salon.city || deal.salon.state
                ? { address: {
                    '@type': 'PostalAddress',
                    ...(deal.salon.address ? { streetAddress: deal.salon.address } : {}),
                    ...(deal.salon.city ? { addressLocality: deal.salon.city } : {}),
                    ...(deal.salon.state ? { addressRegion: deal.salon.state } : {}),
                    addressCountry: 'US',
                  } }
                : {}),
              ...(deal.salon.phone ? { telephone: deal.salon.phone } : {}),
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${publicOrigin}/` },
              { '@type': 'ListItem', position: 2, name: 'Deals', item: `${publicOrigin}/deals` },
              { '@type': 'ListItem', position: 3, name: deal.title },
            ],
          },
        ]);
      } catch {
        statusCode = 404;
        headTags = baseHead('Deal not found', 'That deal could not be found.', canonical, 'noindex, follow');
      }
    } else if (pathname === '/wallet') {
      // Personal, token-bearing page reached only via an emailed link —
      // real shell, no data prefetch, never indexed.
      headTags = baseHead('My vouchers | Certxa', 'View your purchased Certxa deal vouchers.', canonical, 'noindex, nofollow');
    } else if (pathname === '/saved') {
      // Personal shortlist backed by localStorage — a crawler always sees an
      // empty state here regardless of who's "visiting", same as /wallet.
      // Previously had no branch of its own, so it fell through to the
      // generic homepage-style fallback below, duplicating that title/
      // description against other unhandled routes.
      headTags = baseHead('Saved salons | Certxa', 'Your saved list of independent salons and spas.', canonical, 'noindex, nofollow');
    } else if (pathname === '/search') {
      headTags = baseHead(
        'Find a salon | Certxa',
        'Search and browse independent nail salons, spas, and beauty studios near you — filter by service, category, and availability.',
        canonical,
      );
    } else if (pathname === '/for-business') {
      headTags = baseHead(
        'List your salon on Certxa | For Salon Owners',
        'Certxa puts independent salons in front of local clients who care where they book. Get a real public profile, local discovery, and better-fit bookings.',
        canonical,
      );
    } else if (pathname !== '/search' && pathname !== '/saved' && pathname !== '/for-business' && pathname !== '/') {
      // Flat /:slug — individual salon profile page.
      const slug = pathname.slice(1);
      try {
        const salon: SalonProfile = await getSalonBySlug(slug);
        queryClient.setQueryData(getGetSalonBySlugQueryKey(slug), salon);
        const ratingStr = salon.rating > 0 ? ` Rated ${salon.rating}/5 from ${salon.reviewCount} reviews.` : '';
        // Every real salon record is indexable now — sitemap and page-level
        // robots directives both cover the full dataset, not just listings
        // claimed by a paying Certxa customer (see GEO-AUDIT-REPORT.md).
        // Title uses city/state, not the full street address — the address
        // was pushing many titles past Semrush's/Google's ~60-char length
        // guidance (a real "title too long" finding on ~26 salon pages).
        // City/state is shorter, still real, and is the more useful local-
        // SEO signal in a title anyway; the full address stays in the
        // description and the PostalAddress schema below.
        const cityState = [salon.city, salon.state].filter(Boolean).join(', ');
        headTags = baseHead(
          cityState ? `${salon.name} | Nail Salon in ${cityState}` : `${salon.name} | Nail Salon`,
          `${salon.name} is a nail salon located at ${salon.address}.${ratingStr}`,
          canonical,
          'index, follow, max-image-preview:large, max-snippet:-1',
        );
        const stateName = STATE_NAMES[salon.state] || salon.state;
        const openingHours = (salon.hours || [])
          .map((h) => {
            const opens = to24Hour(h.open);
            const closes = to24Hour(h.close);
            if (!opens || !closes) return null;
            return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${h.day}`, opens, closes };
          })
          .filter((h): h is NonNullable<typeof h> => h !== null);
        const jsonLd: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'BeautySalon',
          name: salon.name,
          url: canonical,
          image: [salon.imageUrl, ...(salon.gallery || [])],
          // Prefer the real, unique AI-written paragraph over the generic
          // "Nail salon in {city}, {state}." fallback — `salon.description`
          // is never empty, so `description || about` previously always
          // picked the generic string even when a real one existed.
          description: salon.about || salon.description,
          ...(salon.phone ? { telephone: salon.phone } : {}),
          address: {
            '@type': 'PostalAddress',
            streetAddress: salon.address,
            addressLocality: salon.city,
            addressRegion: salon.state,
            addressCountry: 'US',
          },
          ...(salon.latitude != null && salon.longitude != null
            ? { geo: { '@type': 'GeoCoordinates', latitude: salon.latitude, longitude: salon.longitude } }
            : {}),
          ...(openingHours.length ? { openingHoursSpecification: openingHours } : {}),
          ...(salon.rating > 0 && salon.reviewCount > 0
            ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: salon.rating, reviewCount: salon.reviewCount } }
            : {}),
          ...(salon.services?.length
            ? { makesOffer: salon.services.map((s) => ({ '@type': 'Offer', name: s.name, price: s.price, priceCurrency: 'USD' })) }
            : {}),
          // Derived from the salon's own real, priced service list first
          // (never a flat asserted constant — that was flagged in an earlier
          // audit as unverifiable on unclaimed pages); Google Places'
          // price_level as a fallback for the many unclaimed listings with
          // no service menu of their own. Omitted entirely when neither
          // source has real data.
          ...(function () {
            const priceRange = (salon.services?.length ? priceRangeFromServices(salon.services) : null)
              ?? priceRangeFromPriceLevel(salon.priceLevel);
            return priceRange ? { priceRange } : {};
          })(),
        };
        // A handful of scraped listings have an incomplete address with no
        // state at all (e.g. just "street, city") — state/city breadcrumb
        // levels are skipped rather than emitted with an empty name and a
        // malformed /listings/ URL, since neither can be built into a real,
        // working link without a real state to slugify.
        const breadcrumbItems: Array<{ '@type': string; position: number; name: string; item?: string }> = [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${publicOrigin}/` },
        ];
        if (salon.state && stateName) {
          breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: stateName, item: `${publicOrigin}/listings/${toSlug(stateName)}` });
          if (salon.city) {
            breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: salon.city, item: `${publicOrigin}/listings/${toSlug(salon.city)}--${toSlug(stateName)}` });
          }
        }
        breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: salon.name });
        const breadcrumb = {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: breadcrumbItems,
        };
        headTags += jsonLdScript([jsonLd, breadcrumb]);
      } catch (err) {
        const redirectSlug = parseRedirectSlug(err);
        if (redirectSlug) {
          statusCode = 301;
          redirectTo = `/${redirectSlug}`;
        } else {
          statusCode = 404;
          headTags = baseHead('Salon not found', 'That salon could not be found.', canonical, 'noindex, follow');
        }
      }
    }
  } catch (err) {
    // Prefetch failure shouldn't take the whole page down — fall through to
    // a client-rendered shell for this request rather than a 500.
    console.error('[marketplace SSR] prefetch failed', err);
  }

  const ssrContext: SsrContext = {};
  const html = renderToString(
    <App
      queryClient={queryClient}
      ssrPath={pathname}
      ssrSearch={search ? `?${search}` : ''}
      ssrContext={ssrContext}
    />,
  );

  if (!headTags) {
    headTags = baseHead(
      `${SITE_NAME} — Independent beauty, found locally`,
      'Find and book independent salons and spas.',
      canonical,
    );
  }

  return {
    html,
    headTags,
    statusCode: ssrContext.statusCode ?? statusCode,
    redirectTo: ssrContext.redirectTo ?? redirectTo,
    dehydratedState: dehydrate(queryClient),
  };
}

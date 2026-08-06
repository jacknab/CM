import { Clock, ExternalLink, MapPin, Phone } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import { useReveal } from '@/hooks/useReveal';
import { buildDirectionsUrl } from '@/utils/contentHelpers';

export default function VisitUs() {
  const { salonName, address, city, phone, phoneHref, hours } = useSite();
  const { ref, visible } = useReveal<HTMLDivElement>();

  const directionsUrl = buildDirectionsUrl(address, city);

  return (
    <section
      id="visit"
      aria-labelledby="visit-heading"
      itemScope
      itemType="https://schema.org/LocalBusiness"
      className="bg-white py-14 sm:py-20 lg:py-28"
    >
      <div className="container-prose">
        {/* Heading */}
        <div className="text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gold-700">
            Visit Us
          </p>
          <h2
            id="visit-heading"
            itemProp="name"
            className="font-serif text-3xl font-semibold text-ink-900 sm:text-4xl"
          >
            Find {salonName}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-ink-600">
            Walk-ins welcome based on availability. Book ahead to guarantee your spot.
          </p>
        </div>

        <div
          ref={ref}
          className={`reveal ${visible ? 'is-visible' : ''} mt-10 grid gap-6 sm:mt-12 lg:grid-cols-2 lg:gap-8`}
        >
          {/* ── Info card ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-5 rounded-3xl border border-cream-200 bg-cream-50 p-6 sm:p-8">
            {/* Address */}
            {address && (
              <div className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-700">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-serif text-base font-semibold text-ink-900">Address</h3>
                  <address itemProp="address" itemScope itemType="https://schema.org/PostalAddress" className="mt-1 text-sm not-italic leading-relaxed text-ink-600">
                    {address}
                    {city && (
                      <>
                        <br />
                        <span itemProp="addressLocality">{city}</span>
                      </>
                    )}
                  </address>
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-gold-700 hover:text-gold-800"
                    aria-label="Get directions (opens in Google Maps)"
                  >
                    Get directions
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
            )}

            {/* Phone */}
            {phone && (
              <div className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-700">
                  <Phone className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-serif text-base font-semibold text-ink-900">Phone</h3>
                  <a
                    href={phoneHref}
                    className="mt-1 block text-sm text-ink-600 transition-colors hover:text-gold-700"
                  >
                    <span itemProp="telephone">{phone}</span>
                  </a>
                </div>
              </div>
            )}

            {/* Hours */}
            {hours.length > 0 && (
              <div className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-700">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <h3 className="font-serif text-base font-semibold text-ink-900">Opening Hours</h3>
                  <dl className="mt-2 divide-y divide-cream-200">
                    {hours.map((row) => (
                      <div key={row.day} className="flex justify-between py-1.5 text-sm">
                        <dt className="text-ink-600">{row.day}</dt>
                        <dd
                          className={
                            row.time === 'Closed'
                              ? 'font-medium text-ink-400'
                              : 'font-semibold text-ink-800'
                          }
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

          {/* ── Static map card (no iframe = no JS violations) ─────────── */}
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${salonName} in Google Maps`}
            className="group relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-cream-200 bg-cream-50 shadow-sm transition-colors hover:bg-cream-100 lg:min-h-0"
          >
            {/* Grid pattern background */}
            <svg
              className="absolute inset-0 h-full w-full opacity-[0.07]"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#4A4540" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#map-grid)" />
            </svg>

            {/* Pin */}
            <div className="relative z-10 flex flex-col items-center gap-4 px-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-700 shadow-lg shadow-gold-700/30 transition-transform duration-200 group-hover:scale-110">
                <MapPin className="h-8 w-8 text-white" aria-hidden="true" />
              </span>
              {address && (
                <p className="text-sm font-medium text-ink-700">
                  {address}{city ? `, ${city}` : ''}
                </p>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gold-700 shadow-sm ring-1 ring-cream-200 transition-colors group-hover:bg-gold-700 group-hover:text-white">
                Open in Google Maps
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

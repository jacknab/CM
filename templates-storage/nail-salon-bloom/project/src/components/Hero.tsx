import { MapPin, Phone, Star } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import { buildDirectionsUrl } from '@/utils/contentHelpers';

const HERO_IMAGE =
  'https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=1600';

export default function Hero() {
  const { salonName, reviewCount, avgRating, phone, phoneHref, address, city, bookingUrl } = useSite();

  const directionsUrl = buildDirectionsUrl(address, city);
  const filledStars = Math.round(avgRating);

  return (
    <section
      id="top"
      aria-label="Welcome"
      className="relative overflow-hidden pt-16 sm:pt-20"
    >
      {/* Full-bleed background image with gradient overlay */}
      <div className="absolute inset-0 -z-10">
        <img
          src={HERO_IMAGE}
          alt={`A professional nail technician performing a luxury manicure at ${salonName}`}
          className="h-full w-full object-cover"
          {...{ fetchpriority: 'high' }}
          width={1600}
          height={1000}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-cream-50/95 via-cream-50/80 to-cream-50/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-cream-50 via-transparent to-transparent" />
      </div>

      {/* Subtle gold top accent */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gold-700" aria-hidden="true" />

      <div className="container-prose grid min-h-[520px] items-center py-14 sm:min-h-[580px] sm:py-20 lg:min-h-[640px] lg:grid-cols-12 lg:py-28">
        <div className="lg:col-span-7 flex flex-col">
          {/* Rating pill */}
          {reviewCount > 0 && (
            <div
              className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-gold-200 bg-gold-50/80 px-3.5 py-1.5 backdrop-blur-sm"
              aria-label={`${avgRating} stars from ${reviewCount} reviews`}
            >
              <span className="flex gap-0.5" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`h-3.5 w-3.5 ${i < filledStars ? 'fill-gold-500 text-gold-500' : 'fill-cream-300 text-cream-300'}`}
                  />
                ))}
              </span>
              <span className="text-xs font-semibold text-gold-800">
                {avgRating} — {reviewCount.toLocaleString()} Google Reviews
              </span>
            </div>
          )}

          {/* Salon name */}
          <h1 className="font-serif text-[2.4rem] font-semibold leading-[1.05] text-ink-900 sm:text-5xl lg:text-7xl text-balance">
            {salonName}
            {city && (
              <span className="block mt-1 font-normal text-[1.6rem] sm:text-3xl lg:text-[2rem] text-ink-400 leading-snug">
                Nail Salon in {city.split(',')[0]}
              </span>
            )}
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-700 sm:mt-6 sm:text-lg">
            From flawless gel manicures to show-stopping custom nail art, our master technicians
            deliver a pampering experience you will not find anywhere else. Book your appointment
            in seconds — no account required.
          </p>

          {/* CTA row */}
          <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
            {phone && (
              <a
                href={phoneHref}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-300 bg-cream-50/80 px-7 py-3.5 text-base font-semibold text-ink-800 backdrop-blur-sm transition-all hover:border-gold-400 hover:text-gold-700 focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-2 sm:px-8 sm:py-4"
                aria-label={`Call ${phone}`}
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {phone}
              </a>
            )}
            {address && (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-300 bg-cream-50/80 px-7 py-3.5 text-base font-semibold text-ink-800 backdrop-blur-sm transition-all hover:border-gold-400 hover:text-gold-700 focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-2 sm:px-8 sm:py-4"
                aria-label="Get directions"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Directions
              </a>
            )}
          </div>

          {/* Quick stats */}
          <dl className="mt-8 grid max-w-lg grid-cols-3 gap-3 border-t border-ink-300/40 pt-5 sm:mt-12 sm:gap-6 sm:pt-8">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-widest text-gold-700">
                Same-Day
              </dt>
              <dd className="mt-1 font-serif text-xl font-semibold text-ink-900 sm:text-2xl">
                Booking
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-widest text-gold-700">
                Reviews
              </dt>
              <dd className="mt-1 font-serif text-xl font-semibold text-ink-900 sm:text-2xl">
                {reviewCount > 0 ? `${reviewCount}+` : '★★★★★'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-widest text-gold-700">
                Rating
              </dt>
              <dd className="mt-1 font-serif text-xl font-semibold text-ink-900 sm:text-2xl">
                {avgRating > 0 ? `${Number(avgRating).toFixed(1)} / 5` : '5.0 / 5'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Wave separator */}
      <div className="overflow-hidden" aria-hidden="true">
        <svg viewBox="0 0 1440 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full text-cream-100">
          <path d="M0 0 Q360 28 720 14 Q1080 0 1440 20 L1440 28 L0 28 Z" fill="currentColor" />
        </svg>
      </div>
    </section>
  );
}

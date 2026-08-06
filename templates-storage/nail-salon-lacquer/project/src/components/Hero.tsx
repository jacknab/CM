import { Sparkles, Star, Clock } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

export default function Hero() {
  const { salonName, tagline, reviewCount, avgRating, services } = useSite();

  return (
    <section id="home" className="relative overflow-hidden pt-16 sm:pt-20">
      {/* Background image with overlay */}
      <div className="absolute inset-0 -z-10">
        <img
          src="https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=1600"
          alt={`A professional nail technician performing a luxury manicure at ${salonName}`}
          className="h-full w-full object-cover"
          {...{ fetchpriority: 'high' }}
          width={1600}
          height={1000}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-taupe-50/95 via-taupe-50/80 to-taupe-50/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-taupe-50 via-transparent to-transparent" />
      </div>

      <div className="container-prose grid min-h-[520px] items-center py-14 sm:min-h-[580px] sm:py-20 lg:min-h-[640px] lg:grid-cols-12 lg:py-28">
        <div className="lg:col-span-7">
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-100/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-700 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />
            {tagline}
          </span>

          <h1 className="mt-4 font-serif text-[2.5rem] font-medium leading-[1.05] text-taupe-900 sm:mt-6 sm:text-5xl lg:text-7xl text-balance">
            {salonName}
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-taupe-700 sm:mt-6 sm:text-lg">
            From flawless gel manicures to show-stopping custom nail art, our
            master technicians deliver a pampering experience you will not find
            anywhere else. Book your appointment in seconds — no account required.
          </p>

          {/* Rating badge */}
          {reviewCount > 0 && (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex">
                {[...Array(Math.round(avgRating))].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-accent text-accent" />
                ))}
              </div>
              <span className="text-sm font-medium text-taupe-700">
                {avgRating} / 5 from {reviewCount}+ happy clients
              </span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:gap-4">
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-full bg-rose-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-rose-600/20 transition-all hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-xl sm:px-8 sm:py-4"
            >
              Book Your Appointment
            </a>
            <a
              href="#services"
              className="inline-flex items-center justify-center rounded-full border border-taupe-300 bg-taupe-50/80 px-7 py-3.5 text-base font-semibold text-taupe-800 backdrop-blur-sm transition-all hover:border-rose-400 hover:text-rose-600 sm:px-8 sm:py-4"
            >
              View Services & Pricing
            </a>
          </div>

          {/* Quick facts */}
          <dl className="mt-8 grid max-w-lg grid-cols-3 gap-3 border-t border-taupe-300/60 pt-5 sm:mt-12 sm:gap-6 sm:pt-8">
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-rose-600">
                <Clock className="h-3.5 w-3.5" /> Same-Day
              </dt>
              <dd className="mt-1 font-serif text-xl font-semibold text-taupe-900 sm:text-2xl">
                Booking
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                Reviews
              </dt>
              <dd className="mt-1 font-serif text-xl font-semibold text-taupe-900 sm:text-2xl">
                {reviewCount > 0 ? `${reviewCount}+` : '★★★★★'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                Services
              </dt>
              <dd className="mt-1 font-serif text-xl font-semibold text-taupe-900 sm:text-2xl">
                {services.length > 0 ? `${services.length}+` : '20+'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

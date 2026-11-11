import { Star, Calendar, MapPin, Phone } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';

export default function Hero() {
  const site = useSite();
  const { nameFirst, nameRest, wording, cityLine, heroText, heroImage, reviewCount, avgRating, reviewsFromGoogle, street, phone, phoneHref, canBookOnline, isSample } = site;
  const city = cityLine.split(',')[0];
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt={wording.heroAlt(site.salonName || 'the salon')}
          className="w-full h-full object-cover"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-900/85 via-stone-900/60 to-stone-900/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 w-full">
        <div className="max-w-2xl">
          {reviewCount > 0 && (
            <div className="flex items-center gap-3 mb-6" data-testid="luxe-hero-rating">
              <div className="flex" aria-hidden="true">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={16} className={i < Math.round(avgRating) ? 'text-accent-400 fill-accent-400' : 'text-stone-500'} />
                ))}
              </div>
              <span className="text-stone-200 text-sm tracking-wide">
                Rated {avgRating.toFixed(1)} from {reviewCount.toLocaleString()} {reviewsFromGoogle ? 'Google ' : ''}{reviewCount === 1 ? 'review' : 'reviews'}
              </span>
            </div>
          )}

          {isSample ? (
            <h1 className="font-display text-5xl md:text-7xl font-bold text-white leading-[1.05] text-balance">
              Oakland's Premier
              <span className="block text-gradient-gold font-medium">Nail Bar</span>
              in Rockridge
            </h1>
          ) : (
            <h1 className="font-display text-5xl md:text-7xl font-bold text-white leading-[1.05] text-balance">
              {nameFirst}
              {nameRest && <span className="block text-gradient-gold font-medium">{nameRest}</span>}
              <span className="mt-3 block font-sans text-lg md:text-xl font-medium tracking-[0.2em] uppercase text-stone-300">
                {wording.label}{city ? ` · ${city}` : ''}
              </span>
            </h1>
          )}

          {heroText && (
            <p className="mt-6 text-lg md:text-xl text-stone-200 leading-relaxed max-w-xl">{heroText}</p>
          )}

          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            {(canBookOnline || phoneHref) && (
              <BookButton className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-full hover:bg-primary-700 transition-all duration-300 shadow-xl shadow-primary-900/40 hover:scale-105">
                {canBookOnline ? <Calendar size={20} /> : <Phone size={20} />}
                {canBookOnline ? 'Book Your Appointment' : `Call ${phone}`}
              </BookButton>
            )}
            <a
              href="#/services"
              className="inline-flex items-center justify-center px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-full border border-white/30 hover:bg-white/20 transition-all duration-300"
            >
              Explore Services
            </a>
          </div>

          {(street || phone) && (
            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 text-stone-300 text-sm">
              {street && (
                <span className="flex items-center gap-2">
                  <MapPin size={16} className="text-accent-400" />
                  {[street, city].filter(Boolean).join(', ')}
                </span>
              )}
              {street && phone && <span className="text-stone-500">•</span>}
              {phone && <a href={phoneHref} className="hover:text-white transition-colors">{phone}</a>}
            </div>
          )}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 hidden md:flex flex-col items-center gap-2 text-stone-400">
        <span className="text-xs tracking-widest uppercase">Scroll</span>
        <div className="w-px h-12 bg-gradient-to-b from-stone-400 to-transparent" />
      </div>
    </section>
  );
}

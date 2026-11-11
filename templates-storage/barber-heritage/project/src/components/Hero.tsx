import { ChevronDown } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';

export default function Hero() {
  const site = useSite();
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background image: the shop's own cover photo, else a barbershop photo */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        role="img"
        aria-label={site.wording.heroAlt(site.salonName)}
        style={{ backgroundImage: `url(${site.heroImage})` }}
      />
      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0f0d0b]/80 via-[#0f0d0b]/60 to-[#0f0d0b]" />

      {/* Decorative gold line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-transparent to-[#c9a96e]/60" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-24 text-center">
        {site.eyebrow && (
          <p className="text-[#c9a96e] text-xs tracking-[0.4em] uppercase mb-6 animate-fade-in">{site.eyebrow}</p>
        )}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-none tracking-tight mb-6">
          {site.isSample ? (
            <>
              <span className="block text-white">Where Tradition</span>
              <span className="block text-[#c9a96e]">Meets Trend</span>
            </>
          ) : (
            <>
              <span className="block text-white">{site.nameFirst}</span>
              {site.nameRest && <span className="block text-[#c9a96e]">{site.nameRest}</span>}
            </>
          )}
        </h1>
        {site.heroText && (
          <p className="text-white/60 text-lg md:text-xl max-w-xl mx-auto mb-12 leading-relaxed">{site.heroText}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <BookButton className="px-8 py-4 bg-[#c9a96e] text-[#0f0d0b] font-bold tracking-widest uppercase text-sm rounded hover:bg-[#e0bc82] transition-all duration-300 hover:shadow-lg hover:shadow-[#c9a96e]/30 hover:-translate-y-0.5">
            {site.canBookOnline || site.isSample ? 'Book an Appointment' : 'Call to Book'}
          </BookButton>
          {site.services.length > 0 && (
            <a
              href="#services"
              className="px-8 py-4 border border-white/30 text-white font-bold tracking-widest uppercase text-sm rounded hover:border-[#c9a96e] hover:text-[#c9a96e] transition-all duration-300 hover:-translate-y-0.5"
            >
              View Services
            </a>
          )}
        </div>
      </div>

      {/* Scroll indicator */}
      <a
        href={site.services.length > 0 ? '#services' : '#contact'}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/40 hover:text-[#c9a96e] transition-colors animate-bounce"
        aria-label="Scroll down"
      >
        <ChevronDown size={28} />
      </a>
    </section>
  );
}

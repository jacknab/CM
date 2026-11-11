import { ArrowRight, Sparkles, Image, HeartHandshake, Star, MapPin, type LucideIcon } from 'lucide-react';
import { pageHref, shownPages, type PageId } from '@/lib/router';
import { useSite } from '@/context/SiteContext';

export default function Explore() {
  const site = useSite();
  const { salonName, wording, reviewCount, reviewsFromGoogle, cityLine, canBookOnline } = site;
  const city = cityLine.split(',')[0];
  const text: Record<Exclude<PageId, 'home'>, { text: string; icon: LucideIcon; title?: string }> = {
    services: { text: `Every service on our menu${site.isUnclaimed ? '' : ', with prices and times'}.`, icon: Sparkles },
    gallery: { text: `A look at recent work from ${salonName || 'our studio'}.`, icon: Image },
    about: { text: `Who we are and what to expect at our ${wording.place}.`, icon: HeartHandshake },
    reviews: { text: reviewCount > 0 ? `What ${reviewCount.toLocaleString()} ${reviewsFromGoogle ? `Google reviewer${reviewCount === 1 ? '' : 's'}` : `client${reviewCount === 1 ? '' : 's'}`} ${reviewCount === 1 ? 'says' : 'say'} about their visits.` : 'What clients say about their visits.', icon: Star },
    visit: { text: `${canBookOnline ? 'Book a time, ' : ''}find us${city ? ` in ${city}` : ''}, and check our hours.`, icon: MapPin, title: canBookOnline ? 'Visit & Book' : 'Visit' },
  };
  const pages = shownPages({ photos: site.galleryPhotos.length > 0, reviews: site.reviews.length > 0 });

  return (
    <section className="py-24 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-accent-500 font-semibold text-sm tracking-widest uppercase">
            Explore
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold text-stone-900 text-balance">
            Discover {salonName}
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {pages.map((p) => {
            const d = text[p.id];
            return (
              <a
                key={p.id}
                href={pageHref(p.id)}
                className="group flex flex-col bg-stone-50 rounded-2xl p-8 border border-stone-100 hover:border-primary-200 hover:shadow-xl hover:shadow-stone-200/60 transition-all duration-500"
              >
                <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center mb-6 group-hover:bg-primary-100 transition-colors duration-500">
                  <d.icon size={26} className="text-primary-600" />
                </div>
                <h3 className="font-display text-2xl font-bold text-stone-900">{d.title ?? p.label}</h3>
                <p className="mt-3 text-stone-500 text-sm leading-relaxed flex-1">{d.text}</p>
                <span className="mt-6 flex items-center gap-2 text-primary-600 text-sm font-semibold">
                  View page
                  <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

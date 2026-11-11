import { Quote, Star } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

/** The quote: the sample's founder; on a real shop, one of its own reviews, named as the review it is. */
export default function FounderStatement() {
  const site = useSite();
  const f = site.featured;
  if (!f) return null;
  return (
    <section className="bg-[#0f0d0b] py-24 px-6 relative overflow-hidden" data-testid="heritage-featured">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-5 bg-cover bg-center" style={{ backgroundImage: `url(${site.aboutImages[1]})` }} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0f0d0b] via-[#0f0d0b]/80 to-[#0f0d0b]" />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <div className="w-14 h-14 rounded-full bg-[#c9a96e]/10 border border-[#c9a96e]/30 flex items-center justify-center mx-auto mb-10">
          <Quote size={24} className="text-[#c9a96e]" />
        </div>

        {f.rating != null && (
          <div className="flex justify-center gap-1 mb-6" aria-label={`${f.rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={18} className={i < f.rating! ? 'fill-[#c9a96e] text-[#c9a96e]' : 'text-white/20'} />
            ))}
          </div>
        )}

        <blockquote className="text-xl md:text-2xl lg:text-3xl text-white/80 font-light leading-relaxed italic mb-10">
          “{f.text}”
        </blockquote>

        <div className="flex items-center justify-center gap-5">
          {f.photo && (
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#c9a96e]/50">
              <img src={f.photo} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
            </div>
          )}
          <div className={f.photo ? 'text-left' : 'text-center'}>
            <p className="text-white font-semibold">{f.name}</p>
            <p className="text-[#c9a96e] text-xs tracking-widest uppercase">{f.label}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

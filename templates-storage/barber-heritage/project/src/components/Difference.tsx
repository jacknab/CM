import { Users, Clock, Star, Smile } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

const ICONS = [Users, Clock, Star, Smile];

/** "Our Story": the shop's own about text. The design's points and years badge are the sample's only (claims). */
export default function Difference() {
  const site = useSite();
  if (!site.aboutText) return null;
  const paragraphs = site.aboutText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <section id="difference" className="bg-[#13110d] py-24 px-6 scroll-mt-16">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: image */}
          <div className="relative">
            <div className="aspect-[4/5] rounded-lg overflow-hidden">
              <img
                src={site.aboutImages[0]}
                alt={site.wording.heroAlt(site.salonName)}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            {/* Gold accent frame */}
            <div className="absolute -bottom-4 -right-4 w-2/3 h-2/3 border border-[#c9a96e]/25 rounded-lg pointer-events-none" />
            {site.isSample && (
              <div className="absolute bottom-8 left-8 bg-[#0f0d0b]/90 backdrop-blur-sm border border-[#c9a96e]/30 rounded-lg px-5 py-4">
                <p className="text-[#c9a96e] text-3xl font-bold">6+</p>
                <p className="text-white/60 text-xs tracking-widest uppercase mt-0.5">Years in Business</p>
              </div>
            )}
            {!site.isSample && site.reviewCount > 0 && site.avgRating > 0 && (
              <div className="absolute bottom-8 left-8 bg-[#0f0d0b]/90 backdrop-blur-sm border border-[#c9a96e]/30 rounded-lg px-5 py-4" data-testid="heritage-rating">
                <p className="text-[#c9a96e] text-3xl font-bold">{site.avgRating.toFixed(1)}</p>
                <p className="text-white/60 text-xs tracking-widest uppercase mt-0.5">
                  {site.reviewCount} {site.reviewsFromGoogle ? 'Google ' : ''}review{site.reviewCount === 1 ? '' : 's'}
                </p>
              </div>
            )}
          </div>

          {/* Right: content */}
          <div>
            <p className="text-[#c9a96e] text-xs tracking-[0.4em] uppercase mb-4">{site.isSample ? 'Why Choose Us' : 'Our Story'}</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
              {site.isSample ? 'More Than Just a Cut' : `About ${site.salonName}`}
            </h2>
            <div className={`space-y-4 ${site.pillars.length ? 'mb-12' : ''}`}>
              {paragraphs.map((p, i) => <p key={i} className="text-white/50 leading-relaxed">{p}</p>)}
            </div>

            {site.pillars.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-6">
                {site.pillars.map((p, i) => {
                  const Icon = ICONS[i % ICONS.length];
                  return (
                    <div key={p.title} className="flex gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#c9a96e]/10 border border-[#c9a96e]/20 flex items-center justify-center">
                        <Icon size={18} className="text-[#c9a96e]" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold text-sm mb-1">{p.title}</h3>
                        <p className="text-white/45 text-sm leading-relaxed">{p.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

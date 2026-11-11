import { Scissors } from 'lucide-react';
import { useSite, type LiveService } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';

function ServiceCard({ s }: { s: LiveService }) {
  const { canBookOnline, isSample } = useSite();
  return (
    <div
      className="relative group bg-[#18150f] border border-white/8 rounded-lg p-6 hover:border-[#c9a96e]/40 hover:bg-[#1e1a12] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 flex flex-col"
      data-testid="heritage-service"
    >
      {s.popular && (
        <span className="absolute top-4 right-4 text-[10px] tracking-widest uppercase bg-[#c9a96e]/15 text-[#c9a96e] border border-[#c9a96e]/30 px-2.5 py-1 rounded-full">
          Most Popular
        </span>
      )}
      <h3 className={`text-white font-semibold text-lg leading-snug mb-3 ${s.popular ? 'pr-24' : ''}`}>{s.name}</h3>
      {s.description && <p className="text-white/45 text-sm leading-relaxed mb-5">{s.description}</p>}
      <div className="mt-auto flex items-end justify-between gap-4">
        <div>
          {s.price != null && <span className="text-[#c9a96e] text-2xl font-bold">${Number.isInteger(s.price) ? s.price : s.price.toFixed(2)}</span>}
          {s.duration && <span className="block text-white/35 text-xs tracking-wide mt-1">{s.duration}</span>}
        </div>
        <BookButton
          serviceId={s.id}
          className="text-xs tracking-widest uppercase text-white/40 hover:text-[#c9a96e] transition-colors border-b border-transparent hover:border-[#c9a96e]/50 pb-0.5"
        >
          {canBookOnline || isSample ? 'Book Now' : 'Call to Book'}
        </BookButton>
      </div>
    </div>
  );
}

export default function Services() {
  const { services, categories, isSample, isUnclaimed } = useSite();
  if (services.length === 0) return null;
  // Grouped under their category names when the shop has more than one (the sample shows one grid, like the design).
  const groups = !isSample && categories.length > 1
    ? categories.map((c) => ({ name: c, items: services.filter((s) => s.category === c) })).filter((g) => g.items.length)
    : [{ name: '', items: services }];

  return (
    <section id="services" className="bg-[#0f0d0b] py-24 px-6 scroll-mt-16">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-[#c9a96e] text-xs tracking-[0.4em] uppercase mb-4">What We Offer</p>
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            {isUnclaimed ? 'Services' : 'Services & Pricing'}
          </h2>
          <p className="mt-4 text-white/50 max-w-md mx-auto">
            {isSample
              ? 'Tailored for every gentleman. From buzzcuts to classic trims, we have a chair waiting for you.'
              : isUnclaimed ? 'Every service we offer.' : 'Every service we offer, with its price and time.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-px w-16 bg-[#c9a96e]/40" />
            <Scissors size={16} className="text-[#c9a96e]" />
            <div className="h-px w-16 bg-[#c9a96e]/40" />
          </div>
        </div>

        <div className="space-y-14">
          {groups.map((g) => (
            <div key={g.name || 'all'}>
              {g.name && (
                <h3 className="text-[#c9a96e] text-sm font-semibold tracking-[0.3em] uppercase mb-6 text-center sm:text-left">{g.name}</h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {g.items.map((s) => <ServiceCard key={s.id} s={s} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

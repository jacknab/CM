import { useState } from 'react';
import { Clock, Hand, Gem, Footprints, Sparkles, Brush, Heart, Scissors, Palette, Droplets, Flower2, type LucideIcon } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';

/** A decorative icon from the service's name. */
function iconFor(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/pedi|foot/.test(n)) return Footprints;
  if (/art|design/.test(n)) return Brush;
  if (/gel|shellac/.test(n)) return Gem;
  if (/dip|acrylic|extension|gel-x|full set|fill/.test(n)) return Sparkles;
  if (/mani|hand|nail/.test(n)) return Hand;
  if (/cut|trim|fade|shave|beard|barber/.test(n)) return Scissors;
  if (/colou?r|highlight|balayage|tone/.test(n)) return Palette;
  if (/wash|treatment|keratin|mask|facial/.test(n)) return Droplets;
  if (/wax|brow|lash/.test(n)) return Flower2;
  return Heart;
}

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

export default function Services() {
  const { services, categories, isUnclaimed, canBookOnline, phone, phoneHref } = useSite();
  const [active, setActive] = useState('All');
  const shown = active === 'All' ? services : services.filter((s) => s.category === active);

  return (
    <section className="py-24 md:py-32 bg-stone-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Heading */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-accent-500 font-semibold text-sm tracking-widest uppercase">
            Our Menu
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold text-stone-900 text-balance">
            Services Crafted for You
          </h2>
          <p className="mt-4 text-stone-500 text-lg">
            {isUnclaimed
              ? `Call ${phone || 'us'} for prices and to book.`
              : canBookOnline ? 'Choose a service and book your time online.' : `Call ${phone || 'us'} to book.`}
          </p>
        </div>

        {/* Categories */}
        {categories.length > 1 && (
          <div className="mb-10 flex flex-wrap justify-center gap-2" role="group" aria-label="Filter by category">
            {['All', ...categories].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                aria-pressed={active === c}
                className={`px-5 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  active === c ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-stone-600 border-stone-200 hover:border-primary-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {shown.map((service) => {
            const Icon = iconFor(service.name);
            return (
              <div
                key={service.id}
                className="group relative flex flex-col bg-white rounded-2xl p-8 border border-stone-100 hover:border-primary-200 hover:shadow-xl hover:shadow-stone-200/60 transition-all duration-500"
                data-testid="luxe-service"
              >
                {service.popular && (
                  <span className="absolute -top-3 right-6 px-3 py-1 bg-primary-600 text-white text-xs font-semibold rounded-full shadow-md">
                    Most Loved
                  </span>
                )}

                <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center mb-6 group-hover:bg-primary-100 transition-colors duration-500">
                  <Icon size={26} className="text-primary-600 group-hover:scale-110 transition-transform duration-500" />
                </div>

                <h3 className="font-display text-2xl font-bold text-stone-900">{service.name}</h3>
                {service.description && (
                  <p className="mt-3 text-stone-500 text-sm leading-relaxed">{service.description}</p>
                )}

                <div className="mt-auto pt-6">
                  <div className="pt-6 border-t border-stone-100 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-3">
                      {service.price != null && <span className="text-2xl font-bold text-stone-900">{money(service.price)}</span>}
                      {service.duration && (
                        <span className="flex items-center gap-1.5 text-stone-400 text-sm">
                          <Clock size={15} />
                          {service.duration}
                        </span>
                      )}
                    </div>
                    {canBookOnline && (
                      <BookButton serviceId={service.id} className="px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm font-semibold hover:bg-primary-600 hover:text-white transition-colors">
                        Book
                      </BookButton>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          {(canBookOnline || phoneHref) && (
            <BookButton className="inline-block px-8 py-4 bg-primary-600 text-white font-semibold rounded-full hover:bg-primary-700 transition-all duration-300 shadow-lg shadow-primary-200 hover:scale-105">
              {canBookOnline ? 'Reserve Your Spot' : `Call ${phone}`}
            </BookButton>
          )}
        </div>
      </div>
    </section>
  );
}

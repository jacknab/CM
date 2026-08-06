import { useState } from 'react';
import { Clock, Check, ArrowRight } from 'lucide-react';
import SectionHeading from '@/components/SectionHeading';
import ServiceReviewBadge from '@/components/ServiceReviewBadge';
import { useSite } from '@/context/SiteContext';

export default function Services() {
  const { services, categories } = useSite();
  const [active, setActive] = useState<string>('All');

  const filtered = active === 'All' ? services : services.filter((s) => s.category === active);

  return (
    <section id="services" className="bg-taupe-50 py-12 sm:py-16 lg:py-24">
      <div className="container-prose">
        <SectionHeading
          eyebrow="Our Services"
          title="Nail Services & Pricing"
          description="Every service includes a complimentary consultation so your technician can tailor the experience to your nails, your style, and your schedule."
        />

        {/* Category filter */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:mt-10 sm:gap-2.5">
          {(['All', ...categories] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActive(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all sm:px-5 sm:py-2 ${
                active === cat
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-taupe-100 text-taupe-700 hover:bg-rose-100 hover:text-rose-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Service grid */}
        <div
          className="mt-8 grid gap-4 sm:mt-12 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((service) => (
            <article
              key={service.id}
              className="group relative flex flex-col rounded-3xl border border-taupe-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-6"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-taupe-100 px-3 py-1 text-xs font-semibold text-taupe-700">
                  {service.category}
                </span>
                {service.popular && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    <Check className="h-3 w-3" /> Most Loved
                  </span>
                )}
              </div>

              <h3 className="mt-3 font-serif text-2xl font-medium text-taupe-900 sm:mt-4">{service.name}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-taupe-600 sm:mt-3">{service.description}</p>

              {/* Show AI-matched Google review if one exists for this service */}
              <ServiceReviewBadge serviceId={service.id} />

              <div className="mt-4 flex items-center justify-between border-t border-taupe-100 pt-4 sm:mt-5 sm:pt-5">
                <div className="flex flex-col">
                  <span className="font-serif text-2xl font-semibold text-rose-600">
                    {service.price > 0 ? `$${service.price}` : 'POA'}
                  </span>
                  {service.durationMinutes > 0 && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-taupe-500">
                      <Clock className="h-3.5 w-3.5" />
                      {service.durationMinutes} min
                    </span>
                  )}
                </div>
                <a
                  href="#contact"
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-all hover:bg-rose-600 hover:text-white"
                >
                  Book
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

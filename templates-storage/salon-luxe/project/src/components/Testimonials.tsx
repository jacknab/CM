import { Star, Quote } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

export default function Testimonials() {
  const { reviews, reviewCount, avgRating, reviewsFromGoogle, cityLine, isSample } = useSite();
  const city = cityLine.split(',')[0];
  return (
    <section className="py-24 md:py-32 bg-stone-900 relative overflow-hidden">
      {/* Decorative blurs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary-900/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-900/10 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-accent-400 font-semibold text-sm tracking-widest uppercase">
            {reviewsFromGoogle ? 'Reviews from Google' : 'Reviews'}
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold text-white text-balance">
            {isSample ? 'Loved Across Oakland' : city ? `Loved in ${city}` : 'What Our Clients Say'}
          </h2>
          {reviewCount > 0 && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <div className="flex" aria-hidden="true">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={20} className={i < Math.round(avgRating) ? 'text-accent-400 fill-accent-400' : 'text-stone-600'} />
                ))}
              </div>
              <span className="text-stone-300">
                {avgRating.toFixed(1)} / 5 · {reviewCount.toLocaleString()} {reviewsFromGoogle ? 'Google ' : ''}{reviewCount === 1 ? 'review' : 'reviews'}
              </span>
            </div>
          )}
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {reviews.map((t, i) => (
            <div
              key={i}
              className="bg-stone-800/50 backdrop-blur-sm rounded-2xl p-8 border border-stone-700/50 hover:border-primary-500/40 transition-colors duration-500"
              data-testid="luxe-review"
            >
              <Quote size={32} className="text-primary-400/50 mb-4" />
              <p className="text-stone-200 leading-relaxed text-[15px] whitespace-pre-line">"{t.text}"</p>
              <div className="mt-6 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{t.name}</p>
                  <p className="text-stone-400 text-sm">{t.label}</p>
                </div>
                <div className="flex" aria-label={`${t.rating} out of 5 stars`}>
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} size={14} className="text-accent-400 fill-accent-400" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

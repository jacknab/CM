import { Instagram } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

export default function Gallery() {
  const { galleryPhotos, instagramUrl, instagramHandle, salonName } = useSite();
  return (
    <section className="py-24 md:py-32 bg-stone-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-accent-500 font-semibold text-sm tracking-widest uppercase">
            Our Work
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold text-stone-900 text-balance">
            A Gallery of Artistry
          </h2>
          <p className="mt-4 text-stone-500 text-lg">
            Recent work from {salonName || 'our studio'}.
          </p>
        </div>

        {/* Masonry-style grid: every third photo stands tall */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[200px] md:auto-rows-[240px]">
          {galleryPhotos.map((item, i) => (
            <div
              key={`${item.url}-${i}`}
              className={`group relative overflow-hidden rounded-2xl shadow-md ${i % 4 === 0 ? 'row-span-2' : ''}`}
            >
              <img
                src={item.url}
                alt={item.alt}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                loading="lazy"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
              />
              {instagramHandle && (
                <div className="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-5">
                  <span className="text-white text-xs flex items-center gap-2">
                    <Instagram size={16} className="text-accent-400" />
                    @{instagramHandle}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Instagram CTA */}
        {instagramUrl && instagramHandle && (
          <div className="mt-12 text-center">
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-stone-600 hover:text-primary-600 font-medium transition-colors"
            >
              <Instagram size={20} />
              Follow us @{instagramHandle}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

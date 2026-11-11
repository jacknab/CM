import { useSite } from '@/context/SiteContext';

/** The shop's own photos (none: no gallery; a real shop never shows sample work). */
export default function Gallery() {
  const { galleryPhotos, isSample, kind } = useSite();
  if (galleryPhotos.length === 0) return null;
  const photos = galleryPhotos.slice(0, 12);
  const tall = (i: number) => photos.length >= 6 && (i === 0 || i === 5);

  return (
    <section id="gallery" className="bg-[#13110d] py-24 px-6 scroll-mt-16">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[#c9a96e] text-xs tracking-[0.4em] uppercase mb-4">Our Work</p>
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            {isSample || kind === 'barber' || kind === 'hair' ? 'Haircut Showcase' : 'Gallery'}
          </h2>
          {isSample && (
            <p className="mt-4 text-white/50 max-w-md mx-auto">
              A journey of style. Glimpse into our world of artistic precision and client satisfaction.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {photos.map((p, i) => (
            <div key={i} className={`relative overflow-hidden rounded-lg group ${tall(i) ? 'row-span-1 md:row-span-2' : ''}`}>
              <div className={`${tall(i) ? 'aspect-[4/5] md:aspect-auto md:h-full' : 'aspect-square'} w-full`}>
                <img
                  src={p.url}
                  alt={p.alt}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                <span className="text-white text-sm font-medium tracking-wide">{p.alt}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

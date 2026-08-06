import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import { useReveal } from '@/hooks/useReveal';

export default function Gallery() {
  const { galleryPhotos, salonName } = useSite();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { ref, visible } = useReveal<HTMLDivElement>();
  const total = galleryPhotos.length;

  useEffect(() => {
    if (selectedIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIndex(null);
      if (e.key === 'ArrowLeft')
        setSelectedIndex((i) => (i === null ? null : (i - 1 + total) % total));
      if (e.key === 'ArrowRight')
        setSelectedIndex((i) => (i === null ? null : (i + 1) % total));
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [selectedIndex, total]);

  if (total === 0) return null;

  const selected = selectedIndex === null ? null : galleryPhotos[selectedIndex];

  return (
    <>
      <section
        id="gallery"
        aria-labelledby="gallery-heading"
        className="bg-white py-14 sm:py-20 lg:py-28"
      >
        <div className="container-prose">
          {/* Heading */}
          <div className="text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gold-700">
              Our Work
            </p>
            <h2
              id="gallery-heading"
              className="font-serif text-3xl font-semibold text-ink-900 sm:text-4xl"
            >
              Client Gallery
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-ink-600">
              Every photo is a real client result from our studio. Tap any photo to view it larger.
            </p>
          </div>

          {/* Masonry grid */}
          <div
            ref={ref}
            className={`reveal ${visible ? 'is-visible' : ''} masonry mt-10 sm:mt-12`}
          >
            {galleryPhotos.map((photo, index) => (
              <button
                key={`${photo.image_url}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className="masonry-item group relative block w-full overflow-hidden rounded-2xl bg-cream-100 focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-2"
                aria-label={`View ${photo.caption ?? `gallery photo ${index + 1}`} larger`}
              >
                <img
                  src={photo.image_url}
                  alt={photo.caption ?? `${salonName} nail art — photo ${index + 1}`}
                  loading="lazy"
                  className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    e.currentTarget.closest('button')?.remove();
                  }}
                />
                {/* Hover overlay */}
                <span className="absolute inset-0 flex items-center justify-center bg-ink-900/0 text-white opacity-0 transition-all duration-300 group-hover:bg-ink-900/30 group-hover:opacity-100 group-focus:bg-ink-900/30 group-focus:opacity-100">
                  <ZoomIn className="h-7 w-7 drop-shadow-lg" aria-hidden="true" />
                </span>
                {/* Caption */}
                {photo.caption && (
                  <span className="absolute bottom-0 inset-x-0 translate-y-full bg-ink-900/70 px-3 py-2 text-xs text-white transition-transform duration-300 group-hover:translate-y-0 group-focus:translate-y-0">
                    {photo.caption}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Lightbox ─────────────────────────────────────────────────────── */}
      {selected && selectedIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/92 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={selected.caption ?? `${salonName} gallery photo ${selectedIndex + 1}`}
          onClick={() => setSelectedIndex(null)}
        >
          {/* Close */}
          <button
            type="button"
            onClick={() => setSelectedIndex(null)}
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Close lightbox"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Prev / Next */}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((i) => (i === null ? null : (i - 1 + total) % total));
                }}
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white sm:left-6"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((i) => (i === null ? null : (i + 1) % total));
                }}
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white sm:right-6"
                aria-label="Next photo"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Photo */}
          <figure
            className="flex max-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selected.image_url}
              alt={selected.caption ?? `${salonName} gallery photo ${selectedIndex + 1}`}
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            {selected.caption && (
              <figcaption className="max-w-xl text-center text-sm text-white/75">
                {selected.caption}
              </figcaption>
            )}
            <p className="text-xs text-white/40">
              {selectedIndex + 1} / {total}
            </p>
          </figure>
        </div>
      )}
    </>
  );
}

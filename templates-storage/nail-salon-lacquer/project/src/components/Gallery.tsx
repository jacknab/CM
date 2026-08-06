import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

export default function Gallery() {
  const { galleryPhotos, salonName } = useSite();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (selectedIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedIndex(null);
      if (event.key === 'ArrowLeft') {
        setSelectedIndex((current) =>
          current === null ? null : (current - 1 + galleryPhotos.length) % galleryPhotos.length,
        );
      }
      if (event.key === 'ArrowRight') {
        setSelectedIndex((current) =>
          current === null ? null : (current + 1) % galleryPhotos.length,
        );
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedIndex, galleryPhotos.length]);

  if (galleryPhotos.length === 0) return null;

  const selectedPhoto = selectedIndex === null ? null : galleryPhotos[selectedIndex];

  return (
    <>
      <section id="gallery" className="bg-taupe-50 py-12 sm:py-16 lg:py-24">
        <div className="container-prose">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {galleryPhotos.map((photo, index) => (
              <button
                key={`${photo.image_url}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className="group relative aspect-square overflow-hidden rounded-2xl bg-taupe-200 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-2"
                aria-label={`View ${photo.caption || `gallery photo ${index + 1}`} larger`}
              >
                <img
                  src={photo.image_url}
                  alt={photo.caption || `${salonName} salon gallery photo ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(event) => {
                    event.currentTarget.parentElement?.remove();
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center bg-taupe-900/0 text-white opacity-0 transition-all duration-300 group-hover:bg-taupe-900/35 group-hover:opacity-100 group-focus:bg-taupe-900/35 group-focus:opacity-100">
                  <Images className="h-7 w-7" aria-hidden="true" />
                  <span className="sr-only">View larger</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {selectedPhoto && selectedIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-taupe-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${salonName} gallery photo`}
          onClick={() => setSelectedIndex(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedIndex(null)}
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Close larger image"
          >
            <X className="h-6 w-6" />
          </button>

          {galleryPhotos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex((selectedIndex - 1 + galleryPhotos.length) % galleryPhotos.length);
                }}
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white sm:left-6"
                aria-label="Previous gallery image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex((selectedIndex + 1) % galleryPhotos.length);
                }}
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white sm:right-6"
                aria-label="Next gallery image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <figure
            className="flex max-h-[calc(100vh-2rem)] max-w-6xl flex-col items-center gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedPhoto.image_url}
              alt={selectedPhoto.caption || `${salonName} salon gallery photo ${selectedIndex + 1}`}
              className="max-h-[78vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            {selectedPhoto.caption && (
              <figcaption className="max-w-2xl text-center text-sm text-white/80">
                {selectedPhoto.caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
/**
 * Portfolio widget (owner, 2026-11-11): the masonry grid, the lightbox and Book this look.
 * Moved unchanged from SoloTheme.tsx.
 */
import { ArrowRight, ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { C } from "./shared";
import { useSite } from "./useSoloSite";

/** The pro's photos; shown only when there are any. */
export function PortfolioWidget({ hidden }: { hidden?: boolean }) {
  const { services, gallery, bookingOff, lightboxIndex, setLightboxIndex, salonName, chooseService } = useSite();
  return (
    <>
      {/* ── PORTFOLIO: the pro's photos from the app's Portfolio screen (only shown if there are any) ── */}
      {gallery.length > 0 && (
        <>
          <section
            id="portfolio"
            hidden={hidden}
            aria-labelledby="portfolio-heading"
            className="bg-white py-14 sm:py-20"
          >
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12">
              <div className="text-center">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: C.gold700 }}>My Work</p>
                <h2
                  id="portfolio-heading"
                  className="text-3xl font-semibold sm:text-4xl"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
                >
                  Portfolio
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed" style={{ color: C.ink600 }}>
                  Every photo is real client work. Tap any photo to view it larger.
                </p>
              </div>

              {/* Masonry grid */}
              <div className="bloom-masonry mt-10 sm:mt-12">
                {gallery.map((photo, index) => (
                  <button
                    key={`${photo.image_url}-${index}`}
                    type="button"
                    onClick={() => setLightboxIndex(index)}
                    className="bloom-masonry-item group relative block w-full overflow-hidden rounded-2xl focus:outline-none"
                    style={{ background: C.cream100 }}
                    aria-label={`View ${photo.caption ?? `portfolio photo ${index + 1}`} larger`}
                  >
                    <img
                      src={photo.image_url}
                      alt={photo.caption ?? `${salonName} nail art — photo ${index + 1}`}
                      loading="lazy"
                      className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { e.currentTarget.closest("button")?.remove(); }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all duration-300 group-hover:bg-black/30 group-hover:opacity-100">
                      <ZoomIn className="h-7 w-7 drop-shadow-lg" aria-hidden="true" />
                    </span>
                    {photo.caption && (
                      <span className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-3 py-2 text-xs text-white transition-transform duration-300 group-hover:translate-y-0">
                        {photo.caption}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Lightbox */}
          {lightboxIndex !== null && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
              style={{ background: "rgba(26,24,20,0.92)" }}
              role="dialog"
              aria-modal="true"
              onClick={() => setLightboxIndex(null)}
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Close lightbox"
              >
                <X className="h-6 w-6" />
              </button>
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i === null ? null : (i - 1 + gallery.length) % gallery.length); }}
                    className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i === null ? null : (i + 1) % gallery.length); }}
                    className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
              <figure
                className="flex max-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={gallery[lightboxIndex].image_url}
                  alt={gallery[lightboxIndex].caption ?? `${salonName} portfolio photo ${lightboxIndex + 1}`}
                  className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
                />
                {gallery[lightboxIndex].caption && (
                  <figcaption className="max-w-xl text-center text-sm text-white/75">
                    {gallery[lightboxIndex].caption}
                  </figcaption>
                )}
                <p className="text-xs text-white/40">{lightboxIndex + 1} / {gallery.length}</p>
                {(() => {
                  const look = services.find((x) => x.id === gallery[lightboxIndex].service_id);
                  return look && !bookingOff ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); chooseService(look.id); }}
                      data-testid="solo-book-look"
                      className="mt-1 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold"
                      style={{ color: C.ink900 }}
                    >
                      Book this look · {look.name}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null;
                })()}
              </figure>
            </div>
          )}
          <style>{`
        .bloom-masonry {
          columns: 2;
          column-gap: 0.75rem;
        }
        @media (min-width: 640px) {
          .bloom-masonry { columns: 3; column-gap: 1rem; }
        }
        @media (min-width: 1024px) {
          .bloom-masonry { columns: 4; column-gap: 1rem; }
        }
        .bloom-masonry-item {
          break-inside: avoid;
          margin-bottom: 0.75rem;
        }
        @media (min-width: 640px) {
          .bloom-masonry-item { margin-bottom: 1rem; }
        }
          `}</style>
        </>
      )}
    </>
  );
}

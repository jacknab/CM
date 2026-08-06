import { useSite } from '../context/SiteContext';

const photos = [
  {
    src: 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&dpr=1',
    alt: 'Nail art design',
  },
  {
    src: 'https://images.pexels.com/photos/3997993/pexels-photo-3997993.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&dpr=1',
    alt: 'Pedicure service',
  },
  {
    src: 'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&dpr=1',
    alt: 'Nail polish selection',
  },
  {
    src: 'https://images.pexels.com/photos/3997386/pexels-photo-3997386.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&dpr=1',
    alt: 'Luxury manicure',
  },
  {
    src: 'https://images.pexels.com/photos/4046316/pexels-photo-4046316.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&dpr=1',
    alt: 'Salon interior',
  },
  {
    src: 'https://images.pexels.com/photos/939836/pexels-photo-939836.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&dpr=1',
    alt: 'Gel nail art',
  },
];

export default function Gallery() {
  const site = useSite();
  const businessName = site?.business?.name ?? 'Lumière';

  return (
    <section id="gallery" className="bg-cream-100 py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="font-sans text-[10px] font-semibold tracking-[0.5em] uppercase text-gold-500 mb-3">
            Our Work
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-light text-charcoal-800">
            The {businessName} Portfolio
          </h2>
          <div className="mt-4 w-16 h-px bg-gold-400 mx-auto" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {photos.map((photo, i) => (
            <div
              key={i}
              className="relative overflow-hidden group aspect-square"
            >
              <img
                src={photo.src}
                alt={photo.alt}
                className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-charcoal-900/0 group-hover:bg-charcoal-900/30 transition-all duration-500" />
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <p className="font-sans text-sm text-charcoal-600 italic">
            Follow us for daily inspiration and the latest nail art trends.
          </p>
        </div>
      </div>
    </section>
  );
}

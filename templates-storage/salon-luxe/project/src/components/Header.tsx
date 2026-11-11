import { useEffect, useState } from 'react';
import { Menu, X, Phone, MapPin } from 'lucide-react';
import { pageHref, shownPages, type PageId } from '@/lib/router';
import { useSite } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';

interface HeaderProps {
  activePage: PageId;
}

export default function Header({ activePage }: HeaderProps) {
  const site = useSite();
  const { nameFirst, nameRest, logoImage, street, cityLine, hoursLine, phone, phoneHref } = site;
  const pages = shownPages({ photos: site.galleryPhotos.length > 0, reviews: site.reviews.length > 0 });
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {/* Top bar */}
      {(street || hoursLine || phone) && (
        <div className="hidden md:block bg-stone-900 text-stone-300 text-xs tracking-wide">
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-6">
              {(street || cityLine) && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-accent-400" />
                  {[street, cityLine].filter(Boolean).join(', ')}
                </span>
              )}
              {street && hoursLine && <span className="text-stone-500">|</span>}
              {hoursLine && <span>{hoursLine}</span>}
            </div>
            {phone && (
              <a href={phoneHref} className="flex items-center gap-1.5 hover:text-accent-400 transition-colors">
                <Phone size={13} />
                {phone}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Main nav */}
      <header
        className={`sticky top-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-md shadow-lg shadow-stone-200/50'
            : 'bg-white/80 backdrop-blur-sm'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <a
            href={pageHref('home')}
            onClick={() => setMenuOpen(false)}
            className="flex min-w-0 items-center gap-2"
            aria-label={`${site.salonName} home`}
          >
            {logoImage && <img src={logoImage} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />}
            <span className="min-w-0 truncate">
              <span className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-stone-900">{nameFirst}</span>
              {nameRest && <span className="ml-1.5 text-2xl sm:text-3xl font-display font-light tracking-wide text-gradient-gold">{nameRest}</span>}
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {pages.map((link) => (
              <a
                key={link.id}
                href={pageHref(link.id)}
                aria-current={activePage === link.id ? 'page' : undefined}
                className={`relative text-sm font-medium transition-colors duration-300 group ${
                  activePage === link.id ? 'text-primary-600' : 'text-stone-600 hover:text-primary-600'
                }`}
              >
                {link.label}
                <span
                  className={`absolute -bottom-1 left-0 h-px bg-primary-500 transition-all duration-300 ${
                    activePage === link.id ? 'w-full' : 'w-0 group-hover:w-full'
                  }`}
                />
              </a>
            ))}
          </nav>

          <div className="hidden md:block">
            <BookButton className="inline-block px-6 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-all duration-300 shadow-md shadow-primary-200 hover:shadow-lg hover:shadow-primary-300 hover:scale-105">
              {site.canBookOnline ? 'Book Now' : 'Call to Book'}
            </BookButton>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-stone-800 p-2"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-500 ${
            menuOpen ? 'max-h-[28rem]' : 'max-h-0'
          }`}
        >
          <nav className="flex flex-col px-6 pb-6 gap-1 bg-white">
            {pages.map((link) => (
              <a
                key={link.id}
                href={pageHref(link.id)}
                onClick={() => setMenuOpen(false)}
                aria-current={activePage === link.id ? 'page' : undefined}
                className={`py-3 font-medium border-b border-stone-100 transition-colors ${
                  activePage === link.id ? 'text-primary-600' : 'text-stone-700 hover:text-primary-600'
                }`}
              >
                {link.label}
              </a>
            ))}
            <BookButton onClick={() => setMenuOpen(false)} className="mt-4 py-3 text-center bg-primary-600 text-white font-semibold rounded-full">
              {site.canBookOnline ? 'Book Appointment' : 'Call to Book'}
            </BookButton>
          </nav>
        </div>
      </header>
    </>
  );
}

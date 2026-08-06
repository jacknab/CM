import { useEffect, useState } from 'react';
import { Menu, Phone, X } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

const NAV_LINKS = [
  { label: 'Services', href: '#services' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Visit', href: '#visit' },
];

export default function Header() {
  const { salonName, phone, phoneHref } = useSite();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/95 shadow-sm backdrop-blur-md' : 'bg-white/90 backdrop-blur-sm'
      }`}
    >
      <nav
        className="relative flex h-14 items-center justify-center px-5 sm:h-16"
        aria-label="Primary navigation"
      >
        {/* Centered salon name */}
        <a
          href="#top"
          className="font-serif text-xl font-semibold text-gray-900 sm:text-2xl"
          aria-label={`${salonName} — home`}
        >
          {salonName}
        </a>

        {/* Hamburger — absolute right */}
        <button
          type="button"
          className="absolute right-4 grid h-10 w-10 place-items-center rounded-lg text-gray-800 transition-colors hover:bg-gray-100"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen
            ? <X className="h-5 w-5" aria-hidden="true" />
            : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </nav>

      {/* Slide-down drawer */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="fixed inset-0 top-14 z-40 sm:top-16"
          onClick={() => setMenuOpen(false)}
        >
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" aria-hidden="true" />
          <nav
            className="relative border-t border-gray-100 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            aria-label="Mobile navigation"
          >
            <ul
              className="flex flex-col gap-1 px-5 py-4"
              style={{ maxHeight: 'calc(100vh - 3.5rem)', overflowY: 'auto' }}
              role="list"
            >
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-4 py-3.5 text-lg font-medium text-gray-800 transition-colors hover:bg-gray-50 hover:text-rose-600"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              {phone && (
                <li className="mt-2 px-4">
                  <a
                    href={phoneHref}
                    className="flex items-center gap-2 py-2 text-base font-medium text-gray-600"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {phone}
                  </a>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}

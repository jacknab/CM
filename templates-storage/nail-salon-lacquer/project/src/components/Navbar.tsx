import { useEffect, useState } from 'react';
import { Menu, X, Phone } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

const links = [
  { label: 'Services', href: '#services' },
  { label: 'Team', href: '#team' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Visit', href: '#contact' },
];

export default function Navbar() {
  const { salonName, phone, phoneHref } = useSite();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const initial = salonName.charAt(0).toUpperCase();

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-taupe-50/95 shadow-sm backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <nav className="container-prose flex h-20 items-center justify-between" aria-label="Primary">
        <a href="#home" className="group flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-600 text-white shadow-sm transition-transform group-hover:scale-105">
            <span className="font-serif text-lg font-semibold">{initial}</span>
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-serif text-xl font-semibold text-taupe-900">{salonName}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-rose-600">Nail Studio</span>
          </span>
        </a>

        {/* Desktop nav */}
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="relative text-sm font-medium text-taupe-700 transition-colors hover:text-rose-600 after:absolute after:-bottom-1.5 after:left-0 after:h-0.5 after:w-0 after:bg-rose-600 after:transition-all hover:after:w-full"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-4 md:flex">
          {phone && (
            <a
              href={phoneHref}
              className="flex items-center gap-2 text-sm font-medium text-taupe-700 transition-colors hover:text-rose-600"
            >
              <Phone className="h-4 w-4" />
              {phone}
            </a>
          )}
          <a
            href="#contact"
            className="rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-rose-700 hover:shadow-md"
          >
            Book Now
          </a>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg text-taupe-800 md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 top-20 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-taupe-900/40 backdrop-blur-sm" />
          <div
            className="relative border-t border-taupe-200 bg-taupe-50 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="container-prose flex flex-col gap-1 overflow-y-auto py-4" style={{ maxHeight: 'calc(100vh - 5rem)' }}>
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-4 py-3.5 text-lg font-medium text-taupe-800 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              {phone && (
                <li className="mt-2 px-4">
                  <a href={phoneHref} className="flex items-center gap-2 py-2 text-base font-medium text-taupe-700">
                    <Phone className="h-4 w-4" />
                    {phone}
                  </a>
                </li>
              )}
              <li className="px-4 pb-2">
                <a
                  href="#contact"
                  onClick={() => setOpen(false)}
                  className="block rounded-full bg-rose-600 px-6 py-3.5 text-center text-base font-semibold text-white"
                >
                  Book Now
                </a>
              </li>
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}

import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';
import Logo from '@/components/Logo';
import UnclaimedBanner from '@/components/UnclaimedBanner';

export default function Navbar() {
  const site = useSite();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Only the sections this shop has.
  const links = [
    { label: 'Services', href: '#services', show: site.services.length > 0 },
    { label: 'Our Story', href: '#difference', show: !!site.aboutText },
    { label: 'Gallery', href: '#gallery', show: site.galleryPhotos.length > 0 },
    { label: 'Contact', href: '#contact', show: true },
  ].filter((l) => l.show);
  const bookLabel = site.canBookOnline || site.isSample ? 'Book Now' : 'Call to Book';

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-[#0f0d0b]/95 backdrop-blur-md shadow-lg shadow-black/40' : 'bg-transparent'
      }`}
    >
      <UnclaimedBanner />
      <div className={`max-w-7xl mx-auto px-6 flex items-center justify-between transition-all duration-500 ${scrolled ? 'py-3' : 'py-6'}`}>
        <a href="#" className="flex items-center gap-3 group" aria-label={site.salonName}>
          <Logo />
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-white/70 hover:text-[#c9a96e] text-sm tracking-widest uppercase transition-colors duration-300"
            >
              {l.label}
            </a>
          ))}
          <BookButton className="ml-4 px-5 py-2.5 bg-[#c9a96e] text-[#0f0d0b] text-sm font-bold tracking-widest uppercase rounded hover:bg-[#e0bc82] transition-colors duration-300">
            {bookLabel}
          </BookButton>
        </div>

        <button
          className="md:hidden text-white/80 hover:text-[#c9a96e] transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-[#0f0d0b]/98 border-t border-white/10 px-6 py-6 flex flex-col gap-5">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-white/70 hover:text-[#c9a96e] text-sm tracking-widest uppercase transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <BookButton
            className="mt-2 px-5 py-3 bg-[#c9a96e] text-[#0f0d0b] text-sm font-bold tracking-widest uppercase rounded text-center hover:bg-[#e0bc82] transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {bookLabel}
          </BookButton>
        </div>
      )}
    </nav>
  );
}

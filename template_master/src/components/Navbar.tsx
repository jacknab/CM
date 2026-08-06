import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { useSite } from '../context/SiteContext';
import { useBookingPanel } from '../context/BookingPanelContext';

function categoryLabel(cat?: string): string {
  const map: Record<string, string> = {
    nail_salon: 'Nail Salon & Spa',
    barbershop: 'Barbershop',
    hair_salon: 'Hair Salon & Spa',
  };
  return (cat && map[cat]) ? map[cat] : 'Nail Salon & Spa';
}

export default function Navbar() {
  const site = useSite();
  const business = site?.business;
  const { open: openBooking } = useBookingPanel();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const businessName = business?.name ?? 'Lumière';
  const subLabel = categoryLabel(business?.category);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = ['Services', 'Gallery', 'Reviews', 'Contact'];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-charcoal-900/95 backdrop-blur-md shadow-2xl py-3' : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <a href="#" className="flex flex-col leading-none">
          <span className="font-serif text-2xl font-light tracking-[0.15em] text-white">
            {businessName}
          </span>
          <span className="font-sans text-[9px] font-medium tracking-[0.4em] uppercase text-gold-400 mt-0.5">
            {subLabel}
          </span>
        </a>

        <ul className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <li key={link}>
              <a
                href={`#${link.toLowerCase()}`}
                className="font-sans text-xs font-medium tracking-[0.2em] uppercase text-white/80 hover:text-gold-400 transition-colors duration-300"
              >
                {link}
              </a>
            </li>
          ))}
        </ul>

        <button
          onClick={openBooking}
          className="hidden md:inline-flex items-center gap-2 bg-gold-400 hover:bg-gold-500 text-charcoal-900 font-sans text-xs font-bold tracking-[0.2em] uppercase px-6 py-3 transition-all duration-300 hover:shadow-lg hover:shadow-gold-400/30"
        >
          Book Now
        </button>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-white p-2"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-charcoal-900/98 backdrop-blur-md border-t border-white/10">
          <ul className="flex flex-col py-4">
            {links.map((link) => (
              <li key={link}>
                <a
                  href={`#${link.toLowerCase()}`}
                  onClick={() => setMenuOpen(false)}
                  className="block px-6 py-3 font-sans text-xs font-medium tracking-[0.2em] uppercase text-white/80 hover:text-gold-400 transition-colors"
                >
                  {link}
                </a>
              </li>
            ))}
            <li className="px-6 pt-3">
              <button
                onClick={() => { setMenuOpen(false); openBooking(); }}
                className="w-full text-center bg-gold-400 text-charcoal-900 font-sans text-xs font-bold tracking-[0.2em] uppercase px-6 py-3 hover:bg-gold-500 transition-colors"
              >
                Book Now
              </button>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { Menu, X } from 'lucide-react';

const navLinks: { label: string; href: string; highlight?: boolean }[] = [
  { label: 'Features', href: '/features' },
  { label: 'Booking', href: '/booking' },
  { label: 'Autumn AI', href: '/autumn', highlight: true },
  { label: 'Hardware', href: '/products' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact', href: '/contact' },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header
      style={{ background: 'hsl(var(--surface-header))' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-300 ${
        scrolled ? 'shadow-sm' : ''
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="shrink-0 flex items-center">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Certxa"
            width={679}
            height={144}
            className="block h-7 w-auto"
          />
        </Link>

        {/* Desktop Nav */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            link.highlight ? (
              <Link
                key={link.href}
                to={link.href}
                className="relative text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-200 flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.href}
                to={link.href}
                className="relative text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 group"
              >
                {link.label}
                <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full" />
              </Link>
            )
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href="/auth"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </a>
          <Link
            to="/contact"
            className="text-sm font-semibold px-5 py-2.5 rounded-lg bg-primary text-primary-foreground transition-all duration-200 hover:opacity-90 hover:-translate-y-px"
          >
            Get started
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div
          style={{ background: 'hsl(var(--surface-header))' }}
          className="md:hidden border-t border-border px-6 py-6 flex flex-col gap-5"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/contact"
            className="mt-2 text-center text-sm font-semibold px-5 py-3 rounded-lg bg-primary text-primary-foreground"
          >
            Get started
          </Link>
        </div>
      )}
    </header>
  );
}

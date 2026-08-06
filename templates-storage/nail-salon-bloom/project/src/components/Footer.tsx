import { Instagram, Facebook } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

const NAV_LINKS = [
  { label: 'Services', href: '#services' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Visit Us', href: '#visit' },
];

export default function Footer() {
  const { salonName } = useSite();
  const year = new Date().getFullYear();

  return (
    <footer
      className="bg-ink-900 pb-safe text-ink-400"
      role="contentinfo"
    >
      <div className="container-prose py-10 sm:py-12">
        <div className="flex flex-col items-center gap-6 text-center sm:gap-8">
          {/* Brand */}
          <div>
            <p className="font-serif text-xl font-semibold text-white">{salonName}</p>
            <p className="mt-1 text-sm text-ink-500">Nail Studio</p>
          </div>

          {/* Nav links */}
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2" role="list">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-ink-400 transition-colors hover:text-white focus:outline-none focus:text-white"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Social */}
          <div className="flex gap-3" aria-label="Social media links">
            {[
              { Icon: Instagram, label: 'Instagram', href: '#' },
              { Icon: Facebook, label: 'Facebook', href: '#' },
            ].map(({ Icon, label, href }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="grid h-10 w-10 place-items-center rounded-full bg-ink-800 text-ink-400 transition-all hover:bg-gold-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-2 focus:ring-offset-ink-900"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </a>
            ))}
          </div>

          {/* Divider */}
          <div className="w-full border-t border-ink-800" />

          {/* Copyright + powered by */}
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between sm:gap-0 w-full">
            <p className="text-xs text-ink-500">
              &copy; {year} {salonName}. All rights reserved.
            </p>
            <p className="text-xs text-ink-500">
              Powered by{' '}
              <span className="font-semibold text-white">Certxa</span>
              <span className="font-bold text-gold-500">.</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

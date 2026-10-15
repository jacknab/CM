import { Link } from 'react-router';
import BrandWordmark from '@/components/BrandWordmark';

// href: null = page not yet built; renders as non-interactive label
const footerLinks: Record<string, { label: string; href: string | null }[]> = {
  Product: [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Vietnamese Nail Salons', href: '/vietnamese-nail-salon-software' },
    { label: 'Phần mềm tiệm nail', href: '/vi/phan-mem-tiem-nail' },
    { label: 'Changelog', href: '/changelog' },
    { label: 'Roadmap', href: '/roadmap' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

export default function Footer() {
  return (
    <footer style={{ background: 'hsl(var(--surface-footer))' }} className="text-gray-400">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-16">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-8">
          {/* Brand column */}
          <div className="md:col-span-2 flex flex-col gap-5">
            <Link to="/" className="inline-block">
              <BrandWordmark dark />
            </Link>
            <p className="text-sm leading-relaxed text-gray-500 max-w-xs">
              The all-in-one platform built for modern salons. Bookings, payments, clients — all in one place.
            </p>
            <p className="text-xs text-gray-600 mt-auto">
              © {new Date().getFullYear()} Certxa. All rights reserved.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group} className="flex flex-col gap-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                {group}
              </h3>
              <ul className="flex flex-col gap-3">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <Link
                        to={link.href}
                        className="text-sm text-gray-400 hover:text-white transition-colors duration-200"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-600 cursor-default select-none">
                        {link.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

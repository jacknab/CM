import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Building2, Menu, X } from "lucide-react";

// The public marketing site for Certxa Rentals, served at rentals.certxa.com.
// Deliberately visually distinct from Salon's marketing site (php/) and from
// the authenticated Rentals dashboard's utilitarian chrome — but built on the
// SAME brand palette as the dashboard (graphite + amber, Outfit/Inter) so the
// marketing site and the product it's selling feel like the same thing.
// See rentalsMarketing/README notes in the Phase 7 report for why this is a
// separate tree from pages/rentals/ (the actual app).

const NAV_LINKS = [
  { label: "Features", to: "/features" },
  { label: "How It Works", to: "/how-it-works" },
  { label: "Pricing", to: "/pricing" },
  { label: "Resources", to: "/resources" },
];

export function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    let el = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      el.name = "description";
      document.head.appendChild(el);
    }
    el.content = description;
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `https://rentals.certxa.com${window.location.pathname === "/" ? "" : window.location.pathname}`;
  }, [title, description]);
}

export default function RentalsMarketingLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <a href="#rentals-main" className="fixed left-4 top-3 z-[60] -translate-y-20 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition focus:translate-y-0">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-950 text-amber-400">
              <Building2 size={16} />
            </div>
            <span className="font-[Outfit] text-[15px] font-semibold text-neutral-900">Certxa Rentals</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-[13.5px] font-medium transition ${
                  location.pathname === link.to ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link to="/login" className="text-[13.5px] font-medium text-neutral-600 hover:text-neutral-900">
              Sign In
            </Link>
            <Link
              to="/signup"
              className="rounded-md bg-neutral-900 px-4 py-2 text-[13.5px] font-medium text-white transition hover:bg-neutral-800"
            >
              Get Started
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 text-neutral-600 md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-neutral-100 bg-white px-5 py-4 md:hidden">
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="rounded-md px-2 py-2.5 text-[14px] font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-neutral-100 pt-3">
                <Link to="/login" className="rounded-md px-2 py-2.5 text-[14px] font-medium text-neutral-700 hover:bg-neutral-50">
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="rounded-md bg-neutral-900 px-3 py-2.5 text-center text-[14px] font-medium text-white"
                >
                  Get Started
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="rentals-main">{children}</main>

      <RentalsMarketingFooter />
    </div>
  );
}

function RentalsMarketingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-6">
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-950 text-amber-400">
                <Building2 size={14} />
              </div>
              <span className="font-[Outfit] text-[14px] font-semibold text-neutral-900">Certxa Rentals</span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-neutral-500">
              Software for facility owners who rent suites, booths, and treatment rooms to independent beauty
              professionals.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: "Features", to: "/features" },
              { label: "Pricing", to: "/pricing" },
              { label: "How It Works", to: "/how-it-works" },
            ]}
          />
          <FooterColumn
            title="Resources"
            links={[
              { label: "Resources", to: "/resources" },
              { label: "FAQ", to: "/faq" },
              { label: "Help", href: "https://certxa.com/help" },
              { label: "Contact", href: "https://certxa.com/contact" },
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              { label: "About Certxa", href: "https://certxa.com/about" },
              { label: "Privacy", href: "https://certxa.com/privacy" },
              { label: "Terms", href: "https://certxa.com/terms" },
            ]}
          />
          <FooterColumn
            title="Account"
            links={[
              { label: "Sign In", to: "/login" },
              { label: "Get Started", to: "/signup" },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-neutral-200 pt-6 text-[12px] text-neutral-400 md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Certxa. All rights reserved.</span>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-neutral-600">Sign In</Link>
            <Link to="/signup" className="hover:text-neutral-600">Get Started</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; to?: string; href?: string }[];
}) {
  return (
    <div>
      <p className="font-[Outfit] text-[12px] font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            {link.to ? (
              <Link to={link.to} className="text-[13px] text-neutral-600 hover:text-neutral-900">
                {link.label}
              </Link>
            ) : (
              <a href={link.href} className="text-[13px] text-neutral-600 hover:text-neutral-900">
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

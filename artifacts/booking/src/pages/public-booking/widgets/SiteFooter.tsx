/**
 * The website footer (owner, 2026-11-11): name, links, social, balances, legal. Moved
 * unchanged from SoloTheme.tsx.
 */
import { Facebook, Instagram } from "lucide-react";
import { facebookUrl, instagramUrl } from "../SiteLook";
import { C } from "./shared";
import { useSite } from "./useSoloSite";

/** The footer. */
export function SiteFooter() {
  const { store, services, portfolioLink, shop, shopLinks, bookingOff, barShown, salonName, bookNow } = useSite();
  return (
    <>
      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="mt-auto" style={{ background: C.ink900, color: C.ink400, paddingBottom: barShown ? 76 : 0 }} role="contentinfo">
        <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-12 lg:px-12">
          <div className="flex flex-col items-center gap-6 text-center sm:gap-8">
            {/* Brand */}
            <div>
              <p
                className="text-xl font-semibold text-white"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {salonName}
              </p>
              <p className="mt-1 text-sm" style={{ color: C.ink500 }}>{store.byLabel || store.category || "Beauty Professional"}</p>
            </div>

            {/* Nav links */}
            <nav aria-label="Footer navigation">
              <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                {[
                  { label: "About", href: "#about" },
                  { label: "Services", href: "#services" },
                  ...portfolioLink,
                  { label: "Contact", href: "#message" },
                  ...shopLinks,
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm transition-colors hover:text-white focus:text-white focus:outline-none"
                      style={{ color: C.ink400 }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                {!bookingOff && (
                <li>
                  <button
                    type="button"
                    onClick={bookNow}
                    className="text-sm font-semibold transition-colors focus:outline-none"
                    style={{ color: "#FCD34D" }}
                  >
                    Book Now
                  </button>
                </li>
                )}
              </ul>
            </nav>

            {/* Social */}
            <div className="flex gap-3" aria-label="Social media links">
              {[
                { Icon: Instagram, label: "Instagram", href: instagramUrl(store.bookingSite) },
                { Icon: Facebook,  label: "Facebook",  href: facebookUrl(store.bookingSite) },
              ].filter((x) => x.href).map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid h-10 w-10 place-items-center rounded-full transition-all focus:outline-none"
                  style={{ background: C.ink800, color: C.ink400 }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>

            <div className="w-full border-t" style={{ borderColor: C.ink800 }} />

            {/* Balance checks (owner, 2026-11-09; SiteBalance.tsx): shown when the business sells them on this site. */}
            {shop?.giftCards || shop?.packages?.length ? (
              <nav aria-label="Gift cards and packages" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
                {shop?.giftCards ? <a href="#gift-card-balance" data-testid="footer-gift-balance" className="underline" style={{ color: C.ink400 }}>Gift card balance</a> : null}
                {shop?.packages?.length ? <a href="#package-visits" data-testid="footer-package-visits" className="underline" style={{ color: C.ink400 }}>Package visits left</a> : null}
              </nav>
            ) : null}

            {/* Terms and Privacy (SiteLegal.tsx). */}
            <nav aria-label="Legal" className="flex gap-5 text-xs">
              <a href="#terms" className="underline" style={{ color: C.ink400 }}>Terms of Service</a>
              <a href="#privacy" className="underline" style={{ color: C.ink400 }}>Privacy Policy</a>
            </nav>

            {/* Copyright */}
            <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-between sm:gap-0">
              <p className="text-xs" style={{ color: C.ink500 }}>
                &copy; {new Date().getFullYear()} {salonName}. All rights reserved.
              </p>
              <p className="text-xs" style={{ color: C.ink500 }}>
                Powered by{" "}
                <span className="font-semibold text-white">Certxa</span>
                <span className="font-bold" style={{ color: "#FCD34D" }}>.</span>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

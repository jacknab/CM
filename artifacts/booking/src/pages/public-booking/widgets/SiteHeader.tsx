/**
 * The website header (owner, 2026-11-11; plans/ai-site-widgets.md): name, cart, Book Now and the phone menu. Moved
 * unchanged from SoloTheme.tsx.
 */
import { ArrowRight, Menu, ShoppingCart, Phone, X } from "lucide-react";
import { C } from "./shared";
import { useSite } from "./useSoloSite";

/** The fixed header with the mobile menu. */
export function SiteHeader() {
  const { store, services, portfolioLink, shopLinks, bookingOff, scrolled, menuOpen, setMenuOpen, cart, setCartOpen, cartCount, salonName, phoneHref, phoneLabel, bookNow } = useSite();
  return (
    <>
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header
        className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.90)",
          boxShadow: scrolled ? "0 1px 8px rgba(0,0,0,0.08)" : "none",
          backdropFilter: "blur(8px)",
        }}
      >
        <nav
          className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:h-16 sm:px-8 lg:h-[72px] lg:px-10"
          aria-label="Primary navigation"
        >
          <div className="flex min-w-0 items-center gap-1.5 lg:gap-6">
            {/* Menu, on the left */}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-gray-100 lg:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen
                ? <X className="h-5 w-5" style={{ color: C.ink800 }} />
                : <Menu className="h-5 w-5" style={{ color: C.ink800 }} />}
            </button>
            {/* Salon name, and the page links on large screens */}
            <a
              href="#top"
              className="min-w-0 text-xl font-semibold sm:text-2xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }}
              aria-label={`${salonName} — home`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {store.bookingSite?.logoImage ? <img src={store.bookingSite.logoImage} alt="" className="h-9 w-9 rounded-full object-cover" /> : null}
                <span className="truncate">{salonName}</span>
              </span>
            </a>
            <div className="hidden shrink-0 items-center gap-6 lg:flex">
              {[
                ...shopLinks,
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-semibold tracking-wide transition-colors hover:opacity-80"
                  style={{ color: C.ink700 }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-1 sm:gap-3">
            {store.phone && (
              <a
                href={phoneHref}
                className="hidden items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold lg:inline-flex"
                style={{ borderColor: C.cream300, color: C.ink700 }}
                aria-label={`Call ${store.phone}`}
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {phoneLabel}
              </a>
            )}
            {!bookingOff && (<>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setCartOpen(true); }}
              data-testid="solo-header-cart"
              aria-label={`Your booking, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
              className="relative grid h-9 w-9 place-items-center rounded-lg"
            >
              <ShoppingCart className="h-5 w-5" style={{ color: C.ink800 }} aria-hidden="true" />
              {cartCount > 0 && <span data-testid="solo-cart-count" className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: C.gold700 }}>{cartCount}</span>}
            </button>

            {/* Book Now, far right on every screen */}
            <button
              type="button"
              onClick={bookNow}
              data-testid="solo-header-book"
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
              style={{ background: C.gold700 }}
              aria-label="Book an appointment"
            >
              Book Now
              <ArrowRight className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
            </button>
            </>)}
            {bookingOff && store.phone && (
              <a
                href={phoneHref}
                data-testid="solo-header-call"
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm lg:hidden"
                style={{ background: C.gold700 }}
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                Call
              </a>
            )}
          </div>
        </nav>

        {/* Mobile drawer */}
        {menuOpen && (
          <div
            className="fixed inset-0 top-14 z-40 sm:top-16"
            onClick={() => setMenuOpen(false)}
          >
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" aria-hidden="true" />
            <nav
              className="relative border-t bg-white shadow-xl"
              style={{ borderColor: C.cream200 }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Mobile navigation"
            >
              <ul className="flex flex-col gap-1 px-5 py-4" style={{ maxHeight: "calc(100vh - 3.5rem)", overflowY: "auto" }}>
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
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-xl px-4 py-3.5 text-lg font-medium transition-colors hover:bg-gray-50"
                      style={{ color: C.ink800 }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                {store.phone && (
                  <li className="mt-2 px-4">
                    <a
                      href={phoneHref}
                      className="flex items-center gap-2 py-2 text-base font-medium"
                      style={{ color: C.ink600 }}
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {phoneLabel}
                    </a>
                  </li>
                )}
              </ul>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}

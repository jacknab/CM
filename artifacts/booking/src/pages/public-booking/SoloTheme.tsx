/**
 * SoloTheme — the "Solo" website for Certxa Pro app accounts (owner, 2026-11-04): a copy of Bloom (BloomTheme.tsx), made
 * its own so it can be shaped for one independent pro without changing Bloom for full-platform salons. Picked in the
 * app's "Pick a design" step; every Certxa Pro account on Bloom was moved to it (migration 0304).
 *
 * Since 2026-11-11 (plans/ai-site-widgets.md) it is a layout of the website widgets in ./widgets — Solo's fixed order:
 *   Header → tabs (About · Services · [Portfolio] · Contact) → Visit us → Footer
 *   One tab shows at a time, so the page is not one long scroll (owner, 2026-11-04). The tab is in the address
 *   (#about, #services, #portfolio), so the menu links, the footer links and shared links open the right one.
 *   About holds the rating, the pro's about text, the team, business hours, cancellation policy, contact and reviews.
 * The widgets read the site's state from useSoloSite (widgets/useSoloSite.tsx).
 */
import { siteStyle } from "./SiteLook";
import { PreparedNotice } from "./PreparedNotice";
import { C, SOLO_TABS, VisitUs, type BloomThemeProps } from "./widgets/shared";
import { SoloSiteContext, useSoloSite } from "./widgets/useSoloSite";
import { SiteOverlays } from "./widgets/SiteOverlays";
import { SiteHeader } from "./widgets/SiteHeader";
import { ServicesWidget } from "./widgets/ServicesWidget";
import { PortfolioWidget } from "./widgets/PortfolioWidget";
import { AboutIntro, TeamWidget, HoursWidget, PolicyWidget, ContactWidget, ReviewsWidget } from "./widgets/AboutWidgets";
import { BookingBar } from "./widgets/BookingBar";
import { SiteFooter } from "./widgets/SiteFooter";

export default function SoloTheme(props: BloomThemeProps) {
  const site = useSoloSite(props);
  const { store, gallery, tab, tabsTop, pickTab, salonName, city, phoneHref, phoneLabel, hours } = site;
  return (
    <SoloSiteContext.Provider value={site}>
    <div className="flex min-h-screen flex-col" style={{ ...siteStyle(store.bookingSite), background: C.cream50, color: C.ink900 }}>
      <SiteOverlays />
      <SiteHeader />

      {/* The site opens on the tabs (owner, 2026-11-04: phones first, no hero). This keeps them clear of the fixed header;
          on phones the body's own 56px top padding (index.css) already does. */}
      <div id="top" className="sm:h-2 md:h-16 lg:h-[72px]" aria-hidden="true" />
      <h1 className="sr-only">{store.byLabel || salonName}{store.city ? ` in ${store.city}` : ""}</h1>
      {/* A page Certxa prepared that its owner hasn't claimed yet: how to claim it (PreparedNotice.tsx). */}
      <PreparedNotice store={store} />

      {/* ── TABS: stay under the header while scrolling ──────────────────── */}
      <div ref={tabsTop} aria-hidden="true" />
      <div className="sticky top-14 z-40 border-b bg-white sm:top-16 lg:top-[72px]" style={{ borderColor: "#eee7e1" }}>
        <div role="tablist" aria-label={`${salonName} sections`} className="mx-auto flex w-full max-w-3xl">
          {SOLO_TABS.filter((t) => t.id !== "portfolio" || gallery.length > 0).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={t.id}
              onClick={() => pickTab(t.id)}
              data-testid={`solo-tab-${t.id}`}
              className="flex-1 px-3 py-3.5 text-sm font-semibold transition-colors sm:text-base"
              style={{ color: tab === t.id ? C.gold700 : C.ink600, borderBottom: `2px solid ${tab === t.id ? C.gold700 : "transparent"}`, marginBottom: -1 }}
            >
              {t.label}
            </button>
          ))}
          {/* Contact, right after Portfolio (owner, 2026-11-07): opens the message page (SiteMessage.tsx), not a tab. */}
          <button
            type="button"
            onClick={() => { window.location.hash = "message"; }}
            data-testid="solo-tab-contact"
            className="flex-1 px-3 py-3.5 text-sm font-semibold transition-colors sm:text-base"
            style={{ color: C.ink600, borderBottom: "2px solid transparent", marginBottom: -1 }}
          >
            Contact
          </button>
        </div>
      </div>

      <ServicesWidget hidden={tab !== "services"} />
      <PortfolioWidget hidden={tab !== "portfolio"} />

      {/* ── ABOUT: rating, the pro's own words, hours, policy, contact and reviews ─────────────── */}
      <section
        id="about"
        hidden={tab !== "about"}
        aria-labelledby="about-heading"
        className="bg-white py-10 sm:py-14"
        itemScope
        itemType="https://schema.org/LocalBusiness"
      >
        <div className="mx-auto w-full max-w-2xl px-5 text-center sm:px-8">
          <AboutIntro />
          <TeamWidget />
          <HoursWidget />
          <PolicyWidget />
          <ContactWidget />
          <ReviewsWidget />
        </div>
      </section>

      <BookingBar />

      {/* ── VISIT US (copied from the Lacquer template, owner 2026-11-07) ──── */}
      <VisitUs store={store} phoneHref={phoneHref} phoneLabel={phoneLabel} hours={hours} />

      <SiteFooter />
    </div>
    </SoloSiteContext.Provider>
  );
}

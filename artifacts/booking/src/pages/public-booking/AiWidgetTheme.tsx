/**
 * An AI-designed website on the widgets (owner, 2026-11-11; plans/ai-site-widgets.md, step 3). The AI lays the site out
 * — one page or tabs, which widgets go on each page in what order and with which look, and its own words between them —
 * and the widgets are the Solo website's real parts (./widgets): the services with add-on groups, the portfolio,
 * reviews, team, hours, policy and contact, the booking panel, cart and shop. They read their own data, so prices,
 * hours, photos and bookings are always Certxa's. The design's palette and heading font colour every widget (CSS
 * variables behind widgets/shared.tsx C and HEADING_FONT). Old designs arrive already as pages (server upgradeSpec).
 */
import { useMemo } from "react";
import { siteStyle } from "./SiteLook";
import { PreparedNotice } from "./PreparedNotice";
import { AiBlocks, aiFontStack, useSiteFonts, type AiFacts, type AiSpec } from "./AiSiteTheme";
import { C, VisitUs, type BloomThemeProps } from "./widgets/shared";
import { SoloSiteContext, useSoloSite, type SitePage } from "./widgets/useSoloSite";
import { SiteOverlays } from "./widgets/SiteOverlays";
import { SiteHeader } from "./widgets/SiteHeader";
import { ServicesWidget } from "./widgets/ServicesWidget";
import { PortfolioWidget } from "./widgets/PortfolioWidget";
import { AboutIntro, TeamWidget, HoursWidget, PolicyWidget, ContactWidget, ReviewsWidget } from "./widgets/AboutWidgets";
import { BookingBar } from "./widgets/BookingBar";
import { SiteFooter } from "./widgets/SiteFooter";

type WidgetSection = { widget: string; look?: string };
type WordsBlock = { type: string; [k: string]: any };
type Section = WidgetSection | WordsBlock;
export type AiPage = { id: string; title: string; sections: Section[] };
export type AiPagesSpec = AiSpec & { layout?: "tabs" | "one-page"; pages?: AiPage[] };
const isWidget = (x: Section): x is WidgetSection => "widget" in x;

/** The design's palette and heading font as the CSS variables behind every widget colour (Solo's when unset). */
function designVars(spec: AiSpec): Record<string, string> {
  const p = spec.theme.palette;
  return {
    "--site-accent": p.accent, "--ai-heading-font": aiFontStack(spec.theme.fonts.heading),
    "--ai-section": p.background, "--ai-section-alt": p.surface,
    "--ai-cream50": p.background, "--ai-cream100": p.surface, "--ai-cream200": `${p.muted}40`, "--ai-cream300": `${p.muted}66`,
    "--ai-gold50": p.surface, "--ai-rose50": p.surface, "--ai-rose100": p.surface,
    "--ai-ink900": p.text, "--ai-ink800": p.text, "--ai-ink700": p.text, "--ai-ink600": p.muted, "--ai-ink500": p.muted, "--ai-ink400": p.muted,
  };
}

export default function AiWidgetTheme({ ai, ...props }: BloomThemeProps & { ai: { spec: AiPagesSpec; facts: AiFacts; preview?: boolean } }) {
  useSiteFonts(ai.spec);
  const pages = ai.spec.pages ?? [];
  const sitePages = useMemo<SitePage[]>(
    () => pages.map((p) => ({ id: p.id, title: p.title, widgets: p.sections.filter(isWidget).map((w) => w.widget) })),
    [ai.spec],
  );
  const site = useSoloSite(props, "solo", sitePages);
  const { store, salonName, tab, pickTab, tabsTop, gallery, bookNow, phoneHref, phoneLabel, hours, teamShown, cancelPolicyText, reviews } = site;
  // A page whose only part is the portfolio, once the photos are gone, is left out.
  const shown = pages.filter((p) => !(p.sections.every((x) => isWidget(x) && x.widget === "portfolio") && gallery.length === 0));
  const tabs = ai.spec.layout !== "one-page" && shown.length > 1;

  /**
   * A page's sections in order. Words next to each other share one block list (as AiBlocks draws them); the about
   * widgets next to each other (intro, team, hours, policy, contact card, reviews) share one column, as on Solo's About.
   */
  const ABOUT = new Set(["intro", "team", "hours", "policy", "contact", "reviews"]);
  const aboutPart = (w: WidgetSection) => {
    switch (w.widget) {
      case "intro": return <AboutIntro />;
      case "team": return <TeamWidget />;
      case "hours": return <HoursWidget />;
      case "policy": return <PolicyWidget />;
      case "contact": return <ContactWidget />;
      case "reviews": return <ReviewsWidget look={w.look} />;
      default: return null;
    }
  };
  const sections = (page: AiPage) => {
    const out: React.ReactNode[] = [];
    let words: WordsBlock[] = [];
    let about: WidgetSection[] = [];
    const flush = (key: string) => {
      if (words.length) {
        out.push(
          <section key={`${key}-w`} className="py-6 sm:py-10" style={{ background: "var(--ai-section, #ffffff)" }}>
            <div className="mx-auto w-full max-w-5xl px-4 text-left"><AiBlocks spec={{ ...ai.spec, home: words }} facts={ai.facts} onBook={bookNow} /></div>
          </section>,
        );
        words = [];
      }
      if (about.length) {
        const wide = about.some((w) => w.widget === "reviews" && w.look === "cards");
        out.push(
          <section key={`${key}-a`} className="py-8 sm:py-12" style={{ background: "var(--ai-section, #ffffff)" }}>
            <div className={`ai-about mx-auto w-full ${wide ? "max-w-5xl" : "max-w-2xl"} px-5 text-center sm:px-8`}>
              {about.map((w) => <div key={w.widget}>{aboutPart(w)}</div>)}
            </div>
          </section>,
        );
        about = [];
      }
    };
    page.sections.forEach((x, i) => {
      if (!isWidget(x)) { if (about.length) flush(`s${i}`); words.push(x); return; }
      if (ABOUT.has(x.widget) && !(x.widget === "contact" && x.look === "map")) {
        // Nothing to show (one professional, no hours, no policy, no reviews yet): left out, so the column starts clean.
        const empty = (x.widget === "team" && !teamShown) || (x.widget === "hours" && !hours.length)
          || (x.widget === "policy" && !cancelPolicyText) || (x.widget === "reviews" && !reviews.length);
        if (!empty) { if (words.length) flush(`s${i}`); about.push(x); }
        return;
      }
      flush(`s${i}`);
      if (x.widget === "services") out.push(<ServicesWidget key={`s${i}`} look={x.look} />);
      else if (x.widget === "portfolio") out.push(<PortfolioWidget key={`s${i}`} look={x.look} />);
      else if (x.widget === "contact") out.push(<VisitUs key={`s${i}`} store={store} phoneHref={phoneHref} phoneLabel={phoneLabel} hours={hours} />);
    });
    flush("end");
    return out;
  };

  return (
    <SoloSiteContext.Provider value={site}>
      <div className="flex min-h-screen flex-col" style={{ ...siteStyle(store.bookingSite), ...designVars(ai.spec), background: C.cream50, color: C.ink900 }} data-testid="ai-widget-site">
        <SiteOverlays />
        <SiteHeader />
        {ai.preview ? (
          <div className="fixed bottom-24 left-4 z-[70] rounded-full px-4 py-2 text-sm font-semibold shadow-lg" style={{ background: "#1C1650", color: "#FFFFFF" }} data-testid="ai-preview-banner">
            Preview · only you can see this
          </div>
        ) : null}

        {/* Clear of the fixed header (as Solo); on phones the body's own top padding does it. */}
        <div id="top" className="sm:h-2 md:h-16 lg:h-[72px]" aria-hidden="true" />
        <h1 className="sr-only">{store.byLabel || salonName}{store.city ? ` in ${store.city}` : ""}</h1>
        <PreparedNotice store={store} />

        <div ref={tabsTop} aria-hidden="true" />
        {tabs && (
          <div className="sticky top-14 z-40 border-b sm:top-16 lg:top-[72px]" style={{ borderColor: C.cream200, background: "var(--ai-section, #ffffff)" }}>
            <div role="tablist" aria-label={`${salonName} pages`} className="mx-auto flex w-full max-w-3xl overflow-x-auto">
              {shown.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  id={`tab-${p.id}`}
                  aria-selected={tab === p.id}
                  aria-controls={`page-${p.id}`}
                  onClick={() => pickTab(p.id)}
                  data-testid={`ai-tab-${p.id}`}
                  className="flex-1 whitespace-nowrap px-3 py-3.5 text-sm font-semibold transition-colors sm:text-base"
                  style={{ color: tab === p.id ? C.gold700 : C.ink600, borderBottom: `2px solid ${tab === p.id ? C.gold700 : "transparent"}`, marginBottom: -1 }}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {shown.map((p) => (
          <div key={p.id} id={`page-${p.id}`} role={tabs ? "tabpanel" : undefined} hidden={tabs && tab !== p.id} data-testid={`ai-page-${p.id}`}>
            {sections(p)}
          </div>
        ))}

        <BookingBar />
        <SiteFooter />
        {/* The about parts' rule above each one (Solo's), except the first in a column. */}
        <style>{`.ai-about > div:first-child > div:first-child { margin-top: 0; border-top: 0; padding-top: 0; }`}</style>
      </div>
    </SoloSiteContext.Provider>
  );
}

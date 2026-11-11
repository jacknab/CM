/**
 * Services widget (owner, 2026-11-11; plans/ai-site-widgets.md): categories, service cards, add-on groups and the
 * category pages. Moved unchanged from SoloTheme.tsx.
 */
import { Loader2 } from "lucide-react";
import { C, CheckDot, QtyStepper, TINT, formatPrice, proPrice, HEADING_FONT } from "./shared";
import { useSite } from "./useSoloSite";

/** The services, with their add-on groups; tapping chooses them for booking. */
/** look "cards" (Solo: two columns on a computer) or "list" (one column), for an AI design (AiWidgetTheme.tsx). */
export function ServicesWidget({ hidden, look = "cards" }: { hidden?: boolean; look?: string }) {
  const { store, services, servicesLoading, team, staffChoice, priced, bookingOff, activeCategory, setActiveCategory, cart, cartAddons, expandedId, addons, addonsFor, chosenFor, qtyOf, shownPrice, fromPrice, setAddonQty, setServiceQuantity, tapService, toggleAddon, photoLightbox, setPhotoLightbox, servicesBusy, setServicesTry, servicePages, whereLabel, categories, filteredServices } = useSite();
  return (
    <>
      {/* ── SERVICES ──────────────────────────────────────────────────────── */}
      <section
        id="services"
        hidden={hidden}
        aria-labelledby="services-heading"
        className="px-4 py-10 sm:px-6 sm:py-14"
        style={{ background: "var(--ai-section-alt, #f4ede8)" }}
      >
        <div className={`mx-auto w-full ${look === "list" ? "max-w-3xl" : "max-w-7xl"}`}>
          <div className="mb-5">
            <h2
              id="services-heading"
              className="text-[28px] font-bold leading-tight"
              style={{ fontFamily: HEADING_FONT, color: C.ink900 }}
            >
              Services
            </h2>
            {!bookingOff && (
              <p className="mt-1 text-[14px]" style={{ color: C.ink600 }}>
                Pick up to two services, then choose your time.
              </p>
            )}
          </div>

          {/* Categories: one row that scrolls sideways */}
          {categories.length > 1 && (
            <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" role="group" aria-label="Filter by category" data-testid="solo-categories">
              {categories.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    aria-pressed={isActive}
                    className="shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold"
                    style={{ borderColor: isActive ? C.gold700 : C.cream300, background: isActive ? C.gold700 : "#fff", color: isActive ? "#fff" : C.ink700 }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}

          {/* Service cards */}
        {servicesBusy === "failed" ? (
          <div className="py-12 text-center" role="status" data-testid="solo-services-busy">
            <p className="text-[15px] font-semibold" style={{ color: C.ink800 }}>We couldn't load the services just now.</p>
            <p className="mt-1 text-[14px]" style={{ color: C.ink600 }}>Lots of people are looking at the moment. Please try again in a minute.</p>
            <button type="button" onClick={() => setServicesTry((n) => n + 1)} className="mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ background: C.gold700 }} data-testid="solo-services-retry">
              Try again
            </button>
          </div>
        ) : servicesLoading ? (
          <div key="services-loading" className="flex flex-col items-center justify-center gap-3 min-h-[70vh] py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.gold700 }} />
            {servicesBusy === "waiting" && (
              <p className="text-center text-[14px]" style={{ color: C.ink600 }} role="status" data-testid="solo-services-waiting">Lots of people are looking right now. Loading the services again in a moment…</p>
            )}
          </div>
        ) : (
          <div className={look === "list" ? "grid grid-cols-1 gap-4" : "bloom-service-grid grid grid-cols-1 gap-4"}>
            {filteredServices.map((svc) => {
              const on = cart.some((x) => x.id === svc.id);
              const open = on && expandedId === svc.id;
              const offers = open ? addonsFor(svc.id) : [];
              const chosen = cartAddons[svc.id] ?? [];
              const photo = typeof svc.imageUrl === "string" && svc.imageUrl.trim() ? svc.imageUrl : null;
              return (
                <article
                  key={svc.id}
                  id={`service-${svc.id}`}
                  className="scroll-mt-28 overflow-hidden rounded-xl bg-white sm:scroll-mt-32"
                  style={{ boxShadow: on ? `0 0 0 2px ${C.gold700}` : "0 1px 2px rgba(0,0,0,0.08)" }}
                >
                  <button
                    type="button"
                    onClick={() => tapService(svc)}
                    disabled={bookingOff}
                    aria-pressed={on}
                    aria-expanded={offers.length > 0}
                    aria-label={`${on ? (open || addonsFor(svc.id).length === 0 ? "Remove" : "Show add-ons for") : "Select"} ${svc.name}`}
                    data-testid={`solo-select-${svc.id}`}
                    className="flex w-full items-start gap-3 p-3.5 text-left"
                  >
                    {photo && <img src={photo} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold leading-snug" style={{ fontFamily: HEADING_FONT, color: C.ink900 }}>{svc.name}</span>
                      {/* No price on a page the salon hasn't claimed: it would be Certxa's guess (server lib/preparedSalon.ts). */}
                      {!store.unclaimedPrepared && <span className="mt-0.5 block text-[14px] font-bold" style={{ color: C.ink800 }}>{fromPrice(svc) ? "from " : ""}{formatPrice(priced ? proPrice(svc, team, staffChoice) : svc.price)}</span>}
                      {whereLabel(svc) && <span className="mt-0.5 block text-[12px] font-semibold" style={{ color: C.ink600 }} data-testid={`solo-where-${svc.id}`}>{whereLabel(svc)}</span>}
                      {svc.description && <span className={`mt-1 block text-[13px] leading-snug ${open ? "" : "line-clamp-2"}`} style={{ color: C.ink600 }}>{svc.description}</span>}
                      {on && !open && chosen.length > 0 && <span className="mt-1 block text-[13px] font-semibold leading-snug" style={{ color: C.ink800 }}>+ {chosenFor(svc.id).map((a) => a.name).join(", ")}</span>}
                    </span>
                    {!bookingOff && <CheckDot on={on} />}
                  </button>
                  {on && svc.allowQuantity && (
                    <div className="flex items-center justify-between px-3.5 pb-3.5">
                      <span className="text-[14px] font-bold" style={{ color: C.ink800 }}>{formatPrice(shownPrice(svc))}</span>
                      <QtyStepper value={qtyOf(svc)} max={svc.maxQuantity ?? 10} name={svc.name} onChange={(n) => setServiceQuantity(svc, n)} />
                    </div>
                  )}
                  {offers.length > 0 && (
                    <div data-testid={`solo-addons-${svc.id}`}>
                      {/* The question stands out: a solid band in the business's colour, edge to edge. */}
                      <p className="px-3.5 py-3 text-center text-[16px] font-bold leading-snug text-white" style={{ background: C.gold700 }}>Would you like to add to your<span className="block">{svc.name}?</span></p>
                      <div className="divide-y divide-gray-100">
                        {offers.map((addon) => {
                          const count = chosen.filter((id) => id === addon.id).length;
                          const added = count > 0;
                          return (
                            <div key={addon.id} style={{ background: added ? TINT : "#fff" }}>
                              <button
                                type="button"
                                onClick={() => toggleAddon(svc.id, addon)}
                                aria-pressed={added}
                                aria-label={`${added ? "Remove" : "Add"} ${addon.name}`}
                                data-testid={`solo-addon-${addon.id}`}
                                className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[14px] font-semibold leading-snug" style={{ color: C.ink900 }}>{addon.name}</span>
                                  {addon.description && <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: C.ink600 }}>{addon.description}</span>}
                                </span>
                                <span className="shrink-0 text-[14px] font-bold" style={{ color: C.ink800 }}>{Number(addon.price) > 0 ? `+${formatPrice(Number(addon.price) * Math.max(1, count))}` : "Included"}</span>
                                <CheckDot on={added} small />
                              </button>
                              {added && addon.allowQuantity && (
                                <div className="flex justify-end px-3.5 pb-3">
                                  <QtyStepper value={count} max={addon.maxQuantity ?? 10} name={addon.name} onChange={(n) => setAddonQty(svc.id, addon, n)} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {services.length > 0 && filteredServices.length === 0 && (
              <p className="col-span-full py-10 text-center text-[14px]" style={{ color: C.ink500 }}>
                No services in this category.
              </p>
            )}
          </div>
        )}

        {servicePages.length > 0 && (
          <nav aria-labelledby="solo-service-pages-heading" className="mt-10 border-t pt-7" style={{ borderColor: C.cream200 }} data-testid="solo-service-pages">
            <h3 id="solo-service-pages-heading" className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Explore by category</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {servicePages.map((page) => (
                <li key={page.url}>
                  <a href={page.url} className="inline-block rounded-lg border bg-white px-4 py-2 text-sm font-semibold" style={{ borderColor: C.cream300, color: C.ink700 }}>
                    {page.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        </div>
      </section>
      <style>{`
        .bloom-service-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 640px) {
          .bloom-service-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 1.5rem;
          }
        }
      `}</style>
      {/* ── SERVICE CARD PHOTO LIGHTBOX ──────────────────────────────────────── */}
      {photoLightbox && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={() => setPhotoLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Client photo full screen"
        >
          <img
            src={photoLightbox}
            alt="Client result photo"
            className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors focus:outline-none"
            style={{ background: "rgba(255,255,255,0.15)" }}
            onClick={() => setPhotoLightbox(null)}
            aria-label="Close photo"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

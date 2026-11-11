/**
 * Pages that open over the website (owner, 2026-11-11): terms and privacy, balance checks,
 * Send a message, the booking panel, the cart and the gift card / package shop. Moved unchanged from SoloTheme.tsx.
 */
import SoloShop from "../SoloShop";
import SiteLegal from "../SiteLegal";
import SiteBalance from "../SiteBalance";
import SiteMessage from "../SiteMessage";
import SiteChat from "../SiteChat";
import { SoloCart } from "../SoloCart";
import { BookingPanel } from "./shared";
import { useSite } from "./useSoloSite";

/** Pages that open over the site: legal, balances, message, booking, cart and shop. */
export function SiteOverlays() {
  const { design, store, slug, preselectedStaffId, shop, knownClient, shopView, closeShop, team, staffChoice, setStaffChoice, bookingOpen, setBookingOpen, cart, setCart, barShown, setCartAddons, cartOpen, setCartOpen, setServiceQty, inVisit, chosenAddons, cartTotal, cartLines, removeService, salonName, phoneHref, phoneLabel, directionsUrl, selectTime, bookNow, finishedBooking } = useSite();
  return (
    <>
      <SiteLegal store={store} />
      <SiteBalance store={store} slug={slug} />
      {/* Send a message (#message): to the pro's inbox in the app (SiteMessage.tsx). */}
      <SiteMessage store={store} slug={slug} />
      {/* Chat with the pro, while they're available for live chat (SiteChat.tsx); above the booking bar when it shows.
          Aspen only: hidden on Solo for now (owner, 2026-11-07). */}
      {design === "aspen" && <SiteChat store={store} slug={slug} raised={barShown} />}
      {/* ── BOOKING PANEL ─────────────────────────────────────────────────── */}
      <BookingPanel
        staffFirst={design === "aspen"}
        knownClient={knownClient}
        isOpen={bookingOpen}
        onClose={() => {
          setBookingOpen(false);
          if (finishedBooking.current) { finishedBooking.current = false; setCart([]); setCartAddons({}); setServiceQty({}); }
        }}
        store={store}
        slug={slug}
        chosen={cart.map(inVisit)}
        chosenAddons={chosenAddons}
        onBooked={() => { finishedBooking.current = true; }}
        preselectedStaffId={preselectedStaffId}
        timezone={store.timezone || "UTC"}
        team={team}
        staffChoice={staffChoice}
        onStaffChoice={setStaffChoice}
      />

      {cartOpen && (
        <SoloCart
          store={store} lines={cartLines} total={cartTotal} directionsUrl={directionsUrl} phoneHref={phoneHref} phoneLabel={phoneLabel}
          onRemoveService={removeService}
          onRemoveAddon={(serviceId, addonId) => setCartAddons((map) => ({ ...map, [serviceId]: (map[serviceId] ?? []).filter((id) => id !== addonId) }))}
          onSelectTime={selectTime}
          onClose={() => setCartOpen(false)}
        />
      )}

      {shop && shopView && (
        <SoloShop slug={slug} shop={shop} view={shopView} businessName={salonName} onClose={closeShop} onBook={() => { closeShop(); bookNow(); }} />
      )}
    </>
  );
}

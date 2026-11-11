/**
 * The bar at the bottom with the chosen services and Select Time (owner, 2026-11-11; plans/ai-site-widgets.md).
 * Moved unchanged from SoloTheme.tsx.
 */
import { ArrowRight } from "lucide-react";
import { C, formatPrice } from "./shared";
import { useSite } from "./useSoloSite";

/** What's chosen, always in reach on the Services tab. */
export function BookingBar() {
  const { tab, cart, barShown, setCartOpen, cartTotal, cartFrom, cartCount, selectTime } = useSite();
  return (
    <>
      {/* ── CHOSEN SERVICES: book them together ──────────────────────────── */}
      {/* What's chosen, always in reach on the Services tab. */}
      {barShown && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]" style={{ borderColor: C.cream200 }} data-testid="solo-cart-bar">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <button type="button" onClick={() => setCartOpen(true)} className="min-w-0 flex-1 text-left" data-testid="solo-bar-summary">
              <span className="block truncate text-sm font-semibold" style={{ color: C.ink900 }}>{cart.length === 0 ? "Choose a service" : `${cartFrom ? "from " : ""}${formatPrice(cartTotal)}`}</span>
              {cart.length > 0 && <span className="block text-xs" style={{ color: C.ink500 }}>{cartCount} {cartCount === 1 ? "item" : "items"} · View</span>}
            </button>
            <button
              type="button"
              onClick={selectTime}
              disabled={cart.length === 0}
              data-testid="solo-cart-book"
              className="flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: C.gold700 }}
            >
              Select Time
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

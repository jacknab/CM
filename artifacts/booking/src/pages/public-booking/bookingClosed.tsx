/**
 * Online booking closed on a business's website (owner, 2026-11-07): "Who can book online" set to Nobody, or the Booking
 * System switched off. Every theme then shows its services without letting them be chosen, hides Book Now, and gives
 * the phone number instead (the server refuses the booking either way — routes.ts availability / appointments).
 */
import type { StoreData } from "./types";

export const bookingClosed = (store: Pick<StoreData, "bookingSystem" | "onlineBookingMode">): boolean =>
  store.bookingSystem === false || store.onlineBookingMode === "off";

export function phoneLabel(phone?: string | null): string {
  const d = String(phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(phone ?? "").trim();
}

/** The line the themes show instead of booking: call to book. */
export function BookingClosedNotice({ store, className = "" }: { store: StoreData; className?: string }) {
  return (
    <div role="status" data-testid="booking-closed" className={`rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm text-gray-700 ${className}`}>
      Online booking isn't available right now.
      {store.phone
        ? <> Please call <a href={`tel:${store.phone}`} className="font-semibold text-gray-900 underline underline-offset-2" data-testid="booking-closed-phone">{phoneLabel(store.phone)}</a> to book.</>
        : " Please contact us to book."}
    </div>
  );
}

/**
 * The cart on the Solo website (owner, 2026-11-04): the header's cart opens this sheet, dropping from the top. It shows
 * who the client is booking with, where and whether they're open, and the services and add-ons chosen so far.
 */
import { useEffect } from "react";
import { MapPin, Phone, X } from "lucide-react";
import type { AddonData, StoreData } from "./types";

export interface CartLine {
  id: number;
  name: string;
  price: number;
  addons: AddonData[];
}

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
};

/** "Open until 6 PM" / "Closed · Opens Tue 9 AM", in the business's own time zone. */
export function openNow(store: StoreData): string | null {
  const hours = (store.businessHours ?? []).filter((h) => !h.isClosed && h.openTime && h.closeTime);
  if (hours.length === 0) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: store.timezone || "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = days.indexOf(get("weekday"));
  const now = `${get("hour")}:${get("minute")}`;
  const today = hours.find((h) => h.dayOfWeek === day);
  if (today && now >= today.openTime.slice(0, 5) && now < today.closeTime.slice(0, 5)) return `Open until ${clock(today.closeTime)}`;
  if (today && now < today.openTime.slice(0, 5)) return `Closed · Opens ${clock(today.openTime)}`;
  for (let i = 1; i <= 7; i++) {
    const next = hours.find((h) => h.dayOfWeek === (day + i) % 7);
    if (next) return `Closed · Opens ${i === 1 ? "tomorrow" : days[(day + i) % 7]} ${clock(next.openTime)}`;
  }
  return null;
}

export function SoloCart({ store, lines, total, directionsUrl, phoneHref, phoneLabel, onRemoveService, onRemoveAddon, onSelectTime, onClose }: {
  store: StoreData;
  lines: CartLine[];
  total: number;
  directionsUrl?: string;
  phoneHref?: string;
  phoneLabel?: string;
  onRemoveService: (id: number) => void;
  onRemoveAddon: (serviceId: number, addonId: number) => void;
  onSelectTime: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cover = store.bookingSite?.coverImage;
  const place = store.address || [store.city, store.state].filter(Boolean).join(", ");
  const status = openNow(store);
  const remove = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={`Remove ${label}`} className="grid h-7 w-7 shrink-0 place-items-center text-gray-500"><X className="h-4 w-4" aria-hidden="true" /></button>
  );
  return (
    <div className="fixed inset-0 z-[90]" data-testid="solo-cart-sheet">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Your booking" className="solo-cart-drop absolute inset-x-0 top-0 mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-b-2xl bg-white text-gray-900 shadow-xl">
        <style>{`.solo-cart-drop{animation:soloCartDrop .22s ease-out}@keyframes soloCartDrop{from{transform:translateY(-100%)}to{transform:translateY(0)}}@media (prefers-reduced-motion:reduce){.solo-cart-drop{animation:none}}`}</style>
        <div className="relative">
          {cover ? <img src={cover} alt="" className="h-36 w-full object-cover" /> : <div className="h-14" />}
          <button type="button" onClick={onClose} aria-label="Close" data-testid="solo-cart-close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <div className="flex items-start justify-between gap-4 px-4 pt-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{store.name}</p>
            {place && <p className="text-[13px] leading-snug text-gray-600">{place}</p>}
            {status && <p className="mt-1 text-xs font-semibold text-gray-700">{status}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            {store.address && directionsUrl && (
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="flex w-14 flex-col items-center gap-1 text-[11px] font-medium text-gray-700">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-gray-300"><MapPin className="h-4 w-4" aria-hidden="true" /></span>Map
              </a>
            )}
            {phoneHref && (
              <a href={phoneHref} aria-label={`Call ${phoneLabel ?? ""}`} className="flex w-14 flex-col items-center gap-1 text-[11px] font-medium text-gray-700">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-gray-300"><Phone className="h-4 w-4" aria-hidden="true" /></span>Call
              </a>
            )}
          </div>
        </div>

        <p className="mx-4 mt-4 rounded-lg bg-gray-100 px-3 py-2 text-[13px] font-bold">Your current booking</p>

        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">Nothing here yet. Tap a service to add it.</p>
        ) : (
          <div className="px-4 pb-4 pt-3">
            <p className="text-[13px] text-gray-500">No time set yet</p>
            <ul className="mt-2 divide-y divide-gray-100">
              {lines.map((line) => (
                <li key={line.id} className="py-2" data-testid={`solo-cart-line-${line.id}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="min-w-0 flex-1">{line.name}</span>
                    <span>{money(line.price)}</span>
                    {remove(line.name, () => onRemoveService(line.id))}
                  </div>
                  {line.addons.map((addon) => (
                    <div key={addon.id} className="flex items-center gap-2 pl-3 text-[13px] text-gray-600">
                      <span className="min-w-0 flex-1">{addon.name}</span>
                      <span>{money(Number(addon.price))}</span>
                      {remove(addon.name, () => onRemoveAddon(line.id, addon.id))}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
            <div className="mt-1 flex items-center justify-between border-t border-gray-300 pt-2 pr-9 text-sm font-bold">
              <span>Total</span>
              <span data-testid="solo-cart-total">{money(total)}</span>
            </div>
            <button type="button" onClick={onSelectTime} data-testid="solo-cart-select-time" className="mt-4 w-full rounded-full py-3.5 text-sm font-semibold text-white" style={{ background: "var(--site-accent, #B45309)" }}>
              Select Time
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
